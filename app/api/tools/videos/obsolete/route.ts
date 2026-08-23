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
  kind?: 'obsolete' | 'rate-limited' | 'ambiguous'
}

const USER_AGENT = 'RandomAppBot/1.0 (+https://random.app)'
const FULL_SCAN_CONCURRENCY = 10
const FULL_SCAN_BATCH_SIZE = 200
const PROGRESS_INTERVAL = 50
const RETRY_DELAY_MS = 200

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

function normalizeReasonText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isExplicitDailymotionUnavailableMessage(message?: string): boolean {
  if (!message) return false
  const normalized = normalizeReasonText(message)
  if (!normalized) return false
  const unavailableFragments = [
    'no longer available',
    'has been deleted',
    'was deleted',
    'has been removed',
    'was removed',
    'removed because',
    'removed due to',
    'terms violation',
    'terms of use',
    'made private',
    'is private',
    'private by',
    'video is private',
    'cette video n est plus disponible',
    'cette video a ete supprimee',
    'cette video a ete retiree',
    'droits d auteur',
    'conditions d utilisation',
    'deze video is niet meer beschikbaar',
    'niet meer beschikbaar',
    'is verwijderd',
    'prive is gemaakt',
    'inbreuk op de gebruiksvoorwaarden',
    'este video ya no esta disponible',
    'ha sido eliminado',
    'se ha eliminado',
    'questo video non e piu disponibile',
    'e stato rimosso',
    'dieses video ist nicht mehr verfugbar',
    'wurde entfernt',
  ]
  return unavailableFragments.some((fragment) => normalized.includes(fragment))
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response | null> {
  const { timeoutMs = 6000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const extraHeaders = headersToObject(rest.headers)
  if (!extraHeaders['User-Agent'] && !extraHeaders['user-agent']) {
    extraHeaders['User-Agent'] = USER_AGENT
  }

  try {
    return await fetch(url, {
      ...rest,
      headers: extraHeaders,
      signal: controller.signal,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchStatus(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<number | null> {
  const response = await fetchWithTimeout(url, init)
  return response ? response.status : null
}

async function fetchDailymotionMetadata(
  id: string,
  { timeoutMs = 5000 }: { timeoutMs?: number } = {},
): Promise<{ status: number | null; unavailable: boolean; ambiguous?: boolean; reason?: string }> {
  const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(id)}`
  const response = await fetchWithTimeout(metadataUrl, { timeoutMs })
  if (!response) {
    return { status: null, unavailable: false }
  }
  const status = response.status ?? null
  let payload: unknown
  try {
    payload = await response.json()
  } catch {}

  const extractError = (): string | undefined => {
    if (!payload || typeof payload !== 'object') return undefined
    const asAny = payload as Record<string, unknown>
    if (typeof asAny.error === 'string') return asAny.error
    if (asAny.error && typeof asAny.error === 'object') {
      const err = asAny.error as Record<string, unknown>
      if (typeof err.message === 'string') return err.message
      if (typeof err.code === 'string') return err.code
    }
    if (Array.isArray(asAny.errors) && asAny.errors.length) {
      const errEntry = asAny.errors[0]
      if (typeof errEntry === 'string') return errEntry
      if (errEntry && typeof errEntry === 'object') {
        const typed = errEntry as Record<string, unknown>
        if (typeof typed.message === 'string') return typed.message
        if (typeof typed.code === 'string') return typed.code
      }
    }
    if (typeof asAny.message === 'string') return asAny.message
    return undefined
  }

  const errorMessage = extractError()

  if (status === 404 || status === 410) {
    return { status, unavailable: true, reason: `dailymotion-${status}` }
  }
  if (errorMessage) {
    const reason = `dailymotion-metadata-${errorMessage.replace(/\s+/g, '-').toLowerCase()}`
    if (isExplicitDailymotionUnavailableMessage(errorMessage)) {
      return { status, unavailable: true, reason }
    }
    return { status, unavailable: false, ambiguous: true, reason }
  }
  if (status !== null && status >= 400) {
    return { status, unavailable: false, ambiguous: true, reason: `dailymotion-${status}` }
  }

  return { status, unavailable: false }
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
    if (status === 429) {
      return { obsolete: false, status, reason: 'rate-limited', kind: 'rate-limited' }
    }
    if (status === null) {
      return { obsolete: false, status: null, reason: 'network-error', kind: 'ambiguous' }
    }
    return {
      obsolete: true,
      status,
      reason: `youtube-${status}`,
    }
  }

  if (provider.includes('dailymotion')) {
    const rawId = videoId || extractDailymotionId(url) || ''
    const id = sanitizeProviderId(rawId)
    if (!id) return { obsolete: true, reason: 'missing-video-id' }

    const checkAvailability = async () => {
      const response = await fetchWithTimeout(
        `https://api.dailymotion.com/video/${encodeURIComponent(id)}?fields=availability`,
        { timeoutMs: 5000 },
      )
      const status = response?.status ?? null
      if (!response) {
        return { kind: 'network-error' as const, status }
      }
      if (status === 401 || status === 403) {
        return { kind: 'restricted' as const, status }
      }
      if (status === 429) {
        return { kind: 'rate-limited' as const, status }
      }
      if (status === 400) {
        return { kind: 'ambiguous' as const, status }
      }
      if (!response.ok) {
        return { kind: 'error' as const, status }
      }
      let availability = ''
      try {
        const json = (await response.json()) as { availability?: string } | null
        if (typeof json?.availability === 'string') {
          availability = json.availability.trim().toLowerCase()
        }
      } catch {}
      return { kind: 'ok' as const, status, availability }
    }

    const availabilityResult = await checkAvailability()
    if (availabilityResult.kind === 'rate-limited') {
      return { obsolete: false, status: availabilityResult.status ?? null, reason: 'rate-limited', kind: 'rate-limited' }
    }
    if (availabilityResult.kind === 'restricted') {
      return { obsolete: false, status: availabilityResult.status ?? null, reason: 'restricted' }
    }
    if (availabilityResult.kind === 'ok') {
      const availability = availabilityResult.availability || ''
      if (!availability || availability === 'available' || availability === 'allowed') {
        const metadata = await fetchDailymotionMetadata(id)
        if (metadata.unavailable) {
          return { obsolete: true, status: metadata.status, reason: metadata.reason || 'dailymotion-player-error' }
        }
        if (metadata.ambiguous) {
          return { obsolete: false, status: metadata.status, reason: metadata.reason || 'dailymotion-metadata-ambiguous', kind: 'ambiguous' }
        }
        if (metadata.status !== null && metadata.status >= 200 && metadata.status < 400) {
          return { obsolete: false, status: availabilityResult.status ?? metadata.status ?? null }
        }
        return { obsolete: false, status: metadata.status, reason: metadata.reason || 'dailymotion-metadata-ambiguous', kind: 'ambiguous' }
      }
      return {
        obsolete: true,
        status: availabilityResult.status ?? null,
        reason: `dailymotion-availability-${availability}`,
      }
    }

    if (availabilityResult.kind === 'ambiguous' || availabilityResult.kind === 'network-error') {
      const metadata = await fetchDailymotionMetadata(id)
      if (metadata.status === null) {
        return { obsolete: false, status: null, reason: 'ambiguous', kind: 'ambiguous' }
      }
      if (metadata.status === 429) {
        return { obsolete: false, status: metadata.status, reason: 'rate-limited', kind: 'rate-limited' }
      }
      if (metadata.status === 401 || metadata.status === 403) {
        return { obsolete: false, status: metadata.status, reason: 'restricted' }
      }
      if (metadata.unavailable) {
        return { obsolete: true, status: metadata.status, reason: metadata.reason || 'dailymotion-player-error' }
      }
      if (metadata.ambiguous) {
        return { obsolete: false, status: metadata.status, reason: metadata.reason || 'dailymotion-metadata-ambiguous', kind: 'ambiguous' }
      }
      if (metadata.status >= 200 && metadata.status < 400) {
        return { obsolete: false, status: metadata.status }
      }
      return { obsolete: false, status: metadata.status, reason: metadata.reason || 'dailymotion-metadata-ambiguous', kind: 'ambiguous' }
    }

    return {
      obsolete: true,
      status: availabilityResult.status ?? null,
      reason: availabilityResult.kind === 'error' ? `dailymotion-${availabilityResult.status ?? 'error'}` : 'network-error',
    }
  }

  const fallbackId = videoId ? sanitizeProviderId(videoId) : ''
  const targetUrl = url || (fallbackId ? `https://youtu.be/${fallbackId}` : '')
  if (!targetUrl) return { obsolete: true, reason: 'missing-url' }

  let status = await fetchStatus(targetUrl, { method: 'HEAD', timeoutMs: 5000 })
  if (status === null || status === 405) {
    status = await fetchStatus(targetUrl, { method: 'GET', timeoutMs: 5000 })
  }

  if (status === 429) {
    return { obsolete: false, status, reason: 'rate-limited', kind: 'rate-limited' }
  }
  if (status !== null && status >= 200 && status < 400) {
    return { obsolete: false, status }
  }
  if (status === null) {
    return { obsolete: false, status: null, reason: 'network-error', kind: 'ambiguous' }
  }

  return {
    obsolete: true,
    status,
    reason: `status-${status}`,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAmbiguousOutcome(outcome: CheckOutcome): boolean {
  const status = outcome.status ?? null
  if (outcome.kind === 'ambiguous') return true
  if (status === 429) return true
  if (!outcome.obsolete) return false
  if (status === null) return true
  if (status >= 500) return true
  return false
}

async function checkVideoWithRetry(doc: VideoDoc, retries = 1): Promise<CheckOutcome> {
  let attempt = 0
  let result = await checkVideo(doc)
  while (attempt < retries && isAmbiguousOutcome(result)) {
    attempt += 1
    await delay(RETRY_DELAY_MS)
    result = await checkVideo(doc)
  }
  return result
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const db = await getDbSafe()
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 })
  }

  const url = req.nextUrl
  const fullScan =
    url.searchParams.get('full') === '1' ||
    url.searchParams.get('full') === 'true' ||
    url.searchParams.get('mode') === 'full'

  if (fullScan) {
    let cancelled = false
    let activeCursor: { close: () => Promise<void> } | null = null

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()
        let closed = false

        const writeLine = (payload: Record<string, unknown>) => {
          if (cancelled || closed) return false
          try {
            controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'))
            return true
          } catch {
            closed = true
            return false
          }
        }

        const closeStream = () => {
          if (closed) return
          closed = true
          try {
            controller.close()
          } catch {}
        }

        const obsoleteCounts: Record<string, number> = {}
        const rateLimitedCounts: Record<string, number> = {}
        const ambiguousCounts: Record<string, number> = {}
        const obsolete: Array<{
          id: string
          provider: string
          url: string
          videoId?: string
          title?: string | null
          reason: string
          status: number | null
        }> = []
        const rateLimited: Array<{
          id: string
          provider: string
          url: string
          videoId?: string
          title?: string | null
          reason: string
          status: number | null
        }> = []
        const ambiguous: Array<{
          id: string
          provider: string
          url: string
          videoId?: string
          title?: string | null
          reason: string
          status: number | null
        }> = []
        const startTime = Date.now()

        let checked = 0
        let errors = 0

        const cursor = db
          .collection<VideoDoc>('items')
          .find({ type: 'video' })
          .sort({ _id: 1 })
          .batchSize(FULL_SCAN_BATCH_SIZE)
        activeCursor = cursor

        const pool: Promise<void>[] = []

        const processDoc = async (doc: VideoDoc) => {
          const provider = normalizeProvider(doc.provider)
          try {
            const result = await checkVideoWithRetry(doc, 1)
            if (result.status === 429 || result.reason === 'rate-limited' || result.kind === 'rate-limited') {
              rateLimitedCounts[provider] = (rateLimitedCounts[provider] || 0) + 1
              rateLimited.push({
                id: doc._id.toHexString(),
                provider,
                url: doc.url || '',
                videoId: doc.videoId || undefined,
                title: doc.title ?? null,
                reason: result.reason || 'rate-limited',
                status: result.status ?? null,
              })
            } else if (result.kind === 'ambiguous') {
              ambiguousCounts[provider] = (ambiguousCounts[provider] || 0) + 1
              ambiguous.push({
                id: doc._id.toHexString(),
                provider,
                url: doc.url || '',
                videoId: doc.videoId || undefined,
                title: doc.title ?? null,
                reason: result.reason || 'ambiguous',
                status: result.status ?? null,
              })
            } else if (result.obsolete) {
              obsoleteCounts[provider] = (obsoleteCounts[provider] || 0) + 1
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
          } catch {
            errors += 1
          } finally {
            checked += 1
            if (checked % PROGRESS_INTERVAL === 0) {
              writeLine({
                type: 'progress',
                checked,
                errors,
              })
            }
          }
        }

        try {
          for await (const doc of cursor) {
            if (cancelled) break
            if (pool.length >= FULL_SCAN_CONCURRENCY) {
              await Promise.race(pool)
            }
            const task = processDoc(doc)
            pool.push(task)
            task.finally(() => {
              const idx = pool.indexOf(task)
              if (idx >= 0) pool.splice(idx, 1)
            })
          }

          await Promise.all(pool)

          if (!cancelled && checked % PROGRESS_INTERVAL !== 0) {
            writeLine({
              type: 'progress',
              checked,
              errors,
            })
          }

          if (!cancelled) {
            writeLine({
              type: 'done',
              checked,
              errors,
              durationMs: Date.now() - startTime,
              obsolete,
              rateLimited,
              ambiguous,
              counts: {
                total: obsolete.length,
                providers: obsoleteCounts,
                obsolete: {
                  total: obsolete.length,
                  providers: obsoleteCounts,
                },
                rateLimited: {
                  total: rateLimited.length,
                  providers: rateLimitedCounts,
                },
                ambiguous: {
                  total: ambiguous.length,
                  providers: ambiguousCounts,
                },
              },
            })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!cancelled) {
            writeLine({
              type: 'error',
              message,
              checked,
              errors,
            })
          }
        } finally {
          if (activeCursor) {
            await activeCursor.close().catch(() => {})
            activeCursor = null
          }
          closeStream()
        }
      },
      cancel() {
        cancelled = true
        if (activeCursor) {
          void activeCursor.close().catch(() => {})
        }
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store',
      },
    })
  }

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
  const rateLimited: Array<{
    id: string
    provider: string
    url: string
    videoId?: string
    title?: string | null
    reason: string
    status: number | null
  }> = []
  const ambiguous: Array<{
    id: string
    provider: string
    url: string
    videoId?: string
    title?: string | null
    reason: string
    status: number | null
  }> = []
  const providerCounts: Record<string, number> = {}
  const rateLimitedCounts: Record<string, number> = {}
  const ambiguousCounts: Record<string, number> = {}
  let checked = 0

  for (const doc of docs) {
    checked += 1
    const provider = normalizeProvider(doc.provider)
    const result = await checkVideo(doc)
    if (result.status === 429 || result.reason === 'rate-limited' || result.kind === 'rate-limited') {
      rateLimitedCounts[provider] = (rateLimitedCounts[provider] || 0) + 1
      rateLimited.push({
        id: doc._id.toHexString(),
        provider,
        url: doc.url || '',
        videoId: doc.videoId || undefined,
        title: doc.title ?? null,
        reason: result.reason || 'rate-limited',
        status: result.status ?? null,
      })
      continue
    }

    if (result.kind === 'ambiguous') {
      ambiguousCounts[provider] = (ambiguousCounts[provider] || 0) + 1
      ambiguous.push({
        id: doc._id.toHexString(),
        provider,
        url: doc.url || '',
        videoId: doc.videoId || undefined,
        title: doc.title ?? null,
        reason: result.reason || 'ambiguous',
        status: result.status ?? null,
      })
      continue
    }

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
    rateLimited,
    ambiguous,
    counts: {
      total: obsolete.length,
      providers: providerCounts,
      obsolete: {
        total: obsolete.length,
        providers: providerCounts,
      },
      rateLimited: {
        total: rateLimited.length,
        providers: rateLimitedCounts,
      },
      ambiguous: {
        total: ambiguous.length,
        providers: ambiguousCounts,
      },
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
