import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from '@/lib/random/globalState'

const RECENT_LIMIT = 10
const recentFacts: string[] = []

const FACT_TOPIC_SEEDS: Record<string, string[]> = {
  science: ['planet', 'star', 'space', 'physics', 'chemistry', 'biology', 'atom', 'quantum', 'experiment'],
  history: ['history', 'ancient', 'empire', 'king', 'queen', 'war', 'dynasty', 'medieval'],
  animal: ['animal', 'cat', 'dog', 'bird', 'fish', 'insect', 'mammal', 'reptile'],
  space: ['galaxy', 'universe', 'mars', 'moon', 'nasa', 'astronaut', 'cosmos'],
  culture: ['culture', 'festival', 'language', 'music', 'dance', 'tradition', 'myth'],
  numbers: ['percent', 'ratio', 'number', 'statistics', 'probability', 'math'],
  odd: ['weird', 'strange', 'bizarre', 'unusual', 'rare', 'unexpected'],
}

const LOCAL_FACTS = [
  'Honey never spoils.',
  'Octopuses have three hearts.',
  'Bananas are berries.',
  'A group of flamingos is a flamboyance.',
]

export type FactDocument = {
  type: 'fact'
  text: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
}

export type FactItem = {
  type: 'fact'
  text: string
  provider: string
  source: { name: string; url?: string }
}

type FactRecord = FactDocument & { lastShownAt?: Date | string | null }

function trim(value?: string | null): string {
  return (value || '').trim()
}

function computeTags(text: string): string[] {
  const lower = text.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(FACT_TOPIC_SEEDS)) {
    if (seeds.some((seed) => lower.includes(seed))) tags.push(tag)
  }
  return Array.from(new Set(tags))
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

export function createFactDocument(doc: Record<string, unknown>): FactDocument | null {
  const text = trim(typeof doc.text === 'string' ? doc.text : '')
  if (!text) return null
  const provider = trim(typeof doc.provider === 'string' ? doc.provider : '') || 'fact'
  const rawSource = doc.source && typeof doc.source === 'object' ? (doc.source as { name?: string; url?: string }) : null
  const sourceName = trim(rawSource?.name || '') || provider
  const sourceUrl = rawSource?.url && typeof rawSource.url === 'string' ? rawSource.url : undefined
  const tags = Array.isArray(doc.tags) && doc.tags.length
    ? doc.tags.filter((entry): entry is string => typeof entry === 'string')
    : computeTags(text)
  const keywords = Array.isArray(doc.keywords) && doc.keywords.length
    ? doc.keywords.filter((entry): entry is string => typeof entry === 'string')
    : computeKeywords(text)
  return {
    type: 'fact',
    text,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags,
    keywords,
  }
}

function registerRecent(text: string) {
  const key = text.toLowerCase()
  const idx = recentFacts.indexOf(key)
  if (idx >= 0) recentFacts.splice(idx, 1)
  recentFacts.push(key)
  while (recentFacts.length > RECENT_LIMIT) recentFacts.shift()
}

async function pickFromDb(exclude: string[]): Promise<FactRecord | null> {
  const filter = exclude.length ? { text: { $nin: exclude } } : {}
  const doc = await sampleFromCache<FactRecord>('fact', filter)
  if (doc) return doc
  if (exclude.length) return sampleFromCache<FactRecord>('fact')
  return null
}

export async function selectFact(): Promise<FactItem | null> {
  const exclude = recentFacts.slice(-RECENT_LIMIT)
  const doc = await pickFromDb(exclude)
  if (doc) {
    const text = trim(doc.text)
    if (text) {
      const provider = trim(doc.provider) || (doc.source?.name ?? 'fact')
      const sourceName = trim(doc.source?.name) || provider
      const sourceUrl = typeof doc.source?.url === 'string' ? doc.source.url : undefined
      registerRecent(text)
      await touchLastShown('fact', { text })
      markGlobalItem('fact', text)
      markGlobalProvider(provider)
      markGlobalOrigin('db-random')
      markGlobalTopics(Array.isArray(doc.tags) ? doc.tags.filter((tag): tag is string => typeof tag === 'string') : [])
      markGlobalKeywords(Array.isArray(doc.keywords) ? doc.keywords.filter((word): word is string => typeof word === 'string') : [])
      return {
        type: 'fact',
        text,
        provider,
        source: { name: sourceName, url: sourceUrl },
      }
    }
  }

  const fallback = LOCAL_FACTS.find((entry) => !exclude.includes(entry.toLowerCase())) || LOCAL_FACTS[0]
  registerRecent(fallback)
  return {
    type: 'fact',
    text: fallback,
    provider: 'local',
    source: { name: 'Local' },
  }
}
