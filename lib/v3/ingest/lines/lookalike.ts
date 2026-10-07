/**
 * The look-alikes: videos that resemble one of the owner's likes.
 *
 * The likes base digs the names a like carries and brings back the name, not
 * the kind of video: a Spaniard amazed by Maradona singing tango gave a stencil
 * painting of Maradona (5 October, 114 videos a day, no closer to a like than
 * chance). This line looks for the kind of video instead, and lets the little
 * AI judge. Measured on 5 October, fingerprints of what each way finds compared
 * like by like (lib/v3/ai/likeness.ts): Dailymotion's related videos from the
 * drift's random seeds, 4 % close to a like; related videos of the owner's own
 * Dailymotion likes, 18 %; Dailymotion searches with a like's own words, 28 %.
 *
 * Words alone were refused on 1 October ("The Walk" caught anything called The
 * Walk): here the fingerprint is the door. A like gives up to twenty searches —
 * what its title says it is, its telling words, its first words, its tags, its
 * channel, and the first words of the base's videos the AI already found
 * nearest to it — by relevance, one page deeper at each visit; its neighbours
 * when it lives on Dailymotion; and the neighbours of the look-alikes already
 * found, each read once (`v3.lookalike.spread`): the likes are the start, the
 * finds carry on. The videos the base does not hold, and the model has not
 * judged these three weeks, go through the drift's door, then the model, and
 * only those as close to a like as the stock's top 7 %, and no copy of it, go
 * on to the common checks (the week's cap per channel, the media windows, the
 * player's word, the common door). Free (Dailymotion, the server's own model),
 * in its own windows (server/run-line.sh, lookalike) and in the minutes the
 * fingerprints' line leaves (server/vec-window.sh). What gets in carries its
 * fingerprint and the like it resembles (`v3.lookalike`), which is also the
 * pool the taste card draws from (lib/discovery/wheel.ts).
 *
 * The first day (5–6 October) gave 44 in a day: thirty-nine minutes after the
 * fingerprints, and the second visit of each like sorted at random. The model
 * judges 8,000 videos an hour at most, seven in a hundred near a like: the
 * minutes are the volume.
 */

import { ObjectId, type AnyBulkWriteOperation, type Document } from 'mongodb'

import { alike, fromRow, textOf, toBinary } from '../../ai/bits'
import { LIKE_COPY, NEAR_LIKE, nearestLike, nearestLikeInScript, sameScript, saysEnough, mostlyCjk, type Likeness } from '../../ai/likeness'
import { LIKE_INDEX } from '../../ai/pool'
import { loadLikePool } from '../../cool/likePool'
import { playable, relatedDailymotion, searchDailymotion } from '../../dig/dailymotion'
import { newGuardState, underWeeklyCap, withoutMedia } from '../../dig/guards'
import { practiceTheme, wordsTheme } from '../../dig/likes'
import type { DigVideo } from '../../dig/video'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'
import { driftDoor } from './drift'

export { mostlyCjk, saysEnough }

/** Likes visited a run at most: every like once; the window's minutes stop it first (the server reads about four likes a minute, 5 October). */
export const LIKES_PER_RUN = Number(process.env.RANDOM_LOOKALIKE_LIKES ?? 400)
const SEARCH_RESULTS = 50
/** Searches a like gives at most, and how many of them its tags and the nearest base videos' titles may take. */
export const QUERIES_PER_LIKE = 20
const TAG_QUERIES = 8
const NEAR_TITLE_QUERIES = 8
/** Pages of each search, by relevance, one deeper at each visit; past the last, the first again — the known and the judged cost the model nothing then. */
export const PAGES = 10
const RELATED = 20
/** Look-alikes already found around a like whose neighbours a visit reads, each once. */
const SPREAD_PER_VISIT = 5
const MAX_PLAYABLE_CHECKS = 600
const DEADLINE_MARGIN_MS = 45_000
const SPACING_MS = 250
/**
 * Another like than the one searched for must be this much nearer: in the first trial (5 October) a Japanese
 * children's show came close to a Japanese beer festival, the script more than the sense (0.71).
 */
const OTHER_LIKE = NEAR_LIKE + 0.05
/**
 * Titles written in Chinese, Japanese or Korean need a little more: the model reads the script as much as the
 * sense there (second trial, 5 October: a Japanese craft lesson came to a K-pop clip's search at 0.70).
 */
