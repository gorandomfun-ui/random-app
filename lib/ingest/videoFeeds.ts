import fs from 'node:fs/promises'
import path from 'node:path'

import type { RawVideo } from '@/lib/ingest/videos'
import type { IngestResult } from '@/lib/ingest/videoFeedsTypes'
import {
  finalizeVideoIngest,
  redditYouTube,
  enrichYouTubeDetails,
  type FetchWarning,
  type RedditListingOptions,
  youtubeThumb,
} from '@/lib/ingest/videos'
import {
  AWESOME_VIDEO_LISTS,
  CURATED_SUBREDDITS,
  type AwesomeListSource,
  type CuratedSubreddit,
} from '@/lib/ingest/sources/videoFeedsConfig'

const USER_AGENT = { 'User-Agent': 'RandomAppBot/1.0 (+https://random.app)' }
const YT_ENDPOINT = 'https://www.googleapis.com/youtube/v3'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function shuffleArray<T>(input: ReadonlyArray<T>): T[] {
  const arr = Array.from(input)
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

type RedditCursorRecord = {
  updatedAt: string
  subs: Record<string, {
    lastIds?: Record<string, string>
    lastFetchedAt?: string
  }>
}

async function loadCursorStore(): Promise<RedditCursorRecord> {
  const filePath = path.resolve(process.cwd(), 'lib/ingest/sources/reddit-cursors.json')
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.subs) {
      return parsed as RedditCursorRecord
    }
  } catch {}
  return { updatedAt: new Date().toISOString(), subs: {} }
}

async function saveCursorStore(record: RedditCursorRecord): Promise<void> {
  const filePath = path.resolve(process.cwd(), 'lib/ingest/sources/reddit-cursors.json')
  const payload = { ...record, updatedAt: new Date().toISOString() }
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

type VideoFeedsOptions = {
  dryRun?: boolean
  sampleSize?: number
  lists?: string[]
  subreddits?: string[]
  redditLimit?: number
}

type MarkdownLink = {
  url: string
  title?: string
}

async function fetchMarkdown(source: AwesomeListSource, warnings: FetchWarning[]): Promise<string> {
  if (source.path) {
    try {
      const filePath = path.resolve(process.cwd(), source.path)
      return await fs.readFile(filePath, 'utf8')
    } catch (error) {
      warnings.push({
        label: `github-list:${source.label}`,
        message: error instanceof Error ? error.message : String(error),
      })
      return ''
    }
  }

  if (!source.url) return ''

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(source.url, {
      headers: USER_AGENT,
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      warnings.push({
        label: `github-list:${source.label}`,
        status: response.status,
        statusText: response.statusText,
      })
      return ''
    }
    return await response.text()
  } catch (error) {
    warnings.push({
      label: `github-list:${source.label}`,
      message: error instanceof Error ? error.message : String(error),
    })
    return ''
  } finally {
    clearTimeout(timer)
  }
}

function extractLinks(markdown: string): MarkdownLink[] {
  const results: MarkdownLink[] = []
  const seen = new Set<string>()
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(markdown)) !== null) {
    const [, title, url] = match
    if (!seen.has(url)) {
      results.push({ url, title })
      seen.add(url)
    }
  }

  const fallbackPattern = /(https?:\/\/[^\s)]+)/gi
  while ((match = fallbackPattern.exec(markdown)) !== null) {
    const url = match[1]
    if (!seen.has(url)) {
      results.push({ url })
      seen.add(url)
    }
  }

  return results
}

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean).shift()
      return id ? id.trim() : null
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.searchParams.has('v')) {
        const id = parsed.searchParams.get('v') || ''
        return id.trim() || null
      }
      const segments = parsed.pathname.split('/').filter(Boolean)
      if (segments[0] === 'embed' && segments[1]) return segments[1].trim()
    }
  } catch {
    return null
  }
  return null
}

function extractDailymotionId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.hostname.includes('dailymotion.com')) {
      const segments = parsed.pathname.split('/').filter(Boolean)
      const idx = segments.indexOf('video')
      if (idx >= 0 && segments[idx + 1]) return segments[idx + 1]
    }
    if (parsed.hostname === 'dai.ly') {
      const id = parsed.pathname.split('/').filter(Boolean).shift()
      return id || null
    }
  } catch {
    return null
  }
  return null
}

