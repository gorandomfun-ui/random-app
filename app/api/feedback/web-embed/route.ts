export const runtime = 'nodejs'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { consumeRateLimit, registerFeedbackEffect } from '@/lib/v3/rateLimit'

/**
 * Public endpoint: the page reports that a site marked embeddable did not
 * load inside Random's frame in time. The first report marks the site; from
 * two distinct addresses its verdict is cleared, so the night check asks it
 * again first (scripts/v3/check-web-links.ts --fresh); six turn `embeddable`
 * off at once. Until 18 October two addresses turned it off: two people could
 * take any site out of the draw.
 */

const REPORTS_PER_IP_PER_HOUR = 60
const HOUR_MS = 60 * 60 * 1000
const DISTINCT_IPS_TO_TURN_OFF = 6
const DISTINCT_IPS_TO_RECHECK = 2

type Payload = { itemId?: unknown; url?: unknown; reason?: unknown }

function parseObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !ObjectId.isValid(value.trim())) return null
  try {
    return new ObjectId(value.trim())
  } catch {
    return null
  }
}

function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

const accepted = () => NextResponse.json({ success: true, skipped: true }, { status: 202 })

export async function POST(request: Request) {
  try {
    const limit = await consumeRateLimit({ req: request, route: 'feedback/web-embed', limit: REPORTS_PER_IP_PER_HOUR, windowMs: HOUR_MS })
    if (!limit.allowed) return NextResponse.json({ success: false, error: 'Too many reports' }, { status: 429 })

    const body = (await request.json().catch(() => null)) as Payload | null
    const objectId = parseObjectId(body?.itemId)
    const url = cleanString(body?.url, 2000)
    if (!objectId && !url) return accepted()

    const db = await getDatabase()
    const items = db.collection('items')
    const site = await items.findOne(objectId ? { _id: objectId, type: 'web' } : { type: 'web', url: url as string }, { projection: { _id: 1, embeddable: 1 } })
    if (!site) return accepted()

    const effect = await registerFeedbackEffect({ req: request, scope: `web-embed:${site._id.toHexString()}` })
    if (!effect.first) return NextResponse.json({ success: true, counted: false })

    const now = new Date()
    const turnOff = effect.distinctIps >= DISTINCT_IPS_TO_TURN_OFF
    const recheck = !turnOff && effect.distinctIps >= DISTINCT_IPS_TO_RECHECK
    await items.updateOne(
      { _id: site._id },
      {
        $set: {
          webEmbedSuspectAt: now,
          webEmbedSuspectReason: cleanString(body?.reason, 80) || 'frame-load-timeout',
          webEmbedDistinctReporters: effect.distinctIps,
          ...(turnOff ? { embeddable: false, embedReason: `visitors-${effect.distinctIps}-ips`, embedCheckedAt: now } : {}),
        },
        $inc: { webEmbedSuspectCount: 1 },
        ...(recheck ? { $unset: { embedCheckedAt: '' } } : {}),
      },
    )
    return NextResponse.json({ success: true, embeddable: !turnOff })
  } catch (error) {
    console.error('[feedback/web-embed] Failed to record report', error)
    return accepted()
  }
}
