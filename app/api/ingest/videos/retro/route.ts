export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'
import { ingestRetroTrendingVideos } from '@/lib/ingest/videos'

function authorize(req: NextRequest): NextResponse | null {
  if (isAdminRequest(req)) return null
  return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
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
