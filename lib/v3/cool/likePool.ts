/**
 * The like pool: every content connected to a curation like — the videos of
 * its author, the contents of the subject its title names — as zones that
 * know their size.
 *
 * A like ticket used to pick a like, then a content of its zone: every like
 * weighed the same, and a like whose author had two videos put one per cent
 * of all like draws on a single clip. The pool draws the other way round: a
 * zone weighs what it holds, at most `ZONE_CAP`, and a content inside it is
 * drawn at random. Uniform over the pool, with no author flooding it.
 *
 * The zones and their counts are written by `scripts/v3/like-pool.ts`, run
 * hourly on the ingestion server and after each ingestion pass; the journal
 * line `like-pool` records the size and the growth. The draw reads them.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import type { LikeZone } from './likes'
import { SERVABLE } from './servable'
import type { Rng } from '../../discovery/random'

export const POOL = 'like_pool_v3'
/** What one zone may weigh: an author of three thousand videos counts as three hundred. */
export const ZONE_CAP = 300
/** The like itself, shown once in this many like tickets. */
export const LIKE_ITSELF = 1 / 1000
const SUMMARY_ID = 'summary'
const CACHE_TTL_MS = 10 * 60_000
const RETRY_AFTER_FAILURE_MS = 60_000
const QUERY_BUDGET_MS = 4_000
/** A count of a zone: the biggest hold thousands of documents behind an index, and the database is small. */
const COUNT_BUDGET_MS = 20_000

export type PoolZone = {
  /** `author:<channel key>` or `subject:<subject id>`. */
  id: string
  kind: 'author' | 'subject'
  key: string
  /** The likes this zone comes from; a zone never shows them. */
  likeIds: string[]
  /** Contents of each format in the zone, the likes left out. */
  video: number
  image: number
}

export type PoolSummary = {
  zones: number
  likes: number
  /** Every content connected to a like, zones summed (a content in two zones counts twice). */
  connected: number
  /** What the draw sees: each zone capped. */
  effective: number
  at: Date
}

export type LikePool = { zones: PoolZone[]; likeIds: string[] }

const EMPTY: LikePool = { zones: [], likeIds: [] }

/** One zone per liked author and per subject a like names: two likes of one author make one zone. */
export function zonesOfLikes(likes: readonly LikeZone[]): PoolZone[] {
  const zones = new Map<string, PoolZone>()
  const add = (kind: PoolZone['kind'], key: string, likeId: string) => {
    const id = `${kind}:${key}`
    const zone = zones.get(id) ?? { id, kind, key, likeIds: [], video: 0, image: 0 }
    if (!zone.likeIds.includes(likeId)) zone.likeIds.push(likeId)
    zones.set(id, zone)
  }
  for (const like of likes) {
    if (like.channelKey) add('author', like.channelKey, like.id)
    for (const subjectId of like.subjectIds) add('subject', subjectId, like.id)
  }
  return [...zones.values()]
}

/**
 * How many contents each zone holds, the likes themselves left out. A zone
 * whose count runs past its budget is big by that very fact: it keeps its
 * previous count, or weighs the cap when it has none; `uncounted` says which.
 */
export async function countZones(
  db: Db, zones: readonly PoolZone[], likeIds: readonly string[], previous: ReadonlyMap<string, PoolZone> = new Map(), budgetMs = COUNT_BUDGET_MS,
): Promise<{ zones: PoolZone[]; uncounted: string[] }> {
  const items = db.collection('items')
  const notALike = { _id: { $nin: likeIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } }
  const counted: PoolZone[] = []
  const uncounted: string[] = []
  const count = async (zone: PoolZone, type: 'video' | 'image'): Promise<number> => {
    try {
      return zone.kind === 'author'
        ? await items.countDocuments({ 'v3.channelKey': zone.key, type, ...SERVABLE, ...notALike }, { maxTimeMS: budgetMs })
        : await items.countDocuments({ 'v3.subjects.id': zone.key, type, 'v3.usable': true, ...SERVABLE, ...notALike }, { hint: 'v3_subject_type_rand', maxTimeMS: budgetMs })
    } catch {
      if (!uncounted.includes(zone.id)) uncounted.push(zone.id)
      return previous.get(zone.id)?.[type] ?? ZONE_CAP
    }
  }
  for (const zone of zones) {
    counted.push({ ...zone, video: await count(zone, 'video'), image: zone.kind === 'author' ? 0 : await count(zone, 'image') })
  }
  return { zones: counted, uncounted }
}

