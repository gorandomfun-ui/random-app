import type { Collection, Document, Filter, ObjectId } from 'mongodb'

import { getDbSafe } from './data'
import type { RandomContentItem } from './clientTypes'
import type { ItemType, RandomSelectOptions } from './types'
import {
  createWaveHint,
  getWaveDescriptorTokens,
  getWaveQueryTokens,
  isStrongWaveMatch,
  mergeWaveHints,
  sanitizeWaveHint,
  scoreWaveSimilarity,
  type WaveSimilarityHint,
} from './wave'

type WaveDocument = Document & {
  _id?: ObjectId | string
  type?: ItemType
  url?: string | null
  videoId?: string | null
  thumb?: string | null
  thumbUrl?: string | null
  title?: string | null
  text?: string | null
  description?: string | null
  channelTitle?: string | null
  author?: string | null
  provider?: string | null
  source?: { name?: string | null; url?: string | null } | null
  pageUrl?: string | null
  ogImage?: string | null
  host?: string | null
  tags?: string[] | null
  keywords?: string[] | null
  tone?: 'positive' | 'neutral' | 'negative' | null
  toneConfidence?: number | null
  toneSignals?: string[] | null
  variant?: 'text' | 'quiz' | 'ai' | null
  lang?: string | null
  languageScope?: 'universal' | 'localized' | null
  ai?: { source?: string; model?: string; generatedAt?: string } | null
  disclaimer?: string | null
  quiz?: {
    id?: string
    question?: string
    options?: string[]
    correctIndex?: number
    correctIndices?: number[]
    answer?: string
    category?: string
    difficulty?: 'easy' | 'medium' | 'hard'
  } | null
  hash?: string | null
  quality?: number | null
  showWeight?: number | null
  likeCount?: number | null
  isSuppressed?: boolean | null
  obsoleteVideoStatus?: string | null
}

type WaveSearchOptions = {
  anchor: WaveSimilarityHint
  lang: RandomSelectOptions['lang']
  excludeIds?: string[]
  limit?: number
  types?: ItemType[]
  factVariant?: 'quiz' | 'text'
}

const WAVE_TYPES: ItemType[] = ['image', 'video', 'web', 'quote', 'joke', 'fact']
const MAX_DB_CANDIDATES = 80
const WAVE_QUERY_MAX_TIME_MS = 900
let waveIndexPromise: Promise<void> | null = null

function ensureWaveIndexes(collection: Collection<WaveDocument>) {
  if (!waveIndexPromise) {
    waveIndexPromise = Promise.all([
      collection.createIndex({ tags: 1, type: 1 }, { name: 'idx_wave_tags_type' }),
      collection.createIndex({ keywords: 1, type: 1 }, { name: 'idx_wave_keywords_type' }),
    ])
      .then(() => undefined)
      .catch(() => {
        waveIndexPromise = null
      })
  }
  return waveIndexPromise
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())) : []
}

function source(doc: WaveDocument, fallback: string, url?: string) {
  const name = trim(doc.source?.name) || fallback
  const sourceUrl = trim(doc.source?.url) || url || undefined
  return { name, ...(sourceUrl ? { url: sourceUrl } : {}) }
}

function common(doc: WaveDocument) {
  return {
    _id: doc._id ? String(doc._id) : undefined,
    tags: strings(doc.tags),
    keywords: strings(doc.keywords),
    tone: doc.tone || undefined,
    toneConfidence: typeof doc.toneConfidence === 'number' ? doc.toneConfidence : undefined,
    toneSignals: strings(doc.toneSignals),
  }
}

