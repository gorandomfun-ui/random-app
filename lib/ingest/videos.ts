import { getDb } from '@/lib/db';
import type { Collection, Db, Filter } from 'mongodb';
import { buildTagList, expandQueryToTags, mergeKeywordSources } from './extract';
import { deriveToneAugmentation, flattenToneSegments } from './tone';

export type VideoProvider =
  | 'youtube'
  | 'reddit-youtube'
  | 'archive.org'
  | 'manual'
  | 'dailymotion'
  | 'pixabay'
  | 'pexels';

type SourceRef = { name: string; url?: string };

export type RawVideo = {
  videoId: string;
  url: string;
  provider: VideoProvider;
  title?: string;
  thumb?: string;
  source?: SourceRef;
  contextQueries?: string[];
  apiTags?: string[];
  description?: string;
  channelId?: string;
  channelTitle?: string;
  duration?: string;
};

export type VideoDocument = {
  type: 'video';
  videoId: string;
  url: string;
  provider: VideoProvider;
  title?: string;
  thumb?: string;
  source?: SourceRef;
  tags: string[];
  keywords: string[];
  description?: string;
  channelId?: string;
  channelTitle?: string;
  duration?: string;
  createdAt?: Date;
  updatedAt?: Date;
  tone?: 'positive' | 'neutral' | 'negative';
  toneConfidence?: number;
  toneSignals?: string[];
  rand?: number;
};

type IngestVideosOptions = {
  mode: 'search' | 'playlist' | 'channel';
  queries?: string[];
  per?: number;
  pages?: number;
  days?: number;
  playlistId?: string;
  channelId?: string;
  reddit?: { sub: string; limit: number } | null;
  manualIds?: string[];
  dryRun?: boolean;
  sampleSize?: number;
  durations?: Array<'any' | 'short' | 'medium' | 'long'>;
  providers?: Array<'youtube' | 'dailymotion' | 'pixabay' | 'pexels'>;
  fast?: boolean;
};

type IngestResult = {
  scanned: number;
  unique: number;
  inserted: number;
  updated: number;
  dryRun?: boolean;
  sample?: VideoDocument[];
  providerCounts?: Record<string, number>;
  warnings?: FetchWarning[];
  skippedInvalid?: number;
  providers?: string[];
};

const YT_ENDPOINT = 'https://www.googleapis.com/youtube/v3';
const YT_VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const USER_AGENT = { 'User-Agent': 'RandomAppBot/1.0 (+https://random.app)' };

const TRENDING_REGION_PAIRS: Array<[string, string]> = [
  ['US', 'FR'],
  ['JP', 'BR'],
  ['KR', 'DE'],
  ['GB', 'ES'],
  ['MX', 'CA'],
  ['IN', 'IT'],
  ['AU', 'AR'],
];

const DAILYMOTION_LOCALE: Record<string, string> = {
  US: 'en_US',
  FR: 'fr_FR',
  JP: 'ja_JP',
  BR: 'pt_BR',
  KR: 'ko_KR',
  DE: 'de_DE',
  GB: 'en_GB',
  ES: 'es_ES',
  MX: 'es_MX',
  CA: 'en_CA',
  IN: 'en_IN',
  IT: 'it_IT',
  AU: 'en_AU',
  AR: 'es_AR',
};

const RETRO_THEMES = [
  'retro tv show',
  'public access',
  'vintage advertising',
  'festival documentary',
  'retro gaming arcade',
  'city travelogue',
  'home video',
  'science documentary',
  'design showcase',
  'music performance',
  'dance competition',
  'cooking show',
  'kids program',
  'news special',
  'behind the scenes',
  'talk show',
  'variety show',
  'technology expo',
  'sports recap',
  'festival recap',
];

const YT_TRENDING_PER_REGION = 30;
const DAILYMOTION_TRENDING_PER_REGION = 20;

type YoutubeThumbnails = {
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
};

type YoutubeSnippet = {
  title?: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  tags?: string[];
  thumbnails?: YoutubeThumbnails;
};

type YoutubeSearchItem = {
  id?: { videoId?: string };
  snippet?: YoutubeSnippet;
};

type YoutubeSearchResponse = {
  items?: YoutubeSearchItem[];
  nextPageToken?: string;
};

type YoutubePlaylistItem = {
  contentDetails?: { videoId?: string };
  snippet?: { title?: string; resourceId?: { videoId?: string } };
};

type YoutubePlaylistResponse = {
  items?: YoutubePlaylistItem[];
  nextPageToken?: string;
};

type YoutubeVideoItem = {
  id?: string;
  snippet?: YoutubeSnippet;
  contentDetails?: { duration?: string };
};

type YoutubeVideosResponse = {
  items?: YoutubeVideoItem[];
};

