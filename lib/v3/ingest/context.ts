/**
 * What an ingestion line is given, and what it hands back.
 *
 * The contract of the v3 runner (phase 5 of the ingestion brief). A line is
 * one file that exports `run(ctx)` and nothing else; the runner — or, until
 * it exists, a direct envelope on GitHub — builds the context: deadline,
 * journal, admission, quota. Nothing in a line depends on where it runs.
 */

import type { Db } from 'mongodb'

import type { ImageSource } from '@/lib/ingest/images'
import type { RawVideo } from '@/lib/ingest/videos'
import type { RunCounters, SearchRecord } from './journal'
import type { Line } from '../types'

/** YouTube units: `reserve` says whether the call may be made, and books it. */
export type YouTubeQuota = {
  reserve(units: number): Promise<boolean>
  /** Units booked by this run so far. */
  spent(): number
}

/** What a line asks to have admitted, for one subject: videos, images, or both. */
export type AdmissionBatch = {
  subjectId: string
  videos?: RawVideo[]
  images?: ImageSource[]
}

export type AdmissionResult = {
  scanned: number
  inserted: number
  duplicates: number
  rejected: Record<string, number>
  insertedIds: string[]
}

export type SearchInput = Omit<SearchRecord, 'line' | 'at'>

export type LineContext = {
  db: Db
  line: Line
  /** `Date.now()` limit; the line checks `timeLeft()` between two batches. */
  deadline: number
  timeLeft(): number
  dryRun: boolean
  /** What the previous run left, or null. */
  cursor: unknown
  quota: YouTubeQuota
  /** The only way a line writes contents: common rules, tagging with the line, insertion. */
  admit(batch: AdmissionBatch): Promise<AdmissionResult>
  /** The journal of searches, with the exact query. */
  search(record: SearchInput): Promise<void>
  log(message: string): void
  /** HTTP, replaceable in tests; the global `fetch` otherwise. */
  http?: typeof fetch
}

export type LineResult = { counters: RunCounters; cursor?: unknown; errors: string[] }

export type LineRunner = (ctx: LineContext) => Promise<LineResult>

/** Folds an admission into the run's counters. */
export function addAdmission(counters: RunCounters, result: Pick<AdmissionResult, 'scanned' | 'inserted' | 'duplicates' | 'rejected'>): void {
  counters.scanned += result.scanned
  counters.inserted += result.inserted
  counters.duplicates += result.duplicates
  for (const [reason, count] of Object.entries(result.rejected)) {
    counters.rejected[reason] = (counters.rejected[reason] ?? 0) + count
  }
}
