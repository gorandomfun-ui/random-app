/**
 * The mini-series filter at the door, where it touches the database: the
 * studios it has learned, the one serial per account it lets through, and
 * the record of what it refused, for the report. None of this may stop an
 * ingestion: a read that fails leaves the seed studios, a write that fails
 * loses a line of the report, never a video.
 */

import type { Db, Document } from 'mongodb'

import { isLearnedStudio, inKeptShare, miniSeriesVerdict, studioCandidates, studiosMatcher, STUDIO_MIN_REFUSED, type MiniSeriesReason } from './miniSeries'

export const STUDIOS_COLLECTION = 'mini_series_studios_v3'
export const REFUSALS_COLLECTION = 'ingest_refusals_v3'
export const KEPT_COLLECTION = 'mini_series_kept_v3'

/** The learned studios change once a night; ten minutes of cache is plenty. */
const STUDIOS_CACHE_MS = 10 * 60_000
/** Refusals are for the report: a month of them is enough to judge the rule. */
const REFUSAL_TTL_MS = 30 * 86_400_000
const TITLE_MAX = 200

type Screenable = {
  videoId: string
  title?: string | null
  provider?: string | null
  channelId?: string | null
  channelTitle?: string | null
  /** Width over height, when the provider says: a long vertical video is a serial. */
  aspectRatio?: number | null
  duration?: string | null
}

export type Refusal = {
  at: Date
  expiresAt: Date
  day: string
  reason: 'mini-series' | 'junk'
  detail: MiniSeriesReason | 'scam' | 'product-top'
  title: string
  provider: string
  videoId: string
  channel?: string
  line?: string
}

let studiosCache: { at: number; matcher: RegExp | null } | null = null
let refusalIndexReady = false

export function resetMiniSeriesCache(): void {
  studiosCache = null
}

/** The studio names the nightly learning promoted, as one matcher. */
export async function learnedStudios(db: Db, now = Date.now()): Promise<RegExp | null> {
  if (studiosCache && now - studiosCache.at < STUDIOS_CACHE_MS) return studiosCache.matcher
  const rows = await db
    .collection(STUDIOS_COLLECTION)
    .find({ refused: { $gte: STUDIO_MIN_REFUSED } }, { projection: { _id: 1, refused: 1, kept: 1 }, limit: 2000, maxTimeMS: 3000 })
    .toArray()
    .catch(() => [] as Document[])
  const names = rows
    .filter((row) => isLearnedStudio({ refused: Number(row.refused) || 0, kept: Number(row.kept) || 0 }))
    .map((row) => String(row._id))
  studiosCache = { at: now, matcher: studiosMatcher(names) }
  return studiosCache.matcher
}