type YoutubeChannel = {
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type YoutubeChannelResponse = {
  items?: YoutubeChannel[];
};

type YoutubeVideoDetailsItem = {
  id?: string;
  snippet?: YoutubeSnippet;
  contentDetails?: { duration?: string };
};

type YoutubeVideoDetailsResponse = {
  items?: YoutubeVideoDetailsItem[];
};

type RedditPost = {
  url?: string;
  title?: string;
  permalink?: string;
  name?: string;
};

type RedditListing = {
  data?: {
    children?: Array<{ data?: RedditPost }>;
  };
};

export type RedditListingOptions = {
  listing?: 'hot' | 'new' | 'top';
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  after?: string | null;
  onCursor?: (cursor: string | null) => void;
};

export type FetchWarning = {
  label: string;
  status?: number;
  statusText?: string;
  body?: string;
  message?: string;
};

type DailymotionItem = {
  id?: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_480_url?: string;
  thumbnail_720_url?: string;
  url?: string;
  duration?: number;
  ['channel.name']?: string;
  ['channel.id']?: string;
  ['owner.screenname']?: string;
};

type DailymotionResponse = {
  list?: DailymotionItem[];
  has_more?: boolean;
};

type PixabayVideoVariant = {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
};

type PixabayVideoHit = {
  id?: number;
  pageURL?: string;
  duration?: number;
  tags?: string;
  picture_id?: string;
  user?: string;
  videos?: {
    large?: PixabayVideoVariant;
    medium?: PixabayVideoVariant;
    small?: PixabayVideoVariant;
    tiny?: PixabayVideoVariant;
  };
};

type PixabayVideoResponse = {
  hits?: PixabayVideoHit[];
};

type PexelsVideoFile = {
  id?: number;
  link?: string;
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
};

type PexelsVideoPicture = {
  picture?: string;
};

type PexelsVideo = {
  id?: number;
  url?: string;
  image?: string;
  duration?: number;
  user?: { name?: string };
  video_files?: PexelsVideoFile[];
  video_pictures?: PexelsVideoPicture[];
};

type PexelsVideoResponse = {
  videos?: PexelsVideo[];
};

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function secondsToIsoDuration(seconds?: number | null): string | undefined {
  if (!Number.isFinite(seconds) || seconds == null) return undefined;
  const safe = Math.max(0, Math.round(seconds));
  return `PT${safe}S`;
}

async function fetchJson<T = unknown>(
  url: string,
  timeoutMs = 10000,
  label?: string,
  warnings?: FetchWarning[],
  init?: RequestInit,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(USER_AGENT as HeadersInit);
    if (init?.headers) {
      const extra = new Headers(init.headers as HeadersInit);
      extra.forEach((value, key) => headers.set(key, value));
    }
    const response = await fetch(url, {
      cache: 'no-store',
      ...(init || {}),
      headers,
      signal: init?.signal || controller.signal,
    });
    if (!response.ok) {
      let body: string | undefined;
      try {
        body = await response.text();
      } catch (readError) {
        body = `(failed to read body: ${readError instanceof Error ? readError.message : String(readError)})`;
      }
      console.warn('[ingest:fetch] non-ok response', {
        label: label || url,
        status: response.status,
        statusText: response.statusText,
        body: body?.slice(0, 500),
      });
      warnings?.push({
        label: label || url,
        status: response.status,
        statusText: response.statusText,
        body: body?.slice(0, 500),
      });
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error('[ingest:fetch] request failed', {
      label: label || url,
      message: error instanceof Error ? error.message : String(error),
    });
    warnings?.push({
      label: label || url,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchYouTube(
  queries: string[],
  per: number,
  pages: number,
  days: number,
  durations: Array<'any' | 'short' | 'medium' | 'long'>,
  warnings?: FetchWarning[],
  concurrency = 2,
  maxTimePerQueryMs = 35000,
  expandVariants = false,
): Promise<RawVideo[]> {
  const envKey = process.env.YOUTUBE_API_KEY;
  if (!envKey) {
    console.warn('[ingest:youtube] missing YOUTUBE_API_KEY');
    return [];
  }
  const key = envKey;
  const collected: RawVideo[] = [];

  function expandQueryVariants(query: string, cap = 6): string[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    if (!expandVariants) return [trimmed];
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length <= 2) return [trimmed];
    const variants = new Set<string>();
    variants.add(trimmed);
    for (let size = Math.min(tokens.length - 1, 4); size >= 2; size--) {
      for (let i = 0; i + size <= tokens.length; i++) {
        variants.add(tokens.slice(i, i + size).join(' '));
        if (variants.size >= cap) break;
      }
      if (variants.size >= cap) break;
    }
    return Array.from(variants);
  }
  async function fetchForQuery(trimmed: string) {
    const started = Date.now();
    const durationList = (durations.length ? durations : ['any']) as Array<'any' | 'short' | 'medium' | 'long'>;

    async function fetchForDuration(duration: 'any' | 'short' | 'medium' | 'long') {
      if (Date.now() - started > maxTimePerQueryMs) {
        warnings?.push({ label: 'youtube:timeout', message: `Timeout on query ${trimmed}` });
        return;
      }
      let pageToken = '';
      for (let page = 0; page < pages; page++) {
        const params = new URLSearchParams();
        params.set('key', key);
        params.set('part', 'snippet');
        params.set('type', 'video');
        params.set('maxResults', String(Math.min(50, Math.max(1, per))));
        params.set('q', trimmed);
        params.set('order', Math.random() < 0.5 ? 'date' : 'relevance');
        params.set('videoEmbeddable', 'true');
        if (days > 0) {
          const publishedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
          params.set('publishedAfter', publishedAfter);
        }
        if (duration && duration !== 'any') {
          params.set('videoDuration', duration);
        }
        if (pageToken) params.set('pageToken', pageToken);
        const label = duration && duration !== 'any' ? `youtube:search:${duration}` : 'youtube:search';
        const data = await fetchJson<YoutubeSearchResponse>(
          `${YT_ENDPOINT}/search?${params.toString()}`,
          10000,
          label,
          warnings,
        );
        const items = data?.items ?? [];
        for (const item of items) {
          const id = item?.id?.videoId;
          if (!id) continue;
          const snippet = item?.snippet;
          const context = duration && duration !== 'any' ? `${trimmed} [${duration}]` : trimmed;
          collected.push({
            videoId: id,
            url: `https://youtu.be/${id}`,
            provider: 'youtube',
            title: snippet?.title || '',
            thumb: youtubeThumb(id),
            source: { name: 'YouTube', url: `https://youtu.be/${id}` },
            contextQueries: [context],
          });
        }
        pageToken = data?.nextPageToken || '';
        if (!pageToken) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (Date.now() - started > maxTimePerQueryMs) {
          warnings?.push({ label: 'youtube:timeout', message: `Timeout on query ${trimmed}` });
          return;
        }
      }
    }

    await Promise.all(durationList.map((duration) => fetchForDuration(duration)));
  }

  const queueSet = new Set<string>();
  for (const raw of queries) {
    const variants = expandQueryVariants(raw);
    for (const variant of variants) {
      if (variant) queueSet.add(variant);
    }
  }
  const queue = Array.from(queueSet);
  const limit = Math.min(concurrency, queue.length || 1);
  const workers: Promise<void>[] = [];
  const worker = async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) continue;
      try {
        await fetchForQuery(next);
      } catch (error) {
        console.error('[ingest:youtube] query failed', next, error);
        warnings?.push({ label: 'youtube:query', message: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  for (let i = 0; i < limit; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return collected;
}

async function searchDailymotion(
  queries: string[],
  per: number,
  pages: number,
  warnings?: FetchWarning[],
): Promise<RawVideo[]> {
  const collected: RawVideo[] = [];
  const limit = Math.min(100, Math.max(5, per));

  for (const query of queries) {
    const trimmed = query.trim();
    if (!trimmed) continue;

    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        search: trimmed,
        limit: String(limit),
        page: String(page + 1),
        sort: Math.random() < 0.5 ? 'recent' : 'relevance',
        fields: 'id,title,description,thumbnail_url,thumbnail_480_url,thumbnail_720_url,url,duration,channel.name,channel.id,owner.screenname',
      });

      const data = await fetchJson<DailymotionResponse>(
        `https://api.dailymotion.com/videos?${params.toString()}`,
        9000,
        'dailymotion:search',
        warnings,
      );

      const items = data?.list ?? [];
      for (const item of items) {
        const id = item?.id?.trim();
        if (!id) continue;
        const url = item?.url?.trim() || `https://www.dailymotion.com/video/${id}`;
        const thumb = item?.thumbnail_720_url || item?.thumbnail_url || item?.thumbnail_480_url;
        const channelTitle = item?.['channel.name'] || item?.['owner.screenname'] || undefined;
        const channelId = item?.['channel.id'] || undefined;
        const title = item?.title?.trim() || trimmed;
        collected.push({
          videoId: `dailymotion:${id}`,
          url,
          provider: 'dailymotion',
          title,
          description: item?.description || undefined,
          thumb: thumb || undefined,
          channelTitle,
          channelId,
          duration: secondsToIsoDuration(item?.duration),
          source: { name: 'Dailymotion', url },
          contextQueries: [`dailymotion:${trimmed}`],
        });
      }

      if (!data?.has_more) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return collected;
}

async function searchPixabayVideos(
  queries: string[],
  per: number,
  pages: number,
  warnings?: FetchWarning[],
): Promise<RawVideo[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    warnings?.push({ label: 'pixabay:videos', message: 'PIXABAY_API_KEY missing' });
    return [];
  }

  const collected: RawVideo[] = [];
  const limit = Math.min(20, Math.max(5, per));

  for (const query of queries) {
    const trimmed = query.trim();
    if (!trimmed) continue;

    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        key,
        q: trimmed,
        per_page: String(limit),
        page: String(page + 1),
        safesearch: 'true',
        video_type: 'all',
      });

      const data = await fetchJson<PixabayVideoResponse>(
        `https://pixabay.com/api/videos/?${params.toString()}`,
        9000,
        'pixabay:videos',
        warnings,
      );

      const hits = data?.hits ?? [];
      for (const hit of hits) {
        const id = typeof hit?.id === 'number' ? hit.id : Number(hit?.id);
        if (!Number.isFinite(id)) continue;
        const videos = hit?.videos || {};
        const best = videos.medium || videos.large || videos.small || videos.tiny;
        const url = best?.url || hit?.pageURL;
        if (!url) continue;
        const thumb = hit?.picture_id ? `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg` : undefined;
        const title = (hit?.tags || '').split(',').map((token) => token.trim()).filter(Boolean).join(' • ') || `Pixabay clip ${id}`;
        const apiTags = (hit?.tags || '').split(',').map((token) => token.trim()).filter(Boolean);
        collected.push({
          videoId: `pixabay:${id}`,
          url,
          provider: 'pixabay',
          title,
          thumb,
          description: hit?.tags || undefined,
          duration: secondsToIsoDuration(hit?.duration),
          source: { name: 'Pixabay', url: hit?.pageURL || url },
          channelTitle: hit?.user || undefined,
          contextQueries: [`pixabay:${trimmed}`],
          apiTags: apiTags.length ? apiTags : undefined,
        });
      }

      if (!hits.length) break;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  return collected;
}

async function searchPexelsVideos(
  queries: string[],
  per: number,
  pages: number,
  warnings?: FetchWarning[],
): Promise<RawVideo[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    warnings?.push({ label: 'pexels:videos', message: 'PEXELS_API_KEY missing' });
    return [];
  }

  const collected: RawVideo[] = [];
  const limit = Math.min(20, Math.max(5, per));

  for (const query of queries) {
    const trimmed = query.trim();
    if (!trimmed) continue;

    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        query: trimmed,
        per_page: String(limit),
        page: String(page + 1),
      });

      const data = await fetchJson<PexelsVideoResponse>(
        `https://api.pexels.com/videos/search?${params.toString()}`,
        9000,
        'pexels:videos',
        warnings,
        { headers: { Authorization: apiKey } },
      );

      const videos = data?.videos ?? [];
      for (const video of videos) {
        const id = typeof video?.id === 'number' ? video.id : Number(video?.id);
        if (!Number.isFinite(id)) continue;
        const files = Array.isArray(video?.video_files) ? video.video_files : [];
        const picture = Array.isArray(video?.video_pictures) && video.video_pictures.length
          ? video.video_pictures[0]?.picture
          : video?.image;
        const file = files.find((entry) => (entry?.file_type || '').includes('mp4') && entry?.quality === 'sd')
          || files.find((entry) => (entry?.file_type || '').includes('mp4'));
        const url = file?.link || video?.url;
        if (!url) continue;
        const title = video?.user?.name ? `${video.user.name} • ${trimmed}` : trimmed;
        collected.push({
          videoId: `pexels:${id}`,
          url,
          provider: 'pexels',
          title,
          thumb: picture || undefined,
          duration: secondsToIsoDuration(video?.duration),
          source: { name: 'Pexels', url: video?.url || url },
          channelTitle: video?.user?.name || undefined,
          contextQueries: [`pexels:${trimmed}`],
        });
      }

      if (!videos.length) break;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  return collected;
}

async function playlistYouTube(playlistId: string, per: number, warnings?: FetchWarning[]): Promise<RawVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !playlistId) return [];
  const collected: RawVideo[] = [];
  let pageToken = '';
  for (let guard = 0; guard < 10; guard++) {
    const params = new URLSearchParams({ key, part: 'snippet,contentDetails', maxResults: String(Math.min(50, Math.max(1, per))), playlistId });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await fetchJson<YoutubePlaylistResponse>(
      `${YT_ENDPOINT}/playlistItems?${params.toString()}`,
      10000,
      'youtube:playlistItems',
      warnings,
    );
    const items = data?.items ?? [];
    for (const item of items) {
      const videoId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      const snippet = item?.snippet;
      collected.push({
        videoId,
        url: `https://youtu.be/${videoId}`,
        provider: 'youtube',
        title: snippet?.title || '',
        thumb: youtubeThumb(videoId),
        source: { name: 'YouTube', url: `https://youtu.be/${videoId}` },
        contextQueries: [`playlist:${playlistId}`],
      });
    }
    pageToken = data?.nextPageToken || '';
    if (!pageToken) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return collected;
}

async function channelUploadsYouTube(channelId: string, per: number, warnings?: FetchWarning[]): Promise<RawVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !channelId) return [];
  const params = new URLSearchParams({ key, part: 'contentDetails', id: channelId });
  const data = await fetchJson<YoutubeChannelResponse>(
    `${YT_ENDPOINT}/channels?${params.toString()}`,
    8000,
    'youtube:channels',
    warnings,
  );
  const playlist = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlist) return [];
  return playlistYouTube(playlist, per, warnings);
}

