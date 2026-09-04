export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ObjectId, type Db } from 'mongodb'
import { getDbSafe } from '@/lib/random/data'

type VideoDoc = {
  _id: ObjectId
  provider?: string | null
  url?: string | null
  videoId?: string | null
  title?: string | null
  thumb?: string | null
  thumbUrl?: string | null
  obsoleteVideoCheckedAt?: Date | null
  obsoleteVideoStatus?: 'ok' | 'obsolete' | 'rate-limited' | 'ambiguous' | null
  obsoleteVideoReason?: string | null
  obsoleteVideoHttpStatus?: number | null
  obsoleteVideoScanId?: string | null
}

type CheckOutcome = {
  obsolete: boolean
  reason?: string
  status?: number | null
  kind?: 'obsolete' | 'rate-limited' | 'ambiguous'
}

type VideoResult = {
  id: string
  provider: string
  url: string
  videoId?: string
  title?: string | null
  reason: string
  status: number | null
}

type ScanResult = {
  checked: number
  errors: number
  obsolete: VideoResult[]
  rateLimited: VideoResult[]
  ambiguous: VideoResult[]
  counts: {
    total: number
    providers: Record<string, number>
    obsolete: { total: number; providers: Record<string, number> }
    rateLimited: { total: number; providers: Record<string, number> }
    ambiguous: { total: number; providers: Record<string, number> }
  }
}

type PersistedOutcome = {
  doc: VideoDoc
  outcome: CheckOutcome
}

type VideoScanJob = {
  _id: 'obsolete-videos'
  scanId: string
  status: 'running' | 'completed'
  total: number
  checked: number
  errors: number
  batches: number
  deleted: number
  cursor: string | null
  upperBoundId: ObjectId | null
  counts: ScanResult['counts']
  startedAt: Date
  updatedAt: Date
  completedAt?: Date | null
  leaseToken?: string | null
  leaseUntil?: Date | null
}

const USER_AGENT = 'RandomAppBot/1.0 (+https://random.app)'
const DEFAULT_SCAN_LIMIT = 300
const MAX_SCAN_LIMIT = 1000
const DEFAULT_SCAN_CONCURRENCY = 24
const MAX_SCAN_CONCURRENCY = 80
const DEFAULT_SCAN_TIMEOUT_MS = 4000
const DEFAULT_STALE_HOURS = 24 * 7
const DEFAULT_STREAM_BATCHES = 8
const MAX_STREAM_BATCHES = 40
const DELETE_CONFIRMATION_MAX_AGE_HOURS = 24 * 14
const RETRY_DELAY_MS = 200
const PERSISTED_JOB_ID = 'obsolete-videos' as const
const PERSISTED_SCAN_BATCH_SIZE = 25
const PERSISTED_SCAN_CONCURRENCY = 4
const PERSISTED_SCAN_TIMEOUT_MS = 6000
const PERSISTED_SCAN_LEASE_MS = 2 * 60 * 1000
const PERSISTED_DELETE_BATCH_SIZE = 25
let videoScanIndexPromise: Promise<void> | null = null

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
    'dm002',
    'dm005',
    'dm010',
    'dm020',
  ]
  return unavailableFragments.some((fragment) => normalized.includes(fragment))
}

