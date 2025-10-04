export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { importAiContent } from '@/lib/ingest/ai'

function getAdminKey(): string {
  return (process.env.ADMIN_INGEST_KEY || '').trim()
}

export async function POST(req: NextRequest) {
  const providedKey = (req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = getAdminKey()

  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
