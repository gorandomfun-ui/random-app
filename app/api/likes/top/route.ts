export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { LikeType } from '@/utils/likes'

type StoredTheme = {
  bg?: string | null
  deep?: string | null
  cream?: string | null
  text?: string | null
} | null

type StoredItem = {
  url?: string
  text?: string
  title?: string
  thumbUrl?: string | null
  ogImage?: string | null
  provider?: string | null
}

type GlobalLikeDoc = {
  _id: string
  type: LikeType
  count: number
  item: StoredItem
  theme: StoredTheme
  createdAt?: Date
  updatedAt?: Date
}

function parseLimit(param: string | null): number {
  const value = Number(param)
  if (!Number.isFinite(value)) return 100
  return Math.max(1, Math.min(200, Math.floor(value)))
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb()
    const collection = db.collection<GlobalLikeDoc>('likeStats')

    const limit = parseLimit(req.nextUrl.searchParams.get('limit'))
    const docs = await collection
      .find({}, { projection: { _id: 1, type: 1, count: 1, item: 1, theme: 1, updatedAt: 1 } })
      .sort({ count: -1, updatedAt: -1 })
      .limit(limit)
      .toArray()

    const items = docs.map((doc) => ({
      id: doc._id,
      type: doc.type,
      url: doc.item?.url,
      text: doc.item?.text,
      title: doc.item?.title,
      thumbUrl: doc.item?.thumbUrl ?? null,
      ogImage: doc.item?.ogImage ?? null,
      provider: doc.item?.provider ?? null,
      theme: doc.theme ?? undefined,
      likedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now(),
      count: doc.count,
    }))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[likes/top] failed', error)
    return NextResponse.json({ error: 'Failed to load top likes' }, { status: 500 })
  }
}
