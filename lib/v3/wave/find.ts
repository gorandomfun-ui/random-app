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
import { alike, fromRow } from '../ai/bits'
import { containsAlias, normalize } from '../tagging/normalize'
import { SUBJECTS_COLLECTION } from '../subjects/build'
import type { ItemTags, ItemType, SubjectRef } from '../types'

/**
 * Per format and per step: enough choice for the rules to have something to
 * refuse. Twelve rather than twenty, because this database has one core and
 * every row it does not have to read is time it does not spend.
 */
const POOL_PER_FORMAT = 12

/**
 * Below this likeness of their fingerprints (lib/v3/ai/bits.ts: 0.5 for strangers, 1 for the same), a video is too far
 * from the anchor to answer it. Measured on 24 October around a Christopher Columbus video: his real videos stood at
 * 0.57 to 0.74; a bar fire in Burgos, a frigate named after him and a pineapple video that only mentioned him in their
 * descriptions, at 0.46 to 0.55. The owner had been sent from a Columbus video to "un truc d'objet en bois chelou".
 */
export const FAR_LIKENESS = 0.55
/** A likeness for what has no fingerprint (images, texts, a video not printed yet): neither close nor far. */
const UNKNOWN_LIKENESS = 0.6
/** Videos read in the anchor's universe when nothing nearer filled the Wave, for the AI to keep the closest. */
const UNIVERSE_VIDEO_ROWS = 60

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
const KEYWORD_INDEX = 'v3_keywords_type_rand'

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

/**
 * Words too common to carry a Wave alone, in the site's languages, written as normalize() leaves them (24 October:
 * "Awesome Armenia" was answered on "awesome" with a site turning photos into art; "5th semester" with a Cinco de Mayo
 * GIF). They still count in the word pair, which they narrow; the one-word steps pass over them, and over numbers.
 */
const COMMON_WORDS = new Set([
  'awesome', 'amazing', 'best', 'top', 'new', 'old', 'big', 'great', 'good', 'bad', 'funny', 'cool', 'epic', 'crazy',
  'official', 'full', 'part', 'episode', 'live', 'music', 'song', 'songs', 'movie', 'movies', 'film', 'films', 'trailer',
  'short', 'shorts', 'highlights', 'day', 'days', 'night', 'time', 'life', 'world', 'people', 'man', 'woman', 'girl',
  'boy', 'kids', 'baby', 'love', 'happy', 'real', 'true', 'first', 'last', 'final', 'ever', 'very', 'most', 'more',
  'how', 'what', 'why', 'when', 'who', 'make', 'made', 'watch', 'just', 'all', 'every', 'story', 'stories', 'things',
  'facts', 'tips', 'way', 'version', 'special', 'show', 'news', 'today', 'year', 'years', 'home', 'family', 'friends',
  'vlog', 'challenge', 'reaction', 'review', 'tutorial', 'remix', 'cover', 'original', 'moments', 'compilation',
  'incroyable', 'meilleur', 'meilleure', 'meilleurs', 'nouveau', 'nouvelle', 'drole', 'histoire', 'histoires', 'jour',
  'nuit', 'vie', 'monde', 'amour', 'partie', 'officiel', 'officielle', 'complet', 'chanson', 'musique', 'bande',
  'annonce', 'gens', 'homme', 'femme', 'fille', 'enfant', 'enfants', 'bebe', 'famille', 'maison', 'annee', 'semaine',
  'comment', 'pourquoi', 'quand', 'vrai', 'vraie', 'premier', 'premiere', 'dernier', 'derniere', 'grand', 'grande',
  'petit', 'petite', 'super', 'trop', 'tres', 'plus', 'tout', 'tous', 'chose', 'choses', 'astuces', 'emission', 'direct',
  'increible', 'mejor', 'mejores', 'nuevo', 'nueva', 'historia', 'dia', 'noche', 'vida', 'mundo', 'amor', 'parte',
  'capitulo', 'oficial', 'completo', 'pelicula', 'cancion', 'musica', 'gente', 'hombre', 'mujer', 'familia', 'casa',
  'como', 'porque', 'cuando', 'verdad', 'primero', 'primera', 'ultimo', 'gran', 'grande', 'muy', 'mas', 'todo', 'cosas',
  'beste', 'neu', 'neue', 'lustig', 'geschichte', 'tag', 'leben', 'welt', 'liebe', 'teil', 'folge', 'offiziell', 'ganze',
  'lied', 'musik', 'leute', 'mann', 'frau', 'kinder', 'familie', 'haus', 'jahr', 'heute', 'warum', 'erste', 'letzte',
  'migliore', 'nuovo', 'nuova', 'storia', 'giorno', 'vita', 'amore', 'ufficiale', 'canzone', 'oggi', 'perche',
  'melhor', 'novo', 'nova', 'hoje', 'verdade', 'primeiro', 'muito', 'tudo',
])
const NUMBER_OR_RANK = /^\d+(?:st|nd|rd|th|e|er|eme|o|a|°)?$/

