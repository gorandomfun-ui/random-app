/**
 * The draw over the dig: three bags and a video (the owner, 29 September).
 *
 * After the day's fresh videos, each video draw takes a base from one bag
 * (people, likes, keywords, trends, or the pure random of the old stock),
 * a level from another (a cool draw leans to the mainstream, a random draw
 * to the confidential), then a subject of that base the session has not
 * seen, and one of its videos at that level. The session's rules stay: not
 * the same content, not the same story, and the rhythm is untouched. Behind
 * `RANDOM_DIG_DRAW=1`, or the admin's `digDraw: true` for a rehearsal; when
 * nothing fits, the older paths answer.
 */

import type { Db, Document } from 'mongodb'

import { candidateFromRow, type CatalogueRow } from './catalog'
import { echoesSession } from './diversity'
import { hardEligible, type Intent, type PoolResult, type Session } from './pool'
import { bagValue, hash, type Rng } from './random'
import { QUEUE, type QueuedSubject } from '../v3/dig/queue'
import { DIG_BASES, type DigBase, type DigLevel, type DigPass } from '../v3/types'

export type DrawBase = DigBase | 'random'
export const DEFAULT_BASE_BAG: DrawBase[] = ['people', 'people', 'people', 'likes', 'likes', 'keywords', 'keywords', 'trends', 'trends', 'random']
export const DEFAULT_LEVELS_COOL: DigLevel[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 4]
export const DEFAULT_LEVELS_RANDOM: DigLevel[] = [1, 2, 2, 3, 3, 3, 3, 4, 4, 4]
/** Subjects tried for one draw, and rows read per subject and level. */
const SUBJECTS_PER_DRAW = 4
const ROWS_PER_SEEK = 8
const QUERY_BUDGET_MS = 1500

export const digDrawSwitchedOn = (): boolean => process.env.RANDOM_DIG_DRAW === '1'

/** "people:3,likes:2,keywords:2,trends:2,random:1" — a setting that names anything unknown is ignored. */
export function baseBag(setting: string | undefined = process.env.RANDOM_DIG_DRAW_BASES): DrawBase[] {
  if (!setting?.trim()) return DEFAULT_BASE_BAG
  const bag: DrawBase[] = []
  for (const token of setting.split(',')) {
    const [name, countRaw] = token.split(':').map((part) => part.trim().toLowerCase())
    const count = countRaw === undefined ? 1 : Number(countRaw)
    if (!(name === 'random' || (DIG_BASES as readonly string[]).includes(name)) || !Number.isInteger(count) || count < 0 || count > 20) return DEFAULT_BASE_BAG
    for (let index = 0; index < count; index += 1) bag.push(name as DrawBase)
  }
  return bag.length ? bag : DEFAULT_BASE_BAG
}

/** "1:3,2:4,3:2,4:1" — the levels of a bag; anything else keeps the default. */
export function levelBag(setting: string | undefined, fallback: DigLevel[]): DigLevel[] {
  if (!setting?.trim()) return fallback
  const bag: DigLevel[] = []
  for (const token of setting.split(',')) {
    const [levelRaw, countRaw] = token.split(':').map((part) => part.trim())
    const level = Number(levelRaw), count = countRaw === undefined ? 1 : Number(countRaw)
    if (![1, 2, 3, 4].includes(level) || !Number.isInteger(count) || count < 0 || count > 20) return fallback
    for (let index = 0; index < count; index += 1) bag.push(level as DigLevel)
  }
  return bag.length ? bag : fallback
}

/** The level asked, then its neighbours, then any: a subject thin at one level still answers. */
export function levelsAround(level: DigLevel): Array<DigLevel | null> {
  const others = ([1, 2, 3, 4] as DigLevel[]).filter((candidate) => candidate !== level).sort((left, right) => Math.abs(left - level) - Math.abs(right - level))
  return [level, ...others, null]
}

export type DigChoice = { subjectId: string; label: string; base: DrawBase; level: DigLevel | null; pass?: DigPass; asked: { base: DrawBase; level: DigLevel } }
export type DigResult<T> = PoolResult<T> & { dig: DigChoice }
type Decoder<T> = (row: CatalogueRow) => T | null

