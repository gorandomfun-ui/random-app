import { sampleFromCache, touchLastShown, getDbSafe } from '@/lib/random/data'
import { ObjectId } from 'mongodb'
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
const recentJokes: string[] = []
const MAX_ATTEMPTS = 10

const BLOCKED_KEYWORDS = ['hitler', 'nazi', 'holocaust', 'auschwitz', 'jew', 'jews', 'jewish']

const BLOCKED_PATTERNS: RegExp[] = [
  /difference\s+between\s+a\s+pizza\s+and\s+a\s+black\s+man/i,
  new RegExp(`\\b(${BLOCKED_KEYWORDS.join('|')})\\b`, 'i'),
]

const CATEGORY_PATTERNS: RegExp[] = [
  /^(short|best|funny|silly|corny|clean|halloween|christmas|holiday|kids?|child|family|knock[-\s]?knock|dad|one-liner|animal|school)\s+(jokes?|pranks?|puns?|stories|one-liners?)$/i,
  /^(jokes?|pranks?|puns?|one-liners?)\s*(for|about)\s+[a-z\s]{1,40}$/i,
  /^food\s*\+\s*recipes$/i,
  /^science\s+fiction\s+jokes!?$/i,
]
const NON_CONTENT_KEYWORDS = ['privacy', 'terms', 'cookies', 'notice', 'contact', 'subscribe', 'newsletter']

const JOKE_TOPIC_SEEDS: Record<string, string[]> = {
  knock: ['knock', 'door'],
  dad: ['dad', 'father', 'pun'],
  tech: ['computer', 'binary', 'code', 'program', 'developer'],
  animal: ['cat', 'dog', 'cow', 'chicken', 'horse', 'animal'],
  school: ['teacher', 'homework', 'school', 'class'],
  food: ['food', 'pizza', 'burger', 'cookie', 'cake'],
}

export type JokeAIMetadata = {
  source?: string
  model?: string
  generatedAt?: string
}

export type JokeDocument = {
  type: 'joke'
  text: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
  variant?: 'text' | 'ai'
  lang?: string
  hash?: string
  ai?: JokeAIMetadata | null
  disclaimer?: string
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
  rand?: number
}

export type JokeItem = {
  type: 'joke'
  text: string
  provider: string
  source: { name: string; url?: string }
  variant?: 'text' | 'ai'
  lang?: string
  ai?: JokeAIMetadata | null
  disclaimer?: string
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
}

type JokeRecord = {
  text?: string | null
  provider?: string | null
  source?: { name?: string | null; url?: string | null } | null
  tags?: string[]
  keywords?: string[]
  variant?: 'text' | 'ai'
  lang?: string | null
  ai?: JokeAIMetadata | null
  disclaimer?: string | null
  hash?: string | null
  tone?: 'positive' | 'neutral' | 'negative' | null
  toneConfidence?: number | null
  toneSignals?: string[] | null
}

const trim = (value?: string | null) => (value || '').trim()

function computeTags(text: string): string[] {
  const lower = text.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(JOKE_TOPIC_SEEDS)) {
    if (seeds.some((seed) => lower.includes(seed))) tags.push(tag)
  }
  return tags.length ? Array.from(new Set(tags)) : ['misc']
}