function closeResponse(response: Response | null) {
  try {
    const cancellation = response?.body?.cancel()
    cancellation?.catch(() => undefined)
  } catch {
    /* ignore */
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response | null> {
  const { timeoutMs = DEFAULT_SCAN_TIMEOUT_MS, ...rest } = init
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
      redirect: rest.redirect ?? 'follow',
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
  const status = response ? response.status : null
  closeResponse(response)
  return status
}

function classifyHttpStatus(status: number | null, reasonPrefix: string): CheckOutcome {
  if (status === 429) {
    return { obsolete: false, status, reason: 'rate-limited', kind: 'rate-limited' }
  }
  if (status === null) {
    return { obsolete: false, status: null, reason: 'network-error', kind: 'ambiguous' }
  }
  if (status === 404 || status === 410 || status === 451) {
    return { obsolete: true, status, reason: `${reasonPrefix}-${status}` }
  }
  if (status >= 200 && status < 400) {
    return { obsolete: false, status }
  }
  if (status === 401 || status === 403) {
    return { obsolete: false, status, reason: 'restricted', kind: 'ambiguous' }
  }
  return { obsolete: false, status, reason: `${reasonPrefix}-${status}`, kind: 'ambiguous' }
}

async function fetchDailymotionMetadata(
  id: string,
  { timeoutMs = DEFAULT_SCAN_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<{ status: number | null; unavailable: boolean; ambiguous?: boolean; reason?: string }> {
  const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(id)}`
  const response = await fetchWithTimeout(metadataUrl, { timeoutMs })
  if (!response) {
    return { status: null, unavailable: false, ambiguous: true, reason: 'network-error' }
  }
  const status = response.status ?? null
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  } finally {
    closeResponse(response)
  }

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
  if (status === 429) {
    return { status, unavailable: false, ambiguous: true, reason: 'rate-limited' }
  }
  if (status === 401 || status === 403 || status >= 500) {
    return { status, unavailable: false, ambiguous: true, reason: `dailymotion-${status}` }
  }
  if (errorMessage) {
    const reason = `dailymotion-metadata-${errorMessage.replace(/\s+/g, '-').toLowerCase()}`
    if (isExplicitDailymotionUnavailableMessage(errorMessage)) {
      return { status, unavailable: true, reason }
    }
    return { status, unavailable: false, ambiguous: true, reason }
  }
  if (status >= 400) {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function checkVideo(
  doc: VideoDoc,
  { timeoutMs = DEFAULT_SCAN_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<CheckOutcome> {
  const provider = normalizeProvider(doc.provider)
  const url = doc.url?.trim() || ''
  const videoId = doc.videoId?.trim() || ''

  if (!url && !videoId) {
    return { obsolete: false, reason: 'missing-url-or-id', kind: 'ambiguous' }
  }

  if (provider.includes('youtube')) {
    const rawId = videoId || extractYouTubeId(url) || ''
    const id = sanitizeProviderId(rawId)
    if (!id) {
      return { obsolete: false, reason: 'missing-video-id', kind: 'ambiguous' }
    }
    const status = await fetchStatus(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { timeoutMs },
    )
    return classifyHttpStatus(status, 'youtube')
  }

  if (provider.includes('dailymotion')) {
    const rawId = videoId || extractDailymotionId(url) || ''
    const id = sanitizeProviderId(rawId)
    if (!id) {
      return { obsolete: false, reason: 'missing-video-id', kind: 'ambiguous' }
    }

    const response = await fetchWithTimeout(
      `https://api.dailymotion.com/video/${encodeURIComponent(id)}?fields=availability`,
      { timeoutMs },
    )
    const availabilityStatus = response?.status ?? null
    let availability = ''
    try {
      if (response?.ok) {
        const json = (await response.json()) as { availability?: string } | null
        if (typeof json?.availability === 'string') {
          availability = json.availability.trim().toLowerCase()
        }
      }
    } catch {
      availability = ''
    } finally {
      closeResponse(response)
    }

    if (availabilityStatus === 429) {
      return { obsolete: false, status: availabilityStatus, reason: 'rate-limited', kind: 'rate-limited' }
    }
    if (availabilityStatus === 401 || availabilityStatus === 403 || (availabilityStatus !== null && availabilityStatus >= 500)) {
      return { obsolete: false, status: availabilityStatus, reason: `dailymotion-${availabilityStatus}`, kind: 'ambiguous' }
    }
    if (availabilityStatus === 404 || availabilityStatus === 410) {
      return { obsolete: true, status: availabilityStatus, reason: `dailymotion-${availabilityStatus}` }
    }

    if (availabilityStatus !== null && availabilityStatus >= 200 && availabilityStatus < 300) {
      const explicitlyUnavailable = new Set([
        'blocked',
        'deleted',
        'private',
        'rejected',
        'removed',
        'unavailable',
      ])
      if (explicitlyUnavailable.has(availability)) {
        return {
          obsolete: true,
          status: availabilityStatus,
          reason: `dailymotion-availability-${availability}`,
        }
      }
      if (availability && availability !== 'available' && availability !== 'allowed') {
        return {
          obsolete: false,
          status: availabilityStatus,
          reason: `dailymotion-availability-${availability}`,
          kind: 'ambiguous',
        }
      }

      const metadata = await fetchDailymotionMetadata(id, { timeoutMs })
      if (metadata.reason === 'rate-limited') {
        return { obsolete: false, status: metadata.status, reason: 'rate-limited', kind: 'rate-limited' }
      }
      if (metadata.unavailable) {
        return { obsolete: true, status: metadata.status, reason: metadata.reason || 'dailymotion-player-error' }
      }
      if (metadata.ambiguous) {
        return { obsolete: false, status: metadata.status, reason: metadata.reason || 'dailymotion-metadata-ambiguous', kind: 'ambiguous' }
      }
      return { obsolete: false, status: availabilityStatus ?? metadata.status ?? null }
    }

    const metadata = await fetchDailymotionMetadata(id, { timeoutMs })
    if (metadata.reason === 'rate-limited') {
      return { obsolete: false, status: metadata.status, reason: 'rate-limited', kind: 'rate-limited' }
    }
    if (metadata.unavailable) {
      return { obsolete: true, status: metadata.status, reason: metadata.reason || 'dailymotion-player-error' }
    }
    if (metadata.status !== null && metadata.status >= 200 && metadata.status < 400) {
      return { obsolete: false, status: metadata.status }
    }
    return { obsolete: false, status: metadata.status, reason: metadata.reason || 'dailymotion-ambiguous', kind: 'ambiguous' }
  }

  const fallbackId = videoId ? sanitizeProviderId(videoId) : ''
  const targetUrl = url || (fallbackId ? `https://youtu.be/${fallbackId}` : '')
  if (!targetUrl) {
    return { obsolete: false, reason: 'missing-url', kind: 'ambiguous' }
  }

  let status = await fetchStatus(targetUrl, { method: 'HEAD', timeoutMs })
  if (status === null || status === 405) {
    status = await fetchStatus(targetUrl, { method: 'GET', timeoutMs })
  }

  return classifyHttpStatus(status, 'status')
}

async function checkYouTubeBatch(
  docs: VideoDoc[],
  { timeoutMs = PERSISTED_SCAN_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Map<string, CheckOutcome>> {
  const outcomes = new Map<string, CheckOutcome>()
  const key = (process.env.YOUTUBE_API_KEY || '').trim()
  if (!key) return outcomes

  const candidates = docs
    .map((doc) => ({
      doc,
      id: sanitizeProviderId(doc.videoId?.trim() || extractYouTubeId(doc.url?.trim() || '') || ''),
    }))
    .filter((candidate) => candidate.id)

  for (let offset = 0; offset < candidates.length; offset += 50) {
    const chunk = candidates.slice(offset, offset + 50)
    const params = new URLSearchParams({
      key,
      part: 'status',
      id: chunk.map((candidate) => candidate.id).join(','),
    })
    const response = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
      { timeoutMs },
    )
    const status = response?.status ?? null

    if (!response || !response.ok) {
      const outcome = classifyHttpStatus(status, 'youtube-api')
      const safeOutcome = outcome.obsolete
        ? { obsolete: false, status, reason: outcome.reason, kind: 'ambiguous' as const }
        : outcome
      for (const candidate of chunk) {
        outcomes.set(candidate.doc._id.toHexString(), safeOutcome)
      }
      closeResponse(response)
      continue
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = null
    } finally {
      closeResponse(response)
    }

    const items =
      payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
        ? ((payload as { items: unknown[] }).items as Array<{
            id?: string
            status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string }
          }>)
        : null

    if (!items) {
      for (const candidate of chunk) {
        outcomes.set(candidate.doc._id.toHexString(), {
          obsolete: false,
          status,
          reason: 'youtube-api-invalid-response',
          kind: 'ambiguous',
        })
      }
      continue
    }

    const returned = new Map(items.filter((item) => item.id).map((item) => [item.id as string, item]))
    for (const candidate of chunk) {
      const item = returned.get(candidate.id)
      if (!item) {
        outcomes.set(candidate.doc._id.toHexString(), {
          obsolete: true,
          status,
          reason: 'youtube-api-not-returned',
        })
        continue
      }

      const uploadStatus = item.status?.uploadStatus || ''
      const privacyStatus = item.status?.privacyStatus || ''
      if (['deleted', 'failed', 'rejected'].includes(uploadStatus)) {
        outcomes.set(candidate.doc._id.toHexString(), {
          obsolete: true,
          status,
          reason: `youtube-upload-${uploadStatus}`,
        })
      } else if (privacyStatus && privacyStatus !== 'public') {
        outcomes.set(candidate.doc._id.toHexString(), {
          obsolete: true,
          status,
          reason: `youtube-privacy-${privacyStatus}`,
        })
      } else if (item.status?.embeddable === false) {
        outcomes.set(candidate.doc._id.toHexString(), {
          obsolete: true,
          status,
          reason: 'youtube-not-embeddable',
        })
      } else {
        outcomes.set(candidate.doc._id.toHexString(), { obsolete: false, status })
      }
    }
  }

  return outcomes
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAmbiguousOutcome(outcome: CheckOutcome): boolean {
  const status = outcome.status ?? null
  if (outcome.kind === 'ambiguous') return true
  if (outcome.kind === 'rate-limited') return true
  if (!outcome.obsolete) return false
  if (status === null) return true
  if (status >= 500) return true
  return false
}

async function checkVideoWithRetry(
  doc: VideoDoc,
  retries = 1,
  options: { timeoutMs?: number } = {},
): Promise<CheckOutcome> {
  let attempt = 0
  let result = await checkVideo(doc, options)
  while (attempt < retries && isAmbiguousOutcome(result)) {
    attempt += 1
    await delay(RETRY_DELAY_MS)
    result = await checkVideo(doc, options)
  }
  return result
}

function buildResult(doc: VideoDoc, outcome: CheckOutcome): VideoResult {
  return {
    id: doc._id.toHexString(),
    provider: normalizeProvider(doc.provider),
    url: doc.url || '',
    videoId: doc.videoId || undefined,
    title: doc.title ?? null,
    reason: outcome.reason || 'unknown',
    status: outcome.status ?? null,
  }
}

function pushCount(counts: Record<string, number>, provider: string) {
  counts[provider] = (counts[provider] || 0) + 1
}

function getOutcomeStatus(outcome: CheckOutcome): 'ok' | 'obsolete' | 'rate-limited' | 'ambiguous' {
  if (outcome.kind === 'rate-limited') return 'rate-limited'
  if (outcome.kind === 'ambiguous') return 'ambiguous'
  if (outcome.obsolete) return 'obsolete'
  return 'ok'
}

function addScanOutcome(
  doc: VideoDoc,
  outcome: CheckOutcome,
  target: {
    obsolete: VideoResult[]
    rateLimited: VideoResult[]
    ambiguous: VideoResult[]
    obsoleteCounts: Record<string, number>
    rateLimitedCounts: Record<string, number>
    ambiguousCounts: Record<string, number>
  },
) {
  const provider = normalizeProvider(doc.provider)
  if (outcome.status === 429 || outcome.kind === 'rate-limited') {
    pushCount(target.rateLimitedCounts, provider)
    target.rateLimited.push(buildResult(doc, outcome))
    return
  }
  if (outcome.kind === 'ambiguous') {
    pushCount(target.ambiguousCounts, provider)
    target.ambiguous.push(buildResult(doc, outcome))
    return
  }
  if (outcome.obsolete) {
    pushCount(target.obsoleteCounts, provider)
    target.obsolete.push(buildResult(doc, outcome))
  }
}

async function persistScanOutcomes(db: Db, outcomes: PersistedOutcome[], scanId?: string) {
  if (!outcomes.length) return
  const checkedAt = new Date()
  const operations = outcomes.map(({ doc, outcome }) => {
    const status = getOutcomeStatus(outcome)
    return {
      updateOne: {
        filter: { _id: doc._id, type: 'video' },
        update: {
          $set: {
            obsoleteVideoCheckedAt: checkedAt,
            obsoleteVideoStatus: status,
            obsoleteVideoReason: outcome.reason || null,
            obsoleteVideoHttpStatus: outcome.status ?? null,
            ...(scanId ? { obsoleteVideoScanId: scanId } : {}),
          },
          ...(status === 'ok' || status === 'obsolete'
            ? { $unset: { obsoleteVideoRuntimeSuspect: '' } }
            : {}),
        },
      },
    }
  })

  try {
    await db.collection('items').bulkWrite(operations, { ordered: false })
  } catch {
    /* A scan result is still useful if status persistence fails. */
  }
}

function ensureVideoScanIndexes(db: Db) {
  if (!videoScanIndexPromise) {
    videoScanIndexPromise = Promise.all([
      db.collection('items').createIndex(
        { type: 1, obsoleteVideoCheckedAt: 1, _id: 1 },
        {
          name: 'idx_video_obsolete_checked',
          partialFilterExpression: { type: 'video' },
        },
      ),
      db.collection('items').createIndex(
        { type: 1, obsoleteVideoStatus: 1, obsoleteVideoCheckedAt: 1 },
        {
          name: 'idx_video_obsolete_status',
          partialFilterExpression: { type: 'video' },
        },
      ),
    ])
      .then(() => undefined)
      .catch((error) => {
        videoScanIndexPromise = null
        console.warn('[tools/videos/obsolete] Failed to ensure indexes', error)
      })
  }
  return videoScanIndexPromise
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  })
  await Promise.all(runners)
}

