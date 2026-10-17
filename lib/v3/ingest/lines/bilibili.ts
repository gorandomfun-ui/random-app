/**
 * Bilibili, on a computer only (the owner, 16 October: "si on peut sur desktop faisons-le, mais il faudra tester").
 * Its player plays nothing on a phone outside China — every video swapped for its 17-second "cannot be played" clip,
 * nine out of nine — and plays on a computer (five out of six whole; a very long one cut at three minutes without an
 * account). So its videos live in a collection of their own, which no card reads: only the world card does, for a
 * computer (lib/discovery/wheel.ts), and first for the curator while he tests.
 *
 * What is read: the list of the moment's popular videos, a page deeper each run, and the videos Bilibili relates to a
 * few of them. Never the licensed programmes (blocked outside China), nor what is not a video of one piece; the title
 * through the common checks; three a run at most from one uploader. Its pictures refuse to show on another site (403
 * with our address as the referrer): the page shows them with no referrer. Free, no YouTube unit; 250 a run, twice a day.
 */

import type { Document } from 'mongodb'

import { BILIBILI, bilibiliPicture } from '../../bilibili'
import { isCleanTitle } from '../../cool/clean'
import { isAiMarked } from '../../cool/themes'
import type { LineContext, LineResult } from '../context'
import { emptyCounters } from '../journal'

export const PER_RUN = Number(process.env.RANDOM_BILIBILI_PER_RUN ?? 250)
/** Pages of the popular list read in turn, one more a run. */
const POPULAR_PAGES = 15
const PAGES_PER_RUN = 3
/** Popular videos whose related ones a run reads. */
const RELATED_SEEDS = 12
const PER_UPLOADER = 3
const MIN_SECONDS = 30
/** Past this, a video was cut at three minutes for a visitor without an account (16 October). */
const MAX_SECONDS = 20 * 60
const SPACING_MS = 400
const DEADLINE_MARGIN_MS = 60_000
const META = 'dig_meta_v4'
const CURSOR_ID = 'bilibili'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

/** One video as Bilibili's lists give it. */
export type BilibiliRow = {
  bvid?: string; aid?: number; cid?: number; pic?: string; title?: string; desc?: string; duration?: number; pubdate?: number; tname?: string; copyright?: number; is_ogv?: boolean
  owner?: { mid?: number; name?: string }; stat?: { view?: number }; rights?: { pay?: number; arc_pay?: number; ugc_pay?: number }; videos?: number
}

