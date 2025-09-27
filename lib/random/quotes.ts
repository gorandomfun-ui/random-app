import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from './globalState'

const RECENT_LIMIT = 10
const recentQuotes: string[] = []

const QUOTE_TOPIC_SEEDS: Record<string, string[]> = {
  motivation: ['dream', 'goal', 'success', 'achieve', 'ambition', 'challenge'],
  creativity: ['art', 'design', 'create', 'creative', 'imagination'],
  wisdom: ['wise', 'knowledge', 'learn', 'understand', 'think', 'truth'],
  humor: ['laugh', 'funny', 'humor', 'smile'],
  leadership: ['lead', 'leader', 'team', 'vision', 'inspire'],
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

export type QuoteItem = {
  type: 'quote'
  text: string
  author: string
  provider: string
  source: { name: string; url?: string }
}

type QuoteRecord = {
  text?: string | null
  author?: string | null
  provider?: string | null
  source?: { name?: string | null; url?: string | null } | null
  tags?: string[]
  keywords?: string[]
}

const LOCAL_QUOTES = [
  'Simplicity is the ultimate sophistication.',
  'Creativity is intelligence having fun.',
  'Make it work, make it right, make it fast.',
]

const trim = (value?: string | null) => (value || '').trim()

function key(text: string, author: string): string {
  return `${text.toLowerCase()}__${author.toLowerCase()}`
}

function registerRecent(text: string, author: string) {
  const entry = key(text, author)
  const idx = recentQuotes.indexOf(entry)
  if (idx >= 0) recentQuotes.splice(idx, 1)
  recentQuotes.push(entry)
  while (recentQuotes.length > RECENT_LIMIT) recentQuotes.shift()
}

function computeTags(text: string, author: string): string[] {
  const base = `${text} ${author}`.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(QUOTE_TOPIC_SEEDS)) {
    if (seeds.some((seed) => base.includes(seed))) tags.push(tag)
  }
  return tags.length ? Array.from(new Set(tags)) : ['misc']
}

function computeKeywords(text: string, author: string, limit = 8): string[] {
  const lower = `${text} ${author}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = lower.split(/\s+/).filter(Boolean)
  const unique: string[] = []
  for (const word of words) {
    if (word.length < 3 || word.length > 18) continue
    if (!unique.includes(word)) unique.push(word)
    if (unique.length >= limit) break
  }
  return unique
}

export function createQuoteDocument(doc: Record<string, unknown>): QuoteDocument | null {
  const text = trim(typeof doc.text === 'string' ? doc.text : '')
  if (!text) return null
  const author = trim(typeof doc.author === 'string' ? doc.author : '')
  const provider = trim(typeof doc.provider === 'string' ? doc.provider : '') || 'quote'
  const rawSource = doc.source && typeof doc.source === 'object' ? (doc.source as { name?: string; url?: string }) : null
  const sourceName = trim(rawSource?.name) || provider
  const sourceUrl = rawSource?.url && typeof rawSource.url === 'string' ? rawSource.url : undefined
  const tags = Array.isArray(doc.tags) && doc.tags.length
    ? doc.tags.filter((entry): entry is string => typeof entry === 'string')
    : computeTags(text, author)
  const keywords = Array.isArray(doc.keywords) && doc.keywords.length
    ? doc.keywords.filter((entry): entry is string => typeof entry === 'string')
    : computeKeywords(text, author)

  return {
    type: 'quote',
    text,
    author,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags,
    keywords,
  }
}

async function pickFromDb(exclude: string[], attempts = 20): Promise<QuoteRecord | null> {
  for (let i = 0; i < attempts; i++) {
    const doc = await sampleFromCache<QuoteRecord>('quote')
    if (!doc) return null
    const text = typeof doc.text === 'string' ? doc.text : ''
    const author = typeof doc.author === 'string' ? doc.author : ''
    if (!text) continue
    if (exclude.includes(key(text, author))) continue
    return doc
  }
  return null
}

export async function selectQuote(): Promise<QuoteItem | null> {
  const exclude = recentQuotes.slice(-RECENT_LIMIT)
  const doc = await pickFromDb(exclude)
  const record = doc ?? { text: LOCAL_QUOTES.find((q) => !exclude.includes(key(q, ''))) || LOCAL_QUOTES[0], author: '', provider: 'local' }

  const text = trim(typeof record.text === 'string' ? record.text : '')
  if (!text) return null
  const author = trim(typeof record.author === 'string' ? record.author : '')
  const provider = trim(typeof record.provider === 'string' ? record.provider : '') || 'quote'
  const rawSource = record.source && typeof record.source === 'object' ? record.source : null
  const sourceName = trim(typeof rawSource?.name === 'string' ? rawSource.name : provider) || provider
  const sourceUrl = rawSource && typeof rawSource.url === 'string' && rawSource.url ? rawSource.url : undefined
  const tags = Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const keywords = Array.isArray(record.keywords) ? record.keywords.filter((word): word is string => typeof word === 'string') : []

  registerRecent(text, author)
  await touchLastShown('quote', { text, author })
  markGlobalItem('quote', key(text, author))
  markGlobalProvider(provider)
  markGlobalOrigin(doc ? 'db-random' : 'fallback')
  markGlobalTopics(tags)
  markGlobalKeywords(keywords)

  return {
    type: 'quote',
    text,
    author,
    provider,
    source: { name: sourceName, url: sourceUrl },
  }
}
