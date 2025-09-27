import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from './globalState'

const RECENT_LIMIT = 10
const recentJokes: string[] = []

const JOKE_TOPIC_SEEDS: Record<string, string[]> = {
  knock: ['knock', 'door'],
  dad: ['dad', 'father', 'pun'],
  tech: ['computer', 'binary', 'code', 'program', 'developer'],
  animal: ['cat', 'dog', 'cow', 'chicken', 'horse', 'animal'],
  school: ['teacher', 'homework', 'school', 'class'],
  food: ['food', 'pizza', 'burger', 'cookie', 'cake'],
}

export type JokeDocument = {
  type: 'joke'
  text: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
}

export type JokeItem = {
  type: 'joke'
  text: string
  provider: string
  source: { name: string; url?: string }
}

type JokeRecord = {
  text?: string | null
  provider?: string | null
  source?: { name?: string | null; url?: string | null } | null
  tags?: string[]
  keywords?: string[]
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
  return {
    type: 'joke',
    text,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags,
    keywords,
  }
}

function registerRecent(text: string) {
  const key = text.toLowerCase()
  const idx = recentJokes.indexOf(key)
  if (idx >= 0) recentJokes.splice(idx, 1)
  recentJokes.push(key)
  while (recentJokes.length > RECENT_LIMIT) recentJokes.shift()
}

async function pickFromDb(exclude: string[]): Promise<JokeRecord | null> {
  const filter = exclude.length ? { text: { $nin: exclude } } : {}
  const doc = await sampleFromCache<JokeRecord>('joke', filter)
  if (doc) return doc
  if (exclude.length) return sampleFromCache<JokeRecord>('joke')
  return null
}

const LOCAL_JOKES = [
  'Why did the developer go broke? Because he used up all his cache.',
  'Debugging: Being the detective in a crime movie where you are also the murderer.',
  'I would tell you a UDP joke, but you might not get it.',
]

export async function selectJoke(): Promise<JokeItem | null> {
  const exclude = recentJokes.slice(-RECENT_LIMIT)
  const doc = await pickFromDb(exclude)
  const record = doc ?? { text: LOCAL_JOKES.find((j) => !exclude.includes(j.toLowerCase())) || LOCAL_JOKES[0], provider: 'local' }

  const text = typeof record.text === 'string' ? record.text.trim() : ''
  if (!text) return null

  const provider = typeof record.provider === 'string' && record.provider.trim() ? record.provider.trim() : 'joke'
  const rawSource = record.source && typeof record.source === 'object' ? record.source : null
  const sourceName = rawSource && typeof rawSource.name === 'string' && rawSource.name.trim() ? rawSource.name.trim() : provider
  const sourceUrl = rawSource && typeof rawSource.url === 'string' && rawSource.url ? rawSource.url : undefined
  const tags = Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const keywords = Array.isArray(record.keywords) ? record.keywords.filter((word): word is string => typeof word === 'string') : []

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
  }
}
