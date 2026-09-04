import type { VideoItem } from '@/lib/random/clientTypes'
import { sampleFromCache, touchLastShownById } from '@/lib/random/data'
import { STRONG_POOL_MAX_TIME_MS, buildStrongPoolMatch } from '@/lib/random/strongPool'
import type { RandomSelectOptions, VideoPool } from '@/lib/random/types'
import type { Filter } from 'mongodb'
import {
  FUN_TREND_REGEX,
  ROUTINE_NEWS_RADIO_REGEX,
  YOUTUBE_NEWS_CATEGORY_ID,
} from '@/lib/random/videoEditorial'
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
  likeCount?: number | null
  quality?: number | null
  showWeight?: number | null
  dislikeCount?: number | null
  isSuppressed?: boolean | null
  obsoleteVideoStatus?: string | null
  tone?: 'positive' | 'neutral' | 'negative' | null
  toneConfidence?: number | null
  toneSignals?: string[] | null
  updatedAt?: Date | null
  categoryId?: string | null
  liveBroadcastContent?: string | null
}

const VIDEO_TEXT_FIELDS = ['title', 'text', 'description', 'channelTitle', 'tags', 'keywords'] as const
const RETRO_VIDEO_REGEX = /\b(retro|vintage|archive|archival|public access|found footage|lost tape|old tv|classic tv|nostalgia|y2k|[5-9]0s|19[5-9]\d|200\d)\b/i
const OLD_AD_REGEX = /\b(advertisements?|advertising|commercials?|infomercials?|adverts?|promo spot|tv ads?|publicit[eé]|anuncios?|publicidad|werbung|reklame|pubblicit[aà]|reclame)\b/i
const TRENDING_TAG_REGEX = /(^|-)trending(-|$)/i
const TRENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function matchVideoText(regex: RegExp): Filter<VideoRecord> {
  return { $or: VIDEO_TEXT_FIELDS.map((field) => ({ [field]: regex })) } as Filter<VideoRecord>
}

function excludeVideoText(...regexes: RegExp[]): Filter<VideoRecord> {
  return {
    $nor: VIDEO_TEXT_FIELDS.flatMap((field) => regexes.map((regex) => ({ [field]: regex }))),
  } as Filter<VideoRecord>
}

function stockVideoQualityMatch(): Filter<VideoRecord> {
  return {
    $or: [
      { provider: { $nin: ['pexels', 'pixabay'] } },
      { likeCount: { $gte: 1 } },
      { quality: { $gte: 2 } },
      { showWeight: { $gte: 1.2 } },
    ],
  } as Filter<VideoRecord>
}

function coolToneMatch(): Filter<VideoRecord> {
  return {
    $nor: [{ tone: 'negative', toneConfidence: { $gte: 0.75 } }],
  } as Filter<VideoRecord>
}

function coolEditorialMatch(): Filter<VideoRecord> {
  const routineFree = {
    $and: [
      excludeVideoText(ROUTINE_NEWS_RADIO_REGEX),
      { categoryId: { $ne: YOUTUBE_NEWS_CATEGORY_ID } },
      { liveBroadcastContent: { $nin: ['live', 'upcoming'] } },
    ],
  } as Filter<VideoRecord>
  return {
    $or: [routineFree, matchVideoText(FUN_TREND_REGEX)],
  } as Filter<VideoRecord>
}

