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

import type { Db, Document, Filter } from 'mongodb'

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
import { drawStart } from '../v3/cool/start'
import { isNewsTitle, isTrailerTitle, livelyRank, TRAILERS_PER_SESSION, trailersSeenIn } from '../v3/cool/themes'
import { isLetsPlay, isStillAlbum } from '../v3/dig/door'
import type { DigBase, Popularity, Universe } from '../v3/types'

export const SLOTS = ['buzz', 'long', 'retro', 'taste', 'chance', 'world', 'short', 'deep', 'joker', 'weird', 'bonus'] as const
export type Slot = (typeof SLOTS)[number]
/** One round of the wheel: the buzz and chance twice, every other card once. */
export const WHEEL: readonly Slot[] = ['buzz', 'buzz', 'long', 'retro', 'taste', 'chance', 'chance', 'world', 'short', 'deep', 'joker', 'weird', 'bonus']
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
/** One universe among the last ten videos: two at most (the owner, 30 September: "pas deux fois le même thème sur dix randoms"; 1 October: music at a fifth of a session with the bonus card). */
export const UNIVERSE_IN_TEN = 2
/** Not the same subject, nor the same author, within this many videos. */
export const SPACING = 10
/**
 * Of the media clips set aside (scripts/v3/outlet-sweep.ts, ninety-seven
 * thousand on 1 October), one slips through the chance card now and then:
 * one or two in three hundred randoms, for now (the owner, 1 October).
 */
export const MEDIA_TRICKLE = 1 / 13
const SWEEPS = 'mini_series_sweeps_v3'
const MEDIA_CACHE_MS = 10 * 60_000
let mediaChannels: { at: number; keys: string[] } | null = null

const QUERY_BUDGET_MS = 1_500
const UNIVERSE_INDEX = 'v3_universe_type_rand'
const ERA_INDEX = 'v3_era_type_rand'
const LINE_INDEX = 'v3_line_type_rand'
const REGISTER_INDEX = 'v3_register_type_rand'
const ANY_INDEX = 'type_rand_lookup'
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
type Context<T> = { ticket: Intent; state: Session; decode: Decoder<T>; lang: string; random: Rng; now: number; card: Universe; freshSeen: FreshSeen | null; rules: SessionRules }
type Filled<T> = { item: Candidate<T>; from: string; universe?: Universe }

/** The signals the session's proportions read, written on the candidate so the page keeps them in its exposures. */
export function withSignals<T>(candidate: Candidate<T>): Candidate<T> {
  const lang = titleLanguage(candidate.title)
  const news = candidate.universe === 'news-society' || isNewsTitle(candidate.title)
  return { ...candidate, ...(lang ? { lang } : {}), ...(news ? { news: true } : {}) }
}

export type Refusal = 'subject' | 'author' | 'foreign' | 'language' | 'news' | 'trailer' | 'universe'
export type SessionRules = {
  /** Why the session refuses this candidate now, or null. */
  refuses: (candidate: Candidate) => Refusal | null
  previousUniverse?: string
  lastUniverses: Set<string>
}

/**
 * What the last ten videos of the session allow: the same subject or author
 * not again, at most three titles of one language or in a foreign script, one
 * news video, two of one universe, two trailers in the whole session. Read on
 * the exposures the page keeps (lib/discovery/diversity.ts).
 */
