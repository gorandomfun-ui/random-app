import { getDb } from '@/lib/db'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalProvider,
  markGlobalTopics,
  getRecentOriginsWindow,
  markGlobalOrigin,
  areKeywordsGloballyRecent,
  areTopicsGloballyRecent,
  isGlobalItemRecent,
  isProviderGloballyRecent,
} from './globalState'
import { createDebugContext, finalizeDebugSelection, markFallback, shouldPreferFreshContent, trackReason } from './helpers'
import type { CandidateOrigin, SelectionDebugContext } from './types'
import { ingestImages } from '@/lib/ingest/images'
import type { ImageDocument } from '@/lib/ingest/images'

const DAY_MS = 1000 * 60 * 60 * 24

const FB_IMAGES = [
  'https://images.unsplash.com/photo-1519681393784-d120267933ba',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
  'https://images.unsplash.com/photo-1495567720989-cebdbdd97913',
]

export const FALLBACK_IMAGES = [...FB_IMAGES] as const

const recentImageUrls: string[] = []
const recentImageProviders: string[] = []
const recentImageTags: string[] = []
const recentImageKeywords: string[] = []

type SourceInfo = { name: string; url?: string | null }

export type ImageItem = {
  type: 'image'
  url: string
  thumbUrl: string | null
  source: SourceInfo
}

type ImageRecord = Partial<ImageDocument> & {
  thumbUrl?: string | null
  pageUrl?: string | null
  text?: string | null
  lastShownAt?: Date | string | null
}

