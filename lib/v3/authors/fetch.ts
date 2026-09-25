/**
 * What an author has published lately, at each provider.
 *
 * Reading a channel is cheap where searching is not: at YouTube one call finds
 * the channel's own list and one more reads fifty of its videos, two units,
 * where a single search costs a hundred. Dailymotion asks nothing at all.
 */

import type { RawVideo } from '@/lib/ingest/videos'

const USER_AGENT = 'RandomIngest/1.0 (+https://www.gorandom.fun)'
const YOUTUBE = 'https://www.googleapis.com/youtube/v3'
/** One call for the channel, one for its videos. */
export const YOUTUBE_AUTHOR_UNITS = 2
const TIMEOUT_MS = 9000

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

async function ask<T>(url: string, request: typeof fetch, signal?: AbortSignal): Promise<T | null> {
  const response = await request(url, { headers: { 'User-Agent': USER_AGENT }, signal: signal ?? AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

type ChannelsResponse = { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }
type PlaylistResponse = {
  items?: Array<{ snippet?: { title?: string; description?: string; publishedAt?: string; channelId?: string; channelTitle?: string; resourceId?: { videoId?: string } } }>
}

/** The latest videos of a YouTube channel, through the list the channel keeps of its own uploads. */
export async function youtubeAuthorVideos(apiKey: string, channelId: string, take: number, request: typeof fetch = fetch, signal?: AbortSignal): Promise<RawVideo[]> {
  const channel = await ask<ChannelsResponse>(`${YOUTUBE}/channels?key=${apiKey}&part=contentDetails&id=${encodeURIComponent(channelId)}`, request, signal)
  const uploads = channel?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return []
  const params = new URLSearchParams({ key: apiKey, part: 'snippet', playlistId: uploads, maxResults: String(Math.min(50, Math.max(1, take))) })
  const playlist = await ask<PlaylistResponse>(`${YOUTUBE}/playlistItems?${params}`, request, signal)
  return (playlist?.items ?? []).flatMap((item): RawVideo[] => {
    const snippet = item?.snippet
    const videoId = snippet?.resourceId?.videoId
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return []
    return [{
      videoId,
      url: `https://youtu.be/${videoId}`,
      provider: 'youtube',
      title: snippet?.title || '',
      description: snippet?.description,
      channelId: snippet?.channelId || channelId,
      channelTitle: snippet?.channelTitle,
      publishedAt: snippet?.publishedAt,
      thumb: thumb(videoId),
      source: { name: 'YouTube', url: `https://youtu.be/${videoId}` },
      contextQueries: [`author:youtube:${channelId}`],
    }]
  })
}

type DailymotionResponse = { list?: Array<Record<string, unknown>> }

/** The latest videos of a Dailymotion account. Free, like every call to them. */
export async function dailymotionAuthorVideos(ownerId: string, take: number, request: typeof fetch = fetch, signal?: AbortSignal): Promise<RawVideo[]> {
  const params = new URLSearchParams({
    limit: String(Math.min(50, Math.max(1, take))), page: '1', sort: 'recent',
    fields: 'id,title,description,url,thumbnail_url,duration,channel.id,owner.id,owner.screenname,created_time,views_total,private',
  })
  const payload = await ask<DailymotionResponse>(`https://api.dailymotion.com/user/${encodeURIComponent(ownerId)}/videos?${params}`, request, signal)
  return (payload?.list ?? []).flatMap((row): RawVideo[] => {
    if (typeof row.id !== 'string' || !/^[a-z\d]+$/i.test(row.id) || row.private === true) return []
    const text = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : undefined)
    return [{
      videoId: `dailymotion:${row.id}`,
      provider: 'dailymotion',
      url: `https://www.dailymotion.com/video/${row.id}`,
      title: text('title'),
      description: text('description'),
      thumb: text('thumbnail_url'),
      channelId: text('owner.id') || ownerId,
      channelTitle: text('owner.screenname'),
      categoryId: text('channel.id'),
      duration: typeof row.duration === 'number' ? `PT${Math.max(0, row.duration)}S` : undefined,
      publishedAt: typeof row.created_time === 'number' ? new Date(row.created_time * 1000) : undefined,
      viewCount: typeof row.views_total === 'number' ? row.views_total : undefined,
      statsObservedAt: new Date(),
      contextQueries: [`author:dailymotion:${ownerId}`],
    }]
  })
}
