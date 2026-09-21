/**
 * The cool pool: a thread of three around a seed.
 *
 * A thread starts from a content drawn live from the whole catalogue — one
 * of the registers, or a zone around a curation like — and goes on with two
 * of its Wave neighbours, dosed so the three hold one proven content and two
 * discoveries. Nothing is precomputed: the neighbours come from the same
 * Wave the visitor can open on any content.
 */

import { ObjectId, type Db } from 'mongodb'

import { composeWave, loadAnchor } from '../wave/find'
import { accepts, type WaveAnchor, type WaveCandidate, type WaveLevel } from '../wave/select'
import { DEFAULT_BAG, type CoolSource } from './bag'
import { drawStart, type StartSource, type StartType } from './start'
import type { ItemType, Popularity } from '../types'

export type Rng = () => number
export type Dose = 'proven' | 'discovery'

/** Two contents around the start: a thread is three, like a Wave. */
export const NEIGHBOURS = 2

/**
 * A thread is named after its first content's id and carried by its members
 * as their series, so the live random can tell where a visitor is in it from
 * what they were served — no other state.
 */
export const THREAD_PREFIX = 'thread:'

/**
 * Proven: a real audience where it was published. Everything else — niche,
 * mid, and the images and pages that carry no view count — is a discovery.
 */
const PROVEN: Popularity[] = ['known', 'mainstream']
export const isProven = (popularity: Popularity): boolean => PROVEN.includes(popularity)

/** The thread is visual: a text carries a language, and the thread has none. */
const THREAD_TYPES: ItemType[] = ['video', 'image', 'web']

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
  start: { id: string; source: StartSource; asked: CoolSource; fallback: boolean; popularity: Popularity; level: WaveLevel }
  neighbours: WaveCandidate[]
  wanted: Dose[]
  dosed: boolean
  attempts: number
}

/** A start whose Wave is short makes a poor thread; a few others are tried before settling. */
const START_ATTEMPTS = 3

export async function composeCoolThread(
  db: Db,
  options: { excludeKeys?: string[]; random?: Rng; now?: number; type?: StartType; source?: CoolSource } = {},
): Promise<CoolThread | null> {
  const random = options.random ?? Math.random
  const excludeKeys = options.excludeKeys ?? []
  const type: StartType = options.type ?? (random() < 2 / 3 ? 'video' : 'image')
  const source: CoolSource = options.source ?? DEFAULT_BAG[Math.floor(random() * DEFAULT_BAG.length)]
  const tried = new Set(excludeKeys)
  let best: CoolThread | null = null

  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
    const drawn = await drawStart(db, { type, source, excludeIds: tried, random, now: options.now })
    const row = drawn?.rows[0]
    if (!drawn || !row) continue
    const startId = new ObjectId(String(row._id))
    tried.add(String(row._id))

    const loaded = await loadAnchor(db, startId)
    if (!loaded) continue
    const popularity = loaded.row.v3?.popularity ?? 'unknown'
    const wave = await composeWave(db, loaded.anchor, startId, excludeKeys)
    const { neighbours, wanted, dosed } = doseNeighbours(
      loaded.anchor, popularity, [...wave.items, ...wave.spares], excludeKeys,
    )
    const level = (neighbours.length ? Math.max(...neighbours.map((item) => item.level)) : 5) as WaveLevel
    const thread: CoolThread = { start: { id: String(row._id), source: drawn.source, asked: drawn.asked, fallback: drawn.fallback, popularity, level }, neighbours, wanted, dosed, attempts: attempt }
    if (neighbours.length === NEIGHBOURS) return thread
    if (!best || neighbours.length > best.neighbours.length) best = thread
  }
  return best
}
