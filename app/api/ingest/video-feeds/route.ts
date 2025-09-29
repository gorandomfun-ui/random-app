export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ingestVideoFeeds } from '@/lib/ingest/videoFeeds'

function parseList(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export async function GET(req: NextRequest) {
  const isCron = Boolean(req.headers.get('x-vercel-cron'))
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()

  if (!expectedKey) {
    return NextResponse.json({ error: 'Unauthorized', reason: 'missing-expected-key' }, { status: 401 })
  }

  if (!isCron && providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized', reason: 'mismatch' }, { status: 401 })
  }

  try {
    const url = req.nextUrl
    const dryParam = url.searchParams.get('dry') || url.searchParams.get('preview')
    const dryRun = dryParam === '1' || dryParam === 'true'
    const sampleSize = parseInteger(url.searchParams.get('sample'), 8, 1, 24)
    const redditLimit = parseInteger(url.searchParams.get('limit'), 40, 5, 100)
    const lists = parseList(url.searchParams.get('lists'))
    const subreddits = parseList(url.searchParams.get('subs') || url.searchParams.get('subreddits'))

    const result = await ingestVideoFeeds({ dryRun, sampleSize, redditLimit, lists, subreddits })

    return NextResponse.json({
      ok: true,
      dryRun,
      sampleSize,
      redditLimit,
      lists,
      subreddits,
      ...result,
    })
  } catch (error: unknown) {
    console.error('[ingest:video-feeds]', error)
    const message = error instanceof Error ? error.message : 'ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