function buildRawFromLink(link: MarkdownLink, label: string): RawVideo | null {
  const trimmed = link.url.trim()
  if (!trimmed) return null

  const youtubeId = extractYouTubeId(trimmed)
  if (youtubeId) {
    const normalized = `https://youtu.be/${youtubeId}`
    return {
      videoId: youtubeId,
      url: normalized,
      provider: 'youtube',
      title: link.title || `YouTube selection • ${label}`,
      thumb: youtubeThumb(youtubeId),
      source: { name: `GitHub: ${label}`, url: trimmed },
      contextQueries: [`github:${label}`],
    }
  }

  const dmId = extractDailymotionId(trimmed)
  if (dmId) {
    return {
      videoId: `dailymotion:${dmId}`,
      url: `https://www.dailymotion.com/video/${dmId}`,
      provider: 'dailymotion',
      title: link.title || `Dailymotion selection • ${label}`,
      thumb: `https://www.dailymotion.com/thumbnail/video/${dmId}`,
      source: { name: `GitHub: ${label}`, url: trimmed },
      contextQueries: [`github:${label}`],
    }
  }

  return null
}

function selectListSources(requested?: string[]): AwesomeListSource[] {
  if (!requested || !requested.length) return AWESOME_VIDEO_LISTS
  const needle = new Set(requested.map((entry) => entry.toLowerCase()))
  return AWESOME_VIDEO_LISTS.filter((entry) => needle.has(entry.label.toLowerCase()))
}

function selectSubreddits(requested?: string[]): CuratedSubreddit[] {
  if (!requested || !requested.length) return CURATED_SUBREDDITS
  const needle = new Set(requested.map((entry) => entry.toLowerCase()))
  return CURATED_SUBREDDITS.filter((entry) => needle.has(entry.name.toLowerCase()))
}