export type ImageCandidate = {
  url: string
  item: ImageItem
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function candidateKey(candidate: ImageCandidate): string {
  return candidate.url
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const output: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    output.push(trimmed)
  }
  return output
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function buildImageCandidate(doc: ImageRecord | null | undefined, origin: CandidateOrigin): ImageCandidate | null {
  const url = (doc?.url || '').trim()
  if (!url) return null
  const thumb = doc?.thumb ?? doc?.thumbUrl ?? null
  const provider = (doc?.provider || '').trim() || 'image'
  const rawSource = doc?.source
  const source: SourceInfo = {
    name: typeof rawSource?.name === 'string' && rawSource.name.trim() ? rawSource.name.trim() : provider,
    url: typeof rawSource?.url === 'string' && rawSource.url ? rawSource.url : doc?.pageUrl || url,
  }
  const storedTags = toStringArray(doc?.tags)
  const storedKeywords = toStringArray(doc?.keywords)
  const updatedAt = toDate(doc?.updatedAt)
  const lastShownAt = toDate(doc?.lastShownAt)
  return {
    url,
    item: { type: 'image', url, thumbUrl: thumb, source },
    tags: storedTags,
    keywords: storedKeywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function score(candidate: ImageCandidate): number {
  let score = 0

  if (!recentImageUrls.includes(candidate.url)) score += 10
  else score -= 6

  if (!recentImageProviders.includes(candidate.provider)) score += 4
  else score -= 3

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentImageTags.includes(tag)) score -= 1
    else score += 3
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentImageKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length
  score -= repeatedKeywords

  if (candidate.origin === 'network') score += 5
  else if (candidate.origin === 'db-unseen') score += 3
  else if (candidate.origin === 'db-backlog') score += 2

  if (!candidate.lastShownAt) score += 3
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 4
    else if (days < 2) score -= 1
  }

  score += Math.random()
  return score
}

function shuffleCandidates<T>(items: T[]): T[] {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

async function collectDbCandidates(): Promise<ImageCandidate[]> {
  const db = await getDb()
  const bucket = new Map<string, ImageCandidate>()
  const add = (doc: ImageRecord, origin: CandidateOrigin) => {
    const candidate = buildImageCandidate(doc, origin)
    if (!candidate) return
    const key = candidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000
  const unseenFilter = { $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }
  const backlogFilter = { lastShownAt: { $lt: new Date(now - 14 * DAY) } }

  const collection = db.collection<ImageRecord>('items')
  const [fresh, unseen, backlog, randomDocs] = await Promise.all([
    collection.find({ type: 'image' }).sort({ updatedAt: -1 }).limit(120).toArray(),
    collection.find({ type: 'image', ...unseenFilter }).sort({ updatedAt: -1 }).limit(80).toArray(),
    collection.find({ type: 'image', ...backlogFilter }).sort({ lastShownAt: 1 }).limit(80).toArray(),
    collection.aggregate([{ $match: { type: 'image' } }, { $sample: { size: 60 } }]).toArray(),
  ])

  fresh.forEach((doc) => add(doc, 'db-fresh'))
  unseen.forEach((doc) => add(doc, 'db-unseen'))
  backlog.forEach((doc) => add(doc, 'db-backlog'))
  randomDocs.forEach((doc) => add(doc, 'db-random'))

  return Array.from(bucket.values())
}

async function loadNetworkCandidates(queries?: string[]): Promise<ImageCandidate[]> {
  // Reuse ingestImages helper to keep metadata consistent
  const q = Array.isArray(queries) && queries.length ? queries : []
  const result = await ingestImages({ queries: q.length ? q : ['weird collage'], perQuery: 20 })
  if (!result.scanned) return []

  const db = await getDb()
  const urls = await db
    .collection<ImageRecord>('items')
    .find({ type: 'image' })
    .sort({ createdAt: -1 })
    .limit(result.unique)
    .project({ url: 1, tags: 1, keywords: 1, provider: 1, source: 1, updatedAt: 1, thumb: 1, thumbUrl: 1, lastShownAt: 1, pageUrl: 1 })
    .toArray()

  return urls
    .map((doc) => buildImageCandidate(doc, 'network'))
    .filter((cand): cand is ImageCandidate => Boolean(cand))
}

export async function selectImage(debugEnabled: boolean, queryHints?: string[]): Promise<ImageItem> {
  const candidateMap = new Map<string, ImageCandidate>()
  const add = (candidate: ImageCandidate | null) => {
    if (!candidate) return
    const key = candidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const networkCandidates = await loadNetworkCandidates(queryHints).catch(() => [])
  networkCandidates.forEach(add)

  const dbCandidates = await collectDbCandidates()
  dbCandidates.forEach(add)

  const scored = shuffleCandidates(Array.from(candidateMap.values()))
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .filter(({ score }) => Number.isFinite(score))

  const debug = createDebugContext(debugEnabled, scored.length)
  const preferFresh = shouldPreferFreshContent(getRecentOriginsWindow(10))
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  let relaxedCandidate: ImageCandidate | null = null

  for (const { candidate } of scored) {
    if (!relaxedCandidate) relaxedCandidate = candidate

    const key = candidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('image', key)
    const allTagsRecent = candidate.tags.every((tag) => recentImageTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentImageKeywords.includes(word))
      : false
    const topicsGloballyTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsGloballyTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 2) {
      trackReason(debug, 'globallyRecent')
      continue
    }
    if ((allTagsRecent && allKeywordsRecent) && scored.length > 2) {
      trackReason(debug, 'allRecent')
      continue
    }
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 2) {
      trackReason(debug, 'globalTopics')
      continue
    }
    if (providerGloballyTired && scored.length > 3 && (!preferFresh || candidate.origin !== 'network')) {
      trackReason(debug, 'providerFatigue')
      continue
    }
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 2) {
      trackReason(debug, 'preferFresh')
      continue
    }

    const item = await finalizeSelection(candidate, debug, false)
    if (item) return item
  }

  if (relaxedCandidate) {
    const item = await finalizeSelection(relaxedCandidate, debug, true)
    if (item) return item
  }

  markFallback(debug)
  return {
    type: 'image',
    url: FB_IMAGES[Math.floor(Math.random() * FB_IMAGES.length)],
    thumbUrl: null,
    source: { name: 'Unsplash', url: FB_IMAGES[0] },
  }
}

async function finalizeSelection(candidate: ImageCandidate, debug: SelectionDebugContext | null, relaxed: boolean): Promise<ImageItem | null> {
  const key = candidateKey(candidate)
  if (!key) return null

  await touch(candidate)
  finalizeDebugSelection(debug, key, relaxed)
  markGlobalItem('image', key)
  markGlobalTopics(candidate.tags)
  markGlobalKeywords(candidate.keywords)
  markGlobalProvider(candidate.provider)
  markGlobalOrigin(candidate.origin)

  recentImageUrls.push(candidate.url)
  while (recentImageUrls.length > 80) recentImageUrls.shift()
  recentImageProviders.push(candidate.provider)
  while (recentImageProviders.length > 24) recentImageProviders.shift()
  recentImageTags.push(...candidate.tags)
  while (recentImageTags.length > 80) recentImageTags.shift()
  recentImageKeywords.push(...candidate.keywords)
  while (recentImageKeywords.length > 120) recentImageKeywords.shift()

  return candidate.item
}

async function touch(candidate: ImageCandidate) {
  const db = await getDb()
  await db.collection('items').updateOne({ type: 'image', url: candidate.url }, { $set: { lastShownAt: new Date() } })
}
