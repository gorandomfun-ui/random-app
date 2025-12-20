export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDatabase } from '@/lib/mongodb'

type LikePayload = {
  itemId?: unknown
}

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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as LikePayload | null
    const objectId = parseObjectId(body?.itemId)
    if (!objectId) {
      return respondError('Valid itemId is required')
    }

    const db = await getDatabase()
    const collection = db.collection('items')
    const result = await collection.findOneAndUpdate(
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

    if (!result || !result.value) {
      return respondError('Item not found', 404)
    }

    const record = result.value
    const likeCount = typeof record.likeCount === 'number' ? record.likeCount : 0
    return NextResponse.json({ success: true, likeCount })
  } catch (error) {
    console.error('[feedback/like] Failed to increment like', error)
    return respondError('Internal server error', 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as LikePayload | null
    const objectId = parseObjectId(body?.itemId)
    if (!objectId) {
      return respondError('Valid itemId is required')
    }

    const db = await getDatabase()
    const collection = db.collection('items')
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

    const result = await collection.findOneAndUpdate(
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

    const updated = result?.value
    if (!updated) {
      return respondError('Item not found', 404)
    }

    const likeCount = typeof updated.likeCount === 'number' && updated.likeCount > 0
      ? updated.likeCount
      : 0

    return NextResponse.json({ success: true, likeCount })
  } catch (error) {
    console.error('[feedback/like] Failed to decrement like', error)
    return respondError('Internal server error', 500)
  }
}
