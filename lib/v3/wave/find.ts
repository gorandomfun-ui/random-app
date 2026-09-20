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
const KEYWORD_INDEX = 'idx_wave_keywords_type'

/** How many of the anchor's words to match on. The rarest carry the meaning. */
const WORDS_USED = 8

type ItemRow = Document & {
  _id: ObjectId
  type: ItemType
  title?: string | null
  v3?: ItemTags & { nearFamily?: string; formatFamily?: string }
}

function toCandidate(row: ItemRow, level: WaveLevel): WaveCandidate | null {
  // At the word level the answers are stock photographs too, and those were
  // never tagged. Refusing them here left the level with nothing to offer.
  if (!row.v3 && level !== 4) return null
  return {
    id: String(row._id),
    type: row.type,
    title: row.title,
    level,
    v3: {
      subjects: row.v3?.subjects ?? [],
      universe: row.v3?.universe ?? 'other',
      angle: row.v3?.angle ?? 'other',
      popularity: row.v3?.popularity ?? 'unknown',
      era: row.v3?.era ?? 'unknown',
      channelKey: row.v3?.channelKey,
      nearFamily: row.v3?.nearFamily,
    },
  }
}

/**
 * How many of the anchor's words a row repeats.
 *
 * One word in common is not a link. A video of rain carries "rain", "weather",
 * "clouds" and also "background", and matching on "background" alone answered
 * it with "Cool Jazz Study Mix for Background Concentration". Two words is the
 * difference between a subject and a coincidence.
 */
const WORDS_IN_COMMON_NEEDED = 2

function wordsShared(row: ItemRow, anchorWords: string[]): number {
  if (!anchorWords.length) return 0
  const wanted = new Set(anchorWords)
  const own = [...(row.keywords ?? []), ...(row.tags ?? [])]
  let shared = 0
  const seen = new Set<string>()
  for (const raw of own) {
    if (typeof raw !== 'string') continue
    const word = raw.trim().toLowerCase()
    if (seen.has(word) || !wanted.has(word)) continue
    seen.add(word)
    shared += 1
  }
  return shared
}

/** Only content a visitor should be served. */
/**
 * Stock photographs were never tagged, so requiring labels shut them out of the
 * Wave entirely — both as anchors and as candidates. On words alone they work
 * exactly as an image library does, so the word level asks only that the
 * content be showable.
 */
const SHOWABLE: Filter<Document> = {
  isSuppressed: { $ne: true },
  obsoleteVideoStatus: { $ne: 'obsolete' },
}

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
  anchorWords: string[] = [],
): Promise<WaveCandidate[]> {
  const perGroup = await Promise.all(FORMAT_GROUPS.map(async (types) => {
    try {
      const rows = (await db
        .collection('items')
        .find(
          {
            ...(level === 4 ? SHOWABLE : SERVABLE),
            ...match,
            type: types.length === 1 ? types[0] : { $in: types },
            ...randomWindow(),
            _id: { $ne: anchorId },
          },
          {
            projection: { type: 1, title: 1, v3: 1, rand: 1, keywords: 1, tags: 1 },
            limit: POOL_PER_FORMAT,
            // Naming the index skips plan selection, which on its own ate the
            // whole budget and made the query fail before reading a row.
            hint,
            // Reads on this database average 277ms, so a 250ms budget refused
            // more often than it protected anything.
            maxTimeMS: 1200,
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

  const rows = perGroup.flat()
  if (level !== 4) {
    return rows
      .map((row) => toCandidate(row, level))
      .filter((candidate): candidate is WaveCandidate => Boolean(candidate))
  }

  // Strongest links first, and nothing that shares a single word.
  return rows
    .map((row) => ({ row, shared: wordsShared(row, anchorWords) }))
    .filter((entry) => entry.shared >= WORDS_IN_COMMON_NEEDED)
    .sort((left, right) => right.shared - left.shared)
    .map((entry) => toCandidate(entry.row, level))
    .filter((candidate): candidate is WaveCandidate => Boolean(candidate))
}

export type AnchorRow = ItemRow

/**
 * The anchor's own descriptive words. Stock photographs carry no subject —
 * "a woman wearing a blue shirt" names nobody — but they do carry words, and
 * those words are what an image library links its pictures by.
 */
function anchorWords(row: ItemRow): string[] {
  const raw = [...(row.keywords ?? []), ...(row.tags ?? [])]
  const words = raw
    .filter((word): word is string => typeof word === 'string')
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
  return [...new Set(words)].slice(0, WORDS_USED)
}

/** Words shared by so much of the catalogue that they link nothing. */
const STOP_WORDS = new Set([
  'video', 'image', 'photo', 'gif', 'youtube', 'dailymotion', 'giphy', 'tenor',
  'pexels', 'pixabay', 'free', 'stock', 'the', 'and', 'for', 'with', 'full',
  'new', 'hd', 'official', 'tone-neutral',
])

/** The anchor, with the labels the Wave needs. */
export async function loadAnchor(db: Db, itemId: ObjectId): Promise<{ anchor: WaveAnchor; row: AnchorRow } | null> {
  const row = (await db
    .collection('items')
    .findOne(
      { _id: itemId },
      { projection: { type: 1, title: 1, v3: 1, keywords: 1, tags: 1 } },
    )) as ItemRow | null
  if (!row) return null

  const words = anchorWords(row)
  // No labels and no words is the only case with nothing to go on.
  if (!row.v3 && !words.length) return null

  return {
    row,
    anchor: {
      id: String(row._id),
      type: row.type,
      title: row.title,
      v3: {
        subjects: row.v3?.subjects ?? [],
        // An untagged stock photograph belongs to no world and treats no
        // subject; it is linked by its words alone.
        universe: row.v3?.universe ?? 'other',
        angle: row.v3?.angle ?? 'other',
        channelKey: row.v3?.channelKey,
      },
      words,
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
    if (collected.length >= needed * 4 && kindsIn(collected) >= WAVE_SIZE) return collected
  }

  // Last resort, and the reason every content can carry a Wave: match on the
  // words themselves.
  if (anchor.words?.length) {
    collected.push(...(await fetchLevel(
      db, { keywords: { $in: anchor.words } }, 4, anchorId, KEYWORD_INDEX, anchor.words,
    )))
  }

  return collected
}
