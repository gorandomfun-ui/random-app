/**
 * The rules that decide what the next draw may be.
 *
 * This is where the repetition the owner reports is actually fought. Every
 * rule is a memory of what has just been shown: the same author, the same
 * subject, the same universe, the same near-duplicate family all have to wait
 * their turn.
 */

import type { ItemTags, Popularity, Universe } from '../types'

/** What the session remembers, newest last. */
export type DrawHistory = {
  channelKeys: string[]
  subjectIds: string[]
  universes: Universe[]
  nearFamilies: string[]
  formatFamilies: string[]
  popularities: Popularity[]
}

export const EMPTY_HISTORY: DrawHistory = {
  channelKeys: [],
  subjectIds: [],
  universes: [],
  nearFamilies: [],
  formatFamilies: [],
  popularities: [],
}

/** How far back each rule looks. */
export const SPACING = {
  channel: 100,
  subject: 25,
  nearFamily: 100,
  formatFamily: 15,
  /** Three of the same world in a row reads as a theme, not a surprise. */
  universeRun: 3,
} as const

export type DrawCandidate = {
  id: string
  v3: Pick<ItemTags, 'universe' | 'popularity' | 'subjects'> & {
    channelKey?: string
    nearFamily?: string
    formatFamily?: string
  }
}

function recent<T>(values: T[], depth: number): T[] {
  return values.slice(-depth)
}

/** Whether the item may be shown next, given what came before. */
export function isAllowed(history: DrawHistory, candidate: DrawCandidate): boolean {
  const author = candidate.v3.channelKey
  if (author && recent(history.channelKeys, SPACING.channel).includes(author)) return false

  const primary = candidate.v3.subjects?.find((subject) => subject.role === 'primary')?.id
  if (primary && recent(history.subjectIds, SPACING.subject).includes(primary)) return false

  const near = candidate.v3.nearFamily
  if (near && recent(history.nearFamilies, SPACING.nearFamily).includes(near)) return false

  const format = candidate.v3.formatFamily
  if (format && recent(history.formatFamilies, SPACING.formatFamily).includes(format)) return false

  // Blocked only once the run is already that long, so two in a row is fine.
  const lastUniverses = recent(history.universes, SPACING.universeRun)
  if (
    lastUniverses.length === SPACING.universeRun &&
    lastUniverses.every((universe) => universe === candidate.v3.universe)
  ) {
    return false
  }

  return true
}

/** Roughly four niche, four mid, two well-known per ten draws. */
const POPULARITY_TARGET: Record<Popularity, number> = {
  niche: 0.4,
  mid: 0.3,
  known: 0.2,
  mainstream: 0.1,
  unknown: 0,
}

/**
 * How much the draw wants this popularity right now.
 *
 * Without this the draw follows the catalogue, which is 78% under a thousand
 * views — so a visitor would almost only ever see things nobody has watched.
 */
export function popularityWeight(history: DrawHistory, popularity: Popularity): number {
  const window = recent(history.popularities, 10)
  if (!window.length) return 1
  const seen = window.filter((entry) => entry === popularity).length / window.length
  const wanted = POPULARITY_TARGET[popularity] ?? 0
  if (wanted === 0) return 0.25
  // Under target it is wanted more, over target less, never to zero.
  return Math.max(0.15, Math.min(3, (wanted + 0.05) / (seen + 0.05)))
}

/**
 * A family of 150 near-identical videos should not be 150 times likelier than
 * a one-off. The square root flattens that: 150 items weigh about 12, not 150.
 */
export function familyWeight(familySize: number): number {
  if (familySize <= 1) return 1
  return Math.min(12, Math.sqrt(familySize))
}

/** Records what was drawn, so the next call knows about it. */
export function remember(history: DrawHistory, candidate: DrawCandidate): DrawHistory {
  const primary = candidate.v3.subjects?.find((subject) => subject.role === 'primary')?.id
  const keep = <T>(values: T[], value: T | undefined, depth: number): T[] =>
    value === undefined ? values.slice(-depth) : [...values, value].slice(-depth)

  return {
    channelKeys: keep(history.channelKeys, candidate.v3.channelKey, SPACING.channel),
    subjectIds: keep(history.subjectIds, primary, SPACING.subject),
    universes: keep(history.universes, candidate.v3.universe, SPACING.universeRun),
    nearFamilies: keep(history.nearFamilies, candidate.v3.nearFamily, SPACING.nearFamily),
    formatFamilies: keep(history.formatFamilies, candidate.v3.formatFamily, SPACING.formatFamily),
    popularities: keep(history.popularities, candidate.v3.popularity, 10),
  }
}