function buildVideoPoolMatches(pool: VideoPool): Filter<VideoRecord>[] {
  const strong = buildStrongPoolMatch<VideoRecord>()
  const nonRetro = excludeVideoText(RETRO_VIDEO_REGEX, OLD_AD_REGEX)
  const safeFresh = {
    $and: [nonRetro, stockVideoQualityMatch(), coolToneMatch(), coolEditorialMatch()],
  } as Filter<VideoRecord>
  const strongFresh = { $and: [strong, safeFresh] } as Filter<VideoRecord>
  const anyFresh = safeFresh

  if (pool === 'trending') {
    const trending = {
      $and: [
        strong,
        nonRetro,
        coolToneMatch(),
        coolEditorialMatch(),
        { tags: TRENDING_TAG_REGEX },
        { updatedAt: { $gte: new Date(Date.now() - TRENDING_MAX_AGE_MS) } },
      ],
    } as Filter<VideoRecord>
    return [trending, strongFresh, anyFresh]
  }
  if (pool === 'retro-ad') {
    const retroAd = {
      $and: [strong, coolToneMatch(), coolEditorialMatch(), matchVideoText(RETRO_VIDEO_REGEX), matchVideoText(OLD_AD_REGEX)],
    } as Filter<VideoRecord>
    const retroWithoutAds = {
      $and: [strong, coolToneMatch(), coolEditorialMatch(), matchVideoText(RETRO_VIDEO_REGEX), excludeVideoText(OLD_AD_REGEX)],
    } as Filter<VideoRecord>
    return [retroAd, retroWithoutAds, strongFresh, anyFresh]
  }
  if (pool === 'retro') {
    const retroWithoutAds = {
      $and: [strong, coolToneMatch(), coolEditorialMatch(), matchVideoText(RETRO_VIDEO_REGEX), excludeVideoText(OLD_AD_REGEX)],
    } as Filter<VideoRecord>
    return [retroWithoutAds, strongFresh, anyFresh]
  }
  return [strongFresh, anyFresh]
}

function registerRecent(id: string) {
  if (!id) return
  const idx = recentVideoIds.indexOf(id)
  if (idx >= 0) recentVideoIds.splice(idx, 1)
  recentVideoIds.push(id)
  while (recentVideoIds.length > RECENT_LIMIT) recentVideoIds.shift()
}

async function pickFromDb(
  exclude: string[],
  attempts = 12,
  extraMatch: Filter<VideoRecord> = {},
): Promise<(VideoRecord & { _id?: unknown }) | null> {
  for (let i = 0; i < attempts; i++) {
    const filter = {
      $and: [
        { isSuppressed: { $ne: true } },
        { obsoleteVideoStatus: { $ne: 'obsolete' } },
        ...(exclude.length ? [{ videoId: { $nin: exclude } }] : []),
        ...(Object.keys(extraMatch).length ? [extraMatch] : []),
      ],
    } as Filter<VideoRecord>
    const doc = await sampleFromCache<VideoRecord>('video', filter, {
      maxTimeMS: Object.keys(extraMatch).length ? STRONG_POOL_MAX_TIME_MS : undefined,
    })
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

export async function selectVideo(options: RandomSelectOptions = {}): Promise<VideoItem | null> {
  const exclude = recentVideoIds.slice(-RECENT_LIMIT)
  const strongMatch = options.strong ? buildStrongPoolMatch<VideoRecord>() : null
  let doc: (VideoRecord & { _id?: unknown }) | null = null
  if (options.videoPool) {
    for (const match of buildVideoPoolMatches(options.videoPool)) {
      doc = await pickFromDb(exclude, 24, match)
      if (doc) break
    }
  } else if (strongMatch) {
    doc = (await pickFromDb(exclude, 24, strongMatch)) ?? (await pickFromDb(exclude))
  } else {
    doc = await pickFromDb(exclude)
  }
  if (!doc && options.videoPool) {
    const editorialFallback = coolEditorialMatch()
    const strongEditorialFallback = strongMatch
      ? ({ $and: [strongMatch, editorialFallback] } as Filter<VideoRecord>)
      : editorialFallback
    doc =
      (await pickFromDb(exclude, 24, strongEditorialFallback)) ??
      (await pickFromDb(exclude, 24, editorialFallback))
  }
  if (!doc) return null

  const rawItemId = doc && typeof doc === 'object' && '_id' in doc
    ? (doc as { _id: unknown })._id
    : undefined
  const itemId = rawItemId
    ? String(rawItemId)
    : undefined
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
  void touchLastShownById(rawItemId)
  markGlobalItem('video', id)
  markGlobalProvider(provider)
  markGlobalOrigin('db-random')
  markGlobalTopics(tags)
  markGlobalKeywords(keywords)

  return {
    _id: itemId,
    type: 'video',
    url,
    thumbUrl: thumb || undefined,
    text: title,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags,
    keywords,
    tone,
    toneConfidence,
    toneSignals,
  }
}
