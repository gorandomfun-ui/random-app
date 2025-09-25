export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'

type ItemSummary = {
  _id?: unknown
  type?: string
  provider?: string
  url?: string
  videoId?: string
  title?: string
  thumb?: string
  host?: string
  createdAt?: Date
  updatedAt?: Date
  lastShownAt?: Date
}

async function getDb(): Promise<Db | null> {
  try {
    const { MongoClient } = await import('mongodb')
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI
    const dbName = process.env.MONGODB_DB || 'randomdb'
    if (!uri) return null
    const client = new MongoClient(uri)
    await client.connect()
    return client.db(dbName)
  } catch { return null }
}

function strip(doc: ItemSummary): ItemSummary {
  const { _id, type, provider, url, videoId, title, thumb, host, createdAt, updatedAt, lastShownAt } = doc || {}
  return { _id, type, provider, url, videoId, title, thumb, host, createdAt, updatedAt, lastShownAt }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const key = url.searchParams.get('key') || ''
  if (!key || key !== (process.env.ADMIN_INGEST_KEY || '')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const type = url.searchParams.get('type') || undefined
  const provider = url.searchParams.get('provider') || undefined
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10)))
  const wantSample = url.searchParams.get('sample') === 'true'

  const db = await getDb()
  if (!db) return NextResponse.json({ ok: false, error: 'no-db' }, { status: 500 })

  const items = db.collection('items')

  const byType = await items.aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray()

  const byProviderAll = await items.aggregate([
    { $group: { _id: { type: '$type', provider: '$provider' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray()

  const videosTotal = await items.countDocuments({ type: 'video' })
  const distinctIds = await items.distinct('videoId', { type: 'video' })
  const videos = { totalDocs: videosTotal, distinctVideoIds: distinctIds.filter(Boolean).length }

  const match: Record<string, unknown> = {}
  if (type) match.type = type
  if (provider) match.provider = provider

  const recent = await items.find(match).sort({ updatedAt: -1 }).limit(limit).toArray()
  const neverShown = wantSample
    ? await items.find({ ...match, lastShownAt: { $exists: false } }).limit(limit).toArray()
    : []

  return NextResponse.json({
    ok: true,
    counts: { byType, byProviderAll, videos },
    samples: {
      recent: recent.map(strip),
      neverShown: neverShown.map(strip),
    },
  })
}
