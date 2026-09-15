import { createHash, randomUUID } from 'node:crypto'
import { type Db, type Collection } from 'mongodb'

export type SubjectWork = { _id: string; requestedAt: Date; due: Date; leaseUntil: Date; expiresAt: Date;
  reason: string; attempts: number; status: 'pending' | 'done'; priority?: number; leaseToken?: string;
  lastOutcome?: string; subject?: string | null }
export const subjectWorkCollection = (db: Db): Collection<SubjectWork> => db.collection('discovery_subject_work_v1')

/** Content maintenance only: no user ID, IP, browsing history or preference learning. */
export async function requestSubjectWork(db: Db, itemId: string, reason: string, now = Date.now(), privateReference = false): Promise<boolean> {
  if (!/^[a-f\d]{24}$/i.test(itemId) || process.env.RANDOM_SUBJECT_MAINTENANCE_ENABLED === '0') return false
  const c = subjectWorkCollection(db)
  if (await c.findOne({ _id: itemId }, { projection: { _id: 1 }, timeoutMS: 180 })) return false
  // One global hourly allowance bounds public writes independently of visitors/requests.
  if (!privateReference) {
    const cap = db.collection<{ _id: string; count: number; expiresAt: Date }>('discovery_subject_limits_v1')
    const key = String(Math.floor(now / 3600000))
    try {
      await cap.updateOne({ _id: key }, { $setOnInsert: { count: 0, expiresAt: new Date(now + 2 * 86400000) } }, { upsert: true, maxTimeMS: 180 })
    } catch (error) { if ((error as { code?: number }).code !== 11000) throw error }
    const permit = await cap.findOneAndUpdate({ _id: key, count: { $lt: 96 } }, { $inc: { count: 1 } }, { maxTimeMS: 180 })
    if (!permit) return false
  }
  await c.updateOne({ _id: itemId }, { $setOnInsert: { requestedAt: new Date(now), due: new Date(now),
    leaseUntil: new Date(0), expiresAt: new Date(now + 30 * 86400000), reason: reason.slice(0, 60), priority: privateReference ? 1 : 0, attempts: 0, status: 'pending' } },
  { upsert: true, maxTimeMS: 180 })
  return true
}
export async function claimSubjectWork(db: Db, now: number) {
  return subjectWorkCollection(db).findOneAndUpdate({ status: 'pending', due: { $lte: new Date(now) }, leaseUntil: { $lte: new Date(now) } },
    { $set: { leaseUntil: new Date(now + 120000), leaseToken: randomUUID() } },
    { sort: { priority: -1, due: 1 }, returnDocument: 'after', maxTimeMS: 500 })
}
export function entityCacheKey(query: string, language: string): string {
  return createHash('sha256').update(`${language}:${query}`).digest('hex')
}
/** Only small new collections. Never rebuild the million-item catalogue's indexes. */
export async function installSubjectWorkIndexes(db: Db) {
  await subjectWorkCollection(db).createIndex({ status: 1, priority: -1, due: 1, leaseUntil: 1 }, { name: 'subject_work_due' })
  await db.collection('discovery_public_subjects_v1').createIndex({ due: 1, leaseUntil: 1 }, { name: 'public_subject_due' })
  for (const name of ['discovery_subject_work_v1', 'discovery_subject_limits_v1', 'discovery_entity_cache_v1', 'discovery_public_subjects_v1']) {
    await db.collection(name).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'subject_expiry' })
  }
}
