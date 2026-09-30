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

export const servedCountOn = (): boolean => process.env.RANDOM_SERVED_COUNT !== '0'

const WRITE_BUDGET_MS = 400

export async function countServed(db: Db, id: string, now: number): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const result = await db.collection('items').updateOne({ _id: new ObjectId(id) }, { $inc: { 'served.n': 1 }, $set: { 'served.at': new Date(now) } }, { maxTimeMS: WRITE_BUDGET_MS })
  return result.matchedCount > 0
}
