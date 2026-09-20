/**
 * Composing a Wave: narrowest link first, wider only when it comes up short.
 *
 *  1. A subject named in the title — Vietnam, South Park, Johnny.
 *  2. The title's first two telling words, together — "black car".
 *  3. The first telling word alone — "black".
 *  4. A subject the content carries without naming it in its title.
 *  5. The same universe.
 *
 * Each step is asked only when the ones before it could not fill three slots
 * of different formats, so a well-named subject costs one round of queries.
 * Nothing is precomputed: a content tagged this morning joins every Wave of
 * its subject at once.
 */

import type { Db, Document, Filter, ObjectId } from 'mongodb'

import { accepts, buildWave, WAVE_SIZE } from './select'
import type { WaveAnchor, WaveCandidate, WaveLevel } from './select'
import { containsAlias, normalize } from '../tagging/normalize'
import { SUBJECTS_COLLECTION } from '../subjects/build'
import type { ItemTags, ItemType, SubjectRef } from '../types'

/**
 * Per format and per step: enough choice for the rules to have something to
 * refuse. Twelve rather than twenty, because this database has one core and
 * every row it does not have to read is time it does not spend.
 */
const POOL_PER_FORMAT = 12

/** Spares handed to the interface, for a content it cannot show or saw a moment ago. */
const SPARES = 7
/** Below this many spares, one more step is fetched so the interface is not left short. */
const SPARES_WANTED = 2

/** Telling words kept from the anchor: the first two together, then each alone. */
const WORDS_KEPT = 4

/** Reads on this database average 277ms; a query past this is abandoned, not waited for. */
const QUERY_BUDGET_MS = 1200

/** The indexes these queries are built for, named so Mongo does not go looking. */
const SUBJECT_INDEX = 'v3_subject_type_rand'
const UNIVERSE_INDEX = 'v3_universe_type_rand'
const KEYWORD_INDEX = 'idx_wave_keywords_type'

/**
 * Words that carry no subject: grammar, in the site's languages, and words that
 * describe the file rather than what it shows. "A black car with a red tail
 * light" is about a black car; "Happy Fun GIF by SWR" is about happy fun.
 */
const NOISE_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or', 'by', 'from', 'is', 'are',
  'was', 'were', 'it', 'its', 'this', 'that', 'these', 'those', 'his', 'her', 'their', 'our', 'your',
  'my', 'as', 'be', 'been', 'has', 'have', 'had', 'up', 'out', 'over', 'into', 'vs', 'via', 'not', 'no',
  'de', 'la', 'le', 'les', 'des', 'du', 'un', 'une', 'et', 'en', 'au', 'aux', 'sur', 'dans', 'pour', 'par',
  'el', 'los', 'las', 'y', 'del', 'der', 'die', 'das', 'und', 'von', 'mit', 'im', 'ein', 'eine',
  'il', 'lo', 'gli', 'di', 'da', 'che', 'per',
  'gif', 'gifs', 'video', 'videos', 'image', 'images', 'photo', 'photos', 'picture', 'pictures',
  'footage', 'clip', 'stock', 'free', 'hd', '4k', 'jpg', 'png', 'mp4', 'www', 'http', 'https', 'com',
  'youtube', 'dailymotion', 'giphy', 'tenor', 'pexels', 'pixabay',
])

export type ItemRow = Document & {
  _id: ObjectId
  type: ItemType
  title?: string | null
  v3?: ItemTags & { nearFamily?: string; formatFamily?: string }
}

/**
 * Who published it, even when the content carries no labels.
 *
 * A Giphy archive uploads thousands of GIFs stamped with its own name, so its
 * name is in their words and the Wave links them to each other. Without an
 * author the "never twice the same" rule had nothing to compare, and answered
 * a GIF from the Frisian film archive with three more from the same archive.
 */
export function channelOf(row: ItemRow): string | undefined {
  if (row.v3?.channelKey) return row.v3.channelKey
  const owner = row.creatorId ?? row.channelId ?? row.channelTitle
  if (typeof owner === 'string' && owner.trim()) return `${row.provider ?? 'source'}:${owner.trim().toLowerCase()}`
  // Giphy names the uploader in the title itself — "Moonwalk Macron GIF by
  // systaime" — and its older documents carry it nowhere else.
  const byline = /\bGIF by (.+)$/i.exec(row.title ?? '')
  if (byline) return `giphy:${byline[1].trim().toLowerCase()}`
  return undefined
}

/** The word steps link untagged stock photographs too; the others need labels. */
const WORD_LEVELS: WaveLevel[] = [2, 3]

function toCandidate(row: ItemRow, level: WaveLevel): WaveCandidate | null {
  if (!row.v3 && !WORD_LEVELS.includes(level)) return null
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
      channelKey: channelOf(row),
      nearFamily: row.v3?.nearFamily,
    },
  }
}

/** Only content a visitor should be served. */
export const SERVABLE: Filter<Document> = {
  'v3.usable': true,
  isSuppressed: { $ne: true },
  obsoleteVideoStatus: { $ne: 'obsolete' },
}

