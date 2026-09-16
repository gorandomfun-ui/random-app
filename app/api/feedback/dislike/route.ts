export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDatabase } from '@/lib/mongodb'
import { consumeRateLimit, registerFeedbackEffect } from '@/lib/v3/rateLimit'

const ACTIONS_PER_IP_PER_HOUR = 60
const HOUR_MS = 60 * 60 * 1000

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
    const limit = await consumeRateLimit({
      req: request,
      route: 'feedback/dislike',
      limit: ACTIONS_PER_IP_PER_HOUR,
      windowMs: HOUR_MS,
    })
    if (!limit.allowed) {
      return respondError('Too many requests', 429)
    }

    const body = await request.json().catch(() => null)
    const objectId = parseObjectId((body as { itemId?: unknown } | null)?.itemId)

    if (!objectId) {
      return respondError('Valid itemId is required')
    }

    // One address counts once per item per 24 h; repeats are accepted and ignored.
    const effect = await registerFeedbackEffect({
      req: request,
      scope: `dislike:${objectId.toHexString()}`,
    })
    if (!effect.first) {
      return NextResponse.json({ success: true, counted: false })
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
