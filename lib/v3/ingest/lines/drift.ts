/**
 * The drift: browsing Dailymotion the way the owner does, by hand, in five
 * minutes — from one video to the ones the site relates to it, to the
 * uploader's other videos, to theirs — and finding what no search by name
 * can: a Japanese commercial of 1988 titled in Japanese, a Russian home
 * video of 2014, a Czech film of 1972 (1 October: "je comprends pas pourquoi
 * notre mécanisme n'arrive pas à ingérer ce genre de petits trucs").
 *
 * The dig searches by name, takes the most viewed, in English: it finds the
 * media and the compilations. The drift searches nothing: it starts from
 * seeds — the owner's likes on Dailymotion, what the dig's weird themes and
 * likes brought in, a few searches sorted at random among uploads of years
 * ago — and follows Dailymotion's own "related" for two hops, reading whole
 * the small uploaders it meets (a person, not a house: `SMALL_UPLOADER`
 * videos at most). No name to match: the common door only (ads, serials,
 * AI, duplicates), the week's cap per channel, the media windows, the
 * title's cleanliness, and the player's own word that the video plays.
 * Everything is free on Dailymotion; the line is bounded by time and count.
 */

import { ObjectId, type Document } from 'mongodb'

import { isCleanTitle } from '../../cool/clean'
import { loadLikePool } from '../../cool/likePool'
import { isAiMarked } from '../../cool/themes'
import { playable, relatedDailymotion, searchDailymotion, uploaderVideos } from '../../dig/dailymotion'
import { isCelebrityNews, isLetsPlay, isStillAlbum, MAX_LETS_PLAYS } from '../../dig/door'
import { newGuardState, underWeeklyCap, withoutMedia } from '../../dig/guards'
import { readThemes } from '../../dig/themes'
import type { DigVideo } from '../../dig/video'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'

/** An uploader with this many videos at most is a person; past it, the uploader is read like a channel met by the dig (two videos a pass). */
export const SMALL_UPLOADER = Number(process.env.RANDOM_DRIFT_SMALL_UPLOADER ?? 2000)
/** Uploaders read whole in one run, and how many of their videos. */
export const UPLOADERS_PER_RUN = Number(process.env.RANDOM_DRIFT_UPLOADERS ?? 15)
const UPLOADER_VIDEOS = 100
/** Seeds a run starts from, and how far it drifts from each. */
export const SEEDS_PER_RUN = Number(process.env.RANDOM_DRIFT_SEEDS ?? 40)
const HOPS = 2
const RELATED_PER_HOP = 20
/** Searches sorted at random among old uploads, on the dig's theme words: seeds from nowhere. */
const RANDOM_SEARCHES = 6
const OLD_UPLOADS_YEARS = 8
/** What a run may bring in; the time limit is the context's. */
export const MAX_INSERTS = Number(process.env.RANDOM_DRIFT_MAX ?? 2000)
const MAX_PLAYABLE_CHECKS = 600
const DEADLINE_MARGIN_MS = 20_000
const SPACING_MS = 250
const STILL_ALBUMS_PER_BATCH = 1

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type DriftCursor = { seeds: number; related: number; uploaders: number; note: string }

/** The video id as Dailymotion names it, from what the catalogue stores. */
const dailymotionId = (videoId: unknown): string | null => {
  const id = String(videoId ?? '').replace(/^dailymotion:/, '')
  return /^[a-z0-9]{5,8}$/i.test(id) ? id : null
}

/**
 * What a run starts from: the owner's likes on Dailymotion, the dig's weird
 * themes and likes there, and a few random old searches. Shuffled; the
 * count is the setting's.
 */
