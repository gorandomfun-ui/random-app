import type { AnyBulkWriteOperation, Collection, Document } from 'mongodb'

import { buildWaveProfile, WAVE_PROFILE_VERSION, type WaveProfileSource } from './waveProfile'

export type WaveBackfillResult = {
  scanned: number
  updated: number
  skipped: number
  remaining: number
}

type WaveBackfillDocument = Document & WaveProfileSource & {
  waveProfile?: { version?: number } | null
}

export async function ensureWaveProfileIndexes(collection: Collection) {
  await Promise.all([
    collection.createIndex(
      { 'waveProfile.anchors': 1, type: 1 },
      { name: 'idx_wave_profile_anchors_type', background: true },
    ),
    collection.createIndex(
      { 'waveProfile.phrases': 1, type: 1 },
      { name: 'idx_wave_profile_phrases_type', background: true },
    ),
    collection.createIndex(
      { 'waveProfile.concepts': 1, type: 1 },
      { name: 'idx_wave_profile_concepts_type', background: true },
    ),
    collection.createIndex(
      { 'waveProfile.facets': 1, type: 1 },
      { name: 'idx_wave_profile_facets_type', background: true },
    ),
    collection.createIndex(
      { type: 1, 'waveProfile.version': 1 },
      { name: 'idx_wave_profile_version', background: true },
    ),
  ]).catch(() => undefined)
}

export async function backfillWaveProfiles(
  collection: Collection<WaveBackfillDocument>,
  { limit = 400, batchSize = 100 }: { limit?: number; batchSize?: number } = {},
): Promise<WaveBackfillResult> {
  const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)))
  const safeBatchSize = Math.max(20, Math.min(250, Math.floor(batchSize)))
  const filter = {
    type: { $in: ['image', 'video', 'quote', 'fact', 'joke', 'web'] },
    'waveProfile.version': { $ne: WAVE_PROFILE_VERSION },
  }
  const cursor = collection.find(filter, { batchSize: safeBatchSize }).limit(safeLimit)
  let scanned = 0
  let updated = 0
  let skipped = 0
  let operations: AnyBulkWriteOperation<WaveBackfillDocument>[] = []

  const flush = async () => {
    if (!operations.length) return
    const result = await collection.bulkWrite(operations, { ordered: false })
    updated += result.modifiedCount
    operations = []
  }

  for await (const doc of cursor) {
    scanned += 1
    const profile = buildWaveProfile(doc)
    if (!profile.anchors.length && !profile.concepts.length && !profile.phrases.length) {
      skipped += 1
    }
    operations.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            waveProfile: profile,
            waveProfileUpdatedAt: new Date(),
          },
        },
      },
    })
    if (operations.length >= safeBatchSize) await flush()
  }
  await flush()
  const remaining = await collection.countDocuments(filter, { limit: 1 })
  void ensureWaveProfileIndexes(collection)
  return { scanned, updated, skipped, remaining }
}
