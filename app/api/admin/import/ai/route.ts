export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'

import { importAiContent } from '@/lib/ingest/ai'

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON'
    return NextResponse.json({ error: `Invalid JSON payload: ${message}` }, { status: 400 })
  }

  const dry = req.nextUrl.searchParams.get('dry') === '1'
  const result = await importAiContent(payload, { dryRun: dry })

  return NextResponse.json({
    ok: result.ok,
    dryRun: result.dryRun,
    scanned: result.scanned,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    duplicates: result.duplicates,
    errors: result.errors,
    sample: result.sample,
  })
}
