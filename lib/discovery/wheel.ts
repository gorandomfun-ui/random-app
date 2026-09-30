/**
 * The wheel: one draw for every video of a session.
 *
 * Five paths used to compete for each video — the day's list, the dig, the
 * cool bag, the stock of the universe card, the common pool — each with its
 * own rules, and the same small pools came round on every device (the owner,
 * 30 September: "une solution simple, une organisation simple"). Now a session
 * turns a wheel of ten cards, shuffled by its seed, never the same card twice
 * in a row: each card says what the next video is for, the stock fills the
 * card, and among what fits, the content the site has served the least wins
 * (`served.n`, lib/discovery/served.ts — the count lives on the site, so six
 * devices do not get the same video, and a million visitors are served the
 * stock flat rather than blocked).
 *
 * The cards: the buzz (the day's list, twice a round), a long one, a retro
 * one, the curator's taste, pure chance, the world, a short lively one, a
 * little-seen one, and the joker — the universe card as the theme deck dealt
 * it. A session opens on the buzz. A card the stock cannot fill passes to the
 * joker; when the wheel has nothing at all, the older paths answer.
 *
 * The session's rules stay: not the same content, not the same story, not the
 * same subject or author within ten videos, a few titles in a script most
 * visitors cannot read (never a row of them), trailers two a session, still
 * album covers only by chance. Behind `RANDOM_WHEEL=1`, or the admin's
 * `wheel: true` for a rehearsal.
 */

import type { Db, Document, Filter } from 'mongodb'

import { candidateFromRow, type CatalogueRow } from './catalog'
import { echoesSession, exposureOf } from './diversity'
import { selectFresh } from './freshPool'
import type { FreshSeen } from './freshSeen'
import { base as baseFilter } from './mongo'
import { hardEligible, type Intent, type PoolResult, type Session } from './pool'
import type { Rng } from './random'
import { sampleCatalogue } from './sampling'
import type { Candidate } from './types'
import { arrangement } from '../v3/cool/bag'
import { isCleanTitle } from '../v3/cool/clean'
import { isCoolCandidate, type LabelableRow } from '../v3/cool/registers'
import { SERVABLE } from '../v3/cool/servable'
import { drawStart } from '../v3/cool/start'
import { livelyRank, trailersSeenIn } from '../v3/cool/themes'
import { isStillAlbum } from '../v3/dig/door'
import type { DigBase, Popularity, Universe } from '../v3/types'

export const SLOTS = ['buzz', 'long', 'retro', 'taste', 'chance', 'world', 'short', 'deep', 'joker'] as const
export type Slot = (typeof SLOTS)[number]
/** One round of the wheel: the buzz twice, every other card once. */
export const WHEEL: readonly Slot[] = ['buzz', 'buzz', 'long', 'retro', 'taste', 'chance', 'world', 'short', 'deep', 'joker']

export const wheelSwitchedOn = (): boolean => process.env.RANDOM_WHEEL === '1'

/** Over fifteen minutes is a long one; a short lively one runs fifteen seconds to four minutes. */
export const LONG_SECONDS = 15 * 60
export const SHORT_SECONDS = 4 * 60
/** Little seen: the niche of the labels, or under ten thousand views. */
export const DEEP_VIEWS = 10_000
/** Titles in a script most visitors cannot read, among the last ten videos: a few, never a row. */
export const FOREIGN_IN_TEN = 3
/** Not the same subject, nor the same author, within this many videos. */
export const SPACING = 10

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
type Context<T> = { ticket: Intent; state: Session; decode: Decoder<T>; lang: string; random: Rng; now: number; card: Universe; freshSeen: FreshSeen | null }
type Filled<T> = { item: Candidate<T>; from: string; universe?: Universe }

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

const seconds = (candidate: Candidate): number => candidate.seconds ?? 0
const isLive = (row: CatalogueRow): boolean => row.liveBroadcastContent === 'live' || row.liveBroadcastContent === 'upcoming'
const digBase = (row: CatalogueRow): DigBase | undefined => (row.v3 as { dig?: { base?: DigBase } } | undefined)?.dig?.base
const universeOf = (row: CatalogueRow): Universe | undefined => (row.v3 as { universe?: Universe } | undefined)?.universe

/**
 * What fits the card among the rows read, the least served first. Every
 * session rule is applied here, whatever the card: the session's own forty and
 * the device's week, the same story, the same subject or author within ten
 * videos, the foreign-script share, the trailers, the AI marks, the still
 * album covers (kept only for pure chance).
 */
