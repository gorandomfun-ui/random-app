export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId, type Collection, type Filter } from 'mongodb'
import { getDatabase } from '@/lib/mongodb'
import { refreshTopLikesForItem } from '@/lib/likes/top'

type LikePayload = {
  itemId?: unknown
  item?: {
    type?: unknown
    url?: unknown
    text?: unknown
    author?: unknown
    title?: unknown
    id?: unknown
  } | null
}

type ItemLookupDoc = {
  _id: ObjectId
  type?: string
  url?: string
  videoId?: string
  text?: string
  author?: string
  title?: string
  likeCount?: number
}

const LIKEABLE_TYPES = new Set(['image', 'video', 'web', 'quote', 'joke', 'fact'])

function parseObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || !ObjectId.isValid(trimmed)) return null
  try {
    return new ObjectId(trimmed)
  } catch {
    return null
  }
}

function respondError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const youtubeId = parsed.searchParams.get('v')
    if (youtubeId) return youtubeId

    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parsed.hostname.includes('youtu.be')) return parts[0] || null
    if (parsed.hostname.includes('dailymotion.com')) {
      const videoIndex = parts.indexOf('video')
      if (videoIndex >= 0 && parts[videoIndex + 1]) return parts[videoIndex + 1]
    }
    return parts[parts.length - 1] || null
  } catch {
    return null
  }
}

async function resolveObjectId(
  collection: Collection<ItemLookupDoc>,
  payload: LikePayload | null,
): Promise<ObjectId | null> {
  const objectId = parseObjectId(payload?.itemId)
  if (objectId) return objectId

  const item = payload?.item
  const type = cleanString(item?.type)
  if (!type || !LIKEABLE_TYPES.has(type)) return null

  const url = cleanString(item?.url)
  const text = cleanString(item?.text)
  const author = cleanString(item?.author)
  const title = cleanString(item?.title)
  const fallbackId = cleanString(item?.id)

  const filters: Filter<ItemLookupDoc>[] = []
  if (url) {
    filters.push({ type, url })
    if (type === 'video') {
      const videoId = extractVideoId(url)
      if (videoId) filters.push({ type, videoId })
    }
  }
  if (type === 'quote' && text) {
    filters.push(author ? { type, text, author } : { type, text })
  }
  if ((type === 'joke' || type === 'fact') && text) filters.push({ type, text })
  if (title) filters.push({ type, title })
  if (fallbackId && ObjectId.isValid(fallbackId)) filters.push({ _id: new ObjectId(fallbackId) })

  for (const filter of filters) {
    const found = await collection.findOne(filter, { projection: { _id: 1 } })
    if (found?._id) return found._id
  }

  return null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as LikePayload | null
    const db = await getDatabase()
    const collection = db.collection<ItemLookupDoc>('items')
    const objectId = await resolveObjectId(collection, body)
    if (!objectId) {
      return respondError('Valid item target is required')
    }

    const updated = await collection.findOneAndUpdate(
      { _id: objectId },
      {
        $inc: { likeCount: 1 },
        $set: { updatedAt: new Date() },
      },
      {
        projection: { likeCount: 1 },
        returnDocument: 'after',
      },
    )

    if (!updated) {
      return respondError('Item not found', 404)
    }

    const likeCount = typeof updated.likeCount === 'number' ? updated.likeCount : 0
    await refreshTopLikesForItem(objectId)
    return NextResponse.json({ success: true, likeCount })
  } catch (error) {
    console.error('[feedback/like] Failed to increment like', error)
    return respondError('Internal server error', 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as LikePayload | null
    const db = await getDatabase()
    const collection = db.collection<ItemLookupDoc>('items')
    const objectId = await resolveObjectId(collection, body)
    if (!objectId) {
      return respondError('Valid item target is required')
    }

    const existing = await collection.findOne(
      { _id: objectId },
      { projection: { likeCount: 1 } },
    )
    if (!existing) {
      return respondError('Item not found', 404)
    }

    const currentCount = typeof existing.likeCount === 'number' ? existing.likeCount : 0
    if (currentCount <= 0) {
      return NextResponse.json({ success: true, likeCount: 0 })
    }

    const updated = await collection.findOneAndUpdate(
      { _id: objectId },
      {
        $inc: { likeCount: -1 },
        $set: { updatedAt: new Date() },
      },
      {
        projection: { likeCount: 1 },
        returnDocument: 'after',
      },
    )

    if (!updated) {
      return respondError('Item not found', 404)
    }

    const likeCount = typeof updated.likeCount === 'number' && updated.likeCount > 0
      ? updated.likeCount
      : 0

    await refreshTopLikesForItem(objectId)

    return NextResponse.json({ success: true, likeCount })
  } catch (error) {
    console.error('[feedback/like] Failed to decrement like', error)
    return respondError('Internal server error', 500)
  }
}
