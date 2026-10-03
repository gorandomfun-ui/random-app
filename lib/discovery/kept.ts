/**
 * The slow curation: what people stay on, counted on the site, tilting the
 * wheel a little.
 *
 * Every draw may carry a few reports from the device — a content id and the
 * seconds it was kept on screen (utils/keptMemory.ts). The site adds them to
 * the content's `served.kept` and `served.seconds`. At the draw, a content's
 * mean kept seconds, smoothed by a prior of five reports at the expected
 * mean, tilts how served it looks to the wheel: between half and double,
 * never more (the owner, 1 October: "un truc lent… tomber sur des choses
 * inattendues parfois"). Only the curated cards read the tilt — the taste,
 * the little-seen, the joker, the bonus; chance, weird, the world and the
 * rest stay pure, the surprise is built in.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import type { Candidate } from './types'
import type { Slot } from './wheel'

export type Kept = { id: string; seconds: number; card?: string }
export type KeptCount = { n: number; seconds: number }

export const KEPT_PER_DRAW = 4
export const KEPT_CAP_SECONDS = 120
/** What a random video is kept on screen, on average, until the data says otherwise. */
export const MEAN_SECONDS = 10
/** Reports a content needs before its own mean weighs as much as the prior. */
export const PRIOR_REPORTS = 5
export const TILT_MIN = 0.5
export const TILT_MAX = 2
/** The cards the curation may tilt; every other card stays pure. */
export const CURATED_SLOTS: ReadonlySet<Slot> = new Set<Slot>(['taste', 'deep', 'joker', 'bonus'])

const WRITE_BUDGET_MS = 400
/** The day's tally by card: how many reports and how many seconds, one document a day. */
export const KEPT_CARDS_COLLECTION = 'kept_cards_v1'
const CARD = /^[a-z-]+(?::[a-z-]+)?$/

/** The Paris day of a moment, `YYYY-MM-DD`. */
export const parisDay = (at: Date): string => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

/** The reports of a request body: an id and capped seconds, a few at most; anything else is dropped. */
export function parseKept(value: unknown): Kept[] {
  if (!Array.isArray(value)) return []
  const kept: Kept[] = []
  for (const entry of value.slice(0, KEPT_PER_DRAW)) {
    if (!entry || typeof entry !== 'object') continue
    const { id, seconds, card } = entry as { id?: unknown; seconds?: unknown; card?: unknown }
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id) || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) continue
    kept.push({ id, seconds: Math.min(KEPT_CAP_SECONDS, Math.round(seconds)), ...(typeof card === 'string' && card.length <= 24 && CARD.test(card) ? { card } : {}) })
  }
  return kept
}

/** One write for all the reports of a draw on the contents, and one on the day's tally by card. */
export async function recordKept(db: Db, kept: readonly Kept[], now = new Date()): Promise<number> {
  if (!kept.length) return 0
  const result = await db.collection('items').bulkWrite(kept.map((report) => ({
    updateOne: { filter: { _id: new ObjectId(report.id) }, update: { $inc: { 'served.kept': 1, 'served.seconds': report.seconds } } },
  })), { ordered: false, maxTimeMS: WRITE_BUDGET_MS } as { ordered: boolean })
  const byCard: Record<string, number> = {}
  for (const report of kept) {
    if (!report.card) continue
    byCard[`cards.${report.card}.n`] = (byCard[`cards.${report.card}.n`] ?? 0) + 1
    byCard[`cards.${report.card}.seconds`] = (byCard[`cards.${report.card}.seconds`] ?? 0) + report.seconds
  }
  if (Object.keys(byCard).length) {
    const day = parisDay(now)
    await db.collection(KEPT_CARDS_COLLECTION).updateOne({ _id: day } as Document, { $inc: byCard, $setOnInsert: { day } }, { upsert: true, maxTimeMS: WRITE_BUDGET_MS }).catch(() => undefined)
  }
  return result.matchedCount
}

export type KeptCards = { day: string; cards: Record<string, { n: number; seconds: number }> }

/** The last few days' tallies by card, the latest first. */
export async function readKeptCards(db: Db, days = 7): Promise<KeptCards[]> {
  const rows = await db.collection(KEPT_CARDS_COLLECTION).find({}, { sort: { day: -1 }, limit: days, maxTimeMS: 3000 }).toArray()
  return rows.map((row) => ({ day: String(row.day), cards: (row.cards ?? {}) as KeptCards['cards'] }))
}

/** How a content's kept seconds compare with the expected mean, smoothed, between half and double. */
export function tilt(kept: KeptCount | undefined): number {
  if (!kept || kept.n <= 0) return 1
  const mean = (kept.seconds + PRIOR_REPORTS * MEAN_SECONDS) / (kept.n + PRIOR_REPORTS)
  return Math.min(TILT_MAX, Math.max(TILT_MIN, mean / MEAN_SECONDS))
}

/** How served a content looks to a card: its count, divided by the tilt on a curated card — a kept content comes back sooner, a skipped one later. */
export function effectiveServed(candidate: Candidate, slot: Slot): number {
  const served = candidate.served ?? 0
  return CURATED_SLOTS.has(slot) ? served / tilt(candidate.kept) : served
}
