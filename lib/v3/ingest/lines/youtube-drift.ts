/**
 * 12 October: stopped in the morning — the channels of anything brought 43 % Shorts — then back in the evening with a
 * mix (the owner: "YouTube ne va servir qu'à mes likes ??? … pas d'extrême, un bon mélange"): five videos a channel,
 * Shorts kept to 15 % of what it lets in and the little videos of Brazil and South and Southeast Asia to 6 % each
 * (lib/v3/ingest/mix.ts). The likes have their own YouTube searches (lib/v3/ingest/lines/lookalike.ts).
 *
 * The YouTube drift: the channels of the YouTube videos the base already took
 * — found by the dig's searches, the look-alikes, the charts, the likes — and
 * a few of each one's latest uploads, as the Dailymotion drift does with the
 * small uploaders it meets.
 *
 * Why (11 October): YouTube's own counter showed 1,900 to 4,200 units used a
 * day out of 10,000, and 55 searches out of 100. The searches find new
 * channels (the dig); reading a channel costs two units for fifty videos — a
 * page of its uploads, then the details of what the base does not hold. The
 * owner: "il faut utiliser tout le quota chaque jour… surtout pour
 * l'ingestion". This line spends the units the searches leave.
 *
 * The same doors as the drift: its own (a clean title, no AI mark, no live, no
 * celebrity news), the week's cap per channel (twenty), the media windows (a
 * house of ten thousand videos gives only what is of the moment or of another
 * time), what YouTube will not embed left out by the details, then the common
 * door. A channel is read again a fortnight later at the earliest.
 */

import { type Document } from 'mongodb'

import { newGuardState, underWeeklyCap, withoutMedia } from '../../dig/guards'
import type { DigVideo } from '../../dig/video'
import { LIST_UNITS, playlistPage, videoDetails } from '../../dig/youtube'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'
import { driftDoor } from './drift'
import { Mix } from '../mix'

/** Channels read in one run at most; the units and the minutes stop it first. */
export const CHANNELS_PER_RUN = Number(process.env.RANDOM_YT_DRIFT_CHANNELS ?? 800)
/**
 * Of a channel's latest fifty uploads, those not in the base, at random, this many. A dry run of 120 channels (11 October)
 * read 2,296 new videos and would have let in about sixteen a channel at twenty: at YouTube's full 10,000 units that is
 * some thirty thousand videos a day, more than the small base can hold for long (4.8 GB of 24 on its disk, ~2.3 KB a
 * video). Five a channel since 12 October, so that no channel weighs, and the day's units set the pace
 * (scripts/v3/youtube-drift-direct.ts).
 */
export const VIDEOS_PER_CHANNEL = 5
/**
 * Where the seeds come from: the YouTube videos that entered these last days. 6,000 rows gave 1,584 channels not read this
 * fortnight on 13 October, two runs' worth; 20,000 gave 6,542, enough for the day's 6,000 units (read in about 5 s).
 */
const SEED_DAYS = 10
const SEED_ROWS = 20_000
/** A channel read is left alone this long. */
export const REVISIT_DAYS = 14
const SEEN = 'yt_drift_channels_v4'
/** Channels read before their videos go through the doors together: one admission, one week's count, one media check per batch. */
const BATCH_CHANNELS = 10
const DEADLINE_MARGIN_MS = 45_000
const DAY_MS = 86_400_000
const YOUTUBE_CHANNEL = /^UC[\w-]{22}$/

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export type YouTubeDriftCursor = { channels: number; note: string }
export type Seed = { channelId: string; title?: string }

export function shuffle<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[out[index], out[other]] = [out[other], out[index]]
  }
  return out
}

/** The uploads playlist YouTube keeps for a channel. */
export const uploadsOf = (channelId: string): string | null => (YOUTUBE_CHANNEL.test(channelId) ? `UU${channelId.slice(2)}` : null)

/** The channels of the YouTube videos that entered these last days, not read this fortnight, in random order. */
async function seeds(ctx: LineContext, random: () => number): Promise<Seed[]> {
  const items = ctx.db.collection('items')
  const { ObjectId } = await import('mongodb')
  const since = ObjectId.createFromTime(Math.floor((Date.now() - SEED_DAYS * DAY_MS) / 1000))
  const rows = await items.find({ type: 'video', _id: { $gte: since }, provider: 'youtube', isSuppressed: { $ne: true } } as Document, { projection: { channelId: 1, channelTitle: 1 }, hint: 'idx_image_scan_by_type_id', sort: { _id: -1 }, limit: SEED_ROWS, maxTimeMS: 60_000 }).toArray()
  const byChannel = new Map<string, Seed>()
  for (const row of rows) {
    const channelId = typeof row.channelId === 'string' ? row.channelId : ''
    if (YOUTUBE_CHANNEL.test(channelId) && !byChannel.has(channelId)) byChannel.set(channelId, { channelId, ...(typeof row.channelTitle === 'string' ? { title: row.channelTitle } : {}) })
  }
  const ids = [...byChannel.keys()]
  const recent = new Set<string>()
  for (let at = 0; at < ids.length; at += 1000) {
    const seen = await ctx.db.collection(SEEN).find({ _id: { $in: ids.slice(at, at + 1000) }, at: { $gte: new Date(Date.now() - REVISIT_DAYS * DAY_MS) } } as Document, { projection: { _id: 1 }, maxTimeMS: 30_000 }).toArray()
    for (const row of seen) recent.add(String(row._id))
  }
  return shuffle([...byChannel.values()].filter((seed) => !recent.has(seed.channelId)), random)
}