async function updateYouTubeDetailsForIds(
  videoIds: string[],
  warnings?: FetchWarning[],
): Promise<void> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !videoIds.length) return;
  const collection = await getCollection();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({ key, part: 'snippet,contentDetails', id: chunk.join(',') });
    const data = await fetchJson<YoutubeVideoDetailsResponse>(
      `${YT_ENDPOINT}/videos?${params.toString()}`,
      10000,
      'youtube:videos',
      warnings,
    );
    const items = data?.items ?? [];
    if (!items.length) continue;
    for (const item of items) {
      if (!item?.id) continue;
      const update: Record<string, unknown> = {};
      const snippet = item.snippet;
      if (snippet?.title) update.title = snippet.title;
      if (snippet?.description) update.description = snippet.description;
      if (snippet?.channelId) update.channelId = snippet.channelId;
      if (snippet?.channelTitle) update.channelTitle = snippet.channelTitle;
      if (Array.isArray(snippet?.tags) && snippet.tags.length) {
        update.apiTags = snippet.tags;
      }
      const thumbnails = snippet?.thumbnails;
      const high = thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url;
      if (high) update.thumb = high;
      if (item.contentDetails?.duration) update.duration = item.contentDetails.duration;
      if (!Object.keys(update).length) continue;
      await collection.updateOne(
        { type: 'video', videoId: item.id },
        { $set: update },
      );
    }
  }
}

