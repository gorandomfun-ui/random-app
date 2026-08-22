export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

import { randomUUID } from 'node:crypto'
import type { Collection, Db } from 'mongodb'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { logCronRun } from '@/lib/metrics/cron'
import { buildComboQueries } from '@/lib/ingest/keywords/combo'
import { mixRegionalQueries } from '@/lib/ingest/keywords/regionPools'
import { buildVideoQueries, loadVideoKeywordDictionary } from '@/lib/ingest/videoKeywords'
import {
  ingestRetroTrendingVideos,
  ingestTrendingVideos,
  ingestVideos,
  pickTrendingRegions,
} from '@/lib/ingest/videos'

type VideoIngestResult = Awaited<ReturnType<typeof ingestVideos>>

type StepSummary = {
  name: 'trending' | 'retro' | 'combos'
  ok: boolean
  skipped?: boolean
  durationMs: number
  error?: string
  queries?: string[]
  regions?: string[]
  result?: Pick<
    VideoIngestResult,
    'scanned' | 'unique' | 'inserted' | 'updated' | 'providerCounts' | 'warnings' | 'skippedInvalid' | 'providers'
  >
}

type CronLockDoc = {
  _id: string
  token: string
  startedAt: Date
  expiresAt: Date
}

const LOCK_ID = 'cron:videos'
const LOCK_TTL_MS = 30 * 60 * 1000
const DEFAULT_DEADLINE_MS = 270 * 1000
const DEFAULT_COMBO_COUNT = 8
const DEFAULT_COMBO_PER = 16
const COMBO_PROVIDERS = ['youtube', 'dailymotion'] as const
const COMBO_DURATIONS = ['short', 'medium', 'long'] as const

function parseIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function getDeadlineMs() {
  return parseIntegerEnv('CRON_VIDEO_DEADLINE_MS', DEFAULT_DEADLINE_MS, 60_000, 285_000)
}

function getComboCount() {
  return parseIntegerEnv('CRON_VIDEO_COMBO_COUNT', DEFAULT_COMBO_COUNT, 1, 16)
}

function getComboPer() {
  return parseIntegerEnv('CRON_VIDEO_COMBO_PER', DEFAULT_COMBO_PER, 8, 32)
}

function isVercelCron(req: Request): boolean {
  const userAgent = req.headers.get('user-agent') || ''
  return Boolean(req.headers.get('x-vercel-cron')) || userAgent.includes('vercel-cron/1.0')
}

function authorize(req: Request): { ok: true; triggeredBy: 'cron' | 'manual' } | { ok: false; status: number; error: string } {
  const url = new URL(req.url)
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const adminKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  const authHeader = (req.headers.get('authorization') || '').trim()
  const providedAdminKey = (url.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const vercelCron = isVercelCron(req)

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, triggeredBy: 'cron' }
  }

  if (adminKey && providedAdminKey === adminKey) {
    return { ok: true, triggeredBy: vercelCron ? 'cron' : 'manual' }
  }

  if (!cronSecret && vercelCron) {
    return { ok: true, triggeredBy: 'cron' }
  }

  return { ok: false, status: 401, error: 'unauthorized' }
}

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function getLockCollection(db: Db): Promise<Collection<CronLockDoc>> {
  const collection = db.collection<CronLockDoc>('cron_locks')
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'cron_lock_expiry' }).catch(() => undefined)
  return collection
}

async function acquireLock(): Promise<{ token: string; release: () => Promise<void> } | null> {
  const db = await getDb()
  const collection = await getLockCollection(db)
  const now = new Date()
  const token = randomUUID()
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS)

  try {
    const result = await collection.updateOne(
      {
        _id: LOCK_ID,
        $or: [
          { expiresAt: { $lte: now } },
          { expiresAt: { $exists: false } },
        ],
      },
      {
        $set: {
          token,
          startedAt: now,
          expiresAt,
        },
      },
      { upsert: true },
    )

    if (!result.upsertedCount && !result.modifiedCount && !result.matchedCount) return null
  } catch (error) {
    if (serializeError(error).includes('E11000')) return null
    throw error
  }

  return {
    token,
    release: async () => {
      await collection.deleteOne({ _id: LOCK_ID, token }).catch(() => undefined)
    },
  }
}

function compactResult(result: VideoIngestResult): StepSummary['result'] {
  return {
    scanned: result.scanned ?? 0,
    unique: result.unique ?? 0,
    inserted: result.inserted ?? 0,
    updated: result.updated ?? 0,
    skippedInvalid: result.skippedInvalid ?? 0,
    providerCounts: result.providerCounts || {},
    providers: result.providers || [],
    warnings: (result.warnings || []).slice(0, 12),
  }
}

