/**
 * A cool content: drawn live, at random, from the whole catalogue, for the
 * source the session's bag asked for.
 *
 * No stock, nothing computed ahead: a cool draw seeks a random point in the
 * index of a register, of a zone around a curation like, or of the trend
 * line. The population is everything in the catalogue that fits, enriched
 * by every day's ingestion. A source with nothing to give — a thin trend
 * line, a like with no zone — is served as a niche: a register that is not
 * gaming, so the cap on games holds even then; the answer says so. A niche
 * never falls back to the trend or the likes.
 */

import { type Db, type Document, type Filter } from 'mongodb'

import type { CoolSource, NicheSource } from './bag'
import { loadLikeZones, type LikeZone } from './likes'
import { EXCLUDED_ANGLES, EXCLUDED_UNIVERSES, isCoolCandidate, type LabelableRow } from './registers'
import type { CoolRegister } from '../types'

export type Rng = () => number
export type StartType = 'video' | 'image'
export type LikeZoneKind = 'like-subject' | 'like-channel' | 'like-genre'
/** What a start actually came from: a register, a zone around a like, or the trend. */
export type StartSource = CoolRegister | LikeZoneKind | 'trend'
export type Start = { rows: Document[]; source: StartSource; asked: CoolSource; niche?: NicheSource; fallback: boolean }

/** Rows read per draw: enough for the eligibility rules to refuse a few. */
const ROWS = 4
const CHANNEL_ROWS = 30
/** The trend line carries no register label, so more rows are read and sifted. */
const TREND_ROWS = 12
const QUERY_BUDGET_MS = 1_500
const REGISTER_INDEX = 'v3_register_type_rand'
const SUBJECT_INDEX = 'v3_subject_type_rand'
const UNIVERSE_INDEX = 'v3_universe_type_rand'
const LINE_INDEX = 'v3_line_type_rand'
/** Only content a visitor should be served; the labels settled the rest when they were written. */
const SERVABLE: Filter<Document> = { isSuppressed: { $ne: true }, obsoleteVideoStatus: { $ne: 'obsolete' } }

/** The register a niche means for a format: old school is the archives for a video, the archives or the vintage GIFs for an image. */
export function registerFor(source: NicheSource, type: StartType, random: Rng): CoolRegister {
  if (source === 'oldschool') return type === 'video' || random() < 0.5 ? 'archive' : 'cool-words'
  return source
}

/** When a source has nothing to give, a register that is not gaming takes its place. */
export function nicheFallback(type: StartType, random: Rng): CoolRegister {
  const registers: CoolRegister[] = type === 'video' ? ['archive', 'music', 'elsewhere'] : ['archive', 'music', 'elsewhere', 'cool-words']
  return registers[Math.floor(random() * registers.length)] ?? 'music'
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
async function seek(db: Db, filter: Filter<Document>, hint: string, random: Rng, excluded: Set<string>, limit = ROWS): Promise<Document[]> {
  const items = db.collection('items')
  const point = random() * 0.9
  const read = (range: Filter<Document>) =>
    items.find({ ...filter, ...range }, { sort: { rand: 1 }, limit, hint, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  let rows = await read({ rand: { $gte: point } })
  if (!rows.length) rows = await read({ rand: { $lt: point } })
  return rows.filter((row) => !excluded.has(String(row._id)))
}

function drawRegister(db: Db, register: CoolRegister, type: StartType, random: Rng, excluded: Set<string>): Promise<Document[]> {
  return seek(db, { 'v3.registers': register, type, ...SERVABLE }, REGISTER_INDEX, random, excluded)
}

async function drawLike(db: Db, zones: LikeZone[], type: StartType, random: Rng, excluded: Set<string>): Promise<{ rows: Document[]; kind: LikeZoneKind } | null> {
  const zone = zones[Math.floor(random() * zones.length)]
  const kind = pickZone(zone, random)
  if (!kind) return null
  if (kind === 'like-subject') {
    const rows = await seek(db, { 'v3.subjects.id': { $in: zone.subjectIds }, type, 'v3.usable': true, ...SERVABLE }, SUBJECT_INDEX, random, excluded)
    return rows.length ? { rows, kind } : null
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
    return usable.length ? { rows: usable.slice(0, ROWS), kind } : null
  }
  const rows = await seek(
    db,
    { 'v3.universe': zone.universe, 'v3.angle': zone.angle, 'v3.era': zone.era, type, 'v3.usable': true, ...SERVABLE },
    UNIVERSE_INDEX, random, excluded,
  )
  return rows.length ? { rows, kind } : null
}

/**
 * The trend: what the trending line brought in, with the same refusals as
 * the registers — never news, never a mainstream report, never hashtag spam.
 * Thin until the trend-subjects line exists; the fallback covers the rest.
 */
async function drawTrend(db: Db, type: StartType, random: Rng, excluded: Set<string>): Promise<Document[]> {
  const rows = await seek(db, { 'v3.line': 'trend', type, ...SERVABLE }, LINE_INDEX, random, excluded, TREND_ROWS)
  return rows.filter((row) => isCoolCandidate(row as LabelableRow)).slice(0, ROWS)
}

export async function drawStart(
  db: Db,
  options: { type: StartType; source: CoolSource; niche?: NicheSource; excludeIds?: Iterable<string>; random?: Rng; now?: number },
): Promise<Start | null> {
  const random = options.random ?? Math.random
  const zones = await loadLikeZones(db, options.now).catch(() => [] as LikeZone[])
  // A like is never shown, whichever source the draw came from.
  const excluded = new Set([...(options.excludeIds ?? []), ...zones.map((zone) => zone.id)])
  const { type, source } = options

  if (source === 'like') {
    const drawn = zones.length ? await drawLike(db, zones, type, random, excluded) : null
    if (drawn) return { rows: drawn.rows, source: drawn.kind, asked: source, fallback: false }
  } else if (source === 'trend') {
    const rows = await drawTrend(db, type, random, excluded)
    if (rows.length) return { rows, source: 'trend', asked: source, fallback: false }
  } else {
    // A niche ticket names its register; without one, any register but gaming.
    const niche = options.niche
    const register = niche ? registerFor(niche, type, random) : nicheFallback(type, random)
    const rows = await drawRegister(db, register, type, random, excluded)
    if (rows.length) return { rows, source: register, asked: source, ...(niche ? { niche } : {}), fallback: false }
  }

  const register = nicheFallback(type, random)
  const rows = await drawRegister(db, register, type, random, excluded)
  return rows.length ? { rows, source: register, asked: source, ...(options.niche ? { niche: options.niche } : {}), fallback: true } : null
}
