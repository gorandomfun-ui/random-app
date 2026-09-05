export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db'
import { backfillWaveProfiles } from '@/lib/random/waveBackfill'

function isAuthorized(request: Request): boolean {
  const url = new URL(request.url)
  const auth = request.headers.get('authorization') || ''
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const adminKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  const providedAdminKey = (url.searchParams.get('key') || request.headers.get('x-admin-ingest-key') || '').trim()
  const vercelCron = Boolean(request.headers.get('x-vercel-cron'))
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (adminKey && providedAdminKey === adminKey) return true
  return !cronSecret && vercelCron
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const db = await getDb()
    const result = await backfillWaveProfiles(db.collection('items'), { limit: 500, batchSize: 100 })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'wave profile backfill failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
