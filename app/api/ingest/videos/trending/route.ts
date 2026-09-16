export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'
import { ingestTrendingVideos, pickTrendingRegions } from '@/lib/ingest/videos'

function authorize(req: NextRequest): NextResponse | null {
  if (isAdminRequest(req)) return null
  return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
}

export async function GET(req: NextRequest) {
  const authError = authorize(req)
  if (authError) return authError
  try {
    const url = req.nextUrl
    const manualRegions = (url.searchParams.get('regions') || '')
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean)
    const regions = manualRegions.length >= 2 ? [manualRegions[0], manualRegions[1]] : pickTrendingRegions()
    const result = await ingestTrendingVideos(regions)
    return NextResponse.json({ ok: true, regions, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'trending ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
