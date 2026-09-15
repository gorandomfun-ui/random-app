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
/** Refresh a bounded sample from current source snapshots, even when the algorithm version is unchanged. */
export async function hydrateOwnerReferences(db: Db, references: OwnerReference[]): Promise<OwnerReference[]> {
  const refs = references.slice(0, 64)
  const ids = [...new Set(refs.flatMap(r => r.itemId && ObjectId.isValid(r.itemId) ? [r.itemId] : []))]
  const profiles = new Map<string, { profile: OwnerReference['profile']; key: string }>()
  if (ids.length) {
    const rows = await db.collection('items').find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, {
      projection: { sourceMetadata: 1, discoveryProfile: 1, discoveryVersion: 1, discoveryProvenance: 1,
        metadataRefreshedAt: 1, type: 1, provider: 1, title: 1, description: 1, apiTags: 1, text: 1,
        quiz: 1, variant: 1, lang: 1, url: 1, videoId: 1, source: 1, pageUrl: 1 }, timeoutMS: 650,
    }).limit(64).maxTimeMS(400).toArray()
    for (const row of rows) profiles.set(String(row._id), { profile: profileFromRow(row), key: canonicalMediaKey(row) })
  }
  return refs.map(reference => {
    const current = profiles.get(reference.itemId ?? '')
    const validSnapshot = !reference.itemId && reference.profile.signalVersion === SIGNAL_VERSION &&
      reference.profile.subject?.version === SUBJECT_VERSION
    const profile = current?.profile ?? (validSnapshot ? reference.profile : buildProfile({}))
    return { ...reference, profile,
      // contentKey is the reference's stable revocation fence; canonical identity is used only for display matching.
      familyId: current && reference.familyId === reference.profile.family ? profile.family : reference.familyId }
  })
}

export async function loadOwnerReferences(db: Db, ownerId: string, random = Math.random): Promise<OwnerReference[]> {
  if (!ownerId) return []
  const collection = db.collection<OwnerReference>('discovery_owner_references_v2'), point = random()
  const match = { ownerId, active: true }
  const references = await collection.find({ ...match, rand: { $gte: point } }, { timeoutMS: 650 })
    .sort({ rand: 1 }).limit(32).maxTimeMS(400).toArray()
  if (references.length < 32) references.push(...await collection.find({ ...match,
    $or: [{ rand: { $lt: point } }, { rand: { $exists: false } }] }, { timeoutMS: 650 })
    .sort({ rand: 1 }).limit(32 - references.length).maxTimeMS(400).toArray())
  return hydrateOwnerReferences(db, references)
}

/** References are sampled once per draw; no public likes, provider requests or permanent assignments. */
export async function applyOwnerReferences<T>(db: Db, items: Candidate<T>[], ownerId: string) {
  return ownerId ? assignEditorial(items, await loadOwnerReferences(db, ownerId), ownerId)
    : { candidates: items, referenceCounts: {} }
}
export async function installOwnerIndexes(db: Db): Promise<void> {
  await db.collection('discovery_access_attempts_v2').createIndex({ expires: 1 }, { expireAfterSeconds: 0, name: 'discovery_access_expiry' })
  const c = db.collection('discovery_owner_references_v2')
  await c.createIndex({ ownerId: 1, contentKey: 1 }, { unique: true, name: 'discovery_owner_content_v2' })
  await c.createIndex({ ownerId: 1, active: 1, rand: 1 }, { name: 'discovery_owner_rand_v2' })
  await c.createIndex({ ownerId: 1, active: 1, explorationScheduledAt: 1, _id: 1 }, { name: 'discovery_owner_schedule_v3' })
  await db.collection('discovery_tasks_v2').createIndex({ 'spec.focus.ownerId': 1, 'spec.focus.referenceKey': 1 },
    { name: 'discovery_task_reference_v3' })
}
