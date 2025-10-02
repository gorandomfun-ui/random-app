export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getDbSafe } from '@/lib/random/data'
import { isBlockedJoke } from '@/lib/random/jokes'
import { ObjectId } from 'mongodb'

function isAuthorized(req: NextRequest): boolean {
  const expected = (process.env.ADMIN_INGEST_KEY || '').trim()
  const provided =
    req.nextUrl.searchParams.get('key')?.trim() ||
    req.headers.get('x-admin-ingest-key')?.trim() ||
    ''
  if (!expected) return false
  return provided === expected
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = await getDbSafe()
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 })
  }

  let limit = 1000
  try {
    const body = await req.json()
    const rawLimit = Number(body?.limit)
    if (Number.isFinite(rawLimit) && rawLimit > 0) {
      limit = Math.min(Math.floor(rawLimit), 10000)
    }
  } catch {
    /* ignore - optional body */
  }

  const collection = db.collection<{ text?: string }>('items')
  const cursor = collection
    .find({ type: 'joke' }, { projection: { text: 1 } })
    .sort({ updatedAt: 1 })
    .limit(limit > 0 ? limit : 0)

  const idsToDelete: Array<{ _id: unknown; text: string }> = []
  let scanned = 0
  const samples: string[] = []

  for await (const doc of cursor) {
    scanned += 1
    const text = typeof doc.text === 'string' ? doc.text : ''
    if (!text) continue
    if (!isBlockedJoke(text)) continue
    idsToDelete.push({ _id: doc._id, text })
    if (samples.length < 10) samples.push(text)
  }

  if (!idsToDelete.length) {
    return NextResponse.json({ scanned, deleted: 0 })
  }

  let deleted = 0
  for (const entry of idsToDelete) {
    try {
      const id = entry._id
      if (id instanceof ObjectId) {
        const result = await collection.deleteOne({ _id: id })
        deleted += result.deletedCount ?? 0
        continue
      }
      if (typeof id === 'string' && ObjectId.isValid(id)) {
        const result = await collection.deleteOne({ _id: new ObjectId(id) })
        deleted += result.deletedCount ?? 0
        continue
      }
      const result = await collection.deleteMany({ type: 'joke', text: entry.text })
      deleted += result.deletedCount ?? 0
    } catch {
      // ignore individual failures to avoid aborting the run
    }
  }

  return NextResponse.json({ scanned, deleted, samples })
}
