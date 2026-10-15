/**
 * Whether a picture still lives at its source, asked of the source itself (14 October, for the night's check and the owner's
 * deletion button): a HEAD for every picture, Giphy's included — its removed GIFs answer 404 at their address (14 of 15
 * found missing by its API, 14 October), and its API, which limits us, left 10,439 "rate-limited" in June — then a short GET
 * when the host refuses a HEAD. The same verdicts as the page's tool (app/api/tools/images/obsolete): only a 404, 410, 451 or
 * another 4xx, or a page that is not a picture, condemns; a 429, 401, 403, a 5xx or no answer is "to see again".
 */

import type { Document, ObjectId } from 'mongodb'

export type ImageOutcome = { obsolete: boolean; reason?: string; status?: number | null; contentType?: string | null; kind?: 'rate-limited' | 'ambiguous' }
export type ImageStatus = 'ok' | 'obsolete' | 'rate-limited' | 'ambiguous'

const USER_AGENT = 'RandomAppBot/1.0 (+https://gorandom.fun)'
const ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

function isImageLike(contentType: string | null): boolean {
  if (!contentType) return true
  const type = contentType.toLowerCase()
  return type.startsWith('image/') || type.includes('application/octet-stream') || type.includes('binary/octet-stream')
}

export function classifyProbe(status: number | null, contentType: string | null): ImageOutcome {
  if (status === 429) return { obsolete: false, status, contentType, reason: 'rate-limited', kind: 'rate-limited' }
  if (status === null) return { obsolete: false, status, contentType, reason: 'network-error', kind: 'ambiguous' }
  if (status === 401 || status === 403) return { obsolete: false, status, contentType, reason: 'restricted', kind: 'ambiguous' }
  if (status >= 500) return { obsolete: false, status, contentType, reason: `server-${status}`, kind: 'ambiguous' }
  if (status === 404 || status === 410 || status === 451) return { obsolete: true, status, contentType, reason: `image-${status}` }
  if (status >= 200 && status < 400) return isImageLike(contentType) ? { obsolete: false, status, contentType } : { obsolete: true, status, contentType, reason: `non-image-content-${contentType || 'unknown'}` }
  if (status >= 400) return { obsolete: true, status, contentType, reason: `image-${status}` }
  return { obsolete: false, status, contentType, reason: 'ambiguous', kind: 'ambiguous' }
}

export function imageStatus(outcome: ImageOutcome): ImageStatus {
  if (outcome.kind === 'rate-limited') return 'rate-limited'
  if (outcome.kind === 'ambiguous') return 'ambiguous'
  return outcome.obsolete ? 'obsolete' : 'ok'
}

async function ask(url: string, init: RequestInit, timeoutMs: number, request: typeof fetch): Promise<{ status: number | null; contentType: string | null }> {
  try {
    const response = await request(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': USER_AGENT, Accept: ACCEPT, ...(init.headers as Record<string, string> | undefined) } })
    response.body?.cancel().catch(() => undefined)
    return { status: response.status, contentType: response.headers.get('content-type') }
  } catch {
    return { status: null, contentType: null }
  }
}

/** One picture: a HEAD, then the first two kilobytes when the host refuses a HEAD or failed. */
export async function probeImage(url: string, options: { timeoutMs?: number; request?: typeof fetch } = {}): Promise<ImageOutcome> {
  if (!url) return { obsolete: true, reason: 'missing-url' }
  const timeoutMs = options.timeoutMs ?? 7000
  const request = options.request ?? fetch
  let answer = await ask(url, { method: 'HEAD' }, timeoutMs, request)
  if (answer.status === null || answer.status === 403 || answer.status === 405 || answer.status === 501 || (answer.status >= 500 && answer.status < 600)) {
    answer = await ask(url, { method: 'GET', headers: { Range: 'bytes=0-2047' } }, timeoutMs, request)
  }
  return classifyProbe(answer.status, answer.contentType)
}

/** Many pictures, a few at a time; the outcome by id. */
export async function checkImages(docs: ReadonlyArray<{ _id: ObjectId; url?: unknown }>, options: { concurrency?: number; timeoutMs?: number; request?: typeof fetch } = {}): Promise<Map<string, ImageOutcome>> {
  const outcomes = new Map<string, ImageOutcome>()
  let next = 0
  const worker = async () => {
    while (next < docs.length) {
      const doc = docs[next]
      next += 1
      outcomes.set(String(doc._id), await probeImage(typeof doc.url === 'string' ? doc.url.trim() : '', options))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 16, docs.length)) }, worker))
  return outcomes
}

/** What a check writes on the picture, as the page's tool writes it; a living picture forgets that a visitor reported it. */
export function imageOutcomeUpdate(outcome: ImageOutcome, checkedAt: Date): Document {
  const status = imageStatus(outcome)
  return {
    $set: { obsoleteImageCheckedAt: checkedAt, obsoleteImageStatus: status, obsoleteImageReason: outcome.reason ?? null, obsoleteImageHttpStatus: outcome.status ?? null, obsoleteImageContentType: outcome.contentType ?? null },
    ...(status === 'ok' ? { $unset: { obsoleteImageSuspect: '', obsoleteImageSuspectAt: '', obsoleteImageSuspectReason: '', obsoleteImageLastErrorUrl: '', obsoleteImageSuspectProvider: '', obsoleteImageSuspectSourceUrl: '' } } : {}),
  }
}

/** The pictures found dead and waiting for the owner's deletion: a small index of them alone, the oldest verdict first. */
export const DEAD_IMAGES_INDEX = 'idx_image_obsolete_dead'
export async function ensureDeadImagesIndex(db: { collection: (name: string) => { createIndex: (keys: Document, options: Document) => Promise<string> } }): Promise<void> {
  await db.collection('items').createIndex({ obsoleteImageCheckedAt: 1 }, { name: DEAD_IMAGES_INDEX, partialFilterExpression: { type: 'image', obsoleteImageStatus: 'obsolete' } }).catch(() => undefined)
}
