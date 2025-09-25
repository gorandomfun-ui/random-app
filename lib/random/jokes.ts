import fs from 'node:fs/promises'
import path from 'node:path'
import type { CandidateOrigin } from '@/lib/random/types'
import { shouldPreferFreshContent } from '@/lib/random/helpers'
import {
  areKeywordsGloballyRecent,
  areTopicsGloballyRecent,
  getRecentOriginsWindow,
  isGlobalItemRecent,
  isProviderGloballyRecent,
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from '@/lib/random/globalState'
import { getDbSafe, touchLastShown, upsertCache } from '@/lib/random/data'

const DAY_MS = 1000 * 60 * 60 * 24

const JOKE_TOPIC_SEEDS: Record<string, string[]> = {
  tech: ['computer', 'programmer', 'developer', 'debug', 'software', 'coding', 'laptop', 'wifi'],
  work: ['boss', 'office', 'meeting', 'coworker', 'deadline', 'hr', 'job', 'zoom'],
  family: ['mom', 'dad', 'kids', 'baby', 'grandma', 'grandpa', 'sister', 'brother', 'family'],
  relationships: ['dating', 'marriage', 'husband', 'wife', 'girlfriend', 'boyfriend', 'partner', 'romance'],
  school: ['school', 'teacher', 'class', 'homework', 'exam', 'college', 'university'],
  bar: ['bar', 'bartender', 'drink', 'beer', 'wine', 'pub'],
  animals: ['dog', 'cat', 'cow', 'horse', 'chicken', 'duck', 'goat', 'pig', 'bird', 'fish'],
  puns: ['pun', 'wordplay', 'knock knock', 'dad joke'],
  dark: ['grave', 'ghost', 'zombie', 'vampire', 'death', 'haunted'],
  daily: ['coffee', 'sleep', 'morning', 'kitchen', 'laundry', 'groceries', 'traffic'],
  holiday: ['christmas', 'holiday', 'halloween', 'birthday', 'new year', 'valentine'],
}

const SHORT_JOKES_PATH = process.env.SHORTJOKES_PATH || 'public/data/shortjokes.csv'
const JOKE_HEADERS = { 'User-Agent': 'RandomAppBot/1.0 (+https://random.app)' }

const recentJokes: string[] = []
const recentJokeTags: string[] = []
const recentJokeKeywords: string[] = []
const recentJokeProviders: string[] = []

let SHORT_JOKES_CACHE: string[] | null = null

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function trimText(value?: string | null): string {
  return (value || '').trim()
}

function pushRecent(list: string[], value: string, max: number) {
  const key = value.trim().toLowerCase()
  if (!key) return
  const idx = list.indexOf(key)
  if (idx >= 0) list.splice(idx, 1)
  list.push(key)
  while (list.length > max) list.shift()
}

function pushRecentMany(list: string[], values: string[], max: number) {
  for (const value of values) pushRecent(list, value, max)
  while (list.length > max) list.shift()
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed) out.push(trimmed.toLowerCase())
    } else if (entry && typeof entry === 'object' && 'toString' in entry) {
      const str = String(entry).trim()
      if (str) out.push(str.toLowerCase())
    }
  }
  return Array.from(new Set(out))
}

function extractTagsFromSeeds(text: string, seedMap: Record<string, string[]>): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(seedMap)) {
    if (seeds.some((seed) => lower.includes(seed))) tags.push(tag)
  }
  return tags.length ? Array.from(new Set(tags)) : ['misc']
}

function extractKeywordsFromText(text: string, limit = 8): string[] {
  if (!text) return []
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = lower.split(/\s+/).filter(Boolean)
  const unique: string[] = []
  for (const word of words) {
    if (word.length < 3 || word.length > 18) continue
    if (!unique.includes(word)) unique.push(word)
    if (unique.length >= limit) break
  }
  return unique
}

