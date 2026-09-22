export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDatabase } from '@/lib/mongodb'
import { consumeRateLimit, registerFeedbackEffect } from '@/lib/v3/rateLimit'
import { checkImageAvailability } from '@/lib/v3/mediaAvailability'

/**
 * Public endpoint: the page reports that an image failed to show.
 *
 * A report marks the image suspect and, for a new reporter, asks the
 * provider by identifier whether the image still exists — Giphy answers
 * 404 for a deleted GIF even when its CDN serves a stand-in file. A media
 * the provider says is gone is suppressed (`isSuppressed`, `media-gone`) and
 * never drawn again. Provider calls are capped per hour for everyone.
 */

const REPORTS_PER_IP_PER_HOUR = 60
const HOUR_MS = 60 * 60 * 1000
/** Provider checks per hour, all visitors together. */
const PROVIDER_CHECKS_PER_HOUR = 120
/** At most one provider check per image in this window. */
const SERVER_CHECK_INTERVAL_MS = 6 * HOUR_MS

type ImageDocument = {
  _id: ObjectId
  url?: string
  pageUrl?: string | null
  provider?: string
  source?: { url?: string | null } | null
  obsoleteImageServerCheckedAt?: Date
}

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
    const items = db.collection<ImageDocument>('items')
    const image = await items.findOne(objectId ? { _id: objectId, type: 'image' } : { type: 'image', url: url as string }, {
      projection: { url: 1, pageUrl: 1, provider: 1, source: 1, obsoleteImageServerCheckedAt: 1 },
    })
    if (!image) {
      return NextResponse.json({ success: true, skipped: true }, { status: 202 })
    }

    let gone: string | null = null
    const lastCheck = image.obsoleteImageServerCheckedAt?.getTime() ?? 0
    if (now.getTime() - lastCheck >= SERVER_CHECK_INTERVAL_MS) {
      const checks = await consumeRateLimit({ req: request, route: 'feedback/image-check', limit: PROVIDER_CHECKS_PER_HOUR, windowMs: HOUR_MS, scope: 'global' })
      if (checks.allowed) {
        const verdict = await checkImageAvailability(image)
        if (verdict.checked) {
          setFields.obsoleteImageServerCheckedAt = now
          if (!verdict.available) gone = verdict.reason
        }
      }
    }
    if (gone) {
      setFields.isSuppressed = true
      setFields.suppressedReason = 'media-gone'
      setFields.suppressedAt = now
      setFields.suppressedDetail = `server-${gone}`
    }

    await items.updateOne(
      { _id: image._id },
      {
        $set: setFields,
        $inc: { obsoleteImageSuspectCount: 1 },
      },
    )

    return NextResponse.json({ success: true, suppressed: Boolean(gone) })
  } catch (error) {
    console.error('[feedback/image-error] Failed to mark image suspect', error)
    return NextResponse.json({ success: true, skipped: true }, { status: 202 })
  }
}
