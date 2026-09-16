export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'
import { generateKeywordCombo } from '@/lib/ingest/keywords/combo'
import { resolveRegionKey } from '@/lib/ingest/keywords/regionPools'

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const region = resolveRegionKey(url.searchParams.get('region'))
    const combo = await generateKeywordCombo({ region })
    return NextResponse.json(combo)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'combo generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
