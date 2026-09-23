/**
 * A cool content: drawn live, at random, from the whole catalogue, for the
 * source the session's bag asked for.
 *
 * No stock, nothing computed ahead: a cool draw seeks a random point in the
 * index of a register, of a zone of the like pool, or of the trend line. The population is everything in the catalogue that fits, enriched
 * by every day's ingestion. A source with nothing to give — a thin trend
 * line, a like with no zone — is served as a niche: a register that is not
 * gaming, so the cap on games holds even then; the answer says so. A niche
 * never falls back to the trend or the likes.
 */

import { ObjectId, type Db, type Document, type Filter } from 'mongodb'

import type { CoolSource, NicheSource } from './bag'
import { isCleanTitle, isLatinTitle } from './clean'
import { LIKE_ITSELF, loadLikePool, pickZone, type LikePool } from './likePool'
import { isCoolCandidate, type LabelableRow } from './registers'
import { SERVABLE } from './servable'
import type { CoolRegister, Popularity } from '../types'

export { SERVABLE } from './servable'

export type Rng = () => number
export type StartType = 'video' | 'image'
/** A content of the subject a like names, of its author, or — once in a thousand — the like itself. */
export type LikeZoneKind = 'like-subject' | 'like-channel' | 'like'
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
/** A GIF carries no date; one brought in within this many months is what today's feeds serve. */
const RECENT_IMAGE_MONTHS = 12
/** Registers of the old: never what the recent source means. */
const OLD_REGISTERS: CoolRegister[] = ['archive', 'cool-words']
const ERA_INDEX = 'v3_era_type_rand'
const QUERY_BUDGET_MS = 1_500
const REGISTER_INDEX = 'v3_register_type_rand'
const SUBJECT_INDEX = 'v3_subject_type_rand'
const LINE_INDEX = 'v3_line_type_rand'

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

/** The rows in a random order: the one served is any of them, not always the first past the point. */
function shuffle(rows: Document[], random: Rng): Document[] {
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[rows[index], rows[other]] = [rows[other], rows[index]]
  }
  return rows
}

/**
 * A random point in an index, then `limit` rows read from it, round the end
 * and on from the start when the point is near the end, shuffled.
 *
 * Reading from a point and serving the first row favoured whatever sat
 * after the widest gaps in `rand`: on the trend line, a few videos came out
 * seven times their share and a tenth never did, the point stopping short
 * of the end. Every row in the window now has the same chance, and the
 * window goes round.
 */
async function seek(db: Db, filter: Filter<Document>, hint: string, random: Rng, excluded: Set<string>, limit = ROWS): Promise<Document[]> {
  const items = db.collection('items')
  const point = random()
  const read = (range: Filter<Document>, take: number) =>
    items.find({ ...filter, ...range }, { sort: { rand: 1 }, limit: take, hint, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  const rows = await read({ rand: { $gte: point } }, limit)
  if (rows.length < limit) rows.push(...(await read({ rand: { $lt: point } }, limit - rows.length)))
  return shuffle(rows.filter((row) => !excluded.has(String(row._id))), random)
}

function drawRegister(db: Db, register: CoolRegister, type: StartType, random: Rng, excluded: Set<string>): Promise<Document[]> {
  return seek(db, { 'v3.registers': register, type, ...SERVABLE }, REGISTER_INDEX, random, excluded)
}

/**
 * A like ticket: a zone of the like pool, weighted by what it holds (capped),
 * then a content of the zone at random — the subject a like names, or the
 * videos of its author from a random point. Once in a thousand, the like
 * itself. Null when the pool holds nothing for this format: a niche then.
 */
async function drawLike(db: Db, pool: LikePool, type: StartType, random: Rng, excluded: Set<string>): Promise<{ rows: Document[]; kind: LikeZoneKind } | null> {
  const items = db.collection('items')
  if (pool.likeIds.length && random() < LIKE_ITSELF) {
    const id = pool.likeIds[Math.floor(random() * pool.likeIds.length)]
    const row = ObjectId.isValid(id) ? await items.findOne({ _id: new ObjectId(id), type, ...SERVABLE }, { maxTimeMS: QUERY_BUDGET_MS }) : null
    if (row) return { rows: [row], kind: 'like' }
  }
  const zone = pickZone(pool.zones, type, random)
  if (!zone) return null
  if (zone.kind === 'subject') {
    const rows = await seek(db, { 'v3.subjects.id': zone.key, type, 'v3.usable': true, ...SERVABLE }, SUBJECT_INDEX, random, excluded)
    return rows.length ? { rows, kind: 'like-subject' } : null
  }
  // The author's videos from a random point; the zone's count, the likes added back, says how far the point may go.
  const filter = { 'v3.channelKey': zone.key, type, ...SERVABLE }
  const total = zone.video + zone.likeIds.length
  const skip = total > CHANNEL_ROWS ? Math.floor(random() * (total - CHANNEL_ROWS + 1)) : 0
  const rows = await items.find(filter, { skip, limit: CHANNEL_ROWS, maxTimeMS: QUERY_BUDGET_MS }).toArray()
  const usable = shuffle(rows.filter((row) => !excluded.has(String(row._id))), random)
  return usable.length ? { rows: usable.slice(0, ROWS), kind: 'like-channel' } : null
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
 * The recent: what this year brought — a video of the last two years, known
 * or mainstream; a GIF brought in within the year, since a GIF carries no
 * date and its era reads "unknown" — with a clean title in Latin letters,
 * never from the registers of the old. The era index says "recent" over ten
 * years for videos; the sift keeps the last two, which is what "modern"
 * means to a visitor.
 */
async function drawRecent(db: Db, type: StartType, random: Rng, excluded: Set<string>, now: number): Promise<Document[]> {
  const filter: Filter<Document> = { 'v3.era': type === 'video' ? 'recent' : 'unknown', type, 'v3.usable': true, ...SERVABLE }
  const rows = await seek(db, filter, ERA_INDEX, random, excluded, RECENT_ROWS)
  return rows.filter((row) => {
    if (!isCoolCandidate(row as LabelableRow) || !isCleanTitle(row.title as string) || !isLatinTitle(row.title as string)) return false
    const v3 = row.v3 as { popularity?: Popularity; registers?: CoolRegister[] } | undefined
    if ((v3?.registers ?? []).some((register) => OLD_REGISTERS.includes(register))) return false
    if (type === 'video') {
      const published = publishedDate(row.publishedAt)
      if (!published || published.getTime() < now - MODERN_MONTHS * 30 * 86_400_000) return false
      return v3?.popularity === 'known' || v3?.popularity === 'mainstream'
    }
    const created = publishedDate(row.createdAt)
    return Boolean(created && created.getTime() >= now - RECENT_IMAGE_MONTHS * 30 * 86_400_000)
  }).slice(0, ROWS)
}

export async function drawStart(
  db: Db,
  options: { type: StartType; source: CoolSource; niche?: NicheSource; excludeIds?: Iterable<string>; random?: Rng; now?: number },
): Promise<Start | null> {
  const random = options.random ?? Math.random
  const pool = await loadLikePool(db, options.now).catch((): LikePool => ({ zones: [], likeIds: [] }))
  // A like is never shown by a zone, whichever source the draw came from.
  const excluded = new Set([...(options.excludeIds ?? []), ...pool.likeIds])
  const { type, source } = options

  if (source === 'like') {
    const drawn = pool.zones.length ? await drawLike(db, pool, type, random, excluded) : null
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