/** Subjects of a base with something to show, from a random point of their keys, the session's own left out. */
async function pickSubjects(db: Db, base: DigBase, random: Rng, seen: Set<number>): Promise<QueuedSubject[]> {
  const queue = db.collection<QueuedSubject>(QUEUE)
  const point = random()
  const read = async (filter: Document) => queue.find({ base, ingested: { $gt: 0 }, ...filter } as Document, { sort: { rand: 1 }, limit: SUBJECTS_PER_DRAW * 2, projection: { label: 1, base: 1 }, hint: 'queue_draw', maxTimeMS: QUERY_BUDGET_MS }).toArray()
  let rows = await read({ rand: { $gte: point } })
  if (rows.length < SUBJECTS_PER_DRAW) rows = [...rows, ...await read({ rand: { $lt: point } })]
  return rows.filter((row) => !seen.has(hash(String(row._id)))).slice(0, SUBJECTS_PER_DRAW)
}

/** A few videos of a subject at a level, from a random point; the level left out reads any of its videos. */
async function seekRows(db: Db, subjectId: string, level: DigLevel | null, random: Rng): Promise<CatalogueRow[]> {
  const items = db.collection('items')
  const point = random()
  const filter: Document = { 'v3.subjects.id': subjectId, type: 'video', ...(level ? { 'v3.dig.level': level } : {}) }
  const read = async (range: Document) => items.find({ ...filter, rand: range } as Document, { sort: { rand: 1 }, limit: ROWS_PER_SEEK, hint: 'v3_subject_type_rand', maxTimeMS: QUERY_BUDGET_MS }).toArray()
  let rows = await read({ $gte: point })
  if (rows.length < 3) rows = [...rows, ...await read({ $lt: point })]
  return rows as CatalogueRow[]
}

/**
 * What a video draw gets from the dig: null when the bag says pure random,
 * when the dig has nothing for this base, or when nothing passes the
 * session's rules — the older paths then answer.
 */
export async function selectDig<T>(db: Db, ticket: Intent, state: Session, decode: Decoder<T>, random: Rng, now: number): Promise<DigResult<T> | null> {
  if (ticket.type !== 'video') return null
  const index = state.visuals
  const base = bagValue(state.seed, 'dig-base', index, baseBag())
  if (base === 'random') return null
  const cool = ticket.mode === 'cool'
  const level = bagValue(state.seed, cool ? 'dig-level-cool' : 'dig-level-random', index, cool ? levelBag(process.env.RANDOM_DIG_DRAW_LEVELS_COOL, DEFAULT_LEVELS_COOL) : levelBag(process.env.RANDOM_DIG_DRAW_LEVELS_RANDOM, DEFAULT_LEVELS_RANDOM))
  const seen = new Set((state.exposures ?? []).slice(-60).flatMap((exposure) => (exposure.subject != null ? [exposure.subject] : [])))
  const subjects = await pickSubjects(db, base, random, seen)
  for (const subject of subjects) {
    for (const tryLevel of levelsAround(level)) {
      const rows = await seekRows(db, String(subject._id), tryLevel, random)
      for (const row of [...rows].sort(() => random() - 0.5)) {
        const payload = decode(row)
        if (payload == null) continue
        const candidate = candidateFromRow(row, payload, now)
        if (!hardEligible(candidate, ticket, state) || echoesSession(candidate, state.exposures)) continue
        const dig = (row.v3 as { dig?: { pass?: DigPass } } | undefined)?.dig
        return {
          item: candidate, branch: base === 'likes' ? 'editorial' : 'autonomous', fallback: tryLevel !== level,
          selection: { requestedLane: ticket.lane, servedLane: 'any', reasons: ['dig'] },
          dig: { subjectId: String(subject._id), label: String(subject.label), base, level: tryLevel, ...(dig?.pass ? { pass: dig.pass } : {}), asked: { base, level } },
        }
      }
    }
  }
  return null
}
