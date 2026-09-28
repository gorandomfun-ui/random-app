/**
 * The theme first, then the content (the owner, 28 September: "on arrive pas
 * à trouver la bonne formule pour avoir une diversité de trucs"). Six replayed
 * sessions showed the feed amplifying what bored him — gaming 16 % of what was
 * shown for 6 % of the catalogue, music 20 % for 13 % — and hiding the rest —
 * humour 2 % for 5.5 %. Nothing in the draw ever said "after music, something
 * else": the diversity rule only keeps near-duplicates apart.
 *
 * So every visual of a session first turns a card of a deck of universes,
 * shuffled by the session's seed, never the same universe twice in a row,
 * the deck after deck; then the usual draw — fresh of the day, the cool bag,
 * the common pool — looks for its content in that universe, and falls back
 * to what it did before when the universe has nothing for it. Proportions,
 * not exclusions: every universe keeps its turn.
 *
 * Inside a universe, what is lively and short comes first (`livelyRank`): a
 * clip of a few minutes before a four-hour live, a moving picture before a
 * still album cover; and a session sees two trailers at most.
 */

import { arrangement } from './bag'
import type { Universe } from '../types'

/**
 * The deck: how many cards of each universe. Humour, sport, discoveries,
 * animals, people's everyday lives and science carry the feed; music keeps
 * two cards, gaming one, as their share of what a visitor wants to see and
 * no longer their share of what the charts push.
 */
export const DEFAULT_THEME_DECK: Partial<Record<Universe, number>> = {
  'humor-memes': 3, sport: 2, travel: 2, 'nature-animals': 2, 'people-everyday': 2, science: 2, music: 2,
  food: 1, art: 1, craft: 1, vehicles: 1, animation: 1, history: 1, 'events-parties': 1, fashion: 1, tech: 1,
  gaming: 1, 'cinema-tv': 1, 'news-society': 1, other: 1,
}

export function themeDeck(weights: Partial<Record<Universe, number>> = DEFAULT_THEME_DECK): Universe[] {
  return Object.entries(weights).flatMap(([universe, count]) => Array<Universe>(Math.max(0, Math.floor(count ?? 0))).fill(universe as Universe))
}

/**
 * The universe of the session's `index`-th visual. Deck after deck, each
 * shuffled by the seed and never starting with the universe the previous one
 * ended on: two visuals in a row never share a universe.
 */
export function themeAt(seed: number, index: number, deck: readonly Universe[] = themeDeck()): Universe {
  const at = Math.max(0, Math.floor(index))
  const ordinal = Math.floor(at / deck.length)
  let previous: Universe | null = null
  let order: Universe[] = []
  for (let round = 0; round <= ordinal; round += 1) {
    order = arrangement(seed, 'theme', round, deck, previous)
    previous = order[order.length - 1] ?? null
  }
  return order[at % deck.length]
}

/** Is the theme deck on for this request: the switch on Vercel, or the admin's rehearsal. */
export function themeDeckSwitchedOn(): boolean {
  return process.env.RANDOM_THEME_DECK === '1'
}

const TRAILER = /\b(trailer|teaser|bande[- ]annonce|tráiler|avance oficial)\b/i
const STREAM = /\b(live ?stream|en direct|directo|ao vivo|stream(?:ing)?|🔴)/i
/** How many trailers a session may see: "1 ou 2 trailers c'est marrant, plus c'est comme regarder de la pub". */
export const TRAILERS_PER_SESSION = 2

export function isTrailerTitle(title: unknown): boolean {
  return TRAILER.test(String(title ?? ''))
}

function seconds(duration: unknown): number | null {
  if (typeof duration === 'number' && Number.isFinite(duration)) return duration
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(duration ?? ''))
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : null
}

/**
 * How lively a row is, 0 best: a video between fifteen seconds and eight
 * minutes, moving, not a live stream. 1: a bit long, or its length unknown.
 * 2: a still album cover ("- Topic" channels), a stream, past twenty
 * minutes — or a trailer, served only when the universe offers nothing
 * else (a teaser is one: the session's own count misses them).
 * `Infinity`: a trailer when the session has had its two.
 */
export function livelyRank(row: Record<string, unknown>, trailersSeen = 0): number {
  if (isTrailerTitle(row.title)) return trailersSeen >= TRAILERS_PER_SESSION ? Infinity : 2
  if (row.type !== 'video') return 0
  const length = seconds(row.duration)
  if (/ - Topic$/.test(String(row.channelTitle ?? ''))) return 2
  if (row.liveBroadcastContent === 'live' || row.liveBroadcastContent === 'upcoming') return 2
  if (length !== null && length > 20 * 60) return 2
  if (STREAM.test(String(row.title ?? '')) && (length === null || length > 10 * 60)) return 2
  if (length === null || length > 8 * 60 || length < 15) return 1
  return 0
}

/** The rows, the liveliest first, the order within a rank kept (it is already random); the trailers past the session's two left out. */
export function byLiveliness<T extends Record<string, unknown>>(rows: readonly T[], trailersSeen = 0): T[] {
  return rows
    .map((row, order) => ({ row, order, rank: livelyRank(row, trailersSeen) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .map((entry) => entry.row)
}

/** The trailers a session has seen, read from what it keeps of its visuals (their title practices). */
export function trailersSeenIn(exposures: ReadonlyArray<{ practices?: readonly string[] }> | undefined): number {
  return (exposures ?? []).filter((exposure) => exposure.practices?.includes('film-trailer')).length
}
