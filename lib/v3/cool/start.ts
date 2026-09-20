/**
 * Where a thread starts: a content drawn live, at random, from the whole
 * catalogue.
 *
 * No stock, nothing computed ahead: a cool draw picks a source — one of the
 * registers, or a zone around a like — and seeks a random point in its index.
 * The population is everything in the catalogue that fits, enriched by every
 * day's ingestion; a visitor on another device has the same odds of the same
 * content as in the plain random, which is to say almost none.
 */

import { type Db, type Document, type Filter } from 'mongodb'

import { loadLikeZones, type LikeZone } from './likes'
import { EXCLUDED_ANGLES, EXCLUDED_UNIVERSES } from './registers'
import type { CoolRegister } from '../types'

export type Rng = () => number
export type StartType = 'video' | 'image'
export type LikeZoneKind = 'like-subject' | 'like-channel' | 'like-genre'
export type StartSource = CoolRegister | LikeZoneKind

const VIDEO_REGISTERS: CoolRegister[] = ['gaming', 'archive', 'music', 'elsewhere']
const IMAGE_REGISTERS: CoolRegister[] = ['gaming', 'archive', 'music', 'elsewhere', 'cool-words']
/** Rows read per draw: enough for the eligibility rules to refuse a few. */
const ROWS = 4
const CHANNEL_ROWS = 30
const QUERY_BUDGET_MS = 1_500
const REGISTER_INDEX = 'v3_register_type_rand'
const SUBJECT_INDEX = 'v3_subject_type_rand'
const UNIVERSE_INDEX = 'v3_universe_type_rand'
/** Only content a visitor should be served; the labels settled the rest when they were written. */
const SERVABLE: Filter<Document> = { isSuppressed: { $ne: true }, obsoleteVideoStatus: { $ne: 'obsolete' } }

/** The registers and the likes weigh the same: one source in five for a video, one in six for an image. */
export function pickSource(type: StartType, likes: boolean, random: Rng): CoolRegister | 'like' {
  const sources: Array<CoolRegister | 'like'> = [...(type === 'video' ? VIDEO_REGISTERS : IMAGE_REGISTERS), ...(likes ? ['like' as const] : [])]
  return sources[Math.floor(random() * sources.length)] ?? sources[0]
}

/** A genre is a zone only when it says something: "live concert, retro" does, "other, recent" is the whole catalogue. */
export function hasGenre(zone: LikeZone): boolean {
  return zone.angle !== 'other' && !EXCLUDED_UNIVERSES.includes(zone.universe) && !EXCLUDED_ANGLES.includes(zone.angle)
}

/** Which zone of a like to draw in: its named subject, its author, or its genre — whichever it has. */
export function pickZone(zone: LikeZone, random: Rng): LikeZoneKind | null {
  const kinds: LikeZoneKind[] = [
    ...(zone.subjectIds.length ? ['like-subject' as const] : []),
    ...(zone.channelKey ? ['like-channel' as const] : []),
    ...(hasGenre(zone) ? ['like-genre' as const] : []),
  ]
  return kinds[Math.floor(random() * kinds.length)] ?? null
}

/** A random point in an index, wrapping round at the end: the whole population, whatever the point. */
async function seek(db: Db, filter: Filter<Document>, hint: string, random: Rng, excluded: Set<string>): Promise<Document[]> {
  const items = db.collection('items')
  const point = random() * 0.9
  const read = (range: Filter<Document>) =>
    items.find({ ...filter, ...range }, { sort: { rand: 1 }, limit: ROWS, hint, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  let rows = await read({ rand: { $gte: point } })
  if (!rows.length) rows = await read({ rand: { $lt: point } })
  return rows.filter((row) => !excluded.has(String(row._id)))
}

export type Start = { rows: Document[]; source: StartSource }

export async function drawStart(
  db: Db,
  options: { type: StartType; excludeIds?: Iterable<string>; random?: Rng; now?: number },
): Promise<Start | null> {
  const random = options.random ?? Math.random
  const zones = await loadLikeZones(db, options.now).catch(() => [] as LikeZone[])
  // A like is never shown, whichever source the draw came from.
  const excluded = new Set([...(options.excludeIds ?? []), ...zones.map((zone) => zone.id)])
  const type = options.type

  const source = pickSource(type, zones.length > 0, random)
  if (source !== 'like') {
    const rows = await seek(db, { 'v3.registers': source, type, ...SERVABLE }, REGISTER_INDEX, random, excluded)
    return rows.length ? { rows, source } : null
  }

  const zone = zones[Math.floor(random() * zones.length)]
  const kind = pickZone(zone, random)
  if (!kind) return null
  if (kind === 'like-subject') {
    const rows = await seek(db, { 'v3.subjects.id': { $in: zone.subjectIds }, type, 'v3.usable': true, ...SERVABLE }, SUBJECT_INDEX, random, excluded)
    return rows.length ? { rows, source: kind } : null
  }
  if (kind === 'like-channel') {
    const rows = await db
      .collection('items')
      .find({ 'v3.channelKey': zone.channelKey, type, ...SERVABLE }, { limit: CHANNEL_ROWS, maxTimeMS: QUERY_BUDGET_MS })
      .toArray()
    const usable = rows.filter((row) => !excluded.has(String(row._id)))
    for (let index = usable.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1))
      ;[usable[index], usable[other]] = [usable[other], usable[index]]
    }
    return usable.length ? { rows: usable.slice(0, ROWS), source: kind } : null
  }
  const rows = await seek(
    db,
    { 'v3.universe': zone.universe, 'v3.angle': zone.angle, 'v3.era': zone.era, type, 'v3.usable': true, ...SERVABLE },
    UNIVERSE_INDEX, random, excluded,
  )
  return rows.length ? { rows, source: kind } : null
}
