/**
 * The fresh-of-the-day line, at 09:05 Paris: the charts of the moment, zone
 * by zone (see `lib/v3/fresh/plan.ts`), a thousand videos in all. Every one
 * goes through the usual door — serials, ads and TV news refused — and the
 * ones already stored are simply referenced. What remains is ordered for
 * variety and kept as the day's list, one small document; the draw opens each
 * session on ten of it. The videos themselves are ordinary trends, filed in
 * their universes like any other: tomorrow nothing has to be undone.
 */

import type { Document } from 'mongodb'

import { fetchYouTubeChart, fetchYouTubeViewCounts } from '@/lib/ingest/videos'
import { junkKind } from '@/lib/ingest/junk'
import { miniSeriesVerdict } from '@/lib/ingest/miniSeries'
import { isNewsTitle } from '../../cool/themes'
import { capForeignSketches, capUniverses, dailyViews, FRESH_MEMORY_DAYS, FRESH_NEWS_MAX, FRESH_PLAN, interleave, isAiMade, isFreshFormat, observedFound, pickBucket, rankByDaily, type FreshBucket, type FreshEntry, type FreshFound, type ViewSample } from '../../fresh/plan'
import { searchDailymotion } from '../../trend/dig'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'

export const FRESH_COLLECTION = 'fresh_daily_v1'
const ADMIT_CHUNK = 100
/** Fewer chart videos than this means YouTube said no early: the day's earlier reads fill in. */
const ENOUGH_FOUND = 2000
/** How far back those earlier reads may go. */
const OBSERVED_WINDOW_MS = 20 * 3_600_000
const WEEK_MS = 7 * 86_400_000
/** Each candidate's view counts, day after day: what the views of the day are measured from. */
export const FRESH_VIEWS = 'fresh_views_v1'
/** A candidate seen in a chart in the last two days is measured again even when it left the charts. */
const REMEASURE_WINDOW_MS = 48 * 3_600_000
/** Fewer measured candidates than this, and the charts' own order still decides (the very first days). */
const ENOUGH_MEASURED = 300

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const parisDay = (date: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

type Found = FreshFound

export type FreshCursorNote = { day: string; total: number; buckets: Partial<Record<FreshBucket, number>>; note: string }

export async function run(ctx: LineContext): Promise<LineResult> {
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const warnings: Array<{ label: string; message: string }> = []
  const now = new Date()
  const day = parisDay(now)
  const found: Found[] = []
  let youtubeStopped = false

  // The charts, zone by zone. A chart page is one unit for fifty videos.
  for (const plan of FRESH_PLAN) {
    for (const region of plan.regions) {
      let token: string | undefined
      for (let page = 0; page < plan.pages && !youtubeStopped; page += 1) {
        if (!(await ctx.quota.reserve(1))) { youtubeStopped = true; ctx.log('youtube : budget du jour atteint'); break }
        try {
          const { rows, next } = await fetchYouTubeChart(region, { category: plan.category, pageToken: token, limit: 50 }, warnings)
          rows.forEach((raw, index) => found.push({ raw, bucket: plan.bucket, rank: page * 50 + index, region }))
          token = next
          if (!token) break
        } catch (error) {
          errors.push(`youtube ${region}${plan.category ? `/${plan.category}` : ''} : ${message(error)}`)
          break
        }
      }
    }
    for (const country of plan.dailymotion) {
      try {
        const videos = await searchDailymotion({ query: '', sort: 'visited-today', country, after: new Date(now.getTime() - WEEK_MS).toISOString(), before: now.toISOString() }, http)
        videos.forEach((raw, index) => found.push({ raw: { ...raw, trendObservedAt: now }, bucket: plan.bucket, rank: index, region: `dm-${country}` }))
      } catch (error) {
        errors.push(`dailymotion ${country} : ${message(error)}`)
      }
    }
  }

  if (found.length < ENOUGH_FOUND) {
    const rows = await ctx.db.collection('items').find(
      { type: 'video', trendObservedAt: { $gte: new Date(now.getTime() - OBSERVED_WINDOW_MS) } } as Document,
      { projection: { videoId: 1, title: 1, provider: 1, viewCount: 1, discoveryQueries: 1 }, hint: 'discovery_trend_v2', maxTimeMS: 60_000 },
    ).toArray().catch(() => [] as Document[])
    const known = new Set(found.map((entry) => `${entry.bucket}:${entry.raw.videoId}`))
    const extra = observedFound(rows as Array<Record<string, unknown>>).filter((entry) => !known.has(`${entry.bucket}:${entry.raw.videoId}`))
    found.push(...extra.map((entry) => ({ ...entry, stale: true })))
    ctx.log(`youtube a peu répondu (${found.length - extra.length} vidéos) : ${extra.length} reprises des relevés des dernières heures`)
  }

  // The view counts read today, and yesterday's candidates that left the charts, read again (one unit for fifty).
  const viewsNow = new Map<string, number>()
  for (const entry of found) if (!entry.stale && typeof entry.raw.viewCount === 'number') viewsNow.set(entry.raw.videoId, entry.raw.viewCount)
  const charted = new Set(found.map((entry) => entry.raw.videoId))
  const lately = await ctx.db.collection(FRESH_VIEWS).find({ lastCharted: { $gte: new Date(now.getTime() - REMEASURE_WINDOW_MS) } } as Document, { projection: { queries: 1 }, maxTimeMS: 20_000 })
    .toArray().catch(() => [] as Document[])
  const toMeasure = lately.filter((doc) => !charted.has(String(doc._id)) && /^[\w-]{11}$/.test(String(doc._id)))
  for (let start = 0; start < toMeasure.length && !youtubeStopped; start += 50) {
    if (!(await ctx.quota.reserve(1))) { youtubeStopped = true; break }
    const counts = await fetchYouTubeViewCounts(toMeasure.slice(start, start + 50).map((doc) => String(doc._id)), warnings).catch(() => new Map<string, number>())
    for (const [id, views] of counts) viewsNow.set(id, views)
  }
  const remeasured = observedFound(toMeasure.filter((doc) => viewsNow.has(String(doc._id)))
    .map((doc) => ({ videoId: String(doc._id), viewCount: viewsNow.get(String(doc._id)), discoveryQueries: doc.queries })))
  found.push(...remeasured)
  const remeasuredIds = new Set(remeasured.map((entry) => entry.raw.videoId))

  // Through the door, once each. What is already stored is not written again.
  const unique = [...new Map(found.filter((entry) => !remeasuredIds.has(entry.raw.videoId)).map((entry) => [entry.raw.videoId, entry.raw])).values()]
  for (let start = 0; start < unique.length; start += ADMIT_CHUNK) {
    const batch = unique.slice(start, start + ADMIT_CHUNK)
    try {
      const result = await ctx.admit({ subjectId: 'fresh', videos: batch, keepAngles: true })
      addAdmission(counters, { ...result, scanned: batch.length })
    } catch (error) {
      errors.push(`admission : ${message(error)}`)
    }
  }

  // What each candidate is in the catalogue now: refused ones are simply absent.
  const rows = new Map<string, Document>()
  const ids = [...new Set(found.map((entry) => entry.raw.videoId))]
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = await ctx.db.collection('items').find(
      { type: 'video', videoId: { $in: ids.slice(start, start + 500) } } as Document,
      { projection: { videoId: 1, title: 1, channelTitle: 1, viewCount: 1, statsObservedAt: 1, isSuppressed: 1, editorialRoutine: 1, obsoleteVideoStatus: 1, channelId: 1, aspectRatio: 1, duration: 1, 'v3.universe': 1, 'v3.nearFamily': 1 }, hint: 'video_id_lookup' },
    ).toArray().catch(() => [] as Document[])
    for (const row of chunk) rows.set(String(row.videoId), row)
  }

  // Fresh means new: what was on the last days' lists is left out.
  const recent = await ctx.db.collection(FRESH_COLLECTION)
    .find({ at: { $gte: new Date(now.getTime() - FRESH_MEMORY_DAYS * 86_400_000) }, _id: { $ne: day } } as Document, { projection: { videoIds: 1 } })
    .toArray().catch(() => [] as Document[])
  const before = new Set(recent.flatMap((doc) => (doc.videoIds ?? []) as string[]))

  // Each candidate's earlier counts: ours, or the one stored when the video came in.
  const history = new Map<string, ViewSample[]>()
  for (let start = 0; start < ids.length; start += 1000) {
    const docs = await ctx.db.collection(FRESH_VIEWS).find({ _id: { $in: ids.slice(start, start + 1000) } } as Document, { projection: { samples: 1 } }).toArray().catch(() => [] as Document[])
    for (const doc of docs) history.set(String(doc._id), ((doc.samples ?? []) as Array<{ at: Date; views: number }>).map((sample) => ({ at: new Date(sample.at).getTime(), views: sample.views })))
  }
  const daily = new Map<string, number>()
  for (const id of ids) {
    const views = viewsNow.get(id)
    if (views === undefined) continue
    const samples = [...(history.get(id) ?? [])]
    const row = rows.get(id)
    if (row?.statsObservedAt && typeof row.viewCount === 'number') samples.push({ at: new Date(row.statsObservedAt).getTime(), views: row.viewCount })
    const gained = dailyViews(samples, views, now.getTime())
    if (gained !== null) daily.set(id, gained)
  }
  const measured = daily.size >= ENOUGH_MEASURED
  ctx.log(`vues du jour mesurées pour ${daily.size} vidéos sur ${ids.length}${measured ? '' : ' : trop peu, l_ordre des tendances décide encore'}`)
  // Ranked by the day's views, each country's first come first; unmeasured ones wait for tomorrow.
  const ranked = measured
    ? rankByDaily(found.filter((entry) => daily.has(entry.raw.videoId)).map((entry) => ({ ...entry, daily: daily.get(entry.raw.videoId)! })))
    : found.map((entry) => ({ ...entry, daily: entry.raw.viewCount ?? 0 }))

  let news = 0
  const byBucket = new Map<FreshBucket, FreshEntry[]>()
  for (const entry of ranked) {
    const row = rows.get(entry.raw.videoId)
    if (!row || row.isSuppressed === true || row.obsoleteVideoStatus === 'obsolete' || before.has(entry.raw.videoId)) continue
    const title = String(row.title ?? '')
    if (junkKind(title) || miniSeriesVerdict({ title, aspectRatio: row.aspectRatio, duration: row.duration }) || isAiMade(row.channelTitle, title)) continue
    if (!isFreshFormat({ channelTitle: row.channelTitle, duration: row.duration, universe: row.v3?.universe })) continue
    byBucket.set(entry.bucket, [...(byBucket.get(entry.bucket) ?? []), {
      id: String(row._id), videoId: entry.raw.videoId, bucket: entry.bucket, rank: entry.rank, region: entry.region,
      views: entry.daily, channel: row.channelId ? String(row.channelId) : undefined,
      family: row.v3?.nearFamily ? String(row.v3.nearFamily) : undefined,
      universe: row.v3?.universe ? String(row.v3.universe) : undefined,
      ...(row.editorialRoutine === true || row.v3?.universe === 'news-society' || isNewsTitle(title) ? { news: true } : {}),
    } as FreshEntry & { news?: boolean }])
  }

  const taken = new Set<string>()
  const picked = new Map<FreshBucket, FreshEntry[]>()
  for (const plan of FRESH_PLAN) {
    // TV news: one or two on the whole list, whichever zone brings them first.
    const pool = (byBucket.get(plan.bucket) ?? []).filter((entry) => {
      if (!(entry as FreshEntry & { news?: boolean }).news) return true
      if (news >= FRESH_NEWS_MAX || taken.has(entry.videoId)) return false
      news += 1
      return true
    })
    picked.set(plan.bucket, pickBucket(pool, plan, taken))
  }
  // Music and gaming kept to their share of the whole list, then the zones take turns.
  const capped = capForeignSketches(capUniverses(picked))
  const order = interleave(capped)
  const buckets = Object.fromEntries([...capped].map(([bucket, list]) => [bucket, list.length])) as Partial<Record<FreshBucket, number>>
  const label: Record<FreshBucket, string> = { world: 'monde', usa: 'USA', europe: 'Europe', asia: 'Asie', africa: 'Afrique', 'east-europe': 'Europe de l_Est', oceania: 'Océanie', music: 'musique', fun: 'fun',
    sport: 'sport', animals: 'animaux', science: 'sciences', howto: 'pratique', people: 'gens', autos: 'autos', film: 'films et animation' }
  const note = `frais du jour ${day} : ${order.length} vidéos (${FRESH_PLAN.map((plan) => `${label[plan.bucket]} ${buckets[plan.bucket] ?? 0}`).join(' · ')})${youtubeStopped ? ' · budget YouTube atteint' : ''}`
  ctx.log(note)

  // A day's list is never replaced by a smaller one: a late run with little to go on keeps the morning's.
  const existing = await ctx.db.collection(FRESH_COLLECTION).findOne({ _id: day } as Document, { projection: { total: 1 } }).catch(() => null)
  const keepExisting = Number(existing?.total ?? 0) > order.length
  if (keepExisting) ctx.log(`liste du jour gardée : ${existing?.total} vidéos contre ${order.length} cette fois`)
  if (!ctx.dryRun && order.length && !keepExisting) {
    await ctx.db.collection(FRESH_COLLECTION).replaceOne({ _id: day } as Document, {
      _id: day, at: now, ids: order.map((entry) => entry.id), videoIds: order.map((entry) => entry.videoId),
      buckets: order.map((entry) => entry.bucket), counts: buckets, total: order.length,
    } as Document, { upsert: true })
  }
  // Today's counts, kept a week, for tomorrow's views of the day.
  if (!ctx.dryRun && viewsNow.size) {
    const views = ctx.db.collection(FRESH_VIEWS)
    await views.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' }).catch(() => undefined)
    await views.createIndex({ lastCharted: 1 }, { name: 'last_charted' }).catch(() => undefined)
    const queriesOf = new Map<string, string[]>()
    for (const entry of found) if (!entry.stale && !remeasuredIds.has(entry.raw.videoId)) queriesOf.set(entry.raw.videoId, [...new Set([...(queriesOf.get(entry.raw.videoId) ?? []), ...(entry.raw.contextQueries ?? [])])])
    const operations = [...viewsNow].map(([id, count]) => ({
      updateOne: {
        filter: { _id: id } as Document,
        update: {
          $push: { samples: { $each: [{ at: now, views: count }], $slice: -4 } },
          $set: { expiresAt: new Date(now.getTime() + WEEK_MS), ...(queriesOf.has(id) ? { lastCharted: now } : {}) },
          ...(queriesOf.has(id) ? { $addToSet: { queries: { $each: queriesOf.get(id)! } } } : {}),
        } as Document,
        upsert: true,
      },
    }))
    for (let start = 0; start < operations.length; start += 500) await views.bulkWrite(operations.slice(start, start + 500), { ordered: false }).catch((error) => errors.push(`relevés de vues : ${message(error)}`))
  }
  if (warnings.length) ctx.log(`avertissements : ${warnings.slice(0, 5).map((warning) => warning.message).join(' | ')}`)
  return { counters, errors, cursor: { day, total: order.length, buckets, note } satisfies FreshCursorNote }
}
