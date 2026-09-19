export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'
import { getDb } from '@/lib/db'

/** No admin page is worth blocking a database connection for minutes. */
const MAX_QUERY_MS = 15_000

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

function strip(doc: ItemSummary): ItemSummary {
  const { _id, type, provider, url, videoId, title, thumb, host, createdAt, updatedAt, lastShownAt } = doc || {}
  return { _id, type, provider, url, videoId, title, thumb, host, createdAt, updatedAt, lastShownAt }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!isAdminRequest(req)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  const type = url.searchParams.get('type') || undefined
  const provider = url.searchParams.get('provider') || undefined
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10)))
  const wantSample = url.searchParams.get('sample') === 'true'

  let db
  try {
    db = await getDb()
  } catch {
    return NextResponse.json({ ok: false, error: 'no-db' }, { status: 500 })
  }

  const items = db.collection('items')

  try {
    // One pass over the (type, provider) index, so nothing reads the 1.7M documents
    // themselves. The per-type totals are the same numbers added up, not a second pass.
    const byProviderAll = await items.aggregate<{ _id: { type?: string; provider?: string }; count: number }>(
      [
        { $group: { _id: { type: '$type', provider: '$provider' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ],
      { hint: 'type_provider_counts', maxTimeMS: MAX_QUERY_MS }
    ).toArray()

    const perType = new Map<string, number>()
    for (const row of byProviderAll) {
      const key = row._id?.type ?? 'inconnu'
      perType.set(key, (perType.get(key) ?? 0) + row.count)
    }
    const byType = [...perType.entries()]
      .map(([_id, count]) => ({ _id, count }))
      .sort((left, right) => right.count - left.count)

    // uniq_video_id is a unique index on (type, videoId) restricted to videos with a
    // string id, so a video id cannot repeat: counting the videos that carry one gives
    // the number of distinct ids exactly, without listing them.
    const videosTotal = await items.countDocuments({ type: 'video' }, { maxTimeMS: MAX_QUERY_MS })
    const withVideoId = await items.countDocuments(
      { type: 'video', videoId: { $type: 'string' } },
      { maxTimeMS: MAX_QUERY_MS }
    )
    const videos = { totalDocs: videosTotal, distinctVideoIds: withVideoId }

    const match: Record<string, unknown> = {}
    if (type) match.type = type
    if (provider) match.provider = provider

    // Sorting on updatedAt has no index behind it and would sort the whole collection;
    // _id descending is the insertion order, which is the "latest arrivals" we want here.
    const recent = await items.find(match, { maxTimeMS: MAX_QUERY_MS })
      .sort({ _id: -1 }).limit(limit).toArray()
    const neverShown = wantSample
      ? await items.find({ ...match, lastShownAt: { $exists: false } }, { maxTimeMS: MAX_QUERY_MS })
          .limit(limit).toArray()
      : []

    return NextResponse.json({
      ok: true,
      counts: { byType, byProviderAll, videos },
      samples: {
        recent: recent.map(strip),
        neverShown: neverShown.map(strip),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
