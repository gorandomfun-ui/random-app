/**
 * The words of the day for the owner's GIF page (public/local-ingest.html,
 * "Images"): a list that changes by itself every day, made of what has GIFs.
 *
 * The page used to search Giphy with the videos' word mixes ("origami bumper
 * algeria", "library townhall"): no GIF holds those words together, 0 each
 * time (8 October). The owner asked for an evolving list, tied to the day's
 * trends like the videos'. Five sources, all free:
 *   - what people search on Giphy today (its trending searches);
 *   - the subjects of the day of the videos (yesterday's most read Wikipedia
 *     pages, the dig's trends) — a name without GIFs falls out after two tries;
 *   - the owner's likes, by what their titles say they are;
 *   - Giphy's own categories and subcategories, a few a day in turn;
 *   - the neighbours Giphy gives for some of them ("street food" → "thai food").
 * Each word keeps a record (`gif_words_v1`, `word:<word>`): two tries that
 * brought nothing and it is not offered again; one used these three days waits.
 */

import type { Db, Document } from 'mongodb'

import { loadLikePool } from '@/lib/v3/cool/likePool'
import { practiceTheme, wordsTheme } from '@/lib/v3/dig/likes'

const COLLECTION = 'gif_words_v1'
const DAY_MS = 86_400_000
const LIST_SIZE = 150
const CATEGORIES_A_DAY = 12
const LIKES_A_DAY = 25
const RELATED_SEEDS = 8
const RELATED_PER_SEED = 5
/** Used this recently, a word waits (the trending searches excepted: they are the day's). */
const REST_DAYS = 3

export type WordSource = 'giphy-trending' | 'trends' | 'likes' | 'categories' | 'related'
export type DayWords = { _id: string; day: string; words: Array<{ word: string; from: WordSource }>; sources: Record<WordSource, number>; at: Date }

const normalize = (word: string): string => word.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()

function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296 }
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[out[index], out[other]] = [out[other], out[index]]
  }
  return out
}

async function giphy<T>(path: string, params: Record<string, string>, request: typeof fetch): Promise<T | null> {
  const key = process.env.GIPHY_API_KEY
  if (!key) return null
  const url = new URL(`https://api.giphy.com${path}`)
  url.searchParams.set('api_key', key)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  const response = await request(url, { cache: 'no-store' }).catch(() => null)
  if (!response || !response.ok) return null
  return (await response.json().catch(() => null)) as T | null
}

/** The record of a word searched from the page: tries, what came in, when. */
export async function recordWord(word: string, inserted: number, scanned: number, db?: Db): Promise<void> {
  const base = db ?? (await (await import('@/lib/db')).getDb())
  const key = normalize(word)
  if (!key) return
  await base.collection(COLLECTION).updateOne({ _id: `word:${key}` } as Document, { $set: { word: key, lastAt: new Date() }, $inc: { tries: 1, inserted, scanned } }, { upsert: true })
}

/** Today's words, built once a day and kept; the same list all day, so a run interrupted goes on with it. */
export async function wordsOfTheDay(db: Db, now = Date.now(), request: typeof fetch = fetch): Promise<DayWords> {
  const day = new Date(now).toISOString().slice(0, 10)
  const collection = db.collection<DayWords>(COLLECTION)
  const kept = await collection.findOne({ _id: `day:${day}` })
  if (kept) return kept
  const random = seeded(Number(day.replace(/-/g, '')))
  const candidates: Array<{ word: string; from: WordSource }> = []
  const add = (word: string | null | undefined, from: WordSource) => {
    const clean = (word ?? '').replace(/[#@]/g, ' ').replace(/\s+/g, ' ').trim()
    if (clean.length >= 3 && clean.length <= 40 && /\p{L}/u.test(clean)) candidates.push({ word: clean, from })
  }

  const trending = await giphy<{ data?: string[] }>('/v1/trending/searches', {}, request)
  for (const word of trending?.data ?? []) add(word, 'giphy-trending')

  const trends = await db.collection('dig_subjects_v4').find({ base: 'trends', createdAt: { $gte: new Date(now - 2 * DAY_MS) } } as Document, { projection: { label: 1 }, limit: 40, maxTimeMS: 10_000 }).toArray().catch(() => [] as Document[])
  for (const row of trends) add(String(row.label ?? ''), 'trends')

  const pool = await loadLikePool(db).catch(() => ({ zones: [], likeIds: [] as string[] }))
  const { ObjectId } = await import('mongodb')
  const likeIds = pool.likeIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  const likes = likeIds.length ? await db.collection('items').find({ _id: { $in: likeIds } } as Document, { projection: { title: 1 }, maxTimeMS: 10_000 }).toArray().catch(() => [] as Document[]) : []
  const likeWords = [...new Set(likes.flatMap((row) => { const title = String(row.title ?? ''); return [practiceTheme(title)?.label, wordsTheme(title)].filter((word): word is string => Boolean(word)) }))]
  for (const word of shuffle(likeWords, random).slice(0, LIKES_A_DAY)) add(word, 'likes')

  const categories = await giphy<{ data?: Array<{ name?: string; subcategories?: Array<{ name?: string }> }> }>('/v1/gifs/categories', {}, request)
  const names = (categories?.data ?? []).flatMap((category) => [category.name, ...(category.subcategories ?? []).map((sub) => sub.name)]).filter((name): name is string => Boolean(name))
  for (const name of shuffle(names, random).slice(0, CATEGORIES_A_DAY)) add(name, 'categories')

  for (const seed of shuffle(candidates.filter((entry) => entry.from !== 'trends'), random).slice(0, RELATED_SEEDS)) {
    const related = await giphy<{ data?: Array<{ name?: string }> }>(`/v1/tags/related/${encodeURIComponent(seed.word)}`, {}, request)
    for (const tag of (related?.data ?? []).slice(0, RELATED_PER_SEED)) add(tag.name, 'related')
  }

  // What has failed twice, and what was searched these three days (but the day's trending searches), stays out.
  const keys = [...new Set(candidates.map((entry) => normalize(entry.word)))]
  const records = keys.length ? await db.collection(COLLECTION).find({ _id: { $in: keys.map((key) => `word:${key}`) } } as Document).toArray().catch(() => [] as Document[]) : []
  const byKey = new Map(records.map((row) => [String(row.word), row]))
  const seen = new Set<string>()
  const words = shuffle(candidates, random).filter((entry) => {
    const key = normalize(entry.word)
    if (seen.has(key)) return false
    seen.add(key)
    const record = byKey.get(key)
    if (record && Number(record.tries ?? 0) >= 2 && !Number(record.inserted ?? 0)) return false
    if (record && entry.from !== 'giphy-trending' && record.lastAt && now - new Date(record.lastAt).getTime() < REST_DAYS * DAY_MS) return false
    return true
  }).slice(0, LIST_SIZE)
  const sources = { 'giphy-trending': 0, trends: 0, likes: 0, categories: 0, related: 0 } as Record<WordSource, number>
  for (const entry of words) sources[entry.from] += 1
  const list: DayWords = { _id: `day:${day}`, day, words, sources, at: new Date(now) }
  await collection.updateOne({ _id: list._id }, { $set: list }, { upsert: true }).catch(() => undefined)
  return list
}
