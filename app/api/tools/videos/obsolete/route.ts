export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDbSafe } from '@/lib/random/data'

type VideoDoc = {
  _id: ObjectId
  provider?: string | null
  url?: string | null
  videoId?: string | null
  title?: string | null
  thumb?: string | null
  thumbUrl?: string | null
}

type CheckOutcome = {
  obsolete: boolean
  reason?: string
  status?: number | null
}

const USER_AGENT = 'RandomAppBot/1.0 (+https://random.app)'

function isAuthorized(req: NextRequest): boolean {
  const expected = (process.env.ADMIN_INGEST_KEY || '').trim()
  const provided =
    req.nextUrl.searchParams.get('key')?.trim() ||
    req.headers.get('x-admin-ingest-key')?.trim() ||
    ''
  if (!expected) return false
  return provided === expected
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  const out: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      out[String(key)] = String(value)
    }
    return out
  }
  return { ...(headers as Record<string, string>) }
}

async function fetchStatus(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<number | null> {
  const { timeoutMs = 6000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const extraHeaders = headersToObject(rest.headers)
  if (!extraHeaders['User-Agent'] && !extraHeaders['user-agent']) {
    extraHeaders['User-Agent'] = USER_AGENT
  }

  try {
    const response = await fetch(url, {
      ...rest,
      headers: extraHeaders,
      signal: controller.signal,
    })
    return response.status
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.hostname.includes('youtu')) {
      const idFromQuery = url.searchParams.get('v')
      if (idFromQuery) return idFromQuery
      const segments = url.pathname.split('/').filter(Boolean)
      return segments.pop() || null
    }
  } catch {}
  return null
}

function extractDailymotionId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.hostname === 'dai.ly') {
      return url.pathname.split('/').filter(Boolean)[0] || null
    }
    if (url.hostname.includes('dailymotion.com')) {
      const parts = url.pathname.split('/').filter(Boolean)
      const idx = parts.indexOf('video')
      if (idx >= 0 && parts[idx + 1]) {
        return parts[idx + 1].split('_')[0]
      }
      return parts.pop() || null
    }
  } catch {}
  return null
}

function sanitizeProviderId(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(':')
  return parts[parts.length - 1]
}

function normalizeProvider(value?: string | null): string {
  if (!value) return 'unknown'
  return value.toLowerCase().trim() || 'unknown'
}

async function checkVideo(doc: VideoDoc): Promise<CheckOutcome> {
  const provider = normalizeProvider(doc.provider)
  const url = doc.url?.trim() || ''
  const videoId = doc.videoId?.trim() || ''

  if (!url && !videoId) {
    return { obsolete: true, reason: 'missing-url' }
  }

  if (provider.includes('youtube')) {
    const rawId = videoId || extractYouTubeId(url) || ''
    const id = sanitizeProviderId(rawId)
    if (!id) return { obsolete: true, reason: 'missing-video-id' }
    const status = await fetchStatus(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { timeoutMs: 5000 },
    )
    if (status === 200) return { obsolete: false, status }
    if (status === 401 || status === 403) {
      return { obsolete: false, status, reason: 'restricted' }
    }
    return {
      obsolete: true,
      status,
      reason: status == null ? 'network-error' : `youtube-${status}`,
    }
  }

  if (provider.includes('dailymotion')) {
    const rawId = videoId || extractDailymotionId(url) || ''
    const id = sanitizeProviderId(rawId)
    if (!id) return { obsolete: true, reason: 'missing-video-id' }
    const status = await fetchStatus(
      `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(id)}`,
      { timeoutMs: 5000 },
    )
    if (status === 200) return { obsolete: false, status }
    if (status === 401 || status === 403) {
      return { obsolete: false, status, reason: 'restricted' }
    }
    return {
      obsolete: true,
      status,
      reason: status == null ? 'network-error' : `dailymotion-${status}`,
    }
  }

  const fallbackId = videoId ? sanitizeProviderId(videoId) : ''
  const targetUrl = url || (fallbackId ? `https://youtu.be/${fallbackId}` : '')
  if (!targetUrl) return { obsolete: true, reason: 'missing-url' }

  let status = await fetchStatus(targetUrl, { method: 'HEAD', timeoutMs: 5000 })
  if (status === null || status === 405) {
    status = await fetchStatus(targetUrl, { method: 'GET', timeoutMs: 5000 })
  }

  if (status !== null && status >= 200 && status < 400) {
    return { obsolete: false, status }
  }

  return {
    obsolete: true,
    status,
    reason: status == null ? 'network-error' : `status-${status}`,
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const db = await getDbSafe()
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 })
  }

  const url = req.nextUrl
  const rawLimit = Number(url.searchParams.get('limit') || '60')
  const rawSkip = Number(url.searchParams.get('skip') || '0')
  const MAX_LIMIT = 2000
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(rawLimit))) : 60
  const skip = Number.isFinite(rawSkip) ? Math.max(0, Math.floor(rawSkip)) : 0

  const cursor = db
    .collection<VideoDoc>('items')
    .find({ type: 'video' })
    .sort({ updatedAt: 1 })
    .skip(skip)
    .limit(limit)

  const docs = await cursor.toArray()
  const obsolete: Array<{
    id: string
    provider: string
    url: string
    videoId?: string
    title?: string | null
    reason: string
    status: number | null
  }> = []
  const providerCounts: Record<string, number> = {}
  let checked = 0

  for (const doc of docs) {
    checked += 1
    const provider = normalizeProvider(doc.provider)
    const result = await checkVideo(doc)
    if (!result.obsolete) continue

    providerCounts[provider] = (providerCounts[provider] || 0) + 1
    obsolete.push({
      id: doc._id.toHexString(),
      provider,
      url: doc.url || '',
      videoId: doc.videoId || undefined,
      title: doc.title ?? null,
      reason: result.reason || 'unknown',
      status: result.status ?? null,
    })
  }

  return NextResponse.json({
    ok: true,
    limit,
    skip,
    checked,
    obsolete,
    counts: {
      total: obsolete.length,
      providers: providerCounts,
    },
  })
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const db = await getDbSafe()
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ids = Array.isArray((payload as { ids?: unknown })?.ids)
    ? ((payload as { ids: unknown[] }).ids as unknown[])
    : []

  if (!ids.length) {
    return NextResponse.json({ deleted: 0 })
  }

  const objectIds: ObjectId[] = []
  for (const raw of ids) {
    if (typeof raw !== 'string') continue
    try {
      objectIds.push(new ObjectId(raw))
    } catch {}
  }

  if (!objectIds.length) {
    return NextResponse.json({ deleted: 0 })
  }

  const res = await db
    .collection('items')
    .deleteMany({ _id: { $in: objectIds }, type: 'video' })

  return NextResponse.json({ deleted: res.deletedCount ?? 0 })
}