async function scanVideoDocs(
  db: Db,
  docs: VideoDoc[],
  {
    concurrency = DEFAULT_SCAN_CONCURRENCY,
    retries = 0,
    timeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
    persist = true,
    scanId,
  }: {
    concurrency?: number
    retries?: number
    timeoutMs?: number
    persist?: boolean
    scanId?: string
  } = {},
): Promise<ScanResult> {
  const obsolete: VideoResult[] = []
  const rateLimited: VideoResult[] = []
  const ambiguous: VideoResult[] = []
  const obsoleteCounts: Record<string, number> = {}
  const rateLimitedCounts: Record<string, number> = {}
  const ambiguousCounts: Record<string, number> = {}
  const outcomes: PersistedOutcome[] = []
  let errors = 0

  const youtubeDocs = docs.filter((doc) => normalizeProvider(doc.provider).includes('youtube'))
  const youtubeOutcomes = await checkYouTubeBatch(youtubeDocs, { timeoutMs })

  await runWithConcurrency(docs, concurrency, async (doc) => {
    try {
      const outcome =
        youtubeOutcomes.get(doc._id.toHexString()) ||
        (await checkVideoWithRetry(doc, retries, { timeoutMs }))
      outcomes.push({ doc, outcome })
      addScanOutcome(doc, outcome, {
        obsolete,
        rateLimited,
        ambiguous,
        obsoleteCounts,
        rateLimitedCounts,
        ambiguousCounts,
      })
    } catch {
      errors += 1
    }
  })

  if (persist) {
    await persistScanOutcomes(db, outcomes, scanId)
  }

  return {
    checked: docs.length,
    errors,
    obsolete,
    rateLimited,
    ambiguous,
    counts: {
      total: obsolete.length,
      providers: obsoleteCounts,
      obsolete: { total: obsolete.length, providers: obsoleteCounts },
      rateLimited: { total: rateLimited.length, providers: rateLimitedCounts },
      ambiguous: { total: ambiguous.length, providers: ambiguousCounts },
    },
  }
}

function parseNumberParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value || String(fallback))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function buildChunkFilter({
  cursorParam,
  provider,
  force,
  staleHours,
}: {
  cursorParam: string | null
  provider: string
  force: boolean
  staleHours: number
}): Record<string, unknown> {
  const filter: Record<string, unknown> = { type: 'video' }

  if (cursorParam) {
    filter._id = { $gt: new ObjectId(cursorParam) }
  }
  if (provider !== 'unknown' && provider !== 'all') {
    filter.provider = { $regex: escapeRegExp(provider), $options: 'i' }
  }

  if (!force) {
    const staleBefore = new Date(Date.now() - staleHours * 60 * 60 * 1000)
    filter.$or = [
      { obsoleteVideoRuntimeSuspect: true },
      { obsoleteVideoCheckedAt: { $exists: false } },
      { obsoleteVideoCheckedAt: null },
      { obsoleteVideoCheckedAt: { $lt: staleBefore } },
      { obsoleteVideoStatus: { $in: ['obsolete', 'rate-limited', 'ambiguous'] } },
    ]
  }

  return filter
}

async function runChunkScan(
  db: Db,
  url: URL,
  cursorOverride?: string | null,
): Promise<ScanResult & {
  ok: true
  mode: 'chunk'
  limit: number
  done: boolean
  nextCursor: string | null
  durationMs: number
}> {
  await ensureVideoScanIndexes(db)

  const limit = parseNumberParam(url.searchParams.get('limit'), DEFAULT_SCAN_LIMIT, 1, MAX_SCAN_LIMIT)
  const concurrency = parseNumberParam(
    url.searchParams.get('concurrency'),
    DEFAULT_SCAN_CONCURRENCY,
    1,
    MAX_SCAN_CONCURRENCY,
  )
  const timeoutMs = parseNumberParam(
    url.searchParams.get('timeoutMs'),
    DEFAULT_SCAN_TIMEOUT_MS,
    1000,
    10000,
  )
  const staleHours = parseNumberParam(
    url.searchParams.get('staleHours'),
    DEFAULT_STALE_HOURS,
    1,
    24 * 365,
  )
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
  const provider = normalizeProvider(url.searchParams.get('provider'))
  const cursorParam = cursorOverride ?? url.searchParams.get('cursor')
  const filter = buildChunkFilter({ cursorParam, provider, force, staleHours })

  const docs = await db
    .collection<VideoDoc>('items')
    .find(filter, {
      projection: {
        _id: 1,
        provider: 1,
        url: 1,
        videoId: 1,
        title: 1,
        thumb: 1,
        thumbUrl: 1,
      },
    })
    .sort({ _id: 1 })
    .limit(limit)
    .toArray()

  const startedAt = Date.now()
  const result = await scanVideoDocs(db, docs, {
    concurrency,
    retries: 0,
    timeoutMs,
    persist: true,
  })
  const lastDoc = docs[docs.length - 1]

  return {
    ok: true,
    mode: 'chunk',
    limit,
    checked: result.checked,
    errors: result.errors,
    durationMs: Date.now() - startedAt,
    done: docs.length < limit,
    nextCursor: lastDoc ? lastDoc._id.toHexString() : null,
    obsolete: result.obsolete,
    rateLimited: result.rateLimited,
    ambiguous: result.ambiguous,
    counts: result.counts,
  }
}

