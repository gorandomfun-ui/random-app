/**
 * The queue: what the curator set aside, with the media taken at that moment.
 * Thirty at most; an item leaves with its media and their files.
 */

import { ObjectId, type Db } from 'mongodb'

import { COMM_MEDIA, COMM_QUEUE, queueMax, type MediaDoc, type MediaKind, type QueueItem } from './model'
import { snapshotFromRow, subjectRefsOf, withLabels } from './snapshot'
import { blobConfigured, blobKeyFor, deleteBlobs, extensionOf, putBlob, MEDIA_CONTENT_TYPES, MEDIA_MAX_BYTES } from './blob'
import { imageSizeOf } from './imageSize'
import { lookupAuthor } from './authorLookup'

const QUERY_MS = 2500

export type QueueState = { count: number; max: number; blob: boolean }

export async function queueState(db: Db): Promise<QueueState> {
  const count = await db.collection(COMM_QUEUE).countDocuments({ status: { $in: ['todo', 'publishing'] } }, { maxTimeMS: QUERY_MS })
  return { count, max: queueMax(), blob: blobConfigured() }
}

export type QueueItemWithMedia = QueueItem & { media: MediaDoc[] }

function itemOf(row: Record<string, unknown>): QueueItem {
  return { ...(row as unknown as QueueItem), _id: String(row._id) }
}

function mediaOf(row: Record<string, unknown>): MediaDoc {
  return { ...(row as unknown as MediaDoc), _id: String(row._id) }
}

export async function listQueue(db: Db): Promise<QueueItemWithMedia[]> {
  const rows = await db.collection(COMM_QUEUE).find({ status: { $in: ['todo', 'publishing'] } }, { sort: { addedAt: -1 }, limit: 500, maxTimeMS: QUERY_MS }).toArray()
  const items = rows.map((row) => itemOf(row as Record<string, unknown>))
  const media = items.length
    ? await db.collection(COMM_MEDIA).find({ queueItemId: { $in: items.map((item) => item._id) } }, { sort: { createdAt: 1 }, maxTimeMS: QUERY_MS }).toArray()
    : []
  const byItem = new Map<string, MediaDoc[]>()
  for (const row of media) {
    const doc = mediaOf(row as Record<string, unknown>)
    const list = byItem.get(doc.queueItemId) ?? []
    list.push(doc); byItem.set(doc.queueItemId, list)
  }
  return items.map((item) => ({ ...item, media: byItem.get(item._id) ?? [] }))
}

export async function queueItemById(db: Db, queueItemId: string): Promise<QueueItemWithMedia | null> {
  if (!ObjectId.isValid(queueItemId)) return null
  const row = await db.collection(COMM_QUEUE).findOne({ _id: new ObjectId(queueItemId) }, { maxTimeMS: QUERY_MS })
  if (!row) return null
  const media = await db.collection(COMM_MEDIA).find({ queueItemId }, { sort: { createdAt: 1 }, maxTimeMS: QUERY_MS }).toArray()
  return { ...itemOf(row as Record<string, unknown>), media: media.map((m) => mediaOf(m as Record<string, unknown>)) }
}

export async function queueItemByContent(db: Db, contentId: string): Promise<QueueItemWithMedia | null> {
  const row = await db.collection(COMM_QUEUE).findOne({ contentId }, { projection: { _id: 1 }, maxTimeMS: QUERY_MS })
  return row ? queueItemById(db, String(row._id)) : null
}

export type AddResult = { ok: true; item: QueueItemWithMedia; created: boolean } | { ok: false; reason: 'full' | 'unknown' | 'unsupported' }

/** Sets a content aside: idempotent, refuses past the cap, and builds the snapshot from the base. */
export async function addToQueue(db: Db, contentId: string): Promise<AddResult> {
  if (!ObjectId.isValid(contentId)) return { ok: false, reason: 'unknown' }
  const existing = await queueItemByContent(db, contentId)
  if (existing) return { ok: true, item: existing, created: false }
  const state = await queueState(db)
  if (state.count >= state.max) return { ok: false, reason: 'full' }
  const row = await db.collection('items').findOne({ _id: new ObjectId(contentId) }, { maxTimeMS: QUERY_MS })
  if (!row) return { ok: false, reason: 'unknown' }
  const built = snapshotFromRow(row as Record<string, unknown>)
  if (!built) return { ok: false, reason: 'unsupported' }
  // The base does not know the author: the provider is asked once, now; the curator never types a name.
  if (!built.snapshot.author) {
    const found = await lookupAuthor({ provider: built.snapshot.provider, url: built.snapshot.url, sourceUrl: built.snapshot.sourceUrl, videoId: typeof row.videoId === 'string' ? row.videoId : null })
    if (found) built.snapshot.author = found.slice(0, 120)
  }
  built.snapshot.authorRequired = false
  const refs = subjectRefsOf(row as Record<string, unknown>)
  const labels = new Map<string, string>()
  if (refs.length) {
    const subjects = await db.collection('subjects_v3').find({ _id: { $in: refs.map((ref) => ref.id) } } as never, { projection: { label: 1 }, maxTimeMS: QUERY_MS }).toArray()
    for (const subject of subjects) if (typeof subject.label === 'string') labels.set(String(subject._id), subject.label)
  }
  const doc = {
    contentId, contentType: built.contentType, addedAt: new Date(), status: 'todo' as const, note: '',
    subjects: withLabels(refs, labels), snapshot: built.snapshot, licenseHint: built.licenseHint,
  }
  try {
    const inserted = await db.collection(COMM_QUEUE).insertOne(doc)
    return { ok: true, item: { ...doc, _id: String(inserted.insertedId), media: [] }, created: true }
  } catch (error) {
    // Two clicks at once: the unique index keeps one row, we return it.
    if ((error as { code?: number }).code === 11000) {
      const raced = await queueItemByContent(db, contentId)
      if (raced) return { ok: true, item: raced, created: false }
    }
    throw error
  }
}

