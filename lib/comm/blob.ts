/**
 * The media files live in a private Google Cloud Storage bucket (since 24
 * October; Vercel Blob before, whose 10 GB of downloads a month ran out), under
 * `comm/<queue item id>/…`, with a key nobody can guess. They go there straight
 * from the browser (a signed PUT minted here) or from a server fetch of the
 * content's own file; they leave with their queue item. The records keep the
 * file's own address (`blobUrl`, the field's name from before); reading it
 * takes a signature: pictures get one that holds all day, a clip gets one when
 * the browser opens it — and that opening is counted (usage.ts). A file still
 * at its Vercel Blob address is read there as before until it is moved.
 * Without a store configured, every call says so instead of failing in the dark.
 */

import { randomBytes } from 'node:crypto'

import type { MediaDoc } from './model'
import { deleteObject, gcsConfigured, objectKeyOf, objectUrl, putObject, signUrl, startOfDay } from './gcs'

export const BLOB_PREFIX = 'comm/'
/** The largest file the tool accepts, in bytes: three minutes of screen capture at today's quality stay under. */
export const MEDIA_MAX_BYTES = 320 * 1024 * 1024
export const MEDIA_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
/** How long a picture's address holds: signed from the start of the day, it is the same all day and the browser keeps it. */
export const PICTURE_URL_SEC = 2 * 24 * 3600
/** How long a clip's address holds once the browser asked for it. */
export const CLIP_URL_SEC = 2 * 3600
/** How long an address handed to a platform (Instagram fetches the file itself) holds. */
export const PUBLISH_URL_SEC = 24 * 3600

export function blobConfigured(): boolean {
  return gcsConfigured()
}

/** `comm/<item>/<random>.<ext>`: the item's folder, a name nobody can guess. */
export function blobKeyFor(queueItemId: string, contentType: string): string {
  const ext = extensionOf(contentType)
  return `${BLOB_PREFIX}${queueItemId}/${randomBytes(12).toString('hex')}${ext ? `.${ext}` : ''}`
}

export function extensionOf(contentType: string): string {
  const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }
  return map[contentType.toLowerCase().split(';')[0].trim()] ?? ''
}

/** True when a pathname belongs to this queue item's folder and nowhere else. */
export function keyBelongsTo(pathname: string, queueItemId: string): boolean {
  return /^[a-f\d]{24}$/i.test(queueItemId) && pathname.startsWith(`${BLOB_PREFIX}${queueItemId}/`) && !pathname.slice(BLOB_PREFIX.length + queueItemId.length + 1).includes('/')
}

/** True for an address of the old Vercel Blob store: readable there as it is, until the file is moved. */
export function legacyBlobUrl(url: string): boolean {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && /\.public\.blob\.vercel-storage\.com$/.test(parsed.host) } catch { return false }
}

/** The file's key from an address of the store — the bucket's, signed or not, or the old Blob store's; null for any other address. */
export function blobPathnameOf(url: string): string | null {
  const key = objectKeyOf(url)
  if (key) return key
  if (!legacyBlobUrl(url)) return null
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) } catch { return null }
}

export async function putBlob(key: string, body: ReadableStream | ArrayBuffer | Blob, contentType: string): Promise<{ url: string; pathname: string }> {
  // A key is never written twice (a random name, no overwrite): browsers may keep the file a year instead of asking again after a minute.
  const bytes = body instanceof ArrayBuffer ? body : body instanceof Blob ? await body.arrayBuffer() : await new Response(body).arrayBuffer()
  await putObject(key, bytes, contentType)
  return { url: objectUrl(key), pathname: key }
}

/** Deletes files by address; a missing store, a missing file or an old Blob address is not an error here. */
export async function deleteBlobs(urls: string[]): Promise<number> {
  const keys = urls.map((url) => objectKeyOf(url)).filter((k): k is string => Boolean(k))
  const legacy = urls.filter((url) => legacyBlobUrl(url))
  let removed = 0
  if (keys.length && blobConfigured()) for (const key of keys) { try { if (await deleteObject(key)) removed += 1 } catch { /* left for the next pass */ } }
  if (legacy.length && typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' && process.env.BLOB_READ_WRITE_TOKEN.length > 20) {
    try { const { del } = await import('@vercel/blob'); await del(legacy); removed += legacy.length } catch { /* the old store is read-only now */ }
  }
  return removed
}

/** A readable address for that long: the file's own when it still sits in the old store, a signed one otherwise. */
export function readUrl(url: string, expiresSec: number, stable = false): string {
  const key = objectKeyOf(url)
  if (!key) return url
  return signUrl({ method: 'GET', key, expiresSec, ...(stable ? { at: startOfDay() } : {}) })
}

/** A media on its way to the browser: a picture gets its day's address; a clip keeps its own, the browser asks for it when it opens it. */
export function readableMedia<T extends Pick<MediaDoc, 'blobUrl' | 'contentType'>>(media: T): T {
  if (media.contentType.startsWith('video/')) return media
  return { ...media, blobUrl: readUrl(media.blobUrl, PICTURE_URL_SEC, true) }
}