const CJK_EXTRA = 0.02
/** What one like may bring in a visit: the nearest first. */
export const MAX_PER_LIKE = 30
/** Where the rotation through the likes stands, between runs. */
const META = 'dig_meta_v4'
const CURSOR_ID = 'lookalike'
/** The videos the model read and found nothing alike, remembered three weeks: a search's second page is often another's first. */
export const SEEN = 'lookalike_seen_v4'
const SEEN_DAYS = 21

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export type LookalikeCursor = { next: number; visits: Record<string, number>; note: string }
export type LikeRow = { id: string; title: string; provider?: string; videoId?: string; bits: Uint8Array; tags?: string[]; channel?: string }
export type Prints = (texts: string[]) => Promise<Uint8Array[]>

const cleanTitle = (title: string): string => title.replace(/[#@][\p{L}\p{N}_]+/gu, ' ').replace(/[\[\](){}|•·:;!?¡¿"“”«»]+/g, ' ').replace(/\s+/g, ' ').trim()
const firstWords = (title: string, count = 5): string => cleanTitle(title).split(' ').filter((word) => /\p{L}/u.test(word)).slice(0, count).join(' ')

/**
 * The searches a like gives, without repeats: what its title says it is ("commercial 1994"), its telling words, its
 * first words; its tags, alone and the first two together; its channel when its name says something; the first words
 * of the base's videos found nearest to it (`near`). Twenty at most.
 */
export function likeQueries(like: { title: string; tags?: string[]; channel?: string }, near: readonly string[] = []): string[] {
  const out: string[] = []
  const add = (query: string | undefined, cap = QUERIES_PER_LIKE) => {
    const text = (query ?? '').replace(/\s+/g, ' ').trim()
    if (text.length >= 4 && /\p{L}/u.test(text) && out.length < cap && !out.some((known) => known.toLowerCase() === text.toLowerCase())) out.push(text)
  }
  add(practiceTheme(like.title)?.label)
  add(wordsTheme(like.title) ?? undefined)
  add(firstWords(like.title))
  const tags = (like.tags ?? []).map((tag) => tag.replace(/^[#@]/, '').replace(/[_-]+/g, ' ').trim()).filter((tag) => tag.length >= 4 && /\p{L}/u.test(tag))
  const before = out.length
  if (tags.length >= 2) add(`${tags[0]} ${tags[1]}`, before + TAG_QUERIES)
  for (const tag of tags) add(tag, before + TAG_QUERIES)
  if (like.channel && (like.channel.split(/\s+/).length >= 2 || (like.channel.match(/\p{L}/gu)?.length ?? 0) >= 6)) add(like.channel)
  const nearStart = out.length
  for (const title of near) if (saysEnough(title)) add(firstWords(title), nearStart + NEAR_TITLE_QUERIES)
  return out.slice(0, QUERIES_PER_LIKE)
}

/** The likes of a run, in a fixed order by id, from where the last run stopped. */
export function likesOfRun(likes: readonly LikeRow[], next: number, count = LIKES_PER_RUN): LikeRow[] {
  if (!likes.length) return []
  const sorted = [...likes].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return Array.from({ length: Math.min(count, sorted.length) }, (_, index) => sorted[(next + index) % sorted.length])
}

/**
 * Of the videos read for one like (`seed`, its index among the likes), those the AI finds near it — or much
 * nearer to another like, in the same script either way — and a copy of none, with the like each resembles; and
 * how many were copies.
 */
export function lookalikes(videos: readonly DigVideo[], prints: readonly Uint8Array[], likes: readonly LikeRow[], seed: number): { close: Array<{ video: DigVideo; bits: Uint8Array; likeness: Likeness }>; copies: number } {
  const likeBits = likes.map((like) => like.bits)
  const close: Array<{ video: DigVideo; bits: Uint8Array; likeness: Likeness }> = []
  let copies = 0
  videos.forEach((video, index) => {
    const bits = prints[index]
    if (!bits) return
    if (nearestLike(bits, likeBits).score >= LIKE_COPY) { copies += 1; return }
    const nearest = nearestLikeInScript(bits, video.title, likes)
    const extra = mostlyCjk(video.title) ? CJK_EXTRA : 0
    const own = seed >= 0 && seed < likes.length && sameScript(video.title, likes[seed].title) ? alike(bits, likeBits[seed]) : 0
    if (own >= NEAR_LIKE + extra) close.push({ video, bits, likeness: { score: own, index: seed } })
    else if (nearest.score >= OTHER_LIKE + extra) close.push({ video, bits, likeness: nearest })
  })
  return { close, copies }
}

/** The owner's liked videos that carry a fingerprint, with their tags and channel when the row holds them. */
async function loadLikes(ctx: LineContext): Promise<LikeRow[]> {
  const pool = await loadLikePool(ctx.db).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const ids = pool.likeIds.filter((id) => ObjectId.isValid(id)).slice(0, 400).map((id) => new ObjectId(id))
  if (!ids.length) return []
  const rows = await ctx.db.collection('items').find({ _id: { $in: ids }, type: 'video', vec: { $exists: true } } as Document, { projection: { title: 1, provider: 1, videoId: 1, vec: 1, apiTags: 1, channelTitle: 1 }, maxTimeMS: 4000 }).toArray()
  return rows.flatMap((row) => {
    const bits = fromRow(row.vec)
    return bits ? [{
      id: String(row._id), title: String(row.title ?? ''), provider: typeof row.provider === 'string' ? row.provider : undefined, videoId: typeof row.videoId === 'string' ? row.videoId : undefined, bits,
      ...(Array.isArray(row.apiTags) ? { tags: row.apiTags.map(String) } : {}), ...(typeof row.channelTitle === 'string' ? { channel: row.channelTitle } : {}),
    }] : []
  })
}

/** The video ids among these the base already holds: not worth the model's time. */
async function known(ctx: LineContext, videos: readonly DigVideo[]): Promise<Set<string>> {
  const ids = [...new Set(videos.map((video) => video.videoId))]
  if (!ids.length) return new Set()
  const rows = await ctx.db.collection('items').find({ videoId: { $in: ids } } as Document, { projection: { videoId: 1 }, hint: 'video_id_lookup', maxTimeMS: 4000 }).toArray().catch(() => [] as Document[])
  return new Set(rows.map((row) => String(row.videoId)))
}

/** The video ids among these the model judged these last weeks and found nothing alike. */
async function judged(ctx: LineContext, videos: readonly DigVideo[]): Promise<Set<string>> {
  const ids = [...new Set(videos.map((video) => video.videoId))]
  if (!ids.length) return new Set()
  const rows = await ctx.db.collection(SEEN).find({ _id: { $in: ids } } as Document, { projection: { _id: 1 }, maxTimeMS: 4000 }).toArray().catch(() => [] as Document[])
  return new Set(rows.map((row) => String(row._id)))
}

/** Remembers the videos the model found nothing alike, three weeks (the collection's own clock drops them). */
async function remember(ctx: LineContext, ids: readonly string[]): Promise<void> {
  if (ctx.dryRun || !ids.length) return
  const at = new Date()
  await ctx.db.collection<{ _id: string; at: Date }>(SEEN).bulkWrite(ids.map((id) => ({ insertOne: { document: { _id: id, at } } })), { ordered: false }).catch(() => undefined)
}
/** The three-week clock of the judged videos, set once per run (nothing happens when it is there). */
export async function ensureSeenClock(ctx: LineContext): Promise<void> {
  if (ctx.dryRun) return
  await ctx.db.collection(SEEN).createIndex({ at: 1 }, { expireAfterSeconds: SEEN_DAYS * 86_400, name: 'seen_ttl' }).catch(() => undefined)
}

/** The base's look-alikes of one like, the nearest first: their titles for the searches, and up to `spread` Dailymotion ones whose neighbours are still to read. */
async function foundAround(ctx: LineContext, like: LikeRow): Promise<{ titles: string[]; toSpread: Array<{ _id: ObjectId; videoId: string }> }> {
  const items = ctx.db.collection('items')
  const nearest = await items.find({ 'v3.lookalike.like': like.id } as Document, { projection: { title: 1 }, sort: { 'v3.lookalike.score': -1 }, limit: NEAR_TITLE_QUERIES, hint: LIKE_INDEX, maxTimeMS: 4000 }).toArray().catch(() => [] as Document[])
  const toSpread = await items.find({ 'v3.lookalike.like': like.id, provider: 'dailymotion', 'v3.lookalike.spread': { $exists: false } } as Document, { projection: { videoId: 1 }, sort: { 'v3.lookalike.score': -1 }, limit: SPREAD_PER_VISIT, hint: LIKE_INDEX, maxTimeMS: 4000 }).toArray().catch(() => [] as Document[])
  return { titles: nearest.map((row) => String(row.title ?? '')), toSpread: toSpread.flatMap((row) => (typeof row.videoId === 'string' ? [{ _id: row._id as ObjectId, videoId: row.videoId }] : [])) }
}

/** `prints`: the model (lib/v3/ai/fingerprint.ts); `likes`: the owner's printed likes, read from the like pool unless a test gives them. */
export async function run(ctx: LineContext, deps: { prints: Prints; likes?: (ctx: LineContext) => Promise<LikeRow[]> }): Promise<LineResult> {
  const prints = deps.prints
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const guards = newGuardState()
  const meta = ctx.db.collection(META)
  const previous = (ctx.cursor ?? await meta.findOne({ _id: CURSOR_ID } as Document, { maxTimeMS: 4000 }).catch(() => null) ?? {}) as Partial<LookalikeCursor>
  const cursor: LookalikeCursor = { next: Number(previous.next ?? 0) || 0, visits: { ...(previous.visits ?? {}) }, note: '' }
  const visited = new Set<string>()
  const titles = new Set<string>()
  let read = 0, fingerprinted = 0, near = 0, copies = 0, checks = 0, likesDone = 0, searches = 0, spread = 0

  const likes = await (deps.likes ?? loadLikes)(ctx).catch((error) => { errors.push(`likes : ${message(error)}`); return [] as LikeRow[] })
  const likeVideoIds = new Set(likes.map((like) => like.videoId).filter((id): id is string => Boolean(id)))
  if (!likes.length) { cursor.note = 'aucun like avec empreinte'; return { counters, cursor, errors } }
  await ensureSeenClock(ctx)

  for (const like of likesOfRun(likes, cursor.next)) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { errors.push('échéance atteinte'); break }
    // A like whose title says nothing ("ANIMATION vidéo", "#tgiks") would only search for noise.
    if (!saysEnough(like.title)) { cursor.next += 1; continue }
    const visit = cursor.visits[like.id] ?? 0
    const page = (visit % PAGES) + 1
    const around = await foundAround(ctx, like)
    const queries = likeQueries(like, around.titles)
    const found: DigVideo[] = []
    for (const query of queries) {
      if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
      try { found.push(...await searchDailymotion(query, 'relevance', http, undefined, SEARCH_RESULTS, undefined, page)); searches += 1 } catch (error) { errors.push(`recherche "${query}" : ${message(error)}`) }
      await wait(SPACING_MS)
    }
    const neighbours = [...(like.provider === 'dailymotion' && like.videoId ? [like.videoId] : []), ...around.toSpread.map((row) => row.videoId)]
    for (const videoId of neighbours) {
      if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
      try { found.push(...await relatedDailymotion(videoId.replace(/^dailymotion:/, ''), http, undefined, RELATED)) } catch (error) { errors.push(`liées de ${videoId} : ${message(error)}`) }
      await wait(SPACING_MS)
    }
    // Each look-alike's neighbours are read once, whatever they gave.
    if (!ctx.dryRun && around.toSpread.length) {
      spread += around.toSpread.length
      await ctx.db.collection('items').updateMany({ _id: { $in: around.toSpread.map((row) => row._id) } }, { $set: { 'v3.lookalike.spread': true } }).catch((error) => { errors.push(`voisins lus : ${message(error)}`) })
    }
    const fresh = found.filter((video) => !visited.has(video.videoId) && !likeVideoIds.has(video.videoId))
    for (const video of fresh) visited.add(video.videoId)
    read += fresh.length
    const held = await known(ctx, fresh)
    const notHeld = fresh.filter((video) => !held.has(video.videoId))
    counters.duplicates += fresh.length - notHeld.length
    const seen = await judged(ctx, notHeld)
    const unknown = notHeld.filter((video) => !seen.has(video.videoId))
    // One of each title (forty uploads called "ANIMATION vidéo" are one), and titles that say enough.
    const readable = unknown.filter((video) => {
      const key = video.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (titles.has(key) || !saysEnough(video.title)) return false
      titles.add(key)
      return true
    })
    const door = driftDoor(readable)
    door.refused['titre trop court ou répété'] = unknown.length - readable.length
    if (seen.size) door.refused['déjà jugée'] = seen.size
    if (!door.kept.length || ctx.timeLeft() < DEADLINE_MARGIN_MS) { cursor.visits[like.id] = visit + 1; cursor.next += 1; likesDone += 1; continue }
    // The model reads them all at once; then only what resembles a like goes on.
    let bits: Uint8Array[] = []
    try { bits = await prints(door.kept.map((video) => textOf({ title: video.title, description: video.description }))) } catch (error) { errors.push(`empreintes : ${message(error)}`); break }
    fingerprinted += bits.length
    const judgedHere = lookalikes(door.kept, bits, likes, likes.indexOf(like))
    const close = judgedHere.close.sort((left, right) => right.likeness.score - left.likeness.score).slice(0, MAX_PER_LIKE)
    near += close.length
    copies += judgedHere.copies
    const nearIds = new Set(judgedHere.close.map((entry) => entry.video.videoId))
    await remember(ctx, door.kept.filter((video) => !nearIds.has(video.videoId)).map((video) => video.videoId))
    const refused: Record<string, number> = { ...door.refused, 'pas assez proche d\'un like': door.kept.length - judgedHere.close.length - judgedHere.copies, ...(judgedHere.copies ? { 'copie du like': judgedHere.copies } : {}), ...(judgedHere.close.length > close.length ? { 'assez pour ce like': judgedHere.close.length - close.length } : {}) }
    const candidates = close.map((entry) => entry.video)
    const weekly = await underWeeklyCap(ctx, guards, candidates, 'dailymotion', new Set())
    if (weekly.refused) refused['chaîne cette semaine'] = weekly.refused
    const media = await withoutMedia(ctx, guards, '', weekly.kept, 'dailymotion', new Set())
    if (media.refused) refused['média'] = media.refused
    const checked: DigVideo[] = []
    for (const video of media.kept) {
      if (checks >= MAX_PLAYABLE_CHECKS) { checked.push(video); continue }
      checks += 1
      if (await playable(video.videoId, http)) checked.push(video); else refused['ne se lit pas'] = (refused['ne se lit pas'] ?? 0) + 1
    }
    const result = await ctx.admit({ subjectId: `lookalike:${like.id}`, videos: checked })
    addAdmission(counters, { ...result, scanned: fresh.length, rejected: { ...result.rejected, ...refused } })
    counters.byProvider = { ...(counters.byProvider ?? {}), dailymotion: ((counters.byProvider ?? {}).dailymotion ?? 0) + result.inserted }
    // What got in keeps the fingerprint the model just wrote, and the like it resembles: the pool's mark.
    if (!ctx.dryRun && checked.length) {
      const byId = new Map(close.map((entry) => [entry.video.videoId, entry]))
      const writes: AnyBulkWriteOperation<Document>[] = checked.flatMap((video) => {
        const entry = byId.get(video.videoId)
        return entry ? [{ updateMany: { filter: { videoId: video.videoId, type: 'video', vec: { $exists: false } }, update: { $set: { vec: toBinary(entry.bits), 'v3.lookalike': { like: likes[entry.likeness.index].id, score: Math.round(entry.likeness.score * 1000) / 1000 } } } } }] : []
      })
      if (writes.length) await ctx.db.collection('items').bulkWrite(writes, { ordered: false }).catch((error) => { errors.push(`empreintes écrites : ${message(error)}`) })
    }
    await ctx.search({ provider: 'dailymotion', query: `sosies de « ${like.title.slice(0, 60)} » (${queries.length} recherches, page ${page}, ${neighbours.length} voisinages)`, scanned: fresh.length, kept: checked.length, inserted: result.inserted, duplicates: result.duplicates, rejected: refused, quotaUnits: 0, insertedIds: result.insertedIds }).catch(() => undefined)
    cursor.visits[like.id] = visit + 1
    cursor.next += 1
    likesDone += 1
  }

  cursor.next %= Math.max(1, likes.length)
  if (!ctx.dryRun) await meta.updateOne({ _id: CURSOR_ID } as Document, { $set: { next: cursor.next, visits: cursor.visits, at: new Date() } }, { upsert: true }).catch((error) => { errors.push(`place : ${message(error)}`) })
  cursor.note = `${likesDone} likes visités · ${searches} recherches · ${spread} voisinages de sosies · ${read} vidéos lues · ${fingerprinted} lues par l'IA · ${near} ressemblent à un like${copies ? ` (${copies} copies écartées)` : ''} · ${counters.inserted} entrées`
  ctx.log(`sosies : ${cursor.note}`)
  return { counters, cursor, errors }
}
