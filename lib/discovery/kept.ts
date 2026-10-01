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

import { ObjectId, type Db } from 'mongodb'

import type { Candidate } from './types'
import type { Slot } from './wheel'

export type Kept = { id: string; seconds: number }
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

/** The reports of a request body: an id and capped seconds, a few at most; anything else is dropped. */
export function parseKept(value: unknown): Kept[] {
  if (!Array.isArray(value)) return []
  const kept: Kept[] = []
  for (const entry of value.slice(0, KEPT_PER_DRAW)) {
    if (!entry || typeof entry !== 'object') continue
    const { id, seconds } = entry as { id?: unknown; seconds?: unknown }
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id) || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) continue
    kept.push({ id, seconds: Math.min(KEPT_CAP_SECONDS, Math.round(seconds)) })
  }
  return kept
}

/** One write for all the reports of a draw. */
export async function recordKept(db: Db, kept: readonly Kept[]): Promise<number> {
  if (!kept.length) return 0
  const result = await db.collection('items').bulkWrite(kept.map((report) => ({
    updateOne: { filter: { _id: new ObjectId(report.id) }, update: { $inc: { 'served.kept': 1, 'served.seconds': report.seconds } } },
  })), { ordered: false, maxTimeMS: WRITE_BUDGET_MS } as { ordered: boolean })
  return result.matchedCount
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
