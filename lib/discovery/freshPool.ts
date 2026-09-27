/**
 * Fresh of the day at the draw: the first ten videos of a session come from
 * the day's list (written at 06:00 by lib/v3/ingest/lines/fresh.ts), the
 * next ten the next time the visitor comes back, and so on down the list;
 * once the device has been through it all, the session opens as it used to.
 *
 * The device keeps two things only — the list's day and how far it went —
 * and sends them with every draw. The list is one small document, read once
 * every few minutes per server instance.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import { candidateFromRow, type CatalogueRow } from './catalog'
import { hardEligible, type Intent, type PoolResult, type Session } from './pool'

export const FRESH_COLLECTION = 'fresh_daily_v1'
export const FRESH_PER_SESSION = 10
/** A list older than this is yesterday's news: no fresh opening rather than a stale one. */
const LIST_MAX_AGE_MS = 36 * 3_600_000
const LIST_CACHE_MS = 5 * 60_000
/** How far down the list one draw looks for something the visitor has not seen. */
const WINDOW = 40
const WINDOWS = 3

export type FreshCursor = { day: string; position: number }
type FreshList = { day: string; ids: string[] }

export function freshEnabled(): boolean {
  return process.env.RANDOM_FRESH_ENABLED !== '0'
}

export function parseFreshCursor(value: unknown): FreshCursor | null {
  if (!value || typeof value !== 'object') return null
  const { day, position } = value as Record<string, unknown>
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0 || position > 100_000) return null
  return { day, position }
}

/** Where this device resumes in the day's list: a cursor from another day starts at the top. */
export function freshStart(cursor: FreshCursor | null, day: string): number {
  return cursor && cursor.day === day ? cursor.position : 0
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

export async function selectFresh<T>(db: Db, ticket: Intent, state: Session, cursor: FreshCursor | null,
  decode: (row: CatalogueRow) => T | null, now: number): Promise<PoolResult<T> | null> {
  if (ticket.type !== 'video' || (state.freshServed ?? 0) >= FRESH_PER_SESSION) return null
  const list = await dayList(db, now)
  if (!list?.ids.length) return null
  let start = freshStart(cursor, list.day)
  for (let round = 0; round < WINDOWS && start < list.ids.length; round += 1, start += WINDOW) {
    const window = list.ids.slice(start, start + WINDOW)
    const rows = await db.collection('items').find({ _id: { $in: window.map((id) => new ObjectId(id)) } } as Document, { maxTimeMS: 2000 }).toArray()
    const byId = new Map(rows.map((row) => [String(row._id), row]))
    for (let index = 0; index < window.length; index += 1) {
      const row = byId.get(window[index])
      if (!row) continue
      const payload = decode(row as CatalogueRow)
      if (payload == null) continue
      const candidate = candidateFromRow(row as CatalogueRow, payload, now)
      if (!hardEligible(candidate, ticket, state)) continue
      return { item: { ...candidate, fresh: true, freshDay: list.day, freshPosition: start + index + 1 }, branch: 'general', fallback: false }
    }
  }
  return null
}
