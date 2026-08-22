export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

import { randomUUID } from 'node:crypto'
import type { Collection, Db } from 'mongodb'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendMail } from '@/lib/email/mailer'
import { logCronRun } from '@/lib/metrics/cron'
import {
  ingestTrendingVideos,
  ingestVideos,
  pickTrendingRegions,
} from '@/lib/ingest/videos'

type VideoIngestResult = Awaited<ReturnType<typeof ingestVideos>>

type StepSummary = {
  name: 'trending'
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

type EmailDelivery = {
  attempted: boolean
  ok: boolean
  skipped?: boolean
  error?: string
  messageId?: string
}

const LOCK_ID = 'cron:videos'
const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000
const DEFAULT_TRENDING_LIMIT = 25

function parseIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function getLockTtlMs() {
  return parseIntegerEnv('CRON_VIDEO_LOCK_TTL_MS', DEFAULT_LOCK_TTL_MS, 300_000, 1_800_000)
}

function getTrendingLimit() {
  return parseIntegerEnv('CRON_VIDEO_TRENDING_LIMIT', DEFAULT_TRENDING_LIMIT, 10, 50)
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
  const expiresAt = new Date(now.getTime() + getLockTtlMs())

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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value)
}

function formatDate(date: Date): string {
  const timeZone = process.env.REPORT_TIMEZONE || 'Europe/Paris'
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date)
}

function renderStepText(step: StepSummary): string {
  const result = step.result
  const status = step.skipped ? 'skipped' : step.ok ? 'ok' : 'failed'
  const stats = result
    ? `scanned=${result.scanned}, unique=${result.unique}, inserted=${result.inserted}, updated=${result.updated}`
    : 'no stats'
  const error = step.error ? `, error=${step.error}` : ''
  return `${step.name}: ${status}, ${stats}${error}`
}

function renderStepHtml(step: StepSummary): string {
  const result = step.result
  const status = step.skipped ? 'skipped' : step.ok ? 'ok' : 'failed'
  const stats = result
    ? `scanned: ${formatNumber(result.scanned || 0)}, unique: ${formatNumber(result.unique || 0)}, inserted: ${formatNumber(result.inserted || 0)}, updated: ${formatNumber(result.updated || 0)}`
    : 'no stats'
  const error = step.error ? `<br><span style="color:#b00020;">${step.error}</span>` : ''
  return `<li><strong>${step.name}</strong> - ${status} - ${stats}${error}</li>`
}