/** Removes the item, its media rows and their files. */
export async function removeFromQueue(db: Db, queueItemId: string): Promise<{ removed: boolean; files: number }> {
  if (!ObjectId.isValid(queueItemId)) return { removed: false, files: 0 }
  const media = await db.collection(COMM_MEDIA).find({ queueItemId }, { projection: { blobUrl: 1 }, maxTimeMS: QUERY_MS }).toArray()
  const files = await deleteBlobs(media.map((m) => String(m.blobUrl)))
  await db.collection(COMM_MEDIA).deleteMany({ queueItemId })
  const result = await db.collection(COMM_QUEUE).deleteOne({ _id: new ObjectId(queueItemId) })
  return { removed: result.deletedCount === 1, files }
}

export async function removeMedia(db: Db, mediaId: string): Promise<boolean> {
  if (!ObjectId.isValid(mediaId)) return false
  const row = await db.collection(COMM_MEDIA).findOne({ _id: new ObjectId(mediaId) }, { projection: { blobUrl: 1 }, maxTimeMS: QUERY_MS })
  if (!row) return false
  await deleteBlobs([String(row.blobUrl)])
  await db.collection(COMM_MEDIA).deleteOne({ _id: new ObjectId(mediaId) })
  return true
}

export type MediaInput = {
  queueItemId: string
  kind: MediaKind
  blobUrl: string
  blobKey: string
  contentType: string
  bytes: number
  width: number | null
  height: number | null
  durationSec: number | null
  animated: boolean
  trim?: { startSec: number; endSec: number } | null
  crop?: { mode: 'framed' | 'centered'; x: number; y: number; w: number; h: number } | null
  sourceMediaId?: string | null
  templateKey?: string | null
}

export async function registerMedia(db: Db, input: MediaInput): Promise<MediaDoc> {
  const doc = { ...input, createdAt: new Date(), trim: input.trim ?? null, crop: input.crop ?? null, sourceMediaId: input.sourceMediaId ?? null, templateKey: input.templateKey ?? null }
  const inserted = await db.collection(COMM_MEDIA).insertOne(doc)
  return { ...doc, _id: String(inserted.insertedId) }
}

export type ImportWhat = 'image' | 'gif' | 'thumb'

export type ImportResult = { ok: true; media: MediaDoc } | { ok: false; reason: 'no-blob' | 'no-item' | 'no-url' | 'fetch' | 'type' | 'size' }

/**
 * The content's own file, fetched by the server from the snapshot's address
 * (never from a client-sent URL) and streamed into Blob: the image in full
 * size, the GIF as served (Giphy's mp4 when it has one), or the thumbnail.
 */
export async function importSourceMedia(db: Db, queueItemId: string, what: ImportWhat): Promise<ImportResult> {
  if (!blobConfigured()) return { ok: false, reason: 'no-blob' }
  const item = await queueItemById(db, queueItemId)
  if (!item) return { ok: false, reason: 'no-item' }
  const url = what === 'thumb' ? item.snapshot.thumb : what === 'gif' ? (item.snapshot.gifMp4 ?? item.snapshot.url) : item.snapshot.url
  if (!url || !/^https?:\/\//i.test(url)) return { ok: false, reason: 'no-url' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { accept: 'image/*,video/*;q=0.9,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 (compatible; RandomComm/1.0)' } })
  } catch { clearTimeout(timer); return { ok: false, reason: 'fetch' } }
  if (!response.ok || !response.body) { clearTimeout(timer); return { ok: false, reason: 'fetch' } }
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!MEDIA_CONTENT_TYPES.includes(contentType)) { clearTimeout(timer); return { ok: false, reason: 'type' } }
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MEDIA_MAX_BYTES) { clearTimeout(timer); return { ok: false, reason: 'size' } }
  const bytes = new Uint8Array(await response.arrayBuffer())
  clearTimeout(timer)
  if (bytes.byteLength > MEDIA_MAX_BYTES || bytes.byteLength === 0) return { ok: false, reason: 'size' }
  const key = blobKeyFor(queueItemId, contentType)
  const stored = await putBlob(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, contentType)
  const size = contentType.startsWith('image/') ? imageSizeOf(bytes) : null
  const animated = contentType === 'image/gif' || contentType.startsWith('video/')
  const kind: MediaKind = what === 'thumb' ? 'thumb' : what === 'gif' ? 'gif' : 'image'
  const media = await registerMedia(db, {
    queueItemId, kind, blobUrl: stored.url, blobKey: stored.pathname, contentType, bytes: bytes.byteLength,
    width: size?.width ?? null, height: size?.height ?? null, durationSec: null, animated,
  })
  return { ok: true, media }
}

export { extensionOf }
