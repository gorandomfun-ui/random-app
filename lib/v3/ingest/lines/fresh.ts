/**
 * The fresh-of-the-day line, at 06:00 Paris: the charts of the moment, zone
 * by zone (see `lib/v3/fresh/plan.ts`), a thousand videos in all. Every one
 * goes through the usual door — serials, ads and TV news refused — and the
 * ones already stored are simply referenced. What remains is ordered for
 * variety and kept as the day's list, one small document; the draw opens each
 * session on ten of it. The videos themselves are ordinary trends, filed in
 * their universes like any other: tomorrow nothing has to be undone.
 */

import type { Document } from 'mongodb'

import { fetchYouTubeChart, type RawVideo } from '@/lib/ingest/videos'
import { junkKind } from '@/lib/ingest/junk'
import { miniSeriesVerdict } from '@/lib/ingest/miniSeries'
import { FRESH_MEMORY_DAYS, FRESH_NEWS_MAX, FRESH_PLAN, interleave, pickBucket, type FreshBucket, type FreshEntry } from '../../fresh/plan'
import { searchDailymotion } from '../../trend/dig'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'

export const FRESH_COLLECTION = 'fresh_daily_v1'
const ADMIT_CHUNK = 100
const WEEK_MS = 7 * 86_400_000

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const parisDay = (date: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

type Found = { raw: RawVideo; bucket: FreshBucket; rank: number; region: string }

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

  // Through the door, once each. What is already stored is not written again.
  const unique = [...new Map(found.map((entry) => [entry.raw.videoId, entry.raw])).values()]
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
  const ids = unique.map((raw) => raw.videoId)
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = await ctx.db.collection('items').find(
      { type: 'video', videoId: { $in: ids.slice(start, start + 500) } } as Document,
      { projection: { videoId: 1, title: 1, isSuppressed: 1, editorialRoutine: 1, obsoleteVideoStatus: 1, channelId: 1, aspectRatio: 1, duration: 1, 'v3.universe': 1, 'v3.nearFamily': 1 }, hint: 'video_id_lookup' },
    ).toArray().catch(() => [] as Document[])
    for (const row of chunk) rows.set(String(row.videoId), row)
  }

  // Fresh means new: what was on the last days' lists is left out.
  const recent = await ctx.db.collection(FRESH_COLLECTION)
    .find({ at: { $gte: new Date(now.getTime() - FRESH_MEMORY_DAYS * 86_400_000) }, _id: { $ne: day } } as Document, { projection: { videoIds: 1 } })
    .toArray().catch(() => [] as Document[])
  const before = new Set(recent.flatMap((doc) => (doc.videoIds ?? []) as string[]))

  let news = 0
  const byBucket = new Map<FreshBucket, FreshEntry[]>()
  for (const entry of found) {
    const row = rows.get(entry.raw.videoId)
    if (!row || row.isSuppressed === true || row.obsoleteVideoStatus === 'obsolete' || before.has(entry.raw.videoId)) continue
    const title = String(row.title ?? '')
    if (junkKind(title) || miniSeriesVerdict({ title, aspectRatio: row.aspectRatio, duration: row.duration })) continue
    byBucket.set(entry.bucket, [...(byBucket.get(entry.bucket) ?? []), {
      id: String(row._id), videoId: entry.raw.videoId, bucket: entry.bucket, rank: entry.rank, region: entry.region,
      views: entry.raw.viewCount ?? 0, channel: row.channelId ? String(row.channelId) : undefined,
      family: row.v3?.nearFamily ? String(row.v3.nearFamily) : undefined,
      universe: row.v3?.universe ? String(row.v3.universe) : undefined,
      ...(row.editorialRoutine === true || row.v3?.universe === 'news-society' ? { news: true } : {}),
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
  const order = interleave(picked)
  const buckets = Object.fromEntries([...picked].map(([bucket, list]) => [bucket, list.length])) as Partial<Record<FreshBucket, number>>
  const label: Record<FreshBucket, string> = { world: 'monde', usa: 'USA', europe: 'Europe', asia: 'Asie', africa: 'Afrique', 'east-europe': 'Europe de l_Est', oceania: 'Océanie', music: 'musique', fun: 'fun' }
  const note = `frais du jour ${day} : ${order.length} vidéos (${FRESH_PLAN.map((plan) => `${label[plan.bucket]} ${buckets[plan.bucket] ?? 0}`).join(' · ')})${youtubeStopped ? ' · budget YouTube atteint' : ''}`
  ctx.log(note)

  if (!ctx.dryRun && order.length) {
    await ctx.db.collection(FRESH_COLLECTION).replaceOne({ _id: day } as Document, {
      _id: day, at: now, ids: order.map((entry) => entry.id), videoIds: order.map((entry) => entry.videoId),
      buckets: order.map((entry) => entry.bucket), counts: buckets, total: order.length,
    } as Document, { upsert: true })
  }
  if (warnings.length) ctx.log(`avertissements : ${warnings.slice(0, 5).map((warning) => warning.message).join(' | ')}`)
  return { counters, errors, cursor: { day, total: order.length, buckets, note } satisfies FreshCursorNote }
}
