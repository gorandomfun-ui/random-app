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

const FACT_TOPIC_SEEDS: Record<string, string[]> = {
  science: ['planet', 'star', 'space', 'physics', 'chemistry', 'biology', 'atom', 'quantum', 'experiment'],
  history: ['history', 'ancient', 'empire', 'king', 'queen', 'war', 'dynasty', 'medieval'],
  animal: ['animal', 'cat', 'dog', 'bird', 'fish', 'insect', 'mammal', 'reptile'],
  space: ['galaxy', 'universe', 'mars', 'moon', 'nasa', 'astronaut', 'cosmos'],
  culture: ['culture', 'festival', 'language', 'music', 'dance', 'tradition', 'myth'],
  numbers: ['percent', 'ratio', 'number', 'statistics', 'probability', 'math'],
  odd: ['weird', 'strange', 'bizarre', 'unusual', 'rare', 'unexpected'],
}

const FACT_HEADERS = { 'User-Agent': 'RandomAppBot/1.0 (+https://random.app)' }

const recentFacts: string[] = []
const recentFactTags: string[] = []
const recentFactKeywords: string[] = []
const recentFactProviders: string[] = []

const LOCAL_FACTS = [
  'Honey never spoils.',
  'Octopuses have three hearts.',
  'Bananas are berries.',
  'A group of flamingos is a flamboyance.',
]

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
  return Array.from(new Set(tags))
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

