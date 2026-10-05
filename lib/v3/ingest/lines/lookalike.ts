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
 * Walk): here the fingerprint is the door. A like gives a few searches — what
 * its title says it is, its telling words, its first words — sorted another way
 * at each visit, and its neighbours when it lives on Dailymotion; the videos the
 * base does not hold yet go through the drift's door, then the model, and only
 * those as close to a like as the stock's top 7 %, and no copy of it, go on to
 * the common checks (the week's cap per channel, the media windows, the player's
 * word, the common door). Free (Dailymotion, the server's own model), in the
 * window the fingerprints' line leaves (server/vec-window.sh). What gets in
 * carries its fingerprint and the like it resembles (`v3.lookalike`).
 */

import { ObjectId, type AnyBulkWriteOperation, type Document } from 'mongodb'

import { fromRow, textOf, toBinary } from '../../ai/bits'
import { alike } from '../../ai/bits'
import { LIKE_COPY, NEAR_LIKE, nearestLike, type Likeness } from '../../ai/likeness'
import { loadLikePool } from '../../cool/likePool'
import { playable, relatedDailymotion, searchDailymotion, type DailymotionSort } from '../../dig/dailymotion'
import { newGuardState, underWeeklyCap, withoutMedia } from '../../dig/guards'
import { practiceTheme, wordsTheme } from '../../dig/likes'
import type { DigVideo } from '../../dig/video'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'
import { driftDoor } from './drift'

/** Likes visited a run at most; the window's minutes usually stop it first. */
export const LIKES_PER_RUN = Number(process.env.RANDOM_LOOKALIKE_LIKES ?? 40)
const SEARCH_RESULTS = 50
const QUERIES_PER_LIKE = 2
const RELATED = 20
const MAX_PLAYABLE_CHECKS = 600
const DEADLINE_MARGIN_MS = 45_000
const SPACING_MS = 250
/** A like's searches turn through Dailymotion's sorts, so a like visited again brings other videos. */
const SORTS: DailymotionSort[] = ['relevance', 'random', 'visited', 'recent']
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
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
export const mostlyCjk = (title: string): boolean => (title.match(CJK)?.length ?? 0) * 2 >= title.replace(/[\s\p{P}\p{S}\d]/gu, '').length
/** A title says too little for the model below two words and twelve letters ("Rocky", "basket" came in on the first trial), or six characters in Chinese, Japanese or Korean, written without spaces. */
const MIN_TITLE_WORDS = 2
const MIN_TITLE_LETTERS = 12
const MIN_CJK_CHARACTERS = 6
/** What one like may bring in a run: in the first trial one like brought 35. */
export const MAX_PER_LIKE = 12
/** Where the rotation through the likes stands, between runs. */
const META = 'dig_meta_v4'
const CURSOR_ID = 'lookalike'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export type LookalikeCursor = { next: number; visits: Record<string, number>; note: string }
export type LikeRow = { id: string; title: string; provider?: string; videoId?: string; bits: Uint8Array }
export type Prints = (texts: string[]) => Promise<Uint8Array[]>

/** The searches a like gives: what its title says it is ("commercial 1994"), its telling words, its first words; two, without repeats. */
export function likeQueries(title: string): string[] {
  const clean = title.replace(/[#@][\p{L}\p{N}_]+/gu, ' ').replace(/[\[\](){}|•·:;!?¡¿"“”«»]+/g, ' ').replace(/\s+/g, ' ').trim()
  const first = clean.split(' ').filter((word) => /\p{L}/u.test(word)).slice(0, 5).join(' ')
  const out: string[] = []
  for (const query of [practiceTheme(title)?.label, wordsTheme(title), first]) {
    const text = (query ?? '').trim()
    if (text.length >= 4 && !out.some((known) => known.toLowerCase() === text.toLowerCase())) out.push(text)
  }
  return out.slice(0, QUERIES_PER_LIKE)
}

/** The likes of a run, in a fixed order by id, from where the last run stopped. */
export function likesOfRun(likes: readonly LikeRow[], next: number, count = LIKES_PER_RUN): LikeRow[] {
  if (!likes.length) return []
  const sorted = [...likes].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return Array.from({ length: Math.min(count, sorted.length) }, (_, index) => sorted[(next + index) % sorted.length])
}

/** Enough for the model to read a meaning in. */
export function saysEnough(title: string): boolean {
  if ((title.match(CJK)?.length ?? 0) >= MIN_CJK_CHARACTERS) return true
  const words = title.split(/\s+/).filter((word) => /\p{L}{2,}/u.test(word))
  return words.length >= MIN_TITLE_WORDS && (title.match(/\p{L}/gu)?.length ?? 0) >= MIN_TITLE_LETTERS
}

/**
 * Of the videos read for one like (`seed`, its index among the likes), those the AI finds near it — or much
 * nearer to another like — and a copy of none, with the like each resembles; and how many were copies.
 */
export function lookalikes(videos: readonly DigVideo[], prints: readonly Uint8Array[], likes: readonly LikeRow[], seed: number): { close: Array<{ video: DigVideo; bits: Uint8Array; likeness: Likeness }>; copies: number } {
  const likeBits = likes.map((like) => like.bits)
  const close: Array<{ video: DigVideo; bits: Uint8Array; likeness: Likeness }> = []
  let copies = 0
  videos.forEach((video, index) => {
    const bits = prints[index]
    if (!bits) return
    const nearest = nearestLike(bits, likeBits)
    if (nearest.score >= LIKE_COPY) { copies += 1; return }
    const extra = mostlyCjk(video.title) ? CJK_EXTRA : 0
    const own = seed >= 0 && seed < likes.length ? alike(bits, likeBits[seed]) : 0
    if (own >= NEAR_LIKE + extra) close.push({ video, bits, likeness: { score: own, index: seed } })
    else if (nearest.score >= OTHER_LIKE + extra) close.push({ video, bits, likeness: nearest })
  })
  return { close, copies }
}

/** The owner's liked videos that carry a fingerprint. */
async function loadLikes(ctx: LineContext): Promise<LikeRow[]> {
  const pool = await loadLikePool(ctx.db).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const ids = pool.likeIds.filter((id) => ObjectId.isValid(id)).slice(0, 400).map((id) => new ObjectId(id))
  if (!ids.length) return []
  const rows = await ctx.db.collection('items').find({ _id: { $in: ids }, type: 'video', vec: { $exists: true } } as Document, { projection: { title: 1, provider: 1, videoId: 1, vec: 1 }, maxTimeMS: 4000 }).toArray()
  return rows.flatMap((row) => { const bits = fromRow(row.vec); return bits ? [{ id: String(row._id), title: String(row.title ?? ''), provider: typeof row.provider === 'string' ? row.provider : undefined, videoId: typeof row.videoId === 'string' ? row.videoId : undefined, bits }] : [] })
}

/** The video ids among these the base already holds: not worth the model's time. */
async function known(ctx: LineContext, videos: readonly DigVideo[]): Promise<Set<string>> {
  const ids = [...new Set(videos.map((video) => video.videoId))]
  if (!ids.length) return new Set()
  const rows = await ctx.db.collection('items').find({ videoId: { $in: ids } } as Document, { projection: { videoId: 1 }, hint: 'video_id_lookup', maxTimeMS: 4000 }).toArray().catch(() => [] as Document[])
  return new Set(rows.map((row) => String(row.videoId)))
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
  let read = 0, fingerprinted = 0, near = 0, copies = 0, checks = 0, likesDone = 0

  const likes = await (deps.likes ?? loadLikes)(ctx).catch((error) => { errors.push(`likes : ${message(error)}`); return [] as LikeRow[] })
  const likeVideoIds = new Set(likes.map((like) => like.videoId).filter((id): id is string => Boolean(id)))
  if (!likes.length) { cursor.note = 'aucun like avec empreinte'; return { counters, cursor, errors } }

  for (const like of likesOfRun(likes, cursor.next)) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { errors.push('échéance atteinte'); break }
    // A like whose title says nothing ("ANIMATION vidéo") would only search for noise.
    if (!saysEnough(like.title)) { cursor.next += 1; continue }
    const visit = cursor.visits[like.id] ?? 0
    const sort = SORTS[visit % SORTS.length]
    const found: DigVideo[] = []
    for (const query of likeQueries(like.title)) {
      try { found.push(...await searchDailymotion(query, sort, http, undefined, SEARCH_RESULTS)) } catch (error) { errors.push(`recherche "${query}" : ${message(error)}`) }
      await wait(SPACING_MS)
    }
    if (like.provider === 'dailymotion' && like.videoId) {
      try { found.push(...await relatedDailymotion(like.videoId.replace(/^dailymotion:/, ''), http, undefined, RELATED)) } catch (error) { errors.push(`liées de ${like.videoId} : ${message(error)}`) }
      await wait(SPACING_MS)
    }
    const fresh = found.filter((video) => !visited.has(video.videoId) && !likeVideoIds.has(video.videoId))
    for (const video of fresh) visited.add(video.videoId)
    read += fresh.length
    const held = await known(ctx, fresh)
    const unknown = fresh.filter((video) => !held.has(video.videoId))
    counters.duplicates += fresh.length - unknown.length
    // One of each title (forty uploads called "ANIMATION vidéo" are one), and titles that say enough.
    const readable = unknown.filter((video) => {
      const key = video.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (titles.has(key) || !saysEnough(video.title)) return false
      titles.add(key)
      return true
    })
    const door = driftDoor(readable)
    door.refused['titre trop court ou répété'] = unknown.length - readable.length
    if (!door.kept.length || ctx.timeLeft() < DEADLINE_MARGIN_MS) { cursor.visits[like.id] = visit + 1; cursor.next += 1; likesDone += 1; continue }
    // The model reads them all at once; then only what resembles a like goes on.
    let bits: Uint8Array[] = []
    try { bits = await prints(door.kept.map((video) => textOf({ title: video.title, description: video.description }))) } catch (error) { errors.push(`empreintes : ${message(error)}`); break }
    fingerprinted += bits.length
    const judged = lookalikes(door.kept, bits, likes, likes.indexOf(like))
    const close = judged.close.sort((left, right) => right.likeness.score - left.likeness.score).slice(0, MAX_PER_LIKE)
    near += close.length
    copies += judged.copies
    const refused: Record<string, number> = { ...door.refused, 'pas assez proche d\'un like': door.kept.length - judged.close.length - judged.copies, ...(judged.copies ? { 'copie du like': judged.copies } : {}), ...(judged.close.length > close.length ? { 'assez pour ce like': judged.close.length - close.length } : {}) }
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
    // What got in keeps the fingerprint the model just wrote, and the like it resembles.
    if (!ctx.dryRun && checked.length) {
      const byId = new Map(close.map((entry) => [entry.video.videoId, entry]))
      const writes: AnyBulkWriteOperation<Document>[] = checked.flatMap((video) => {
        const entry = byId.get(video.videoId)
        return entry ? [{ updateMany: { filter: { videoId: video.videoId, type: 'video', vec: { $exists: false } }, update: { $set: { vec: toBinary(entry.bits), 'v3.lookalike': { like: likes[entry.likeness.index].id, score: Math.round(entry.likeness.score * 1000) / 1000 } } } } }] : []
      })
      if (writes.length) await ctx.db.collection('items').bulkWrite(writes, { ordered: false }).catch((error) => { errors.push(`empreintes écrites : ${message(error)}`) })
    }
    await ctx.search({ provider: 'dailymotion', query: `sosies de « ${like.title.slice(0, 60)} » (${sort})`, scanned: fresh.length, kept: checked.length, inserted: result.inserted, duplicates: result.duplicates, rejected: refused, quotaUnits: 0, insertedIds: result.insertedIds }).catch(() => undefined)
    cursor.visits[like.id] = visit + 1
    cursor.next += 1
    likesDone += 1
  }

  cursor.next %= Math.max(1, likes.length)
  if (!ctx.dryRun) await meta.updateOne({ _id: CURSOR_ID } as Document, { $set: { next: cursor.next, visits: cursor.visits, at: new Date() } }, { upsert: true }).catch((error) => { errors.push(`place : ${message(error)}`) })
  cursor.note = `${likesDone} likes visités · ${read} vidéos lues · ${fingerprinted} lues par l'IA · ${near} ressemblent à un like${copies ? ` (${copies} copies écartées)` : ''} · ${counters.inserted} entrées`
  ctx.log(`sosies : ${cursor.note}`)
  return { counters, cursor, errors }
}
