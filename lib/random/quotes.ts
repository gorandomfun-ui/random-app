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
import type { CandidateOrigin } from '@/lib/random/types'

const DAY_MS = 1000 * 60 * 60 * 24

const LIMITED_AUTHORS = ['kanye west']
const LIMITED_AUTHOR_EXACTS = ['Kanye West']

function shouldSkipAuthor(author: string): boolean {
  const normalized = author.toLowerCase()
  if (LIMITED_AUTHOR_EXACTS.includes(author)) return true
  return LIMITED_AUTHORS.some((name) => normalized.includes(name))
}

const QUOTE_TOPIC_SEEDS: Record<string, string[]> = {
  inspiration: ['dream', 'hope', 'inspire', 'courage', 'light', 'future', 'vision', 'grow', 'goal'],
  love: ['love', 'heart', 'romance', 'affection', 'together', 'kindness', 'compassion'],
  wisdom: ['wisdom', 'knowledge', 'truth', 'lesson', 'learn', 'understand', 'philosophy'],
  ambition: ['success', 'goal', 'achievement', 'drive', 'focus', 'win', 'mission'],
  creativity: ['create', 'art', 'artist', 'imagination', 'idea', 'design'],
  resilience: ['strength', 'resilience', 'fight', 'battle', 'storm', 'survive', 'rise'],
  humor: ['laugh', 'funny', 'smile', 'joy'],
  mindfulness: ['mind', 'calm', 'peace', 'silence', 'meditation', 'breathe'],
}

const STOP_WORDS = new Set(
  [
    'the',
    'and',
    'with',
    'from',
    'that',
    'this',
    'your',
    'our',
    'for',
    'into',
    'over',
    'under',
    'about',
    'just',
    'make',
    'made',
    'making',
    'best',
    'how',
    'what',
    'when',
    'where',
    'why',
    'who',
    'are',
    'was',
    'were',
    'will',
    'can',
    'get',
    'been',
    'take',
    'takes',
    'took',
    'first',
    'second',
    'third',
    'day',
    'night',
    'amp',
    'life',
    'quote',
    'quotes',
  ],
)

const recentQuotes: string[] = []
const recentQuoteTags: string[] = []
const recentQuoteKeywords: string[] = []
const recentQuoteAuthors: string[] = []

function pushRecent(list: string[], value: string, max: number) {
  const key = value.trim().toLowerCase()
  if (!key) return
  const index = list.indexOf(key)
  if (index >= 0) list.splice(index, 1)
  list.push(key)
  while (list.length > max) list.shift()
}

function pushRecentMany(list: string[], values: string[], max: number) {
  for (const value of values) pushRecent(list, value, max)
  while (list.length > max) list.shift()
}

