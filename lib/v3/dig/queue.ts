/**
 * The queue of subjects the dig works through.
 *
 * One collection for the four bases and what the dig meets on its way. A
 * subject is a name (Will Smith, Sarkodie, a film) or a theme (ventriloquists,
 * 1994 TV ads): it knows its base, its fame, how deep to go, and which passes
 * it has had. The line takes subjects base after base, as the tickets say,
 * and gives each its next pass.
 */

import type { Db, Document } from 'mongodb'

import { DIG_BASES, type DigBase, type DigPass, type Universe } from '../types'

export const QUEUE = 'dig_subjects_v4'

export type Fame = 'star' | 'known' | 'small'
export type SubjectKind = 'entity' | 'topic' | 'channel'
export type QueueState = 'queued' | 'running' | 'done' | 'exhausted' | 'paused'

export type PassRecord = { at: Date; read: number; kept: number; inserted: number; searches: number; label?: string }

export type QueuedSubject = {
  _id: string
  label: string
  aliases: string[]
  kind: SubjectKind
  base: DigBase
  country?: string
  lang?: string
  fame: Fame
  universe?: Universe
  /** The subject's own YouTube channels: five videos allowed instead of two. */
  ownChannels?: string[]
  /** For a theme: the angle words not yet combined with it. */
  angles?: string[]
  /** The angle combinations already searched. */
  done?: string[]
  state: QueueState
  priority: number
  passes: Partial<Record<DigPass, PassRecord[]>>
  /** Channels met in the top and around passes, with how many of their videos named the subject. */
  channelsToRead: Array<{ id: string; title: string; hits: number; read?: boolean }>
  ingested: number
  searches: number
  depthTarget: number
  lastRunAt?: Date
  createdAt: Date
  source?: Record<string, unknown>
}

/** How deep each fame goes: pages of the top, searches around, channels read, Dailymotion searches. */
export const PLAN: Record<Fame, { topPages: number; around: number; channels: number; dailymotion: number; depthTarget: number }> = {
  star: { topPages: 2, around: 5, channels: 8, dailymotion: 2, depthTarget: 600 },
  known: { topPages: 1, around: 2, channels: 3, dailymotion: 1, depthTarget: 150 },
  small: { topPages: 1, around: 1, channels: 1, dailymotion: 1, depthTarget: 50 },
}

export const PASS_ORDER: DigPass[] = ['top', 'around', 'channel', 'dailymotion']

/**
 * The tickets of a run, from `RANDOM_DIG_BASES` — "people:4,likes:2,keywords:2,trends:2" —
 * else the default. Snowball subjects are served when a base has nothing.
 */
export const DEFAULT_TICKETS: DigBase[] = ['people', 'people', 'people', 'people', 'likes', 'likes', 'keywords', 'keywords', 'trends', 'trends']

export function baseTickets(setting: string | undefined = process.env.RANDOM_DIG_BASES): DigBase[] {
  if (!setting?.trim()) return DEFAULT_TICKETS
  const tickets: DigBase[] = []
  for (const token of setting.split(',')) {
    const [name, countRaw] = token.split(':').map((part) => part.trim().toLowerCase())
    const count = countRaw === undefined ? 1 : Number(countRaw)
    if (!(DIG_BASES as readonly string[]).includes(name) || !Number.isInteger(count) || count < 0 || count > 20) return DEFAULT_TICKETS
    for (let index = 0; index < count; index += 1) tickets.push(name as DigBase)
  }
  return tickets.length ? tickets : DEFAULT_TICKETS
}

/** The tickets in turns, so a run that stops early has still served every base: people, likes, keywords, trends, people… */
export function ticketOrder(tickets: DigBase[]): DigBase[] {
  const remaining = new Map<DigBase, number>()
  for (const base of tickets) remaining.set(base, (remaining.get(base) ?? 0) + 1)
  const order: DigBase[] = []
  while (order.length < tickets.length) {
    for (const [base, count] of remaining) {
      if (count <= 0) continue
      order.push(base)
      remaining.set(base, count - 1)
    }
  }
  return order
}

function passesDone(subject: QueuedSubject, pass: DigPass): number {
  return (subject.passes[pass] ?? []).length
}

/**
 * The next pass a subject needs, or null when it is done. A name goes top,
 * around (as many searches as its fame allows, one per call), its channels,
 * then Dailymotion. A theme goes top once, then one angle combination per
 * call until its angles run out.
 */
export function nextPass(subject: QueuedSubject): DigPass | null {
  const plan = PLAN[subject.fame]
  if (subject.kind === 'topic') {
    if (!passesDone(subject, 'top')) return 'top'
    // A theme is a hundred subjects: one angle combination per call, until its angles run out.
    const left = (subject.angles ?? []).filter((angle) => !(subject.done ?? []).includes(angle))
    if (left.length) return 'around'
    if (passesDone(subject, 'dailymotion') < plan.dailymotion) return 'dailymotion'
    return null
  }
  if (subject.kind === 'channel') return passesDone(subject, 'channel') ? null : 'channel'
  if (passesDone(subject, 'top') < 1) return 'top'
  if (passesDone(subject, 'around') < plan.around) return 'around'
  if (passesDone(subject, 'channel') < 1 && subject.channelsToRead.some((channel) => !channel.read)) return 'channel'
  if (passesDone(subject, 'dailymotion') < plan.dailymotion) return 'dailymotion'
  return null
}

/** Ready to be worked: queued or running, not paused, not done. */
const WORKABLE: QueueState[] = ['queued', 'running']

