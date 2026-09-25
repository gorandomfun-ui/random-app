/**
 * Digging around a subject of the day: the like's ladder, as it is — the
 * name (most seen, then most recent), the pair of telling words, one word —
 * with a smaller budget: per turn, two YouTube searches at most, one
 * Dailymotion, one Giphy; three turns at most. Only what names the subject
 * in its title is kept, a few per channel and per family.
 */

import { baseSteps, type LikeSeed, type LikeStep } from '@/lib/discovery/likePlan'
import { capPerSource, keepTitled } from '@/lib/discovery/likeCaps'
import { foldSubject, type Subject as DiscoverySubject } from '@/lib/discovery/subjects'
import type { ImageSource } from '@/lib/ingest/images'
import type { RawVideo } from '@/lib/ingest/videos'
import { normalize } from '../tagging/normalize'

export const YOUTUBE_SEARCH_UNITS = 100
export const MAX_TURNS = 3
export const RESULTS_PER_SEARCH = 25
const USER_AGENT = 'gorandom.fun trend-subjects (contact: github.com/gorandomfun-ui)'

export type DigSubject = { id: string; label: string; aliases: string[] }

/** The shape the like machinery checks a result against. */
export function discoverySubject(subject: DigSubject): DiscoverySubject {
  const aliases = [...new Set([subject.label, ...subject.aliases].map(foldSubject).filter(Boolean))].slice(0, 12)
  return { key: subject.id, label: subject.label, aliases, kind: 'entity', evidence: 'title' }
}

/** The turns of one subject: name, then pair, then one word — never more than three. */
export function digSteps(subject: DigSubject, now: number): LikeStep[] {
  const seed: LikeSeed = {
    subject: discoverySubject(subject),
    words: normalize(subject.label).split(' ').filter(Boolean),
    title: subject.label,
    scope: { ownerId: 'trend', referenceKey: subject.id },
  }
  return baseSteps(seed, now).slice(0, MAX_TURNS)
}

/** What a step keeps: results that name what the step searched, a few per channel and per family. */
export function keepForStep(videos: RawVideo[], focus: DiscoverySubject): RawVideo[] {
  return capPerSource(keepTitled(videos, focus))
}

export type YouTubeSearch = { query: string; order: 'date' | 'relevance' | 'viewCount'; after: string; before: string; language?: string }

/** One YouTube search: a hundred units, twenty-five results, embeddable only. */
export async function searchYouTube(apiKey: string, spec: YouTubeSearch, request: typeof fetch = fetch, signal?: AbortSignal): Promise<RawVideo[]> {
  const params = new URLSearchParams({
    key: apiKey, part: 'snippet', type: 'video', q: spec.query, order: spec.order, maxResults: String(RESULTS_PER_SEARCH),
    publishedAfter: spec.after, publishedBefore: spec.before, videoEmbeddable: 'true', safeSearch: 'moderate',
  })
  if (spec.language) params.set('relevanceLanguage', spec.language === 'jp' ? 'ja' : spec.language)
  const response = await request(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal })
  if (!response.ok) throw new Error(`YouTube search: HTTP ${response.status}`)
  type Item = { id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelId?: string; channelTitle?: string; publishedAt?: string; liveBroadcastContent?: string } }
  const payload = (await response.json()) as { items?: Item[] }
  return (payload.items ?? []).flatMap((item): RawVideo[] => {
    const id = item.id?.videoId
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return []
    const snippet = item.snippet
    return [{
      videoId: id, provider: 'youtube', url: `https://youtu.be/${id}`, title: snippet?.title, description: snippet?.description,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, channelId: snippet?.channelId, channelTitle: snippet?.channelTitle,
      liveBroadcastContent: snippet?.liveBroadcastContent, publishedAt: snippet?.publishedAt, contextQueries: [spec.query],
    }]
  })
}

export type DailymotionSearch = { query: string; sort: 'relevance' | 'recent'; after: string; before: string; /** Which page of results, first by default. Costs nothing more than the first. */ page?: number }

/** One Dailymotion search on the public API, twenty-five results. */
export async function searchDailymotion(spec: DailymotionSearch, request: typeof fetch = fetch, signal?: AbortSignal): Promise<RawVideo[]> {
  const params = new URLSearchParams({
    limit: String(RESULTS_PER_SEARCH), page: String(Math.max(1, Math.floor(spec.page ?? 1))), sort: spec.sort, search: spec.query,
    created_after: String(Math.floor(new Date(spec.after).getTime() / 1000)), created_before: String(Math.floor(new Date(spec.before).getTime() / 1000)),
    fields: 'id,title,description,url,thumbnail_url,duration,channel.id,owner.id,owner.screenname,created_time,views_total,private',
  })
  const response = await request(`https://api.dailymotion.com/videos?${params}`, { headers: { 'User-Agent': USER_AGENT }, signal })
  if (!response.ok) throw new Error(`Dailymotion search: HTTP ${response.status}`)
  const payload = (await response.json()) as { list?: Array<Record<string, unknown>> }
  return (payload.list ?? []).flatMap((row): RawVideo[] => {
    if (typeof row.id !== 'string' || !/^[a-z\d]+$/i.test(row.id) || row.private === true) return []
    const text = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : undefined)
    return [{
      videoId: `dailymotion:${row.id}`, provider: 'dailymotion', url: `https://www.dailymotion.com/video/${row.id}`,
      title: text('title'), description: text('description'), thumb: text('thumbnail_url'), channelId: text('owner.id'), channelTitle: text('owner.screenname'),
      categoryId: text('channel.id'), duration: typeof row.duration === 'number' ? `PT${Math.max(0, row.duration)}S` : undefined,
      publishedAt: typeof row.created_time === 'number' ? new Date(row.created_time * 1000) : undefined,
      viewCount: typeof row.views_total === 'number' ? row.views_total : undefined, statsObservedAt: new Date(), contextQueries: [spec.query],
    }]
  })
}

/** One Giphy search, in the shape the image admission takes. The line stays free of the database modules. */
export async function searchGiphy(apiKey: string, query: string, limit: number, request: typeof fetch = fetch, signal?: AbortSignal): Promise<ImageSource[]> {
  const params = new URLSearchParams({ api_key: apiKey, q: query, limit: String(limit), rating: 'pg-13' })
  const response = await request(`https://api.giphy.com/v1/gifs/search?${params}`, { signal })
  if (!response.ok) throw new Error(`Giphy search: HTTP ${response.status}`)
  type Item = { title?: string; slug?: string; url?: string; content_description?: string; user?: { username?: string }; images?: Record<string, { url?: string }> }
  const payload = (await response.json()) as { data?: Item[] }
  return (payload.data ?? []).flatMap((item): ImageSource[] => {
    const images = item.images ?? {}
    const url = images.original?.url || images.downsized_large?.url || images.downsized?.url
    if (!url) return []
    const title = typeof item.title === 'string' ? item.title : ''
    const slugWords = (item.slug ?? '').split('-').slice(0, -1).filter((word) => word && !/^\d+$/.test(word))
    return [{
      url, thumb: images.preview_gif?.url || images.fixed_width_small?.url || null, provider: 'giphy', source: { name: 'Giphy', url: item.url || url },
      title, alt: title, apiTags: slugWords, ...(item.user?.username ? { creatorId: item.user.username } : {}), contextQueries: [query],
      ...(typeof item.content_description === 'string' ? { description: item.content_description } : {}),
    }]
  })
}