/**
 * Stock photographs were never tagged, so requiring labels shut them out of the
 * Wave entirely. On words alone they work exactly as an image library does, so
 * the word steps ask only that the content be showable.
 */
export const SHOWABLE: Filter<Document> = {
  isSuppressed: { $ne: true },
  obsoleteVideoStatus: { $ne: 'obsolete' },
}

/**
 * A random window over `rand` rather than a full scan, so two clicks on the
 * same item do not return the same Wave.
 */
function randomWindow(): Filter<Document> {
  return { rand: { $gte: Math.random() * 0.9 } }
}

/**
 * The formats are drawn separately, and this is not a refinement.
 *
 * The indexes behind these queries order their rows by type, so a single find
 * returns every fact, then every image, and video last. Capped at sixty rows,
 * the pool reached the videos only when a subject had almost no texts or
 * images. One tight query per format costs no more, because each is an index
 * seek.
 */
const FORMAT_GROUPS: ItemType[][] = [['video'], ['image'], ['fact', 'quote', 'joke', 'web']]

async function fetchStep(
  db: Db,
  match: Filter<Document>,
  level: WaveLevel,
  anchorId: ObjectId,
  hint: string,
): Promise<WaveCandidate[]> {
  const perGroup = await Promise.all(FORMAT_GROUPS.map(async (types) => {
    try {
      return (await db
        .collection('items')
        .find(
          {
            ...(WORD_LEVELS.includes(level) ? SHOWABLE : SERVABLE),
            ...match,
            type: types.length === 1 ? types[0] : { $in: types },
            ...randomWindow(),
            _id: { $ne: anchorId },
          },
          {
            projection: {
              type: 1, title: 1, v3: 1, rand: 1,
              creatorId: 1, channelId: 1, channelTitle: 1, provider: 1,
            },
            limit: POOL_PER_FORMAT,
            hint,
            maxTimeMS: QUERY_BUDGET_MS,
          },
        )
        .toArray()) as ItemRow[]
    } catch {
      // One slow format must not cost the whole Wave: the others still answer.
      return [] as ItemRow[]
    }
  }))

  return perGroup
    .flat()
    .map((row) => toCandidate(row, level))
    .filter((candidate): candidate is WaveCandidate => Boolean(candidate))
}

/**
 * The anchor's telling words, in the order its title says them.
 *
 * The words come from the indexed keywords, so a search on them finds what the
 * index holds; the title decides their order, so the first ones are what the
 * content is called. A caption with no title keeps the keywords' own order.
 */
/** The telling words of any stored content: what the like plan searches for. */
export function tellingWordsOf(row: { title?: string | null; keywords?: unknown; tags?: unknown }): string[] {
  return tellingWords(row as ItemRow)
}

/** The telling words of a bare title, for counting what recurs around a content. */
export function wordsOfTitle(title: string | null | undefined): string[] {
  const seen = new Set<string>()
  for (const token of normalize(title ?? '').split(' ')) {
    if (token.length >= 2 && !NOISE_WORDS.has(token)) seen.add(token)
  }
  return [...seen]
}

function tellingWords(row: ItemRow): string[] {
  const own: string[] = []
  const byNormalised = new Map<string, string>()
  for (const raw of [...(row.keywords ?? []), ...(row.tags ?? [])]) {
    if (typeof raw !== 'string') continue
    const word = raw.trim().toLowerCase()
    if (word.length < 2 || NOISE_WORDS.has(word) || byNormalised.has(normalize(word))) continue
    byNormalised.set(normalize(word), word)
    own.push(word)
  }
  if (!own.length) return []

  const fromTitle: string[] = []
  const used = new Set<string>()
  for (const token of normalize(row.title ?? '').split(' ')) {
    const word = byNormalised.get(token)
    if (word && !used.has(word)) {
      used.add(word)
      fromTitle.push(word)
    }
  }
  const ordered = fromTitle.length ? [...fromTitle, ...own.filter((word) => !used.has(word))] : own
  return ordered.slice(0, WORDS_KEPT)
}

export type AnchorRow = ItemRow

/** The anchor, with the labels and words the Wave needs. */
export async function loadAnchor(db: Db, itemId: ObjectId): Promise<{ anchor: WaveAnchor; row: AnchorRow } | null> {
  const row = (await db
    .collection('items')
    .findOne(
      { _id: itemId },
      {
        projection: {
          type: 1, title: 1, v3: 1, keywords: 1, tags: 1,
          creatorId: 1, channelId: 1, channelTitle: 1, provider: 1,
        },
      },
    )) as ItemRow | null
  if (!row) return null

  const words = tellingWords(row)
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
        universe: row.v3?.universe ?? 'other',
        angle: row.v3?.angle ?? 'other',
        // Derived the same way as for the candidates. Read from the labels
        // alone, a Giphy anchor had no author, and "never the anchor's author"
        // let its own uploader answer.
        channelKey: channelOf(row),
      },
      words,
    },
  }
}

