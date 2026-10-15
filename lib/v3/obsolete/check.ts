/**
 * Whether a stored video still exists, asked of the platforms the cheap way:
 * Dailymotion a hundred at a time, YouTube fifty at a time, and a video only
 * condemned on the platform's own word.
 *
 * Dailymotion. Its list of videos by ids answers a hundred in one call and
 * leaves out what is gone — deleted, removed for the terms of use, made
 * private: measured on 8 October, 300 videos found dead earlier were all
 * missing from it, and of 1,000 found alive a few days before, the 62
 * missing were, but one, dead by the player's own message. A missing video
 * is then asked of the player, which says why; only an explicit "deleted",
 * "removed" or "private" counts (isExplicitDailymotionUnavailableMessage),
 * anything else — an error, a password, a country — is "to see again",
 * never deleted. The single-video question asked before, `fields=availability`,
 * had been answered "unrecognized value" for every video for months: it
 * decided nothing and doubled the calls.
 *
 * YouTube. `videos.list` by fifty (one unit): a video it does not return is
 * gone; private, rejected or not embeddable too. A refused call (quota,
 * error) condemns nothing.
 *
 * Used by the owner's page (app/api/tools/videos/obsolete) and the nightly
 * check (lib/v3/ingest/lines/obsolete.ts).
 */

export type CheckOutcome = {
  obsolete: boolean
  reason?: string
  status?: number | null
  kind?: 'obsolete' | 'rate-limited' | 'ambiguous'
}

export type CheckableVideo = { _id: { toHexString(): string }; provider?: string | null; url?: string | null; videoId?: string | null }

export const USER_AGENT = 'RandomAppBot/1.0 (+https://random.app)'
export const DEFAULT_TIMEOUT_MS = 4000
/** Ids in one Dailymotion list call: its maximum. */
export const DAILYMOTION_LOT = 100
/** Ids in one YouTube `videos.list` call: one unit. */
export const YOUTUBE_LOT = 50

type Request = typeof fetch

export function normalizeProvider(value?: string | null): string {
  if (!value) return 'unknown'
  return value.toLowerCase().trim() || 'unknown'
}

export function sanitizeProviderId(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(':')
  return parts[parts.length - 1]
}

export function extractYouTubeId(rawUrl: string): string | null {
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

export function extractDailymotionId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.hostname === 'dai.ly') return url.pathname.split('/').filter(Boolean)[0] || null
    if (url.hostname.includes('dailymotion.com')) {
      const parts = url.pathname.split('/').filter(Boolean)
      const idx = parts.indexOf('video')
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].split('_')[0]
      return parts.pop() || null
    }
  } catch {}
  return null
}

export const youtubeIdOf = (doc: CheckableVideo): string => sanitizeProviderId(doc.videoId?.trim() || extractYouTubeId(doc.url?.trim() || '') || '')
export const dailymotionIdOf = (doc: CheckableVideo): string => sanitizeProviderId(doc.videoId?.trim() || extractDailymotionId(doc.url?.trim() || '') || '')

export function closeResponse(response: Response | null): void {
  try {
    response?.body?.cancel()?.catch(() => undefined)
  } catch {
    /* ignore */
  }
}

/** A request that gives up after `timeoutMs`; null on a network error or a timeout. */
export async function fetchWithTimeout(url: string, { timeoutMs = DEFAULT_TIMEOUT_MS, request = fetch, init = {} }: { timeoutMs?: number; request?: Request; init?: RequestInit } = {}): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await request(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers as Record<string, string> | undefined) }, redirect: init.redirect ?? 'follow', signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function classifyHttpStatus(status: number | null, reasonPrefix: string): CheckOutcome {
  if (status === 429) return { obsolete: false, status, reason: 'rate-limited', kind: 'rate-limited' }
  if (status === null) return { obsolete: false, status: null, reason: 'network-error', kind: 'ambiguous' }
  if (status === 404 || status === 410 || status === 451) return { obsolete: true, status, reason: `${reasonPrefix}-${status}` }
  if (status >= 200 && status < 400) return { obsolete: false, status }
  if (status === 401 || status === 403) return { obsolete: false, status, reason: 'restricted', kind: 'ambiguous' }
  return { obsolete: false, status, reason: `${reasonPrefix}-${status}`, kind: 'ambiguous' }
}

function normalizeReasonText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Dailymotion's own words for a video that is gone, in the languages its player answers in. Anything else is not a death. */
export function isExplicitDailymotionUnavailableMessage(message?: string): boolean {
  if (!message) return false
  const normalized = normalizeReasonText(message)
  if (!normalized) return false
  const unavailableFragments = [
    'no longer available', 'has been deleted', 'was deleted', 'has been removed', 'was removed', 'removed because', 'removed due to',
    'terms violation', 'terms of use', 'made private', 'is private', 'private by', 'video is private',
    'cette video n est plus disponible', 'cette video a ete supprimee', 'cette video a ete retiree', 'droits d auteur', 'conditions d utilisation',
    'deze video is niet meer beschikbaar', 'niet meer beschikbaar', 'is verwijderd', 'prive is gemaakt', 'inbreuk op de gebruiksvoorwaarden',
    'este video ya no esta disponible', 'ha sido eliminado', 'se ha eliminado',
    'questo video non e piu disponibile', 'e stato rimosso',
    'dieses video ist nicht mehr verfugbar', 'wurde entfernt',
    'dm002', 'dm005', 'dm010', 'dm020',
  ]
  return unavailableFragments.some((fragment) => normalized.includes(fragment))
}

