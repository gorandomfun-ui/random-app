/**
 * Fetching Wave candidates from the catalogue.
 *
 * Three queries at most, one per level, each stopping as soon as it has
 * enough. Nothing is precomputed: a content tagged this morning joins every
 * Wave of its subject immediately.
 */

import type { Db, Document, Filter, ObjectId } from 'mongodb'

import { TEXT_TYPES, WAVE_SIZE } from './select'
import type { WaveAnchor, WaveCandidate, WaveLevel } from './select'
import type { ItemTags, ItemType } from '../types'

/** Enough choice for the composition rules to have something to reject. */
const POOL_PER_LEVEL = 60

/** The indexes these queries are built for, named so Mongo does not go looking. */
const SUBJECT_INDEX = 'v3_subject_type_rand'
const UNIVERSE_INDEX = 'v3_universe_type_rand'

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

/**
 * The formats are drawn separately, and this is not a refinement.
 *
 * The index behind these queries is (subject, type, rand), so a single find
 * returns its rows in alphabetical order of type: every fact, then every image,
 * and video last. Capped at sixty rows, the pool reached the videos only when a
 * subject had almost no texts or images, and the Wave kept coming back with two
 * items instead of three. One tight query per format costs no more, because
 * each one is an index seek.
 */
const FORMAT_GROUPS: ItemType[][] = [['video'], ['image'], ['fact', 'quote', 'joke', 'web']]
const POOL_PER_FORMAT = Math.ceil(POOL_PER_LEVEL / FORMAT_GROUPS.length)

async function fetchLevel(
  db: Db,
  match: Filter<Document>,
  level: WaveLevel,
  anchorId: ObjectId,
  hint: string,
): Promise<WaveCandidate[]> {
  const perGroup = await Promise.all(FORMAT_GROUPS.map(async (types) => {
    try {
      const rows = (await db
        .collection('items')
        .find(
          {
            ...SERVABLE,
            ...match,
            type: types.length === 1 ? types[0] : { $in: types },
            ...randomWindow(),
            _id: { $ne: anchorId },
          },
          {
            projection: { type: 1, title: 1, v3: 1, rand: 1 },
            limit: POOL_PER_FORMAT,
            // Naming the index skips plan selection, which on its own ate the
            // whole budget and made the query fail before reading a row.
            hint,
            maxTimeMS: 250,
          },
        )
        .toArray()) as ItemRow[]
      return rows
    } catch {
      // One slow format must not cost the whole Wave: the others still answer,
      // and a Wave of two beats no Wave at all.
      return [] as ItemRow[]
    }
  }))

  return perGroup
    .flat()
    .map((row) => toCandidate(row, level))
    .filter((candidate): candidate is WaveCandidate => Boolean(candidate))
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
 * The three texts count as one kind, exactly as the Wave counts them when it
 * builds: a pool of facts and quotes cannot fill three slots.
 */
function kindsIn(candidates: WaveCandidate[]): number {
  const kinds = new Set(candidates.map((candidate) =>
    TEXT_TYPES.includes(candidate.type) ? 'text' : candidate.type))
  return kinds.size
}

/**
 * Candidates for the three levels.
 *
 * Level 1 is the anchor's primary subject, level 2 its other subjects, level 3
 * the same universe. A later level is only queried when the earlier ones have
 * neither filled the Wave nor offered enough different formats to fill it.
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

  // Levels 1 and 2 are always fetched together. Stopping at level 1 because it
  // held enough candidates was wrong twice over: a pool can hold twelve items
  // of two formats, and its videos are often the anchor's own channel, which
  // the Wave refuses. Both are index seeks on the subject, so the pair is cheap.
  const [close, related] = await Promise.all([
    primary ? fetchLevel(db, { 'v3.subjects.id': primary }, 1, anchorId, SUBJECT_INDEX) : Promise.resolve([]),
    secondary.length
      ? fetchLevel(db, { 'v3.subjects.id': { $in: secondary } }, 2, anchorId, SUBJECT_INDEX)
      : Promise.resolve([]),
  ])
  collected.push(...close, ...related)
  if (collected.length >= needed * 4 && kindsIn(collected) >= WAVE_SIZE) return collected

  if (anchor.v3.universe && anchor.v3.universe !== 'other') {
    collected.push(...(await fetchLevel(db, { 'v3.universe': anchor.v3.universe }, 3, anchorId, UNIVERSE_INDEX)))
  }

  return collected
}
