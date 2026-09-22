/**
 * A line run directly, on GitHub, before the v3 runner exists: the minimal
 * context the runner will build — deadline, journal, lock, quota, admission
 * founded on the current insertion paths with the line's label. The line
 * itself never sees where it runs.
 */

import type { Db, Document } from 'mongodb'

import { admitImageSources } from '@/lib/ingest/images'
import { finalizeVideoIngest, type RawVideo } from '@/lib/ingest/videos'
import { quotaDay } from '@/lib/discovery/exploration'
import { detectAngle } from '../tagging/angle'
import { closeRun, judge, openRun, recordSearch, type JournalLine, type RunStatus } from './journal'
import type { AdmissionBatch, AdmissionResult, LineContext, LineResult, SearchInput } from './context'
import type { Line } from '../types'

export const LOCKS_COLLECTION = 'ingest_locks_v3'
export const TREND_QUOTA_BUCKET = 'trend'
/** Videos of a subject already carrying these angles, past which more of the same are refused. */
const SATURATED_ANGLES = ['official-clip', 'mainstream-report'] as const
const ANGLE_SATURATION = 5

export class LineLocked extends Error {
  constructor(line: string) {
    super(`${line}: un passage est déjà en cours`)
    this.name = 'LineLocked'
  }
}

export type DirectOptions = {
  line: Line
  journalLine: JournalLine
  minutes: number
  dryRun: boolean
  host: string
  /** YouTube units the line may spend today, in its own bucket of discovery_quota_v2. */
  youtubeDailyUnits: number
  log?: (message: string) => void
  http?: typeof fetch
}

export type DirectRun = {
  ctx: LineContext
  /** Judges, journals, releases the lock. */
  finish(result: LineResult): Promise<{ status: RunStatus; hitDeadline: boolean }>
}

async function acquireLock(db: Db, line: string, until: Date, host: string): Promise<boolean> {
  const locks = db.collection<{ _id: string; until: Date; host?: string }>(LOCKS_COLLECTION)
  const now = new Date()
  try {
    const result = await locks.findOneAndUpdate(
      { _id: line, $or: [{ until: { $lt: now } }, { until: { $exists: false } }] },
      { $set: { until, host, takenAt: now } },
      { upsert: true, returnDocument: 'after', maxTimeMS: 3000 },
    )
    return result != null
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false
    throw error
  }
}

/** The line's own YouTube bucket: `spent` never passes the day's units. */
export function trendQuota(db: Db, dailyUnits: number, dryRun: boolean) {
  let booked = 0
  return {
    async reserve(units: number): Promise<boolean> {
      if (dryRun) { booked += units; return true }
      const collection = db.collection<{ _id: string; spent: number }>('discovery_quota_v2')
      const _id = `${quotaDay(Date.now())}:youtube:${TREND_QUOTA_BUCKET}`
      try { await collection.updateOne({ _id }, { $setOnInsert: { spent: 0 } }, { upsert: true, maxTimeMS: 2000 }) }
      catch (error) { if ((error as { code?: number }).code !== 11000) throw error }
      const result = await collection.findOneAndUpdate({ _id, spent: { $lte: dailyUnits - units } }, { $inc: { spent: units } }, { returnDocument: 'after', maxTimeMS: 2000 })
      if (result != null) booked += units
      return result != null
    },
    spent: () => booked,
  }
}