export type PlayerVerdict = { status: number | null; unavailable: boolean; ambiguous?: boolean; reason?: string }

/** What Dailymotion's player says of one video: the only voice that condemns one. */
export async function dailymotionPlayerVerdict(id: string, { timeoutMs = DEFAULT_TIMEOUT_MS, request = fetch }: { timeoutMs?: number; request?: Request } = {}): Promise<PlayerVerdict> {
  const response = await fetchWithTimeout(`https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(id)}`, { timeoutMs, request })
  if (!response) return { status: null, unavailable: false, ambiguous: true, reason: 'network-error' }
  const status = response.status ?? null
  let payload: unknown = null
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
      const entry = asAny.errors[0]
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object') {
        const typed = entry as Record<string, unknown>
        if (typeof typed.message === 'string') return typed.message
        if (typeof typed.code === 'string') return typed.code
      }
    }
    if (typeof asAny.message === 'string') return asAny.message
    return undefined
  }
  const errorMessage = extractError()
  if (status === 404 || status === 410) return { status, unavailable: true, reason: `dailymotion-${status}` }
  if (status === 429) return { status, unavailable: false, ambiguous: true, reason: 'rate-limited' }
  if (status === 401 || status === 403 || (status !== null && status >= 500)) return { status, unavailable: false, ambiguous: true, reason: `dailymotion-${status}` }
  if (errorMessage) {
    const reason = `dailymotion-metadata-${errorMessage.replace(/\s+/g, '-').toLowerCase()}`
    if (isExplicitDailymotionUnavailableMessage(errorMessage)) return { status, unavailable: true, reason }
    return { status, unavailable: false, ambiguous: true, reason }
  }
  if (status !== null && status >= 400) return { status, unavailable: false, ambiguous: true, reason: `dailymotion-${status}` }
  return { status, unavailable: false }
}

/** The player's verdict as a check outcome. */
export function outcomeOfPlayer(verdict: PlayerVerdict): CheckOutcome {
  if (verdict.reason === 'rate-limited') return { obsolete: false, status: verdict.status, reason: 'rate-limited', kind: 'rate-limited' }
  if (verdict.unavailable) return { obsolete: true, status: verdict.status, reason: verdict.reason || 'dailymotion-player-error' }
  if (verdict.ambiguous) return { obsolete: false, status: verdict.status, reason: verdict.reason || 'dailymotion-ambiguous', kind: 'ambiguous' }
  return { obsolete: false, status: verdict.status }
}

/** The ids among these that Dailymotion still lists (a hundred per call); null when it did not answer. */
export async function dailymotionPresent(ids: readonly string[], { timeoutMs = DEFAULT_TIMEOUT_MS, request = fetch }: { timeoutMs?: number; request?: Request } = {}): Promise<Set<string> | null> {
  const wanted = [...new Set(ids)].slice(0, DAILYMOTION_LOT)
  if (!wanted.length) return new Set()
  const params = new URLSearchParams({ ids: wanted.join(','), fields: 'id', limit: String(DAILYMOTION_LOT) })
  const response = await fetchWithTimeout(`https://api.dailymotion.com/videos?${params}`, { timeoutMs, request })
  if (!response || !response.ok) { closeResponse(response); return null }
  try {
    const payload = (await response.json()) as { list?: Array<{ id?: string }> } | null
    if (!payload || !Array.isArray(payload.list)) return null
    return new Set(payload.list.map((row) => String(row.id ?? '')).filter(Boolean))
  } catch {
    return null
  }
}

async function eachWithConcurrency<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  }))
}

/**
 * Dailymotion videos, a hundred per call: what the list still holds is alive; what it leaves out is asked of the
 * player, which alone condemns. A list call that fails sends its hundred to the player one by one, as before.
 */
export async function checkDailymotionVideos(docs: readonly CheckableVideo[], { timeoutMs = DEFAULT_TIMEOUT_MS, request = fetch, concurrency = 8 }: { timeoutMs?: number; request?: Request; concurrency?: number } = {}): Promise<Map<string, CheckOutcome>> {
  const outcomes = new Map<string, CheckOutcome>()
  const withIds = docs.map((doc) => ({ doc, id: dailymotionIdOf(doc) }))
  for (const { doc, id } of withIds) if (!id) outcomes.set(doc._id.toHexString(), { obsolete: false, reason: 'missing-video-id', kind: 'ambiguous' })
  const candidates = withIds.filter((entry) => entry.id)
  const toPlayer: typeof candidates = []
  for (let at = 0; at < candidates.length; at += DAILYMOTION_LOT) {
    const lot = candidates.slice(at, at + DAILYMOTION_LOT)
    const present = await dailymotionPresent(lot.map((entry) => entry.id), { timeoutMs: timeoutMs * 2, request })
    if (!present) { toPlayer.push(...lot); continue }
    for (const entry of lot) {
      if (present.has(entry.id)) outcomes.set(entry.doc._id.toHexString(), { obsolete: false, status: 200 })
      else toPlayer.push(entry)
    }
  }
  await eachWithConcurrency(toPlayer, concurrency, async (entry) => {
    outcomes.set(entry.doc._id.toHexString(), outcomeOfPlayer(await dailymotionPlayerVerdict(entry.id, { timeoutMs, request })))
  })
  return outcomes
}

