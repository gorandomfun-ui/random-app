import type { Db, Document, Filter, WithId } from 'mongodb'
import { getDb } from '@/lib/db'
import type { ItemType } from './types'

let cachedDb: Db | null = null
let lastDbFailureAt: number | null = null
const DB_RETRY_DELAY_MS = 60_000

export async function getDbSafe(): Promise<Db | null> {
  try {
    if (cachedDb) return cachedDb
    if (lastDbFailureAt && Date.now() - lastDbFailureAt < DB_RETRY_DELAY_MS) {
      return null
    }
    cachedDb = await getDb(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    lastDbFailureAt = null
    return cachedDb
  } catch {
    lastDbFailureAt = Date.now()
    return null
  }
}

export async function upsertCache(
  type: ItemType,
  key: Record<string, unknown>,
  doc: Record<string, unknown>,
): Promise<void> {
  const db = await getDbSafe()
  if (!db) return
  try {
    await db.collection('items').updateOne(
      { type, ...key },
      {
        $set: { type, ...key, ...doc, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date(), rand: Math.random() },
      },
      { upsert: true },
    )
  } catch {}
}

export async function touchLastShown(
  type: ItemType,
  key: Record<string, unknown>,
): Promise<void> {
  const db = await getDbSafe()
  if (!db) return
  try {
    await db.collection('items').updateOne({ type, ...key }, { $set: { lastShownAt: new Date() } })
  } catch {}
}

export async function sampleFromCache<T extends Document>(
  type: ItemType,
  extraMatch: Filter<T> = {},
): Promise<WithId<T> | null> {
  const db = await getDbSafe()
  if (!db) return null
  try {
    const collection = db.collection<T>('items')
    const rand = Math.random()
    const firstFilter: Filter<T> = { type, rand: { $gte: rand }, ...extraMatch }
    const first = await collection
      .find(firstFilter)
      .sort({ rand: 1 })
      .limit(1)
      .toArray()
    if (first.length) return first[0]
    const wrapFilter: Filter<T> = { type, rand: { $lt: rand }, ...extraMatch }
    const wrap = await collection
      .find(wrapFilter)
      .sort({ rand: 1 })
      .limit(1)
      .toArray()
    return wrap[0] || null
  } catch {
    return null
  }
}
