/**
 * The site's count of what it served. Every visual a draw hands out adds one
 * to its `served.n` and stamps `served.at`: one write by id, nothing heavy.
 * The session's memory lives in one browser and knows nothing of the owner's
 * other five devices (30 September: the same Avengers on the iPad and the
 * iPhone); this count lives on the site, and the wheel serves the least
 * served first — never an exclusion, which a million visitors would exhaust.
 * `RANDOM_SERVED_COUNT=0` stops the writes.
 */

import { ObjectId, type Db } from 'mongodb'

import { BILIBILI } from '../v3/bilibili'

export const servedCountOn = (): boolean => process.env.RANDOM_SERVED_COUNT !== '0'

const WRITE_BUDGET_MS = 400

/** Where a content's count is kept: with the content, so Bilibili's videos in their own collection (21 October: every
 * count of theirs had gone to `items`, where no row has their ids, and none was ever kept). */
export const servedCollection = (provider?: string | null): string => (provider === 'bilibili' ? BILIBILI : 'items')

export async function countServed(db: Db, id: string, now: number, provider?: string | null): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const result = await db.collection(servedCollection(provider)).updateOne({ _id: new ObjectId(id) }, { $inc: { 'served.n': 1 }, $set: { 'served.at': new Date(now) } }, { maxTimeMS: WRITE_BUDGET_MS })
  return result.matchedCount > 0
}
