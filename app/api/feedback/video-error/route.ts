export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { consumeRateLimit, registerFeedbackEffect } from '@/lib/v3/rateLimit'
import { checkYouTubeAvailability, youtubeVideoId } from '@/lib/v3/videoAvailability'
import { checkDailymotionAvailability, dailymotionVideoId } from '@/lib/v3/mediaAvailability'

/**
 * Public endpoint: the player reports that a video failed to play.
 *
 * A single report can no longer retire a video. It only blocks it for a few
 * hours. Retirement (`obsoleteVideoStatus: 'obsolete'`) needs either three
 * distinct addresses within 24 h, or a server-side `videos.list` check saying
 * the video is gone, private or not embeddable.
 */

const REPORTS_PER_IP_PER_HOUR = 20
const HOUR_MS = 60 * 60 * 1000
const DISTINCT_IPS_FOR_OBSOLETE = 3
/** Longest block a report alone may cause. */
const TEMPORARY_BLOCK_MS = 6 * HOUR_MS
const SHORT_BLOCK_MS = 10 * 60 * 1000
/** One quota unit per check, so at most one check per video in this window. */
const SERVER_CHECK_INTERVAL_MS = 6 * HOUR_MS

type VideoErrorPayload = {
  itemId?: unknown
  url?: unknown
  provider?: unknown
  sourceUrl?: unknown
  reason?: unknown
  playerCode?: unknown
}

type VideoDocument = {
  _id: ObjectId
  url?: string
  videoId?: string
  provider?: string
  obsoleteVideoServerCheckedAt?: Date
}

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

function cleanPlayerCode(value: unknown): number | null {
  const code = Number(value)
  return Number.isInteger(code) && code >= 0 && code <= 999 ? code : null
}

/** Player codes that mean "embedding refused", not "temporarily broken". */
function isPermanentPlayerCode(code: number | null): boolean {
  return code === 100 || code === 101 || code === 150
}

function blockDurationFor(reason: string): number {
  return reason === 'video-load-timeout' ? SHORT_BLOCK_MS : TEMPORARY_BLOCK_MS
}

function accepted(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, skipped: true, ...extra }, { status: 202 })
}

export async function POST(request: Request) {
  try {
    const limit = await consumeRateLimit({
      req: request,
      route: 'feedback/video-error',
      limit: REPORTS_PER_IP_PER_HOUR,
      windowMs: HOUR_MS,
    })
    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many reports' }, { status: 429 })
    }

    const body = (await request.json().catch(() => null)) as VideoErrorPayload | null
    const objectId = parseObjectId(body?.itemId)
    const url = cleanString(body?.url, 2000)
    if (!objectId && !url) return accepted()

    const db = await getDatabase()
    const items = db.collection<VideoDocument>('items')
    const selector = objectId ? { _id: objectId, type: 'video' } : { type: 'video', url: url as string }
    const video = await items.findOne(selector, {
      projection: { url: 1, videoId: 1, provider: 1, obsoleteVideoServerCheckedAt: 1 },
    })
    if (!video) return accepted()

    const now = new Date()
    const reason = cleanString(body?.reason, 80) || 'video-error'
    const provider = cleanString(body?.provider, 80)
    const sourceUrl = cleanString(body?.sourceUrl, 2000)
    const playerCode = cleanPlayerCode(body?.playerCode)

    const effect = await registerFeedbackEffect({
      req: request,
      scope: `video-error:${video._id.toHexString()}`,
    })

    const setFields: Record<string, unknown> = {
      obsoleteVideoRuntimeSuspect: true,
      obsoleteVideoRuntimeSuspectAt: now,
      obsoleteVideoRuntimeSuspectReason: reason,
      obsoleteVideoRuntimePermanentSignal: isPermanentPlayerCode(playerCode),
      obsoleteVideoRuntimeBlockedUntil: new Date(now.getTime() + blockDurationFor(reason)),
      obsoleteVideoRuntimeDistinctReporters: effect.distinctIps,
    }
    if (provider) setFields.obsoleteVideoRuntimeSuspectProvider = provider
    if (sourceUrl) setFields.obsoleteVideoRuntimeSuspectSourceUrl = sourceUrl
    if (playerCode != null) setFields.obsoleteVideoRuntimePlayerCode = playerCode

    let obsoleteReason: string | null =
      effect.distinctIps >= DISTINCT_IPS_FOR_OBSOLETE ? `runtime-consensus-${effect.distinctIps}-ips` : null

    // The server check costs one YouTube quota unit: only for a new reporter,
    // and at most once per video per window.
    const lastCheck = video.obsoleteVideoServerCheckedAt?.getTime() ?? 0
    const checkDue = now.getTime() - lastCheck >= SERVER_CHECK_INTERVAL_MS
    if (!obsoleteReason && effect.first && checkDue) {
      // Dailymotion's public API needs no key and no quota; YouTube's check spends a unit.
      const isDailymotion = video.provider === 'dailymotion' || /dailymotion\.com|dai\.ly/i.test(video.url ?? '')
      const dailymotionId = isDailymotion ? dailymotionVideoId(video) : null
      const youtubeId = dailymotionId ? null : youtubeVideoId(video)
      const verdict = dailymotionId ? await checkDailymotionAvailability(dailymotionId) : youtubeId ? await checkYouTubeAvailability(youtubeId) : null
      if (verdict?.checked) {
        setFields.obsoleteVideoServerCheckedAt = now
        if (!verdict.available) obsoleteReason = `server-${verdict.reason}`
      }
    }

    if (obsoleteReason) {
      setFields.obsoleteVideoStatus = 'obsolete'
      setFields.obsoleteVideoReason = obsoleteReason
      setFields.obsoleteVideoCheckedAt = now
    }

    await items.updateOne(
      { _id: video._id },
      { $set: setFields, $inc: { obsoleteVideoRuntimeSuspectCount: 1 } },
    )

    return NextResponse.json({ success: true, obsolete: Boolean(obsoleteReason) })
  } catch (error) {
    console.error('[feedback/video-error] Failed to record report', error)
    return accepted()
  }
}
