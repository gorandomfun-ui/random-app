/** Shared read-only queries and constants for the audit sections. */

import type { Db } from 'mongodb'

export const ITEMS = 'items'

/** A genuine Dailymotion channel id; anything else is a category slug. */
export const REAL_DAILYMOTION_CHANNEL = /^x[a-z0-9]+$/i

export async function groupCount(db: Db, field: string, limit = 40): Promise<Array<[string, number]>> {
  const rows = await db
    .collection(ITEMS)
    .aggregate(
      [
        { $group: { _id: `$${field}`, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: limit },
      ],
      { allowDiskUse: true },
    )
    .toArray()
  return rows.map((row) => [String(row._id ?? '(absent)'), row.n as number])
}