function trimText(value?: string | null): string {
  return (value || '').trim()
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

function extractKeywordsFromText(text: string, limit = 6): string[] {
  if (!text) return []
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = lower.split(/\s+/).filter(Boolean)
  const unique: string[] = []
  for (const word of words) {
    if (word.length < 3 || word.length > 18) continue
    if (STOP_WORDS.has(word)) continue
    if (!unique.includes(word)) unique.push(word)
    if (unique.length >= limit) break
  }
  return unique
}

function extractQuoteTags(text: string): string[] {
  const tags = extractTagsFromSeeds(text, QUOTE_TOPIC_SEEDS)
  return tags.length ? tags : ['misc']
}

export type QuoteCandidate = {
  text: string
  author: string
  item: { type: 'quote'; text: string; author: string; source: { name: string; url?: string }; provider: string }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

export function buildQuoteCandidate(doc: Record<string, unknown>, origin: CandidateOrigin): QuoteCandidate | null {
  const text = trimText(typeof doc.text === 'string' ? doc.text : typeof doc.content === 'string' ? doc.content : '')
  if (!text) return null
  const author = trimText(typeof doc.author === 'string' ? doc.author : '')
  const providerRaw = trimText(typeof doc.provider === 'string' ? doc.provider : '')
  const source = (typeof doc.source === 'object' && doc.source !== null)
    ? (doc.source as { name?: string; url?: string })
    : { name: providerRaw || author || 'quote', url: typeof doc.url === 'string' ? doc.url : '' }
  const sourceName = trimText(source?.name || '')
  const provider = providerRaw || sourceName || 'quote'
  const storedTags = normalizeStringArray(doc.tags)
  const storedKeywords = normalizeStringArray(doc.keywords)
  const combined = `${text} ${author}`.trim()
  const tags = storedTags.length ? storedTags : extractQuoteTags(combined)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(combined)
  const updatedAt = doc.updatedAt instanceof Date ? doc.updatedAt : typeof doc.updatedAt === 'string' ? new Date(doc.updatedAt) : null
  const lastShownAt = doc.lastShownAt instanceof Date ? doc.lastShownAt : typeof doc.lastShownAt === 'string' ? new Date(doc.lastShownAt) : null

  return {
    text,
    author,
    item: { type: 'quote', text, author, source: { name: sourceName || provider, url: source?.url }, provider },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function quoteCandidateKey(candidate: QuoteCandidate): string {
  return `${candidate.text}__${candidate.author}`
}

export type QuoteDocument = {
  type: 'quote'
  text: string
  author: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
}

export function createQuoteDocument(doc: Record<string, unknown>): QuoteDocument | null {
  const candidate = buildQuoteCandidate(doc, 'network')
  if (!candidate) return null
  return {
    type: 'quote',
    text: candidate.text,
    author: candidate.author,
    provider: candidate.provider,
    source: candidate.item.source,
    tags: candidate.tags,
    keywords: candidate.keywords,
  }
}

function score(candidate: QuoteCandidate): number {
  let score = 0

  if (!recentQuotes.includes(candidate.text)) score += 12
  else score -= 8

  const authorKey = candidate.author.trim().toLowerCase()
  if (authorKey) {
    if (!recentQuoteAuthors.includes(authorKey)) score += 4
    else score -= 3
  }

  if (candidate.origin === 'network') score += 5
  else if (candidate.origin === 'db-unseen') score += 3
  else if (candidate.origin === 'db-backlog') score += 2

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentQuoteTags.includes(tag)) score -= 1
    else score += 3
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentQuoteKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length
  score -= repeatedKeywords * 1.2

  if (!candidate.lastShownAt) score += 4
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 30) score += 5
    else if (days > 10) score += 3
    else if (days < 2) score -= 2
  }

  score += Math.random()
  return score
}

async function collectQuoteCandidates(): Promise<QuoteCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []
  const bucket = new Map<string, QuoteCandidate>()

  const add = (doc: Record<string, unknown>, origin: CandidateOrigin) => {
    const candidate = buildQuoteCandidate(doc, origin)
    if (!candidate) return
    const key = quoteCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const collection = db.collection('items')
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      collection.find({ type: 'quote' }).sort({ updatedAt: -1 }).limit(150).toArray(),
      collection.find({ type: 'quote', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(100).toArray(),
      collection.find({ type: 'quote', lastShownAt: { $lt: new Date(Date.now() - 21 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(120).toArray(),
      collection.aggregate([{ $match: { type: 'quote' } }, { $sample: { size: 80 } }]).toArray(),
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
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') return null
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchQuotableQuotes(limit = 6): Promise<Record<string, unknown>[]> {
  const base = process.env.QUOTABLE_BASE || 'https://api.quotable.io'
  try {
    const res = await fetchWithTimeout(`${base}/quotes/random?limit=${Math.max(1, Math.min(limit, 10))}`, { cache: 'no-store' })
    if (!res?.ok) return []
    const data: unknown = await res.json()
    if (Array.isArray(data)) return data as Record<string, unknown>[]
    return data ? [data as Record<string, unknown>] : []
  } catch {
    return []
  }
}

async function fetchZenQuote(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchWithTimeout('https://zenquotes.io/api/random', { cache: 'no-store' })
    if (!res?.ok) return null
    const data: unknown = await res.json()
    const entry = Array.isArray(data) ? data[0] : data
    if (typeof entry !== 'object' || !entry) return null
    const entryRecord = entry as Record<string, unknown>
    const rawText = typeof entryRecord.q === 'string' ? entryRecord.q : typeof entryRecord.quote === 'string' ? entryRecord.quote : ''
    const text = trimText(rawText)
    if (!text) return null
    const author = trimText(typeof entryRecord.a === 'string' ? entryRecord.a : '')
    if (author && shouldSkipAuthor(author) && Math.random() < 0.8) return null
    return {
      text,
      author,
      source: { name: 'ZenQuotes.io', url: 'https://zenquotes.io/' },
      provider: 'zenquotes',
    }
  } catch {
    return null
  }
}

async function fetchNetworkQuoteCandidates(): Promise<QuoteCandidate[]> {
  const out: QuoteCandidate[] = []
  const quotable = await fetchQuotableQuotes(6)
  for (const entry of quotable) {
    const text = trimText(typeof entry.content === 'string' ? entry.content : typeof entry.text === 'string' ? entry.text : '')
    if (!text || recentQuotes.includes(text)) continue
    const author = trimText(typeof entry.author === 'string' ? entry.author : '')
    if (author && shouldSkipAuthor(author) && Math.random() < 0.8) continue
    const candidate = buildQuoteCandidate({
      text,
      author,
      provider: 'quotable',
      source: { name: 'Quotable', url: 'https://quotable.io' },
    }, 'network')
    if (candidate) out.push(candidate)
  }

  const zen = await fetchZenQuote()
  if (zen) {
    const candidate = buildQuoteCandidate(zen, 'network')
    if (candidate) out.push(candidate)
  }

  return out
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

const LOCAL_QUOTES = [
  'Simplicity is the soul of efficiency.',
  'Make it work, make it right, make it fast.',
  'Creativity is intelligence having fun.',
  'The best way to predict the future is to invent it.',
  'Imagination rules the world.',
  'Stay curious and keep exploring.',
  'Every great idea started as something weird.',
]

function markRecentQuote(text: string) {
  pushRecent(recentQuotes, text, 80)
}

export async function selectQuote(): Promise<{ type: 'quote'; text: string; author: string; source: { name: string; url?: string }; provider: string } | null> {
  const candidateMap = new Map<string, QuoteCandidate>()
  const add = (candidate: QuoteCandidate | null) => {
    if (!candidate) return
    const key = quoteCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectQuoteCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkQuoteCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent(getRecentOriginsWindow(10))
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const key = quoteCandidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('quote', key)
    const allTagsRecent = candidate.tags.every((tag) => recentQuoteTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentQuoteKeywords.includes(word))
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
      await upsertCache('quote', { text: candidate.text }, {
        author: candidate.author,
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('quote', { text: candidate.text })
    markRecentQuote(candidate.text)
    if (candidate.author) pushRecent(recentQuoteAuthors, candidate.author, 40)
    pushRecentMany(recentQuoteTags, candidate.tags, 70)
    pushRecentMany(recentQuoteKeywords, candidate.keywords, 120)
    markGlobalItem('quote', key)
    markGlobalTopics(candidate.tags)
    markGlobalKeywords(candidate.keywords)
    markGlobalProvider(candidate.provider)
    markGlobalOrigin(candidate.origin)

    return candidate.item
  }

  const fallback = LOCAL_QUOTES.find((quote) => !recentQuotes.includes(quote)) || pick(LOCAL_QUOTES)
  const candidate = buildQuoteCandidate(
    {
      text: fallback,
      author: '',
      provider: 'local',
      source: { name: 'Local', url: '' },
    },
    'network',
  )

  if (candidate) {
    await upsertCache('quote', { text: candidate.text }, {
      author: candidate.author,
      source: candidate.item.source,
      provider: candidate.provider,
      tags: candidate.tags,
      keywords: candidate.keywords,
    })
    await touchLastShown('quote', { text: candidate.text })
    markRecentQuote(candidate.text)
    pushRecentMany(recentQuoteTags, candidate.tags, 70)
    pushRecentMany(recentQuoteKeywords, candidate.keywords, 120)
    markGlobalItem('quote', quoteCandidateKey(candidate))
    markGlobalTopics(candidate.tags)
    markGlobalKeywords(candidate.keywords)
    markGlobalProvider(candidate.provider)
    markGlobalOrigin(candidate.origin)
    return candidate.item
  }

  return null
}
