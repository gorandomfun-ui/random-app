export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId, type Db } from 'mongodb'
import { getDbSafe } from '@/lib/random/data'

type ImageDoc = {
  _id: ObjectId
  provider?: string | null
  url?: string | null
  thumb?: string | null
  thumbUrl?: string | null
  pageUrl?: string | null
  title?: string | null
  source?: { name?: string | null; url?: string | null } | string | null
  obsoleteImageCheckedAt?: Date | null
  obsoleteImageStatus?: 'ok' | 'obsolete' | 'rate-limited' | 'ambiguous' | null
  obsoleteImageSuspect?: boolean | null
}

type CheckOutcome = {
  obsolete: boolean
  reason?: string
  status?: number | null
  contentType?: string | null
  kind?: 'obsolete' | 'rate-limited' | 'ambiguous'
}

type ImageResult = {
  id: string
  provider: string
  url: string
  thumbUrl?: string
  sourceUrl?: string
  title?: string | null
  reason: string
  status: number | null
  contentType?: string | null
}

const USER_AGENT = 'RandomAppBot/1.0 (+https://random.app)'
const FULL_SCAN_CONCURRENCY = 12
const FULL_SCAN_BATCH_SIZE = 250
const PROGRESS_INTERVAL = 100
const RETRY_DELAY_MS = 250
const FAST_SCAN_CONCURRENCY = 160
const FAST_SCAN_LIMIT = 5000
const FAST_SCAN_MAX_LIMIT = 5000
const FAST_SCAN_TIMEOUT_MS = 1500
const DEFAULT_STALE_HOURS = 24 * 7
const GIPHY_BATCH_SIZE = 50
let imageScanIndexPromise: Promise<void> | null = null

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

function normalizeProvider(value?: string | null): string {
  if (!value) return 'unknown'
  return value.toLowerCase().trim() || 'unknown'
}

function getSourceUrl(doc: ImageDoc): string | undefined {
  if (typeof doc.source === 'string') return undefined
  const value = doc.source?.url
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getThumbUrl(doc: ImageDoc): string | undefined {
  const value = doc.thumb || doc.thumbUrl
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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
  const { timeoutMs = 7000, ...rest } = init
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

function isImageLikeContentType(contentType: string | null): boolean {
  if (!contentType) return true
  const normalized = contentType.toLowerCase()
  return (
    normalized.startsWith('image/') ||
    normalized.includes('application/octet-stream') ||
    normalized.includes('binary/octet-stream')
  )
}

function classifyProbe(status: number | null, contentType: string | null): CheckOutcome {
  if (status === 429) {
    return { obsolete: false, status, contentType, reason: 'rate-limited', kind: 'rate-limited' }
  }
  if (status === null) {
    return { obsolete: false, status, contentType, reason: 'network-error', kind: 'ambiguous' }
  }
  if (status === 401 || status === 403) {
    return { obsolete: false, status, contentType, reason: 'restricted', kind: 'ambiguous' }
  }
  if (status >= 500) {
    return { obsolete: false, status, contentType, reason: `server-${status}`, kind: 'ambiguous' }
  }
  if (status === 404 || status === 410 || status === 451) {
    return { obsolete: true, status, contentType, reason: `image-${status}` }
  }
  if (status >= 200 && status < 400) {
    if (isImageLikeContentType(contentType)) {
      return { obsolete: false, status, contentType }
    }
    return { obsolete: true, status, contentType, reason: `non-image-content-${contentType || 'unknown'}` }
  }
  if (status >= 400) {
    return { obsolete: true, status, contentType, reason: `image-${status}` }
  }
  return { obsolete: false, status, contentType, reason: 'ambiguous', kind: 'ambiguous' }
}

async function probeImageUrl(
  url: string,
  timeoutMs = 7000,
  fallbackMode: 'full' | 'head-unsupported-only' = 'full',
): Promise<CheckOutcome> {
  let response = await fetchWithTimeout(url, {
    method: 'HEAD',
    timeoutMs,
    headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
  })
  let status = response?.status ?? null
  let contentType = response?.headers.get('content-type') ?? null

  const shouldRetryWithGet = fallbackMode === 'full'
    ? (
        !response ||
        status === 403 ||
        status === 405 ||
        status === 501 ||
        (status !== null && status >= 500 && status < 600)
      )
    : status === 405 || status === 501
  closeResponse(response)

  if (shouldRetryWithGet) {
    response = await fetchWithTimeout(url, {
      method: 'GET',
      timeoutMs,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Range: 'bytes=0-2047',
      },
    })
    status = response?.status ?? null
    contentType = response?.headers.get('content-type') ?? null
    closeResponse(response)
  }

  return classifyProbe(status, contentType)
}

function extractGiphyIdFromUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null
  try {
    const url = new URL(rawUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    const mediaIdx = parts.indexOf('media')
    if (mediaIdx >= 0 && parts[mediaIdx + 1]) return parts[mediaIdx + 1]
    const gifsIdx = parts.indexOf('gifs')
    if (gifsIdx >= 0 && parts[gifsIdx + 1]) {
      const slug = parts[gifsIdx + 1]
      const tokens = slug.split('-').filter(Boolean)
      return tokens[tokens.length - 1] || slug
    }
    const embedIdx = parts.indexOf('embed')
    if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1]
  } catch {
    /* ignore */
  }
  return null
}

