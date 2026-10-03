/**
 * The wheel: one draw for every video of a session.
 *
 * Five paths used to compete for each video — the day's list, the dig, the
 * cool bag, the stock of the universe card, the common pool — each with its
 * own rules, and the same small pools came round on every device (the owner,
 * 30 September: "une solution simple, une organisation simple"). Now a session
 * turns a wheel of thirteen cards, shuffled by its seed, never the same card
 * twice in a row: each card says what the next video is for, the stock fills
 * the card, and among what fits, the content the site has served the least
 * wins (`served.n`, lib/discovery/served.ts — the count lives on the site, so
 * six devices do not get the same video, and a million visitors are served
 * the stock flat rather than blocked).
 *
 * The cards are kinds of moment, not themes — the universe card of the theme
 * deck says what it is about: the buzz (the day's list, twice a round), a
 * long one, a retro one, the curator's taste, pure chance (twice), the world,
 * a short lively one, a little-seen one, the joker (the universe card as the
 * deck dealt it), a weird/fun one, and one bonus card that names a universe
 * on purpose, music, gaming and humour in turn, each with its own quality
 * rule (the owner, 1 October). A session opens on the buzz. A card the stock
 * cannot fill passes to the joker; when the wheel has nothing at all, the
 * older paths answer.
 *
 * The session's rules hold on every card (`sessionRules`): not the same
 * content, not the same story, not the same subject or author within ten
 * videos, three in ten at most of one language or of a script most visitors
 * cannot read, one news video in ten, two of one universe in ten, trailers two a session, still album
 * covers only by chance. Proportions read on labels and detectors, never a
 * list. Behind `RANDOM_WHEEL=1`, or the admin's `wheel: true` for a rehearsal.
 */

import { ObjectId, type Db, type Document, type Filter } from 'mongodb'

import { candidateFromRow, type CatalogueRow } from './catalog'
import { echoesSession, exposureOf } from './diversity'
import { selectFresh } from './freshPool'
import type { FreshSeen } from './freshSeen'
import { effectiveServed } from './kept'
import { titleLanguage } from './language'
import { base as baseFilter } from './mongo'
import { hardEligible, type Intent, type PoolResult, type Session } from './pool'
import { hash, type Rng } from './random'
import { sampleCatalogue } from './sampling'
import type { Candidate } from './types'
import { arrangement } from '../v3/cool/bag'
import { isCleanTitle } from '../v3/cool/clean'
import { isCoolCandidate, type LabelableRow } from '../v3/cool/registers'
import { SERVABLE } from '../v3/cool/servable'
import { loadLikePool } from '../v3/cool/likePool'
import { centres, FIELD as VEC, fromRow, nearAny, towards } from '../v3/ai/bits'
import { drawStart } from '../v3/cool/start'
import { isNewsTitle, isTrailerTitle, livelyRank, TRAILERS_PER_SESSION, trailersSeenIn } from '../v3/cool/themes'
import { isLetsPlay, isStillAlbum } from '../v3/dig/door'
import { mediaVerdict } from '../v3/dig/outlet'
import type { DigBase, Popularity, Universe } from '../v3/types'

export const SLOTS = ['buzz', 'long', 'retro', 'taste', 'chance', 'world', 'short', 'deep', 'joker', 'weird', 'bonus'] as const
export type Slot = (typeof SLOTS)[number]
/** One round of the wheel: the buzz, the long and the retro twice (the owner, 1 October: fewer long reports and retro things since the thirteen cards), every other card once. */
export const WHEEL: readonly Slot[] = ['buzz', 'buzz', 'long', 'long', 'retro', 'retro', 'taste', 'chance', 'world', 'short', 'deep', 'joker', 'weird', 'bonus']
/** The universes the bonus card names, one per round in turn. */
export const BONUS: readonly Universe[] = ['music', 'gaming', 'humor-memes']

export const wheelSwitchedOn = (): boolean => process.env.RANDOM_WHEEL === '1'

