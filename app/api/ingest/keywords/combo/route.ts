export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { generateKeywordCombo } from '@/lib/ingest/keywords/combo'

export async function GET(req: Request) {
  const expectedKey = process.env.ADMIN_INGEST_KEY || ''
  if (expectedKey) {
    const provided = req.headers.get('x-admin-ingest-key') || ''
    if (provided !== expectedKey) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    const combo = await generateKeywordCombo()
    return NextResponse.json(combo)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'combo generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
