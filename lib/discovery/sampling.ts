import type { Db, Document, Filter } from 'mongodb'
import type { CatalogueRow } from './catalog'
import type { Rng } from './random'

export type PoolRetrievalReport = { broadCandidates: number; focusedCandidates: number;
  queryFailures: number; broadFallback: boolean; elapsedMs: number }

export const CATALOGUE_SAMPLE_SIZE = 384
export const CATALOGUE_CANDIDATES = 96
export const FOCUS_WINDOW_WIDTH = 1 / 256

/** A new circular slice on every request, independent of session and preferences.
 * Unlike a successor lookup, an empty slice STAYS empty. A singleton cannot be
 * returned on every request just because its family/subject is scarce. */
export function randomWindow(random: Rng): Filter<Document> {
  const start = random(), end = start + FOCUS_WINDOW_WIDTH
  return end <= 1 ? { rand: { $gte: start, $lt: end } } : { $or: [
    { rand: { $gte: start, $lt: 1 } }, { rand: { $gte: 0, $lt: end - 1 } },
  ] }
}

/** Keep $sample FIRST: Mongo's random cursor can sample a large collection
 * without a full filtered sort. Filtering first would destroy that property.
 * The broad sample also reaches legacy rows whose rand is missing or clustered.
 * On small collections Mongo can use a sort; the driver/server deadlines remain.
 * No global count, catalogue scan, visitor history or external API is required. */
export async function sampleCatalogue(db: Db, match: Filter<Document>): Promise<CatalogueRow[]> {
  return db.collection('items').aggregate<CatalogueRow>([
    { $sample: { size: CATALOGUE_SAMPLE_SIZE } },
    { $match: match },
    { $limit: CATALOGUE_CANDIDATES },
  ], { maxTimeMS: 600, timeoutMS: 800, allowDiskUse: false }).toArray()
}

export async function sampleWindow(db: Db, match: Filter<Document>, window: Filter<Document>, limit: number): Promise<CatalogueRow[]> {
  return db.collection('items').find({ $and: [match, window] }, { timeoutMS: 750 })
    .sort({ rand: 1 }).limit(limit).maxTimeMS(550).toArray()
}
