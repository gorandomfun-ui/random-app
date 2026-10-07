/**
 * A post in the making: its draft from step 2 on, saved at every change; its
 * number, the one the links page shows; its short key for the counting
 * redirect; and what remains of it once exported or published, the only
 * trace the tool keeps.
 */

import { randomBytes } from 'node:crypto'
import { ObjectId, type Db } from 'mongodb'

import { COMM_POSTS, DESTINATIONS, type Destination, type PostDoc, type PostSlide } from './model'
import { formatSpec } from './destinations'
import { queueItemById, removeFromQueue, type QueueItemWithMedia } from './queue'
import { buildCaption, suggestHashtags } from './caption'

const QUERY_MS = 2500
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** Eight characters nobody guesses, for /l/<key>. */
export function newLinkKey(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

function postOf(row: Record<string, unknown>): PostDoc {
  return { ...(row as unknown as PostDoc), _id: String(row._id) }
}

export async function postById(db: Db, id: string): Promise<PostDoc | null> {
  if (!ObjectId.isValid(id)) return null
  const row = await db.collection(COMM_POSTS).findOne({ _id: new ObjectId(id) }, { maxTimeMS: QUERY_MS })
  return row ? postOf(row as Record<string, unknown>) : null
}

export async function listPosts(db: Db, limit = 200): Promise<PostDoc[]> {
  const rows = await db.collection(COMM_POSTS).find({}, { sort: { number: -1 }, limit, maxTimeMS: QUERY_MS }).toArray()
  return rows.map((row) => postOf(row as Record<string, unknown>))
}

/** The posts the public links page shows: exported or published, newest first, no draft. */
export async function publishedPosts(db: Db, limit = 100): Promise<Array<Pick<PostDoc, 'number' | 'title' | 'author' | 'provider' | 'linkKey' | 'destination' | 'publishedAt'>>> {
  const rows = await db.collection(COMM_POSTS).find({ status: { $in: ['published', 'exported'] } }, { sort: { number: -1 }, limit, projection: { number: 1, title: 1, author: 1, provider: 1, linkKey: 1, destination: 1, publishedAt: 1 }, maxTimeMS: QUERY_MS }).toArray()
  return rows.map((row) => ({ number: Number(row.number), title: String(row.title ?? ''), author: String(row.author ?? ''), provider: String(row.provider ?? ''), linkKey: String(row.linkKey ?? ''), destination: row.destination as Destination, publishedAt: row.publishedAt instanceof Date ? row.publishedAt : null }))
}

/** The address behind a key, counted; null when the key is unknown. */
export async function followLink(db: Db, key: string): Promise<string | null> {
  if (!/^[a-z0-9]{8}$/.test(key)) return null
  const row = await db.collection(COMM_POSTS).findOneAndUpdate({ linkKey: key, status: { $in: ['published', 'exported'] } }, { $inc: { clicks: 1 } }, { projection: { sourceUrl: 1 }, maxTimeMS: QUERY_MS })
  const url = typeof row?.sourceUrl === 'string' ? row.sourceUrl : null
  return url && /^https?:\/\//i.test(url) ? url : null
}

export type DraftResult = { ok: true; post: PostDoc } | { ok: false; reason: 'destination' | 'format' | 'items' }

/**
 * Step 2: the draft, with a number, a key, and one slide per chosen item
 * (its first picture, or its thumbnail). The caption starts from the first
 * item's title and keeps the lines that stay.
 */
export async function createDraft(db: Db, input: { destination: string; format: string; queueItemIds: string[] }): Promise<DraftResult> {
  if (!DESTINATIONS.includes(input.destination as Destination)) return { ok: false, reason: 'destination' }
  const spec = formatSpec(input.destination, input.format)
  if (!spec) return { ok: false, reason: 'format' }
  const items: QueueItemWithMedia[] = []
  for (const id of input.queueItemIds.slice(0, 20)) { const item = await queueItemById(db, id); if (item) items.push(item) }
  if (!items.length) return { ok: false, reason: 'items' }
  const slides: PostSlide[] = items.slice(0, spec.slides.max).map((item) => {
    const media = item.media.find((m) => (spec.media === 'video' ? m.contentType.startsWith('video/') : spec.media === 'image' ? m.contentType.startsWith('image/') : true)) ?? item.media[0] ?? null
    return { itemId: item._id, mediaId: media?._id ?? null, templateKey: defaultTemplate(spec.family, spec.media === 'video'), text: '', palette: Math.floor(Math.random() * 6), logoVariant: 'white' as const }
  })
  const first = items[0]
  const hashtags = suggestHashtags(first.subjects).slice(0, Math.min(5, spec.hashtags))
  const now = new Date()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await db.collection(COMM_POSTS).find({}, { sort: { number: -1 }, limit: 1, projection: { number: 1 }, maxTimeMS: QUERY_MS }).toArray()
    const number = (Number(last[0]?.number) || 0) + 1
    const caption = buildCaption({ destination: input.destination, format: input.format, title: first.snapshot.title, phrase: '', snapshot: first.snapshot, number, hashtags })
    const doc = {
      number, destination: input.destination as Destination, format: input.format, slides, caption: caption.text, captionHead: '', phrase: '', hashtags, credit: '', homeLink: false,
      linkKey: newLinkKey(), status: 'draft' as const,
      title: first.snapshot.title, author: first.snapshot.author, provider: first.snapshot.providerLabel, sourceUrl: first.snapshot.sourceUrl || first.snapshot.url,
      queueItemIds: items.map((item) => item._id), createdAt: now, updatedAt: now, publishedAt: null, remoteId: null, remoteUrl: null, error: null, clicks: 0,
    }
    try {
      const inserted = await db.collection(COMM_POSTS).insertOne(doc)
      return { ok: true, post: { ...doc, _id: String(inserted.insertedId) } as PostDoc }
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error
      // Two drafts at once took the same number or key: once more.
    }
  }
  throw new Error('draft number')
}

