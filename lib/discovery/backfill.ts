import type { Db, Document } from 'mongodb'
import { buildProfile } from './profile'
import type { SourceMetadata } from './types'

/** Fields whose construction was checked in the pinned repository. No old tags or keywords. */
export function legacySourceSnapshot(row: Record<string, unknown>): SourceMetadata {
  const str = (value: unknown) => typeof value === 'string' ? value : undefined
  const apiTags = Array.isArray(row.apiTags) ? row.apiTags.filter((x): x is string => typeof x === 'string') : undefined
  if (row.sourceMetadata && typeof row.sourceMetadata === 'object') {
    const source = row.sourceMetadata as SourceMetadata
    return row.provider === 'dailymotion' && row.discoveryProvenance === 'legacy-source-fields' && !row.metadataRefreshedAt
      ? { ...source, legacyUnverified: true } : source
  }
  if (row.type === 'video' && row.provider === 'youtube') return { title: str(row.title), description: str(row.description), tags: apiTags }
  // Old DM titles could be the search query, and old channelId could be a category. Do not infer either.
  if (row.type === 'video' && row.provider === 'dailymotion') return { description: str(row.description), legacyUnverified: true }
  if (row.type === 'image' && ['giphy', 'tenor', 'pexels', 'pixabay'].includes(String(row.provider))) return { title: str(row.title), description: str(row.description) }
  if (['quote', 'joke', 'fact'].includes(String(row.type))) {
    const quiz = row.quiz as { question?: string } | undefined
    return { title: row.variant === 'quiz' ? str(quiz?.question) ?? str(row.text) : str(row.text), language: str(row.lang) }
  }
  return {}
}
/** One small batch; rerun to resume. Single migration runner only. No provider/network request. */
export async function backfillBatch(db: Db, limit = 200): Promise<{ processed: number; finished: boolean }> {
  const checkpoints = db.collection<Document & { _id: string }>('discovery_checkpoints_v2')
  const checkpoint = await checkpoints.findOne({ _id: 'source-profiles' })
  const items = db.collection('items')
  const rows = await items.find({ discoveryVersion: { $ne: 2 }, ...(checkpoint?.lastId ? { _id: { $gt: checkpoint.lastId } } : {}) })
    .sort({ _id: 1 }).limit(Math.max(1, Math.min(500, limit))).maxTimeMS(1000).toArray()
  if (!rows.length) return { processed: 0, finished: true }
  const operations = rows.map(row => {
    const sourceMetadata = legacySourceSnapshot(row), profile = buildProfile(sourceMetadata)
    return { updateOne: { filter: { _id: row._id, discoveryVersion: { $ne: 2 } }, update: { $set: {
      sourceMetadata, discoveryProfile: profile, discoveryFamily: profile.family, discoveryVersion: 2,
      discoveryProvenance: 'legacy-source-fields',
      ...(typeof row.rand !== 'number' ? { rand: Math.random() } : {}),
    } } } }
  })
  await items.bulkWrite(operations, { ordered: false })
  await checkpoints.updateOne({ _id: 'source-profiles' }, { $set: { lastId: rows.at(-1)!._id, updatedAt: new Date() } }, { upsert: true })
  return { processed: rows.length, finished: false }
}
