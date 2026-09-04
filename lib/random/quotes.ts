import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import { STRONG_POOL_MAX_TIME_MS, buildStrongPoolMatch } from '@/lib/random/strongPool'
import type { RandomSelectOptions } from '@/lib/random/types'
import type { Filter } from 'mongodb'
import { buildContentLanguageMatch, combineContentMatches } from './language'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from './globalState'
import {
  deriveToneAugmentation,
  flattenToneSegments,
  mergeToneHintsIntoTags,
  mergeToneSignalsIntoKeywords,
} from '@/lib/ingest/tone'

const RECENT_LIMIT = 10
const recentQuotes: string[] = []

const QUOTE_TOPIC_SEEDS: Record<string, string[]> = {
  motivation: ['dream', 'goal', 'success', 'achieve', 'ambition', 'challenge'],
  creativity: ['art', 'design', 'create', 'creative', 'imagination'],
  wisdom: ['wise', 'knowledge', 'learn', 'understand', 'think', 'truth'],
  humor: ['laugh', 'funny', 'humor', 'smile'],
  leadership: ['lead', 'leader', 'team', 'vision', 'inspire'],
}

export type QuoteAIMetadata = {
  source?: string
  model?: string
  generatedAt?: string
}

export type QuoteDocument = {
  type: 'quote'
  text: string
  author: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
  variant?: 'text' | 'ai'
  lang?: string
  hash?: string
  ai?: QuoteAIMetadata | null
  disclaimer?: string
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
  rand?: number
}

export type QuoteItem = {
  type: 'quote'
  text: string
  author: string
  provider: string
  source: { name: string; url?: string }
  variant?: 'text' | 'ai'
  lang?: string
  ai?: QuoteAIMetadata | null
  disclaimer?: string
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
  tags?: string[]
  keywords?: string[]
  _id?: string
}

type QuoteRecord = {
  text?: string | null
  author?: string | null
  provider?: string | null
  source?: { name?: string | null; url?: string | null } | null
  tags?: string[]
  keywords?: string[]
  variant?: 'text' | 'ai'
  lang?: string | null
  languageScope?: 'universal' | 'localized' | null
  ai?: QuoteAIMetadata | null
  disclaimer?: string | null
  hash?: string | null
  tone?: 'positive' | 'neutral' | 'negative' | null
  toneConfidence?: number | null
  toneSignals?: string[] | null
  likeCount?: number | null
  quality?: number | null
  showWeight?: number | null
  dislikeCount?: number | null
  isSuppressed?: boolean | null
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
  const toneSegments = flattenToneSegments([
    provider,
    sourceName,
    text,
    author,
    tags,
    keywords,
  ])
  const tone = deriveToneAugmentation(toneSegments)
  const mergedTags = mergeToneHintsIntoTags(tags, tone?.toneTagHints, 12)
  const mergedKeywords = mergeToneSignalsIntoKeywords(keywords, tone?.toneSignals, 14)

  return {
    type: 'quote',
    text,
    author,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags: mergedTags,
    keywords: mergedKeywords,
    tone: tone?.tone,
    toneConfidence: tone?.toneConfidence,
    toneSignals: tone?.toneSignals,
  }
}

async function pickFromDb(
  exclude: string[],
  attempts = 20,
  extraMatch: Filter<QuoteRecord> = {},
): Promise<QuoteRecord | null> {
  for (let i = 0; i < attempts; i++) {
    const filter = {
      ...(exclude.length ? { text: { $nin: exclude } } : {}),
      ...extraMatch,
    } as Filter<QuoteRecord>
    const doc = await sampleFromCache<QuoteRecord>('quote', filter, {
      maxTimeMS: Object.keys(extraMatch).length ? STRONG_POOL_MAX_TIME_MS : undefined,
    })
    if (!doc) return null
    const text = typeof doc.text === 'string' ? doc.text : ''
    const author = typeof doc.author === 'string' ? doc.author : ''
    if (!text) continue
    if (exclude.includes(key(text, author))) continue
    return doc
  }
  return null
}

export async function selectQuote(options: RandomSelectOptions = {}): Promise<QuoteItem | null> {
  const exclude = recentQuotes.slice(-RECENT_LIMIT)
  const strongMatch = options.strong ? buildStrongPoolMatch<QuoteRecord>() : null
  const languageMatch = buildContentLanguageMatch<QuoteRecord>(options.lang)
  const doc = strongMatch
    ? (await pickFromDb(exclude, 28, combineContentMatches(strongMatch, languageMatch)))
      ?? (await pickFromDb(exclude, 20, languageMatch))
    : await pickFromDb(exclude, 20, languageMatch)
  const itemId = doc && typeof doc === 'object' && '_id' in doc
    ? String((doc as { _id: unknown })._id)
    : undefined
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
  const variant: 'text' | 'ai' = record.variant === 'ai' ? 'ai' : 'text'
  const lang = typeof record.lang === 'string' && record.lang.trim() ? record.lang.trim() : undefined
  const aiMeta = record.ai && typeof record.ai === 'object'
    ? {
        source: typeof record.ai.source === 'string' ? record.ai.source : undefined,
        model: typeof record.ai.model === 'string' ? record.ai.model : undefined,
        generatedAt: typeof record.ai.generatedAt === 'string' ? record.ai.generatedAt : undefined,
      }
    : null
  const disclaimer = typeof record.disclaimer === 'string' && record.disclaimer.trim() ? record.disclaimer.trim() : undefined
  const tone = typeof record.tone === 'string' ? record.tone : undefined
  const toneConfidence = typeof record.toneConfidence === 'number' ? record.toneConfidence : undefined
  const toneSignals = Array.isArray(record.toneSignals)
    ? record.toneSignals.filter((entry): entry is string => typeof entry === 'string')
    : undefined

  registerRecent(text, author)
  void touchLastShown('quote', { text, author })
  markGlobalItem('quote', key(text, author))
  markGlobalProvider(provider)
  markGlobalOrigin(doc ? 'db-random' : 'fallback')
  markGlobalTopics(tags)
  markGlobalKeywords(keywords)

  return {
    _id: itemId,
    type: 'quote',
    text,
    author,
    provider,
    source: { name: sourceName, url: sourceUrl },
    variant,
    lang,
    ai: aiMeta,
    disclaimer,
    tags,
    keywords,
    tone,
    toneConfidence,
    toneSignals,
  }
}
