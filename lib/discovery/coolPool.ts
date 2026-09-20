/**
 * The cool pool inside the live random.
 *
 * A cool visual ticket is served from a thread: a seed someone vouched for —
 * a curation like, or a video with a real audience among the cool words — then
 * two of its Wave neighbours, dosed so the three hold one proven content and
 * two discoveries. The format sequence stays in charge of what type comes
 * next, so the members of a thread arrive on the visitor's next cool draws,
 * whatever else the sequence shows in between.
 *
 * No server state: the members carry the thread as their series, and the
 * session's recent list says where the visitor is in it.
 */

import { ObjectId, type Db } from 'mongodb'

import { candidateFromRow, type CatalogueRow } from './catalog'
import { hardEligible, type Intent, type PoolResult, type Session } from './pool'
import type { Rng } from './random'
import type { Candidate, Seen } from './types'
import {
  COOL_SEEDS_COLLECTION, THREAD_PREFIX, chooseSeed, isProven, loadSeeds, wantedAround,
  type Dose, type SeedKind,
} from '../v3/cool/thread'
import { composeWave, loadAnchor } from '../v3/wave/find'
import type { WaveCandidate } from '../v3/wave/select'
import type { Popularity } from '../v3/types'

/** The seed and two neighbours. */
export const THREAD_SIZE = 3
/**
 * A thread continues only while its last member is this close in what the
 * visitor saw: two neighbours spread across a whole session are not a thread.
 */
export const THREAD_REACH = 6
/** Documents read for one neighbour draw: enough for the eligibility rules to refuse a few. */
const NEIGHBOUR_ROWS = 8
const SEED_ATTEMPTS = 3
const QUERY_BUDGET_MS = 1500

export type ThreadProgress = {
  key: string
  seedKey: string
  /** Members already served, the seed included. */
  served: number
  authors: Set<string>
}

/** Where the visitor is in a thread, read from what they were served. */
export function currentThread(recent: readonly Seen[]): ThreadProgress | null {
  const last = [...recent.slice(-THREAD_REACH)].reverse().find((seen) => seen.seriesKey?.startsWith(THREAD_PREFIX))
  if (!last?.seriesKey) return null
  const members = recent.filter((seen) => seen.seriesKey === last.seriesKey)
  return {
    key: last.seriesKey,
    seedKey: last.seriesKey.slice(THREAD_PREFIX.length),
    served: members.length,
    authors: new Set(members.map((member) => member.authorKey?.toLowerCase()).filter((key): key is string => Boolean(key))),
  }
}

export type CoolChoice = {
  seed: string
  role: 'seed' | 'neighbour'
  kind?: SeedKind
  popularity: Popularity
  level?: number
  dose?: Dose
  served: number
}
export type CoolResult<T> = PoolResult<T> & { cool: CoolChoice }

type Decoder<T> = (row: CatalogueRow) => T | null

function toCandidate<T>(row: CatalogueRow, decode: Decoder<T>, now: number, seriesKey: string): Candidate<T> | null {
  const payload = decode(row)
  if (payload == null) return null
  // The thread is the series: the session keeps it on every member it saw.
  return { ...candidateFromRow(row, payload, now), seriesKey }
}

const doseOf = (candidate: WaveCandidate): Dose => (isProven(candidate.v3.popularity) ? 'proven' : 'discovery')

async function continueThread<T>(
  db: Db, thread: ThreadProgress, ticket: Intent, state: Session, decode: Decoder<T>, now: number,
): Promise<CoolResult<T> | null> {
  const seed = await db
    .collection(COOL_SEEDS_COLLECTION)
    .findOne({ contentKey: thread.seedKey }, { projection: { popularity: 1 }, maxTimeMS: QUERY_BUDGET_MS })
  if (!seed) return null
  const seedId = seed._id as ObjectId
  const loaded = await loadAnchor(db, seedId)
  if (!loaded) return null

  const popularity = (loaded.row.v3?.popularity ?? seed.popularity ?? 'unknown') as Popularity
  const dose = wantedAround(popularity)[thread.served - 1] ?? 'discovery'
  const wave = await composeWave(db, loaded.anchor, seedId, [])
  // Only the requested format, never an author the thread already showed.
  const pool = [...wave.items, ...wave.spares].filter(
    (candidate) => candidate.type === ticket.type &&
      !(candidate.v3.channelKey && thread.authors.has(candidate.v3.channelKey.toLowerCase())),
  )
  if (!pool.length) return null
  // The wanted dose first, Wave order kept within it; the other dose is the fallback.
  const ordered = [...pool.filter((c) => doseOf(c) === dose), ...pool.filter((c) => doseOf(c) !== dose)].slice(0, NEIGHBOUR_ROWS)

  const rows = (await db
    .collection('items')
    .find({ _id: { $in: ordered.map((candidate) => new ObjectId(candidate.id)) } }, { maxTimeMS: QUERY_BUDGET_MS })
    .toArray()) as CatalogueRow[]
  const byId = new Map(rows.map((row) => [String(row._id), row]))
  for (const chosen of ordered) {
    const row = byId.get(chosen.id)
    if (!row) continue
    const candidate = toCandidate(row, decode, now, thread.key)
    if (!candidate || !hardEligible(candidate, ticket, state)) continue
    return {
      item: candidate, branch: 'autonomous', fallback: false,
      selection: { requestedLane: ticket.lane, servedLane: 'any', reasons: [] },
      cool: { seed: thread.seedKey, role: 'neighbour', popularity: chosen.v3.popularity, level: chosen.level, dose: doseOf(chosen), served: thread.served + 1 },
    }
  }
  return null
}

async function startThread<T>(
  db: Db, ticket: Intent, state: Session, decode: Decoder<T>, random: Rng, now: number,
): Promise<CoolResult<T> | null> {
  const seeds = (await loadSeeds(db, now)).filter((seed) => seed.type === ticket.type)
  const seen = new Set(state.recent.map((entry) => entry.key))
  for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt += 1) {
    const seed = chooseSeed(seeds, seen, random)
    if (!seed) return null
    seen.add(seed.id)
    if (seed.contentKey) seen.add(seed.contentKey)

    const row = (await db
      .collection('items')
      .findOne({ _id: new ObjectId(seed.id) }, { maxTimeMS: QUERY_BUDGET_MS })) as CatalogueRow | null
    if (!row) continue
    const payload = decode(row)
    if (payload == null) continue
    const plain = candidateFromRow(row, payload, now)
    const candidate: Candidate<T> = { ...plain, seriesKey: `${THREAD_PREFIX}${plain.key}` }
    if (!hardEligible(candidate, ticket, state)) continue
    return {
      item: candidate, branch: seed.kind === 'like' ? 'editorial' : 'autonomous', fallback: false,
      selection: { requestedLane: ticket.lane, servedLane: 'any', reasons: [] },
      cool: { seed: plain.key, role: 'seed', kind: seed.kind, popularity: seed.popularity, served: 1 },
    }
  }
  return null
}

/**
 * What a cool visual ticket gets: the next member of the visitor's thread,
 * or the seed of a new one. Null when the pool holds nothing eligible, and
 * the caller falls back to the lanes.
 */
export async function selectCool<T>(
  db: Db, ticket: Intent, state: Session, decode: Decoder<T>, random: Rng, now: number,
): Promise<CoolResult<T> | null> {
  const thread = currentThread(state.recent)
  if (thread && thread.served < THREAD_SIZE) {
    const continued = await continueThread(db, thread, ticket, state, decode, now)
    if (continued) return continued
  }
  return startThread(db, ticket, state, decode, random, now)
}