function addTotals(total: Required<Pick<VideoIngestResult, 'scanned' | 'unique' | 'inserted' | 'updated'>>, result?: VideoIngestResult) {
  if (!result) return
  total.scanned += result.scanned || 0
  total.unique += result.unique || 0
  total.inserted += result.inserted || 0
  total.updated += result.updated || 0
}

async function runStep(
  name: StepSummary['name'],
  work: () => Promise<{ result: VideoIngestResult; queries?: string[]; regions?: string[] }>,
): Promise<StepSummary> {
  const started = Date.now()
  try {
    const { result, queries, regions } = await work()
    return {
      name,
      ok: true,
      durationMs: Date.now() - started,
      queries,
      regions,
      result: compactResult(result),
    }
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - started,
      error: serializeError(error),
    }
  }
}

async function buildCronComboQueries(count: number): Promise<string[]> {
  const combos = await buildComboQueries(count, { region: 'global' })
  let queries = combos
    .map((combo) => combo.query.trim())
    .filter(Boolean)

  if (!queries.length) {
    const dictionary = await loadVideoKeywordDictionary()
    queries = buildVideoQueries(dictionary, count)
  }

  return Array.from(new Set(mixRegionalQueries(queries, 'video'))).slice(0, count)
}

function shouldSkipNextStep(startedAt: Date, deadlineMs: number, minRemainingMs: number): boolean {
  const elapsed = Date.now() - startedAt.getTime()
  return deadlineMs - elapsed < minRemainingMs
}

export async function GET(req: Request) {
  const auth = authorize(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()
  const deadlineMs = getDeadlineMs()
  const comboCount = getComboCount()
  const comboPer = getComboPer()
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const steps: StepSummary[] = []
  const total = { scanned: 0, unique: 0, inserted: 0, updated: 0 }

  const lock = await acquireLock()
  if (!lock) {
    const finishedAt = new Date()
    await logCronRun({
      name: 'cron:videos',
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy: auth.triggeredBy,
      error: 'cron already running',
    })
    return NextResponse.json({ ok: false, error: 'cron already running' }, { status: 409 })
  }

  try {
    const trendingRegions = pickTrendingRegions()
    const trending = await runStep('trending', async () => {
      const result = await ingestTrendingVideos(trendingRegions, { dryRun })
      return { result, regions: trendingRegions }
    })
    steps.push(trending)
    if (trending.result) addTotals(total, trending.result as VideoIngestResult)

    if (shouldSkipNextStep(startedAt, deadlineMs, 90_000)) {
      steps.push({ name: 'retro', ok: true, skipped: true, durationMs: 0, error: 'skipped: deadline budget' })
    } else {
      const retro = await runStep('retro', async () => {
        const result = await ingestRetroTrendingVideos({ dryRun })
        return { result }
      })
      steps.push(retro)
      if (retro.result) addTotals(total, retro.result as VideoIngestResult)
    }

    if (shouldSkipNextStep(startedAt, deadlineMs, 80_000)) {
      steps.push({ name: 'combos', ok: true, skipped: true, durationMs: 0, error: 'skipped: deadline budget' })
    } else {
      const queries = await buildCronComboQueries(comboCount)
      const combos = await runStep('combos', async () => {
        const result = await ingestVideos({
          mode: 'search',
          queries,
          per: comboPer,
          pages: 1,
          days: 365,
          providers: [...COMBO_PROVIDERS],
          durations: [...COMBO_DURATIONS],
          fast: true,
          dryRun,
          sampleSize: 10,
        })
        return { result, queries }
      })
      steps.push(combos)
      if (combos.result) addTotals(total, combos.result as VideoIngestResult)
    }

    const finishedAt = new Date()
    const completedSteps = steps.filter((step) => step.ok && !step.skipped)
    const failedSteps = steps.filter((step) => !step.ok)
    const hasWork = total.scanned > 0 || total.unique > 0
    const success = completedSteps.length > 0 && hasWork

    await logCronRun({
      name: 'cron:videos',
      status: success ? 'success' : 'failure',
      startedAt,
      finishedAt,
      triggeredBy: auth.triggeredBy,
      details: {
        dryRun,
        deadlineMs,
        comboCount,
        comboPer,
        providers: COMBO_PROVIDERS,
        durations: COMBO_DURATIONS,
        total,
        steps,
      },
      error: success ? undefined : failedSteps[0]?.error || 'no videos ingested',
    })

    return NextResponse.json({
      ok: success,
      dryRun,
      triggeredAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      total,
      steps,
    }, { status: success ? 200 : 500 })
  } catch (error: unknown) {
    const finishedAt = new Date()
    const message = serializeError(error)
    await logCronRun({
      name: 'cron:videos',
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy: auth.triggeredBy,
      error: message,
      details: {
        dryRun,
        deadlineMs,
        comboCount,
        comboPer,
        total,
        steps,
      },
    })
    return NextResponse.json({ ok: false, error: message, total, steps }, { status: 500 })
  } finally {
    await lock.release()
  }
}
