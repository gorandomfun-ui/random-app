/**
 * Google's custom search is free for 100 searches a day and paid beyond
 * ($5 per 1,000). The owner paid about 5 € a month for pages he found dull;
 * since 28 September the web ingest asks it at most 90 times a day, so it
 * costs nothing. Its day starts at midnight in California, like YouTube's.
 * (Google closes the service to existing customers on 1 January 2027.)
 */

import type { Db } from 'mongodb'

export const CSE_DAILY_FREE = 90
export const WEB_QUOTA = 'web_quota_v1'

export function cseDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** One search, if the day still has one; false once the free allowance is spent. */
export async function reserveCseSearch(db: Db, now = new Date()): Promise<boolean> {
  const _id = `cse:${cseDay(now)}`
  const collection = db.collection<{ _id: string; used: number; updatedAt: Date }>(WEB_QUOTA)
  await collection.updateOne({ _id }, { $setOnInsert: { used: 0, updatedAt: now } }, { upsert: true })
  const taken = await collection.updateOne({ _id, used: { $lt: CSE_DAILY_FREE } }, { $inc: { used: 1 }, $set: { updatedAt: now } })
  return taken.modifiedCount === 1
}

export async function cseUsed(db: Db, now = new Date()): Promise<number> {
  const doc = await db.collection<{ _id: string; used: number }>(WEB_QUOTA).findOne({ _id: `cse:${cseDay(now)}` })
  return doc?.used ?? 0
}
