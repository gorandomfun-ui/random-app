/**
 * Dailymotion, as the dig reads it: a search of fifty (no strict quota, the
 * house counter aside), and whether a video actually plays — its API says
 * "published" of videos its player refuses (DM016, DM005: one in eight from
 * the owner's machine, 28 September). The player's metadata answers for free.
 */

import type { DigVideo } from './video'

export type DailymotionSort = 'visited' | 'relevance' | 'recent'
const FIELDS = 'id,title,description,tags,url,thumbnail_720_url,duration,created_time,views_total,owner.id,owner.screenname,owner.videos_total,channel,private,allow_embed,language,onair'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

type Row = { id: string; title?: string; description?: string; tags?: string[]; url?: string; thumbnail_720_url?: string; duration?: number; created_time?: number; views_total?: number; 'owner.videos_total'?: number; channel?: string; 'owner.id'?: string; 'owner.screenname'?: string; private?: boolean; allow_embed?: boolean; language?: string; onair?: boolean }

/** One search, a hundred results at most; the visited sort is refused for some queries, relevance then stands in. */
export async function searchDailymotion(query: string, sort: DailymotionSort, request: typeof fetch = fetch, signal?: AbortSignal, limit = 100): Promise<DigVideo[]> {
  const params = new URLSearchParams({ search: query, sort, limit: String(Math.max(1, Math.min(100, limit))), fields: FIELDS })
  let response = await request(`https://api.dailymotion.com/videos?${params}`, { signal })
  if (!response.ok && sort !== 'relevance') {
    params.set('sort', 'relevance')
    response = await request(`https://api.dailymotion.com/videos?${params}`, { signal })
  }
  if (!response.ok) throw new Error(`Dailymotion HTTP ${response.status}`)
  const payload = (await response.json()) as { list?: Row[] }
  return (payload.list ?? []).flatMap((row): DigVideo[] => {
    if (!row.id || !row.title || row.private || row.allow_embed === false) return []
    return [{
      videoId: `dailymotion:${row.id}`, provider: 'dailymotion', url: row.url ?? `https://www.dailymotion.com/video/${row.id}`,
      title: row.title, description: row.description ?? '', apiTags: row.tags ?? [],
      channelId: row['owner.id'], channelTitle: row['owner.screenname'], publishedAt: row.created_time ? new Date(row.created_time * 1000) : undefined,
      viewCount: row.views_total, duration: row.duration ? `PT${row.duration}S` : undefined, seconds: row.duration ?? 0,
      live: Boolean(row.onair), thumb: row.thumbnail_720_url, declaredLang: row.language,
      ...(typeof row['owner.videos_total'] === 'number' ? { channelVideos: row['owner.videos_total'] } : {}),
      // The platform's own category ("news", "people", "fun"…): what the media windows read (lib/v3/dig/outlet.ts).
      ...(typeof row.channel === 'string' && row.channel ? { categoryId: row.channel } : {}),
    }]
  })
}

/** Whether the player will play it: its metadata carries an error when not. */
export async function playable(videoId: string, request: typeof fetch = fetch, signal?: AbortSignal): Promise<boolean> {
  const id = videoId.replace(/^dailymotion:/, '')
  try {
    const response = await request(`https://www.dailymotion.com/player/metadata/video/${id}`, { headers: { 'User-Agent': USER_AGENT }, signal })
    if (!response.ok) return response.status !== 404 && response.status !== 403
    const payload = (await response.json()) as { error?: unknown; qualities?: unknown }
    return !payload.error
  } catch {
    // The check is a convenience: a network hiccup must not throw away a video the API vouches for.
    return true
  }
}