/** Whether a telling word can carry a Wave alone: not a common word, not a number or a rank. */
export const tellsAlone = (word: string): boolean => {
  const plain = normalize(word)
  return plain.length >= 3 && !COMMON_WORDS.has(plain) && !NUMBER_OR_RANK.test(plain)
}

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

/**
 * A video's length in seconds, from what the providers store: seconds as a
 * number or a numeric string, or YouTube's "PT1H2M3S".
 */
export function durationSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  const iso = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value.trim())
  if (!iso) return undefined
  const [, days, hours, minutes, seconds] = iso
  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
}

function toCandidate(row: ItemRow, level: WaveLevel): WaveCandidate | null {
  if (!row.v3 && !WORD_LEVELS.includes(level)) return null
  const duration = durationSeconds(row.duration)
  const vec = fromRow(row.vec)
  return {
    id: String(row._id),
    type: row.type,
    title: row.title,
    level,
    ...(vec ? { vec } : {}),
    ...(typeof row.lang === 'string' ? { lang: row.lang } : {}),
    ...(typeof row.languageScope === 'string' ? { languageScope: row.languageScope } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(typeof row.v3?.dig?.level === 'number' ? { digLevel: row.v3.dig.level } : {}),
    ...(typeof row.v3?.dig?.pass === 'string' ? { digPass: row.v3.dig.pass } : {}),
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
  /** Videos to read, when the AI is to keep the closest of more of them. */
  videoRows = POOL_PER_FORMAT,
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
              lang: 1, languageScope: 1, duration: 1, vec: 1,
            },
            // The window is real only when the rows come in rand order: the
            // old word index had no rand and answered with the oldest rows.
            sort: { rand: 1 },
            limit: types.includes('video') ? videoRows : POOL_PER_FORMAT,
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
          creatorId: 1, channelId: 1, channelTitle: 1, provider: 1, duration: 1, vec: 1,
        },
      },
    )) as ItemRow | null
  if (!row) return null

  const words = tellingWords(row)
  // No labels and no words is the only case with nothing to go on.
  if (!row.v3 && !words.length) return null

  const duration = durationSeconds(row.duration)
  const vec = fromRow(row.vec)
  return {
    row,
    anchor: {
      id: String(row._id),
      type: row.type,
      title: row.title,
      ...(vec ? { vec } : {}),
      v3: {
        subjects: row.v3?.subjects ?? [],
        universe: row.v3?.universe ?? 'other',
        angle: row.v3?.angle ?? 'other',
        ...(row.v3?.era ? { era: row.v3.era } : {}),
        ...(row.v3?.nearFamily ? { nearFamily: row.v3.nearFamily } : {}),
        // Derived the same way as for the candidates. Read from the labels
        // alone, a Giphy anchor had no author, and "never the anchor's author"
        // let its own uploader answer.
        channelKey: channelOf(row),
      },
      words,
      ...(duration !== undefined ? { duration } : {}),
      ...(typeof row.v3?.dig?.level === 'number' ? { digLevel: row.v3.dig.level } : {}),
      ...(typeof row.v3?.dig?.pass === 'string' ? { digPass: row.v3.dig.pass } : {}),
    },
  }
}