async function runScanStats(db: Db, url: URL) {
  await ensureVideoScanIndexes(db)

  const staleHours = parseNumberParam(
    url.searchParams.get('staleHours'),
    DEFAULT_STALE_HOURS,
    1,
    24 * 365,
  )
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
  const provider = normalizeProvider(url.searchParams.get('provider'))
  const providerFilter =
    provider !== 'unknown' && provider !== 'all'
      ? { provider: { $regex: escapeRegExp(provider), $options: 'i' } }
      : {}
  const baseFilter = { type: 'video', ...providerFilter }
  const candidateFilter = buildChunkFilter({ cursorParam: null, provider, force, staleHours })
  const [total, candidates] = await Promise.all([
    db.collection('items').countDocuments(baseFilter),
    db.collection('items').countDocuments(candidateFilter),
  ])

  return {
    ok: true,
    mode: 'stats',
    total,
    candidates,
    alreadyFresh: Math.max(0, total - candidates),
    force,
    staleHours,
    provider,
  }
}

function mergeCounts(target: ScanResult['counts'], source: ScanResult['counts']) {
  const mergeProviderCounts = (into: Record<string, number>, from: Record<string, number>) => {
    for (const [provider, value] of Object.entries(from || {})) {
      into[provider] = (into[provider] || 0) + value
    }
  }

  target.total += source.total
  target.obsolete.total += source.obsolete.total
  target.rateLimited.total += source.rateLimited.total
  target.ambiguous.total += source.ambiguous.total
  mergeProviderCounts(target.providers, source.providers)
  mergeProviderCounts(target.obsolete.providers, source.obsolete.providers)
  mergeProviderCounts(target.rateLimited.providers, source.rateLimited.providers)
  mergeProviderCounts(target.ambiguous.providers, source.ambiguous.providers)
}

function emptyScanCounts(): ScanResult['counts'] {
  return {
    total: 0,
    providers: {},
    obsolete: { total: 0, providers: {} },
    rateLimited: { total: 0, providers: {} },
    ambiguous: { total: 0, providers: {} },
  }
}

function persistedResultFromDoc(doc: VideoDoc): VideoResult {
  return {
    id: doc._id.toHexString(),
    provider: normalizeProvider(doc.provider),
    url: doc.url || '',
    videoId: doc.videoId || undefined,
    title: doc.title ?? null,
    reason: doc.obsoleteVideoReason || 'unknown',
    status: doc.obsoleteVideoHttpStatus ?? null,
  }
}

async function rebuildPersistedCounts(db: Db, scanId: string): Promise<ScanResult['counts']> {
  const rows = await db.collection('items').aggregate<{
    _id: { provider: string; status: string }
    count: number
  }>([
    { $match: { type: 'video', obsoleteVideoScanId: scanId } },
    {
      $group: {
        _id: {
          provider: { $ifNull: ['$provider', 'unknown'] },
          status: { $ifNull: ['$obsoleteVideoStatus', 'ambiguous'] },
        },
        count: { $sum: 1 },
      },
    },
  ]).toArray()
  const counts = emptyScanCounts()
  for (const row of rows) {
    const provider = normalizeProvider(row._id.provider)
    if (row._id.status === 'obsolete') {
      counts.total += row.count
      counts.providers[provider] = (counts.providers[provider] || 0) + row.count
      counts.obsolete.total += row.count
      counts.obsolete.providers[provider] = (counts.obsolete.providers[provider] || 0) + row.count
    } else if (row._id.status === 'rate-limited') {
      counts.rateLimited.total += row.count
      counts.rateLimited.providers[provider] = (counts.rateLimited.providers[provider] || 0) + row.count
    } else if (row._id.status === 'ambiguous') {
      counts.ambiguous.total += row.count
      counts.ambiguous.providers[provider] = (counts.ambiguous.providers[provider] || 0) + row.count
    }
  }
  return counts
}

async function serializePersistedJob(db: Db, job: VideoScanJob | null, busy = false) {
  if (!job) {
    return { ok: true, mode: 'job', exists: false, busy: false }
  }

  const items = db.collection<VideoDoc>('items')
  const base = { type: 'video', obsoleteVideoScanId: job.scanId }
  const [obsoleteDocs, rateLimitedDocs, ambiguousDocs] = await Promise.all([
    items.find({ ...base, obsoleteVideoStatus: 'obsolete' }).limit(300).toArray(),
    items.find({ ...base, obsoleteVideoStatus: 'rate-limited' }).limit(100).toArray(),
    items.find({ ...base, obsoleteVideoStatus: 'ambiguous' }).limit(100).toArray(),
  ])

  return {
    ok: true,
    mode: 'job',
    exists: true,
    busy,
    scanId: job.scanId,
    status: job.status,
    checked: job.checked,
    errors: job.errors,
    batches: job.batches,
    deleted: job.deleted || 0,
    expectedTotal: job.total,
    catalogTotal: job.total,
    done: job.status === 'completed',
    durationMs: Math.max(0, job.updatedAt.getTime() - job.startedAt.getTime()),
    obsolete: obsoleteDocs.map(persistedResultFromDoc),
    rateLimited: rateLimitedDocs.map(persistedResultFromDoc),
    ambiguous: ambiguousDocs.map(persistedResultFromDoc),
    counts: job.counts || emptyScanCounts(),
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
  }
}

