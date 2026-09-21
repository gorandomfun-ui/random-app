/**
 * The cool pool inside the live random.
 *
 * A cool visual ticket is served from a thread: a content drawn live from the
 * whole catalogue — a register, a zone around a curation like, or the trend,
 * as the session's bag decides — then two of its Wave neighbours, dosed so
 * the three hold one proven content and two discoveries. The format sequence stays in charge of what type comes
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
import { THREAD_PREFIX, isProven, wantedAround, type Dose } from '../v3/cool/thread'
import { drawStart, type StartSource } from '../v3/cool/start'
import { pickBagSource, type CoolSource } from '../v3/cool/bag'
import { composeWave, loadAnchor } from '../v3/wave/find'
import type { WaveCandidate } from '../v3/wave/select'
import type { Popularity } from '../v3/types'

/** The seed and two neighbours. */
export const THREAD_SIZE = 3
/**
 * A thread continues only while its last member is this close in what the
 * visitor saw: two neighbours spread across a whole session are not a thread.
 * With one visual draw in three cool and texts in between, consecutive cool
 * draws sit five to seven contents apart; six let one thread in five finish.
 */
export const THREAD_REACH = 10
/** Documents read for one neighbour draw: enough for the eligibility rules to refuse a few. */
const NEIGHBOUR_ROWS = 8
const START_ATTEMPTS = 3
const QUERY_BUDGET_MS = 1500

export type ThreadProgress = {
  key: string
  /** The start's id. */
  seedKey: string
  /** What the start came from, when the key says it. */
  source?: StartSource
  /** Members already served, the seed included. */
  served: number
  authors: Set<string>
}

/** "thread:<source>:<start id>" — the source rides along so the next start can avoid it and a trend thread can be told apart. */
export function threadKey(source: StartSource, id: string): string {
  return `${THREAD_PREFIX}${source}:${id}`
}

function parseThreadKey(key: string): { source?: StartSource; id: string } {
  const parts = key.slice(THREAD_PREFIX.length).split(':')
  const id = parts[parts.length - 1] ?? ''
  return parts.length > 1 ? { source: parts.slice(0, -1).join(':') as StartSource, id } : { id }
}

/** The bag source a served source counts as: the archives and the vintage GIFs are one taste. */
export function bagSourceOf(source: StartSource): CoolSource {
  if (source === 'archive' || source === 'cool-words') return 'oldschool'
  if (source.startsWith('like')) return 'like'
  if (source === 'trend') return 'trend'
  return source as CoolSource
}

/** Where the visitor is in a thread, read from what they were served. */
export function currentThread(recent: readonly Seen[]): ThreadProgress | null {
  const last = [...recent.slice(-THREAD_REACH)].reverse().find((seen) => seen.seriesKey?.startsWith(THREAD_PREFIX))
  if (!last?.seriesKey) return null
  const members = recent.filter((seen) => seen.seriesKey === last.seriesKey)
  const { source, id } = parseThreadKey(last.seriesKey)
  return {
    key: last.seriesKey,
    seedKey: id,
    ...(source ? { source } : {}),
    served: members.length,
    authors: new Set(members.map((member) => member.authorKey?.toLowerCase()).filter((key): key is string => Boolean(key))),
  }
}

/** The bag source of the visitor's last thread, however far back, so the next start is never the same taste twice in a row. */
export function lastBagSource(recent: readonly Seen[]): CoolSource | null {
  const last = [...recent].reverse().find((seen) => seen.seriesKey?.startsWith(THREAD_PREFIX))
  if (!last?.seriesKey) return null
  const { source } = parseThreadKey(last.seriesKey)
  return source ? bagSourceOf(source) : null
}

export type CoolChoice = {
  seed: string
  role: 'seed' | 'neighbour'
  source?: StartSource
  /** What the bag asked for, and whether the answer had to come from elsewhere. */
  asked?: CoolSource
  fallback?: boolean
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
  if (!ObjectId.isValid(thread.seedKey)) return null
  const seedId = new ObjectId(thread.seedKey)
  const loaded = await loadAnchor(db, seedId)
  if (!loaded) return null

  const popularity = (loaded.row.v3?.popularity ?? 'unknown') as Popularity
  const dose = wantedAround(popularity)[thread.served - 1] ?? 'discovery'
  const wave = await composeWave(db, loaded.anchor, seedId, [])
  // Only the requested format, never an author the thread already showed.
  let pool = [...wave.items, ...wave.spares].filter(
    (candidate) => candidate.type === ticket.type &&
      !(candidate.v3.channelKey && thread.authors.has(candidate.v3.channelKey.toLowerCase())),
  )
  if (!pool.length) return null
  // Around a trend, the thread is the trend seen from elsewhere: the official
  // clip and the news report come last.
  if (thread.source === 'trend') {
    const official = (candidate: WaveCandidate) => candidate.v3.angle === 'official-clip' || candidate.v3.angle === 'mainstream-report'
    pool = [...pool.filter((c) => !official(c)), ...pool.filter(official)]
  }
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
  const type = ticket.type === 'image' ? 'image' : 'video'
  // The session's bag says what this start is for; the ticket count walks it.
  const asked = pickBagSource(state.seed, state.coolTickets, lastBagSource(state.recent))
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
    const drawn = await drawStart(db, { type, source: asked, random, now })
    if (!drawn) continue
    for (const row of drawn.rows as CatalogueRow[]) {
      const payload = decode(row)
      if (payload == null) continue
      const plain = candidateFromRow(row, payload, now)
      const candidate: Candidate<T> = { ...plain, seriesKey: threadKey(drawn.source, String(row._id)) }
      if (!hardEligible(candidate, ticket, state)) continue
      const popularity = ((row.v3 as { popularity?: Popularity } | undefined)?.popularity ?? 'unknown') as Popularity
      return {
        item: candidate, branch: drawn.source.startsWith('like') ? 'editorial' : 'autonomous', fallback: false,
        selection: { requestedLane: ticket.lane, servedLane: 'any', reasons: [] },
        cool: { seed: String(row._id), role: 'seed', source: drawn.source, asked, fallback: drawn.fallback, popularity, served: 1 },
      }
    }
  }
  return null
}

/**
 * What a cool visual ticket gets: the next member of the visitor's thread,
 * or the start of a new one. Null when the pool holds nothing eligible, and
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