function normalizeWaveDocument(doc: WaveDocument): RandomContentItem | null {
  const provider = trim(doc.provider) || trim(doc.source?.name) || doc.type || 'random'
  const metadata = common(doc)

  if (doc.type === 'image') {
    const url = trim(doc.url)
    if (!url) return null
    return {
      ...metadata,
      type: 'image',
      url,
      thumbUrl: trim(doc.thumb) || trim(doc.thumbUrl) || null,
      title: trim(doc.title) || trim(doc.description) || undefined,
      provider,
      source: source(doc, provider, trim(doc.pageUrl) || url),
      pageUrl: trim(doc.pageUrl) || undefined,
    }
  }

  if (doc.type === 'video') {
    const videoId = trim(doc.videoId)
    const url = trim(doc.url) || (videoId ? `https://youtu.be/${videoId}` : '')
    if (!url) return null
    return {
      ...metadata,
      type: 'video',
      url,
      thumbUrl: trim(doc.thumb) || trim(doc.thumbUrl) || undefined,
      text: trim(doc.title) || trim(doc.text) || undefined,
      provider,
      source: source(doc, provider, url),
    }
  }

  if (doc.type === 'web') {
    const url = trim(doc.url)
    if (!url) return null
    let host = trim(doc.host)
    if (!host) {
      try { host = new URL(url).host.replace(/^www\./, '') } catch {}
    }
    return {
      ...metadata,
      type: 'web',
      url,
      text: trim(doc.title) || trim(doc.text) || host || url,
      ogImage: trim(doc.ogImage) || null,
      provider,
      source: source(doc, provider, url),
      host: host || null,
    }
  }

  if (doc.type === 'quote') {
    const text = trim(doc.text)
    if (!text) return null
    return {
      ...metadata,
      type: 'quote',
      text,
      author: trim(doc.author),
      provider,
      source: source(doc, provider),
      variant: doc.variant === 'ai' ? 'ai' : 'text',
      lang: trim(doc.lang) || undefined,
      ai: doc.ai || null,
      disclaimer: trim(doc.disclaimer) || undefined,
    }
  }

  if (doc.type === 'joke') {
    const text = trim(doc.text)
    if (!text) return null
    return {
      ...metadata,
      type: 'joke',
      text,
      provider,
      source: source(doc, provider),
      variant: doc.variant === 'ai' ? 'ai' : 'text',
      lang: trim(doc.lang) || undefined,
      ai: doc.ai || null,
      disclaimer: trim(doc.disclaimer) || undefined,
    }
  }

  if (doc.type === 'fact') {
    const text = trim(doc.text)
    if (!text) return null
    if (doc.variant === 'quiz' && doc.quiz) {
      const question = trim(doc.quiz.question) || text
      const options = strings(doc.quiz.options)
      const correctIndex = typeof doc.quiz.correctIndex === 'number' ? doc.quiz.correctIndex : -1
      if (options.length < 2 || correctIndex < 0 || correctIndex >= options.length) return null
      return {
        ...metadata,
        type: 'fact',
        variant: 'quiz',
        id: trim(doc.quiz.id) || trim(doc.hash) || String(doc._id || question),
        text: question,
        question,
        options,
        correctIndex,
        correctIndices: Array.isArray(doc.quiz.correctIndices) ? doc.quiz.correctIndices : undefined,
        answer: trim(doc.quiz.answer) || options[correctIndex],
        provider,
        source: source(doc, provider),
        category: trim(doc.quiz.category) || undefined,
        difficulty: doc.quiz.difficulty,
      }
    }
    return {
      ...metadata,
      type: 'fact',
      variant: doc.variant === 'ai' ? 'ai' : 'text',
      text,
      provider,
      source: source(doc, provider),
      lang: trim(doc.lang) || undefined,
      ai: doc.ai || null,
      disclaimer: trim(doc.disclaimer) || undefined,
    }
  }

  return null
}

function languageMatch(lang: RandomSelectOptions['lang']): Filter<WaveDocument> {
  if (!lang || lang === 'unknown') return {}
  return {
    $or: [
      { languageScope: { $exists: false } },
      { languageScope: null },
      { languageScope: 'universal' },
      { languageScope: 'localized', lang },
    ],
  } as Filter<WaveDocument>
}