export function summarise(zones: readonly PoolZone[], likes: number, at = new Date(), cap = ZONE_CAP): PoolSummary {
  return {
    zones: zones.length,
    likes,
    connected: zones.reduce((sum, zone) => sum + zone.video + zone.image, 0),
    effective: zones.reduce((sum, zone) => sum + Math.min(cap, zone.video) + Math.min(cap, zone.image), 0),
    at,
  }
}

export async function readSummary(db: Db): Promise<PoolSummary | null> {
  const row = await db.collection(POOL).findOne({ _id: SUMMARY_ID } as Document, { maxTimeMS: QUERY_BUDGET_MS })
  return row ? { zones: Number(row.zones), likes: Number(row.likes), connected: Number(row.connected), effective: Number(row.effective), at: row.at as Date } : null
}

/** The zones as counted, the ones no like names any more removed, and the summary. */
export async function writeLikePool(db: Db, zones: readonly PoolZone[], summary: PoolSummary): Promise<void> {
  const pool = db.collection(POOL)
  if (zones.length) {
    await pool.bulkWrite(zones.map((zone) => ({ replaceOne: { filter: { _id: zone.id } as Document, replacement: { ...zone, _id: zone.id, updatedAt: summary.at }, upsert: true } })), { ordered: false })
  }
  await pool.deleteMany({ _id: { $nin: [SUMMARY_ID, ...zones.map((zone) => zone.id)] } } as Document)
  await pool.replaceOne({ _id: SUMMARY_ID } as Document, { ...summary, _id: SUMMARY_ID }, { upsert: true })
}

let cache: { at: number; pool: LikePool } | null = null

/** For tests only: the pool the next draws see, or null to forget it. */
export function __setLikePoolForTests(pool: LikePool | null): void {
  cache = pool ? { at: Number.MAX_SAFE_INTEGER / 2, pool } : null
}

/** The zones as last written. */
export async function readPoolZones(db: Db): Promise<PoolZone[]> {
  const rows = await db.collection(POOL).find({ kind: { $in: ['author', 'subject'] } }, { maxTimeMS: QUERY_BUDGET_MS }).toArray()
  return rows.map((row) => ({
    id: String(row._id), kind: row.kind as PoolZone['kind'], key: String(row.key),
    likeIds: Array.isArray(row.likeIds) ? row.likeIds.map(String) : [], video: Number(row.video) || 0, image: Number(row.image) || 0,
  }))
}

/** The pool as last written, read once every ten minutes per server. */
export async function loadLikePool(db: Db, now = Date.now()): Promise<LikePool> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.pool
  try {
    const zones = await readPoolZones(db)
    const pool = { zones, likeIds: [...new Set(zones.flatMap((zone) => zone.likeIds))] }
    cache = { at: now, pool }
    return pool
  } catch (error) {
    // After a failed read, the draw goes on without the likes for a minute rather than paying the failure every time.
    cache = { at: now - CACHE_TTL_MS + RETRY_AFTER_FAILURE_MS, pool: cache?.pool ?? EMPTY }
    throw error
  }
}

/** A zone, with the weight of what it holds for this format, capped: null when no zone holds any. */
export function pickZone(zones: readonly PoolZone[], type: 'video' | 'image', random: Rng, cap = ZONE_CAP): PoolZone | null {
  const weights = zones.map((zone) => Math.min(cap, Math.max(0, zone[type])))
  const sum = weights.reduce((total, weight) => total + weight, 0)
  if (!sum) return null
  let cursor = random() * sum
  let last: PoolZone | null = null
  for (let index = 0; index < zones.length; index += 1) {
    if (!weights[index]) continue
    last = zones[index]
    cursor -= weights[index]
    if (cursor < 0) return zones[index]
  }
  return last
}
