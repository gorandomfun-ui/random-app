import type { Collection, Document, Filter, ObjectId } from 'mongodb'

import { getDbSafe } from './data'
import type { RandomContentItem } from './clientTypes'
import type { ItemType, RandomSelectOptions } from './types'
import {
  areWaveItemsFromSameSeries,
  createWaveHint,
  getWaveDescriptorTokens,
  sanitizeWaveHint,
  type WaveSimilarityHint,
} from './wave'
import {
  buildWaveProfile,
  getWaveProfileQueryTokens,
  getWaveProfileSimilarity,
  sanitizeWaveProfile,
  type WaveProfile,
} from './waveProfile'

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
  category?: string | null
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
  obsoleteVideoRuntimeBlockedUntil?: Date | string | null
  waveProfile?: WaveProfile | null
}

type WaveItem = Exclude<RandomContentItem, { type: 'minigame' }>

type WaveSearchOptions = {
  anchor: WaveSimilarityHint
  anchorId?: string
  lang: RandomSelectOptions['lang']
  excludeIds?: string[]
  limit?: number
  types?: ItemType[]
  factVariant?: 'quiz' | 'text'
}

const WAVE_TYPES: ItemType[] = ['image', 'video', 'web', 'quote', 'joke', 'fact']
const MAX_DB_CANDIDATES = 120
const WAVE_QUERY_MAX_TIME_MS = 900
let waveIndexPromise: Promise<void> | null = null