/** Over fifteen minutes is a long one; a short lively one runs fifteen seconds to four minutes. */
export const LONG_SECONDS = 15 * 60
export const SHORT_SECONDS = 4 * 60
/** Little seen: the niche of the labels, or under ten thousand views. */
export const DEEP_VIEWS = 10_000
/** Among the last ten videos: titles in a script most visitors cannot read, titles of one language, news. */
export const FOREIGN_IN_TEN = 3
export const LANGUAGE_IN_TEN = 3
export const NEWS_IN_TEN = 1
/** One universe once among the last six videos — ten randoms (the owner, 30 September: "pas deux fois le même thème sur dix randoms"; 1 October: two in ten still put music at a fifth of a session). */
export const UNIVERSE_WINDOW = 6
/** Not the same subject, nor the same author, within this many videos. */
export const SPACING = 10
/**
 * The media channels the sweeps named (scripts/v3/outlet-sweep.ts): their
 * videos are served under the media windows of lib/v3/dig/outlet.ts — a
 * news clip of the moment or of another time, a trailer within the year —
 * so what entered as a clip of the moment fades out by itself (the owner,
 * 1 October). Read every ten minutes.
 */
const SWEEPS = 'mini_series_sweeps_v3'
const MEDIA_CACHE_MS = 10 * 60_000
let mediaChannels: { at: number; keys: Set<string> } | null = null

const QUERY_BUDGET_MS = 1_500
const UNIVERSE_INDEX = 'v3_universe_type_rand'
const ERA_INDEX = 'v3_era_type_rand'
const LINE_INDEX = 'v3_line_type_rand'
const REGISTER_INDEX = 'v3_register_type_rand'
const ANY_INDEX = 'type_rand_lookup'
/** The videos the little AI has read (lib/v3/ai/fingerprint.ts): a partial index on the fingerprint's presence, so the taste card reads six hundred of them at once however few they are in the stock. */
const VEC_INDEX = 'vec_type_rand'
/** Rows read for a card: more when the card is rare in a universe (long, retro, the world). */
const ROWS = 48
const SIFTED_ROWS = 96

/**
 * The card of the session's `index`-th video. Round after round, each shuffled
 * by the seed and never starting with the card the previous one ended on; the
 * first round is turned so the session opens on the buzz.
 */
export function slotAt(seed: number, index: number, wheel: readonly Slot[] = WHEEL): Slot {
  const at = Math.max(0, Math.floor(index))
  const ordinal = Math.floor(at / wheel.length)
  let previous: Slot | null = null
  let order: Slot[] = []
  for (let round = 0; round <= ordinal; round += 1) {
    order = arrangement(seed, 'wheel', round, wheel, previous)
    if (round === 0) {
      const opening = Math.max(0, order.indexOf('buzz'))
      order = [...order.slice(opening), ...order.slice(0, opening)]
    }
    previous = order[order.length - 1] ?? null
  }
  return order[at % wheel.length]
}

/** The universe the bonus card names for the session's `index`-th video: the three in turn, the session's seed saying which comes first. */
export function bonusAt(seed: number, index: number, wheel: readonly Slot[] = WHEEL, universes: readonly Universe[] = BONUS): Universe {
  const round = Math.floor(Math.max(0, Math.floor(index)) / wheel.length)
  return universes[(hash(`${seed}:bonus`) + round) % universes.length]
}

export type WheelChoice = {
  slot: Slot
  /** What actually answered: the day's list, the trend, an era, a register, the like pool, the dig, a universe, the whole stock. */
  from: string
  universe?: Universe
  /** How many times the site had served this content before. */
  served: number
  /** The card had nothing; the joker answered. */
  fallback: boolean
}
export type WheelResult<T> = PoolResult<T> & { wheel: WheelChoice }
type Decoder<T> = (row: CatalogueRow) => T | null
/** `disliked`: the contents this device refused with "pas ça" — never chosen again here, their lookalikes kept off the taste card. */
type Context<T> = { ticket: Intent; state: Session; decode: Decoder<T>; lang: string; random: Rng; now: number; card: Universe; freshSeen: FreshSeen | null; rules: SessionRules; media: ReadonlySet<string>; disliked: ReadonlySet<string> }
type Filled<T> = { item: Candidate<T>; from: string; universe?: Universe }