/** The provisional admission: the current video and image insertion paths, with the line, plus the angle rule of the trend. */
export function provisionalAdmit(db: Db, line: Line, dryRun: boolean) {
  const saturation = new Map<string, number>()
  const countSaturated = async (subjectId: string): Promise<number> => {
    const known = saturation.get(subjectId)
    if (known !== undefined) return known
    const count = await db.collection('items').countDocuments(
      { 'v3.subjects.id': subjectId, type: 'video', 'v3.angle': { $in: [...SATURATED_ANGLES] } } as Document,
      { maxTimeMS: 4000, hint: 'v3_subject_type_rand' },
    ).catch(() => 0)
    saturation.set(subjectId, count)
    return count
  }
  return async (batch: AdmissionBatch): Promise<AdmissionResult> => {
    const result: AdmissionResult = { scanned: 0, inserted: 0, duplicates: 0, rejected: {}, insertedIds: [] }
    if (batch.videos?.length) {
      // Past five official clips or reports on a subject, the next ones of the same angle are refused: the "seen from elsewhere".
      let saturated = await countSaturated(batch.subjectId)
      const admitted: RawVideo[] = []
      for (const video of batch.videos) {
        const angle = detectAngle({ type: 'video', title: video.title, description: video.description, channelTitle: video.channelTitle, viewCount: video.viewCount })
        if ((SATURATED_ANGLES as readonly string[]).includes(angle)) {
          if (saturated >= ANGLE_SATURATION) { result.rejected['angle-saturated'] = (result.rejected['angle-saturated'] ?? 0) + 1; continue }
          saturated += 1
        }
        admitted.push(video)
      }
      saturation.set(batch.subjectId, saturated)
      result.scanned += batch.videos.length
      if (admitted.length) {
        const warnings: Array<{ label: string; message: string }> = []
        const summary = await finalizeVideoIngest(admitted, { dryRun, sampleSize: 0, warnings, skipDetails: true, insertOnly: true, line })
        result.inserted += summary.inserted
        result.duplicates += summary.existingSkipped ?? 0
        if (summary.skippedInvalid) result.rejected.invalid = (result.rejected.invalid ?? 0) + summary.skippedInvalid
        const filtered = admitted.length - (summary.unique ?? admitted.length) - (summary.skippedInvalid ?? 0)
        if (filtered > 0) result.rejected.routine = (result.rejected.routine ?? 0) + filtered
      }
    }
    if (batch.images?.length) {
      const admission = await admitImageSources(batch.images, { dryRun, line })
      result.scanned += admission.scanned
      result.inserted += admission.inserted
      result.duplicates += admission.existingSkipped
      if (admission.skippedInvalid) result.rejected.invalid = (result.rejected.invalid ?? 0) + admission.skippedInvalid
      result.insertedIds.push(...admission.insertedIds)
    }
    return result
  }
}

/** Builds the context, takes the lock, opens the run. Throws `LineLocked` when a run is already going. */
export async function directContext(db: Db, options: DirectOptions): Promise<DirectRun> {
  const startedAt = new Date()
  const deadline = startedAt.getTime() + options.minutes * 60_000
  if (!(await acquireLock(db, options.journalLine, new Date(deadline + 5 * 60_000), options.host))) throw new LineLocked(options.journalLine)
  const runId = await openRun(db, { line: options.journalLine, startedAt, host: options.host, dryRun: options.dryRun }).catch(() => null)
  const log = options.log ?? ((text: string) => console.log(`[${options.journalLine}] ${text}`))
  const ctx: LineContext = {
    db,
    line: options.line,
    deadline,
    timeLeft: () => deadline - Date.now(),
    dryRun: options.dryRun,
    cursor: null,
    quota: trendQuota(db, options.youtubeDailyUnits, options.dryRun),
    admit: provisionalAdmit(db, options.line, options.dryRun),
    search: async (record: SearchInput) => {
      await recordSearch(db, { ...record, line: options.journalLine, at: new Date() }).catch(() => log('journal des recherches indisponible'))
    },
    log,
    ...(options.http ? { http: options.http } : {}),
  }
  return {
    ctx,
    async finish(result: LineResult) {
      const finishedAt = new Date()
      const hitDeadline = finishedAt.getTime() >= deadline
      // A dry run inserts nothing by design: it is judged on what it read, not on what it wrote.
      const status: RunStatus = options.dryRun
        ? (result.errors.length ? 'partial' : result.counters.scanned ? 'ok' : 'skipped')
        : judge(result.counters, result.errors, hitDeadline)
      if (runId) await closeRun(db, runId, { finishedAt, status, counters: result.counters, errors: result.errors }).catch(() => log('journal indisponible ; le passage lui-même n_est pas affecté'))
      await db.collection(LOCKS_COLLECTION).updateOne({ _id: options.journalLine } as Document, { $set: { until: new Date(0) } }).catch(() => undefined)
      return { status, hitDeadline }
    },
  }
}

/** The indexes this line reads by; small collections, created when absent. */
export async function installTrendIndexes(db: Db): Promise<void> {
  await db.collection('trend_signals_v3').createIndex({ day: 1, key: 1 }, { name: 'signals_day_key' })
  await db.collection('subjects_v3').createIndex({ 'trend.lastSeen': -1, 'trend.score': -1 }, { name: 'subject_trend', partialFilterExpression: { 'trend.lastSeen': { $exists: true } } })
}