/**
 * Which of the anchor's subjects its title actually names, with the names each goes by.
 *
 * A subject caught in the description is a detail, not the subject: a video
 * of a Vietnamese fire-eater was labelled "19 June" from "filmed June 19" in
 * its description, and answered with three contents about that date. Only a
 * subject the title names leads the Wave; the others come last.
 *
 * The id spells a name ("entity:south-park"); the dictionary adds the label
 * and the aliases, in other languages and scripts. On failure the ids' own
 * spelling still names them, and the Wave still exists.
 */
export async function namedSubjects(db: Db, subjects: SubjectRef[], title: string | null | undefined): Promise<Map<string, string[]>> {
  const named = new Map<string, string[]>()
  if (!subjects.length) return named
  const names = new Map(subjects.map((subject) => [subject.id, [subject.id.slice(subject.id.indexOf(':') + 1).replace(/-/g, ' ')]]))
  try {
    const rows = await db
      .collection(SUBJECTS_COLLECTION)
      .find(
        { _id: { $in: subjects.map((subject) => subject.id) } as never },
        { projection: { label: 1, aliases: 1 }, maxTimeMS: QUERY_BUDGET_MS },
      )
      .toArray()
    for (const row of rows) {
      const own = names.get(String(row._id))
      if (!own) continue
      for (const name of [row.label, ...((row.aliases as string[] | undefined) ?? [])]) {
        if (typeof name === 'string' && name.length > 0 && !own.includes(name)) own.push(name)
      }
    }
  } catch {
    /* the ids' own spelling still names them */
  }
  for (const subject of subjects) {
    const own = names.get(subject.id) ?? []
    // What the dig searched for is the subject, whether or not the title spells it: the #willsmith steak is about Will Smith.
    if (subject.evidence === 'search-verified' || (title?.trim() && own.some((name) => containsAlias(title, name)))) named.set(subject.id, own)
  }
  return named
}

/**
 * Whether a content carries one of the subjects the anchor's title names as its own subject too: its title names it as
 * well, or the dig found it by searching that subject. A content that only mentions it — a pineapple video telling in
 * its description that Columbus brought the fruit to Europe — is not about it (24 October, the owner: from a Columbus
 * video to "un truc d'objet en bois chelou, aucun lien compréhensible").
 */
export function sharesNamedSubject(candidate: Pick<WaveCandidate, 'title' | 'v3'>, named: Map<string, string[]>): boolean {
  return candidate.v3.subjects.some((subject) => {
    const names = named.get(subject.id)
    if (!names) return false
    return subject.evidence === 'search-verified' || names.some((name) => containsAlias(candidate.title ?? '', name))
  })
}

/**
 * The AI's word on a pool (24 October): how alike each video's fingerprint is to the anchor's, the closest first within
 * a step. Without the anchor's fingerprint (an image, a text, a video not printed yet) the pool is left as it is.
 */
export function byCloseness(anchor: Pick<WaveAnchor, 'vec'>, pool: WaveCandidate[]): WaveCandidate[] {
  const own = anchor.vec
  if (!own) return pool
  return pool
    .map((candidate) => (candidate.vec ? { ...candidate, likeness: alike(own, candidate.vec) } : candidate))
    .sort((left, right) => (right.likeness ?? UNKNOWN_LIKENESS) - (left.likeness ?? UNKNOWN_LIKENESS))
}

const isFar = (candidate: WaveCandidate): boolean => candidate.likeness !== undefined && candidate.likeness < FAR_LIKENESS

/**
 * The Wave from the contents close enough to the anchor, and its spares. The far ones come only when the close ones
 * cannot fill the three, last of all: the owner wants the three ("une Wave plus courte… non non non").
 */
