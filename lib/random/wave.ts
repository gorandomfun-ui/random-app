import type { Document, Filter } from 'mongodb'

import type { ItemType } from './types'

export type WaveSimilarityHint = {
  originType?: ItemType
  tags: string[]
  keywords: string[]
  terms: string[]
  facets: string[]
  provider?: string
  tone?: 'positive' | 'neutral' | 'negative'
}

export type WaveSimilarityDetails = {
  score: number
  specificMatches: number
  tagMatches: number
  keywordMatches: number
  termMatches: number
  facetMatches: number
  strongTokenMatches: number
}

type WaveSourceItem = {
  type?: string
  text?: string | null
  title?: string | null
  description?: string | null
  author?: string | null
  category?: string | null
  host?: string | null
  provider?: string | null
  source?: { name?: string | null } | null
  tags?: string[] | null
  keywords?: string[] | null
  tone?: 'positive' | 'neutral' | 'negative' | null
}

const STOP_TERMS = new Set([
  'about', 'after', 'again', 'alongside', 'also', 'and', 'are', 'avec', 'been', 'before', 'being', 'but',
  'can', 'dans', 'das', 'des', 'die', 'ein', 'elle', 'est', 'for', 'from', 'für', 'has', 'have', 'how',
  'ist', 'les', 'mais', 'more', 'not', 'official', 'our', 'pour', 'que', 'qui', 'sur', 'than', 'that', 'the',
  'their', 'this', 'une', 'von', 'was', 'were', 'what', 'when', 'where', 'which', 'with', 'you', 'your',
])

const PLATFORM_TERMS = new Set([
  'dailymotion', 'facebook', 'giphy', 'instagram', 'pexels', 'pixabay', 'reddit', 'tiktok', 'twitter',
  'unsplash', 'vimeo', 'youtube', 'youtu', 'http', 'https', 'www',
])

const LOW_SIGNAL_TERMS = new Set([
  'animated', 'animation', 'channel', 'clip', 'compilation', 'content', 'daily', 'entertainment', 'episode',
  'fail', 'fails', 'footage', 'funny', 'game', 'general', 'image', 'informatief', 'informative', 'latest',
  'laugh', 'lifestyle', 'like', 'look', 'looks', 'make', 'makes', 'making', 'media', 'misc', 'model', 'music',
  'name', 'nature', 'news', 'part', 'random', 'regional', 'search', 'season', 'shorts', 'show', 'social',
  'song', 'street', 'television', 'today', 'tone', 'trend', 'trending', 'video', 'viral', 'watch', 'year',
  'country', 'episode', 'movie', 'film', 'photo', 'picture', 'series', 'story', 'talk', 'time', 'world', 'people',
  'person', 'woman', 'women', 'man', 'men', 'young', 'new', 'best', 'great', 'first', 'last', 'live', 'full',
  'short', 'long', 'review', 'online', 'officially', 'event', 'update', 'report', 'special', 'top', 'topten',
  'del', 'los', 'las', 'una', 'uno', 'para', 'por', 'con', 'como', 'esta', 'este', 'mundo', 'sobre', 'entre',
  'uma', 'dos', 'das', 'com', 'sem', 'mais', 'muito', 'muita', 'pelo', 'pela', 'para', 'star', 'stars',
  'project', 'stock', 'bizarre', 'weird', 'strange', 'absurd', 'absurdity',
])

const FACET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:retro|vintage|nostalgi\w*|old[ -]?school)\b/i, 'era-retro'],
  [/\b(?:archive|archival|found[ -]?footage|lost[ -]?tape)\b/i, 'format-archive'],
  [/\b(?:advert\w*|commercial|infomercial|promo|publicit\w*|werbung)\b/i, 'format-ad'],
  [/\b(?:meme|funny|comedy|comic|humou?r|parody|spoof)\b/i, 'mood-funny'],
  [/\b(?:weird|strange|odd|bizarre|surreal|absurd)\b/i, 'mood-weird'],
  [/\b(?:tutorial|guide|how[ -]?to|diy)\b/i, 'format-how-to'],
  [/\b(?:animation|animated|cartoon|anime)\b/i, 'format-animation'],
  [/\b(?:music|song|concert|live[ -]?music|music[ -]?video)\b/i, 'topic-music'],
  [/\b(?:fashion|outfit|clothing|garment|runway)\b/i, 'topic-fashion'],
  [/\b(?:science|space|technology|tech|computer|robot)\b/i, 'topic-tech'],
  [/\b(?:sport|football|soccer|basketball|tennis|skate)\b/i, 'topic-sport'],
  [/\b(?:nature|animal|wildlife|ocean|forest)\b/i, 'topic-nature'],
  [/\b(?:19[5-9]\d|200\d|[5-9]0s|y2k)\b/i, 'era-dated'],
]

export const WAVE_MIN_SIMILARITY_SCORE = 5

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

function isUseful(value: string): boolean {
  return value.length >= 3
    && value.length <= 48
    && !STOP_TERMS.has(value)
    && !PLATFORM_TERMS.has(value)
    && !LOW_SIGNAL_TERMS.has(value)
    && !value.startsWith('tone-')
    && !/^\d+$/.test(value)
    && !/^[5-9]0s$/.test(value)
}

function uniqueUseful(values: Array<string | null | undefined>, limit: number): string[] {
  const result: string[] = []
  for (const raw of values) {
    if (typeof raw !== 'string') continue
    const value = normalize(raw)
    if (!isUseful(value) || result.includes(value)) continue
    result.push(value)
    if (result.length >= limit) break
  }
  return result
}

function extractTerms(value: string, limit = 16): string[] {
  return uniqueUseful(value.replace(/[^a-zA-Z0-9À-ž]+/g, ' ').split(/\s+/), limit)
}

