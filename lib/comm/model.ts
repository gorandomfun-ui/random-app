/**
 * Comm v1 — the curator's tool for sharing discoveries on the networks.
 *
 * Five collections of its own, nothing changed elsewhere:
 *  - comm_queue     a content set aside from the curation, with a frozen snapshot;
 *  - comm_media     the files taken at that moment (in Vercel Blob, referenced here);
 *  - comm_templates the slide templates, as data;
 *  - comm_phrases   the ready-made lines;
 *  - comm_posts     a composed publication, and the only trace kept afterwards.
 */

import type { Db } from 'mongodb'

export const COMM_QUEUE = 'comm_queue'
export const COMM_MEDIA = 'comm_media'
export const COMM_TEMPLATES = 'comm_templates'
export const COMM_PHRASES = 'comm_phrases'
export const COMM_POSTS = 'comm_posts'

/** At most this many contents waiting in the queue (NEXT_PUBLIC_COMM_QUEUE_MAX, default 30). */
export function queueMax(): number {
  const raw = Number.parseInt(process.env.NEXT_PUBLIC_COMM_QUEUE_MAX ?? '', 10)
  return Number.isInteger(raw) && raw > 0 && raw <= 500 ? raw : 30
}

/** The longest extract the tool keeps, in seconds (NEXT_PUBLIC_COMM_CLIP_MAX_SECONDS, default 60). */
export function clipMaxSeconds(): number {
  const raw = Number.parseInt(process.env.NEXT_PUBLIC_COMM_CLIP_MAX_SECONDS ?? '', 10)
  return Number.isInteger(raw) && raw > 0 && raw <= 600 ? raw : 60
}

export type CommContentType = 'video' | 'image' | 'web' | 'quote' | 'fact' | 'joke'
export const COMM_CONTENT_TYPES: readonly CommContentType[] = ['video', 'image', 'web', 'quote', 'fact', 'joke']

/** What the provider's terms suggest, as a coloured dot: information, never a block. */
export type LicenseHint = 'permissif' | 'partage' | 'prudence'

export type QueueSnapshot = {
  title: string
  /** The address of the content itself (the video page, the image file, the site). */
  url: string
  /** The page to credit and to link to: the provider's page when there is one, else the url. */
  sourceUrl: string
  thumb: string | null
  /** The channel, photographer or site; empty when the base does not know it. */
  author: string
  provider: string
  /** The provider's readable name ("YouTube", "Pexels"). */
  providerLabel: string
  durationSec: number | null
  /** True when a missing author blocks the publication (the cautious providers). */
  authorRequired: boolean
  /** The GIF's original as an mp4 when the provider serves one (Giphy). */
  gifMp4: string | null
  /** For web, quote, fact, joke: the text to picture. */
  text: string | null
}

export type QueueSubject = { id: string; label: string; role: string }

export type QueueItem = {
  _id: string
  contentId: string
  contentType: CommContentType
  addedAt: Date
  status: 'todo' | 'publishing'
  note: string
  subjects: QueueSubject[]
  snapshot: QueueSnapshot
  licenseHint: LicenseHint
}

/** montage: a clip cut, framed and dressed by the browser, ready to post; still: one frame of a video, as a picture; render: a slide as a JPEG, only for the time of a publication; poster: one frame of a clip, so the engine can show the clip's slide. */
export type MediaKind = 'capture' | 'import' | 'gif' | 'image' | 'screenshot' | 'thumb' | 'montage' | 'still' | 'render' | 'poster'

export type MediaDoc = {
  _id: string
  queueItemId: string
  kind: MediaKind
  animated: boolean
  width: number | null
  height: number | null
  durationSec: number | null
  bytes: number
  contentType: string
  createdAt: Date
  blobUrl: string
  blobKey: string
  trim: { startSec: number; endSec: number } | null
  crop: { mode: 'framed' | 'centered'; x: number; y: number; w: number; h: number } | null
  /** For a montage or a still: the media it was made from, and the template it was dressed with. */
  sourceMediaId?: string | null
  templateKey?: string | null
}

export type Destination = 'instagram' | 'tiktok' | 'x'
export const DESTINATIONS: readonly Destination[] = ['instagram', 'tiktok', 'x']

/** One slide: the item it shows (its credit, its source, its thumbnail when no media is picked), the media, the dressing. */
export type TextPosition = 'top' | 'middle' | 'bottom'
/** A block the curator places by hand: its top-left corner as shares of the canvas, its size in px on a 1080-wide canvas. */
export type Placement = { x: number; y: number; size: number; align?: 'left' | 'center' | 'right'; width?: number }
export type PostSlide = {
  itemId: string | null; mediaId: string | null; templateKey: string; text: string; palette: number; logoVariant: 'black' | 'white'; glitch?: number
  /** Full screen (cover) or framed whole (contain); empty keeps the template's own. */
  fit?: 'cover' | 'contain' | null
  /** Where the words sit; empty keeps the template's own. */
  textPosition?: TextPosition | null
  /** The words placed by hand, over the template and the position presets. */
  textPlace?: Placement | null
  /** The credit and the source placed by hand. */
  sourcePlace?: Placement | null
  /** The margin around the picture: none (full screen) or the Random glitch. */
  margin?: 'none' | 'glitch' | null
  /** The picture's own rectangle, moved and sized by hand, as shares of the canvas. */
  mediaPlace?: { x: number; y: number; w: number; h: number } | null
  /** The logo placed by hand: its top-left corner, its width in px on a 1080-wide canvas. */
  logoPlace?: Placement | null
}

export type PostDoc = {
  _id: string
  number: number
  destination: Destination
  format: string
  slides: PostSlide[]
  caption: string
  /** The editor's own part of the caption (title and phrase as typed), kept apart from the lines that stay. */
  captionHead: string
  phrase: string
  /** The author typed by hand when the base has none. */
  credit: string
  homeLink: boolean
  hashtags: string[]
  linkKey: string
  status: 'draft' | 'exported' | 'published' | 'failed'
  title: string
  author: string
  provider: string
  sourceUrl: string
  queueItemIds: string[]
  createdAt: Date
  updatedAt: Date
  publishedAt: Date | null
  remoteId: string | null
  remoteUrl: string | null
  error: string | null
  clicks: number
}

/** Creates the tool's indexes; safe to call again. */
export async function ensureCommIndexes(db: Db): Promise<void> {
  await db.collection(COMM_QUEUE).createIndex({ contentId: 1 }, { name: 'comm_queue_content', unique: true })
  await db.collection(COMM_QUEUE).createIndex({ status: 1, addedAt: -1 }, { name: 'comm_queue_status' })
  await db.collection(COMM_MEDIA).createIndex({ queueItemId: 1, createdAt: 1 }, { name: 'comm_media_item' })
  await db.collection(COMM_POSTS).createIndex({ number: 1 }, { name: 'comm_posts_number', unique: true })
  await db.collection(COMM_POSTS).createIndex({ linkKey: 1 }, { name: 'comm_posts_link', unique: true, partialFilterExpression: { linkKey: { $type: 'string' } } })
  await db.collection(COMM_POSTS).createIndex({ status: 1, publishedAt: -1 }, { name: 'comm_posts_status' })
  await db.collection(COMM_TEMPLATES).createIndex({ key: 1 }, { name: 'comm_templates_key', unique: true })
}