function defaultTemplate(family: string, video: boolean): string {
  if (family === '9:16') return video ? 'story-plein' : 'story-encadre'
  if (family === '4:5') return 'post-encadre'
  if (family === '1:1') return 'carre'
  return 'paysage'
}

export type DraftPatch = Partial<Pick<PostDoc, 'slides' | 'caption' | 'hashtags' | 'format' | 'author'>> & { captionHead?: string; phrase?: string; credit?: string; homeLink?: boolean }

/** Every change of the editor lands here; the format's bounds are checked on the way. */
export async function updateDraft(db: Db, id: string, patch: DraftPatch): Promise<{ ok: true; post: PostDoc } | { ok: false; reason: string }> {
  const post = await postById(db, id)
  if (!post) return { ok: false, reason: 'not-found' }
  if (post.status !== 'draft' && post.status !== 'failed') return { ok: false, reason: 'not-a-draft' }
  const format = patch.format ?? post.format
  const spec = formatSpec(post.destination, format)
  if (!spec) return { ok: false, reason: 'format' }
  const set: Record<string, unknown> = { updatedAt: new Date(), format }
  if (patch.slides) {
    if (!Array.isArray(patch.slides) || patch.slides.length < 1 || patch.slides.length > spec.slides.max) return { ok: false, reason: `slides: ${spec.slides.min} à ${spec.slides.max}` }
    const clean: PostSlide[] = []
    for (const slide of patch.slides) {
      if (!slide || typeof slide !== 'object') return { ok: false, reason: 'slide' }
      const itemId = typeof slide.itemId === 'string' && post.queueItemIds.includes(slide.itemId) ? slide.itemId : null
      const mediaId = typeof slide.mediaId === 'string' && ObjectId.isValid(slide.mediaId) ? slide.mediaId : null
      const templateKey = typeof slide.templateKey === 'string' && /^[a-z0-9-]{2,40}$/.test(slide.templateKey) ? slide.templateKey : defaultTemplate(spec.family, spec.media === 'video')
      const palette = Number.isInteger(slide.palette) && slide.palette >= 0 && slide.palette < 6 ? slide.palette : 0
      clean.push({ itemId, mediaId, templateKey, text: typeof slide.text === 'string' ? slide.text.slice(0, 600) : '', palette, logoVariant: slide.logoVariant === 'black' ? 'black' : 'white', ...(typeof (slide as { glitch?: unknown }).glitch === 'number' ? { glitch: Math.min(1, Math.max(0, (slide as { glitch: number }).glitch)) } : {}) })
    }
    set.slides = clean
  }
  if (typeof patch.caption === 'string') set.caption = patch.caption.slice(0, 4000)
  if (typeof patch.captionHead === 'string') set.captionHead = patch.captionHead.slice(0, 2000)
  if (typeof patch.phrase === 'string') set.phrase = patch.phrase.slice(0, 140)
  if (typeof patch.credit === 'string') set.credit = patch.credit.slice(0, 120)
  if (typeof patch.homeLink === 'boolean') set.homeLink = patch.homeLink
  if (Array.isArray(patch.hashtags)) set.hashtags = patch.hashtags.filter((tag): tag is string => typeof tag === 'string' && /^#[\p{L}\p{N}_]{2,40}$/u.test(tag)).slice(0, 30)
  await db.collection(COMM_POSTS).updateOne({ _id: new ObjectId(id) }, { $set: set })
  const updated = await postById(db, id)
  return updated ? { ok: true, post: updated } : { ok: false, reason: 'not-found' }
}

/** After an export: the post is a trace, and the items it used leave the queue unless kept. */
export async function markExported(db: Db, id: string, keep: string[]): Promise<{ ok: boolean; removed: number }> {
  const post = await postById(db, id)
  if (!post) return { ok: false, removed: 0 }
  await db.collection(COMM_POSTS).updateOne({ _id: new ObjectId(id) }, { $set: { status: 'exported', publishedAt: new Date(), updatedAt: new Date() } })
  let removed = 0
  for (const itemId of post.queueItemIds) if (!keep.includes(itemId)) { const result = await removeFromQueue(db, itemId); if (result.removed) removed += 1 }
  return { ok: true, removed }
}

export async function deleteDraft(db: Db, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  return (await db.collection(COMM_POSTS).deleteOne({ _id: new ObjectId(id), status: { $in: ['draft', 'failed'] } })).deletedCount === 1
}