/** The signals the session's proportions read, written on the candidate so the page keeps them in its exposures. */
export function withSignals<T>(candidate: Candidate<T>): Candidate<T> {
  // The language the platform declared, when the row carries it; the detector reads the title otherwise.
  const lang = candidate.declaredLang ?? titleLanguage(candidate.title)
  const news = candidate.universe === 'news-society' || isNewsTitle(candidate.title)
  return { ...candidate, ...(lang ? { lang } : {}), ...(news ? { news: true } : {}) }
}

export type Refusal = 'subject' | 'author' | 'foreign' | 'language' | 'news' | 'trailer' | 'universe' | 'remembered'
export type SessionRules = {
  /** Why the session refuses this candidate now, or null. */
  refuses: (candidate: Candidate) => Refusal | null
  previousUniverse?: string
  lastUniverses: Set<string>
}

/**
 * What the last ten videos of the session allow: the same subject or author
 * not again, at most three titles of one language or in a foreign script, one
 * news video, one universe once in six, two trailers in the whole session —
 * and nothing the device remembers having seen these two weeks, subject or
 * author (utils/subjectMemory.ts), on every card, chance included. Read on
 * the exposures the page keeps (lib/discovery/diversity.ts).
 */
export function sessionRules(state: Session, remembered: ReadonlySet<number> = new Set()): SessionRules {
  const recent = (state.exposures ?? []).filter((exposure) => exposure.type === 'video').slice(-SPACING)
  const subjects = new Set(recent.flatMap((exposure) => (exposure.subject != null ? [exposure.subject] : [])))
  const authors = new Set(recent.flatMap((exposure) => (exposure.author != null ? [exposure.author] : [])))
  const foreignFull = recent.filter((exposure) => exposure.foreign).length >= FOREIGN_IN_TEN
  const languages = new Map<string, number>()
  for (const exposure of recent) if (exposure.lang) languages.set(exposure.lang, (languages.get(exposure.lang) ?? 0) + 1)
  const newsFull = recent.filter((exposure) => exposure.news).length >= NEWS_IN_TEN
  const universes = new Set(recent.slice(-UNIVERSE_WINDOW).flatMap((exposure) => (exposure.universe ? [exposure.universe] : [])))
  const trailersFull = trailersSeenIn(state.exposures) >= TRAILERS_PER_SESSION
  // The universes lead (the owner, 28 September): not the one of the previous video when another fits, the last three set aside when the count allows.
  const previousUniverse = recent[recent.length - 1]?.universe
  const lastUniverses = new Set(recent.slice(-3).flatMap((exposure) => (exposure.universe ? [exposure.universe] : [])))
  return {
    refuses: (candidate) => {
      const stamp = exposureOf(candidate)
      if (stamp?.subject != null && remembered.has(stamp.subject)) return 'remembered'
      if (stamp?.author != null && remembered.has(stamp.author)) return 'remembered'
      if (stamp?.subject != null && subjects.has(stamp.subject)) return 'subject'
      if (stamp?.author != null && authors.has(stamp.author)) return 'author'
      if (stamp?.foreign && foreignFull) return 'foreign'
      if (candidate.lang && (languages.get(candidate.lang) ?? 0) >= LANGUAGE_IN_TEN) return 'language'
      if (candidate.news && newsFull) return 'news'
      if (candidate.universe && universes.has(candidate.universe)) return 'universe'
      if (trailersFull && isTrailerTitle(candidate.title)) return 'trailer'
      return null
    },
    ...(previousUniverse ? { previousUniverse } : {}), lastUniverses,
  }
}

