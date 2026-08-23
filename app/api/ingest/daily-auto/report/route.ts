export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { logCronRun } from '@/lib/metrics/cron'

function coerceDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return fallback
}

function compactSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  return {
    dryRun: Boolean(raw.dryRun),
    profile: raw.profile,
    durationMs: raw.durationMs,
    chunks: raw.chunks,
    videoInserted: raw.videoInserted,
    webInserted: raw.webInserted,
    videoEnriched: raw.videoEnriched,
    existingSkipped: raw.existingSkipped,
    providerCounts: raw.providerCounts,
    minVideoInserted: raw.minVideoInserted,
    maxVideoChunks: raw.maxVideoChunks,
    phases: Array.isArray(raw.phases) ? raw.phases.slice(0, 40) : [],
  }
}

export async function POST(req: NextRequest) {
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()

  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const now = new Date()
    const startedAt = coerceDate((body as Record<string, unknown>)?.startedAt, now)
    const finishedAt = coerceDate((body as Record<string, unknown>)?.finishedAt, now)
    const details = compactSummary(body)
    const durationMs = typeof details.durationMs === 'number'
      ? details.durationMs
      : Math.max(0, finishedAt.getTime() - startedAt.getTime())

    await logCronRun({
      name: 'cron:daily-auto:summary',
      status: 'success',
      startedAt,
      finishedAt,
      durationMs,
      triggeredBy: 'cron',
      details,
    })

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'daily auto report failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
