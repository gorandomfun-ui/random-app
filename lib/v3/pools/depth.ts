/**
 * How deep each pool query has already been read.
 *
 * The pools line used to ask the same queries every night and always read the
 * first page of results: the most mainstream twenty-five, already in the
 * catalogue. Two thirds of a night's harvest were duplicates.
 *
 * So each query keeps the page it reached. The next night resumes there, one
 * page further from the mainstream. When a page brings almost nothing new the
 * query is tired: after two such pages it goes back to the first one, because
 * that is where the platform puts what has just been uploaded.
 *
 * Dailymotion asks nothing for this. A page is a page, deep or shallow.
 */

import type { Db, Document, Filter } from 'mongodb'

export const DEPTH_COLLECTION = 'ingest_depth_v3'
/** Dailymotion stops serving results beyond this depth. */
export const MAX_PAGE = 40
/** Under this share of new videos, the page is counted dry. */
export const DRY_YIELD = 0.12
/** Dry pages in a row before the query starts over at the first page. */
export const DRY_BEFORE_RESET = 2

export type DepthKey = { line: string; provider: string; query: string; sort: string }
export type DepthState = { page: number; dry: number }

export function depthId({ line, provider, query, sort }: DepthKey): string {
  return `${line}:${provider}:${sort}:${query}`.toLowerCase()
}

/** Where each of these queries stands. Missing ones start at the first page. */
export async function loadDepth(db: Db, keys: DepthKey[]): Promise<Map<string, DepthState>> {
  const ids = [...new Set(keys.map(depthId))]
  const state = new Map<string, DepthState>()
  if (!ids.length) return state
  // The identifiers are our own strings, not the driver's default object ids.
  const filter = { _id: { $in: ids } } as unknown as Filter<Document>
  const rows = await db.collection<Document>(DEPTH_COLLECTION)
    .find(filter, { maxTimeMS: 4000 })
    .toArray()
    .catch(() => [] as Document[])
  for (const row of rows) {
    const page = Number(row.page)
    const dry = Number(row.dry)
    state.set(String(row._id), {
      page: Number.isFinite(page) && page >= 1 ? Math.min(MAX_PAGE, Math.floor(page)) : 1,
      dry: Number.isFinite(dry) && dry >= 0 ? Math.floor(dry) : 0,
    })
  }
  return state
}

/**
 * What a page just read makes of the query's depth: where to read next time,
 * and how many dry pages have followed one another.
 */
export function nextDepth(current: DepthState, scanned: number, fresh: number): DepthState {
  const paid = scanned > 0 && fresh / scanned >= DRY_YIELD
  if (paid) return { page: current.page >= MAX_PAGE ? 1 : current.page + 1, dry: 0 }
  const dry = current.dry + 1
  // A tired query goes back to the top, where the platform puts the new uploads.
  if (dry >= DRY_BEFORE_RESET) return { page: 1, dry: 0 }
  return { page: current.page >= MAX_PAGE ? 1 : current.page + 1, dry }
}

/** Writes back where each query now stands. One call for the whole pass. */
export async function saveDepth(db: Db, entries: Array<{ key: DepthKey; state: DepthState }>): Promise<void> {
  if (!entries.length) return
  const at = new Date()
  await db.collection<Document>(DEPTH_COLLECTION).bulkWrite(
    entries.map(({ key, state }) => ({
      updateOne: {
        filter: { _id: depthId(key) } as unknown as Filter<Document>,
        update: { $set: { ...key, page: state.page, dry: state.dry, at } },
        upsert: true,
      },
    })),
    { ordered: false },
  ).catch(() => undefined)
}