export async function redditYouTube(
  sub: string,
  limit: number,
  warnings?: FetchWarning[],
  options?: RedditListingOptions,
): Promise<RawVideo[]> {
  const listing = options?.listing || 'hot';
  const time = options?.time;
  const safeLimit = Math.min(100, Math.max(5, limit));
  const params = new URLSearchParams({ limit: String(safeLimit) });
  if (listing === 'top' && time) params.set('t', time);
  if (options?.after) params.set('after', options.after);

  const path = listing === 'hot' ? '' : `/${listing}`;
  const label = time ? `reddit:${sub}:${listing}:${time}` : `reddit:${sub}:${listing}`;

  const json = await fetchJson<RedditListing>(
    `https://www.reddit.com/r/${encodeURIComponent(sub)}${path}.json?${params.toString()}`,
    8000,
    label,
    warnings,
  );
  const posts = json?.data?.children?.map((child) => child?.data).filter((entry): entry is RedditPost => Boolean(entry)) || [];
  const out: RawVideo[] = [];
  let cursor: string | null = null;
  for (const post of posts) {
    if (post?.name) {
      cursor = post.name;
    }
    const url = String(post?.url || '');
    if (!/youtu\.be\//i.test(url) && !/youtube\.com\/watch\?/i.test(url)) continue;
    let videoId = '';
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu')) videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').pop() || '';
    } catch {
      videoId = '';
    }
    if (!videoId) continue;
    const context: string[] = [`reddit:${sub}`];
    if (listing) context.push(`reddit:${sub}:${listing}${time ? `:${time}` : ''}`);
    out.push({
      videoId,
      url: `https://youtu.be/${videoId}`,
      provider: 'reddit-youtube',
      title: post?.title || '',
      thumb: youtubeThumb(videoId),
      source: { name: 'Reddit', url: `https://www.reddit.com${post?.permalink || ''}` },
      contextQueries: context,
    });
  }
  if (options?.onCursor) {
    options.onCursor(cursor);
  }
  return out;
}

function looksLikeHttpUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildVideoDocument(raw: RawVideo): VideoDocument | null {
  const contextTags = expandQueryToTags(raw.contextQueries || []);
  const candidates = [
    raw.provider,
    contextTags,
    raw.apiTags,
    raw.channelTitle,
  ];
  const toneSegments = flattenToneSegments([
    raw.provider,
    raw.source?.name,
    raw.title,
    raw.description,
    raw.channelTitle,
    contextTags,
    raw.apiTags,
  ]);
  const tone = deriveToneAugmentation(toneSegments);
  const tags = buildTagList([...candidates, tone?.toneTagHints], 14);
  const keywords = mergeKeywordSources([
    raw.title,
    raw.description,
    raw.channelTitle,
    (raw.contextQueries || []).join(' '),
    tone?.toneSignals.join(' '),
  ], 16);

  if (!raw.videoId || !looksLikeHttpUrl(raw.url)) return null;
  if (!tags.length || !keywords.length) return null;

  return {
    type: 'video',
    videoId: raw.videoId,
    url: raw.url,
    provider: raw.provider,
    title: raw.title,
    thumb: raw.thumb,
    source: raw.source,
    description: raw.description,
    channelId: raw.channelId,
    channelTitle: raw.channelTitle,
    duration: raw.duration,
    tags,
    keywords,
    tone: tone?.tone,
    toneConfidence: tone?.toneConfidence,
    toneSignals: tone?.toneSignals,
  };
}

