export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { enrichRecentYouTubeVideos, ingestTrendingVideos, ingestVideos, pickTrendingRegions } from '@/lib/ingest/videos'
import { buildDailyRetroQueries, buildDailyVideoQueries, buildDailyWebQueries } from '@/lib/ingest/daily-auto/queries'
import { logCronRun, type CronTrigger } from '@/lib/metrics/cron'

const PHASES = ['trending', 'retro', 'combo-videos', 'web', 'enrich-videos'] as const
type DailyAutoPhase = (typeof PHASES)[number]

type SearchProvider = 'youtube' | 'dailymotion' | 'pixabay' | 'pexels'
type DurationToken = 'any' | 'short' | 'medium' | 'long'

type PhasePayload = {
  ok: boolean
  phase: DailyAutoPhase
  dryRun: boolean
  durationMs: number
  queries?: string[]
  regions?: string[]
  providers?: string[]
  result?: Record<string, unknown>
}

function authorize(req: NextRequest): { ok: true; triggeredBy: CronTrigger; key: string } | { ok: false; response: NextResponse } {
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const isCron = Boolean(req.headers.get('x-vercel-cron'))

  if (!expectedKey) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized', reason: 'missing-expected-key' }, { status: 401 }) }
  }

  if (!isCron && providedKey !== expectedKey) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized', reason: 'mismatch' }, { status: 401 }) }
  }

  return { ok: true, triggeredBy: isCron ? 'cron' : 'manual', key: expectedKey }
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function parseList(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseBoolean(value: string | null, fallback = false): boolean {
  if (value == null) return fallback
  const token = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y'].includes(token)) return true
  if (['0', 'false', 'no', 'n'].includes(token)) return false
  return fallback
}

function parsePhase(value: string | null): DailyAutoPhase {
  const normalized = (value || 'trending').trim().toLowerCase()
  return (PHASES as readonly string[]).includes(normalized)
    ? (normalized as DailyAutoPhase)
    : 'trending'
}

function parseProviders(value: string | null, fallback: SearchProvider[]): SearchProvider[] {
  const allowed = new Set<SearchProvider>(['youtube', 'dailymotion', 'pixabay', 'pexels'])
  const parsed = parseList(value)
    .map((entry) => entry.toLowerCase())
    .filter((entry): entry is SearchProvider => allowed.has(entry as SearchProvider))
  return parsed.length ? Array.from(new Set(parsed)) : fallback
}

function parseDurations(value: string | null): DurationToken[] {
  const parsed = parseList(value)
    .map((entry) => entry.toLowerCase())
    .flatMap((entry): DurationToken[] => {
      if (entry === 'all' || entry === 'any') return ['any']
      if (entry === 'standard') return ['medium', 'long']
      if (entry === 'short' || entry === 'medium' || entry === 'long') return [entry]
      return []
    })
  if (!parsed.length || parsed.includes('any')) return ['any']
  return Array.from(new Set(parsed))
}

function compactResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  return {
    scanned: raw.scanned ?? 0,
    unique: raw.unique ?? 0,
    inserted: raw.inserted ?? 0,
    updated: raw.updated ?? 0,
    skippedInvalid: raw.skippedInvalid ?? 0,
    existingSkipped: raw.existingSkipped ?? 0,
    providerCounts: raw.providerCounts ?? {},
    providers: raw.providers ?? [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.slice(0, 10) : [],
    dryRun: Boolean(raw.dryRun),
    checked: raw.checked ?? undefined,
  }
}

async function runWebPhase(req: NextRequest, input: {
  key: string
  dryRun: boolean
  queryCount: number
  per: number
  pages: number
  requireOg: boolean
  providers: string[]
  runKey: string
}) {
  const queries = await buildDailyWebQueries({
    count: input.queryCount,
    seed: `web:${new Date().toISOString().slice(0, 10)}:${input.runKey}:${input.queryCount}`,
  })
  const target = new URL('/api/ingest/web', req.url)
  target.searchParams.set('q', queries.join(','))
  target.searchParams.set('per', String(input.per))
  target.searchParams.set('pages', String(input.pages))
  target.searchParams.set('providers', input.providers.join(','))
  target.searchParams.set('requireOg', input.requireOg ? '1' : '0')
  if (input.dryRun) target.searchParams.set('dry', '1')

  const response = await fetch(target, {
    cache: 'no-store',
    headers: { 'x-admin-ingest-key': input.key },
  })
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { error: text || 'web ingest returned non-json response' }
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : `web ingest failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return { queries, result: compactResult(payload) }
}

export async function GET(req: NextRequest) {
  const auth = authorize(req)
  if (!auth.ok) return auth.response

  const startedAt = new Date()
  const phase = parsePhase(req.nextUrl.searchParams.get('phase'))
  const dryRun = parseBoolean(req.nextUrl.searchParams.get('dry') || req.nextUrl.searchParams.get('preview'))
  const sampleSize = parseInteger(req.nextUrl.searchParams.get('sample'), 8, 1, 20)
  const runKey = (req.nextUrl.searchParams.get('run') || req.nextUrl.searchParams.get('profile') || 'default')
    .trim()
    .replace(/[^\w:-]+/g, '-')
    .slice(0, 80) || 'default'

  try {
    let payload: PhasePayload

    if (phase === 'trending') {
      const manualRegions = parseList(req.nextUrl.searchParams.get('regions')).map((entry) => entry.toUpperCase())
      const regions = manualRegions.length >= 2 ? [manualRegions[0], manualRegions[1]] : pickTrendingRegions()
      const limit = parseInteger(req.nextUrl.searchParams.get('limit'), 50, 10, 50)
      const result = await ingestTrendingVideos(regions, {
        dryRun,
        limitPerProvider: limit,
        skipDetails: true,
        insertOnly: true,
      })
      payload = {
        ok: true,
        phase,
        dryRun,
        regions,
        durationMs: Date.now() - startedAt.getTime(),
        result: compactResult(result),
      }
    } else if (phase === 'retro') {
      const queryCount = parseInteger(req.nextUrl.searchParams.get('count'), 8, 2, 24)
      const per = parseInteger(req.nextUrl.searchParams.get('per'), 12, 5, 30)
      const queries = await buildDailyRetroQueries({
        count: queryCount,
        seed: `retro:${new Date().toISOString().slice(0, 10)}:${runKey}:${queryCount}`,
      })
      const result = await ingestVideos({
        mode: 'search',
        queries,
        per,
        pages: 1,
        days: 0,
        providers: parseProviders(req.nextUrl.searchParams.get('providers'), ['youtube', 'dailymotion']),
        durations: ['any'],
        fast: false,
        dryRun,
        sampleSize,
        skipDetails: true,
        insertOnly: true,
      })
      payload = {
        ok: true,
        phase,
        dryRun,
        queries,
        providers: result.providers,
        durationMs: Date.now() - startedAt.getTime(),
        result: compactResult(result),
      }
    } else if (phase === 'combo-videos') {
      const queryCount = parseInteger(req.nextUrl.searchParams.get('count'), 8, 1, 60)
      const per = parseInteger(req.nextUrl.searchParams.get('per'), 16, 5, 50)
      const pages = parseInteger(req.nextUrl.searchParams.get('pages'), 1, 1, 3)
      const days = parseInteger(req.nextUrl.searchParams.get('days'), 365, 1, 3650)
      const providers = parseProviders(req.nextUrl.searchParams.get('providers'), ['youtube'])
      const durations = parseDurations(req.nextUrl.searchParams.get('durations') || req.nextUrl.searchParams.get('duration'))
      const queries = await buildDailyVideoQueries({
        count: queryCount,
        seed: `combo:${new Date().toISOString().slice(0, 10)}:${runKey}:${providers.join('-')}:${queryCount}`,
      })
      const result = await ingestVideos({
        mode: 'search',
        queries,
        per,
        pages,
        days,
        providers,
        durations,
        fast: false,
        dryRun,
        sampleSize,
        skipDetails: true,
        insertOnly: true,
      })
      payload = {
        ok: true,
        phase,
        dryRun,
        queries,
        providers,
        durationMs: Date.now() - startedAt.getTime(),
        result: compactResult(result),
      }
    } else if (phase === 'web') {
      const queryCount = parseInteger(req.nextUrl.searchParams.get('count'), 4, 1, 20)
      const per = parseInteger(req.nextUrl.searchParams.get('per'), 8, 1, 10)
      const pages = parseInteger(req.nextUrl.searchParams.get('pages'), 2, 1, 10)
      const requireOg = parseBoolean(req.nextUrl.searchParams.get('requireOg'), true)
      const webProviders = parseList(req.nextUrl.searchParams.get('providers') || 'cse,curated')
        .map((entry) => entry.toLowerCase())
        .filter((entry) => ['cse', 'curated', 'neocities', 'wikipedia'].includes(entry))
      const { queries, result } = await runWebPhase(req, {
        key: auth.key,
        dryRun,
        queryCount,
        per,
        pages,
        requireOg,
        providers: webProviders.length ? webProviders : ['cse', 'curated'],
        runKey,
      })
      payload = {
        ok: true,
        phase,
        dryRun,
        queries,
        providers: webProviders,
        durationMs: Date.now() - startedAt.getTime(),
        result,
      }
    } else {
      const limit = parseInteger(req.nextUrl.searchParams.get('limit'), 120, 1, 500)
      const days = parseInteger(req.nextUrl.searchParams.get('days'), 2, 1, 30)
      const result = await enrichRecentYouTubeVideos({ dryRun, limit, days })
      payload = {
        ok: true,
        phase,
        dryRun,
        durationMs: Date.now() - startedAt.getTime(),
        providers: ['youtube'],
        result: compactResult(result),
      }
    }

    const finishedAt = new Date()
    await logCronRun({
      name: `cron:daily-auto:${phase}`,
      status: 'success',
      startedAt,
      finishedAt,
      triggeredBy: auth.triggeredBy,
      details: payload,
    })

    return NextResponse.json({
      ...payload,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    })
  } catch (error: unknown) {
    const finishedAt = new Date()
    const message = error instanceof Error ? error.message : 'daily auto ingest failed'
    await logCronRun({
      name: `cron:daily-auto:${phase}`,
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy: auth.triggeredBy,
      error: message,
      details: { phase, dryRun },
    })
    return NextResponse.json({ ok: false, phase, error: message }, { status: 500 })
  }
}