async function sendVideoCronEmail(input: {
  ok: boolean
  dryRun: boolean
  startedAt: Date
  finishedAt: Date
  durationMs: number
  total: Required<Pick<VideoIngestResult, 'scanned' | 'unique' | 'inserted' | 'updated'>>
  steps: StepSummary[]
}): Promise<EmailDelivery> {
  if ((process.env.CRON_VIDEO_EMAIL || '1').trim() === '0') {
    return { attempted: false, ok: true, skipped: true }
  }

  const subjectStatus = input.ok ? 'OK' : 'FAILED'
  const subjectDry = input.dryRun ? ' DRY' : ''
  const subject = `RandomApp video cron ${subjectStatus}${subjectDry} - ${formatDate(input.finishedAt)}`
  const text = [
    subject,
    '',
    `Started: ${formatDate(input.startedAt)}`,
    `Finished: ${formatDate(input.finishedAt)}`,
    `Duration: ${Math.round(input.durationMs / 1000)}s`,
    '',
    `Total scanned: ${input.total.scanned}`,
    `Total unique: ${input.total.unique}`,
    `Inserted: ${input.total.inserted}`,
    `Updated: ${input.total.updated}`,
    '',
    'Steps:',
    ...input.steps.map((step) => `- ${renderStepText(step)}`),
  ].join('\n')

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111;">
      <h1 style="margin-bottom: 8px;">RandomApp video cron ${subjectStatus}${subjectDry}</h1>
      <p style="margin-top: 0; color: #555;">${formatDate(input.startedAt)} - ${formatDate(input.finishedAt)} (${Math.round(input.durationMs / 1000)}s)</p>
      <h2>Totals</h2>
      <ul>
        <li>Scanned: <strong>${formatNumber(input.total.scanned)}</strong></li>
        <li>Unique: <strong>${formatNumber(input.total.unique)}</strong></li>
        <li>Inserted: <strong>${formatNumber(input.total.inserted)}</strong></li>
        <li>Updated: <strong>${formatNumber(input.total.updated)}</strong></li>
      </ul>
      <h2>Steps</h2>
      <ul>${input.steps.map(renderStepHtml).join('')}</ul>
    </div>
  `

  try {
    const info = await sendMail({ subject, html, text })
    const messageId = (info as { messageId?: unknown } | null)?.messageId
    return { attempted: true, ok: true, messageId: typeof messageId === 'string' ? messageId : undefined }
  } catch (error) {
    return { attempted: true, ok: false, error: serializeError(error) }
  }
}

export async function GET(req: Request) {
  const auth = authorize(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()
  const trendingLimit = getTrendingLimit()
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const steps: StepSummary[] = []
  const total = { scanned: 0, unique: 0, inserted: 0, updated: 0 }

  console.info('[cron:videos] start', {
    triggeredBy: auth.triggeredBy,
    dryRun,
    trendingLimit,
    mode: 'trending-only',
  })

  const lock = await acquireLock()
  if (!lock) {
    const finishedAt = new Date()
    console.info('[cron:videos] skipped: already running')
    await logCronRun({
      name: 'cron:videos',
      status: 'success',
      startedAt,
      finishedAt,
      triggeredBy: auth.triggeredBy,
      details: { skipped: true, reason: 'cron already running' },
    })
    return NextResponse.json({ ok: true, skipped: true, reason: 'cron already running' })
  }

  try {
    const trendingRegions = pickTrendingRegions()
    const trending = await runStep('trending', async () => {
      const result = await ingestTrendingVideos(trendingRegions, {
        dryRun,
        limitPerProvider: trendingLimit,
        skipDetails: true,
      })
      return { result, regions: trendingRegions }
    })
    steps.push(trending)
    if (trending.result) addTotals(total, trending.result as VideoIngestResult)

    const finishedAt = new Date()
    const completedSteps = steps.filter((step) => step.ok && !step.skipped)
    const failedSteps = steps.filter((step) => !step.ok)
    const hasWork = total.scanned > 0 || total.unique > 0
    const success = completedSteps.length > 0 && hasWork
    const email = await sendVideoCronEmail({
      ok: success,
      dryRun,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      total,
      steps,
    })

    await logCronRun({
      name: 'cron:videos',
      status: success ? 'success' : 'failure',
      startedAt,
      finishedAt,
      triggeredBy: auth.triggeredBy,
      details: {
        dryRun,
        trendingLimit,
        mode: 'trending-only',
        total,
        steps,
        email,
      },
      error: success ? undefined : failedSteps[0]?.error || 'no videos ingested',
    })

    console.info('[cron:videos] finish', {
      ok: success,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      total,
      email,
      steps: steps.map((step) => ({
        name: step.name,
        ok: step.ok,
        skipped: Boolean(step.skipped),
        durationMs: step.durationMs,
        scanned: step.result?.scanned ?? 0,
        unique: step.result?.unique ?? 0,
        inserted: step.result?.inserted ?? 0,
        updated: step.result?.updated ?? 0,
        error: step.error,
      })),
    })

    return NextResponse.json({
      ok: success,
      dryRun,
      triggeredAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      total,
      email,
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
        mode: 'trending-only',
        trendingLimit,
        total,
        steps,
      },
    })
    return NextResponse.json({ ok: false, error: message, total, steps }, { status: 500 })
  } finally {
    await lock.release()
  }
}
