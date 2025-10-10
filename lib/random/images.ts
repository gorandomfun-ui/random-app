import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalProvider,
  markGlobalTopics,
  markGlobalOrigin,
} from './globalState'
import type { CandidateOrigin } from './types'
import type { ImageDocument } from '@/lib/ingest/images'

export const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1519681393784-d120267933ba',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
  'https://images.unsplash.com/photo-1495567720989-cebdbdd97913',
] as const

const RECENT_LIMIT = 36
const recentUrls: string[] = []

export type ImageItem = {
  type: 'image'
  url: string
  thumbUrl: string | null
  source: { name: string; url?: string | null }
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
}

type ImageRecord = ImageDocument & {
  thumb?: string | null
  thumbUrl?: string | null
  pageUrl?: string | null
  lastShownAt?: Date | string | null
}

function normalizeSource(doc: ImageRecord): { name: string; url?: string | null } {
  const provider = typeof doc.provider === 'string' && doc.provider.trim() ? doc.provider.trim() : 'image'
  const raw = doc.source && typeof doc.source === 'object' ? doc.source : null
  const name = raw && typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : provider
  const url = raw && typeof raw.url === 'string' && raw.url ? raw.url : doc.pageUrl || doc.url
  return { name, url }
}

async function pickFromDb(exclude: string[], excludeIds: unknown[]): Promise<ImageRecord | null> {
  const match: Record<string, unknown> = {}
  if (exclude.length) match.url = { $nin: exclude }
  if (excludeIds.length) match._id = { $nin: excludeIds }
  const doc = await sampleFromCache<ImageRecord>('image', match)
  if (doc) return doc
  if (exclude.length || excludeIds.length) {
    return sampleFromCache<ImageRecord>('image')
  }
  return null
}

function registerRecent(url: string) {
  if (!url) return
  const idx = recentUrls.indexOf(url)
  if (idx >= 0) recentUrls.splice(idx, 1)
  recentUrls.push(url)
  while (recentUrls.length > RECENT_LIMIT) recentUrls.shift()
}

function looksLikeImageUrl(url?: string | null): boolean {
  if (!url) return false
  if (url.startsWith('data:image/')) return true
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host.endsWith('giphy.com') || host.endsWith('tenor.com')) return true
    if (parsed.pathname.endsWith('.gif') || parsed.pathname.endsWith('.jpg') || parsed.pathname.endsWith('.jpeg') || parsed.pathname.endsWith('.png') || parsed.pathname.endsWith('.webp') || parsed.pathname.endsWith('.avif') || parsed.pathname.endsWith('.bmp')) {
      return true
    }
  } catch {
    return false
  }
  return false
}

function resolveImageUrl(doc: ImageRecord): { url: string; thumb: string | null } | null {
  const candidates: Array<string | null | undefined> = [doc.url, doc.thumb, doc.thumbUrl]
  if (doc.source && typeof doc.source === 'object' && doc.source) {
    candidates.push((doc.source as { url?: string | null }).url)
  }
  candidates.push(doc.pageUrl)
  for (const raw of candidates) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) continue
    if (looksLikeImageUrl(value)) {
      const thumbRaw = doc.thumb ?? doc.thumbUrl ?? null
      const thumb = looksLikeImageUrl(thumbRaw || undefined) ? (thumbRaw ?? null) : null
      return { url: value, thumb }
    }
  }
  return null
}

function buildCandidate(doc: ImageRecord, origin: CandidateOrigin) {
  const resolved = resolveImageUrl(doc)
  if (!resolved) return null
  const source = normalizeSource(doc)
  const tone = typeof doc.tone === 'string' ? doc.tone : undefined
  const toneConfidence = typeof doc.toneConfidence === 'number' ? doc.toneConfidence : undefined
  const toneSignals = Array.isArray(doc.toneSignals)
    ? doc.toneSignals.filter((entry): entry is string => typeof entry === 'string')
    : undefined
  return {
    url: resolved.url,
    item: {
      type: 'image' as const,
      url: resolved.url,
      thumbUrl: resolved.thumb ?? null,
      source,
      tone,
      toneConfidence,
      toneSignals,
    },
    tags: Array.isArray(doc.tags) ? doc.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    keywords: Array.isArray(doc.keywords) ? doc.keywords.filter((word): word is string => typeof word === 'string') : [],
    provider: source.name || 'image',
    origin,
  }
}

export async function selectImage(_debugEnabled = false, _queryHints?: string[]): Promise<ImageItem> {
  void _debugEnabled
  void _queryHints
  const recent = recentUrls.slice(-RECENT_LIMIT)
  const exclude = new Set<string>(recent)
  const excludeIds: unknown[] = []

  for (let attempt = 0; attempt < 18; attempt++) {
    const doc = await pickFromDb(Array.from(exclude), excludeIds)
    if (!doc) break
    const maybeId = (doc as { _id?: unknown })._id
    if (maybeId !== null && maybeId !== undefined) excludeIds.push(maybeId)
    const candidate = buildCandidate(doc, 'db-random')
    if (!candidate) {
      if (typeof doc.url === 'string' && doc.url) exclude.add(doc.url)
      continue
    }

    exclude.add(candidate.url)
    registerRecent(candidate.url)
    await touchLastShown('image', { url: candidate.url })
    markGlobalItem('image', candidate.url)
    markGlobalTopics(candidate.tags)
    markGlobalKeywords(candidate.keywords)
    markGlobalProvider(candidate.provider)
    markGlobalOrigin(candidate.origin)
    return candidate.item
  }

  const fallback = FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)]
  return {
    type: 'image',
    url: fallback,
    thumbUrl: null,
    source: { name: 'Unsplash', url: fallback },
  }
}

// legacy export expected by ingestion helper
export { FALLBACK_IMAGES as FB_IMAGES }