function extractGiphyId(doc: ImageDoc): string | null {
  const candidates = [
    doc.url,
    doc.thumb,
    doc.thumbUrl,
    doc.pageUrl,
    getSourceUrl(doc),
  ]
  for (const candidate of candidates) {
    const id = extractGiphyIdFromUrl(candidate)
    if (id) return id
  }
  return null
}

async function checkGiphyApi(doc: ImageDoc, timeoutMs = 6000): Promise<CheckOutcome | null> {
  const key = (process.env.GIPHY_API_KEY || '').trim()
  const id = extractGiphyId(doc)
  if (!key || !id) return null

  const response = await fetchWithTimeout(
    `https://api.giphy.com/v1/gifs/${encodeURIComponent(id)}?api_key=${encodeURIComponent(key)}`,
    { timeoutMs },
  )
  const status = response?.status ?? null
  let payload: unknown
  try {
    payload = response ? await response.json() : null
  } catch {
    payload = null
  } finally {
    closeResponse(response)
  }

  if (status === 429) return { obsolete: false, status, reason: 'rate-limited', kind: 'rate-limited' }
  if (status === null) return { obsolete: false, status, reason: 'giphy-api-network-error', kind: 'ambiguous' }
  if (status === 401 || status === 403) return { obsolete: false, status, reason: 'giphy-api-restricted', kind: 'ambiguous' }
  if (status >= 500) return { obsolete: false, status, reason: `giphy-api-${status}`, kind: 'ambiguous' }
  if (status === 404 || status === 410) return { obsolete: true, status, reason: `giphy-api-${status}` }
  if (status >= 400) return { obsolete: true, status, reason: `giphy-api-${status}` }

  const data = payload && typeof payload === 'object'
    ? (payload as { data?: unknown }).data
    : null
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return { obsolete: true, status, reason: 'giphy-api-empty' }
  }
  if (typeof data === 'object' && Object.keys(data as Record<string, unknown>).length === 0) {
    return { obsolete: true, status, reason: 'giphy-api-empty' }
  }
  return { obsolete: false, status }
}

function classifyGiphyApiFailure(status: number | null): CheckOutcome {
  if (status === 429) return { obsolete: false, status, reason: 'rate-limited', kind: 'rate-limited' }
  if (status === null) return { obsolete: false, status, reason: 'giphy-api-network-error', kind: 'ambiguous' }
  if (status === 401 || status === 403) return { obsolete: false, status, reason: 'giphy-api-restricted', kind: 'ambiguous' }
  if (status >= 500) return { obsolete: false, status, reason: `giphy-api-${status}`, kind: 'ambiguous' }
  if (status === 404 || status === 410) return { obsolete: true, status, reason: `giphy-api-${status}` }
  if (status >= 400) return { obsolete: true, status, reason: `giphy-api-${status}` }
  return { obsolete: false, status }
}