let cachedCollection: Collection<VideoDocument> | null = null;
let videoIndexesEnsured = false;

async function getCollection(): Promise<Collection<VideoDocument>> {
  if (!cachedCollection) {
    const db: Db = await getDb();
    cachedCollection = db.collection<VideoDocument>('items');
  }
  if (!videoIndexesEnsured && cachedCollection) {
    videoIndexesEnsured = true;
    cachedCollection
      .createIndex(
        { type: 1, videoId: 1 },
        { unique: true, name: 'uniq_video_id', partialFilterExpression: { type: 'video', videoId: { $type: 'string' } } },
      )
      .catch((error) => {
      console.warn('[ingest:videos] failed to ensure index', error);
    });
  }
  return cachedCollection;
}

export async function finalizeVideoIngest(
  collected: RawVideo[],
  options: {
    dryRun: boolean;
    sampleSize: number;
    warnings: FetchWarning[];
    providers?: string[];
  },
): Promise<IngestResult> {
  const { dryRun, sampleSize, warnings, providers } = options;

  const map = new Map<string, RawVideo>();
  for (const video of collected) {
    if (!video.videoId || map.has(video.videoId)) continue;
    map.set(video.videoId, video);
  }

  const unique = Array.from(map.values());
  const documents: VideoDocument[] = [];
  let skippedInvalid = 0;
  for (const raw of unique) {
    const doc = buildVideoDocument(raw);
    if (!doc) {
      skippedInvalid += 1;
      continue;
    }
    documents.push(doc);
  }

  const providerCounts: Record<string, number> = {};
  for (const doc of documents) {
    providerCounts[doc.provider] = (providerCounts[doc.provider] || 0) + 1;
  }

  const sampleDocuments = documents.slice(0, Math.max(0, sampleSize));
  const summaryProviders = providers && providers.length
    ? providers
    : Array.from(new Set(documents.map((doc) => doc.provider)));

  const summary: IngestResult = {
    scanned: collected.length,
    unique: documents.length,
    inserted: 0,
    updated: 0,
    dryRun,
    providerCounts,
    sample: sampleDocuments,
    warnings,
    skippedInvalid,
    providers: summaryProviders,
  };

  if (dryRun || !documents.length) {
    return summary;
  }

  const collection = await getCollection();
  const operations = documents.map((doc) => {
    const filter: Filter<VideoDocument> = { type: 'video', videoId: doc.videoId };
    return {
      updateOne: {
        filter,
        update: {
          $set: { ...doc, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date(), rand: Math.random() },
        },
        upsert: true,
      },
    };
  });

  const bulk = await collection.bulkWrite(operations, { ordered: false });
  summary.inserted = bulk.upsertedCount || 0;
  summary.updated = bulk.modifiedCount || 0;

  if (bulk.upsertedCount && bulk.upsertedCount > 0) {
    const upsertedIndexes = Object.keys(bulk.upsertedIds || {}).map((key) => Number(key));
    const newVideoIds = upsertedIndexes
      .map((index) => documents[index]?.videoId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    if (newVideoIds.length) {
      await updateYouTubeDetailsForIds(newVideoIds, warnings);
    }
  }

  return summary;
}

export async function ingestVideos(options: IngestVideosOptions): Promise<IngestResult> {
  const {
    mode,
    queries = [],
    per = 20,
    pages = 1,
    days = 120,
    playlistId,
    channelId,
  reddit,
  manualIds = [],
  dryRun = false,
  sampleSize = 6,
    durations = ['any'],
    providers = ['youtube', 'dailymotion', 'pixabay', 'pexels'],
    fast = false,
  } = options;

  const collected: RawVideo[] = [];
  const fetchWarnings: FetchWarning[] = [];
  const providerSet = new Set(providers && providers.length ? providers : ['youtube']);

  if (manualIds.length) {
    for (const id of manualIds) {
      const trimmed = id.trim();
      if (!trimmed) continue;
      collected.push({
        videoId: trimmed,
        url: `https://youtu.be/${trimmed}`,
        provider: 'manual',
        title: '',
        thumb: youtubeThumb(trimmed),
        source: { name: 'YouTube', url: `https://youtu.be/${trimmed}` },
        contextQueries: ['manual'],
      });
    }
  }

  if (mode === 'search') {
    const effectiveQueries = queries.length ? queries : ['weird public access show', 'retro craft tutorial'];
    let youtubeResults: RawVideo[] = [];
    const providerTasks: Array<Promise<{ provider: string; results: RawVideo[] }>> = [];

    const wrap = (provider: string, promise: Promise<RawVideo[]>) =>
      promise
        .then((results) => ({ provider, results }))
        .catch((error) => {
          console.error(`[ingest:videos] ${provider} failed`, error);
          fetchWarnings.push({ label: `${provider}:error`, message: error instanceof Error ? error.message : String(error) });
          return { provider, results: [] };
        });

    const ytPer = fast ? Math.max(8, Math.min(16, per)) : per;
    const ytPages = fast ? 1 : pages;
    const ytConcurrency = fast ? 4 : 2;
    const ytTimeout = fast ? 25000 : 45000;

    if (providerSet.has('youtube')) {
      providerTasks.push(
        wrap(
          'youtube',
          searchYouTube(
            effectiveQueries,
            ytPer,
            ytPages,
            days,
            durations,
            fetchWarnings,
            ytConcurrency,
            ytTimeout,
            fast,
          ),
        ),
      );
    }
    if (providerSet.has('dailymotion')) {
      providerTasks.push(wrap('dailymotion', searchDailymotion(effectiveQueries, per, pages, fetchWarnings)));
    }
    if (providerSet.has('pixabay')) {
      providerTasks.push(wrap('pixabay', searchPixabayVideos(effectiveQueries, per, pages, fetchWarnings)));
    }
    if (providerSet.has('pexels')) {
      providerTasks.push(wrap('pexels', searchPexelsVideos(effectiveQueries, per, pages, fetchWarnings)));
    }

    const providerResults = await Promise.all(providerTasks);
    for (const { provider, results } of providerResults) {
      if (provider === 'youtube') {
        youtubeResults = results;
      }
      collected.push(...results);
    }

    if (!youtubeResults.length && providerSet.has('youtube') && effectiveQueries.some((q) => /\d{4}/.test(q))) {
      const relaxedQueries = effectiveQueries
        .map((q) => q.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (relaxedQueries.length) {
        collected.push(
          ...await searchYouTube(
            relaxedQueries,
            ytPer,
            1,
            0,
            durations,
            fetchWarnings,
            ytConcurrency,
            ytTimeout,
            fast,
          ),
        );
      }
    }
  } else if (mode === 'playlist' && playlistId) {
    collected.push(...await playlistYouTube(playlistId, per, fetchWarnings));
  } else if (mode === 'channel' && channelId) {
    collected.push(...await channelUploadsYouTube(channelId, per, fetchWarnings));
  }

  if (reddit) {
    collected.push(...await redditYouTube(reddit.sub, reddit.limit, fetchWarnings));
  }

  const summary = await finalizeVideoIngest(collected, {
    dryRun,
    sampleSize,
    warnings: fetchWarnings,
    providers: Array.from(providerSet),
  });

  const sampleVideoIds = (summary.sample || []).map((doc) => doc.videoId);

  console.log('[ingest:videos] processed', {
    mode,
    providers: Array.from(providerSet),
    dryRun: summary.dryRun,
    scanned: summary.scanned,
    unique: summary.unique,
    providerCounts: summary.providerCounts,
    sampleVideoIds,
    warnings: fetchWarnings,
  });

  return summary;
}

function trendingPairIndex(date = new Date()): number {
  const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  return Math.abs(dayIndex) % TRENDING_REGION_PAIRS.length;
}

export function pickTrendingRegions(date = new Date()): [string, string] {
  return TRENDING_REGION_PAIRS[trendingPairIndex(date)];
}

async function fetchYouTubeTrending(region: string, limit: number, warnings: FetchWarning[]): Promise<RawVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    warnings.push({ label: 'youtube:trending', message: 'YOUTUBE_API_KEY missing' });
    return [];
  }
  const url = new URL(YT_VIDEOS_ENDPOINT);
  url.searchParams.set('key', key);
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('regionCode', region);
  url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, limit))));
  const data = await fetchJson<YoutubeVideosResponse>(url.toString(), { headers: USER_AGENT, timeoutMs: 10000 });
  const items = data?.items ?? [];
  const rows: RawVideo[] = [];
  for (const item of items.slice(0, limit)) {
    const videoId = item?.id?.trim();
    const snippet = item?.snippet;
    if (!videoId || !snippet?.title) continue;
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;
    rows.push({
      videoId,
      url: `https://youtu.be/${videoId}`,
      provider: 'youtube',
      title: snippet.title,
      description: snippet.description,
      thumb: thumb || undefined,
      channelId: snippet.channelId,
      channelTitle: snippet.channelTitle,
      duration: item?.contentDetails?.duration,
      source: { name: snippet.channelTitle || 'YouTube', url: watchUrl },
      contextQueries: [`youtube:trending:${region.toLowerCase()}`],
    });
  }
  return rows;
}

