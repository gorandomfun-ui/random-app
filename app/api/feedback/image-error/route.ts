export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDatabase } from '@/lib/mongodb'
import { consumeRateLimit, registerFeedbackEffect } from '@/lib/v3/rateLimit'

const REPORTS_PER_IP_PER_HOUR = 60
const HOUR_MS = 60 * 60 * 1000

type ImageErrorPayload = {
  itemId?: unknown
  url?: unknown
  failedUrl?: unknown
  provider?: unknown
  reason?: unknown
  sourceUrl?: unknown
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

function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

export async function POST(request: Request) {
  try {
    const limit = await consumeRateLimit({
      req: request,
      route: 'feedback/image-error',
      limit: REPORTS_PER_IP_PER_HOUR,
      windowMs: HOUR_MS,
    })
    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many reports' }, { status: 429 })
    }

    const body = (await request.json().catch(() => null)) as ImageErrorPayload | null
    const objectId = parseObjectId(body?.itemId)
    const url = cleanString(body?.url, 2000)
    const failedUrl = cleanString(body?.failedUrl, 2000)

    if (!objectId && !url) {
      return NextResponse.json({ success: true, skipped: true }, { status: 202 })
    }

    const now = new Date()
    const reason = cleanString(body?.reason, 80) || 'image-load-error'
    const provider = cleanString(body?.provider, 80)
    const sourceUrl = cleanString(body?.sourceUrl, 2000)

    const setFields: Record<string, unknown> = {
      obsoleteImageSuspect: true,
      obsoleteImageSuspectAt: now,
      obsoleteImageSuspectReason: reason,
      updatedAt: now,
    }
    if (failedUrl) setFields.obsoleteImageLastErrorUrl = failedUrl
    if (provider) setFields.obsoleteImageSuspectProvider = provider
    if (sourceUrl) setFields.obsoleteImageSuspectSourceUrl = sourceUrl

    const effect = await registerFeedbackEffect({
      req: request,
      scope: `image-error:${objectId ? objectId.toHexString() : url}`,
    })
    if (!effect.first) {
      return NextResponse.json({ success: true, counted: false })
    }

    const db = await getDatabase()
    const result = await db.collection('items').updateOne(
      objectId ? { _id: objectId, type: 'image' } : { type: 'image', url },
      {
        $set: setFields,
        $inc: { obsoleteImageSuspectCount: 1 },
      },
    )

    if (!result.matchedCount) {
      return NextResponse.json({ success: true, skipped: true }, { status: 202 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[feedback/image-error] Failed to mark image suspect', error)
    return NextResponse.json({ success: true, skipped: true }, { status: 202 })
  }
}