async function checkGiphyApiBatch(docs: ImageDoc[], timeoutMs: number): Promise<Map<string, CheckOutcome>> {
  const results = new Map<string, CheckOutcome>()
  const key = (process.env.GIPHY_API_KEY || '').trim()
  if (!key) return results

  const byGiphyId = new Map<string, ImageDoc[]>()
  for (const doc of docs) {
    if (!normalizeProvider(doc.provider).includes('giphy')) continue
    const id = extractGiphyId(doc)
    if (!id) continue
    const bucket = byGiphyId.get(id) || []
    bucket.push(doc)
    byGiphyId.set(id, bucket)
  }

  const ids = Array.from(byGiphyId.keys())
  for (let i = 0; i < ids.length; i += GIPHY_BATCH_SIZE) {
    const chunk = ids.slice(i, i + GIPHY_BATCH_SIZE)
    const response = await fetchWithTimeout(
      `https://api.giphy.com/v1/gifs?api_key=${encodeURIComponent(key)}&ids=${encodeURIComponent(chunk.join(','))}`,
      { timeoutMs },
    )
    const status = response?.status ?? null
    let payload: unknown
    try {
      payload = response ? await response.json() : null
    } catch {
      payload = null
    } finally {
      closeResponse(response)
    }

    if (status !== null && status >= 200 && status < 300) {
      const data = payload && typeof payload === 'object'
        ? (payload as { data?: unknown }).data
        : null
      const returnedIds = new Set<string>()
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (!entry || typeof entry !== 'object') continue
          const returnedId = (entry as { id?: unknown }).id
          if (typeof returnedId === 'string' && returnedId) {
            returnedIds.add(returnedId)
            returnedIds.add(returnedId.toLowerCase())
          }
        }
      }

      for (const id of chunk) {
        const exists = returnedIds.has(id) || returnedIds.has(id.toLowerCase())
        const outcome: CheckOutcome = exists
          ? { obsolete: false, status }
          : { obsolete: true, status, reason: 'giphy-api-missing' }
        for (const doc of byGiphyId.get(id) || []) {
          results.set(doc._id.toHexString(), outcome)
        }
      }
      continue
    }

    const failure = classifyGiphyApiFailure(status)
    for (const id of chunk) {
      for (const doc of byGiphyId.get(id) || []) {
        results.set(doc._id.toHexString(), failure)
      }
    }
  }

  return results
}

