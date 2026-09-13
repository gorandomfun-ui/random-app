import { ObjectId, type Db } from 'mongodb'
import { profileFromRow, canonicalMediaKey } from './catalog'
import { buildProfile, SIGNAL_VERSION } from './profile'
import { assignEditorial, type OwnerReference } from './editorial'
import type { Candidate } from './types'
import { SUBJECT_VERSION } from './subjects'

/** Call from authenticated owner tooling only. There is deliberately no public write route here. */
export async function saveOwnerReference(db: Db, reference: OwnerReference): Promise<void> {
  if (!reference.ownerId || !reference.contentKey || !reference.familyId || !['video', 'image'].includes(reference.type)) throw new Error('Invalid owner reference')
  await db.collection<OwnerReference>('discovery_owner_references_v2').updateOne(
    { ownerId: reference.ownerId, $or: [{ contentKey: reference.contentKey },
      ...(reference.itemId ? [{ itemId: reference.itemId }] : [])] },
    { $set: reference, $setOnInsert: { rand: Math.random() } }, { upsert: true })
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
  // Old references contain the former permissive profile. Refresh only this bounded
  // sample using source snapshots; no writes and no provider calls are involved.
  const fresh = (r: OwnerReference) => r.profile.signalVersion === SIGNAL_VERSION && r.profile.subject?.version === SUBJECT_VERSION
  const stale = references.filter(r => !fresh(r))
  const ids = [...new Set(stale.map(r => r.itemId).filter((id): id is string => Boolean(id && ObjectId.isValid(id))))]
  const profiles = new Map<string, { profile: OwnerReference['profile']; key: string }>()
  if (ids.length) {
    try {
      const rows = await db.collection('items').find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, {
        projection: { sourceMetadata: 1, discoveryProfile: 1, discoveryVersion: 1, type: 1, provider: 1,
          title: 1, description: 1, apiTags: 1, text: 1, quiz: 1, variant: 1, lang: 1, url: 1, videoId: 1 },
      }).limit(64).maxTimeMS(400).toArray()
      for (const row of rows) profiles.set(String(row._id), { profile: profileFromRow(row), key: canonicalMediaKey(row) })
    } catch { /* Stale similarity must fail closed; autonomous selection remains available. */ }
  }
  return assignEditorial(items, references.map(reference => {
    if (fresh(reference)) return reference
    const current = profiles.get(reference.itemId ?? '')
    return { ...reference, profile: current?.profile ?? buildProfile({}), contentKey: current?.key ?? reference.contentKey,
      familyId: current && reference.familyId === reference.profile.family ? current.profile.family : reference.familyId }
  }), ownerId)
}
export async function installOwnerIndexes(db: Db): Promise<void> {
  await db.collection('discovery_access_attempts_v2').createIndex({ expires: 1 }, { expireAfterSeconds: 0, name: 'discovery_access_expiry' })
  const c = db.collection('discovery_owner_references_v2')
  await c.createIndex({ ownerId: 1, contentKey: 1 }, { unique: true, name: 'discovery_owner_content_v2' })
  await c.createIndex({ ownerId: 1, active: 1, rand: 1 }, { name: 'discovery_owner_rand_v2' })
}