export type FactCandidate = {
  text: string
  item: { type: 'fact'; text: string; source: { name: string; url?: string }; provider: string }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

export function buildFactCandidate(doc: Record<string, unknown>, origin: CandidateOrigin): FactCandidate | null {
  const text = trimText(typeof doc.text === 'string' ? doc.text : '')
  if (!text) return null
  const providerRaw = trimText(typeof doc.provider === 'string' ? doc.provider : '')
  const source = (typeof doc.source === 'object' && doc.source !== null)
    ? (doc.source as { name?: string; url?: string })
    : { name: providerRaw || 'fact', url: typeof doc.url === 'string' ? doc.url : '' }
  const sourceName = trimText(source?.name || '')
  const provider = providerRaw || sourceName || 'fact'
  const storedTags = normalizeStringArray(doc.tags)
  const storedKeywords = normalizeStringArray(doc.keywords)
  const tags = storedTags.length ? storedTags : extractTagsFromSeeds(text, FACT_TOPIC_SEEDS)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(text)
  const updatedAt = doc.updatedAt instanceof Date ? doc.updatedAt : typeof doc.updatedAt === 'string' ? new Date(doc.updatedAt) : null
  const lastShownAt = doc.lastShownAt instanceof Date ? doc.lastShownAt : typeof doc.lastShownAt === 'string' ? new Date(doc.lastShownAt) : null

  return {
    text,
    item: { type: 'fact', text, source: { name: sourceName || provider, url: source?.url }, provider },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function factCandidateKey(candidate: FactCandidate): string {
  return candidate.text
}

export type FactDocument = {
  type: 'fact'
  text: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
}

export function createFactDocument(doc: Record<string, unknown>): FactDocument | null {
  const candidate = buildFactCandidate(doc, 'network')
  if (!candidate) return null
  return {
    type: 'fact',
    text: candidate.text,
    provider: candidate.provider,
    source: candidate.item.source,
    tags: candidate.tags,
    keywords: candidate.keywords,
  }
}

function score(candidate: FactCandidate): number {
  let score = 0

  if (!recentFacts.includes(candidate.text)) score += 12
  else score -= 9

  if (candidate.origin === 'network') score += 5
  else if (candidate.origin === 'db-unseen') score += 3
  else if (candidate.origin === 'db-backlog') score += 2

  if (!recentFactProviders.includes(candidate.provider)) score += 3
  else score -= 2

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentFactTags.includes(tag)) score -= 1
    else score += 2
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentFactKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length
  score -= repeatedKeywords * 1.5

  if (!candidate.lastShownAt) score += 4
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 4
    else if (days < 2) score -= 1
  }

  score += Math.random()
  return score
}

async function collectFactCandidates(): Promise<FactCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []

  const bucket = new Map<string, FactCandidate>()
  const add = (doc: Record<string, unknown>, origin: CandidateOrigin) => {
    const candidate = buildFactCandidate(doc, origin)
    if (!candidate) return
    const key = factCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const collection = db.collection('items')
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      collection.find({ type: 'fact' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      collection.find({ type: 'fact', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      collection.find({ type: 'fact', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      collection.aggregate([{ $match: { type: 'fact' } }, { $sample: { size: 60 } }]).toArray(),
    ])

    for (const doc of fresh as Record<string, unknown>[]) add(doc, 'db-fresh')
    for (const doc of unseen as Record<string, unknown>[]) add(doc, 'db-unseen')
    for (const doc of backlog as Record<string, unknown>[]) add(doc, 'db-backlog')
    for (const doc of randomDocs as Record<string, unknown>[]) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(url, { cache: 'no-store', headers: FACT_HEADERS, signal: controller?.signal as AbortSignal | undefined })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function factUselessfacts(): Promise<Record<string, unknown> | null> {
  const base = process.env.USELESSFACTS_BASE || 'https://uselessfacts.jsph.pl'
  const data = await fetchJson(`${base}/random.json?language=en`)
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const raw = typeof record.text === 'string' ? record.text : typeof record.data === 'string' ? record.data : ''
  const text = trimText(raw)
  if (!text) return null
  return {
    text,
    provider: 'uselessfacts',
    source: { name: 'UselessFacts', url: 'https://uselessfacts.jsph.pl' },
  }
}

async function factNumbers(): Promise<Record<string, unknown> | null> {
  const data = await fetchJson('https://numbersapi.com/random/trivia?json')
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const raw = typeof record.text === 'string' ? record.text : ''
  const text = trimText(raw)
  if (!text) return null
  return {
    text,
    provider: 'numbers',
    source: { name: 'Numbers API', url: 'https://numbersapi.com' },
  }
}

async function factCat(): Promise<Record<string, unknown> | null> {
  const data = await fetchJson('https://catfact.ninja/fact')
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const raw = typeof record.fact === 'string' ? record.fact : ''
  const text = trimText(raw)
  if (!text) return null
  return {
    text,
    provider: 'catfact',
    source: { name: 'catfact.ninja', url: 'https://catfact.ninja' },
  }
}

async function factMeow(): Promise<Record<string, unknown> | null> {
  const data = await fetchJson('https://meowfacts.herokuapp.com/')
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const rawList = Array.isArray(record.data) ? (record.data as unknown[]) : []
  const first = typeof rawList[0] === 'string' ? rawList[0] : ''
  const text = trimText(first)
  if (!text) return null
  return {
    text,
    provider: 'meowfacts',
    source: { name: 'meowfacts', url: 'https://meowfacts.herokuapp.com' },
  }
}

async function factDog(): Promise<Record<string, unknown> | null> {
  const data = await fetchJson('https://dogapi.dog/api/facts')
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const rawList = Array.isArray(record.facts) ? (record.facts as unknown[]) : []
  const first = typeof rawList[0] === 'string' ? rawList[0] : ''
  const text = trimText(first)
  if (!text) return null
  return {
    text,
    provider: 'dogapi',
    source: { name: 'dogapi.dog', url: 'https://dogapi.dog' },
  }
}

async function fetchNetworkFactCandidates(): Promise<FactCandidate[]> {
  const providers = [factUselessfacts, factNumbers, factCat, factMeow, factDog]
  const shuffled = [...providers]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const out: FactCandidate[] = []
  for (const provider of shuffled) {
    try {
      const doc = await provider()
      if (!doc) continue
      const candidate = buildFactCandidate(doc, 'network')
      if (candidate) out.push(candidate)
    } catch {
      /* ignore provider errors */
    }
  }
  return out
}

function markRecentFact(text: string) {
  pushRecent(recentFacts, text, 90)
}

export async function selectFact(): Promise<{ type: 'fact'; text: string; source: { name: string; url?: string }; provider: string } | null> {
  const candidateMap = new Map<string, FactCandidate>()
  const add = (candidate: FactCandidate | null) => {
    if (!candidate) return
    const key = factCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectFactCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkFactCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent(getRecentOriginsWindow(10))
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const key = factCandidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('fact', key)
    const allTagsRecent = candidate.tags.every((tag) => recentFactTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentFactKeywords.includes(word))
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
      await upsertCache('fact', { text: candidate.text }, {
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('fact', { text: candidate.text })
    markRecentFact(candidate.text)
    pushRecentMany(recentFactTags, candidate.tags, 70)
    pushRecentMany(recentFactKeywords, candidate.keywords, 120)
    pushRecent(recentFactProviders, candidate.provider, 25)
    markGlobalItem('fact', key)
    markGlobalTopics(candidate.tags)
    markGlobalKeywords(candidate.keywords)
    markGlobalProvider(candidate.provider)
    markGlobalOrigin(candidate.origin)

    return candidate.item
  }

  const fallback = LOCAL_FACTS.find((fact) => !recentFacts.includes(fact)) || pick(LOCAL_FACTS)
  const candidate = buildFactCandidate({
    text: fallback,
    provider: 'local',
    source: { name: 'Local', url: '' },
  }, 'network')

  if (candidate) {
    await upsertCache('fact', { text: candidate.text }, {
      source: candidate.item.source,
      provider: candidate.provider,
      tags: candidate.tags,
      keywords: candidate.keywords,
    })
    await touchLastShown('fact', { text: candidate.text })
    markRecentFact(candidate.text)
    pushRecentMany(recentFactTags, candidate.tags, 70)
    pushRecentMany(recentFactKeywords, candidate.keywords, 120)
    markGlobalItem('fact', factCandidateKey(candidate))
    markGlobalTopics(candidate.tags)
    markGlobalKeywords(candidate.keywords)
    markGlobalProvider(candidate.provider)
    markGlobalOrigin(candidate.origin)
    return candidate.item
  }

  return null
}