export function buildClosest(anchor: WaveAnchor, pool: WaveCandidate[], excludeKeys: string[], lang?: string): { wave: { items: WaveCandidate[]; level: WaveLevel }; spares: WaveCandidate[] } {
  const close = pool.filter((candidate) => !isFar(candidate))
  let wave = buildWave(anchor, close, excludeKeys, lang)
  if (wave.items.length < WAVE_SIZE && close.length < pool.length) {
    wave = buildWave(anchor, [...close, ...pool.filter(isFar).map((candidate) => ({ ...candidate, level: 5 as WaveLevel }))], excludeKeys, lang)
  }
  return { wave, spares: pickSpares(anchor, wave.items, close, lang) }
}

/** Spares the interface may substitute for one of the three without breaking the rules. */
function pickSpares(anchor: WaveAnchor, trio: WaveCandidate[], pool: WaveCandidate[], lang?: string): WaveCandidate[] {
  const taken = new Set(trio.map((item) => item.id))
  const spares: WaveCandidate[] = []
  const byLevel = [...pool].sort((left, right) => left.level - right.level)
  for (const candidate of byLevel) {
    if (spares.length >= SPARES) break
    if (taken.has(candidate.id)) continue
    if (!accepts(anchor, trio, candidate, taken, undefined, lang)) continue
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
  /** The visitor's language: a text is offered only if they can read it. */
  options: { lang?: string } = {},
): Promise<ComposedWave> {
  const { lang } = options
  const subjectIds = anchor.v3.subjects.map((subject) => subject.id)
  const words = anchor.words ?? []
  const alone = words.filter(tellsAlone)
  const none = Promise.resolve([] as WaveCandidate[])

  const [named, subjectPool, pairPool, firstWordPool] = await Promise.all([
    namedSubjects(db, anchor.v3.subjects, anchor.title),
    subjectIds.length ? fetchStep(db, { 'v3.subjects.id': { $in: subjectIds } }, 4, anchorId, SUBJECT_INDEX) : none,
    words.length >= 2 ? fetchStep(db, { keywords: { $all: words.slice(0, 2) } }, 2, anchorId, KEYWORD_INDEX) : none,
    // The single word is asked at once only when there is no subject to lean
    // on; with a subject, it is rarely needed and would be one more query.
    alone.length >= 1 && !subjectIds.length ? fetchStep(db, { keywords: alone[0] }, 3, anchorId, KEYWORD_INDEX) : none,
  ])

  // A content whose own subject is one the anchor's title names is the closest
  // link there is; one that only carries it comes after the words.
  for (const candidate of subjectPool) {
    if (sharesNamedSubject(candidate, named)) candidate.level = 1
  }

  let pool = byCloseness(anchor, [...subjectPool, ...pairPool, ...firstWordPool])
  let { wave, spares } = buildClosest(anchor, pool, excludeKeys, lang)

  // Short, or filled only from the far: the next words, and the anchor's universe, where the AI keeps the closest
  // videos of a larger handful rather than any.
  if (wave.items.length < WAVE_SIZE || spares.length < SPARES_WANTED || wave.items.some(isFar)) {
    const from = subjectIds.length ? 0 : 1
    const more = await Promise.all([
      ...alone.slice(from, WORDS_KEPT).map((word) => fetchStep(db, { keywords: word }, 3, anchorId, KEYWORD_INDEX)),
      fetchStep(db, { 'v3.universe': anchor.v3.universe }, 5, anchorId, UNIVERSE_INDEX, anchor.vec ? UNIVERSE_VIDEO_ROWS : POOL_PER_FORMAT),
    ])
    let universeVideos = 0
    pool = byCloseness(anchor, [...pool, ...more.flat()])
      .filter((candidate) => candidate.level !== 5 || candidate.type !== 'video' || (universeVideos += 1) <= POOL_PER_FORMAT)
    ;({ wave, spares } = buildClosest(anchor, pool, excludeKeys, lang))
  }

  return { items: wave.items, spares, level: wave.level }
}
