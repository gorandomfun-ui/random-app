/**
 * What each card of the wheel received today: the ingestion read through
 * the wheel's eyes (the owner, 1 October: "l'ingestion doit alimenter ce
 * système de manière efficace et large"). Every video that entered today is
 * sorted into the cards it could fill — a long one, a retro one, the world,
 * the weird, the bonus universes with their quality rules — so the admin
 * page says, day after day, which card the stock feeds and which it starves.
 * Written at the end of every dig run; one scan of the day's videos, by id.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import { isLetsPlay, isStillAlbum } from '../dig/door'
import { isoSeconds } from '../dig/youtube'
import { livelyRank } from '../cool/themes'
import type { DigBase, Popularity, Universe } from '../types'

export const CENSUS_COLLECTION = 'ingest_card_census'

export const CARDS = ['buzz', 'long', 'retro', 'taste', 'world', 'short', 'deep', 'weird', 'bonus:music', 'bonus:gaming', 'bonus:humor-memes'] as const
export type Card = (typeof CARDS)[number]

export type CardCensus = {
  /** The Paris day, `YYYY-MM-DD`. */
  day: string
  at: Date
  /** Videos that entered today. */
  total: number
  /** How many of them each card could use. */
  cards: Record<Card, number>
  /** Marked as made by AI, or a still album cover: what every card but chance refuses. */
  refused: { ai: number; still: number }
}

const LONG_SECONDS = 15 * 60
const SHORT_SECONDS = 4 * 60
const DEEP_VIEWS = 10_000

type Row = Document & { v3?: { line?: string; era?: string; universe?: Universe; popularity?: Popularity; subjects?: unknown[]; dig?: { base?: DigBase } } }

/** The cards a stored video could fill. */
export function cardsOf(row: Row): Card[] {
  const v3 = row.v3 ?? {}
  const seconds = typeof row.duration === 'string' ? isoSeconds(row.duration) : 0
  const live = row.liveBroadcastContent === 'live' || row.liveBroadcastContent === 'upcoming'
  const rank = livelyRank(row)
  const named = (v3.subjects?.length ?? 0) > 0
  const title = String(row.title ?? '')
  const cards: Card[] = []
  if (v3.line === 'fresh' || v3.line === 'trend') cards.push('buzz')
  if (seconds > LONG_SECONDS && !live) cards.push('long')
  if (v3.era === 'retro') cards.push('retro')
  if (v3.dig?.base === 'likes') cards.push('taste')
  if (v3.dig?.base === 'people') cards.push('world')
  if (seconds >= 15 && seconds <= SHORT_SECONDS && rank === 0) cards.push('short')
  if ((v3.popularity === 'niche' || (typeof row.viewCount === 'number' && row.viewCount < DEEP_VIEWS)) && named) cards.push('deep')
  if (v3.dig?.base === 'keywords') cards.push('weird')
  if (v3.universe === 'music' && rank <= 1) cards.push('bonus:music')
  if (v3.universe === 'gaming' && named && !isLetsPlay(title) && !live) cards.push('bonus:gaming')
  if (v3.universe === 'humor-memes' && seconds <= SHORT_SECONDS && rank === 0) cards.push('bonus:humor-memes')
  return cards
}

export function emptyCensus(day: string, at: Date): CardCensus {
  return { day, at, total: 0, cards: Object.fromEntries(CARDS.map((card) => [card, 0])) as Record<Card, number>, refused: { ai: 0, still: 0 } }
}

/** The Paris day of a moment, `YYYY-MM-DD`. */
export function parisDay(at: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** Today's videos, read once by id, sorted into the cards. */
export async function computeCardCensus(db: Db, now = new Date()): Promise<CardCensus> {
  const day = parisDay(now)
  // The day's first id: ids carry their second, and the day starts at midnight in Paris.
  const start = new Date(`${day}T00:00:00+02:00`)
  const from = ObjectId.createFromTime(Math.floor(start.getTime() / 1000))
  const census = emptyCensus(day, now)
  const cursor = db.collection('items').find({ type: 'video', _id: { $gte: from } } as Document, {
    projection: { title: 1, channelTitle: 1, duration: 1, liveBroadcastContent: 1, viewCount: 1, 'v3.line': 1, 'v3.era': 1, 'v3.universe': 1, 'v3.popularity': 1, 'v3.subjects': 1, 'v3.dig.base': 1 },
    hint: 'idx_image_scan_by_type_id', maxTimeMS: 120_000,
  })
  for await (const row of cursor) {
    census.total += 1
    if (!Number.isFinite(livelyRank(row))) { census.refused.ai += 1; continue }
    if (isStillAlbum({ title: String(row.title ?? ''), channelTitle: typeof row.channelTitle === 'string' ? row.channelTitle : undefined })) { census.refused.still += 1; continue }
    for (const card of cardsOf(row as Row)) census.cards[card] += 1
  }
  return census
}

export async function writeCardCensus(db: Db, census: CardCensus): Promise<void> {
  await db.collection(CENSUS_COLLECTION).replaceOne({ _id: census.day } as Document, { ...census, _id: census.day }, { upsert: true })
}

/** The last few days' censuses, the latest first. */
export async function readCardCensus(db: Db, days = 7): Promise<CardCensus[]> {
  const rows = await db.collection(CENSUS_COLLECTION).find({}, { sort: { day: -1 }, limit: days, maxTimeMS: 3000 }).toArray()
  return rows.map((row) => ({ day: String(row.day), at: new Date(row.at), total: Number(row.total ?? 0), cards: { ...emptyCensus('', new Date()).cards, ...(row.cards as Record<Card, number>) }, refused: { ai: Number(row.refused?.ai ?? 0), still: Number(row.refused?.still ?? 0) } }))
}

export function censusNote(census: CardCensus): string {
  const parts = CARDS.map((card) => `${card} ${census.cards[card]}`)
  return `${census.total} vidéos · ${parts.join(' · ')} · refusées IA ${census.refused.ai}, image fixe ${census.refused.still}`
}
