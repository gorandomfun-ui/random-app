import type { Db } from 'mongodb'
import { assignEditorial, type OwnerReference } from './editorial'
import type { Candidate } from './types'

/** Call from authenticated owner tooling only. There is deliberately no public write route here. */
export async function saveOwnerReference(db: Db, reference: OwnerReference): Promise<void> {
  if (!reference.ownerId || !reference.contentKey || !reference.familyId || !['video', 'image'].includes(reference.type)) throw new Error('Invalid owner reference')
  await db.collection<OwnerReference>('discovery_owner_references_v2').updateOne(
    { ownerId: reference.ownerId, contentKey: reference.contentKey }, { $set: reference, $setOnInsert: { rand: Math.random() } }, { upsert: true })
}
/** No permanent assignments: removal takes effect at the next uncached read. No public likes are read. */
export async function applyOwnerReferences<T>(db: Db, items: Candidate<T>[], ownerId: string) {
  if (!ownerId) return { candidates: items, referenceCounts: {} }
  // Rotate a bounded reference sample instead of disabling curation after the 65th like.
  // `rand` is stable across updates; every reference can participate over time.
  const collection = db.collection<OwnerReference>('discovery_owner_references_v2'), point = Math.random()
  const match = { ownerId, active: true }
  const references = await collection.find({ ...match, rand: { $gte: point } }).sort({ rand: 1 }).limit(64).maxTimeMS(400).toArray()
  if (references.length < 64) references.push(...await collection.find({ ...match, $or: [{ rand: { $lt: point } }, { rand: { $exists: false } }] })
    .sort({ rand: 1 }).limit(64 - references.length).maxTimeMS(400).toArray())
  return assignEditorial(items, references, ownerId)
}
export async function installOwnerIndexes(db: Db): Promise<void> {
  await db.collection('discovery_access_attempts_v2').createIndex({ expires: 1 }, { expireAfterSeconds: 0, name: 'discovery_access_expiry' })
  const c = db.collection('discovery_owner_references_v2')
  await c.createIndex({ ownerId: 1, contentKey: 1 }, { unique: true, name: 'discovery_owner_content_v2' })
  await c.createIndex({ ownerId: 1, active: 1, rand: 1 }, { name: 'discovery_owner_rand_v2' })
}
