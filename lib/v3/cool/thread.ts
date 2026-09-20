/**
 * The cool pool: a thread of three around a seed.
 *
 * A seed is a content someone vouched for — a curation like, or a video with
 * a real audience among the cool words — and the thread is the seed followed
 * by two of its Wave neighbours, dosed so the three hold one proven content
 * and two discoveries. Nothing is precomputed but the seeds: the neighbours
 * come from the same Wave the visitor can open on any content.
 */

import { ObjectId, type Db } from 'mongodb'

import { composeWave, loadAnchor } from '../wave/find'
import { accepts, type WaveAnchor, type WaveCandidate, type WaveLevel } from '../wave/select'
import type { ItemType, Popularity } from '../types'

export const COOL_SEEDS_COLLECTION = 'cool_seeds'

export type SeedKind = 'like' | 'editorial'
export type CoolSeed = { id: string; kind: SeedKind; type: ItemType; popularity: Popularity }
export type Rng = () => number
export type Dose = 'proven' | 'discovery'

/** Two contents around the seed: a thread is three, like a Wave. */
export const NEIGHBOURS = 2

/**
 * One thread in three starts from a like. The owner's taste is the point of
 * the cool pool, but forty likes cannot carry every thread.
 */
export const LIKE_SHARE = 1 / 3

/**
 * Proven: a real audience where it was published. Everything else — niche,
 * mid, and the images and pages that carry no view count — is a discovery.
 */
const PROVEN: Popularity[] = ['known', 'mainstream']
export const isProven = (popularity: Popularity): boolean => PROVEN.includes(popularity)

/** The thread is visual: a text carries a language, and the thread has none. */
const THREAD_TYPES: ItemType[] = ['video', 'image', 'web']

export function chooseSeed(seeds: CoolSeed[], excludeKeys: Set<string>, random: Rng): CoolSeed | null {
  const usable = seeds.filter((seed) => !excludeKeys.has(seed.id))
  const likes = usable.filter((seed) => seed.kind === 'like')
  const editorial = usable.filter((seed) => seed.kind === 'editorial')
  const fromLikes = likes.length > 0 && (editorial.length === 0 || random() < LIKE_SHARE)
  const bag = fromLikes ? likes : editorial
  return bag[Math.floor(random() * bag.length)] ?? null
}

/** What the neighbours must bring so the three hold one proven content and two discoveries. */
export function wantedAround(seedPopularity: Popularity): Dose[] {
  return isProven(seedPopularity) ? ['discovery', 'discovery'] : ['proven', 'discovery']
}

const doseOf = (candidate: WaveCandidate): Dose => (isProven(candidate.v3.popularity) ? 'proven' : 'discovery')

/**
 * Whether the candidate would make the three the same format. The Wave's caps
 * count its three; the thread's three include the seed.
 */
function makesThreeAlike(anchor: WaveAnchor, chosen: WaveCandidate[], candidate: WaveCandidate): boolean {
  return (
    chosen.length === NEIGHBOURS - 1 &&
    anchor.type === candidate.type &&
    chosen.every((item) => item.type === candidate.type)
  )
}

export function doseNeighbours(
  anchor: WaveAnchor,
  seedPopularity: Popularity,
  pool: WaveCandidate[],
  excludeKeys: string[],
): { neighbours: WaveCandidate[]; wanted: Dose[]; dosed: boolean } {
  const excluded = new Set(excludeKeys)
  const candidates = pool.filter((candidate) => THREAD_TYPES.includes(candidate.type))
  const chosen: WaveCandidate[] = []
  const wanted = wantedAround(seedPopularity)

  const take = (fits: (candidate: WaveCandidate) => boolean): boolean => {
    // The same rules as the Wave: never the seed's author, never the same
    // author twice, no repeated treatment, no near-duplicate family.
    const usable = candidates.filter(
      (candidate) => fits(candidate) && accepts(anchor, chosen, candidate, excluded),
    )
    // Wave order is kept — tightest link first — except that a third of the
    // same format waits its turn.
    const best = usable.find((candidate) => !makesThreeAlike(anchor, chosen, candidate)) ?? usable[0]
    if (!best) return false
    chosen.push(best)
    excluded.add(best.id)
    return true
  }

  let dosed = true
  for (const dose of wanted) {
    if (!take((candidate) => doseOf(candidate) === dose)) dosed = false
  }
  // The dose is a preference, the thread is the point: when the Wave holds no
  // proven content, two discoveries still make a thread.
  while (chosen.length < NEIGHBOURS && take(() => true)) {
    /* filled from what is left */
  }
  return { neighbours: chosen, wanted, dosed: dosed && chosen.length === NEIGHBOURS }
}

export type CoolThread = {
  seed: CoolSeed & { level: WaveLevel }
  neighbours: WaveCandidate[]
  wanted: Dose[]
  dosed: boolean
  attempts: number
}

/** Seeds are few and change once a day: one read a minute per server is plenty. */
const SEEDS_TTL_MS = 60_000
const SEEDS_MAX = 2000
let seedCache: { at: number; seeds: CoolSeed[] } | null = null

export async function loadSeeds(db: Db, now = Date.now()): Promise<CoolSeed[]> {
  if (seedCache && now - seedCache.at < SEEDS_TTL_MS) return seedCache.seeds
  const rows = await db
    .collection(COOL_SEEDS_COLLECTION)
    .find({}, { projection: { kind: 1, type: 1, popularity: 1 }, limit: SEEDS_MAX, maxTimeMS: 1500 })
    .toArray()
  const seeds = rows.map((row) => ({
    id: String(row._id),
    kind: row.kind as SeedKind,
    type: row.type as ItemType,
    popularity: (row.popularity ?? 'unknown') as Popularity,
  }))
  seedCache = { at: now, seeds }
  return seeds
}

/** A seed whose Wave is short makes a poor thread; a few others are tried before settling. */
const SEED_ATTEMPTS = 3

export async function composeCoolThread(
  db: Db,
  options: { excludeKeys?: string[]; random?: Rng; now?: number } = {},
): Promise<CoolThread | null> {
  const random = options.random ?? Math.random
  const excludeKeys = options.excludeKeys ?? []
  const seeds = await loadSeeds(db, options.now)
  const tried = new Set(excludeKeys)
  let best: CoolThread | null = null

  for (let attempt = 1; attempt <= SEED_ATTEMPTS; attempt += 1) {
    const seed = chooseSeed(seeds, tried, random)
    if (!seed) break
    tried.add(seed.id)

    const seedId = new ObjectId(seed.id)
    const loaded = await loadAnchor(db, seedId)
    if (!loaded) continue

    // The labels are read live: a seed whose audience was measured since it
    // was planted is dosed on what is known today.
    const popularity = loaded.row.v3?.popularity ?? seed.popularity
    const wave = await composeWave(db, loaded.anchor, seedId, excludeKeys)
    const { neighbours, wanted, dosed } = doseNeighbours(
      loaded.anchor, popularity, [...wave.items, ...wave.spares], excludeKeys,
    )
    const level = (neighbours.length ? Math.max(...neighbours.map((item) => item.level)) : 5) as WaveLevel
    const thread: CoolThread = { seed: { ...seed, popularity, level }, neighbours, wanted, dosed, attempts: attempt }
    if (neighbours.length === NEIGHBOURS) return thread
    if (!best || neighbours.length > best.neighbours.length) best = thread
  }
  return best
}