export type JokeCandidate = {
  text: string
  item: { type: 'joke'; text: string; source: { name: string; url?: string }; provider: string }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

export function buildJokeCandidate(doc: Record<string, unknown>, origin: CandidateOrigin): JokeCandidate | null {
  const text = trimText(typeof doc.text === 'string' ? doc.text : '')
  if (!text) return null
  const providerRaw = trimText(typeof doc.provider === 'string' ? doc.provider : '')
  const source = (typeof doc.source === 'object' && doc.source !== null)
    ? (doc.source as { name?: string; url?: string })
    : { name: providerRaw || 'cache', url: typeof doc.url === 'string' ? doc.url : '' }
  const sourceName = trimText(source?.name || '')
  const provider = providerRaw || sourceName || 'cache'
  const storedTags = normalizeStringArray(doc.tags)
  const storedKeywords = normalizeStringArray(doc.keywords)
  const tags = storedTags.length ? storedTags : extractTagsFromSeeds(text, JOKE_TOPIC_SEEDS)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(text)
  const updatedAt = doc.updatedAt instanceof Date ? doc.updatedAt : typeof doc.updatedAt === 'string' ? new Date(doc.updatedAt) : null
  const lastShownAt = doc.lastShownAt instanceof Date ? doc.lastShownAt : typeof doc.lastShownAt === 'string' ? new Date(doc.lastShownAt) : null

  return {
    text,
    item: { type: 'joke', text, source: { name: sourceName || provider, url: source?.url }, provider },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function jokeCandidateKey(candidate: JokeCandidate): string {
  return candidate.text
}

export type JokeDocument = {
  type: 'joke'
  text: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
}

export function createJokeDocument(doc: Record<string, unknown>): JokeDocument | null {
  const candidate = buildJokeCandidate(doc, 'network')
  if (!candidate) return null
  return {
    type: 'joke',
    text: candidate.text,
    provider: candidate.provider,
    source: candidate.item.source,
    tags: candidate.tags,
    keywords: candidate.keywords,
  }
}

function score(candidate: JokeCandidate): number {
  let score = 0

  if (!recentJokes.includes(candidate.text)) score += 12
  else score -= 9

  if (candidate.origin === 'network') score += 5
  else if (candidate.origin === 'db-unseen') score += 4
  else if (candidate.origin === 'db-backlog') score += 2

  if (!recentJokeProviders.includes(candidate.provider)) score += 3
  else score -= 2

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentJokeTags.includes(tag)) score -= 1
    else score += 3
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentJokeKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length
  score -= repeatedKeywords * 1.5

  if (!candidate.lastShownAt) score += 4
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 5
    else if (days > 7) score += 3
    else if (days < 2) score -= 1
  }

  score += Math.random() * 1.5
  return score
}

async function collectJokeCandidates(): Promise<JokeCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []

  const bucket = new Map<string, JokeCandidate>()
  const add = (doc: Record<string, unknown>, origin: CandidateOrigin) => {
    const candidate = buildJokeCandidate(doc, origin)
    if (!candidate) return
    const key = jokeCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const collection = db.collection('items')
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      collection.find({ type: 'joke' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      collection.find({ type: 'joke', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      collection.find({ type: 'joke', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      collection.aggregate([{ $match: { type: 'joke' } }, { $sample: { size: 60 } }]).toArray(),
    ])

    for (const doc of fresh as Record<string, unknown>[]) add(doc, 'db-fresh')
    for (const doc of unseen as Record<string, unknown>[]) add(doc, 'db-unseen')
    for (const doc of backlog as Record<string, unknown>[]) add(doc, 'db-backlog')
    for (const doc of randomDocs as Record<string, unknown>[]) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchWithTimeout(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1], timeout = 6000): Promise<Response | null> {
  if (typeof AbortController === 'undefined') {
    return Promise.race([
      fetch(input, init),
      new Promise<Response | null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ])
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(input, { ...(init || {}), signal: controller.signal })
    return res
  } catch (err: unknown) {
    if ((err as { name?: string } | null)?.name === 'AbortError') return null
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJokeApiSingle(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchWithTimeout('https://v2.jokeapi.dev/joke/Any?type=single', { cache: 'no-store', headers: JOKE_HEADERS })
    if (!res?.ok) return null
    const data: unknown = await res.json()
    if (!data || typeof data !== 'object') return null
    const record = data as Record<string, unknown>
    const raw = typeof record.joke === 'string' ? record.joke : ''
    const text = trimText(raw)
    if (!text) return null
    return {
      text,
      provider: 'jokeapi',
      source: { name: 'JokeAPI', url: 'https://jokeapi.dev' },
    }
  } catch {
    return null
  }
}

async function fetchChuckNorrisJoke(): Promise<Record<string, unknown> | null> {
  const base = process.env.CHUCK_BASE || 'https://api.chucknorris.io'
  try {
    const res = await fetchWithTimeout(`${base}/jokes/random`, { cache: 'no-store', headers: JOKE_HEADERS })
    if (!res?.ok) return null
    const data: unknown = await res.json()
    if (!data || typeof data !== 'object') return null
    const record = data as Record<string, unknown>
    const raw = typeof record.value === 'string' ? record.value : ''
    const text = trimText(raw)
    if (!text) return null
    return {
      text,
      provider: 'chucknorris',
      source: { name: 'api.chucknorris.io', url: typeof record.url === 'string' ? record.url : 'https://api.chucknorris.io' },
    }
  } catch {
    return null
  }
}

async function loadShortJokesCSV(): Promise<string[]> {
  if (SHORT_JOKES_CACHE) return SHORT_JOKES_CACHE
  try {
    const absolute = path.resolve(process.cwd(), SHORT_JOKES_PATH)
    const raw = await fs.readFile(absolute, 'utf8')
    SHORT_JOKES_CACHE = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return SHORT_JOKES_CACHE
  } catch {
    SHORT_JOKES_CACHE = []
    return SHORT_JOKES_CACHE
  }
}

async function getShortJokeFromCSV(): Promise<Record<string, unknown> | null> {
  const list = await loadShortJokesCSV()
  if (!list.length) return null
  const text = trimText(pick(list))
  if (!text) return null
  return {
    text,
    provider: 'shortjokes.csv',
    source: { name: 'local-csv' },
  }
}

async function fetchNetworkJokeCandidates(): Promise<JokeCandidate[]> {
  const providers = [fetchJokeApiSingle, fetchChuckNorrisJoke, getShortJokeFromCSV]
  const out: JokeCandidate[] = []
  for (const provider of providers) {
    try {
      const doc = await provider()
      if (!doc) continue
      const candidate = buildJokeCandidate(doc, 'network')
      if (candidate) out.push(candidate)
    } catch {
      /* ignore provider errors */
    }
  }
  return out
}

function markRecentJoke(text: string) {
  pushRecent(recentJokes, text, 80)
}

export async function selectJoke(): Promise<{ type: 'joke'; text: string; source: { name: string; url?: string }; provider: string } | null> {
  const candidateMap = new Map<string, JokeCandidate>()
  const add = (candidate: JokeCandidate | null) => {
    if (!candidate) return
    const key = jokeCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectJokeCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkJokeCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent(getRecentOriginsWindow(10))
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const key = jokeCandidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('joke', key)
    const allTagsRecent = candidate.tags.every((tag) => recentJokeTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentJokeKeywords.includes(word))
      : false
    const topicsTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 2) continue
    if (allTagsRecent && allKeywordsRecent && scored.length > 2) continue
    if ((topicsTired || keywordsTired) && scored.length > 2) continue
    if (providerTired && scored.length > 3 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 2) continue

    if (candidate.origin === 'network') {
      await upsertCache('joke', { text: candidate.text }, {
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('joke', { text: candidate.text })
    markRecentJoke(candidate.text)
    pushRecentMany(recentJokeTags, candidate.tags, 60)
    pushRecentMany(recentJokeKeywords, candidate.keywords, 120)
    pushRecent(recentJokeProviders, candidate.provider, 20)
    markGlobalItem('joke', key)
    markGlobalTopics(candidate.tags)
    markGlobalKeywords(candidate.keywords)
    markGlobalProvider(candidate.provider)
    markGlobalOrigin(candidate.origin)

    return candidate.item
  }

  const fallback = await getShortJokeFromCSV()
  if (fallback) {
    const candidate = buildJokeCandidate(fallback, 'network')
    if (candidate) {
      await upsertCache('joke', { text: candidate.text }, {
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
      await touchLastShown('joke', { text: candidate.text })
      markRecentJoke(candidate.text)
      pushRecentMany(recentJokeTags, candidate.tags, 60)
      pushRecentMany(recentJokeKeywords, candidate.keywords, 120)
      pushRecent(recentJokeProviders, candidate.provider, 20)
      markGlobalItem('joke', jokeCandidateKey(candidate))
      markGlobalTopics(candidate.tags)
      markGlobalKeywords(candidate.keywords)
      markGlobalProvider(candidate.provider)
      markGlobalOrigin(candidate.origin)
      return candidate.item
    }
  }

  return null
}