/** A random point in an index, `limit` rows read from it, round the end (lib/v3/cool/start.ts). */
async function seek(db: Db, filter: Filter<Document>, hint: string, random: Rng, limit: number): Promise<CatalogueRow[]> {
  const items = db.collection('items')
  const point = random()
  const read = (range: Filter<Document>, take: number) =>
    items.find({ ...filter, ...range }, { sort: { rand: 1 }, limit: take, hint, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  const rows = await read({ rand: { $gte: point } }, limit)
  if (rows.length < limit) rows.push(...(await read({ rand: { $lt: point } }, limit - rows.length)))
  return rows as CatalogueRow[]
}
const seekUniverse = (db: Db, universe: Universe, random: Rng, limit: number) =>
  seek(db, { 'v3.universe': universe, type: 'video', ...SERVABLE }, UNIVERSE_INDEX, random, limit)
const seekAny = (db: Db, random: Rng, limit: number) => seek(db, { type: 'video', ...SERVABLE }, ANY_INDEX, random, limit)
/** A shuffled window of the videos that carry a fingerprint, wherever they are in the stock. */
const seekPrinted = (db: Db, random: Rng, limit: number) => seek(db, { [VEC]: { $exists: true }, type: 'video', ...SERVABLE }, VEC_INDEX, random, limit)
const seekDig = (db: Db, base: DigBase, random: Rng) =>
  seek(db, { 'v3.line': 'dig', type: 'video', ...SERVABLE }, LINE_INDEX, random, SIFTED_ROWS).then((rows) => rows.filter((row) => digBase(row) === base))

const seconds = (candidate: Candidate): number => candidate.seconds ?? 0
const isLive = (row: CatalogueRow): boolean => row.liveBroadcastContent === 'live' || row.liveBroadcastContent === 'upcoming'
const digBase = (row: CatalogueRow): DigBase | undefined => (row.v3 as { dig?: { base?: DigBase } } | undefined)?.dig?.base
const universeOf = (row: CatalogueRow): Universe | undefined => (row.v3 as { universe?: Universe } | undefined)?.universe
const named = (row: CatalogueRow): boolean => ((row.v3 as { subjects?: unknown[] } | undefined)?.subjects?.length ?? 0) > 0

type Keep<T> = (row: CatalogueRow, candidate: Candidate<T>) => boolean

/**
 * What fits the card among the rows read, the least served first. Every
 * session rule is applied here, whatever the card: the session's own forty and
 * the device's week, the same story, the proportions of `sessionRules`, the AI
 * marks, the still album covers (kept only for pure chance).
 */
export function choose<T>(rows: readonly CatalogueRow[], slot: Slot, context: Context<T>, keep: Keep<T> = () => true): Candidate<T> | null {
  const { ticket, state, decode, now, random, rules } = context
  const trailersSeen = trailersSeenIn(state.exposures)
  const fitting: Array<{ candidate: Candidate<T>; rank: number; order: number; again: number; near: number }> = []
  for (const row of rows) {
    const rank = livelyRank(row, trailersSeen)
    if (!Number.isFinite(rank)) continue
    // A media channel's clip outside its window (a six-month-old news clip): skipped, it has faded.
    if (!withinMediaWindow(row, context.media, new Date(now))) continue
    const payload = decode(row)
    if (payload == null) continue
    const candidate = { ...withSignals(candidateFromRow(row, payload, now)), line: (row.v3 as { line?: string } | undefined)?.line } as Candidate<T> & { line?: string }
    if (!hardEligible(candidate, ticket, state) || echoesSession(candidate, state.exposures) || rules.refuses(candidate)) continue
    if (candidate.id && context.disliked.has(candidate.id)) continue
    if (slot !== 'chance' && isStillAlbum({ title: String(row.title ?? ''), channelTitle: typeof row.channelTitle === 'string' ? row.channelTitle : undefined })) continue
    if (!keep(row, candidate)) continue
    const universe = candidate.universe
    // The lively rank orders the other cards; a long one is long by design, so an hour's documentary ranks with a twenty-minute one.
    fitting.push({ candidate, rank: slot === 'long' ? 0 : rank, order: random(),
      again: Number(Boolean(universe && universe === rules.previousUniverse)), near: Number(Boolean(universe && rules.lastUniverses.has(universe))) })
  }
  // The least served first — on a curated card, as the slow curation tilts it (lib/discovery/kept.ts).
  fitting.sort((left, right) => left.again - right.again || effectiveServed(left.candidate, slot) - effectiveServed(right.candidate, slot) || left.near - right.near || left.rank - right.rank || left.order - right.order)
  return fitting[0]?.candidate ?? null
}

/** The card's universe first, the whole stock when the universe has nothing that fits. */
async function inUniverseThenAny<T>(db: Db, slot: Slot, context: Context<T>, limit: number, keep: Keep<T>): Promise<Filled<T> | null> {
  const { card, random } = context
  const own = choose(await seekUniverse(db, card, random, limit), slot, context, keep)
  if (own) return { item: own, from: 'universe', universe: card }
  const any = choose(await seekAny(db, random, limit), slot, context, keep)
  return any ? { item: any, from: 'stock' } : null
}

/** One universe, named on purpose: what fits there, or nothing. */
async function inUniverse<T>(db: Db, universe: Universe, slot: Slot, context: Context<T>, limit: number, keep: Keep<T> = () => true): Promise<Filled<T> | null> {
  const own = choose(await seekUniverse(db, universe, context.random, limit), slot, context, keep)
  return own ? { item: own, from: `bonus:${universe}`, universe } : null
}

/** The channels of the media sweeps still in force, read every ten minutes. */
async function mediaChannelKeys(db: Db, now: number): Promise<Set<string>> {
  if (mediaChannels && now - mediaChannels.at < MEDIA_CACHE_MS) return mediaChannels.keys
  const sweeps = await db.collection(SWEEPS).find({ kind: 'outlet', undoneAt: { $exists: false } } as Document, { projection: { channels: 1 }, maxTimeMS: QUERY_BUDGET_MS }).toArray().catch(() => [] as Document[])
  const keys = new Set(sweeps.flatMap((sweep) => (Array.isArray(sweep.channels) ? (sweep.channels as string[]) : [])))
  mediaChannels = { at: now, keys }
  return keys
}

/** Whether a stored row of a media channel is still within its window. */
export function withinMediaWindow(row: CatalogueRow, media: ReadonlySet<string>, now: Date): boolean {
  const key = (row.v3 as { channelKey?: string } | undefined)?.channelKey
  if (!key || !media.has(key)) return true
  return mediaVerdict({ title: String(row.title ?? ''), description: typeof row.description === 'string' ? row.description : undefined, publishedAt: row.publishedAt as string | Date | undefined, categoryId: typeof row.categoryId === 'string' ? row.categoryId : undefined }, now) !== 'refuse'
}

/**
 * The shape of the curator's taste, read from the labels of the likes: how
 * the liked videos spread over the universes and eras. Until the little AI
 * measures resemblance, the taste card draws anywhere in the stock in those
 * proportions (the owner, 1 October). Read every ten minutes.
 */
const TASTE_CACHE_MS = 10 * 60_000
/** The centres of the curator's taste, out of the fingerprints of the liked videos (lib/v3/ai/fingerprint.ts); none until the likes carry fingerprints. */
let tasteCentres: { at: number; centres: Float32Array[] } | null = null
async function likedCentres(db: Db, now: number): Promise<Float32Array[]> {
  if (tasteCentres && now - tasteCentres.at < TASTE_CACHE_MS) return tasteCentres.centres
  const pool = await loadLikePool(db, now).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const ids = pool.likeIds.filter((id) => ObjectId.isValid(id)).slice(0, 400).map((id) => new ObjectId(id))
  const rows = ids.length ? await db.collection('items').find({ _id: { $in: ids }, type: 'video', [VEC]: { $exists: true } } as Document, { projection: { [VEC]: 1 }, maxTimeMS: QUERY_BUDGET_MS }).toArray().catch(() => [] as Document[]) : []
  const prints = rows.flatMap((row) => { const bits = fromRow(row[VEC]); return bits ? [bits] : [] })
  const found = prints.length >= 5 ? centres(prints, Math.min(4, Math.max(1, Math.floor(prints.length / 5)))) : []
  tasteCentres = { at: now, centres: found }
  return found
}
/** How many of the rows read must carry a fingerprint for the taste to be measured on them. */
const TASTE_MEASURED_MIN = 8
const TASTE_NEAREST = 12
/** Two fingerprints this alike are the same kind of thing: a lookalike of what the device refused stays off the taste card. */
export const DISLIKE_ALIKE = 0.7
/** The fingerprints of what the device refused, when they have one. */
async function dislikedPrints(db: Db, ids: ReadonlySet<string>): Promise<Uint8Array[]> {
  if (!ids.size) return []
  const rows = await db.collection('items').find({ _id: { $in: [...ids].map((id) => new ObjectId(id)) }, [VEC]: { $exists: true } } as Document, { projection: { [VEC]: 1 }, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  return rows.flatMap((row) => { const bits = fromRow(row[VEC]); return bits ? [bits] : [] })
}
let tasteProfile: { at: number; bag: Array<{ universe: Universe; era?: string }> } | null = null
async function tasteBag(db: Db, now: number): Promise<Array<{ universe: Universe; era?: string }>> {
  if (tasteProfile && now - tasteProfile.at < TASTE_CACHE_MS) return tasteProfile.bag
  const pool = await loadLikePool(db, now).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const ids = pool.likeIds.filter((id) => ObjectId.isValid(id)).slice(0, 400).map((id) => new ObjectId(id))
  const liked = ids.length ? await db.collection('items').find({ _id: { $in: ids }, type: 'video' } as Document, { projection: { 'v3.universe': 1, 'v3.era': 1 }, maxTimeMS: QUERY_BUDGET_MS }).toArray().catch(() => [] as Document[]) : []
  const bag = liked.flatMap((row) => {
    const universe = universeOf(row as CatalogueRow)
    const era = (row.v3 as { era?: string } | undefined)?.era
    return universe ? [{ universe, ...(era ? { era } : {}) }] : []
  })
  tasteProfile = { at: now, bag }
  return bag
}

/** One card, filled from the stock; null when nothing fits it. */
export async function fillSlot<T>(db: Db, slot: Slot, context: Context<T>): Promise<Filled<T> | null> {
  const { ticket, state, decode, lang, random, now, card, rules } = context
  switch (slot) {
    case 'buzz': {
      // The day's list, none this device already saw today, under the session's proportions — or, one time in two, the moment first:
      // what the trend era holds, the week's media clips among it (the owner, 1 October: being up to date); each the other's fallback.
      const momentFirst = random() < 0.5
      const theMoment = async (): Promise<Filled<T> | null> => {
        const rows = (await seek(db, { 'v3.era': 'trend', type: 'video', ...SERVABLE }, ERA_INDEX, random, ROWS))
          .filter((row) => isCoolCandidate(row as LabelableRow) && isCleanTitle(row.title as string))
        const picked = choose(rows, slot, context)
        return picked ? { item: picked, from: 'moment' } : null
      }
      const theDay = async (): Promise<Filled<T> | null> => {
        const fresh = await selectFresh(db, ticket, state, context.freshSeen, decode, now, random, undefined, (candidate) => !rules.refuses(withSignals(candidate))).catch(() => null)
        return fresh ? { item: withSignals(fresh.item), from: 'fresh' } : null
      }
      if (momentFirst) return (await theMoment()) ?? theDay()
      return (await theDay()) ?? theMoment()
    }
    case 'long':
      return inUniverseThenAny(db, slot, context, SIFTED_ROWS, (row, candidate) => seconds(candidate) > LONG_SECONDS && !isLive(row))
    case 'short':
      return inUniverseThenAny(db, slot, context, ROWS, (row, candidate) => seconds(candidate) >= 15 && seconds(candidate) <= SHORT_SECONDS && livelyRank(row) === 0)
    case 'deep': {
      // Little seen, anywhere in the universe of the card: the whole stock, a named subject or not (1 October: preferring named subjects meant preferring the dig's one per cent).
      const little = (row: CatalogueRow) => (row.v3 as { popularity?: Popularity } | undefined)?.popularity === 'niche' || (typeof row.viewCount === 'number' && row.viewCount < DEEP_VIEWS)
      return inUniverseThenAny(db, slot, context, ROWS, (row) => little(row))
    }
    case 'retro': {
      // The archives, the card's universe first when it has any.
      const rows = (await seek(db, { 'v3.era': 'retro', type: 'video', 'v3.usable': true, ...SERVABLE }, ERA_INDEX, random, SIFTED_ROWS)).filter((row) => isCleanTitle(row.title as string))
      const own = choose(rows.filter((row) => universeOf(row) === card), slot, context)
      if (own) return { item: own, from: 'era:retro', universe: card }
      const any = choose(rows, slot, context)
      return any ? { item: any, from: 'era:retro' } : null
    }
    case 'taste': {
      // One time in ten, a zone around one of the curator's likes (the same author, the same named subject); the rest of the time, the shape of
      // the likes applied to the whole stock — a universe and an era the likes hold, drawn anywhere; the dig's likes base when nothing else.
      if (random() < 0.1) {
        const start = await drawStart(db, { type: 'video', source: 'like', random, now }).catch(() => null)
        const liked = start && start.source.startsWith('like') ? choose(start.rows as CatalogueRow[], slot, context) : null
        if (liked) return { item: liked, from: start!.source }
      }
      // The likes have fingerprints: among the videos the little AI has read — wherever they are in the stock, six hundred at a time through their own
      // index (the owner, 3 October: the list is a coverage that grows, not a limit; the shape of the likes over the whole stock answers while it is thin) —
      // the dozen nearest to a centre of the curator's taste, then the session's rules among them; never a lookalike of what this device refused with "pas ça".
      const taste = await likedCentres(db, now).catch(() => [] as Float32Array[])
      if (taste.length) {
        const refused = await dislikedPrints(db, context.disliked).catch(() => [] as Uint8Array[])
        const rows = (await seekPrinted(db, random, SIFTED_ROWS).catch(() => [] as CatalogueRow[])).filter((row) => { const bits = fromRow(row[VEC]); return bits && !nearAny(bits, refused, DISLIKE_ALIKE) })
        if (rows.length >= TASTE_MEASURED_MIN) {
          const scored = rows.map((row) => ({ row, score: Math.max(...taste.map((centre) => towards(fromRow(row[VEC])!, centre))) })).sort((left, right) => right.score - left.score)
          const picked = choose(scored.slice(0, TASTE_NEAREST).map((entry) => entry.row), slot, context)
          if (picked) return { item: picked, from: 'taste:ai' }
        }
      }
      const bag = await tasteBag(db, now).catch(() => [] as Array<{ universe: Universe; era?: string }>)
      if (bag.length) {
        const shape = bag[Math.floor(random() * bag.length)]
        const rows = await seekUniverse(db, shape.universe, random, SIFTED_ROWS)
        const alike = shape.era ? rows.filter((row) => (row.v3 as { era?: string } | undefined)?.era === shape.era) : rows
        const picked = choose(alike.length >= 8 ? alike : rows, slot, context)
        if (picked) return { item: picked, from: `taste:${shape.universe}${shape.era ? `/${shape.era}` : ''}`, universe: shape.universe }
      }
      const dug = choose(await seekDig(db, 'likes', random), slot, context)
      return dug ? { item: dug, from: 'dig:likes' } : null
    }
    case 'world': {
      // Elsewhere: the register the whole stock carries, and the people the dig found round the world — one pool, the least served first.
      const [elsewhere, people] = await Promise.all([seek(db, { 'v3.registers': 'elsewhere', type: 'video', ...SERVABLE }, REGISTER_INDEX, random, SIFTED_ROWS), seekDig(db, 'people', random)])
      const picked = choose([...elsewhere, ...people], slot, context)
      return picked ? { item: picked, from: (picked as Candidate & { line?: string }).line === 'dig' ? 'dig:people' : 'register:elsewhere' } : null
    }
    case 'weird': {
      // The odd old words the whole stock carries, the themes the dig digs on purpose — bloopers, ventriloquists, weird commercials — and what the drift found by browsing: one pool.
      const [words, themes, drifted] = await Promise.all([seek(db, { 'v3.registers': 'cool-words', type: 'video', ...SERVABLE }, REGISTER_INDEX, random, ROWS), seekDig(db, 'keywords', random), seek(db, { 'v3.line': 'drift', type: 'video', ...SERVABLE }, LINE_INDEX, random, ROWS)])
      const picked = choose([...words, ...themes, ...drifted], slot, context)
      const line = (picked as Candidate & { line?: string } | null)?.line
      return picked ? { item: picked, from: line === 'dig' ? 'dig:keywords' : line === 'drift' ? 'drift' : 'register:cool-words' } : null
    }
    case 'bonus': {
      // One universe named on purpose, in turn, each under its own quality rule (the owner, 1 October).
      const universe = bonusAt(state.seed, state.videos ?? 0)
      if (universe === 'music') return inUniverse(db, universe, slot, context, SIFTED_ROWS, (row) => livelyRank(row) <= 1)
      if (universe === 'gaming') {
        // A named game first, not a let's play; a let's play now and then, when the rows hold nothing else.
        return (await inUniverse(db, universe, slot, context, SIFTED_ROWS, (row) => named(row) && !isLetsPlay(String(row.title ?? '')) && !isLive(row)))
          ?? inUniverse(db, universe, slot, context, SIFTED_ROWS, (row) => !isLive(row))
      }
      return inUniverse(db, universe, slot, context, ROWS, (row, candidate) => seconds(candidate) <= SHORT_SECONDS && livelyRank(row) === 0)
    }
    case 'chance': {
      // Anywhere in the stock: the broad sample every draw used to start from.
      const rows = await sampleCatalogue(db, baseFilter('video', lang, now))
      const any = choose(rows, slot, context)
      return any ? { item: any, from: 'sample' } : null
    }
    case 'joker': {
      const own = choose(await seekUniverse(db, card, random, ROWS), slot, context)
      return own ? { item: own, from: 'universe', universe: card } : null
    }
  }
}

/**
 * What a video draw gets from the wheel: the card of this video, filled; the
 * joker when the card has nothing; null when the wheel has nothing at all,
 * and the older paths answer.
 */
export async function selectWheel<T>(db: Db, ticket: Intent, state: Session, freshSeen: FreshSeen | null, decode: Decoder<T>, lang: string, random: Rng, now: number, card: Universe, remembered: ReadonlySet<number> = new Set(), disliked: readonly string[] = []): Promise<WheelResult<T> | null> {
  if (ticket.type !== 'video') return null
  const slot = slotAt(state.seed, state.videos ?? 0)
  const media = await mediaChannelKeys(db, now).catch(() => new Set<string>())
  const context: Context<T> = { ticket, state, decode, lang, random, now, card, freshSeen, rules: sessionRules(state, remembered), media, disliked: new Set(disliked) }
  let filled = await fillSlot(db, slot, context).catch(() => null)
  let fallback = false
  if (!filled && slot !== 'joker') {
    filled = await fillSlot(db, 'joker', context).catch(() => null)
    fallback = true
  }
  if (!filled) return null
  return {
    item: filled.item, branch: 'general', fallback,
    selection: { requestedLane: ticket.lane, servedLane: 'any', reasons: ['wheel'] },
    wheel: { slot, from: filled.from, ...(filled.universe ? { universe: filled.universe } : {}), served: filled.item.served ?? 0, fallback },
  }
}
