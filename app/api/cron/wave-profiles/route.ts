export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'

import { getDb } from '@/lib/db'
import { backfillWaveProfiles } from '@/lib/random/waveBackfill'

function isAuthorized(request: Request): boolean {
  return isAdminRequest(request)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
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
