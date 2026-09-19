/**
 * Fetching Wave candidates from the catalogue.
 *
 * Three queries at most, one per level, each stopping as soon as it has
 * enough. Nothing is precomputed: a content tagged this morning joins every
 * Wave of its subject immediately.
 */

import type { Db, Document, Filter, ObjectId } from 'mongodb'

import type { WaveAnchor, WaveCandidate, WaveLevel } from './select'
import type { ItemTags, ItemType } from '../types'

/** Enough choice for the composition rules to have something to reject. */
const POOL_PER_LEVEL = 60

type ItemRow = Document & {
  _id: ObjectId
  type: ItemType
  title?: string | null
  v3?: ItemTags & { nearFamily?: string; formatFamily?: string }
}

function toCandidate(row: ItemRow, level: WaveLevel): WaveCandidate | null {
  if (!row.v3) return null
  return {
    id: String(row._id),
    type: row.type,
    title: row.title,
    level,
    v3: {
      subjects: row.v3.subjects ?? [],
      universe: row.v3.universe,
      angle: row.v3.angle,
      popularity: row.v3.popularity,
      era: row.v3.era,
      channelKey: row.v3.channelKey,
      nearFamily: row.v3.nearFamily,
    },
  }
}

/** Only content a visitor should be served. */
const SERVABLE: Filter<Document> = {
  'v3.usable': true,
  isSuppressed: { $ne: true },
  obsoleteVideoStatus: { $ne: 'obsolete' },
}

/**
 * A random window over `rand` rather than a full scan, so two clicks on the
 * same item do not return the same Wave.
 */
function randomWindow(): Filter<Document> {
  const start = Math.random() * 0.9
  return { rand: { $gte: start } }
}

async function fetchLevel(
  db: Db,
  match: Filter<Document>,
  level: WaveLevel,
  anchorId: ObjectId,
): Promise<WaveCandidate[]> {
  const rows = (await db
    .collection('items')
    .find(
      { ...SERVABLE, ...match, ...randomWindow(), _id: { $ne: anchorId } },
      {
        projection: { type: 1, title: 1, v3: 1, rand: 1 },
        limit: POOL_PER_LEVEL,
        maxTimeMS: 250,
      },
    )
    .toArray()) as ItemRow[]

  return rows.map((row) => toCandidate(row, level)).filter((candidate): candidate is WaveCandidate => Boolean(candidate))
}

export type AnchorRow = ItemRow

/** The anchor, with the labels the Wave needs. */
export async function loadAnchor(db: Db, itemId: ObjectId): Promise<{ anchor: WaveAnchor; row: AnchorRow } | null> {
  const row = (await db
    .collection('items')
    .findOne({ _id: itemId }, { projection: { type: 1, title: 1, v3: 1 } })) as ItemRow | null
  if (!row?.v3) return null

  return {
    row,
    anchor: {
      id: String(row._id),
      type: row.type,
      title: row.title,
      v3: {
        subjects: row.v3.subjects ?? [],
        universe: row.v3.universe,
        angle: row.v3.angle,
        channelKey: row.v3.channelKey,
      },
    },
  }
}

/**
 * Candidates for the three levels.
 *
 * Level 1 is the anchor's primary subject, level 2 its other subjects, level 3
 * the same universe. Later levels are only queried when the earlier ones did
 * not fill the Wave, so a well-covered subject costs a single query.
 */
export async function findCandidates(
  db: Db,
  anchor: WaveAnchor,
  anchorId: ObjectId,
  needed = 3,
): Promise<WaveCandidate[]> {
  const subjects = anchor.v3.subjects ?? []
  const primary = subjects.find((subject) => subject.role === 'primary')?.id
  const secondary = subjects.filter((subject) => subject.id !== primary).map((subject) => subject.id)

  const collected: WaveCandidate[] = []

  if (primary) {
    collected.push(...(await fetchLevel(db, { 'v3.subjects.id': primary }, 1, anchorId)))
    if (collected.length >= needed * 4) return collected
  }

  if (secondary.length) {
    collected.push(...(await fetchLevel(db, { 'v3.subjects.id': { $in: secondary } }, 2, anchorId)))
    if (collected.length >= needed * 4) return collected
  }

  if (anchor.v3.universe && anchor.v3.universe !== 'other') {
    collected.push(...(await fetchLevel(db, { 'v3.universe': anchor.v3.universe }, 3, anchorId)))
  }

  return collected
}
