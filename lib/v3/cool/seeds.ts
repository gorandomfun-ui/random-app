/**
 * The seeds of the cool pool, refreshed once a day.
 *
 * Two kinds. A like: a content the curator vouched for, whatever its
 * audience. An editorial seed: a video with a real audience, or an image,
 * among the cool words — vintage, weird, surreal… — so a thread starts from
 * something cool and digs from there. The collection stays small, a few
 * hundred seeds that rotate; the threads themselves are composed live from
 * the Wave.
 */

import { ObjectId, type Db, type Document, type Filter } from 'mongodb'

import { canonicalMediaKey } from '@/lib/discovery/catalog'
import { buildStrongPoolMatch } from '@/lib/random/strongPool'
import { SERVABLE, SHOWABLE, channelOf, tellingWordsOf, type ItemRow } from '../wave/find'
import { COOL_SEEDS_COLLECTION, type Rng, type SeedKind } from './thread'
import type { ItemType, Popularity } from '../types'

const OWNER_REFERENCES = 'discovery_owner_references_v2'

/** Editorial seeds rotate: after this many days one is dropped and another found. */
export const EDITORIAL_TTL_DAYS = 14
/** Per format: whatever the day brings, the editorial seeds never grow past this. */
export const EDITORIAL_CAP = 600
/** Editorial videos are proven: only videos carry a view count. */
const PROVEN: Popularity[] = ['known', 'mainstream']
/** Stock photographs are never cool. */
const STOCK_PROVIDERS = ['pexels', 'pixabay']

export type EditorialType = 'video' | 'image'
export const EDITORIAL_TYPES: EditorialType[] = ['video', 'image']

/** Each window walks the random order until it holds this many cool contents. */
const WINDOW_LIMIT = 40
const MAX_WINDOWS = 8
const QUERY_BUDGET_MS = 8_000
const RANDOM_INDEX = 'type_rand_lookup'

export type SeedDocument = {
  _id: ObjectId
  kind: SeedKind
  type: ItemType
  popularity: Popularity
  /** The key a visitor's session knows the content by — "youtube:ID", "giphy:ID". A thread is named after its seed's. */
  contentKey: string
  channelKey?: string
  title?: string
  /** For a like: the reference it came from, so the seed goes when the like does. */
  referenceKey?: string
  addedAt: Date
}

type EditorialReport = { wanted: number; found: number; added: number; expired: number; windows: number; kept: number }
export type SeedsReport = {
  likes: { references: number; resolved: number; added: number; removed: number; unresolved: string[] }
  editorial: Record<EditorialType, EditorialReport>
  /** Seeds planted before threads had a key, replanted with one. */
  replanted: number
  written: boolean
}

type Row = ItemRow & { videoId?: string | null }

const ROW_PROJECTION = {
  type: 1, title: 1, videoId: 1, url: 1, provider: 1, creatorId: 1, channelId: 1, channelTitle: 1,
  v3: 1, keywords: 1, tags: 1,
}

function seedOf(row: Row, kind: SeedKind, now: Date, referenceKey?: string): SeedDocument {
  const channelKey = channelOf(row)
  return {
    _id: row._id,
    kind,
    type: row.type,
    popularity: row.v3?.popularity ?? 'unknown',
    contentKey: canonicalMediaKey(row),
    ...(channelKey ? { channelKey } : {}),
    ...(row.title ? { title: String(row.title).slice(0, 120) } : {}),
    ...(referenceKey ? { referenceKey } : {}),
    addedAt: now,
  }
}

/** A like is stored as "youtube:ID" or "dailymotion:ID"; the video keeps its id under either spelling. */
function videoIdsOf(contentKey: string): string[] {
  const separator = contentKey.indexOf(':')
  if (separator < 0) return []
  const provider = contentKey.slice(0, separator)
  const id = contentKey.slice(separator + 1)
  if (!id) return []
  if (provider === 'youtube') return [id]
  if (provider === 'dailymotion') return [id, contentKey]
  return []
}

