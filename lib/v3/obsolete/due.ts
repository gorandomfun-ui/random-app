/**
 * Which videos are due a check, and how often. Measured on 8 October over
 * 3,000 Dailymotion videos found alive earlier: of those that entered the base
 * less than a month before, 9.8 % had vanished since; one to two months, 4.2 %;
 * older, none. Of those checked more than eight days before, 21.8 %; within
 * four days, 0.3 %. The deaths are the recent Dailymotion entries', and fast
 * (Dailymotion removing uploads for its terms of use): those are seen every two
 * days; the recent YouTube ones, which seldom die (0.2 % of a week's entries),
 * every week, within the night's own units; everything older once a month. A
 * video a visitor's player failed on (the site reports it,
 * app/api/feedback/video-error), one left "to see again" and one never checked
 * are seen the next night.
 */

import { ObjectId, type Document } from 'mongodb'

/** Entered the base this recently: checked often. */
export const RECENT_DAYS = 60
/** How often a recent Dailymotion video is seen again. */
export const RECENT_DAILYMOTION_EVERY_DAYS = 2
/** How often a recent YouTube video is. */
export const RECENT_YOUTUBE_EVERY_DAYS = 7
/** How often an older one is, whatever its platform. */
export const OLD_EVERY_DAYS = 30
const DAY_MS = 86_400_000
export const YOUTUBE_PROVIDERS = ['youtube', 'reddit-youtube']

export const recentSince = (now: number): ObjectId => ObjectId.createFromTime(Math.floor((now - RECENT_DAYS * DAY_MS) / 1000))
const before = (now: number, days: number) => new Date(now - days * DAY_MS)

/** One lane of the night: its filter, the index that serves it, the order it is read in (by id, or by the last check then id). */
export type Lane = { name: string; label: string; filter: Document; hint: string; order: 'id' | 'checked'; limit: number }

export type LaneSizes = { suspect: number; doubtful: number; never: number; recentDailymotion: number; recentYouTube: number; old: number }
export const NIGHT_SIZES: LaneSizes = { suspect: 5_000, doubtful: 5_000, never: 60_000, recentDailymotion: 150_000, recentYouTube: 30_000, old: 40_000 }

/**
 * The night's lanes, in order. A video already found dead waits for the owner's deletion, which checks it once more;
 * it is not read again.
 */
export function lanes(now: number, sizes: LaneSizes = NIGHT_SIZES): Lane[] {
  const alive = { obsoleteVideoStatus: { $ne: 'obsolete' } }
  const recent = { $gte: recentSince(now) }
  return [
    { name: 'suspect', label: 'signalées par le site', filter: { type: 'video', obsoleteVideoRuntimeSuspect: true, ...alive }, hint: 'idx_video_runtime_suspect', order: 'id', limit: sizes.suspect },
    { name: 'doubtful', label: 'à revoir', filter: { type: 'video', obsoleteVideoStatus: { $in: ['ambiguous', 'rate-limited'] }, obsoleteVideoCheckedAt: { $lt: before(now, 0.5) } }, hint: 'idx_video_obsolete_status', order: 'id', limit: sizes.doubtful },
    { name: 'never', label: 'jamais vérifiées', filter: { type: 'video', obsoleteVideoCheckedAt: null }, hint: 'idx_video_obsolete_checked', order: 'id', limit: sizes.never },
    { name: 'recent-dailymotion', label: 'Dailymotion récentes', filter: { type: 'video', provider: 'dailymotion', obsoleteVideoCheckedAt: { $lt: before(now, RECENT_DAILYMOTION_EVERY_DAYS) }, _id: recent, ...alive }, hint: 'idx_video_obsolete_checked', order: 'checked', limit: sizes.recentDailymotion },
    { name: 'recent-youtube', label: 'YouTube récentes', filter: { type: 'video', provider: { $in: YOUTUBE_PROVIDERS }, obsoleteVideoCheckedAt: { $lt: before(now, RECENT_YOUTUBE_EVERY_DAYS) }, _id: recent, ...alive }, hint: 'idx_video_obsolete_checked', order: 'checked', limit: sizes.recentYouTube },
    { name: 'old', label: 'plus anciennes', filter: { type: 'video', obsoleteVideoCheckedAt: { $lt: before(now, OLD_EVERY_DAYS) }, _id: { $lt: recentSince(now) }, ...alive }, hint: 'idx_video_obsolete_checked', order: 'checked', limit: sizes.old },
  ]
}

/** Where a lane resumes after a page: past the last id, or past the last (check date, id) pair. */
export function after(lane: Lane, last: { _id: unknown; obsoleteVideoCheckedAt?: unknown }): Document {
  if (lane.order === 'id') return { $and: [lane.filter, { _id: { $gt: last._id } }] }
  return { $and: [lane.filter, { $or: [{ obsoleteVideoCheckedAt: { $gt: last.obsoleteVideoCheckedAt } }, { obsoleteVideoCheckedAt: last.obsoleteVideoCheckedAt, _id: { $gt: last._id } }] }] }
}

export const sortOf = (lane: Lane): Document => (lane.order === 'id' ? { _id: 1 } : { obsoleteVideoCheckedAt: 1, _id: 1 })

/** Every video due a check now, as one filter: what the owner's page counts and scans (without "force"). */
export function dueFilter(now: number): Document {
  return { type: 'video', $or: lanes(now).map((lane) => Object.fromEntries(Object.entries(lane.filter).filter(([field]) => field !== 'type'))) }
}
