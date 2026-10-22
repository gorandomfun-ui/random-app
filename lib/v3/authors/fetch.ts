/**
 * What an author has published lately, at each provider.
 *
 * Reading a channel is cheap where searching is not: at YouTube one call finds
 * the channel's own list and one more reads fifty of its videos, two units,
 * where a single search costs a hundred. Dailymotion asks nothing at all.
 *
 * Each answer carries the channel's size, the count of videos its platform
 * gives (lib/v3/authors/pick.ts, smallAuthor): YouTube's in the call that finds
 * the list, which spares the second call for a channel too big to follow;
 * Dailymotion's from the account, one free call before the list (its list
 * leaves its `total` out for some accounts: 14 of 40 on 22 October).
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

type ChannelsResponse = { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } }; statistics?: { videoCount?: string } }> }

/** What a channel gave: its latest videos, and how many it holds in all (null when the platform does not say). */
export type AuthorVideos = { videos: RawVideo[]; total: number | null }

const count = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(number) && number >= 0 ? number : null
}
type PlaylistResponse = {
  items?: Array<{ snippet?: { title?: string; description?: string; publishedAt?: string; channelId?: string; channelTitle?: string; resourceId?: { videoId?: string } } }>
}

/**
 * The latest videos of a YouTube channel, through the list the channel keeps of its own uploads. `keep` says, from the
 * channel's size, whether to read its list at all: a channel refused costs one unit, not two.
 */
export async function youtubeAuthorVideos(apiKey: string, channelId: string, take: number, request: typeof fetch = fetch, signal?: AbortSignal, keep: (total: number | null) => boolean = () => true): Promise<AuthorVideos> {
  const channel = await ask<ChannelsResponse>(`${YOUTUBE}/channels?key=${apiKey}&part=contentDetails,statistics&id=${encodeURIComponent(channelId)}`, request, signal)
  const total = count(channel?.items?.[0]?.statistics?.videoCount)
  const uploads = channel?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads || !keep(total)) return { videos: [], total }
  const params = new URLSearchParams({ key: apiKey, part: 'snippet', playlistId: uploads, maxResults: String(Math.min(50, Math.max(1, take))) })
  const playlist = await ask<PlaylistResponse>(`${YOUTUBE}/playlistItems?${params}`, request, signal)
  const videos = (playlist?.items ?? []).flatMap((item): RawVideo[] => {
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
  return { videos, total }
}

type DailymotionResponse = { list?: Array<Record<string, unknown>> }

/**
 * The latest videos of a Dailymotion account, and its size (`videos_total`, asked of the account first). `keep` says,
 * from the size, whether to read its list at all. Free, like every call to them.
 */
export async function dailymotionAuthorVideos(ownerId: string, take: number, request: typeof fetch = fetch, signal?: AbortSignal, keep: (total: number | null) => boolean = () => true): Promise<AuthorVideos> {
  const account = await ask<{ videos_total?: unknown }>(`https://api.dailymotion.com/user/${encodeURIComponent(ownerId)}?fields=videos_total`, request, signal)
  const total = count(account?.videos_total)
  if (!keep(total)) return { videos: [], total }
  const params = new URLSearchParams({
    limit: String(Math.min(50, Math.max(1, take))), page: '1', sort: 'recent',
    fields: 'id,title,description,url,thumbnail_url,duration,aspect_ratio,channel.id,owner.id,owner.screenname,created_time,views_total,private',
  })
  const payload = await ask<DailymotionResponse>(`https://api.dailymotion.com/user/${encodeURIComponent(ownerId)}/videos?${params}`, request, signal)
  const videos = (payload?.list ?? []).flatMap((row): RawVideo[] => {
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
      aspectRatio: typeof row.aspect_ratio === 'number' ? row.aspect_ratio : undefined,
      publishedAt: typeof row.created_time === 'number' ? new Date(row.created_time * 1000) : undefined,
      viewCount: typeof row.views_total === 'number' ? row.views_total : undefined,
      statsObservedAt: new Date(),
      contextQueries: [`author:dailymotion:${ownerId}`],
    }]
  })
  return { videos, total }
}
