/**
 * What a session's cool draws ask for: the trend, the likes, a niche, or
 * something recent.
 *
 * Ten tickets per session, in an order the seed decides once: two for the
 * trend (what the trending lines brought in), three around the curator's
 * likes (a zone around a like, never the like itself), three niches — the
 * four registers in turn: gaming, old school, music, elsewhere — and two
 * recent: modern contents with an audience, written in Latin letters, so the
 * hook shows this year as well as the archives and elsewhere (the owner,
 * 2026-09-23: "peu de moderne, ou alors asiatique"). Never the same source
 * twice in a row, the previous bag's last ticket included; never gaming
 * twice in a row among the niches. A thin trend falls back to the recent,
 * then to a niche; nothing falls back the other way (`start.ts`).
 */

import { hash, seeded, shuffled, type Rng } from '@/lib/discovery/random'

export type CoolSource = 'trend' | 'like' | 'niche' | 'recent'
export const COOL_SOURCES: CoolSource[] = ['trend', 'like', 'niche', 'recent']
export type NicheSource = 'gaming' | 'oldschool' | 'music' | 'elsewhere'
export const NICHE_SOURCES: NicheSource[] = ['gaming', 'oldschool', 'music', 'elsewhere']

export const DEFAULT_BAG: CoolSource[] = [
  'trend', 'trend', 'like', 'like', 'like', 'niche', 'niche', 'niche', 'recent', 'recent',
]
/** The trend is where the bubble is; Random's point is to leave it. */
const MAX_TREND_TICKETS = 5

/**
 * The bag, from `RANDOM_COOL_BAG` when set — "trend:2,like:3,niche:3,recent:2" — else
 * the default. A setting that names no known source, or more than five
 * trend tickets, is ignored.
 */
export function coolBag(setting: string | undefined = process.env.RANDOM_COOL_BAG): CoolSource[] {
  if (!setting?.trim()) return DEFAULT_BAG
  const bag: CoolSource[] = []
  for (const token of setting.split(',')) {
    const [name, countRaw] = token.split(':').map((part) => part.trim().toLowerCase())
    const count = countRaw === undefined ? 1 : Number(countRaw)
    if (!COOL_SOURCES.includes(name as CoolSource) || !Number.isInteger(count) || count < 0 || count > 10) return DEFAULT_BAG
    for (let index = 0; index < count; index += 1) bag.push(name as CoolSource)
  }
  if (!bag.length || bag.filter((source) => source === 'trend').length > MAX_TREND_TICKETS) return DEFAULT_BAG
  return bag
}

const noRepeat = <T>(order: readonly T[], previous: T | null) =>
  order.every((source, index) => source !== (index ? order[index - 1] : previous))

/** Most-remaining-first, the previous ticket set aside: always an order without repeats when one exists. */
function greedy<T>(bag: readonly T[], previous: T | null, random: Rng): T[] {
  const remaining = new Map<T, number>()
  for (const source of bag) remaining.set(source, (remaining.get(source) ?? 0) + 1)
  const order: T[] = []
  let last = previous
  while (order.length < bag.length) {
    const choices = [...remaining.entries()].filter(([, count]) => count > 0)
    const allowed = choices.filter(([source]) => source !== last)
    const from = allowed.length ? allowed : choices
    const most = Math.max(...from.map(([, count]) => count))
    const best = from.filter(([, count]) => count === most)
    const [source] = best[Math.floor(random() * best.length)]
    order.push(source)
    remaining.set(source, (remaining.get(source) ?? 1) - 1)
    last = source
  }
  return order
}

/**
 * One bag's tickets in order — the `ordinal`-th bag of the session —
 * shuffled by the seed and drawn again until no ticket repeats the one
 * before it, the previous bag's last ticket included.
 */
function arrangement<T>(seed: number, name: string, ordinal: number, bag: readonly T[], previous: T | null): T[] {
  if (new Set(bag).size === 1) return [...bag]
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const order = shuffled(bag, seeded(hash(`${seed}:${name}:${ordinal}:${attempt}`)))
    if (noRepeat(order, previous)) return order
  }
  return greedy(bag, previous, seeded(hash(`${seed}:${name}:${ordinal}:greedy`)))
}

/** The first `count` tickets of a session, bag after bag. Restoring a session does not change its next ticket. */
export function bagSequence(seed: number, count: number, bag: CoolSource[] = coolBag()): CoolSource[] {
  const sequence: CoolSource[] = []
  for (let ordinal = 0; sequence.length < count; ordinal += 1) {
    sequence.push(...arrangement(seed, 'cool-source', ordinal, bag, sequence[sequence.length - 1] ?? null))
  }
  return sequence.slice(0, count)
}

/** What the session's cool ticket at `index` asks for. */
export function bagSourceAt(seed: number, index: number, bag: CoolSource[] = coolBag()): CoolSource {
  const at = Math.max(0, Math.floor(index))
  return bagSequence(seed, at + 1, bag)[at]
}

/**
 * The register a niche ticket means: the four in turn, in an order the seed
 * decides, never the same one twice in a row. The ticket at `index` is the
 * k-th niche of the session, k counted over the bag sequence.
 */
export function nicheAt(seed: number, index: number, bag: CoolSource[] = coolBag()): NicheSource {
  const at = Math.max(0, Math.floor(index))
  const rank = bagSequence(seed, at, bag).filter((source) => source === 'niche').length
  const niches: NicheSource[] = []
  for (let ordinal = 0; niches.length <= rank; ordinal += 1) {
    niches.push(...arrangement(seed, 'cool-niche', ordinal, NICHE_SOURCES, niches[niches.length - 1] ?? null))
  }
  return niches[rank]
}