export function choose<T>(rows: readonly CatalogueRow[], slot: Slot, context: Context<T>, keep: (row: CatalogueRow, candidate: Candidate<T>) => boolean = () => true): Candidate<T> | null {
  const { ticket, state, decode, now, random } = context
  const recent = (state.exposures ?? []).filter((exposure) => exposure.type === 'video').slice(-SPACING)
  const subjects = new Set(recent.flatMap((exposure) => (exposure.subject != null ? [exposure.subject] : [])))
  const authors = new Set(recent.flatMap((exposure) => (exposure.author != null ? [exposure.author] : [])))
  const foreignFull = recent.filter((exposure) => exposure.foreign).length >= FOREIGN_IN_TEN
  const trailersSeen = trailersSeenIn(state.exposures)
  const fitting: Array<{ candidate: Candidate<T>; rank: number; order: number }> = []
  for (const row of rows) {
    const rank = livelyRank(row, trailersSeen)
    if (!Number.isFinite(rank)) continue
    const payload = decode(row)
    if (payload == null) continue
    const candidate = candidateFromRow(row, payload, now)
    if (!hardEligible(candidate, ticket, state) || echoesSession(candidate, state.exposures)) continue
    const stamp = exposureOf(candidate)
    if (stamp?.subject != null && subjects.has(stamp.subject)) continue
    if (stamp?.author != null && authors.has(stamp.author)) continue
    if (stamp?.foreign && foreignFull) continue
    if (slot !== 'chance' && isStillAlbum({ title: String(row.title ?? ''), channelTitle: typeof row.channelTitle === 'string' ? row.channelTitle : undefined })) continue
    if (!keep(row, candidate)) continue
    // The lively rank orders the other cards; a long one is long by design, so an hour's documentary ranks with a twenty-minute one.
    fitting.push({ candidate, rank: slot === 'long' ? 0 : rank, order: random() })
  }
  fitting.sort((left, right) => (left.candidate.served ?? 0) - (right.candidate.served ?? 0) || left.rank - right.rank || left.order - right.order)
  return fitting[0]?.candidate ?? null
}

/** The card's universe first, the whole stock when the universe has nothing that fits. */
async function inUniverseThenAny<T>(db: Db, slot: Slot, context: Context<T>, limit: number, keep: (row: CatalogueRow, candidate: Candidate<T>) => boolean): Promise<Filled<T> | null> {
  const { card, random } = context
  const own = choose(await seekUniverse(db, card, random, limit), slot, context, keep)
  if (own) return { item: own, from: 'universe', universe: card }
  const any = choose(await seekAny(db, random, limit), slot, context, keep)
  return any ? { item: any, from: 'stock' } : null
}

/** One card, filled from the stock; null when nothing fits it. */
export async function fillSlot<T>(db: Db, slot: Slot, context: Context<T>): Promise<Filled<T> | null> {
  const { ticket, state, decode, lang, random, now, card } = context
  switch (slot) {
    case 'buzz': {
      // The day's list, none this device already saw today; the trend line when the day is spent.
      const fresh = await selectFresh(db, ticket, state, context.freshSeen, decode, now, random).catch(() => null)
      if (fresh) return { item: fresh.item, from: 'fresh' }
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
      const named = (row: CatalogueRow) => ((row.v3 as { subjects?: unknown[] } | undefined)?.subjects?.length ?? 0) > 0
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
      const rows = (await seek(db, { 'v3.line': 'dig', type: 'video', ...SERVABLE }, LINE_INDEX, random, SIFTED_ROWS)).filter((row) => digBase(row) === 'likes')
      const dug = choose(rows, slot, context)
      return dug ? { item: dug, from: 'dig:likes' } : null
    }
    case 'world': {
      // A person or a work of a country, as the dig's people base found it; else the register of the elsewhere.
      const rows = (await seek(db, { 'v3.line': 'dig', type: 'video', ...SERVABLE }, LINE_INDEX, random, SIFTED_ROWS)).filter((row) => digBase(row) === 'people')
      const person = choose(rows, slot, context)
      if (person) return { item: person, from: 'dig:people' }
      const elsewhere = choose(await seek(db, { 'v3.registers': 'elsewhere', type: 'video', ...SERVABLE }, REGISTER_INDEX, random, ROWS), slot, context)
      return elsewhere ? { item: elsewhere, from: 'register:elsewhere' } : null
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
export async function selectWheel<T>(db: Db, ticket: Intent, state: Session, freshSeen: FreshSeen | null, decode: Decoder<T>, lang: string, random: Rng, now: number, card: Universe): Promise<WheelResult<T> | null> {
  if (ticket.type !== 'video') return null
  const slot = slotAt(state.seed, state.videos ?? 0)
  const context: Context<T> = { ticket, state, decode, lang, random, now, card, freshSeen }
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
