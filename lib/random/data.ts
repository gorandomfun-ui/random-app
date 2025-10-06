import type { Db, WithId } from 'mongodb'
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
      { $set: { type, ...key, ...doc, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
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

export async function sampleFromCache<T extends Record<string, unknown>>(
  type: ItemType,
  extraMatch: Record<string, unknown> = {},
): Promise<WithId<T> | null> {
  const db = await getDbSafe()
  if (!db) return null
  try {
    const [doc] = await db
      .collection('items')
      .aggregate<WithId<T>>([
        { $match: { type, ...extraMatch } },
        { $sample: { size: 1 } },
      ])
      .toArray()
    return (doc as WithId<T>) || null
  } catch {
    return null
  }
}