function ensureWaveIndexes(collection: Collection<WaveDocument>) {
  if (!waveIndexPromise) {
    waveIndexPromise = Promise.all([
      collection.createIndex({ tags: 1, type: 1 }, { name: 'idx_wave_tags_type' }),
      collection.createIndex({ keywords: 1, type: 1 }, { name: 'idx_wave_keywords_type' }),
      collection.createIndex({ 'waveProfile.anchors': 1, type: 1 }, { name: 'idx_wave_profile_anchors_type' }),
      collection.createIndex({ 'waveProfile.phrases': 1, type: 1 }, { name: 'idx_wave_profile_phrases_type' }),
      collection.createIndex({ 'waveProfile.concepts': 1, type: 1 }, { name: 'idx_wave_profile_concepts_type' }),
      collection.createIndex({ 'waveProfile.facets': 1, type: 1 }, { name: 'idx_wave_profile_facets_type' }),
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

function normalizeWaveDocument(doc: WaveDocument): WaveItem | null {
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

const AMBIGUOUS_METADATA_TOKENS = new Set([
  'background', 'body', 'color', 'colors', 'end', 'face', 'hand', 'head', 'high', 'low', 'stomach',
])

function documentKey(doc: WaveDocument): string {
  if (doc._id) return `id:${String(doc._id)}`
  const url = trim(doc.url)
  if (url) return `url:${url}`
  return `text:${doc.type || 'unknown'}:${trim(doc.title) || trim(doc.text)}`
}

function itemKey(item: WaveItem): string {
  if ('url' in item && item.url) return `${item.type}:${item.url}`
  if ('text' in item && item.text) return `${item.type}:${item.text.trim().toLowerCase()}`
  return item._id || ''
}

function itemLabelKey(item: WaveItem): string {
  const label = 'title' in item && typeof item.title === 'string'
    ? item.title
    : 'text' in item && typeof item.text === 'string'
      ? item.text
      : ''
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function itemIsQuiz(item: WaveItem): boolean {
  return item.type === 'fact' && item.variant === 'quiz'
}

function sharesAnchorIdentity(anchor: WaveSimilarityHint, candidate: WaveSimilarityHint): boolean {
  if (!anchor.identityKeys.length || !candidate.identityKeys.length) return false
  const anchorKeys = new Set(anchor.identityKeys)
  return candidate.identityKeys.some((key) => anchorKeys.has(key))
}

function sourceForProfile(doc: WaveDocument) {
  return {
    type: doc.type,
    title: doc.title,
    text: doc.text,
    description: doc.description,
    author: doc.author,
    category: doc.quiz?.category || doc.category,
    channelTitle: doc.channelTitle,
    host: doc.host,
    provider: doc.provider,
    tags: doc.tags,
    keywords: doc.keywords,
    variant: doc.variant,
    quiz: doc.quiz,
  }
}

function profileForDocument(doc: WaveDocument): WaveProfile {
  return sanitizeWaveProfile(buildWaveProfile(sourceForProfile(doc)))
}

function profileForHint(hint: WaveSimilarityHint): WaveProfile {
  return sanitizeWaveProfile(buildWaveProfile({
    type: hint.originType,
    title: hint.terms.join(' '),
    tags: hint.tags,
    keywords: hint.keywords,
  }))
}

async function resolveAnchorProfile(
  collection: Collection<WaveDocument>,
  anchorId: string | undefined,
  fallback: WaveSimilarityHint,
): Promise<WaveProfile> {
  if (anchorId && /^[a-f0-9]{24}$/i.test(anchorId)) {
    try {
      const { ObjectId } = await import('mongodb')
      const doc = await collection.findOne({ _id: new ObjectId(anchorId) } as Filter<WaveDocument>)
      if (doc) return profileForDocument(doc)
    } catch {
      /* The client hint remains a fast fallback for non-Mongo identifiers. */
    }
  }
  return profileForHint(fallback)
}

async function getLearnedRelations(
  collection: Collection<Document>,
  anchorProfile: WaveProfile,
): Promise<Map<string, number>> {
  const anchorTerms = [...anchorProfile.phrases, ...anchorProfile.anchors, ...anchorProfile.concepts].slice(0, 12)
  if (!anchorTerms.length) return new Map()
  try {
    const rows = await collection
      .find({ anchorTerm: { $in: anchorTerms }, score: { $gt: 0.5 } }, { maxTimeMS: 250 })
      .sort({ score: -1, positive: -1 })
      .limit(24)
      .toArray()
    const result = new Map<string, number>()
    for (const row of rows) {
      if (typeof row.candidateTerm !== 'string' || typeof row.score !== 'number') continue
      result.set(row.candidateTerm, Math.max(result.get(row.candidateTerm) || 0, Math.min(8, row.score)))
    }
    return result
  } catch {
    return new Map()
  }
}

export async function findWaveTrail({
  anchor: rawAnchor,
  anchorId,
  lang,
  excludeIds = [],
  limit = 10,
  types = WAVE_TYPES,
  factVariant,
}: WaveSearchOptions): Promise<RandomContentItem[]> {
  const anchor = sanitizeWaveHint(rawAnchor)
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
    {
      $or: [
        { type: { $ne: 'video' } },
        {
          type: 'video',
          obsoleteVideoStatus: { $ne: 'obsolete' },
          $or: [
            { obsoleteVideoRuntimeBlockedUntil: { $exists: false } },
            { obsoleteVideoRuntimeBlockedUntil: null },
            { obsoleteVideoRuntimeBlockedUntil: { $lte: new Date() } },
          ],
        },
      ],
    },
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
  const anchorProfile = await resolveAnchorProfile(collection, anchorId, anchor)
  const profileTokens = getWaveProfileQueryTokens(anchorProfile)
  if (!profileTokens.length) return []
  const learnedRelations = await getLearnedRelations(db.collection('wave_relations'), anchorProfile)
  const learnedTokens = Array.from(learnedRelations.keys())
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

  const descriptorTokens = getWaveDescriptorTokens(anchor).slice(0, 12)
  const specificMetadataTokens = descriptorTokens.filter((token) => !AMBIGUOUS_METADATA_TOKENS.has(token))
  const metadataTokens = Array.from(new Set([
    ...specificMetadataTokens,
    ...profileTokens,
    ...learnedTokens,
  ])).slice(0, 32)
  const profileSignalFilter = {
    $or: [
      { 'waveProfile.anchors': { $in: anchorProfile.anchors } },
      { 'waveProfile.phrases': { $in: anchorProfile.phrases } },
      { 'waveProfile.concepts': { $in: anchorProfile.concepts } },
      { 'waveProfile.facets': { $in: anchorProfile.facets } },
      ...(learnedTokens.length ? [
        { 'waveProfile.anchors': { $in: learnedTokens } },
        { 'waveProfile.phrases': { $in: learnedTokens } },
        { 'waveProfile.concepts': { $in: learnedTokens } },
      ] : []),
    ],
  } as Filter<WaveDocument>
  const [profileDocs, metadataDocs] = await Promise.all([
    findCandidates(profileSignalFilter),
    metadataTokens.length
      ? findCandidates({
        $or: [
          { tags: { $in: metadataTokens } },
          { keywords: { $in: metadataTokens } },
        ],
      } as Filter<WaveDocument>)
      : Promise.resolve([]),
  ])

  const candidateGroups = [profileDocs, metadataDocs]
  const docs: WaveDocument[] = []
  const documentKeys = new Set<string>()
  for (const doc of candidateGroups.flat()) {
    const key = documentKey(doc)
    if (!key || documentKeys.has(key)) continue
    documentKeys.add(key)
    docs.push(doc)
  }

  const pairScores = new Map<string, number>()
  if (anchorId && /^[a-f0-9]{24}$/i.test(anchorId)) {
    const candidateIds = docs
      .map((doc) => doc._id)
      .filter((id): id is ObjectId => Boolean(id && typeof id !== 'string'))
    if (candidateIds.length) {
      try {
        const rows = await db.collection('wave_feedback_pairs')
          .find({ anchorId: new ObjectId(anchorId), candidateId: { $in: candidateIds }, score: { $ne: 0 } }, { maxTimeMS: 250 })
          .limit(candidateIds.length)
          .toArray()
        for (const row of rows) {
          if (row.candidateId && typeof row.score === 'number') pairScores.set(String(row.candidateId), row.score)
        }
      } catch {
        /* Pair learning is optional and never blocks candidate generation. */
      }
    }
  }

  const ranked = docs
    .map((doc) => {
      const item = normalizeWaveDocument(doc)
      if (!item) return null
      const hint = createWaveHint(item)
      if (sharesAnchorIdentity(anchor, hint)) return null
      const profile = profileForDocument(doc)
      const details = getWaveProfileSimilarity(anchorProfile, profile)
      const candidateTerms = [...profile.phrases, ...profile.anchors, ...profile.concepts]
      const learnedScore = candidateTerms.reduce((score, term) => Math.max(score, learnedRelations.get(term) || 0), 0)
      const pairScore = doc._id ? Math.max(-8, Math.min(12, pairScores.get(String(doc._id)) || 0)) : 0
      const semanticallyConnected = details.phraseMatches > 0
        || details.anchorMatches > 0
        || details.conceptMatches > 1
        || (details.conceptMatches > 0 && details.facetMatches > 0)
        || details.facetMatches > 1
      if (!semanticallyConnected && learnedScore < 1) return null
      return {
        item,
        score: details.score + learnedScore * 2.5 + pairScore * 2,
        directMatches: semanticallyConnected ? details.directMatches || 1 : 0,
        broadOnly: details.phraseMatches === 0 && details.anchorMatches === 0 && details.conceptMatches <= 1,
        learnedOnly: !semanticallyConnected,
        quality: qualityScore(doc),
        tie: Math.random(),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => (
      Number(left.learnedOnly) - Number(right.learnedOnly)
      || Number(left.broadOnly) - Number(right.broadOnly)
      || right.score - left.score
      || right.quality - left.quality
      || left.tie - right.tie
    ))

  const trail: WaveItem[] = []
  const usedKeys = new Set<string>()
  const usedLabels = new Set<string>()
  const remaining = [...ranked]
  const target = Math.max(1, Math.min(10, limit))
  const typeCounts = new Map<ItemType, number>()
  let quizCount = 0
  let learnedOnlyCount = 0

  while (remaining.length && trail.length < target) {
    const isSelectable = (entry: typeof remaining[number]) => {
      if (learnedOnlyCount >= 1 && entry.learnedOnly) return false
      const key = itemKey(entry.item)
      if (!key || usedKeys.has(key)) return false
      const labelKey = itemLabelKey(entry.item)
      if (labelKey && usedLabels.has(labelKey)) return false
      return !trail.some((selected) => areWaveItemsFromSameSeries(selected, entry.item))
    }

    let nextIndex = remaining.findIndex(isSelectable)
    if (nextIndex < 0) break
    const best = remaining[nextIndex]

    if (quizCount >= 1 && itemIsQuiz(best.item)) {
      const nonQuizIndex = remaining.findIndex((entry) => (
        isSelectable(entry)
        && !itemIsQuiz(entry.item)
        && (entry.directMatches > 0 || entry.score >= best.score * 0.9)
      ))
      if (nonQuizIndex >= 0) nextIndex = nonQuizIndex
    }

    const preferred = remaining[nextIndex]
    if ((typeCounts.get(preferred.item.type) || 0) >= 2) {
      const differentTypeIndex = remaining.findIndex((entry) => (
        isSelectable(entry)
        && entry.item.type !== preferred.item.type
        && entry.directMatches > 0
        && entry.score >= preferred.score * 0.8
      ))
      if (differentTypeIndex >= 0) nextIndex = differentTypeIndex
    }

    const [next] = remaining.splice(nextIndex, 1)
    if (!next) break
    const key = itemKey(next.item)
    const labelKey = itemLabelKey(next.item)
    usedKeys.add(key)
    if (labelKey) usedLabels.add(labelKey)
    trail.push(next.item)
    typeCounts.set(next.item.type, (typeCounts.get(next.item.type) || 0) + 1)
    if (itemIsQuiz(next.item)) quizCount += 1
    if (next.learnedOnly) learnedOnlyCount += 1
  }
  return trail
}