export async function ingestVideoFeeds(options: VideoFeedsOptions = {}): Promise<IngestResult> {
  const dryRun = Boolean(options.dryRun)
  const sampleSize = options.sampleSize ?? 8
  const warnings: FetchWarning[] = []

  const collected: RawVideo[] = []
  const seen = new Set<string>()

  const listSources = shuffleArray(selectListSources(options.lists))
  for (const source of listSources) {
    const markdown = await fetchMarkdown(source, warnings)
    if (!markdown) continue
    const links = extractLinks(markdown)
    for (const link of links) {
      const raw = buildRawFromLink(link, source.label)
      if (!raw) continue
      if (seen.has(raw.videoId)) continue
      seen.add(raw.videoId)
      collected.push(raw)
      if (collected.length >= 400) break
    }
    if (collected.length >= 400) break
  }

  const redditLimit = options.redditLimit ?? 60
  const subreddits = shuffleArray(selectSubreddits(options.subreddits))
  const cursorStore = await loadCursorStore()
  const updatedSubCursors: Record<string, { lastIds?: Record<string, string>; lastFetchedAt?: string }> = {}

  for (const sub of subreddits) {
    const limit = sub.limit ?? redditLimit
    try {
      const variants: Array<{ listing?: 'hot' | 'new' | 'top'; time?: 'day' | 'week' | 'month'; context: string }> = [
        { listing: 'hot', context: 'hot' },
        { listing: 'top', time: 'week', context: 'top-week' },
        { listing: 'top', time: 'month', context: 'top-month' },
        { listing: 'new', context: 'new' },
      ]
      const perVariant = Math.min(100, Math.max(10, limit))

      const storedCursor = cursorStore.subs[sub.name.toLowerCase()] || { lastIds: {} }
      const nextCursor: { lastIds?: Record<string, string>; lastFetchedAt?: string } = {
        lastIds: { ...(storedCursor.lastIds || {}) },
        lastFetchedAt: new Date().toISOString(),
      }

      for (const variant of variants) {
        const contextKey = variant.context
        const after = storedCursor.lastIds?.[contextKey]

        const latestBatch = await redditYouTube(
          sub.name,
          Math.min(40, perVariant),
          warnings,
          { listing: variant.listing, time: variant.time },
        )

        for (const video of latestBatch) {
          if (seen.has(video.videoId)) continue
          seen.add(video.videoId)
          video.contextQueries = (video.contextQueries || []).concat(`subreddit:${sub.name}`, `subreddit:${sub.name}:${contextKey}`)
          collected.push(video)
        }

        await sleep(200)

        let newestCursor: string | null = null
        const opts: RedditListingOptions = {
          listing: variant.listing,
          time: variant.time,
          after,
          onCursor: (cursor) => {
            if (cursor && !newestCursor) {
              newestCursor = cursor
            }
          },
        }

        const redditVideos = await redditYouTube(sub.name, perVariant, warnings, opts)

        for (const video of redditVideos) {
          if (seen.has(video.videoId)) continue
          seen.add(video.videoId)
          video.contextQueries = (video.contextQueries || []).concat(`subreddit:${sub.name}`, `subreddit:${sub.name}:${contextKey}`)
          collected.push(video)
        }

        if (newestCursor) {
          nextCursor.lastIds = nextCursor.lastIds || {}
          nextCursor.lastIds[contextKey] = newestCursor
        }

        await sleep(200)
      }

      updatedSubCursors[sub.name.toLowerCase()] = nextCursor
    } catch (error) {
      warnings.push({
        label: `reddit:${sub.name}`,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await enrichYouTubeDetails(collected, warnings)

  const validated = await applySafetyNet(collected, warnings)

  const providers = Array.from(new Set(validated.map((video) => video.provider)))

  const result = await finalizeVideoIngest(validated, {
    dryRun,
    sampleSize,
    warnings,
    providers,
  })

  if (!dryRun && Object.keys(updatedSubCursors).length) {
    const merged: RedditCursorRecord = {
      updatedAt: cursorStore.updatedAt,
      subs: { ...cursorStore.subs, ...updatedSubCursors },
    }
    await saveCursorStore(merged)
  }

  return result
}

async function applySafetyNet(videos: RawVideo[], warnings: FetchWarning[]): Promise<RawVideo[]> {
  let current = videos
  current = await filterUnavailableYouTube(current, warnings)
  current = await filterUnavailableDailymotion(current, warnings)
  return current
}

async function filterUnavailableYouTube(videos: RawVideo[], warnings: FetchWarning[]): Promise<RawVideo[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return videos

  const candidates = videos.filter((video) =>
    (video.provider && video.provider.includes('youtube')) && video.videoId
  )
  if (!candidates.length) return videos

  const idToVideo = new Map<string, RawVideo>()
  for (const video of candidates) {
    if (!video.videoId) continue
    idToVideo.set(video.videoId, video)
  }

  const invalidIds = new Set<string>()

  const ids = Array.from(idToVideo.keys())
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const params = new URLSearchParams({
      key,
      part: 'status',
      id: chunk.join(','),
    })

    try {
      const response = await fetch(`${YT_ENDPOINT}/videos?${params.toString()}`, {
        headers: USER_AGENT,
        cache: 'no-store',
      })

      if (!response.ok) {
        warnings.push({
          label: 'youtube:availability',
          status: response.status,
          statusText: response.statusText,
        })
        continue
      }

      const json = (await response.json()) as {
        items?: Array<{ id?: string; status?: { uploadStatus?: string; privacyStatus?: string } }>
      }

      const returnedIds = new Set<string>()
      for (const item of json.items || []) {
        if (!item?.id) continue
        returnedIds.add(item.id)
        const uploadStatus = item.status?.uploadStatus
        const privacyStatus = item.status?.privacyStatus
        const okUpload = uploadStatus === 'processed' || uploadStatus === 'uploaded'
        const okPrivacy = !privacyStatus || privacyStatus === 'public'
        if (!okUpload || !okPrivacy) {
          invalidIds.add(item.id)
        }
      }

      for (const id of chunk) {
        if (!returnedIds.has(id)) {
          invalidIds.add(id)
        }
      }
    } catch (error) {
      warnings.push({
        label: 'youtube:availability',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!invalidIds.size) return videos

  return videos.filter((video) => {
    if (!video.videoId) return true
    if (!video.provider?.includes('youtube')) return true
    return !invalidIds.has(video.videoId)
  })
}

async function filterUnavailableDailymotion(videos: RawVideo[], warnings: FetchWarning[]): Promise<RawVideo[]> {
  const candidates = videos.filter((video) => video.provider === 'dailymotion' && video.videoId)
  if (!candidates.length) return videos

  const invalidIds = new Set<string>()

  for (const video of candidates) {
    const id = extractDailymotionIdFromVideoId(video.videoId || '')
    if (!id) continue
    try {
      const response = await fetch(`https://api.dailymotion.com/video/${id}?fields=availability`, {
        headers: USER_AGENT,
        cache: 'no-store',
      })

      if (!response.ok) {
        warnings.push({
          label: `dailymotion:availability:${id}`,
          status: response.status,
          statusText: response.statusText,
        })
        continue
      }

      const json = (await response.json()) as { availability?: string }
      if (json.availability && json.availability !== 'available') {
        invalidIds.add(video.videoId || '')
      }
    } catch (error) {
      warnings.push({
        label: `dailymotion:availability:${id}`,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!invalidIds.size) return videos

  return videos.filter((video) => {
    if (video.provider !== 'dailymotion') return true
    if (!video.videoId) return true
    return !invalidIds.has(video.videoId)
  })
}

function extractDailymotionIdFromVideoId(videoId: string): string | null {
  if (!videoId) return null
  if (videoId.startsWith('dailymotion:')) {
    return videoId.split(':')[1] || null
  }
  return videoId
}