type Reference = { contentKey: string; itemId?: string }

/** The curator's likes, as stored contents: two queries, whatever their number. */
async function resolveLikes(db: Db, references: Reference[]): Promise<Map<string, Row>> {
  const items = db.collection('items')
  const resolved = new Map<string, Row>()

  const byItemId = references.filter((reference) => reference.itemId && ObjectId.isValid(reference.itemId))
  if (byItemId.length) {
    const rows = (await items
      .find(
        { _id: { $in: byItemId.map((reference) => new ObjectId(reference.itemId)) }, ...SHOWABLE },
        { projection: ROW_PROJECTION, maxTimeMS: QUERY_BUDGET_MS },
      )
      .toArray()) as Row[]
    const byId = new Map(rows.map((row) => [String(row._id), row]))
    for (const reference of byItemId) {
      const row = byId.get(String(reference.itemId))
      if (row) resolved.set(reference.contentKey, row)
    }
  }

  const wanted = new Map<string, string>()
  for (const reference of references) {
    if (resolved.has(reference.contentKey)) continue
    for (const id of videoIdsOf(reference.contentKey)) wanted.set(id, reference.contentKey)
  }
  if (wanted.size) {
    const rows = (await items
      .find(
        { type: 'video', videoId: { $in: [...wanted.keys()] }, ...SHOWABLE },
        { projection: ROW_PROJECTION, maxTimeMS: QUERY_BUDGET_MS },
      )
      .toArray()) as Row[]
    for (const row of rows) {
      const contentKey = row.videoId ? wanted.get(row.videoId) : undefined
      if (contentKey && !resolved.has(contentKey)) resolved.set(contentKey, row)
    }
  }
  return resolved
}

/** A seed must give the Wave something to go on: labels, or at least words. */
function anchorable(row: Row): boolean {
  return Boolean(row.v3) || tellingWordsOf(row).length > 0
}

async function findEditorialSeeds(
  db: Db,
  type: EditorialType,
  wanted: number,
  taken: { ids: Set<string>; channels: Set<string> },
  random: Rng,
  now: Date,
  report: EditorialReport,
): Promise<SeedDocument[]> {
  const found: SeedDocument[] = []
  const strong = buildStrongPoolMatch<Document>() as Filter<Document>
  const shape: Filter<Document> = type === 'video'
    ? { type: 'video', 'v3.popularity': { $in: PROVEN } }
    : { type: 'image', provider: { $nin: STOCK_PROVIDERS } }
  for (let window = 0; window < MAX_WINDOWS && found.length < wanted; window += 1) {
    const rows = (await db
      .collection('items')
      .find(
        { $and: [strong, SERVABLE, shape, { rand: { $gte: random() * 0.9 } }] },
        { projection: ROW_PROJECTION, sort: { rand: 1 }, limit: WINDOW_LIMIT, hint: RANDOM_INDEX, maxTimeMS: QUERY_BUDGET_MS },
      )
      .toArray()) as Row[]
    report.windows += 1
    report.found += rows.length
    for (const row of rows) {
      const id = String(row._id)
      const channel = channelOf(row)
      // One seed per author: a channel with two hundred cool videos is one taste, not two hundred.
      if (taken.ids.has(id) || (channel && taken.channels.has(channel))) continue
      taken.ids.add(id)
      if (channel) taken.channels.add(channel)
      found.push(seedOf(row, 'editorial', now))
      if (found.length >= wanted) break
    }
    if (!rows.length) break
  }
  return found
}

