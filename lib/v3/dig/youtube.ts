/**
 * YouTube, as the dig reads it: a search page of fifty ids (a hundred units),
 * the details of fifty videos (one unit: views, language, length, tags —
 * the search itself gives none of that), a channel's uploads (one unit for
 * the playlist id, one per fifty videos). Nothing here books quota: the line
 * reserves before each call.
 */

import type { DigVideo } from './video'

const ENDPOINT = 'https://www.googleapis.com/youtube/v3'
export const SEARCH_UNITS = 100
export const LIST_UNITS = 1
export const PAGE_SIZE = 50

export type SearchOrder = 'viewCount' | 'relevance' | 'date'
export type SearchPage = { ids: string[]; nextPageToken?: string }

const message = (status: number, body: string) => `YouTube HTTP ${status}${body ? `: ${body.slice(0, 160)}` : ''}`

async function call(key: string, path: string, params: Record<string, string>, request: typeof fetch, signal?: AbortSignal): Promise<Document> {
  const query = new URLSearchParams({ ...params, key })
  const response = await request(`${ENDPOINT}/${path}?${query}`, { signal })
  if (!response.ok) throw new Error(message(response.status, await response.text().catch(() => '')))
  return (await response.json()) as Document
}
type Document = Record<string, unknown>

/** One page of a search: embeddable videos only, fifty at most. */
export async function searchPage(key: string, query: string, order: SearchOrder, options: { pageToken?: string; lang?: string; request?: typeof fetch; signal?: AbortSignal } = {}): Promise<SearchPage> {
  const payload = await call(key, 'search', {
    part: 'id', type: 'video', maxResults: String(PAGE_SIZE), q: query, order, videoEmbeddable: 'true', safeSearch: 'moderate',
    ...(options.pageToken ? { pageToken: options.pageToken } : {}), ...(options.lang ? { relevanceLanguage: options.lang } : {}),
  }, options.request ?? fetch, options.signal)
  const items = (payload.items as Array<{ id?: { videoId?: string } }> | undefined) ?? []
  return { ids: items.map((item) => item.id?.videoId ?? '').filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)), nextPageToken: payload.nextPageToken as string | undefined }
}

export function isoSeconds(iso: string | undefined): number {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? '')
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0
}

type Item = {
  id: string
  snippet?: { title?: string; description?: string; channelId?: string; channelTitle?: string; publishedAt?: string; tags?: string[]; categoryId?: string; liveBroadcastContent?: string; defaultAudioLanguage?: string; defaultLanguage?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } }
  statistics?: { viewCount?: string }
  contentDetails?: { duration?: string }
  status?: { embeddable?: boolean; privacyStatus?: string }
}

/** The details of up to fifty videos; what is private, unembeddable or gone is left out. */
export async function videoDetails(key: string, ids: string[], request: typeof fetch = fetch, signal?: AbortSignal): Promise<DigVideo[]> {
  const wanted = [...new Set(ids)].slice(0, PAGE_SIZE)
  if (!wanted.length) return []
  const payload = await call(key, 'videos', { part: 'snippet,statistics,contentDetails,status', id: wanted.join(','), maxResults: String(PAGE_SIZE) }, request, signal)
  const items = (payload.items as Item[] | undefined) ?? []
  return items.flatMap((item): DigVideo[] => {
    const snippet = item.snippet ?? {}
    if (!item.id || !snippet.title) return []
    if (item.status && (item.status.embeddable === false || (item.status.privacyStatus && item.status.privacyStatus !== 'public'))) return []
    const views = Number(item.statistics?.viewCount)
    return [{
      videoId: item.id, provider: 'youtube', url: `https://www.youtube.com/watch?v=${item.id}`,
      title: snippet.title, description: snippet.description ?? '', apiTags: snippet.tags ?? [],
      channelId: snippet.channelId, channelTitle: snippet.channelTitle, publishedAt: snippet.publishedAt,
      viewCount: Number.isFinite(views) ? views : undefined, duration: item.contentDetails?.duration, seconds: isoSeconds(item.contentDetails?.duration),
      live: Boolean(snippet.liveBroadcastContent && snippet.liveBroadcastContent !== 'none'), categoryId: snippet.categoryId,
      declaredLang: snippet.defaultAudioLanguage ?? snippet.defaultLanguage, thumb: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url,
    }]
  })
}

/** The uploads playlist of a channel, or null. One unit. */
export async function uploadsPlaylist(key: string, channelId: string, request: typeof fetch = fetch, signal?: AbortSignal): Promise<string | null> {
  const payload = await call(key, 'channels', { part: 'contentDetails', id: channelId }, request, signal)
  const items = (payload.items as Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> | undefined) ?? []
  return items[0]?.contentDetails?.relatedPlaylists?.uploads ?? null
}

/** One page of a playlist: fifty video ids. One unit. */
export async function playlistPage(key: string, playlistId: string, pageToken: string | undefined, request: typeof fetch = fetch, signal?: AbortSignal): Promise<SearchPage> {
  const payload = await call(key, 'playlistItems', { part: 'contentDetails', playlistId, maxResults: String(PAGE_SIZE), ...(pageToken ? { pageToken } : {}) }, request, signal)
  const items = (payload.items as Array<{ contentDetails?: { videoId?: string } }> | undefined) ?? []
  return { ids: items.map((item) => item.contentDetails?.videoId ?? '').filter(Boolean), nextPageToken: payload.nextPageToken as string | undefined }
}
