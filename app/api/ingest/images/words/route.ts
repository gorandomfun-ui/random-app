export const runtime = 'nodejs'

/**
 * The words of the day for the owner's GIF page (lib/ingest/gifWords.ts):
 * built once a day, the same list all day.
 */

import { NextResponse } from 'next/server'

import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'
import { wordsOfTheDay } from '@/lib/ingest/gifWords'

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  try {
    const { getDb } = await import('@/lib/db')
    const list = await wordsOfTheDay(await getDb())
    return NextResponse.json({ ok: true, day: list.day, words: list.words, sources: list.sources }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'words failed' }, { status: 500 })
  }
}