/**
 * Which of the anchor's subjects its title actually names.
 *
 * A subject caught in the description is a detail, not the subject: a video
 * of a Vietnamese fire-eater was labelled "19 June" from "filmed June 19" in
 * its description, and answered with three contents about that date. Only a
 * subject the title names leads the Wave; the others come last.
 *
 * On failure nothing is trusted: the words take over, and the Wave still
 * exists.
 */
async function subjectsNamedInTitle(db: Db, subjects: SubjectRef[], title: string | null | undefined): Promise<Set<string>> {
  const named = new Set<string>()
  if (!subjects.length || !title?.trim()) return named

  // The id spells the name — "entity:south-park" — so most titles settle it
  // without a query. The dictionary is asked only for the subjects left over,
  // whose title may name them in another script or by another alias.
  const unsettled = subjects.filter((subject) => {
    const name = subject.id.slice(subject.id.indexOf(':') + 1).replace(/-/g, ' ')
    if (containsAlias(title, name)) { named.add(subject.id); return false }
    return true
  })
  if (!unsettled.length) return named

  try {
    const rows = await db
      .collection(SUBJECTS_COLLECTION)
      .find(
        { _id: { $in: unsettled.map((subject) => subject.id) } as never },
        { projection: { label: 1, aliases: 1 }, maxTimeMS: QUERY_BUDGET_MS },
      )
      .toArray()
    for (const row of rows) {
      const names = [row.label, ...((row.aliases as string[] | undefined) ?? [])].filter(
        (name): name is string => typeof name === 'string' && name.length > 0,
      )
      if (names.some((name) => containsAlias(title, name))) named.add(String(row._id))
    }
  } catch {
    /* nothing named: the words lead */
  }
  return named
}

/** Spares the interface may substitute for one of the three without breaking the rules. */
function pickSpares(anchor: WaveAnchor, trio: WaveCandidate[], pool: WaveCandidate[]): WaveCandidate[] {
  const taken = new Set(trio.map((item) => item.id))
  const spares: WaveCandidate[] = []
  const byLevel = [...pool].sort((left, right) => left.level - right.level)
  for (const candidate of byLevel) {
    if (spares.length >= SPARES) break
    if (taken.has(candidate.id)) continue
    if (!accepts(anchor, trio, candidate, taken)) continue
    taken.add(candidate.id)
    spares.push(candidate)
  }
  return spares
}

export type ComposedWave = {
  items: WaveCandidate[]
  spares: WaveCandidate[]
  level: WaveLevel
}

/**
 * The Wave for an anchor: three contents and a few spares.
 *
 * One round asks for everything the anchor offers — its subjects, its word
 * pair, its first word — and the level walk in buildWave takes from the
 * tightest link first, so fetching them together costs nothing in precision
 * and saves a round trip. A second round, for the rare anchor that is still
 * short, tries its next words and, last of all, its universe: a town nobody
 * else mentions still gets a Wave.
 */
export async function composeWave(
  db: Db,
  anchor: WaveAnchor,
  anchorId: ObjectId,
  excludeKeys: string[] = [],
): Promise<ComposedWave> {
  const subjectIds = anchor.v3.subjects.map((subject) => subject.id)
  const words = anchor.words ?? []
  const none = Promise.resolve([] as WaveCandidate[])

  const [named, subjectPool, pairPool, firstWordPool] = await Promise.all([
    subjectsNamedInTitle(db, anchor.v3.subjects, anchor.title),
    subjectIds.length ? fetchStep(db, { 'v3.subjects.id': { $in: subjectIds } }, 4, anchorId, SUBJECT_INDEX) : none,
    words.length >= 2 ? fetchStep(db, { keywords: { $all: words.slice(0, 2) } }, 2, anchorId, KEYWORD_INDEX) : none,
    // The single word is asked at once only when there is no subject to lean
    // on; with a subject, it is rarely needed and would be one more query.
    words.length >= 1 && !subjectIds.length ? fetchStep(db, { keywords: words[0] }, 3, anchorId, KEYWORD_INDEX) : none,
  ])

  // A content sharing a subject the title names is the closest link there is;
  // one sharing a subject the title does not name comes after the words.
  for (const candidate of subjectPool) {
    if (candidate.v3.subjects.some((subject) => named.has(subject.id))) candidate.level = 1
  }

  let pool = [...subjectPool, ...pairPool, ...firstWordPool]
  let wave = buildWave(anchor, pool, excludeKeys)
  let spares = pickSpares(anchor, wave.items, pool)

  if (wave.items.length < WAVE_SIZE || spares.length < SPARES_WANTED) {
    const from = subjectIds.length ? 0 : 1
    const more = await Promise.all([
      ...words.slice(from, WORDS_KEPT).map((word) => fetchStep(db, { keywords: word }, 3, anchorId, KEYWORD_INDEX)),
      fetchStep(db, { 'v3.universe': anchor.v3.universe }, 5, anchorId, UNIVERSE_INDEX),
    ])
    pool = [...pool, ...more.flat()]
    wave = buildWave(anchor, pool, excludeKeys)
    spares = pickSpares(anchor, wave.items, pool)
  }

  return { items: wave.items, spares, level: wave.level }
}
