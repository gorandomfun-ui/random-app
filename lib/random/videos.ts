import type { VideoItem } from '@/lib/random/clientTypes'
import { sampleFromCache, touchLastShown } from '@/lib/random/data'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from './globalState'

const RECENT_LIMIT = 10
const recentVideoIds: string[] = []

type VideoRecord = {
  videoId?: string | null
  url?: string | null
  title?: string | null
  provider?: string | null
  thumb?: string | null
  thumbUrl?: string | null
  text?: string | null
  source?: { name?: string | null; url?: string | null } | null
  tags?: string[]
  keywords?: string[]
  tone?: 'positive' | 'neutral' | 'negative' | null
  toneConfidence?: number | null
  toneSignals?: string[] | null
}

function registerRecent(id: string) {
  if (!id) return
  const idx = recentVideoIds.indexOf(id)
  if (idx >= 0) recentVideoIds.splice(idx, 1)
  recentVideoIds.push(id)
  while (recentVideoIds.length > RECENT_LIMIT) recentVideoIds.shift()
}

async function pickFromDb(exclude: string[], attempts = 12): Promise<VideoRecord | null> {
  for (let i = 0; i < attempts; i++) {
    const filter = exclude.length ? { videoId: { $nin: exclude } } : {}
    const doc = await sampleFromCache<VideoRecord>('video', filter)
    if (!doc) return null
    const resolved = resolveUrl(doc)
    if (!resolved) continue
    if (exclude.includes(resolved.id)) continue
    return doc
  }
  return null
}

function resolveUrl(doc: VideoRecord): { url: string; id: string } | null {
  const videoId = typeof doc.videoId === 'string' && doc.videoId.trim() ? doc.videoId.trim() : ''
  const url = typeof doc.url === 'string' && doc.url.trim() ? doc.url.trim() : (videoId ? `https://youtu.be/${videoId}` : '')
  if (!url) return null
  return { url, id: videoId || url }
}

export async function selectVideo(): Promise<VideoItem | null> {
  const exclude = recentVideoIds.slice(-RECENT_LIMIT)
  const doc = await pickFromDb(exclude)
  if (!doc) return null

  const resolved = resolveUrl(doc)
  if (!resolved) return null
  const { url, id } = resolved

  const provider = typeof doc.provider === 'string' && doc.provider.trim() ? doc.provider.trim() : 'video'
  const rawSource = doc.source && typeof doc.source === 'object' ? doc.source : null
  const sourceName = rawSource && typeof rawSource.name === 'string' && rawSource.name.trim() ? rawSource.name.trim() : provider
  const sourceUrl = rawSource && typeof rawSource.url === 'string' && rawSource.url ? rawSource.url : url
  const thumb = typeof doc.thumb === 'string' && doc.thumb ? doc.thumb : typeof doc.thumbUrl === 'string' ? doc.thumbUrl : undefined
  const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : typeof doc.text === 'string' ? doc.text.trim() : undefined
  const tags = Array.isArray(doc.tags) ? doc.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const keywords = Array.isArray(doc.keywords) ? doc.keywords.filter((word): word is string => typeof word === 'string') : []
  const tone = typeof doc.tone === 'string' ? doc.tone : undefined
  const toneConfidence = typeof doc.toneConfidence === 'number' ? doc.toneConfidence : undefined
  const toneSignals = Array.isArray(doc.toneSignals)
    ? doc.toneSignals.filter((entry): entry is string => typeof entry === 'string')
    : undefined

  registerRecent(id)
  await touchLastShown('video', { videoId: id })
  markGlobalItem('video', id)
  markGlobalProvider(provider)
  markGlobalOrigin('db-random')
  markGlobalTopics(tags)
  markGlobalKeywords(keywords)

  return {
    type: 'video',
    url,
    thumbUrl: thumb || undefined,
    text: title,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tone,
    toneConfidence,
    toneSignals,
  }
}