export async function seeds(ctx: LineContext, random: () => number = Math.random): Promise<Array<{ id: string; from: string }>> {
  const items = ctx.db.collection('items')
  const out: Array<{ id: string; from: string }> = []
  const pool = await loadLikePool(ctx.db).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const likeIds = pool.likeIds.filter((id) => ObjectId.isValid(id)).slice(0, 200).map((id) => new ObjectId(id))
  if (likeIds.length) {
    const liked = await items.find({ _id: { $in: likeIds }, type: 'video', provider: 'dailymotion' } as Document, { projection: { videoId: 1 }, maxTimeMS: 4000 }).toArray().catch(() => [] as Document[])
    for (const row of liked) { const id = dailymotionId(row.videoId); if (id) out.push({ id, from: 'like' }) }
  }
  const point = random()
  const dug = await items.find({ 'v3.line': 'dig', type: 'video', provider: 'dailymotion', rand: { $gte: point } } as Document, { projection: { videoId: 1, 'v3.dig.base': 1 }, sort: { rand: 1 }, limit: 120, hint: 'v3_line_type_rand', maxTimeMS: 4000 }).toArray().catch(() => [] as Document[])
  for (const row of dug) {
    const base = (row.v3 as { dig?: { base?: string } } | undefined)?.dig?.base
    const id = dailymotionId(row.videoId)
    if (id && (base === 'keywords' || base === 'likes')) out.push({ id, from: `dig:${base}` })
  }
  return shuffle(out, random).slice(0, SEEDS_PER_RUN)
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const out = [...list]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[out[index], out[other]] = [out[other], out[index]]
  }
  return out
}

/** The drift's own door, before the common one: a clean title, no AI mark, no live, no celebrity news, one still album and two let's plays a batch — the subject door's rules that need no subject. */
export function driftDoor(videos: DigVideo[]): { kept: DigVideo[]; refused: Record<string, number> } {
  const refused: Record<string, number> = {}
  const refuse = (why: string) => { refused[why] = (refused[why] ?? 0) + 1 }
  let stills = 0
  let letsPlays = 0
  const kept: DigVideo[] = []
  for (const video of videos) {
    if (!isCleanTitle(video.title)) { refuse('titre'); continue }
    if (video.live) { refuse('direct'); continue }
    if (isAiMarked(`${video.title} ${video.channelTitle ?? ''} ${(video.description ?? '').slice(0, 1500)}`)) { refuse('IA'); continue }
    if (isCelebrityNews(video.title)) { refuse('actu people'); continue }
    if (isStillAlbum({ title: video.title, channelTitle: video.channelTitle })) { if (stills >= STILL_ALBUMS_PER_BATCH) { refuse('album sans image'); continue } stills += 1 }
    if (isLetsPlay(video.title)) { if (letsPlays >= MAX_LETS_PLAYS) { refuse("let's play"); continue } letsPlays += 1 }
    kept.push(video)
  }
  return { kept, refused }
}