export async function refreshCoolSeeds(
  db: Db,
  options: { apply: boolean; editorialWanted: number; now?: Date; random?: Rng },
): Promise<SeedsReport> {
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const seeds = db.collection<SeedDocument>(COOL_SEEDS_COLLECTION)
  const emptyReport = (): EditorialReport => ({ wanted: options.editorialWanted, found: 0, added: 0, expired: 0, windows: 0, kept: 0 })
  const report: SeedsReport = {
    likes: { references: 0, resolved: 0, added: 0, removed: 0, unresolved: [] },
    editorial: { video: emptyReport(), image: emptyReport() },
    replanted: 0,
    written: false,
  }

  const stored = await seeds
    .find({}, { projection: { kind: 1, type: 1, contentKey: 1, referenceKey: 1, channelKey: 1, addedAt: 1 }, maxTimeMS: QUERY_BUDGET_MS })
    .toArray()
  // A seed without a key cannot name a thread: it is replanted with one.
  const stale = stored.filter((seed) => !seed.contentKey)
  report.replanted = stale.length
  const existing = stored.filter((seed) => Boolean(seed.contentKey))

  // Likes: every active reference becomes a seed; a like withdrawn takes its seed with it.
  const references: Reference[] = await db
    .collection<Reference>(OWNER_REFERENCES)
    .find({ active: true }, { projection: { contentKey: 1, itemId: 1 }, maxTimeMS: QUERY_BUDGET_MS })
    .toArray()
  report.likes.references = references.length
  const resolved = await resolveLikes(db, references)
  const activeKeys = new Set<string>()
  const likeSeeds: SeedDocument[] = []
  for (const reference of references) {
    const row = resolved.get(reference.contentKey)
    if (!row || !anchorable(row)) {
      report.likes.unresolved.push(reference.contentKey)
      continue
    }
    activeKeys.add(reference.contentKey)
    likeSeeds.push(seedOf(row, 'like', now, reference.contentKey))
  }
  report.likes.resolved = likeSeeds.length
  const likeKeyOf = (seed: { referenceKey?: string; contentKey: string }) => seed.referenceKey ?? seed.contentKey
  const existingLikeKeys = new Set(existing.filter((seed) => seed.kind === 'like').map(likeKeyOf))
  const likesToAdd = likeSeeds.filter((seed) => !existingLikeKeys.has(likeKeyOf(seed)))
  const likesToRemove = existing.filter((seed) => seed.kind === 'like' && !activeKeys.has(likeKeyOf(seed)))
  report.likes.added = likesToAdd.length
  report.likes.removed = likesToRemove.length

  // Editorial, per format: drop the seeds past their time, then find as many as the day asks for, within the cap.
  const expiry = new Date(now.getTime() - EDITORIAL_TTL_DAYS * 86_400_000)
  const editorial = existing.filter((seed) => seed.kind === 'editorial')
  const expired = editorial.filter((seed) => seed.addedAt < expiry)
  const kept = editorial.filter((seed) => seed.addedAt >= expiry)
  const taken = {
    ids: new Set(existing.map((seed) => String(seed._id))),
    channels: new Set(
      [...kept, ...likeSeeds].map((seed) => seed.channelKey).filter((key): key is string => Boolean(key)),
    ),
  }
  const editorialToAdd: SeedDocument[] = []
  for (const type of EDITORIAL_TYPES) {
    const line = report.editorial[type]
    line.expired = expired.filter((seed) => seed.type === type).length
    line.kept = kept.filter((seed) => seed.type === type).length
    const room = Math.max(0, Math.min(options.editorialWanted, EDITORIAL_CAP - line.kept))
    const found = room > 0 ? await findEditorialSeeds(db, type, room, taken, random, now, line) : []
    line.added = found.length
    editorialToAdd.push(...found)
  }

  if (!options.apply) return report

  const toRemove = [...stale, ...likesToRemove, ...expired].map((seed) => seed._id)
  if (toRemove.length) await seeds.deleteMany({ _id: { $in: toRemove } })
  const toAdd = [...likesToAdd, ...editorialToAdd]
  if (toAdd.length) await seeds.insertMany(toAdd, { ordered: false })
  report.written = true
  return report
}