function computeKeywords(text: string, limit = 8): string[] {
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

export function createJokeDocument(doc: Record<string, unknown>): JokeDocument | null {
  const text = trim(typeof doc.text === 'string' ? doc.text : '')
  if (!text) return null
  if (isBlockedJoke(text)) return null
  const provider = trim(typeof doc.provider === 'string' ? doc.provider : '') || 'joke'
  const rawSource = doc.source && typeof doc.source === 'object' ? (doc.source as { name?: string; url?: string }) : null
  const sourceName = trim(rawSource?.name) || provider
  const sourceUrl = rawSource?.url && typeof rawSource.url === 'string' ? rawSource.url : undefined
  const tags = Array.isArray(doc.tags) && doc.tags.length
    ? doc.tags.filter((entry): entry is string => typeof entry === 'string')
    : computeTags(text)
  const keywords = Array.isArray(doc.keywords) && doc.keywords.length
    ? doc.keywords.filter((entry): entry is string => typeof entry === 'string')
    : computeKeywords(text)
  const toneSegments = flattenToneSegments([
    provider,
    sourceName,
    text,
    tags,
    keywords,
  ])
  const tone = deriveToneAugmentation(toneSegments)
  const mergedTags = mergeToneHintsIntoTags(tags, tone?.toneTagHints, 12)
  const mergedKeywords = mergeToneSignalsIntoKeywords(keywords, tone?.toneSignals, 14)
  return {
    type: 'joke',
    text,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags: mergedTags,
    keywords: mergedKeywords,
    tone: tone?.tone,
    toneConfidence: tone?.toneConfidence,
    toneSignals: tone?.toneSignals,
  }
}

function registerRecent(text: string) {
  const key = text.toLowerCase()
  const idx = recentJokes.indexOf(key)
  if (idx >= 0) recentJokes.splice(idx, 1)
  recentJokes.push(key)
  while (recentJokes.length > RECENT_LIMIT) recentJokes.shift()
}

type JokeDbRecord = JokeRecord & { _id?: unknown }

async function pickFromDb(exclude: string[]): Promise<JokeDbRecord | null> {
  const filter = exclude.length ? { text: { $nin: exclude } } : {}
  const doc = await sampleFromCache<JokeDbRecord>('joke', filter)
  if (doc) return doc
  if (exclude.length) return sampleFromCache<JokeDbRecord>('joke')
  return null
}

const LOCAL_JOKES = [
  'Why did the developer go broke? Because he used up all his cache.',
  'Debugging: Being the detective in a crime movie where you are also the murderer.',
  'I would tell you a UDP joke, but you might not get it.',
]

export async function selectJoke(): Promise<JokeItem | null> {
  const exclude = recentJokes.slice(-RECENT_LIMIT)
  let attempts = 0
  let doc: JokeDbRecord | null = null
  let record: JokeDbRecord | { text: string; provider: string } | null = null
  let text = ''

  while (attempts < MAX_ATTEMPTS) {
    doc = await pickFromDb(exclude)
    record = doc ?? { text: LOCAL_JOKES.find((j) => !exclude.includes(j.toLowerCase())) || LOCAL_JOKES[0], provider: 'local' }

    text = typeof record?.text === 'string' ? record.text.trim() : ''
    if (!text) {
      attempts += 1
      continue
    }

    if (isBlockedJoke(text)) {
      exclude.push(text.toLowerCase())
      if (doc) await purgeBlockedJoke(doc, text)
      attempts += 1
      continue
    }

    break
  }

  if (!record || !text || isBlockedJoke(text)) return null

  const provider = typeof record.provider === 'string' && record.provider.trim() ? record.provider.trim() : 'joke'
  const rawSource = record.source && typeof record.source === 'object' ? record.source : null
  const sourceName = rawSource && typeof rawSource.name === 'string' && rawSource.name.trim() ? rawSource.name.trim() : provider
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

  registerRecent(text)
  await touchLastShown('joke', { text })
  markGlobalItem('joke', text)
  markGlobalProvider(provider)
  markGlobalOrigin(doc ? 'db-random' : 'fallback')
  markGlobalTopics(tags)
  markGlobalKeywords(keywords)

  return {
    type: 'joke',
    text,
    provider,
    source: { name: sourceName, url: sourceUrl },
    variant,
    lang,
    ai: aiMeta,
    disclaimer,
    tone,
    toneConfidence,
    toneSignals,
  }
}

export function looksLikeCategoryLabel(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (CATEGORY_PATTERNS.some((pattern) => pattern.test(trimmed))) return true

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const hasPunctuation = /[.!?]/.test(trimmed)
  const hasJokeKeyword = /\b(jokes?|pranks?|puns?|one-liners?)\b/i.test(trimmed)
  const lower = trimmed.toLowerCase()

  if (!hasPunctuation && hasJokeKeyword && wordCount <= 4) return true
  if (!hasPunctuation && !hasJokeKeyword && wordCount <= 2) return true
  if (!hasPunctuation && NON_CONTENT_KEYWORDS.some((keyword) => lower.includes(keyword))) return true
  if (!hasPunctuation && /\brecipes?\b/i.test(trimmed) && wordCount <= 4) return true

  return false
}

export function isBlockedJoke(text: string): boolean {
  if (!text) return false
  if (looksLikeCategoryLabel(text)) return true
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(text))
}

async function purgeBlockedJoke(record: JokeDbRecord, text: string) {
  try {
    const db = await getDbSafe()
    if (!db) return
    const collection = db.collection('items')
    const id = record._id
    if (id instanceof ObjectId) {
      await collection.deleteOne({ _id: id })
      return
    }
    if (typeof id === 'string' && ObjectId.isValid(id)) {
      await collection.deleteOne({ _id: new ObjectId(id) })
      return
    }
    await collection.deleteMany({ type: 'joke', text })
  } catch (error) {
    console.warn('[jokes] failed to purge blocked entry', error)
  }
}