const parisDay = (date: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

/** Who posted it, as far as the provider says: the one-per-account rule keys on this. */
export function accountKey(video: Screenable): string | null {
  const provider = (video.provider ?? '').trim().toLowerCase()
  const channel = (video.channelId ?? '').trim() || (video.channelTitle ?? '').trim().toLowerCase()
  return provider && channel ? `${provider}:${channel}` : null
}

/**
 * Whether this serial is the one its account is allowed. The first to claim
 * an account wins; a video without a known account is never kept.
 */
async function claimKeptSlot(db: Db, video: Screenable, now: Date): Promise<boolean> {
  const account = accountKey(video)
  if (!account) return false
  try {
    await db.collection(KEPT_COLLECTION).insertOne({ _id: account, videoId: video.videoId, title: (video.title ?? '').slice(0, TITLE_MAX), at: now } as Document)
    return true
  } catch {
    return false
  }
}

export type ScreenResult<T> = {
  videos: T[]
  refused: number
  /** Serials let through as the account's one: marked on the stored item. */
  keptIds: Set<string>
}

/**
 * Splits a batch into what may be inserted and the mini-series refused. In a
 * dry run nothing is written: a serial in the kept share counts as kept.
 */
export async function screenMiniSeries<T extends Screenable>(
  db: Db,
  videos: T[],
  options: { dryRun: boolean; line?: string; now?: Date },
): Promise<ScreenResult<T>> {
  const now = options.now ?? new Date()
  const matcher = await learnedStudios(db, now.getTime()).catch(() => null)
  const admitted: T[] = []
  const refusals: Refusal[] = []
  const keptIds = new Set<string>()
  for (const video of videos) {
    const detail = miniSeriesVerdict(video, matcher)
    if (!detail) {
      admitted.push(video)
      continue
    }
    if (inKeptShare(video.videoId) && (options.dryRun || (await claimKeptSlot(db, video, now)))) {
      keptIds.add(video.videoId)
      admitted.push(video)
      continue
    }
    const channel = (video.channelTitle ?? video.channelId ?? '').trim()
    refusals.push({
      at: now,
      expiresAt: new Date(now.getTime() + REFUSAL_TTL_MS),
      day: parisDay(now),
      reason: 'mini-series',
      detail,
      title: (video.title ?? '').slice(0, TITLE_MAX),
      provider: video.provider ?? '',
      videoId: video.videoId,
      ...(channel ? { channel } : {}),
      ...(options.line ? { line: options.line } : {}),
    })
  }
  if (!options.dryRun && refusals.length) await recordRefusals(db, refusals)
  return { videos: admitted, refused: refusals.length, keptIds }
}

export async function recordRefusals(db: Db, refusals: Refusal[]): Promise<void> {
  try {
    const collection = db.collection(REFUSALS_COLLECTION)
    if (!refusalIndexReady) {
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' })
      await collection.createIndex({ reason: 1, at: -1 }, { name: 'reason_at' })
      refusalIndexReady = true
    }
    await collection.insertMany(refusals as unknown as Document[], { ordered: false })
  } catch (error) {
    console.warn('[mini-series] refus non enregistrés', error instanceof Error ? error.message : error)
  }
}

/**
 * The nightly learning: the title segments that keep coming back on refused
 * serials and hardly ever on what was let in become studios. Reads the
 * window's refusals and the titles inserted in it, bounded by the provider
 * and date index; writes one row per candidate seen at least twice.
 */
export async function learnStudios(db: Db, since: Date, until: Date): Promise<{ candidates: number; studios: number }> {
  const refused = await db
    .collection(REFUSALS_COLLECTION)
    .find({ reason: 'mini-series', at: { $gte: since, $lt: until } }, { projection: { title: 1 }, maxTimeMS: 60_000 })
    .toArray()
  const refusedCounts = new Map<string, number>()
  const seenTitles = new Set<string>()
  for (const row of refused) {
    const title = String(row.title ?? '')
    if (!title || seenTitles.has(title)) continue
    seenTitles.add(title)
    for (const candidate of studioCandidates(title)) refusedCounts.set(candidate, (refusedCounts.get(candidate) ?? 0) + 1)
  }
  const candidates = new Map([...refusedCounts].filter(([, count]) => count >= 2))
  if (!candidates.size) return { candidates: 0, studios: 0 }

  const keptCounts = new Map<string, number>()
  const inserted = await db
    .collection('items')
    .find(
      { type: 'video', provider: { $in: ['youtube', 'dailymotion'] }, createdAt: { $gte: since, $lt: until } },
      { projection: { title: 1 }, hint: 'video_provider_createdAt_lookup', maxTimeMS: 120_000 },
    )
    .toArray()
  for (const row of inserted) {
    for (const candidate of studioCandidates(String(row.title ?? ''))) {
      if (candidates.has(candidate)) keptCounts.set(candidate, (keptCounts.get(candidate) ?? 0) + 1)
    }
  }

  const operations = [...candidates].map(([name, count]) => ({
    updateOne: {
      filter: { _id: name } as Document,
      update: { $inc: { refused: count, kept: keptCounts.get(name) ?? 0 }, $max: { lastAt: until }, $min: { firstAt: since } },
      upsert: true,
    },
  }))
  await db.collection(STUDIOS_COLLECTION).bulkWrite(operations, { ordered: false })
  const rows = await db.collection(STUDIOS_COLLECTION).find({ refused: { $gte: STUDIO_MIN_REFUSED } }, { projection: { refused: 1, kept: 1 }, maxTimeMS: 5000 }).toArray()
  resetMiniSeriesCache()
  return { candidates: candidates.size, studios: rows.filter((row) => isLearnedStudio({ refused: Number(row.refused) || 0, kept: Number(row.kept) || 0 })).length }
}

/** For the report: the last days' refusals by day and reason, the latest titles, the learned studios. */
export async function refusalsReport(db: Db, since: Date): Promise<{
  days: Array<{ day: string; total: number; byDetail: Record<string, number> }>
  examples: Array<{ at: Date; title: string; provider: string; detail: string; channel?: string }>
  studios: Array<{ name: string; refused: number; kept: number }>
}> {
  const grouped = await db
    .collection(REFUSALS_COLLECTION)
    .aggregate<{ _id: { day: string; detail: string }; n: number }>(
      [{ $match: { reason: { $in: ['mini-series', 'junk'] }, at: { $gte: since } } }, { $group: { _id: { day: '$day', detail: '$detail' }, n: { $sum: 1 } } }],
      { maxTimeMS: 5000 },
    )
    .toArray()
  const byDay = new Map<string, { day: string; total: number; byDetail: Record<string, number> }>()
  for (const row of grouped) {
    const entry = byDay.get(row._id.day) ?? { day: row._id.day, total: 0, byDetail: {} }
    entry.total += row.n
    entry.byDetail[row._id.detail] = (entry.byDetail[row._id.detail] ?? 0) + row.n
    byDay.set(row._id.day, entry)
  }
  const examples = (await db
    .collection(REFUSALS_COLLECTION)
    .aggregate([{ $match: { reason: { $in: ['mini-series', 'junk'] }, at: { $gte: since } } }, { $sample: { size: 20 } }, { $project: { _id: 0, at: 1, title: 1, provider: 1, detail: 1, channel: 1 } }], { maxTimeMS: 5000 })
    .toArray()) as Array<{ at: Date; title: string; provider: string; detail: string; channel?: string }>
  const studioRows = await db
    .collection(STUDIOS_COLLECTION)
    .find({ refused: { $gte: STUDIO_MIN_REFUSED } }, { sort: { refused: -1 }, limit: 200, maxTimeMS: 3000 })
    .toArray()
  const studios = studioRows
    .map((row) => ({ name: String(row._id), refused: Number(row.refused) || 0, kept: Number(row.kept) || 0 }))
    .filter(isLearnedStudio)
    .slice(0, 30)
  return { days: [...byDay.values()].sort((left, right) => (left.day < right.day ? 1 : -1)), examples, studios }
}