async function checkImage(
  doc: ImageDoc,
  {
    timeoutMs = 7000,
    preferProviderApi = true,
    fastProbe = false,
  }: { timeoutMs?: number; preferProviderApi?: boolean; fastProbe?: boolean } = {},
): Promise<CheckOutcome> {
  const provider = normalizeProvider(doc.provider)
  const url = doc.url?.trim() || ''
  if (!url) return { obsolete: true, reason: 'missing-url' }

  if (provider.includes('giphy')) {
    const apiResult = preferProviderApi ? await checkGiphyApi(doc, timeoutMs) : null
    if (apiResult) return apiResult
  }

  return probeImageUrl(url, timeoutMs, fastProbe ? 'head-unsupported-only' : 'full')
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

async function checkImageWithRetry(
  doc: ImageDoc,
  retries = 1,
  options: { timeoutMs?: number; preferProviderApi?: boolean; fastProbe?: boolean } = {},
): Promise<CheckOutcome> {
  let attempt = 0
  let result = await checkImage(doc, options)
  while (attempt < retries && isAmbiguousOutcome(result)) {
    attempt += 1
    await delay(RETRY_DELAY_MS)
    result = await checkImage(doc, options)
  }
  return result
}

function buildResult(doc: ImageDoc, outcome: CheckOutcome): ImageResult {
  return {
    id: doc._id.toHexString(),
    provider: normalizeProvider(doc.provider),
    url: doc.url || '',
    thumbUrl: getThumbUrl(doc),
    sourceUrl: getSourceUrl(doc) || doc.pageUrl || undefined,
    title: doc.title ?? null,
    reason: outcome.reason || 'unknown',
    status: outcome.status ?? null,
    contentType: outcome.contentType ?? null,
  }
}

function pushCount(counts: Record<string, number>, provider: string) {
  counts[provider] = (counts[provider] || 0) + 1
}

type ScanResult = {
  checked: number
  errors: number
  obsolete: ImageResult[]
  rateLimited: ImageResult[]
  ambiguous: ImageResult[]
  counts: {
    total: number
    providers: Record<string, number>
    obsolete: { total: number; providers: Record<string, number> }
    rateLimited: { total: number; providers: Record<string, number> }
    ambiguous: { total: number; providers: Record<string, number> }
  }
}

type PersistedOutcome = {
  doc: ImageDoc
  outcome: CheckOutcome
}

function getOutcomeStatus(outcome: CheckOutcome): 'ok' | 'obsolete' | 'rate-limited' | 'ambiguous' {
  if (outcome.kind === 'rate-limited') return 'rate-limited'
  if (outcome.kind === 'ambiguous') return 'ambiguous'
  if (outcome.obsolete) return 'obsolete'
  return 'ok'
}

function addScanOutcome(
  doc: ImageDoc,
  outcome: CheckOutcome,
  target: {
    obsolete: ImageResult[]
    rateLimited: ImageResult[]
    ambiguous: ImageResult[]
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

async function persistScanOutcomes(db: Db, outcomes: PersistedOutcome[]) {
  if (!outcomes.length) return
  const checkedAt = new Date()
  const operations = outcomes.map(({ doc, outcome }) => {
    const status = getOutcomeStatus(outcome)
    const update: Record<string, unknown> = {
      $set: {
        obsoleteImageCheckedAt: checkedAt,
        obsoleteImageStatus: status,
        obsoleteImageReason: outcome.reason || null,
        obsoleteImageHttpStatus: outcome.status ?? null,
        obsoleteImageContentType: outcome.contentType ?? null,
      },
    }
    if (status === 'ok') {
      update.$unset = {
        obsoleteImageSuspect: '',
        obsoleteImageSuspectAt: '',
        obsoleteImageSuspectReason: '',
        obsoleteImageLastErrorUrl: '',
        obsoleteImageSuspectProvider: '',
        obsoleteImageSuspectSourceUrl: '',
      }
    }

    return {
      updateOne: {
        filter: { _id: doc._id, type: 'image' },
        update,
      },
    }
  })

  try {
    await db.collection('items').bulkWrite(operations, { ordered: false })
  } catch {
    /* The scan result is still useful if cache writes fail. */
  }
}

function getChunkScope(value: string | null): 'suspect' | 'normal' {
  return value === 'suspect' ? 'suspect' : 'normal'
}

function buildChunkFilter({
  cursorParam,
  provider,
  force,
  scope,
  staleHours,
}: {
  cursorParam: string | null
  provider: string
  force: boolean
  scope: 'suspect' | 'normal'
  staleHours: number
}): Record<string, unknown> {
  const filter: Record<string, unknown> = { type: 'image' }

  if (cursorParam) {
    filter._id = { $gt: new ObjectId(cursorParam) }
  }
  if (provider !== 'unknown' && provider !== 'all') {
    filter.provider = provider
  }

  if (scope === 'suspect') {
    filter.obsoleteImageSuspect = true
    return filter
  }

  filter.obsoleteImageSuspect = { $ne: true }
  if (!force) {
    const staleBefore = new Date(Date.now() - staleHours * 60 * 60 * 1000)
    filter.$or = [
      { obsoleteImageCheckedAt: { $exists: false } },
      { obsoleteImageCheckedAt: null },
      { obsoleteImageCheckedAt: { $lt: staleBefore } },
      { obsoleteImageStatus: { $in: ['obsolete', 'rate-limited', 'ambiguous'] } },
    ]
  }

  return filter
}

function ensureImageScanIndexes(db: Db) {
  if (!imageScanIndexPromise) {
    imageScanIndexPromise = Promise.all([
      db.collection('items').createIndex(
        { type: 1, obsoleteImageSuspect: 1, _id: 1 },
        {
          name: 'idx_image_obsolete_suspects',
          partialFilterExpression: { type: 'image', obsoleteImageSuspect: true },
        },
      ),
      db.collection('items').createIndex(
        { type: 1, _id: 1 },
        { name: 'idx_image_scan_by_type_id' },
      ),
    ])
      .then(() => undefined)
      .catch((error) => {
        imageScanIndexPromise = null
        console.warn('[tools/images/obsolete] Failed to ensure indexes', error)
      })
  }
  return imageScanIndexPromise
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

async function scanImageDocs(
  db: Db,
  docs: ImageDoc[],
  {
    concurrency = FAST_SCAN_CONCURRENCY,
    retries = 0,
    timeoutMs = FAST_SCAN_TIMEOUT_MS,
    useGiphyBatch = true,
    fastProbe = true,
    persist = true,
  }: {
    concurrency?: number
    retries?: number
    timeoutMs?: number
    useGiphyBatch?: boolean
    fastProbe?: boolean
    persist?: boolean
  } = {},
): Promise<ScanResult> {
  const obsolete: ImageResult[] = []
  const rateLimited: ImageResult[] = []
  const ambiguous: ImageResult[] = []
  const obsoleteCounts: Record<string, number> = {}
  const rateLimitedCounts: Record<string, number> = {}
  const ambiguousCounts: Record<string, number> = {}
  const outcomes: PersistedOutcome[] = []
  let errors = 0

  const batchResults = useGiphyBatch ? await checkGiphyApiBatch(docs, timeoutMs) : new Map<string, CheckOutcome>()
  const remaining: ImageDoc[] = []

  for (const doc of docs) {
    const outcome = batchResults.get(doc._id.toHexString())
    if (!outcome) {
      remaining.push(doc)
      continue
    }
    outcomes.push({ doc, outcome })
    addScanOutcome(doc, outcome, {
      obsolete,
      rateLimited,
      ambiguous,
      obsoleteCounts,
      rateLimitedCounts,
      ambiguousCounts,
    })
  }

  await runWithConcurrency(remaining, concurrency, async (doc) => {
    try {
      const outcome = await checkImageWithRetry(doc, retries, {
        timeoutMs,
        preferProviderApi: !useGiphyBatch,
        fastProbe,
      })
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
    await persistScanOutcomes(db, outcomes)
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
  const chunkScan =
    url.searchParams.get('chunk') === '1' ||
    url.searchParams.get('chunk') === 'true' ||
    url.searchParams.get('mode') === 'chunk'

  if (chunkScan) {
    await ensureImageScanIndexes(db)

    const rawLimit = Number(url.searchParams.get('limit') || String(FAST_SCAN_LIMIT))
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(FAST_SCAN_MAX_LIMIT, Math.floor(rawLimit)))
      : FAST_SCAN_LIMIT
    const rawConcurrency = Number(url.searchParams.get('concurrency') || String(FAST_SCAN_CONCURRENCY))
    const concurrency = Number.isFinite(rawConcurrency)
      ? Math.max(1, Math.min(200, Math.floor(rawConcurrency)))
      : FAST_SCAN_CONCURRENCY
    const rawTimeout = Number(url.searchParams.get('timeoutMs') || String(FAST_SCAN_TIMEOUT_MS))
    const timeoutMs = Number.isFinite(rawTimeout)
      ? Math.max(1000, Math.min(10000, Math.floor(rawTimeout)))
      : FAST_SCAN_TIMEOUT_MS
    const rawStaleHours = Number(url.searchParams.get('staleHours') || String(DEFAULT_STALE_HOURS))
    const staleHours = Number.isFinite(rawStaleHours)
      ? Math.max(1, Math.min(24 * 365, Math.floor(rawStaleHours)))
      : DEFAULT_STALE_HOURS
    const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
    const provider = normalizeProvider(url.searchParams.get('provider'))
    const cursorParam = url.searchParams.get('cursor')
    const scope = getChunkScope(url.searchParams.get('scope'))
    let filter: Record<string, unknown>
    try {
      filter = buildChunkFilter({ cursorParam, provider, force, scope, staleHours })
    } catch {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
    }

    const docs = await db
      .collection<ImageDoc>('items')
      .find(filter, {
        projection: {
          _id: 1,
          provider: 1,
          url: 1,
          thumb: 1,
          thumbUrl: 1,
          pageUrl: 1,
          title: 1,
          source: 1,
        },
      })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray()

    const startedAt = Date.now()
    const result = await scanImageDocs(db, docs, {
      concurrency,
      retries: 0,
      timeoutMs,
      useGiphyBatch: true,
      persist: true,
    })
    const lastDoc = docs[docs.length - 1]

    return NextResponse.json({
      ok: true,
      mode: 'chunk',
      scope,
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
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
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
        const obsoleteCounts: Record<string, number> = {}
        const rateLimitedCounts: Record<string, number> = {}
        const ambiguousCounts: Record<string, number> = {}
        const obsolete: ImageResult[] = []
        const rateLimited: ImageResult[] = []
        const ambiguous: ImageResult[] = []
        const startTime = Date.now()
        let checked = 0
        let errors = 0

        const cursor = db
          .collection<ImageDoc>('items')
          .find({ type: 'image' })
          .sort({ _id: 1 })
          .batchSize(FULL_SCAN_BATCH_SIZE)

        const pool: Promise<void>[] = []

        const processDoc = async (doc: ImageDoc) => {
          if (streamClosed) return
          const provider = normalizeProvider(doc.provider)
          try {
            const result = await checkImageWithRetry(doc, 1)
            if (streamClosed) return
            if (result.status === 429 || result.kind === 'rate-limited') {
              pushCount(rateLimitedCounts, provider)
              rateLimited.push(buildResult(doc, result))
            } else if (result.kind === 'ambiguous') {
              pushCount(ambiguousCounts, provider)
              ambiguous.push(buildResult(doc, result))
            } else if (result.obsolete) {
              pushCount(obsoleteCounts, provider)
              obsolete.push(buildResult(doc, result))
            }
          } catch {
            errors += 1
          } finally {
            checked += 1
            if (checked % PROGRESS_INTERVAL === 0) {
              enqueuePayload({ type: 'progress', checked, errors })
            }
          }
        }

        try {
          for await (const doc of cursor) {
            if (streamClosed) break
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
          if (streamClosed) return

          if (checked % PROGRESS_INTERVAL !== 0) {
            enqueuePayload({ type: 'progress', checked, errors })
          }

          enqueuePayload({
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
              obsolete: { total: obsolete.length, providers: obsoleteCounts },
              rateLimited: { total: rateLimited.length, providers: rateLimitedCounts },
              ambiguous: { total: ambiguous.length, providers: ambiguousCounts },
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          enqueuePayload({ type: 'error', message, checked, errors })
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
  const MAX_LIMIT = 2000
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(rawLimit))) : 60
  const skip = Number.isFinite(rawSkip) ? Math.max(0, Math.floor(rawSkip)) : 0

  const docs = await db
    .collection<ImageDoc>('items')
    .find({ type: 'image' })
    .sort({ updatedAt: 1 })
    .skip(skip)
    .limit(limit)
    .toArray()

  const obsolete: ImageResult[] = []
  const rateLimited: ImageResult[] = []
  const ambiguous: ImageResult[] = []
  const obsoleteCounts: Record<string, number> = {}
  const rateLimitedCounts: Record<string, number> = {}
  const ambiguousCounts: Record<string, number> = {}

  for (const doc of docs) {
    const provider = normalizeProvider(doc.provider)
    const result = await checkImage(doc)
    if (result.status === 429 || result.kind === 'rate-limited') {
      pushCount(rateLimitedCounts, provider)
      rateLimited.push(buildResult(doc, result))
    } else if (result.kind === 'ambiguous') {
      pushCount(ambiguousCounts, provider)
      ambiguous.push(buildResult(doc, result))
    } else if (result.obsolete) {
      pushCount(obsoleteCounts, provider)
      obsolete.push(buildResult(doc, result))
    }
  }

  return NextResponse.json({
    ok: true,
    limit,
    skip,
    checked: docs.length,
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

  if (!ids.length) return NextResponse.json({ deleted: 0 })

  const objectIds: ObjectId[] = []
  for (const raw of ids) {
    if (typeof raw !== 'string') continue
    try {
      objectIds.push(new ObjectId(raw))
    } catch {
      /* ignore */
    }
  }

  if (!objectIds.length) return NextResponse.json({ deleted: 0 })

  const res = await db
    .collection('items')
    .deleteMany({ _id: { $in: objectIds }, type: 'image' })

  return NextResponse.json({ deleted: res.deletedCount ?? 0 })
}