async function fetchDailymotionTrending(region: string, limit: number, warnings: FetchWarning[]): Promise<RawVideo[]> {
  const params = new URLSearchParams({
    sort: 'trending',
    limit: String(Math.min(100, Math.max(1, limit))),
    fields: 'id,title,description,thumbnail_url,thumbnail_480_url,url,duration,channel.name,channel.id,owner.screenname',
  });
  const locale = DAILYMOTION_LOCALE[region];
  if (locale) params.set('localization', locale);
  const data = await fetchJson<DailymotionResponse>(`https://api.dailymotion.com/videos?${params.toString()}`, {
    headers: USER_AGENT,
    timeoutMs: 8000,
  });
  const list = data?.list ?? [];
  const rows: RawVideo[] = [];
  for (const item of list.slice(0, limit)) {
    const id = item?.id?.trim();
    const url = item?.url?.trim() || (id ? `https://www.dailymotion.com/video/${id}` : '');
    if (!id || !url) continue;
    const thumb = item?.thumbnail_480_url || item?.thumbnail_url;
    const title = item?.title?.trim() || undefined;
    rows.push({
      videoId: `dailymotion:${id}`,
      url,
      provider: 'dailymotion',
      title,
      description: item?.description || undefined,
      thumb: thumb || undefined,
      channelId: item?.['channel.id'] || undefined,
      channelTitle: item?.['channel.name'] || item?.['owner.screenname'] || undefined,
      duration: secondsToIsoDuration(item?.duration),
      source: { name: 'Dailymotion', url },
      contextQueries: [`dailymotion:trending:${region.toLowerCase()}`],
    });
  }
  if (!rows.length && !locale) {
    warnings.push({ label: 'dailymotion:trending', message: `No trending results for region ${region}` });
  }
  return rows;
}

