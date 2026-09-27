/**
 * Fresh of the day at the draw. The day's list (written at 09:05 by
 * lib/v3/ingest/lines/fresh.ts) holds the thousand videos the world is
 * watching; the first ten videos of a session are drawn from it at random,
 * never one this device was already shown today, and the next ten the next
 * time the visitor comes back. Once a device has seen them all, sessions open
 * as they used to. The next day the list is new, and yesterday's videos are
 * ordinary content again, in the common draw and the cool pool.
 *
 * The device keeps which places of the day's list it has seen (one bit each,
 * lib/discovery/freshSeen.ts) and sends it with every draw. The list is one
 * small document, read once every few minutes per server instance.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import { candidateFromRow, type CatalogueRow } from './catalog'
import { isSeen, seenBytes, type FreshSeen } from './freshSeen'
import { hardEligible, type Intent, type PoolResult, type Session } from './pool'

export { parseFreshSeen } from './freshSeen'

export const FRESH_COLLECTION = 'fresh_daily_v1'
export const FRESH_PER_SESSION = 10
/** A list older than this is yesterday's news: no fresh opening rather than a stale one. */
const LIST_MAX_AGE_MS = 36 * 3_600_000
const LIST_CACHE_MS = 5 * 60_000
/** How many unseen places one draw looks at, at random. */
const SAMPLE = 24
/** A fresh video never repeats a channel among the session's last ten contents. */
const AUTHOR_SPACING = 10

type FreshList = { day: string; ids: string[] }

export function freshEnabled(): boolean {
  return process.env.RANDOM_FRESH_ENABLED !== '0'
}

let cache: { at: number; list: FreshList | null } | null = null

async function dayList(db: Db, now: number): Promise<FreshList | null> {
  if (cache && now - cache.at < LIST_CACHE_MS) return cache.list
  const docs = await db.collection(FRESH_COLLECTION).find({ at: { $gte: new Date(now - LIST_MAX_AGE_MS) } } as Document, { sort: { at: -1 }, limit: 1, projection: { ids: 1 }, maxTimeMS: 1500 }).toArray()
  const doc = docs[0]
  const list = doc && Array.isArray(doc.ids) ? { day: String(doc._id), ids: (doc.ids as unknown[]).map(String).filter((id) => /^[a-f\d]{24}$/i.test(id)) } : null
  cache = { at: now, list }
  return list
}

/** Up to `count` places of the list, at random, among those this device has not seen today. */
export function unseenSample(size: number, day: string, seen: FreshSeen | null, count: number, random: () => number): number[] {
  const bytes = seenBytes(seen, day)
  const open: number[] = []
  for (let index = 0; index < size; index += 1) if (!isSeen(bytes, index)) open.push(index)
  for (let index = open.length - 1; index > 0 && open.length - index <= count; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[open[index], open[other]] = [open[other], open[index]]
  }
  return open.slice(-count).reverse()
}

export async function selectFresh<T>(db: Db, ticket: Intent, state: Session, seen: FreshSeen | null,
  decode: (row: CatalogueRow) => T | null, now: number, random: () => number = Math.random): Promise<PoolResult<T> | null> {
  if (ticket.type !== 'video' || (state.freshServed ?? 0) >= FRESH_PER_SESSION) return null
  const list = await dayList(db, now)
  if (!list?.ids.length) return null
  const picks = unseenSample(list.ids.length, list.day, seen, SAMPLE, random)
  if (!picks.length) return null
  const rows = await db.collection('items').find({ _id: { $in: picks.map((index) => new ObjectId(list.ids[index])) } } as Document, { maxTimeMS: 2000 }).toArray()
  const byId = new Map(rows.map((row) => [String(row._id), row]))
  const recentAuthors = new Set(state.recent.slice(-AUTHOR_SPACING).map((entry) => entry.authorKey).filter(Boolean))
  let fallback: PoolResult<T> | null = null
  for (const index of picks) {
    const row = byId.get(list.ids[index])
    if (!row) continue
    const payload = decode(row as CatalogueRow)
    if (payload == null) continue
    const candidate = candidateFromRow(row as CatalogueRow, payload, now)
    if (!hardEligible(candidate, ticket, state)) continue
    const result: PoolResult<T> = { item: { ...candidate, fresh: true, freshDay: list.day, freshPosition: index }, branch: 'general', fallback: false }
    if (!candidate.authorKey || !recentAuthors.has(candidate.authorKey)) return result
    fallback ??= result
  }
  return fallback
}
