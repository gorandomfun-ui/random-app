export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { ingestRetroTrendingVideos } from '@/lib/ingest/videos'

function authorize(req: NextRequest): NextResponse | null {
  const isCron = Boolean(req.headers.get('x-vercel-cron'))
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!expectedKey) {
    return NextResponse.json({ error: 'Unauthorized', reason: 'missing-expected-key' }, { status: 401 })
  }
  if (!isCron && providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized', reason: 'mismatch' }, { status: 401 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const authError = authorize(req)
  if (authError) return authError
  try {
    const result = await ingestRetroTrendingVideos()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'retro ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