/** The document a row becomes, or why it does not. */
export function bilibiliDocument(row: BilibiliRow, now: Date): { doc: Document } | { refused: string } {
  const bvid = typeof row.bvid === 'string' && /^BV[\w]{10}$/.test(row.bvid) ? row.bvid : null
  const title = (row.title ?? '').trim()
  if (!bvid || !title) return { refused: 'incomplète' }
  if (row.is_ogv || row.rights?.pay || row.rights?.arc_pay || row.rights?.ugc_pay) return { refused: 'programme sous licence ou payant' }
  if ((row.videos ?? 1) > 1) return { refused: 'en plusieurs parties' }
  const seconds = Number(row.duration ?? 0)
  if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) return { refused: 'durée' }
  if (!isCleanTitle(title) || isAiMarked(`${title} ${(row.desc ?? '').slice(0, 500)}`)) return { refused: 'titre' }
  const mid = row.owner?.mid
  return {
    doc: {
      // The two numbers its player needs on a phone, in the address's fragment: with them it plays there too, with the code
      // alone its phone player plays its 17-second "cannot be played" clip (17 October); Bilibili's page ignores the fragment.
      type: 'video', provider: 'bilibili', videoId: `bilibili:${bvid}`, url: `https://www.bilibili.com/video/${bvid}${row.aid && row.cid ? `#aid=${row.aid}&cid=${row.cid}` : ''}`,
      title, description: (row.desc ?? '').slice(0, 1000), duration: `PT${Math.floor(seconds / 60)}M${seconds % 60}S`,
      ...(mid ? { channelId: `bilibili:${mid}` } : {}), ...(row.owner?.name ? { channelTitle: row.owner.name } : {}),
      ...(typeof row.stat?.view === 'number' ? { viewCount: row.stat.view } : {}),
      ...(row.pubdate ? { publishedAt: new Date(row.pubdate * 1000) } : {}),
      // Its picture, which the page shows with no referrer (lib/v3/bilibili.ts): 403 otherwise.
      ...(bilibiliPicture(row.pic) ? { thumb: bilibiliPicture(row.pic) } : {}),
      lang: 'zh', rand: Math.random(), createdAt: now,
      v3: { line: 'bilibili', desktopOnly: true, ...(row.tname ? { category: row.tname } : {}) },
    },
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function rows(url: string, request: typeof fetch): Promise<BilibiliRow[]> {
  const response = await request(url, { headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Bilibili HTTP ${response.status}`)
  const body = (await response.json()) as { code?: number; data?: { list?: BilibiliRow[] } | BilibiliRow[] }
  if (body.code !== 0) throw new Error(`Bilibili code ${body.code}`)
  return Array.isArray(body.data) ? body.data : body.data?.list ?? []
}

export type BilibiliCursor = { page: number; note: string }

export { BILIBILI }

export async function run(ctx: LineContext): Promise<LineResult> {
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const store = ctx.db.collection(BILIBILI)
  const meta = ctx.db.collection(META)
  if (!ctx.dryRun) {
    await store.createIndex({ videoId: 1 }, { unique: true, name: 'video_id' }).catch(() => undefined)
    await store.createIndex({ rand: 1 }, { name: 'rand' }).catch(() => undefined)
  }
  const previous = (ctx.cursor ?? await meta.findOne({ _id: CURSOR_ID } as Document, { maxTimeMS: 4000 }).catch(() => null) ?? {}) as Partial<BilibiliCursor>
  let page = Number(previous.page ?? 0) || 0
  const found: BilibiliRow[] = []

  // The moment's popular videos, a few pages a run, deeper each time and round again.
  for (let read = 0; read < PAGES_PER_RUN && ctx.timeLeft() > DEADLINE_MARGIN_MS; read += 1) {
    page = (page % POPULAR_PAGES) + 1
    try { found.push(...await rows(`https://api.bilibili.com/x/web-interface/popular?ps=20&pn=${page}`, http)) } catch (error) { errors.push(`populaires page ${page} : ${message(error)}`) }
    await wait(SPACING_MS)
  }
  // What Bilibili relates to a few of them: past the moment's list.
  for (const seed of found.filter((row) => row.bvid).sort(() => Math.random() - 0.5).slice(0, RELATED_SEEDS)) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
    try { found.push(...await rows(`https://api.bilibili.com/x/web-interface/archive/related?bvid=${seed.bvid}`, http)) } catch (error) { errors.push(`liées de ${seed.bvid} : ${message(error)}`) }
    await wait(SPACING_MS)
  }

  const now = new Date()
  const docs: Document[] = []
  const seen = new Set<string>()
  const perUploader = new Map<string, number>()
  for (const row of found) {
    counters.scanned += 1
    const built = bilibiliDocument(row, now)
    if ('refused' in built) { counters.rejected[built.refused] = (counters.rejected[built.refused] ?? 0) + 1; continue }
    const { doc } = built
    if (seen.has(doc.videoId)) continue
    seen.add(doc.videoId)
    const uploader = String(doc.channelId ?? '')
    if (uploader && (perUploader.get(uploader) ?? 0) >= PER_UPLOADER) { counters.rejected['chaîne de ce passage'] = (counters.rejected['chaîne de ce passage'] ?? 0) + 1; continue }
    perUploader.set(uploader, (perUploader.get(uploader) ?? 0) + 1)
    docs.push(doc)
  }
  const known = new Set((await store.find({ videoId: { $in: docs.map((doc) => doc.videoId) } } as Document, { projection: { videoId: 1 }, maxTimeMS: 10_000 }).toArray().catch(() => [] as Document[])).map((row) => String(row.videoId)))
  const fresh = docs.filter((doc) => !known.has(doc.videoId)).slice(0, PER_RUN)
  counters.duplicates += docs.length - docs.filter((doc) => !known.has(doc.videoId)).length
  if (!ctx.dryRun && fresh.length) {
    const result = await store.insertMany(fresh, { ordered: false }).catch((error) => { errors.push(`écriture : ${message(error)}`); return null })
    counters.inserted += result?.insertedCount ?? 0
  }
  if (!ctx.dryRun) await meta.updateOne({ _id: CURSOR_ID } as Document, { $set: { page, at: now } }, { upsert: true }).catch((error) => { errors.push(`place : ${message(error)}`) })
  const note = `${ctx.dryRun ? fresh.length : counters.inserted} vidéos Bilibili ${ctx.dryRun ? 'à entrer' : 'entrées'} sur ${found.length} lues (les populaires jusqu'à la page ${page}, et leurs vidéos liées) · ${known.size} déjà là`
  ctx.log(`bilibili : ${note}`)
  return { counters, errors, cursor: { page, note } satisfies BilibiliCursor }
}
