export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDatabase } from '@/lib/mongodb'

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
    const body = await request.json().catch(() => null)
    const objectId = parseObjectId((body as { itemId?: unknown } | null)?.itemId)

    if (!objectId) {
      return respondError('Valid itemId is required')
    }

    const db = await getDatabase()
    const collection = db.collection('items')

    const updateResult = await collection.updateOne(
      { _id: objectId },
      {
        $inc: { dislikeCount: 1 },
        $mul: { showWeight: 0.9 },
        $set: { updatedAt: new Date() },
      },
    )

    if (!updateResult.matchedCount) {
      return respondError('Item not found', 404)
    }

    const item = await collection.findOne({ _id: objectId }, { projection: { dislikeCount: 1 } })
    if (item && typeof item.dislikeCount === 'number' && item.dislikeCount >= 10000) {
      await collection.updateOne(
        { _id: objectId },
        { $set: { isSuppressed: true } },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in dislike:', error)
    return respondError('Internal server error', 500)
  }
}