function qualityScore(doc: WaveDocument): number {
  return (typeof doc.quality === 'number' ? doc.quality : 0)
    + (typeof doc.showWeight === 'number' ? doc.showWeight : 0)
    + Math.min(2, Math.log10(Math.max(1, typeof doc.likeCount === 'number' ? doc.likeCount : 0)))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function documentKey(doc: WaveDocument): string {
  if (doc._id) return `id:${String(doc._id)}`
  const url = trim(doc.url)
  if (url) return `url:${url}`
  return `text:${doc.type || 'unknown'}:${trim(doc.title) || trim(doc.text)}`
}

function itemKey(item: RandomContentItem): string {
  if ('url' in item && item.url) return `${item.type}:${item.url}`
  if ('text' in item && item.text) return `${item.type}:${item.text.trim().toLowerCase()}`
  return item._id || ''
}

function itemProvider(item: RandomContentItem): string {
  if ('provider' in item && typeof item.provider === 'string' && item.provider.trim()) {
    return item.provider.trim().toLowerCase()
  }
  if ('source' in item && item.source?.name) return item.source.name.trim().toLowerCase()
  return ''
}

function itemGroup(item: RandomContentItem): 'image' | 'video' | 'web' | 'text' {
  if (item.type === 'image' || item.type === 'video' || item.type === 'web') return item.type
  return 'text'
}

function itemLabelKey(item: RandomContentItem): string {
  const label = 'title' in item && typeof item.title === 'string'
    ? item.title
    : 'text' in item && typeof item.text === 'string'
      ? item.text
      : ''
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function findWaveTrail({
  anchor: rawAnchor,
  lang,
  excludeIds = [],
  limit = 10,
  types = WAVE_TYPES,
  factVariant,
}: WaveSearchOptions): Promise<RandomContentItem[]> {
  const anchor = sanitizeWaveHint(rawAnchor)
  const tokens = getWaveQueryTokens(anchor)
  const descriptorTokens = getWaveDescriptorTokens(anchor)
  if (!tokens.length && !descriptorTokens.length) return []
  const db = await getDbSafe()
  if (!db) return []

  const validIds = excludeIds.filter((value) => /^[a-f0-9]{24}$/i.test(value)).slice(0, 80)
  const { ObjectId } = await import('mongodb')
  const excludedObjectIds = validIds.map((value) => new ObjectId(value))
  const selectedTypes = WAVE_TYPES.filter((type) => types.includes(type))
  if (!selectedTypes.length) return []

  const sharedFilters: Filter<WaveDocument>[] = [
    { type: { $in: selectedTypes } },
    { isSuppressed: { $ne: true } },
    { $or: [{ type: { $ne: 'video' } }, { obsoleteVideoStatus: { $ne: 'obsolete' } }] },
    languageMatch(lang),
  ]
  if (excludedObjectIds.length) sharedFilters.push({ _id: { $nin: excludedObjectIds } } as Filter<WaveDocument>)
  if (factVariant) {
    sharedFilters.push({
      $or: [
        { type: { $ne: 'fact' } },
        { type: 'fact', variant: factVariant === 'quiz' ? 'quiz' : { $ne: 'quiz' } },
      ],
    } as Filter<WaveDocument>)
  } else if (anchor.originType !== 'fact') {
    sharedFilters.push({ $or: [{ type: { $ne: 'fact' } }, { variant: { $ne: 'quiz' } }] } as Filter<WaveDocument>)
  }

  const collection = db.collection<WaveDocument>('items')
  void ensureWaveIndexes(collection)
  const findCandidates = async (signalFilter: Filter<WaveDocument>) => {
    try {
      return await collection
        .find({ $and: [...sharedFilters, signalFilter] } as Filter<WaveDocument>, { maxTimeMS: WAVE_QUERY_MAX_TIME_MS })
        .limit(MAX_DB_CANDIDATES)
        .toArray()
    } catch {
      return []
    }
  }

  const descriptorRegex = descriptorTokens.length
    ? new RegExp(`\\b(?:${descriptorTokens.map(escapeRegExp).join('|')})\\b`, 'i')
    : null
  const [metadataDocs, descriptorDocs] = await Promise.all([
    tokens.length
      ? findCandidates({ $or: [{ tags: { $in: tokens } }, { keywords: { $in: tokens } }] } as Filter<WaveDocument>)
      : Promise.resolve([]),
    descriptorRegex
      ? findCandidates({
        $or: [
          { title: descriptorRegex },
          { text: descriptorRegex },
          { description: descriptorRegex },
          { author: descriptorRegex },
          { category: descriptorRegex },
          { channelTitle: descriptorRegex },
          { host: descriptorRegex },
        ],
      } as Filter<WaveDocument>)
      : Promise.resolve([]),
  ])

  const candidateGroups = [metadataDocs, descriptorDocs]
  const docs: WaveDocument[] = []
  const documentKeys = new Set<string>()
  for (const doc of candidateGroups.flat()) {
    const key = documentKey(doc)
    if (!key || documentKeys.has(key)) continue
    documentKeys.add(key)
    docs.push(doc)
  }

  const ranked = docs
    .map((doc) => {
      const item = normalizeWaveDocument(doc)
      if (!item) return null
      return {
        item,
        score: scoreWaveSimilarity(anchor, createWaveHint(item)),
        quality: qualityScore(doc),
        tie: Math.random(),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && isStrongWaveMatch(anchor, createWaveHint(entry.item))))
    .sort((left, right) => right.score - left.score || right.quality - left.quality || left.tie - right.tie)

  const trail: RandomContentItem[] = []
  const usedKeys = new Set<string>()
  const usedLabels = new Set<string>()
  const providerCounts = new Map<string, number>()
  const groupCounts = new Map<ReturnType<typeof itemGroup>, number>()
  const remaining = [...ranked]
  const target = Math.max(1, Math.min(8, limit))
  let previousHint: WaveSimilarityHint | null = null

  while (remaining.length && trail.length < target) {
    remaining.sort((left, right) => {
      if (!previousHint) return right.score - left.score || right.quality - left.quality || left.tie - right.tie
      const flowAnchor = mergeWaveHints(anchor, previousHint)
      const leftFlow = scoreWaveSimilarity(flowAnchor, createWaveHint(left.item))
      const rightFlow = scoreWaveSimilarity(flowAnchor, createWaveHint(right.item))
      return rightFlow - leftFlow || right.score - left.score || right.quality - left.quality || left.tie - right.tie
    })
    const providerIsAvailable = (item: RandomContentItem) => {
      const provider = itemProvider(item)
      return !provider || (providerCounts.get(provider) ?? 0) < 2
    }
    let diverseIndex = remaining.findIndex(({ item }) => (
      providerIsAvailable(item) && (groupCounts.get(itemGroup(item)) ?? 0) < 2
    ))
    if (diverseIndex < 0) {
      diverseIndex = remaining.findIndex(({ item }) => providerIsAvailable(item))
    }
    if (diverseIndex < 0) break
    const [next] = remaining.splice(diverseIndex, 1)
    if (!next) break
    const key = itemKey(next.item)
    if (!key || usedKeys.has(key)) continue
    const labelKey = itemLabelKey(next.item)
    if (labelKey && usedLabels.has(labelKey)) continue
    usedKeys.add(key)
    if (labelKey) usedLabels.add(labelKey)
    trail.push(next.item)
    const provider = itemProvider(next.item)
    if (provider) providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1)
    const group = itemGroup(next.item)
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1)
    previousHint = createWaveHint(next.item)
  }
  return trail
}
