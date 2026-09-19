/**
 * Recording what the ingestion actually did.
 *
 * The audit found the current reports untrustworthy: the trending line had
 * not run since 11 September with nothing saying so, and the enrichment job
 * reported success while enriching zero videos across 354 runs. A report that
 * cannot be believed is worse than none, because it hides the outage.
 *
 * Two collections, as the plan asks: one document per run, one per search.
 */

import type { Db } from 'mongodb'

import type { Line } from '../types'

export const RUNS = 'ingest_runs_v3'
export const SEARCHES = 'ingest_searches_v3'

/**
 * `partial` exists so a run stopped by its own deadline is not called a
 * failure, and `skipped` so a run that found nothing to do is not called a
 * success. Both were conflated before.
 */
export type RunStatus = 'ok' | 'partial' | 'skipped' | 'failed'

export type RunCounters = {
  /** Raw results seen from the providers. */
  scanned: number
  /** Accepted and written. */
  inserted: number
  /** Already in the catalogue. */
  duplicates: number
  /** Refused, by reason: too many per channel, saturation, no title… */
  rejected: Record<string, number>
}

export const emptyCounters = (): RunCounters => ({ scanned: 0, inserted: 0, duplicates: 0, rejected: {} })

export type RunRecord = {
  line: Line | 'enrich' | 'repair'
  startedAt: Date
  finishedAt: Date
  status: RunStatus
  counters: RunCounters
  /** Quota units spent, so a day's budget can be reconciled. */
  quotaUnits?: number
  errors?: string[]
  host?: string
}

/**
 * A run is only `ok` when it did something. Claiming success on zero
 * insertions is what let the trending line die unnoticed.
 */
export function judge(counters: RunCounters, errors: string[], hitDeadline: boolean): RunStatus {
  if (errors.length && !counters.inserted) return 'failed'
  if (hitDeadline) return 'partial'
  if (!counters.scanned) return 'skipped'
  if (!counters.inserted && counters.duplicates) return 'ok'
  if (!counters.inserted) return 'skipped'
  return errors.length ? 'partial' : 'ok'
}

export async function recordRun(db: Db, run: RunRecord): Promise<void> {
  await db.collection(RUNS).insertOne({ ...run, createdAt: new Date() })
}

export type SearchRecord = {
  line: Line | 'enrich' | 'repair'
  provider: string
  /** The exact query sent, so a poor one can be recognised and retired. */
  query: string
  subjectId?: string
  /** The like that triggered the dig, when there is one. */
  likeItemId?: string
  scanned: number
  kept: number
  inserted: number
  duplicates: number
  rejected: Record<string, number>
  quotaUnits: number
  /** Ids of what it actually added, so a report can show the thumbnails. */
  insertedIds?: string[]
  at: Date
}

export async function recordSearch(db: Db, search: SearchRecord): Promise<void> {
  await db.collection(SEARCHES).insertOne(search)
}

/**
 * The share of a query's results refused for saturation.
 *
 * Past 60% over two runs the plan retires the query for thirty days: a query
 * that only brings back things we already have too many of is wasting the
 * quota that matters.
 */
export function saturationRate(search: Pick<SearchRecord, 'scanned' | 'rejected'>): number {
  if (!search.scanned) return 0
  return (search.rejected.saturation ?? 0) / search.scanned
}

export const SATURATION_RETIRE_THRESHOLD = 0.6

/** Indexes the report page needs; called once at startup. */
export async function installJournalIndexes(db: Db): Promise<void> {
  await db.collection(RUNS).createIndex({ startedAt: -1 }, { name: 'runs_by_date' })
  await db.collection(RUNS).createIndex({ line: 1, startedAt: -1 }, { name: 'runs_by_line' })
  await db.collection(SEARCHES).createIndex({ at: -1 }, { name: 'searches_by_date' })
  await db.collection(SEARCHES).createIndex({ line: 1, at: -1 }, { name: 'searches_by_line' })
  await db.collection(SEARCHES).createIndex({ subjectId: 1, at: -1 }, { name: 'searches_by_subject', sparse: true })
}
