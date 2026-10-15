/**
 * The media files live in Vercel Blob, under `comm/<queue item id>/…`, with a
 * key nobody can guess. They go there straight from the browser (a short
 * token signed here) or from a server fetch of the content's own file; they
 * leave with their queue item. Without a store configured, every call says so
 * instead of failing in the dark.
 */

import { randomBytes } from 'node:crypto'
import { del, put } from '@vercel/blob'

export const BLOB_PREFIX = 'comm/'
/** The largest file the tool accepts, in bytes: a minute of screen capture stays well under. */
export const MEDIA_MAX_BYTES = 200 * 1024 * 1024
export const MEDIA_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']

export function blobConfigured(): boolean {
  return typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' && process.env.BLOB_READ_WRITE_TOKEN.length > 20
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

/** The pathname part of a Blob URL, or null when the URL is not a Blob address of this store. */
export function blobPathnameOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !/\.public\.blob\.vercel-storage\.com$/.test(parsed.host)) return null
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  } catch { return null }
}

export async function putBlob(key: string, body: ReadableStream | ArrayBuffer | Blob, contentType: string): Promise<{ url: string; pathname: string }> {
  const result = await put(key, body as never, { access: 'public', contentType, addRandomSuffix: false, cacheControlMaxAge: 60 })
  return { url: result.url, pathname: result.pathname }
}

/** Deletes files by URL; a missing store or a missing file is not an error here. */
export async function deleteBlobs(urls: string[]): Promise<number> {
  const valid = urls.filter((url) => blobPathnameOf(url))
  if (!valid.length || !blobConfigured()) return 0
  try { await del(valid); return valid.length } catch { return 0 }
}