async function startOrResumePersistedJob(db: Db) {
  const jobs = db.collection<VideoScanJob>('maintenance_jobs')
  const existing = await jobs.findOne({ _id: PERSISTED_JOB_ID })
  const now = new Date()
  const existingLeaseIsActive = Boolean(existing?.leaseUntil && existing.leaseUntil > now)
  if (existing && (existing.status === 'running' || existingLeaseIsActive)) {
    return serializePersistedJob(db, existing, existingLeaseIsActive)
  }

  const latest = await db
    .collection<VideoDoc>('items')
    .find({ type: 'video' }, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .next()
  const upperBoundId = latest?._id || null
  const total = upperBoundId
    ? await db.collection('items').countDocuments({ type: 'video', _id: { $lte: upperBoundId } })
    : 0
  const job: VideoScanJob = {
    _id: PERSISTED_JOB_ID,
    scanId: randomUUID(),
    status: total ? 'running' : 'completed',
    total,
    checked: 0,
    errors: 0,
    batches: 0,
    deleted: 0,
    cursor: null,
    upperBoundId,
    counts: emptyScanCounts(),
    startedAt: now,
    updatedAt: now,
    completedAt: total ? null : now,
    leaseToken: null,
    leaseUntil: null,
  }
  await jobs.replaceOne({ _id: PERSISTED_JOB_ID }, job, { upsert: true })
  return serializePersistedJob(db, job)
}

async function runPersistedJobStep(db: Db) {
  const jobs = db.collection<VideoScanJob>('maintenance_jobs')
  const now = new Date()
  const leaseToken = randomUUID()
  const lease = await jobs.updateOne(
    {
      _id: PERSISTED_JOB_ID,
      status: 'running',
      $or: [
        { leaseUntil: { $exists: false } },
        { leaseUntil: null },
        { leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        leaseToken,
        leaseUntil: new Date(now.getTime() + PERSISTED_SCAN_LEASE_MS),
        updatedAt: now,
      },
    },
  )

  if (!lease.modifiedCount) {
    const current = await jobs.findOne({ _id: PERSISTED_JOB_ID })
    return serializePersistedJob(db, current, current?.status === 'running')
  }

  const job = await jobs.findOne({ _id: PERSISTED_JOB_ID, leaseToken })
  if (!job) {
    return serializePersistedJob(db, await jobs.findOne({ _id: PERSISTED_JOB_ID }), true)
  }

  try {
    if (!job.upperBoundId) {
      const completedAt = new Date()
      await jobs.updateOne(
        { _id: PERSISTED_JOB_ID, leaseToken },
        {
          $set: { status: 'completed', completedAt, updatedAt: completedAt },
          $unset: { leaseToken: '', leaseUntil: '' },
        },
      )
      return serializePersistedJob(db, await jobs.findOne({ _id: PERSISTED_JOB_ID }))
    }

    const idFilter: { $gt?: ObjectId; $lte: ObjectId } = { $lte: job.upperBoundId }
    if (job.cursor) idFilter.$gt = new ObjectId(job.cursor)
    const docs = await db
      .collection<VideoDoc>('items')
      .find(
        { type: 'video', _id: idFilter },
        {
          projection: {
            _id: 1,
            provider: 1,
            url: 1,
            videoId: 1,
            title: 1,
            thumb: 1,
            thumbUrl: 1,
          },
        },
      )
      .sort({ _id: 1 })
      .limit(PERSISTED_SCAN_BATCH_SIZE)
      .toArray()

    if (!docs.length) {
      const completedAt = new Date()
      await jobs.updateOne(
        { _id: PERSISTED_JOB_ID, leaseToken },
        {
          $set: { status: 'completed', completedAt, updatedAt: completedAt },
          $unset: { leaseToken: '', leaseUntil: '' },
        },
      )
      return serializePersistedJob(db, await jobs.findOne({ _id: PERSISTED_JOB_ID }))
    }

    const result = await scanVideoDocs(db, docs, {
      concurrency: PERSISTED_SCAN_CONCURRENCY,
      retries: 0,
      timeoutMs: PERSISTED_SCAN_TIMEOUT_MS,
      persist: true,
      scanId: job.scanId,
    })
    const counts = structuredClone(job.counts || emptyScanCounts())
    mergeCounts(counts, result.counts)
    const lastId = docs[docs.length - 1]._id
    const done = docs.length < PERSISTED_SCAN_BATCH_SIZE || lastId.equals(job.upperBoundId)
    const updatedAt = new Date()
    await jobs.updateOne(
      { _id: PERSISTED_JOB_ID, leaseToken },
      {
        $set: {
          cursor: lastId.toHexString(),
          counts,
          status: done ? 'completed' : 'running',
          completedAt: done ? updatedAt : null,
          updatedAt,
        },
        $inc: {
          checked: docs.length,
          errors: result.errors,
          batches: 1,
        },
        $unset: { leaseToken: '', leaseUntil: '' },
      },
    )
    return serializePersistedJob(db, await jobs.findOne({ _id: PERSISTED_JOB_ID }))
  } catch (error) {
    await jobs.updateOne(
      { _id: PERSISTED_JOB_ID, leaseToken },
      { $unset: { leaseToken: '', leaseUntil: '' }, $set: { updatedAt: new Date() } },
    )
    throw error
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const db = await getDbSafe()
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 })
  }

  const url = req.nextUrl
  if (url.searchParams.get('mode') === 'job') {
    const job = await db.collection<VideoScanJob>('maintenance_jobs').findOne({ _id: PERSISTED_JOB_ID })
    return NextResponse.json(await serializePersistedJob(db, job), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const fullScan =
    url.searchParams.get('full') === '1' ||
    url.searchParams.get('full') === 'true' ||
    url.searchParams.get('mode') === 'full'
  const chunkScan =
    url.searchParams.get('chunk') === '1' ||
    url.searchParams.get('chunk') === 'true' ||
    url.searchParams.get('mode') === 'chunk'
  const statsScan = url.searchParams.get('mode') === 'stats'

  if (statsScan) {
    try {
      const result = await runScanStats(db, url)
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || 'Stats failed' }, { status: 500 })
    }
  }

  if (chunkScan) {
    try {
      const result = await runChunkScan(db, url)
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('ObjectId')) {
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
      }
      return NextResponse.json({ error: message || 'Scan failed' }, { status: 500 })
    }
  }

  if (fullScan) {
    let streamClosed = false
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        streamClosed = true
      },
      async start(controller) {
        const encoder = new TextEncoder()
        const enqueuePayload = (payload: Record<string, unknown>) => {
          if (streamClosed) return false
          try {
            controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'))
            return true
          } catch {
            streamClosed = true
            return false
          }
        }

        const maxBatches = parseNumberParam(
          url.searchParams.get('maxBatches'),
          DEFAULT_STREAM_BATCHES,
          1,
          MAX_STREAM_BATCHES,
        )
        const obsolete: VideoResult[] = []
        const rateLimited: VideoResult[] = []
        const ambiguous: VideoResult[] = []
        const counts: ScanResult['counts'] = {
          total: 0,
          providers: {},
          obsolete: { total: 0, providers: {} },
          rateLimited: { total: 0, providers: {} },
          ambiguous: { total: 0, providers: {} },
        }
        const startTime = Date.now()
        let checked = 0
        let errors = 0
        let cursor: string | null = url.searchParams.get('cursor')
        let done = false
        let batches = 0

        try {
          while (!streamClosed && batches < maxBatches) {
            const chunk = await runChunkScan(db, url, cursor)
            batches += 1
            checked += chunk.checked
            errors += chunk.errors
            obsolete.push(...chunk.obsolete)
            rateLimited.push(...chunk.rateLimited)
            ambiguous.push(...chunk.ambiguous)
            mergeCounts(counts, chunk.counts)
            cursor = chunk.nextCursor
            done = chunk.done || !chunk.nextCursor || chunk.checked === 0

            enqueuePayload({
              type: 'progress',
              mode: 'chunked',
              batch: batches,
              checked,
              errors,
              done,
              nextCursor: cursor,
            })

            if (done) break
          }

          if (!streamClosed) {
            enqueuePayload({
              type: 'done',
              mode: 'chunked',
              checked,
              errors,
              batches,
              done,
              nextCursor: cursor,
              durationMs: Date.now() - startTime,
              obsolete,
              rateLimited,
              ambiguous,
              counts,
            })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!streamClosed) {
            enqueuePayload({
              type: 'error',
              message,
              checked,
              errors,
            })
          }
        } finally {
          streamClosed = true
          try {
            controller.close()
          } catch {
            /* already closed */
          }
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
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(MAX_SCAN_LIMIT, Math.floor(rawLimit))) : 60
  const skip = Number.isFinite(rawSkip) ? Math.max(0, Math.floor(rawSkip)) : 0

  const docs = await db
    .collection<VideoDoc>('items')
    .find({ type: 'video' }, {
      projection: {
        _id: 1,
        provider: 1,
        url: 1,
        videoId: 1,
        title: 1,
        thumb: 1,
        thumbUrl: 1,
      },
    })
    .sort({ updatedAt: 1 })
    .skip(skip)
    .limit(limit)
    .toArray()

  const result = await scanVideoDocs(db, docs, {
    concurrency: Math.min(DEFAULT_SCAN_CONCURRENCY, limit),
    retries: 0,
    timeoutMs: DEFAULT_SCAN_TIMEOUT_MS,
    persist: true,
  })

  return NextResponse.json({
    ok: true,
    limit,
    skip,
    checked: result.checked,
    errors: result.errors,
    obsolete: result.obsolete,
    rateLimited: result.rateLimited,
    ambiguous: result.ambiguous,
    counts: result.counts,
  })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const db = await getDbSafe()
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 })
  }

  let payload: { action?: string } = {}
  try {
    payload = (await req.json()) as { action?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    if (payload.action === 'start') {
      return NextResponse.json(await startOrResumePersistedJob(db), {
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    if (payload.action === 'step') {
      return NextResponse.json(await runPersistedJobStep(db), {
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || 'Persistent scan failed' }, { status: 500 })
  }
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

  const scanId =
    payload && typeof payload === 'object' && typeof (payload as { scanId?: unknown }).scanId === 'string'
      ? (payload as { scanId: string }).scanId.trim()
      : ''

  if (scanId) {
    const jobs = db.collection<VideoScanJob>('maintenance_jobs')
    const confirmedBeforeRaw =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { confirmedBefore?: unknown }).confirmedBefore === 'string'
        ? (payload as { confirmedBefore: string }).confirmedBefore
        : ''
    const confirmedBefore = confirmedBeforeRaw ? new Date(confirmedBeforeRaw) : new Date()
    if (Number.isNaN(confirmedBefore.getTime())) {
      return NextResponse.json({ error: 'Invalid confirmation cutoff.' }, { status: 400 })
    }

    // Share the same short lease as the scanner. This lets deletion run while a
    // job is active without allowing the two operations to overwrite counts or
    // statuses at the same time.
    const now = new Date()
    const leaseToken = randomUUID()
    const lease = await jobs.updateOne(
      {
        _id: PERSISTED_JOB_ID,
        scanId,
        status: { $in: ['running', 'completed'] },
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: null },
          { leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          leaseToken,
          leaseUntil: new Date(now.getTime() + PERSISTED_SCAN_LEASE_MS),
          updatedAt: now,
        },
      },
    )

    if (!lease.modifiedCount) {
      const current = await jobs.findOne({ _id: PERSISTED_JOB_ID, scanId })
      if (!current) {
        return NextResponse.json({ error: 'This scan is no longer active.' }, { status: 409 })
      }
      return NextResponse.json(
        { error: 'A scan batch is finishing. Deletion can retry safely.', busy: true },
        { status: 409, headers: { 'Retry-After': '1' } },
      )
    }

    try {
      const candidateFilter = {
        type: 'video',
        obsoleteVideoScanId: scanId,
        obsoleteVideoStatus: 'obsolete' as const,
        obsoleteVideoCheckedAt: { $lte: confirmedBefore },
      }
      const eligibleDocs = await db
        .collection<VideoDoc>('items')
        .find(
          candidateFilter,
          {
            projection: {
              _id: 1,
              provider: 1,
              url: 1,
              videoId: 1,
              title: 1,
              thumb: 1,
              thumbUrl: 1,
            },
          },
        )
        .limit(PERSISTED_DELETE_BATCH_SIZE)
        .toArray()

      if (!eligibleDocs.length) {
        return NextResponse.json({ deleted: 0, requested: 0, eligible: 0, verified: 0, remaining: 0, done: true })
      }

      const verification = await scanVideoDocs(db, eligibleDocs, {
        concurrency: Math.min(PERSISTED_SCAN_CONCURRENCY, eligibleDocs.length),
        retries: 0,
        timeoutMs: PERSISTED_SCAN_TIMEOUT_MS,
        persist: true,
        scanId,
      })
      const verifiedIds = verification.obsolete.map((item) => new ObjectId(item.id))
      const deletion = verifiedIds.length
        ? await db.collection('items').deleteMany({
            _id: { $in: verifiedIds },
            type: 'video',
            obsoleteVideoScanId: scanId,
            obsoleteVideoStatus: 'obsolete',
          })
        : { deletedCount: 0 }
      const remaining = await db.collection('items').countDocuments(candidateFilter)
      const counts = await rebuildPersistedCounts(db, scanId)
      await jobs.updateOne(
        { _id: PERSISTED_JOB_ID, scanId, leaseToken },
        {
          $set: { counts, updatedAt: new Date() },
          $inc: { deleted: deletion.deletedCount ?? 0 },
          $unset: { leaseToken: '', leaseUntil: '' },
        },
      )

      return NextResponse.json({
        deleted: deletion.deletedCount ?? 0,
        requested: eligibleDocs.length,
        eligible: eligibleDocs.length,
        verified: verifiedIds.length,
        remaining,
        done: remaining === 0,
      })
    } finally {
      await jobs.updateOne(
        { _id: PERSISTED_JOB_ID, scanId, leaseToken },
        { $unset: { leaseToken: '', leaseUntil: '' } },
      )
    }
  }

  const ids = Array.isArray((payload as { ids?: unknown })?.ids)
    ? ((payload as { ids: unknown[] }).ids as unknown[])
    : []

  if (!ids.length) {
    return NextResponse.json({ deleted: 0, requested: 0, eligible: 0, verified: 0 })
  }

  const objectIds: ObjectId[] = []
  for (const raw of ids) {
    if (typeof raw !== 'string') continue
    try {
      objectIds.push(new ObjectId(raw))
    } catch {
      /* ignore invalid ids */
    }
  }

  if (!objectIds.length) {
    return NextResponse.json({ deleted: 0, requested: ids.length, eligible: 0, verified: 0 })
  }

  const freshAfter = new Date(Date.now() - DELETE_CONFIRMATION_MAX_AGE_HOURS * 60 * 60 * 1000)
  const eligibleDocs = await db
    .collection<VideoDoc>('items')
    .find({
      _id: { $in: objectIds },
      type: 'video',
      obsoleteVideoStatus: 'obsolete',
      obsoleteVideoCheckedAt: { $gte: freshAfter },
    }, {
      projection: {
        _id: 1,
        provider: 1,
        url: 1,
        videoId: 1,
        title: 1,
        thumb: 1,
        thumbUrl: 1,
      },
    })
    .toArray()

  if (!eligibleDocs.length) {
    return NextResponse.json({
      deleted: 0,
      requested: objectIds.length,
      eligible: 0,
      verified: 0,
      skipped: objectIds.length,
      message: 'No recently confirmed obsolete videos to delete.',
    })
  }

  const verification = await scanVideoDocs(db, eligibleDocs, {
    concurrency: Math.min(8, eligibleDocs.length),
    retries: 1,
    timeoutMs: DEFAULT_SCAN_TIMEOUT_MS,
    persist: true,
  })
  const verifiedIds = verification.obsolete.map((item) => new ObjectId(item.id))

  if (!verifiedIds.length) {
    return NextResponse.json({
      deleted: 0,
      requested: objectIds.length,
      eligible: eligibleDocs.length,
      verified: 0,
      skipped: objectIds.length,
      message: 'Deletion skipped because verification did not reconfirm obsolete videos.',
    })
  }

  const res = await db
    .collection('items')
    .deleteMany({
      _id: { $in: verifiedIds },
      type: 'video',
      obsoleteVideoStatus: 'obsolete',
    })

  return NextResponse.json({
    deleted: res.deletedCount ?? 0,
    requested: objectIds.length,
    eligible: eligibleDocs.length,
    verified: verifiedIds.length,
  })
}