function extractFacets(values: string[]): string[] {
  const source = values.join(' ')
  return FACET_PATTERNS.filter(([pattern]) => pattern.test(source)).map(([, facet]) => facet)
}

export function createWaveHint(item: WaveSourceItem): WaveSimilarityHint {
  const descriptor = [item.title, item.text, item.description, item.author, item.category, item.host]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ')
  const tags = uniqueUseful(item.tags || [], 12)
  const keywords = uniqueUseful(item.keywords || [], 16)
  const terms = extractTerms(descriptor, 16)
  return {
    originType: item.type === 'image' || item.type === 'video' || item.type === 'web' || item.type === 'quote' || item.type === 'joke' || item.type === 'fact'
      ? item.type
      : undefined,
    tags,
    keywords,
    terms,
    facets: extractFacets([descriptor, ...(item.tags || []), ...(item.keywords || [])]),
    provider: uniqueUseful([item.provider, item.source?.name], 1)[0],
    tone: item.tone || undefined,
  }
}

export function mergeWaveHints(anchor: WaveSimilarityHint, current: WaveSimilarityHint): WaveSimilarityHint {
  return {
    originType: anchor.originType,
    tags: uniqueUseful([...anchor.tags, ...current.tags], 14),
    keywords: uniqueUseful([...anchor.keywords, ...current.keywords], 18),
    terms: uniqueUseful([...anchor.terms, ...current.terms], 18),
    facets: uniqueUseful([...anchor.facets, ...current.facets], 12),
    provider: anchor.provider || current.provider,
    tone: anchor.tone || current.tone,
  }
}

export function sanitizeWaveHint(input: Partial<WaveSimilarityHint>): WaveSimilarityHint {
  return {
    originType: input.originType === 'image' || input.originType === 'video' || input.originType === 'web'
      || input.originType === 'quote' || input.originType === 'joke' || input.originType === 'fact'
      ? input.originType
      : undefined,
    tags: uniqueUseful(Array.isArray(input.tags) ? input.tags : [], 14),
    keywords: uniqueUseful(Array.isArray(input.keywords) ? input.keywords : [], 18),
    terms: uniqueUseful(Array.isArray(input.terms) ? input.terms : [], 18),
    facets: uniqueUseful(Array.isArray(input.facets) ? input.facets : [], 12),
    provider: uniqueUseful([input.provider], 1)[0],
    tone: input.tone === 'positive' || input.tone === 'neutral' || input.tone === 'negative' ? input.tone : undefined,
  }
}

export function getWaveQueryTokens(hint: WaveSimilarityHint): string[] {
  const clean = sanitizeWaveHint(hint)
  return uniqueUseful([...clean.tags, ...clean.keywords, ...clean.terms], 32)
}

export function getWaveDescriptorTokens(hint: WaveSimilarityHint): string[] {
  return uniqueUseful(hint.terms, 8)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildWaveSimilarityMatches<T extends Document>(hint?: WaveSimilarityHint): Filter<T>[] {
  if (!hint) return []
  const tokens = getWaveQueryTokens(hint)
  if (!tokens.length) return []
  const descriptorRegex = new RegExp(`\\b(?:${tokens.slice(0, 8).map(escapeRegex).join('|')})\\b`, 'i')
  return [{
    $or: [
      { tags: { $in: tokens } },
      { keywords: { $in: tokens } },
      { title: descriptorRegex },
      { text: descriptorRegex },
      { description: descriptorRegex },
    ],
  } as unknown as Filter<T>]
}

function overlap(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map(normalize))
  return left.map(normalize).filter((value, index, values) => rightSet.has(value) && values.indexOf(value) === index)
}

export function getWaveSimilarityDetails(anchor: WaveSimilarityHint, candidate: WaveSimilarityHint): WaveSimilarityDetails {
  const tagMatches = overlap(anchor.tags, candidate.tags).length
  const keywordMatches = overlap(anchor.keywords, candidate.keywords).length
  const termMatches = overlap(anchor.terms, candidate.terms).length
  const crossMatches = overlap(
    [...anchor.tags, ...anchor.keywords, ...anchor.terms],
    [...candidate.tags, ...candidate.keywords, ...candidate.terms],
  )
  const facetMatches = overlap(anchor.facets, candidate.facets).length
  const specificMatches = crossMatches.length
  const strongTokenMatches = overlap(
    [...anchor.keywords, ...anchor.terms],
    [...candidate.keywords, ...candidate.terms],
  ).filter((value) => value.length >= 6).length
  const toneScore = anchor.tone && candidate.tone === anchor.tone ? 0.2 : 0
  const typeScore = anchor.originType && candidate.originType === anchor.originType ? 0.15 : 0
  const score = tagMatches * 7 + keywordMatches * 4 + termMatches * 4 + specificMatches * 1.5 + facetMatches * 2.5 + toneScore + typeScore
  return { score, specificMatches, tagMatches, keywordMatches, termMatches, facetMatches, strongTokenMatches }
}

export function scoreWaveSimilarity(anchor: WaveSimilarityHint, candidate: WaveSimilarityHint): number {
  return getWaveSimilarityDetails(anchor, candidate).score
}

export function isStrongWaveMatch(anchor: WaveSimilarityHint, candidate: WaveSimilarityHint): boolean {
  const details = getWaveSimilarityDetails(anchor, candidate)
  return details.score >= WAVE_MIN_SIMILARITY_SCORE
    && (details.specificMatches >= 2 || details.strongTokenMatches >= 1 || details.facetMatches >= 2)
}

export function hasWaveSignal(hint: WaveSimilarityHint): boolean {
  return Boolean(hint.tags.length || hint.keywords.length || hint.terms.length || hint.facets.length >= 2)
}
