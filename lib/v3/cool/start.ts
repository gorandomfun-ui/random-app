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
import { isCleanTitle, isLatinTitle } from './clean'
import { loadLikeZones, type LikeZone } from './likes'
import { EXCLUDED_ANGLES, EXCLUDED_UNIVERSES, isCoolCandidate, type LabelableRow } from './registers'
import type { CoolRegister, Popularity } from '../types'

export type Rng = () => number
export type StartType = 'video' | 'image'
export type LikeZoneKind = 'like-subject' | 'like-channel' | 'like-genre'
/** What a start actually came from: a register, a zone around a like, the trend, or the recent. */
export type StartSource = CoolRegister | LikeZoneKind | 'trend' | 'recent'
export type Start = { rows: Document[]; source: StartSource; asked: CoolSource; niche?: NicheSource; fallback: boolean }

/** Rows read per draw: enough for the eligibility rules to refuse a few. */
const ROWS = 4
const CHANNEL_ROWS = 30
/** The trend line carries no register label, so more rows are read and sifted. */
const TREND_ROWS = 12
/** The recent source sifts for this year's contents with an audience and a clean Latin title: more rows still. */
const RECENT_ROWS = 24
/** "Modern": published within this many months. */
const MODERN_MONTHS = 24
const ERA_INDEX = 'v3_era_type_rand'
/** A genre is universe + angle + era, and the index names the universe only: this many rows are read from the point and sifted, no more. */
const GENRE_SCAN = 100
const QUERY_BUDGET_MS = 1_500
const REGISTER_INDEX = 'v3_register_type_rand'
const SUBJECT_INDEX = 'v3_subject_type_rand'
const UNIVERSE_INDEX = 'v3_universe_type_rand'
const LINE_INDEX = 'v3_line_type_rand'
/** Only content a visitor should be served; the labels settled the rest when they were written. */
export const SERVABLE: Filter<Document> = { isSuppressed: { $ne: true }, obsoleteVideoStatus: { $ne: 'obsolete' } }

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

/**
 * A random point in an index, then at most `scan` rows read from it and
 * sifted in memory. For a zone the index does not name in full, the cost
 * stays bounded: a rare combination falls back rather than walking a whole
 * universe until the query budget runs out.
 */
async function seekAmong(
  db: Db, filter: Filter<Document>, hint: string, random: Rng, excluded: Set<string>, scan: number, keep: (row: Document) => boolean,
): Promise<Document[]> {
  const items = db.collection('items')
  const point = random() * 0.9
  const read = (range: Filter<Document>) =>
    items.find({ ...filter, ...range }, { sort: { rand: 1 }, limit: scan, hint, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  let rows = await read({ rand: { $gte: point } })
  if (!rows.length) rows = await read({ rand: { $lt: point } })
  return rows.filter((row) => !excluded.has(String(row._id)) && keep(row)).slice(0, ROWS)
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
    // From a random point in the author's videos, not always the same thirty: a liked channel used to
    // serve the same handful in every session.
    const filter = { 'v3.channelKey': zone.channelKey, type, ...SERVABLE }
    const total = await db.collection('items').countDocuments(filter, { maxTimeMS: QUERY_BUDGET_MS }).catch(() => 0)
    const skip = total > CHANNEL_ROWS ? Math.floor(random() * (total - CHANNEL_ROWS + 1)) : 0
    const rows = await db
      .collection('items')
      .find(filter, { skip, limit: CHANNEL_ROWS, maxTimeMS: QUERY_BUDGET_MS })
      .toArray()
    const usable = rows.filter((row) => !excluded.has(String(row._id)))
    for (let index = usable.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1))
      ;[usable[index], usable[other]] = [usable[other], usable[index]]
    }
    return usable.length ? { rows: usable.slice(0, ROWS), kind } : null
  }
  // The universe is in the index; the angle and the era are sifted from a bounded batch.
  const rows = await seekAmong(
    db, { 'v3.universe': zone.universe, type, ...SERVABLE }, UNIVERSE_INDEX, random, excluded, GENRE_SCAN,
    (row) => {
      const v3 = row.v3 as { angle?: string; era?: string; usable?: boolean } | undefined
      return v3?.angle === zone.angle && v3?.era === zone.era && v3?.usable === true
    },
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
  return rows.filter((row) => isCoolCandidate(row as LabelableRow) && isCleanTitle(row.title as string)).slice(0, ROWS)
}

const publishedDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value
  if (typeof value === 'string' && value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date }
  return null
}

/**
 * The recent: what this year brought that has an audience — a video known or
 * mainstream, an image of the recent era — with a clean title in Latin
 * letters. The era index says "recent" over ten years; the sift keeps the
 * last two, which is what "modern" means to a visitor.
 */
async function drawRecent(db: Db, type: StartType, random: Rng, excluded: Set<string>, now: number): Promise<Document[]> {
  const since = now - MODERN_MONTHS * 30 * 86_400_000
  const filter: Filter<Document> = { 'v3.era': 'recent', type, 'v3.usable': true, ...SERVABLE }
  const rows = await seek(db, filter, ERA_INDEX, random, excluded, RECENT_ROWS)
  return rows.filter((row) => {
    if (!isCoolCandidate(row as LabelableRow) || !isCleanTitle(row.title as string) || !isLatinTitle(row.title as string)) return false
    const published = publishedDate(row.publishedAt)
    if (!published || published.getTime() < since) return false
    if (type === 'video') {
      const popularity = (row.v3 as { popularity?: Popularity } | undefined)?.popularity
      return popularity === 'known' || popularity === 'mainstream'
    }
    return true
  }).slice(0, ROWS)
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
  } else if (source === 'trend' || source === 'recent') {
    if (source === 'trend') {
      const rows = await drawTrend(db, type, random, excluded)
      if (rows.length) return { rows, source: 'trend', asked: source, fallback: false }
    }
    // A thin trend — every image ticket today — falls back to the recent before any niche: modern first, the archives after.
    const recent = await drawRecent(db, type, random, excluded, options.now ?? Date.now())
    if (recent.length) return { rows: recent, source: 'recent', asked: source, fallback: source !== 'recent' }
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
