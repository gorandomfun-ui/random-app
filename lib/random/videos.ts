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
import { ingestVideos } from '@/lib/ingest/videos'
import type { VideoDocument } from '@/lib/ingest/videos'

const DAY_MS = 1000 * 60 * 60 * 24

const recentVideoTopics: string[] = []
const recentVideoProviders: string[] = []
const recentVideoKeywords: string[] = []
const recentVideoIds: string[] = []

const NETWORK_VIDEO_QUERIES = [
  'weird archive documentary',
  'retro craft tutorial',
  'tiny desk style cover',
  'street performance folk music',
  'analog animation short film',
  'odd vintage commercial',
  'experimental orchestra rehearsal',
  'satisfying diy restoration',
  'lofi travel vlog vintage',
  'public access tv variety',
]

const REDDIT_VIDEO_SOURCES = ['funnyvideos', 'ObscureMedia', 'DeepIntoYouTube', 'Unexpected', 'InternetIsBeautiful']

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

type VideoSourceInfo = { name: string; url?: string | null }

export type VideoItem = {
  type: 'video'
  url: string
  thumbUrl?: string
  text?: string
  source: VideoSourceInfo
  provider: string
}

type VideoRecord = Partial<VideoDocument> & {
  url?: string | null
  text?: string | null
  lastShownAt?: Date | string | null
}