export async function ingestTrendingVideos(regions: string[], options: { dryRun?: boolean } = {}): Promise<IngestResult> {
  const warnings: FetchWarning[] = [];
  const collected: RawVideo[] = [];
  for (const region of regions) {
    collected.push(...await fetchYouTubeTrending(region, YT_TRENDING_PER_REGION, warnings));
    collected.push(...await fetchDailymotionTrending(region, DAILYMOTION_TRENDING_PER_REGION, warnings));
  }
  if (!collected.length) {
    return {
      scanned: 0,
      unique: 0,
      inserted: 0,
      updated: 0,
      dryRun: Boolean(options.dryRun),
      warnings,
      providers: ['youtube', 'dailymotion'],
    };
  }
  return finalizeVideoIngest(collected, {
    dryRun: Boolean(options.dryRun),
    sampleSize: Math.min(20, collected.length),
    warnings,
    providers: ['youtube', 'dailymotion'],
  });
}

function seededRandom(seed: number) {
  return function mulberry32() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRetroQueries(count: number, date = new Date()): string[] {
  const daySeed = Number.parseInt(date.toISOString().slice(0, 10).replace(/-/g, ''), 10);
  const rng = seededRandom(daySeed);
  const queries: string[] = [];
  for (let i = 0; i < count; i++) {
    const theme = RETRO_THEMES[Math.floor(rng() * RETRO_THEMES.length)] || 'retro video';
    const year = 1965 + Math.floor(rng() * 40);
    const extra = rng() < 0.5 ? 'full episode' : 'highlight';
    queries.push(`${theme} ${year} ${extra}`.trim());
  }
  return queries;
}

export async function ingestRetroTrendingVideos(count = 100, options: { dryRun?: boolean } = {}): Promise<IngestResult> {
  const queries = buildRetroQueries(count);
  return ingestVideos({
    mode: 'search',
    queries,
    per: 12,
    pages: 1,
    days: 0,
    providers: ['youtube', 'dailymotion'],
    fast: true,
    dryRun: Boolean(options.dryRun),
    sampleSize: 12,
  });
}