export async function run(ctx: LineContext): Promise<LineResult> {
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const guards = newGuardState()
  const visited = new Set<string>()
  const uploadersRead = new Set<string>()
  let related = 0, uploaders = 0, checks = 0
  const cursor: DriftCursor = { seeds: 0, related: 0, uploaders: 0, note: '' }

  /** One batch through the drift's door, the guards, the player's word, then the common door; returns what got in, for the next hop. */
  const admit = async (videos: DigVideo[], query: string, own: ReadonlySet<string> = new Set()): Promise<DigVideo[]> => {
    const fresh = videos.filter((video) => !visited.has(video.videoId))
    for (const video of fresh) visited.add(video.videoId)
    if (!fresh.length) return []
    const door = driftDoor(fresh)
    // A small uploader read whole is a person, not an outlet: the week's cap is for the houses (the dry run of 2 October refused 439 of a person's videos).
    const weekly = await underWeeklyCap(ctx, guards, door.kept, 'dailymotion', own)
    if (weekly.refused) door.refused['chaîne cette semaine'] = weekly.refused
    const media = await withoutMedia(ctx, guards, '', weekly.kept, 'dailymotion', own)
    if (media.refused) door.refused['média'] = media.refused
    const checked: DigVideo[] = []
    for (const video of media.kept) {
      if (checks >= MAX_PLAYABLE_CHECKS) { checked.push(video); continue }
      checks += 1
      if (await playable(video.videoId, http)) checked.push(video); else door.refused['ne se lit pas'] = (door.refused['ne se lit pas'] ?? 0) + 1
    }
    const result = await ctx.admit({ subjectId: `drift:${query}`, videos: checked })
    addAdmission(counters, { ...result, scanned: videos.length, rejected: { ...result.rejected, ...door.refused } })
    counters.byProvider = { ...(counters.byProvider ?? {}), dailymotion: ((counters.byProvider ?? {}).dailymotion ?? 0) + result.inserted }
    await ctx.search({ provider: 'dailymotion', query, scanned: videos.length, kept: checked.length, inserted: result.inserted, duplicates: result.duplicates, rejected: { ...result.rejected, ...door.refused }, quotaUnits: 0, insertedIds: result.insertedIds }).catch(() => undefined)
    // What got through, new or already known: a known video is a good one, and its neighbours are worth the walk too (the first live runs walked nothing: the ids the admission returns are not the videos').
    return checked
  }

  /** A small uploader met on the way is read whole, once. */
  const readUploader = async (video: DigVideo): Promise<void> => {
    const owner = video.channelId
    if (!owner || uploadersRead.has(owner) || uploadersRead.size >= UPLOADERS_PER_RUN) return
    if (typeof video.channelVideos !== 'number' || video.channelVideos > SMALL_UPLOADER) return
    uploadersRead.add(owner)
    uploaders += 1
    try {
      const videos = await uploaderVideos(owner, http, undefined, UPLOADER_VIDEOS)
      await admit(videos, `uploader ${video.channelTitle ?? owner}`, new Set([owner]))
    } catch (error) { errors.push(`uploader ${video.channelTitle ?? owner} : ${message(error)}`) }
    await wait(SPACING_MS)
  }

  // Seeds from nowhere: the dig's theme words, sorted at random among uploads of years ago.
  const themes = (() => { try { return readThemes() } catch { return [] } })()
  const before = new Date(Date.now() - OLD_UPLOADS_YEARS * 365.25 * 86_400_000)
  const fromNowhere: DigVideo[] = []
  for (const theme of shuffle(themes, Math.random).slice(0, RANDOM_SEARCHES)) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
    try {
      const found = await searchDailymotion(theme.en, 'random', http, undefined, 30, before)
      fromNowhere.push(...await admit(found, `random "${theme.en}" avant ${before.getFullYear()}`))
    } catch (error) { errors.push(`random "${theme.en}" : ${message(error)}`) }
    await wait(SPACING_MS)
  }

  const starts = await seeds(ctx).catch((error) => { errors.push(`graines : ${message(error)}`); return [] as Array<{ id: string; from: string }> })
  const queue: Array<{ id: string; hop: number; from: string }> = [
    ...starts.map((seed) => ({ id: seed.id, hop: 1, from: seed.from })),
    ...fromNowhere.slice(0, 10).map((video) => ({ id: video.videoId.replace(/^dailymotion:/, ''), hop: 1, from: 'random' })),
  ]
  cursor.seeds = queue.length
  ctx.log(`dérive : ${starts.length} graines (${[...new Set(starts.map((seed) => seed.from))].join(', ')}), ${fromNowhere.length} venues de nulle part`)

  while (queue.length) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { errors.push('échéance atteinte'); break }
    if (counters.inserted >= MAX_INSERTS) break
    const next = queue.shift()!
    let neighbours: DigVideo[] = []
    try { neighbours = await relatedDailymotion(next.id, http, undefined, RELATED_PER_HOP) } catch (error) { errors.push(`liées de ${next.id} : ${message(error)}`); continue }
    related += neighbours.length
    const got = await admit(neighbours, `liées de ${next.id} (${next.from}, saut ${next.hop})`)
    for (const video of got) {
      await readUploader(video)
      if (next.hop < HOPS) queue.push({ id: video.videoId.replace(/^dailymotion:/, ''), hop: next.hop + 1, from: next.from })
    }
    await wait(SPACING_MS)
  }

  cursor.related = related
  cursor.uploaders = uploaders
  cursor.note = `${cursor.seeds} graines · ${related} liées lues · ${uploaders} petits uploaders · ${counters.inserted} vidéos entrées`
  ctx.log(`dérive : ${cursor.note}`)
  return { counters, cursor, errors }
}