export function sessionRules(state: Session): SessionRules {
  const recent = (state.exposures ?? []).filter((exposure) => exposure.type === 'video').slice(-SPACING)
  const subjects = new Set(recent.flatMap((exposure) => (exposure.subject != null ? [exposure.subject] : [])))
  const authors = new Set(recent.flatMap((exposure) => (exposure.author != null ? [exposure.author] : [])))
  const foreignFull = recent.filter((exposure) => exposure.foreign).length >= FOREIGN_IN_TEN
  const languages = new Map<string, number>()
  for (const exposure of recent) if (exposure.lang) languages.set(exposure.lang, (languages.get(exposure.lang) ?? 0) + 1)
  const newsFull = recent.filter((exposure) => exposure.news).length >= NEWS_IN_TEN
  const universes = new Map<string, number>()
  for (const exposure of recent) if (exposure.universe) universes.set(exposure.universe, (universes.get(exposure.universe) ?? 0) + 1)
  const trailersFull = trailersSeenIn(state.exposures) >= TRAILERS_PER_SESSION
  // The universes lead (the owner, 28 September): not the one of the previous video when another fits, the last three set aside when the count allows.
  const previousUniverse = recent[recent.length - 1]?.universe
  const lastUniverses = new Set(recent.slice(-3).flatMap((exposure) => (exposure.universe ? [exposure.universe] : [])))
  return {
    refuses: (candidate) => {
      const stamp = exposureOf(candidate)
      if (stamp?.subject != null && subjects.has(stamp.subject)) return 'subject'
      if (stamp?.author != null && authors.has(stamp.author)) return 'author'
      if (stamp?.foreign && foreignFull) return 'foreign'
      if (candidate.lang && (languages.get(candidate.lang) ?? 0) >= LANGUAGE_IN_TEN) return 'language'
      if (candidate.news && newsFull) return 'news'
      if (candidate.universe && (universes.get(candidate.universe) ?? 0) >= UNIVERSE_IN_TEN) return 'universe'
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
    const payload = decode(row)
    if (payload == null) continue
    const candidate = withSignals(candidateFromRow(row, payload, now))
    if (!hardEligible(candidate, ticket, state) || echoesSession(candidate, state.exposures) || rules.refuses(candidate)) continue
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
async function mediaChannelKeys(db: Db, now: number): Promise<string[]> {
  if (mediaChannels && now - mediaChannels.at < MEDIA_CACHE_MS) return mediaChannels.keys
  const sweeps = await db.collection(SWEEPS).find({ kind: 'outlet', undoneAt: { $exists: false } } as Document, { projection: { channels: 1 }, maxTimeMS: QUERY_BUDGET_MS }).toArray().catch(() => [] as Document[])
  const keys = [...new Set(sweeps.flatMap((sweep) => (Array.isArray(sweep.channels) ? (sweep.channels as string[]) : [])))]
  mediaChannels = { at: now, keys }
  return keys
}

/** One of the set-aside media clips, from one of their channels at random, under the session's rules. */
async function mediaTrickle<T>(db: Db, context: Context<T>): Promise<Filled<T> | null> {
  const keys = await mediaChannelKeys(db, context.now)
  if (!keys.length) return null
  const key = keys[Math.floor(context.random() * keys.length)]
  const rows = await db.collection('items').find({ 'v3.channelKey': key, type: 'video', isSuppressed: true, suppressedReason: 'outlet' } as Document, { hint: 'v3_channel_key', limit: 24, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  // Set aside for the draw at large; for this one draw the mark is lifted.
  const lifted = rows.map(({ isSuppressed: _mark, suppressedReason: _why, ...row }) => row as CatalogueRow)
  const pick = choose(lifted, 'chance', context)
  return pick ? { item: pick, from: 'media-trickle' } : null
}

/** One card, filled from the stock; null when nothing fits it. */
export async function fillSlot<T>(db: Db, slot: Slot, context: Context<T>): Promise<Filled<T> | null> {
  const { ticket, state, decode, lang, random, now, card, rules } = context
  switch (slot) {
    case 'buzz': {
      // The day's list, none this device already saw today, under the session's proportions; the trend line when the day is spent.
      const fresh = await selectFresh(db, ticket, state, context.freshSeen, decode, now, random, undefined, (candidate) => !rules.refuses(withSignals(candidate))).catch(() => null)
      if (fresh) return { item: withSignals(fresh.item), from: 'fresh' }
      const rows = (await seek(db, { 'v3.line': 'trend', type: 'video', ...SERVABLE }, LINE_INDEX, random, ROWS))
        .filter((row) => isCoolCandidate(row as LabelableRow) && isCleanTitle(row.title as string))
      const trend = choose(rows, slot, context)
      return trend ? { item: trend, from: 'trend' } : null
    }
    case 'long':
      return inUniverseThenAny(db, slot, context, SIFTED_ROWS, (row, candidate) => seconds(candidate) > LONG_SECONDS && !isLive(row))
    case 'short':
      return inUniverseThenAny(db, slot, context, ROWS, (row, candidate) => seconds(candidate) >= 15 && seconds(candidate) <= SHORT_SECONDS && livelyRank(row) === 0)
    case 'deep': {
      const little = (row: CatalogueRow) => (row.v3 as { popularity?: Popularity } | undefined)?.popularity === 'niche' || (typeof row.viewCount === 'number' && row.viewCount < DEEP_VIEWS)
      return (await inUniverseThenAny(db, slot, context, ROWS, (row) => little(row) && named(row))) ?? inUniverseThenAny(db, slot, context, ROWS, (row) => little(row))
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
      // A zone around one of the curator's likes; else what the dig's likes base brought in.
      const start = await drawStart(db, { type: 'video', source: 'like', random, now }).catch(() => null)
      const liked = start && start.source.startsWith('like') ? choose(start.rows as CatalogueRow[], slot, context) : null
      if (liked) return { item: liked, from: start!.source }
      const dug = choose(await seekDig(db, 'likes', random), slot, context)
      return dug ? { item: dug, from: 'dig:likes' } : null
    }
    case 'world': {
      // A person or a work of a country, as the dig's people base found it; else the register of the elsewhere.
      const person = choose(await seekDig(db, 'people', random), slot, context)
      if (person) return { item: person, from: 'dig:people' }
      const elsewhere = choose(await seek(db, { 'v3.registers': 'elsewhere', type: 'video', ...SERVABLE }, REGISTER_INDEX, random, ROWS), slot, context)
      return elsewhere ? { item: elsewhere, from: 'register:elsewhere' } : null
    }
    case 'weird': {
      // The themes the dig digs on purpose — bloopers, ventriloquists, weird commercials (lib/v3/dig/themes.json) — else the register of odd old words.
      const theme = choose(await seekDig(db, 'keywords', random), slot, context)
      if (theme) return { item: theme, from: 'dig:keywords' }
      const words = choose(await seek(db, { 'v3.registers': 'cool-words', type: 'video', ...SERVABLE }, REGISTER_INDEX, random, ROWS), slot, context)
      return words ? { item: words, from: 'register:cool-words' } : null
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
      // Now and then, one of the media clips set aside; else anywhere in the stock, the broad sample every draw used to start from.
      if (random() < MEDIA_TRICKLE) {
        const slipped = await mediaTrickle(db, context).catch(() => null)
        if (slipped) return slipped
      }
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
export async function selectWheel<T>(db: Db, ticket: Intent, state: Session, freshSeen: FreshSeen | null, decode: Decoder<T>, lang: string, random: Rng, now: number, card: Universe): Promise<WheelResult<T> | null> {
  if (ticket.type !== 'video') return null
  const slot = slotAt(state.seed, state.videos ?? 0)
  const context: Context<T> = { ticket, state, decode, lang, random, now, card, freshSeen, rules: sessionRules(state) }
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
