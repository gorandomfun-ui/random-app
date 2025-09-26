export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 50

const TARGET_TO_NAME: Record<string, string> = {
  videos: 'cron:videos',
  web: 'cron:web',
  images: 'cron:images',
  nightly: 'cron:nightly',
  report: 'cron:daily-report',
}

function normalizeLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)))
}

function normalizeNames(params: URLSearchParams): string[] | undefined {
  const names = new Set<string>()

  const explicit = params.getAll('name')
  for (const value of explicit) {
    const trimmed = value.trim()
    if (trimmed) names.add(trimmed)
  }

  const targets = params.getAll('target')
  for (const value of targets) {
    const mapped = TARGET_TO_NAME[value.trim().toLowerCase()]
    if (mapped) names.add(mapped)
  }

  if (!names.size) return undefined
  return Array.from(names)
}

function serializeEntry(entry: Record<string, unknown>) {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    if (key === '_id') {
      output.id = String(value)
    } else if (value instanceof Date) {
      output[key] = value.toISOString()
    } else {
      output[key] = value
    }
  }
  return output
}

export async function GET(req: NextRequest) {
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()

  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = normalizeLimit(req.nextUrl.searchParams.get('limit'))
  const names = normalizeNames(req.nextUrl.searchParams)

  try {
    const db = await getDb()
    const collectionName = process.env.REPORT_CRON_COLLECTION || 'cron_runs'
    const coll = db.collection(collectionName)

    const query: Record<string, unknown> = {}
    if (names?.length) query.name = { $in: names }

    const docs = await coll
      .find(query)
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray()

    return NextResponse.json({
      ok: true,
      count: docs.length,
      limit,
      names,
      runs: docs.map(serializeEntry),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'cron status failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
