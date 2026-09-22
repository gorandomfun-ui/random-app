/**
 * The curator's likes, as zones.
 *
 * A like is never shown. It says what to look for — the subject its title
 * names, its author, its genre — and the pool draws around it, differently
 * each time. The zones grow as the ingestion keeps searching around the
 * likes.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import { containsAlias } from '../tagging/normalize'
import type { Angle, Era, ItemType, SubjectRef, Universe } from '../types'

const OWNER_REFERENCES = 'discovery_owner_references_v2'
/** Forty likes that change a few times a week: one read every ten minutes per server is plenty. */
const CACHE_TTL_MS = 10 * 60_000
const QUERY_BUDGET_MS = 3_000

export type LikeZone = {
  id: string
  type: ItemType
  /** The subjects the like's title names — a subject caught in the description is a detail, not a zone. */
  subjectIds: string[]
  channelKey?: string
  universe: Universe
  angle: Angle
  era: Era
}

let cache: { at: number; zones: LikeZone[] } | null = null

/** For tests only: the zones the next draws see, or null to forget them. */
export function __setLikeZonesForTests(zones: LikeZone[] | null): void {
  cache = zones ? { at: Number.MAX_SAFE_INTEGER / 2, zones } : null
}

/** A like is stored as "youtube:ID" or "dailymotion:ID"; the video keeps its id under either spelling. */
function videoIdsOf(contentKey: string): string[] {
  const separator = contentKey.indexOf(':')
  if (separator < 0) return []
  const provider = contentKey.slice(0, separator)
  const id = contentKey.slice(separator + 1)
  if (!id) return []
  if (provider === 'youtube') return [id]
  if (provider === 'dailymotion') return [id, contentKey]
  return []
}

function namedSubjects(title: string | null | undefined, subjects: SubjectRef[] | undefined): string[] {
  if (!title || !subjects?.length) return []
  return subjects
    .filter((subject) => containsAlias(title, subject.id.slice(subject.id.indexOf(':') + 1).replace(/-/g, ' ')))
    .map((subject) => subject.id)
}

/** After a failed load, the draw goes on without the likes for a minute rather than paying the failure every time. */
const RETRY_AFTER_FAILURE_MS = 60_000

export async function loadLikeZones(db: Db, now = Date.now()): Promise<LikeZone[]> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.zones
  try {
    return await readLikeZones(db, now)
  } catch (error) {
    cache = { at: now - CACHE_TTL_MS + RETRY_AFTER_FAILURE_MS, zones: cache?.zones ?? [] }
    throw error
  }
}

async function readLikeZones(db: Db, now: number): Promise<LikeZone[]> {

  const references = (await db
    .collection(OWNER_REFERENCES)
    .find({ active: true }, { projection: { contentKey: 1, itemId: 1 }, maxTimeMS: QUERY_BUDGET_MS })
    .toArray()) as Array<{ contentKey?: string; itemId?: string }>
  const withId = (reference: { itemId?: string }): reference is { itemId: string } =>
    typeof reference.itemId === 'string' && ObjectId.isValid(reference.itemId)
  const ids = references.filter(withId).map((reference) => new ObjectId(reference.itemId))
  // Only a like stored without its item id is looked up by its video id.
  const videoIds = references.filter((reference) => !withId(reference)).flatMap((reference) => videoIdsOf(String(reference.contentKey ?? '')))
  // Two plain lookups, each on its own index. One `$or` across both left the
  // planner comparing plans for longer than the whole draw may take.
  const projection = { type: 1, title: 1, v3: 1 }
  const rows: Document[] = []
  if (ids.length) {
    rows.push(...(await db.collection('items').find({ _id: { $in: ids } }, { projection, maxTimeMS: QUERY_BUDGET_MS }).toArray()))
  }
  if (videoIds.length) {
    rows.push(...(await db
      .collection('items')
      .find({ type: 'video', videoId: { $in: videoIds } }, { projection, hint: 'video_id_lookup', maxTimeMS: QUERY_BUDGET_MS })
      .toArray()))
  }

  const zones = new Map<string, LikeZone>()
  for (const row of rows) {
    const v3 = row.v3 as { subjects?: SubjectRef[]; channelKey?: string; universe?: Universe; angle?: Angle; era?: Era } | undefined
    if (!v3) continue
    zones.set(String(row._id), {
      id: String(row._id),
      type: row.type as ItemType,
      subjectIds: namedSubjects(row.title as string | null, v3.subjects),
      ...(v3.channelKey ? { channelKey: v3.channelKey } : {}),
      universe: v3.universe ?? 'other',
      angle: v3.angle ?? 'other',
      era: v3.era ?? 'unknown',
    })
  }
  cache = { at: now, zones: [...zones.values()] }
  return cache.zones
}