/**
 * YouTube videos, fifty per `videos.list` call. `reserve` books a unit before each call (the nightly check's own
 * bucket); when it refuses, the remaining videos get no outcome and wait for another night.
 */
export async function checkYouTubeVideos(docs: readonly CheckableVideo[], { key, timeoutMs = DEFAULT_TIMEOUT_MS, request = fetch, reserve }: { key: string; timeoutMs?: number; request?: Request; reserve?: (units: number) => Promise<boolean> }): Promise<{ outcomes: Map<string, CheckOutcome>; units: number; stopped: boolean }> {
  const outcomes = new Map<string, CheckOutcome>()
  let units = 0
  if (!key) return { outcomes, units, stopped: false }
  const candidates = docs.map((doc) => ({ doc, id: youtubeIdOf(doc) })).filter((candidate) => candidate.id)
  for (let offset = 0; offset < candidates.length; offset += YOUTUBE_LOT) {
    if (reserve && !(await reserve(1))) return { outcomes, units, stopped: true }
    units += 1
    const chunk = candidates.slice(offset, offset + YOUTUBE_LOT)
    const params = new URLSearchParams({ key, part: 'status', id: chunk.map((candidate) => candidate.id).join(',') })
    const response = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/videos?${params}`, { timeoutMs, request })
    const status = response?.status ?? null
    if (!response || !response.ok) {
      // A refusal (quota, key, error) condemns nothing.
      const outcome = classifyHttpStatus(status, 'youtube-api')
      const safe = outcome.obsolete ? { obsolete: false, status, reason: outcome.reason, kind: 'ambiguous' as const } : outcome
      for (const candidate of chunk) outcomes.set(candidate.doc._id.toHexString(), safe)
      closeResponse(response)
      continue
    }
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    } finally {
      closeResponse(response)
    }
    const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: Array<{ id?: string; status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string } }> }).items
      : null
    if (!items) {
      for (const candidate of chunk) outcomes.set(candidate.doc._id.toHexString(), { obsolete: false, status, reason: 'youtube-api-invalid-response', kind: 'ambiguous' })
      continue
    }
    const returned = new Map(items.filter((item) => item.id).map((item) => [item.id as string, item]))
    for (const candidate of chunk) {
      const item = returned.get(candidate.id)
      const id = candidate.doc._id.toHexString()
      if (!item) { outcomes.set(id, { obsolete: true, status, reason: 'youtube-api-not-returned' }); continue }
      const uploadStatus = item.status?.uploadStatus || ''
      const privacyStatus = item.status?.privacyStatus || ''
      if (['deleted', 'failed', 'rejected'].includes(uploadStatus)) outcomes.set(id, { obsolete: true, status, reason: `youtube-upload-${uploadStatus}` })
      else if (privacyStatus && privacyStatus !== 'public') outcomes.set(id, { obsolete: true, status, reason: `youtube-privacy-${privacyStatus}` })
      else if (item.status?.embeddable === false) outcomes.set(id, { obsolete: true, status, reason: 'youtube-not-embeddable' })
      else outcomes.set(id, { obsolete: false, status })
    }
  }
  return { outcomes, units, stopped: false }
}

/** Any other provider (stock clips): the address answers or not. */
export async function checkByAddress(doc: CheckableVideo, { timeoutMs = DEFAULT_TIMEOUT_MS, request = fetch }: { timeoutMs?: number; request?: Request } = {}): Promise<CheckOutcome> {
  const url = doc.url?.trim() || ''
  const fallbackId = doc.videoId ? sanitizeProviderId(doc.videoId) : ''
  const target = url || (fallbackId ? `https://youtu.be/${fallbackId}` : '')
  if (!target) return { obsolete: false, reason: 'missing-url', kind: 'ambiguous' }
  const head = await fetchWithTimeout(target, { timeoutMs, request, init: { method: 'HEAD' } })
  let status = head?.status ?? null
  closeResponse(head)
  if (status === null || status === 405) {
    const get = await fetchWithTimeout(target, { timeoutMs, request, init: { method: 'GET' } })
    status = get?.status ?? null
    closeResponse(get)
  }
  return classifyHttpStatus(status, 'status')
}

/** What a check outcome writes as the video's status. */
export function statusOf(outcome: CheckOutcome): 'ok' | 'obsolete' | 'rate-limited' | 'ambiguous' {
  if (outcome.kind === 'rate-limited') return 'rate-limited'
  if (outcome.kind === 'ambiguous') return 'ambiguous'
  if (outcome.obsolete) return 'obsolete'
  return 'ok'
}
