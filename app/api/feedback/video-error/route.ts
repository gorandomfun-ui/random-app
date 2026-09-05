export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'

type VideoErrorPayload = {
  itemId?: unknown
  url?: unknown
  provider?: unknown
  sourceUrl?: unknown
  reason?: unknown
  playerCode?: unknown
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as VideoErrorPayload | null
    const objectId = parseObjectId(body?.itemId)
    const url = cleanString(body?.url, 2000)
    if (!objectId && !url) {
      return NextResponse.json({ success: true, skipped: true }, { status: 202 })
    }

    const now = new Date()
    const reason = cleanString(body?.reason, 80) || 'video-error'
    const provider = cleanString(body?.provider, 80)
    const sourceUrl = cleanString(body?.sourceUrl, 2000)
    const playerCode = cleanPlayerCode(body?.playerCode)
    const permanentPlayerSignal = playerCode === 100 || playerCode === 101 || playerCode === 150
    const blockDurationMs = permanentPlayerSignal
      ? 30 * 24 * 60 * 60 * 1000
      : reason === 'video-load-timeout'
        ? 10 * 60 * 1000
        : 6 * 60 * 60 * 1000

    const setFields: Record<string, unknown> = {
      obsoleteVideoRuntimeSuspect: true,
      obsoleteVideoRuntimeSuspectAt: now,
      obsoleteVideoRuntimeSuspectReason: reason,
      obsoleteVideoRuntimePermanentSignal: permanentPlayerSignal,
      obsoleteVideoRuntimeBlockedUntil: new Date(now.getTime() + blockDurationMs),
    }
    if (permanentPlayerSignal) {
      setFields.obsoleteVideoStatus = 'obsolete'
      setFields.obsoleteVideoReason = `runtime-player-${playerCode}`
      setFields.obsoleteVideoCheckedAt = now
    }
    if (provider) setFields.obsoleteVideoRuntimeSuspectProvider = provider
    if (sourceUrl) setFields.obsoleteVideoRuntimeSuspectSourceUrl = sourceUrl
    if (playerCode != null) setFields.obsoleteVideoRuntimePlayerCode = playerCode

    const db = await getDatabase()
    const result = await db.collection('items').updateOne(
      objectId ? { _id: objectId, type: 'video' } : { type: 'video', url },
      {
        $set: setFields,
        $inc: { obsoleteVideoRuntimeSuspectCount: 1 },
      },
    )

    return NextResponse.json(
      result.matchedCount ? { success: true } : { success: true, skipped: true },
      { status: result.matchedCount ? 200 : 202 },
    )
  } catch (error) {
    console.error('[feedback/video-error] Failed to mark video suspect', error)
    return NextResponse.json({ success: true, skipped: true }, { status: 202 })
  }
}