/** The video ids among these the base already holds. */
async function known(ctx: LineContext, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await ctx.db.collection('items').find({ videoId: { $in: [...new Set(ids)] } } as Document, { projection: { videoId: 1 }, hint: 'video_id_lookup', maxTimeMS: 10_000 }).toArray().catch(() => [] as Document[])
  return new Set(rows.map((row) => String(row.videoId)))
}

export async function run(ctx: LineContext, deps: { youtubeKey?: string; random?: () => number; seeds?: Seed[] } = {}): Promise<LineResult> {
  const key = deps.youtubeKey ?? (process.env.YOUTUBE_API_KEY || '').trim()
  const random = deps.random ?? Math.random
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const guards = newGuardState()
  const cursor: YouTubeDriftCursor = { channels: 0, note: '' }
  if (!key) { cursor.note = 'pas de clé YouTube'; return { counters, cursor, errors: ['pas de clé YouTube'] } }

  const queue = deps.seeds ?? await seeds(ctx, random).catch((error) => { errors.push(`graines : ${message(error)}`); return [] as Seed[] })
  let units = 0, read = 0, stopped = false
  const refused: Record<string, number> = {}
  const add = (why: string, count: number) => { if (count) refused[why] = (refused[why] ?? 0) + count }
  const mix = new Mix()

  // Through the doors together, a batch of channels at a time.
  let batch: DigVideo[] = []
  let batchChannels: string[] = []
  const flush = async (): Promise<void> => {
    const videos = batch
    const channels = batchChannels
    batch = []
    batchChannels = []
    if (!ctx.dryRun && channels.length) {
      const at = new Date()
      await ctx.db.collection<{ _id: string; at: Date }>(SEEN).bulkWrite(channels.map((channelId) => ({ updateOne: { filter: { _id: channelId }, update: { $set: { at } }, upsert: true } })), { ordered: false }).catch((error) => { errors.push(`chaînes lues : ${message(error)}`) })
    }
    if (!videos.length) return
    const door = driftDoor(videos)
    for (const [why, count] of Object.entries(door.refused)) add(why, count)
    const weekly = await underWeeklyCap(ctx, guards, door.kept, 'youtube', new Set())
    add('chaîne cette semaine', weekly.refused)
    const media = await withoutMedia(ctx, guards, key, weekly.kept, 'youtube', new Set())
    add('média', media.refused)
    // The mix: Shorts and the little videos of a few places keep their share of what this run lets in.
    const mixed = media.kept.filter((video) => mix.accepts({ title: video.title, seconds: video.seconds }))
    add('au-delà de sa part (Shorts ou pays)', media.kept.length - mixed.length)
    if (!mixed.length) return
    const result = await ctx.admit({ subjectId: 'youtube-drift', videos: mixed })
    addAdmission(counters, { ...result, scanned: 0, rejected: result.rejected })
    counters.byProvider = { ...(counters.byProvider ?? {}), youtube: ((counters.byProvider ?? {}).youtube ?? 0) + result.inserted }
  }

  for (const seed of queue.slice(0, CHANNELS_PER_RUN)) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { errors.push('échéance atteinte'); break }
    const playlist = uploadsOf(seed.channelId)
    if (!playlist) continue
    if (!(await ctx.quota.reserve(LIST_UNITS))) { stopped = true; break }
    units += LIST_UNITS
    let ids: string[] = []
    try { ids = (await playlistPage(key, playlist, undefined, http)).ids } catch (error) { if (/HTTP 403|HTTP 429/.test(message(error))) { stopped = true; errors.push(`youtube : ${message(error).slice(0, 80)}`); break } add('chaîne illisible', 1) }
    cursor.channels += 1
    batchChannels.push(seed.channelId)
    const held = await known(ctx, ids)
    counters.duplicates += held.size
    const wanted = shuffle(ids.filter((id) => !held.has(id)), random).slice(0, VIDEOS_PER_CHANNEL)
    if (wanted.length) {
      if (!(await ctx.quota.reserve(LIST_UNITS))) { stopped = true; break }
      units += LIST_UNITS
      try {
        const videos = await videoDetails(key, wanted, http)
        read += videos.length
        add('privée ou non intégrable', wanted.length - videos.length)
        batch.push(...videos)
      } catch (error) { if (/HTTP 403|HTTP 429/.test(message(error))) { stopped = true; errors.push(`youtube : ${message(error).slice(0, 80)}`); break } errors.push(`détails : ${message(error).slice(0, 80)}`) }
    }
    if (batchChannels.length >= BATCH_CHANNELS) await flush()
  }
  await flush()
  // The run's units spent is its normal end, not an error; YouTube's own refusal (403, 429) is one, written above.
  const spentAll = stopped && !errors.some((error) => error.startsWith('youtube :'))

  counters.scanned = read
  for (const [why, count] of Object.entries(refused)) counters.rejected[why] = (counters.rejected[why] ?? 0) + count
  await ctx.search({ provider: 'youtube', query: `dérive YouTube : ${cursor.channels} chaînes`, scanned: read, kept: counters.inserted, inserted: counters.inserted, duplicates: counters.duplicates, rejected: refused, quotaUnits: units, insertedIds: [] }).catch(() => undefined)
  cursor.note = `${cursor.channels} chaînes lues · ${units} unités · ${read} vidéos nouvelles lues · ${counters.inserted} entrées${spentAll ? ' · unités du passage dépensées' : ''}`
  ctx.log(`dérive YouTube : ${cursor.note}`)
  return { counters, cursor, errors }
}