/** One subject of a base, the most urgent and the least recently served; of one country when the turn names it. */
export async function takeSubject(db: Db, base: DigBase, exclude: Set<string>, country?: string): Promise<QueuedSubject | null> {
  const rows = await db.collection<QueuedSubject>(QUEUE)
    .find({ base, state: { $in: WORKABLE }, ...(country ? { country } : {}), ...(exclude.size ? { _id: { $nin: [...exclude] } } : {}) } as Document, { sort: { priority: -1, lastRunAt: 1 }, limit: 5, maxTimeMS: 4000 })
    .toArray()
  for (const row of rows) {
    if (nextPass(row)) return row
    await db.collection<QueuedSubject>(QUEUE).updateOne({ _id: row._id }, { $set: { state: 'done' } }).catch(() => undefined)
  }
  return null
}

export async function recordPass(db: Db, id: string, pass: DigPass, record: PassRecord, extra: Document = {}): Promise<void> {
  await db.collection<QueuedSubject>(QUEUE).updateOne({ _id: id }, {
    $push: { [`passes.${pass}`]: record } as Document,
    $inc: { ingested: record.inserted, searches: record.searches },
    $set: { lastRunAt: record.at, state: 'running', ...extra },
  } as Document)
}

export async function markDone(db: Db, id: string, state: QueueState = 'done'): Promise<void> {
  await db.collection<QueuedSubject>(QUEUE).updateOne({ _id: id }, { $set: { state } })
}

/** Channels met during a pass, kept on the subject for its channel pass: the most productive first. */
export async function rememberChannels(db: Db, id: string, channels: Array<{ id: string; title: string; hits: number }>): Promise<void> {
  if (!channels.length) return
  const row = await db.collection<QueuedSubject>(QUEUE).findOne({ _id: id }, { projection: { channelsToRead: 1 } })
  const merged = new Map<string, { id: string; title: string; hits: number; read?: boolean }>()
  for (const channel of row?.channelsToRead ?? []) merged.set(channel.id, channel)
  for (const channel of channels) {
    const known = merged.get(channel.id)
    merged.set(channel.id, known ? { ...known, hits: known.hits + channel.hits } : channel)
  }
  const list = [...merged.values()].sort((left, right) => right.hits - left.hits).slice(0, 30)
  await db.collection<QueuedSubject>(QUEUE).updateOne({ _id: id }, { $set: { channelsToRead: list } })
}

export type NewSubject = Pick<QueuedSubject, '_id' | 'label' | 'aliases' | 'kind' | 'base' | 'fame'> & Partial<QueuedSubject>

/** Queues subjects; one already known keeps its state and passes, only its label, aliases and priority are refreshed. */
export async function enqueue(db: Db, subjects: NewSubject[]): Promise<{ inserted: number; refreshed: number }> {
  if (!subjects.length) return { inserted: 0, refreshed: 0 }
  const now = new Date()
  const result = await db.collection<QueuedSubject>(QUEUE).bulkWrite(subjects.map((subject) => ({
    updateOne: {
      filter: { _id: subject._id },
      update: {
        $setOnInsert: {
          kind: subject.kind, base: subject.base, fame: subject.fame, state: 'queued', passes: {}, channelsToRead: [], ingested: 0, searches: 0,
          depthTarget: subject.depthTarget ?? PLAN[subject.fame].depthTarget, createdAt: now, done: [],
          ...(subject.country ? { country: subject.country } : {}), ...(subject.lang ? { lang: subject.lang } : {}), ...(subject.universe ? { universe: subject.universe } : {}),
          ...(subject.ownChannels ? { ownChannels: subject.ownChannels } : {}), ...(subject.angles ? { angles: subject.angles } : {}), ...(subject.source ? { source: subject.source } : {}),
        },
        $set: { label: subject.label, priority: subject.priority ?? 0 },
        $addToSet: { aliases: { $each: subject.aliases } },
      } as Document,
      upsert: true,
    },
  })), { ordered: false })
  return { inserted: result.upsertedCount, refreshed: result.modifiedCount }
}

/**
 * The countries of the people queue, in the order the tickets take them: the
 * world in turns — one of each region before a second of any (the owner, 29
 * September: "un élément de chaque hémisphère ou continent par jour au moins").
 * Within a region, the country served the longest ago first.
 */
export async function countryTurns(db: Db, regionOf: Record<string, string>): Promise<string[]> {
  const rows = await db.collection<QueuedSubject>(QUEUE).aggregate<{ _id: string; last: Date | null }>([
    { $match: { base: 'people', state: { $in: WORKABLE }, country: { $exists: true } } },
    { $group: { _id: '$country', last: { $max: '$lastRunAt' } } },
  ], { maxTimeMS: 8000 }).toArray()
  const byRegion = new Map<string, Array<{ country: string; last: number }>>()
  for (const row of rows) {
    const region = regionOf[row._id] ?? 'elsewhere'
    byRegion.set(region, [...(byRegion.get(region) ?? []), { country: row._id, last: row.last ? new Date(row.last).getTime() : 0 }])
  }
  const queues = [...byRegion.values()].map((list) => list.sort((left, right) => left.last - right.last))
  queues.sort((left, right) => left[0].last - right[0].last)
  const turns: string[] = []
  let left = true
  while (left) {
    left = false
    for (const queue of queues) {
      const next = queue.shift()
      if (next) { turns.push(next.country); left = true }
    }
  }
  return turns
}

/** The indexes the queue is read by; created when absent. */
export async function installQueueIndexes(db: Db): Promise<void> {
  await db.collection(QUEUE).createIndex({ base: 1, state: 1, priority: -1, lastRunAt: 1 }, { name: 'queue_pick' })
  await db.collection(QUEUE).createIndex({ base: 1, country: 1, state: 1, priority: -1, lastRunAt: 1 }, { name: 'queue_pick_country' })
}