export type VideoCandidate = {
  mapped: {
    item: VideoItem
    key: { videoId?: string; url?: string }
    provider: string
  }
  tags: string[]
  keywords: string[]
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

export function candidateKey(candidate: VideoCandidate): string | null {
  const key = candidate.mapped.key.videoId || candidate.mapped.key.url
  return key || null
}

function markRecentVideoProvider(provider?: string | null) {
  const key = (provider || '').trim().toLowerCase()
  if (!key) return
  const idx = recentVideoProviders.indexOf(key)
  if (idx >= 0) recentVideoProviders.splice(idx, 1)
  recentVideoProviders.push(key)
  if (recentVideoProviders.length > 8) recentVideoProviders.shift()
}

function markRecentVideoTopics(tags: string[]) {
  for (const tag of tags) {
    const key = tag.trim().toLowerCase()
    if (!key) continue
    const idx = recentVideoTopics.indexOf(key)
    if (idx >= 0) recentVideoTopics.splice(idx, 1)
    recentVideoTopics.push(key)
  }
  while (recentVideoTopics.length > 20) recentVideoTopics.shift()
}

function markRecentVideoKeywords(words: string[]) {
  for (const word of words) {
    const key = word.trim().toLowerCase()
    if (!key) continue
    const idx = recentVideoKeywords.indexOf(key)
    if (idx >= 0) recentVideoKeywords.splice(idx, 1)
    recentVideoKeywords.push(key)
  }
  while (recentVideoKeywords.length > 90) recentVideoKeywords.shift()
}

function markRecentVideo(id: string) {
  const idx = recentVideoIds.indexOf(id)
  if (idx >= 0) recentVideoIds.splice(idx, 1)
  recentVideoIds.push(id)
  if (recentVideoIds.length > 20) recentVideoIds.shift()
}

function score(candidate: VideoCandidate): number {
  const key = candidateKey(candidate)
  if (!key) return -Infinity

  const providerKey = (candidate.mapped.provider || '').toLowerCase()
  const now = Date.now()
  const updatedAt = candidate.updatedAt?.getTime() ?? 0
  const lastShownAt = candidate.lastShownAt?.getTime() ?? 0

  let score = 0

  if (!lastShownAt) score += 14
  else {
    const daysSinceShown = (now - lastShownAt) / DAY_MS
    if (daysSinceShown > 21) score += 9
    else if (daysSinceShown > 14) score += 7
    else if (daysSinceShown > 7) score += 5
    else if (daysSinceShown > 3) score += 2
    else score -= 3
  }

  if (updatedAt) {
    const daysSinceUpdate = (now - updatedAt) / DAY_MS
    if (daysSinceUpdate < 2) score += 8
    else if (daysSinceUpdate < 7) score += 5
    else if (daysSinceUpdate < 21) score += 2
    else score -= 1
  } else {
    score -= 1
  }

  if (candidate.origin === 'network') score += 6
  else if (candidate.origin === 'db-unseen') score += 4
  else if (candidate.origin === 'db-backlog') score += 2

  if (!recentVideoProviders.includes(providerKey)) score += 5
  else score -= 4

  const tagSet = new Set(candidate.tags)
  let freshTagBoost = 0
  let repeatTagPenalty = 0
  for (const tag of tagSet) {
    if (recentVideoTopics.includes(tag)) repeatTagPenalty += 3
    else freshTagBoost += 5
  }
  score += freshTagBoost - repeatTagPenalty

  const uniqueKeywords = candidate.keywords.filter((word) => !recentVideoKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.2
  score -= repeatedKeywords * 1.8

  if (key && recentVideoIds.includes(key)) score -= 6

  score += Math.random() * 2
  return score
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

async function collectDbCandidates(): Promise<VideoCandidate[]> {
  const db = await getDb()
  const bucket = new Map<string, VideoCandidate>()
  const add = (doc: VideoRecord, origin: CandidateOrigin) => {
    const candidate = buildVideoCandidate(doc, origin)
    if (!candidate) return
    const key = candidateKey(candidate)
    if (!key) return
    const existing = bucket.get(key)
    if (!existing || (candidate.origin === 'network' && existing.origin !== 'network')) {
      bucket.set(key, candidate)
    }
  }

  const collection = db.collection<VideoRecord>('items')
  const now = Date.now()
  const stale = new Date(now - 14 * DAY_MS)

  const [freshDocs, unseenDocs, backlogDocs, randomDocs] = await Promise.all([
    collection.find({ type: 'video' }).sort({ updatedAt: -1 }).limit(120).toArray(),
    collection.find({ type: 'video', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
    collection.find({ type: 'video', lastShownAt: { $lt: stale } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
    collection.aggregate([{ $match: { type: 'video' } }, { $sample: { size: 60 } }]).toArray(),
  ])

  freshDocs.forEach((doc) => add(doc, 'db-fresh'))
  unseenDocs.forEach((doc) => add(doc, 'db-unseen'))
  backlogDocs.forEach((doc) => add(doc, 'db-backlog'))
  randomDocs.forEach((doc) => add(doc, 'db-random'))

  return Array.from(bucket.values())
}

function buildVideoCandidate(doc: VideoRecord | null | undefined, origin: CandidateOrigin): VideoCandidate | null {
  if (!doc) return null
  const provider = (doc?.provider || 'youtube').toString()
  const videoId = (doc?.videoId || '').toString()
  const url = (doc?.url || (videoId ? `https://youtu.be/${videoId}` : '')).toString()
  if (!url) return null
  const thumb = doc?.thumb || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined)
  const textValue = doc?.title || doc?.text || ''
  const text = typeof textValue === 'string' ? textValue : ''
  const rawSource = doc?.source
  const source: VideoSourceInfo = {
    name: typeof rawSource?.name === 'string' && rawSource.name.trim() ? rawSource.name.trim() : provider,
    url: typeof rawSource?.url === 'string' && rawSource.url ? rawSource.url : url,
  }

  const tags = toStringArray(doc?.tags)
  const keywords = toStringArray(doc?.keywords)
  const updatedAt = toDate(doc?.updatedAt)
  const lastShownAt = toDate(doc?.lastShownAt)

  return {
    mapped: {
      item: { type: 'video', url, thumbUrl: thumb || undefined, text, source, provider },
      key: videoId ? { videoId } : { url },
      provider,
    },
    tags,
    keywords,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function buildFallback(): null {
  return null
}

async function finalizeSelection(candidate: VideoCandidate, debug: SelectionDebugContext | null, relaxed: boolean) {
  const key = candidateKey(candidate)
  if (!key) return null

  await touch(candidate)
  finalizeDebugSelection(debug, key, relaxed)
  markGlobalItem('video', key)
  markGlobalTopics(candidate.tags)
  markGlobalKeywords(candidate.keywords)
  markGlobalProvider(candidate.mapped.provider)
  markGlobalOrigin(candidate.origin)

  if (candidate.mapped.key.videoId) markRecentVideo(candidate.mapped.key.videoId)
  else if (candidate.mapped.key.url) markRecentVideo(candidate.mapped.key.url)
  markRecentVideoProvider(candidate.mapped.provider)
  markRecentVideoTopics(candidate.tags)
  if (candidate.keywords.length) markRecentVideoKeywords(candidate.keywords)

  return candidate.mapped.item
}

async function touch(candidate: VideoCandidate) {
  const db = await getDb()
  await db.collection('items').updateOne(candidate.mapped.key.videoId ? { type: 'video', videoId: candidate.mapped.key.videoId } : { type: 'video', url: candidate.mapped.key.url }, { $set: { lastShownAt: new Date() } })
}

export async function selectVideo(debugEnabled: boolean): Promise<VideoItem | null> {
  const candidateMap = new Map<string, VideoCandidate>()

  const add = (candidate: VideoCandidate | null) => {
    if (!candidate) return
    const key = candidateKey(candidate)
    if (!key) return
    const existing = candidateMap.get(key)
    if (!existing || (candidate.origin === 'network' && existing.origin !== 'network')) {
      candidateMap.set(key, candidate)
    }
  }

  const dbCandidates = await collectDbCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkVideoCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const debug = createDebugContext(debugEnabled, scored.length)
  const preferFresh = shouldPreferFreshContent(getRecentOriginsWindow(10))
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  let relaxedCandidate: VideoCandidate | null = null

  for (const { candidate, score } of scored) {
    if (score < -2) {
      trackReason(debug, 'lowScore')
      if (!relaxedCandidate) relaxedCandidate = candidate
      continue
    }

    if (!relaxedCandidate) relaxedCandidate = candidate

    const key = candidateKey(candidate)
    if (!key) continue
    const providerKey = candidate.mapped.provider
    const tags = candidate.tags
    const keywords = candidate.keywords
    const allTagsRecent = tags.length && tags.every((tag) => recentVideoTopics.includes(tag))
    const allKeywordsRecent = keywords.length && keywords.every((word) => recentVideoKeywords.includes(word))
    const globallyRecent = isGlobalItemRecent('video', key)
    const topicsGloballyTired = tags.length ? areTopicsGloballyRecent(tags) : false
    const keywordsGloballyTired = keywords.length ? areKeywordsGloballyRecent(keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(providerKey)

    if (globallyRecent && scored.length > 2) {
      trackReason(debug, 'globallyRecent')
      continue
    }
    if (allTagsRecent && allKeywordsRecent && scored.length > 2) {
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
  return buildFallback()
}

function buildNetworkQueries(size = 3): string[] {
  const count = Math.max(1, Math.min(size, NETWORK_VIDEO_QUERIES.length))
  const pool = new Set<string>()
  while (pool.size < count) pool.add(pick(NETWORK_VIDEO_QUERIES))
  return Array.from(pool)
}

async function fetchNetworkVideoCandidates(): Promise<VideoCandidate[]> {
  const queries = buildNetworkQueries(3)
  const includeArchive = Math.random() < 0.5
  const reddit = Math.random() < 0.35 ? { sub: pick(REDDIT_VIDEO_SOURCES), limit: 36 } : null

  const result = await ingestVideos({
    mode: 'search',
    queries,
    per: 24,
    pages: 1,
    days: 180,
    includeArchive,
    reddit,
  }).catch(() => null)

  if (!result?.unique) return []

  const db = await getDb()
  const limit = Math.min(60, Math.max(16, result.unique))
  const docs = await db
    .collection<VideoRecord>('items')
    .find({ type: 'video' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .project({
      videoId: 1,
      url: 1,
      provider: 1,
      title: 1,
      text: 1,
      thumb: 1,
      source: 1,
      tags: 1,
      keywords: 1,
      description: 1,
      updatedAt: 1,
      lastShownAt: 1,
    })
    .toArray()

  return docs
    .map((doc) => buildVideoCandidate({
      ...doc,
      text: doc.title ?? doc.text,
    }, 'network'))
    .filter((candidate): candidate is VideoCandidate => Boolean(candidate))
}
