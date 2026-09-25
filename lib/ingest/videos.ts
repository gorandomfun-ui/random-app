import { getDb } from '@/lib/db';
import { permitBaseYouTube, noteBaseYouTubeQuota, withRetroYouTubeBudget } from './youtubeQuota';
import { retroSearchPlan, youtubeSearchBatch } from './retroSearchPlan';
import type { AnyBulkWriteOperation, Collection, Db, Filter } from 'mongodb';
import { buildVideoDocument } from './videoDocument';
import { tagForInsert } from '@/lib/v3/tagging/atInsert';
import type { Universe } from '@/lib/v3/types';
import type { Line } from '@/lib/v3/types';
export { buildVideoDocument } from './videoDocument';
import { videoDiscoveryFields, type DiscoveryVideoFields } from './discoveryMetadata';
import {
  isOrdinaryRoutineVideo,
  ROUTINE_NEWS_RADIO_DAILY_LIMIT,
} from '@/lib/random/videoEditorial';
import { applyRoutineVideoIngestCap } from './videoEditorialAdmission';

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
  publishedAt?: string | Date;
  trendObservedAt?: Date;
  statsObservedAt?: Date;
  viewCount?: number;
  sourceStatus?: DiscoveryVideoFields['sourceStatus'];
  apiTags?: string[];
  description?: string;
  channelId?: string;
  channelTitle?: string;
  duration?: string;
  categoryId?: string;
  liveBroadcastContent?: string;
  editorialRoutine?: boolean;
  editorialRoutineIngestedAt?: Date;
  /** The universe the line that found the video was looking for; read by the tagger at insert, never stored. */
  universeHint?: Universe;
};

export type VideoDocument = Partial<DiscoveryVideoFields> & {
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
  categoryId?: string;
  liveBroadcastContent?: string;
  editorialRoutine?: boolean;
  editorialRoutineIngestedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  tone?: 'positive' | 'neutral' | 'negative';
  toneConfidence?: number;
  toneSignals?: string[];
  rand?: number;
  enrichedAt?: Date;
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
  skipDetails?: boolean;
  insertOnly?: boolean;
  youtubeOrder?: 'date' | 'relevance' | 'viewCount';
  youtubePer?: number;
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
  existingSkipped?: number;
  providers?: string[];
  /** What was actually written, by provider. */
  insertedByProvider?: Record<string, number>;
  remaining?: number;
};

export type VideoIngestStage = 'ingest-collection' | 'ingest-routine' | 'ingest-admission' |
  'ingest-existing' | 'ingest-write' | 'ingest-completed';

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

/** How long a "seen trending" mark stays good enough to leave alone. */
const TREND_MARK_FRESH_MS = 20 * 60 * 60 * 1000;

const YT_TRENDING_PER_REGION = 50;
const RETRO_QUERY_COUNT = 10;
const RETRO_RESULTS_PER_QUERY = 10;

type YoutubeThumbnails = {
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
};

type YoutubeSnippet = {
  publishedAt?: string;
  title?: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  tags?: string[];
  thumbnails?: YoutubeThumbnails;
  categoryId?: string;
  liveBroadcastContent?: string;
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
  statistics?: { viewCount?: string };
  status?: DiscoveryVideoFields['sourceStatus'];
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
  statistics?: { viewCount?: string };
  status?: DiscoveryVideoFields['sourceStatus'];
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
  ['owner.id']?: string;
  created_time?: number;
  views_total?: number;
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
    if (!await permitBaseYouTube(url)) {
      warnings?.push({ label: 'youtube:budget-unavailable', message: 'Shared YouTube budget unavailable: daily limit, reserved lane, or later window' });
      return null;
    }
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
      await noteBaseYouTubeQuota(url, response.status, body);
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
  preferredOrder?: 'date' | 'relevance' | 'viewCount',
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
      const order = preferredOrder ?? (Math.random() < 0.5 ? 'date' : 'relevance');
      const publishedAfter = days > 0 ? new Date(started - days * 86400000).toISOString() : undefined;
      for (let page = 0; page < pages; page++) {
        const params = new URLSearchParams();
        params.set('key', key);
        params.set('part', 'snippet');
        params.set('type', 'video');
        params.set('maxResults', String(Math.min(50, Math.max(1, per))));
        params.set('q', trimmed);
        params.set('order', order);
        params.set('videoEmbeddable', 'true');
        if (publishedAfter) params.set('publishedAfter', publishedAfter);
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
            description: snippet?.description,
            channelId: snippet?.channelId,
            channelTitle: snippet?.channelTitle,
            publishedAt: snippet?.publishedAt,
            liveBroadcastContent: snippet?.liveBroadcastContent,
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

    const sort = Math.random() < 0.5 ? 'recent' : 'relevance';
    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        search: trimmed,
        limit: String(limit),
        page: String(page + 1),
        sort,
        fields: 'id,title,description,thumbnail_url,thumbnail_480_url,thumbnail_720_url,url,duration,channel.name,channel.id,owner.screenname,owner.id,created_time,views_total',
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
        const channelTitle = item?.['owner.screenname'] || undefined;
        const channelId = item?.['owner.id'] || undefined;
        const title = item?.title?.trim() || undefined;
        collected.push({
          videoId: `dailymotion:${id}`,
          url,
          provider: 'dailymotion',
          title,
          description: item?.description || undefined,
          thumb: thumb || undefined,
          channelTitle,
          channelId,
          categoryId: item?.['channel.id'],
          publishedAt: item.created_time ? new Date(item.created_time * 1000) : undefined,
          viewCount: item.views_total,
          statsObservedAt: item.views_total != null ? new Date() : undefined,
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
): Promise<{ checked: number; updated: number }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !videoIds.length) return { checked: 0, updated: 0 };
  videoIds = [...new Set(videoIds)].filter(id => /^[A-Za-z0-9_-]{11}$/.test(id));
  const collection = await getCollection();
  let checked = 0;
  let updated = 0;
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({ key, part: 'snippet,contentDetails,statistics,status', id: chunk.join(',') });
    const data = await fetchJson<YoutubeVideoDetailsResponse>(
      `${YT_ENDPOINT}/videos?${params.toString()}`,
      10000,
      'youtube:videos',
      warnings,
    );
    const items = data?.items ?? [];
    if (!items.length) continue;
    checked += items.length;
    const operations: AnyBulkWriteOperation<VideoDocument>[] = [];
    const now = new Date();
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
      Object.assign(update, videoDiscoveryFields({
        provider: 'youtube', title: snippet?.title, description: snippet?.description, apiTags: snippet?.tags,
        publishedAt: snippet?.publishedAt,
        viewCount: item.statistics?.viewCount != null ? Number(item.statistics.viewCount) : undefined,
        statsObservedAt: item.statistics ? now : undefined, sourceStatus: item.status,
      }, now));
      // Enrichment must not erase how the item was discovered.
      delete update.discoveryQueries;
      update.updatedAt = now;
      update.enrichedAt = now;
      operations.push({
        updateOne: {
          filter: { type: 'video', provider: { $in: ['youtube', 'reddit-youtube', 'manual'] }, videoId: item.id },
          update: { $set: update },
        },
      });
    }
    if (operations.length) {
      const result = await collection.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount || 0;
    }
  }
  return { checked, updated };
}

function hasUsefulValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function needsYouTubeDetails(doc: VideoDocument): boolean {
  return !hasUsefulValue(doc.duration)
    || !hasUsefulValue(doc.description)
    || !hasUsefulValue(doc.channelId)
    || !hasUsefulValue(doc.channelTitle)
    || !hasUsefulValue(doc.thumb);
}

export async function enrichRecentYouTubeVideos(options: {
  dryRun?: boolean;
  limit?: number;
  days?: number;
  sampleSize?: number;
} = {}): Promise<IngestResult & { checked?: number }> {
  const collection = await getCollection();
  const limit = Math.max(1, Math.min(120, options.limit ?? 25));
  const days = Math.max(1, Math.min(30, options.days ?? 2));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sampleSize = Math.max(0, Math.min(20, options.sampleSize ?? 8));
  collection.createIndex(
    { type: 1, provider: 1, createdAt: -1 },
    { name: 'video_provider_createdAt_lookup', partialFilterExpression: { type: 'video' } },
  ).catch((error) => {
    console.warn('[ingest:videos] failed to ensure enrichment index', error);
  });
  const baseQuery: Filter<VideoDocument> = {
    type: 'video',
    provider: 'youtube',
    videoId: { $type: 'string' },
    createdAt: { $gte: since },
  } as Filter<VideoDocument>;

  const scanLimit = Math.min(600, Math.max(limit * 6, limit));
  const recentCandidates = await collection
    .find(baseQuery)
    .sort({ createdAt: -1 })
    .limit(scanLimit)
    .toArray();

  const missingCandidates = recentCandidates.filter(needsYouTubeDetails);
  const candidates = missingCandidates.slice(0, limit);
  const remaining = Math.max(0, missingCandidates.length - candidates.length);

  const ids = candidates
    .map((doc) => doc.videoId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  const uniqueIds = Array.from(new Set(ids));
  const summary: IngestResult & { checked?: number } = {
    scanned: candidates.length,
    unique: uniqueIds.length,
    inserted: 0,
    updated: 0,
    dryRun: Boolean(options.dryRun),
    providerCounts: { youtube: uniqueIds.length },
    sample: candidates.slice(0, sampleSize),
    warnings: [],
    skippedInvalid: candidates.length - uniqueIds.length,
    existingSkipped: 0,
    providers: ['youtube'],
    checked: 0,
    remaining,
  };

  if (options.dryRun || !uniqueIds.length) return summary;

  const result = await updateYouTubeDetailsForIds(uniqueIds, summary.warnings);
  summary.checked = result.checked;
  summary.updated = result.updated;
  return summary;
}

import { redditYouTube } from './sources/redditFeed';
export { redditYouTube };

let cachedCollection: Collection<VideoDocument> | null = null;
let videoIndexesPromise: Promise<void> | null = null;

async function getCollection(): Promise<Collection<VideoDocument>> {
  if (!cachedCollection) {
    const db: Db = await getDb();
    cachedCollection = db.collection<VideoDocument>('items');
  }
  if (!videoIndexesPromise) {
    videoIndexesPromise = Promise.all([
      cachedCollection.createIndex(
        { type: 1, videoId: 1 },
        { unique: true, name: 'uniq_video_id', partialFilterExpression: { type: 'video', videoId: { $type: 'string' } } },
      ),
      cachedCollection.createIndex(
        { editorialRoutineIngestedAt: -1 },
        { name: 'video_editorial_routine_ingested_at', partialFilterExpression: {
          type: 'video', editorialRoutine: true, editorialRoutineIngestedAt: { $type: 'date' },
        } },
      ),
    ]).then(() => undefined).catch((error) => {
      videoIndexesPromise = null;
      console.warn('[ingest:videos] failed to ensure indexes', error);
      throw error;
    });
  }
  await videoIndexesPromise;
  return cachedCollection;
}

async function findExistingVideoIds(collection: Collection<VideoDocument>, videoIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(videoIds.filter(Boolean))];
  const found = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 10) {
    const rows = await Promise.all(ids.slice(offset, offset + 10).map(videoId => collection.findOne(
      { type: 'video', videoId } as Filter<VideoDocument>,
      // Not the unique index: it is partial on `$type: 'string'`, which the
      // planner cannot prove from an equality, so it scanned every video.
      { projection: { videoId: 1 }, hint: 'video_id_lookup', maxTimeMS: 2000 },
    )));
    for (const row of rows) if (row?.videoId) found.add(row.videoId);
  }
  return found;
}

export async function finalizeVideoIngest(
  collected: RawVideo[],
  options: {
    dryRun: boolean;
    sampleSize: number;
    warnings: FetchWarning[];
    providers?: string[];
    skipDetails?: boolean;
    insertOnly?: boolean;
    routineWarningLabel?: string;
    onStage?: (stage: VideoIngestStage) => void;
    conservativeRoutineInitialization?: boolean;
    /** The ingestion line written on the v3 block; without it the tagger's own reading stands. */
    line?: Line;
  },
): Promise<IngestResult> {
  const { dryRun, sampleSize, warnings, providers, skipDetails = false, insertOnly = false,
    routineWarningLabel = 'videos:editorial-quota', onStage, conservativeRoutineInitialization = false, line } = options;

  const map = new Map<string, RawVideo>();
  for (const video of collected) {
    if (!video.videoId || map.has(video.videoId)) continue;
    map.set(video.videoId, video);
  }

  onStage?.('ingest-collection');
  const collection = await getCollection();
  const deduplicated = Array.from(map.values());
  onStage?.('ingest-routine');
  const routineIds = deduplicated.filter(isOrdinaryRoutineVideo).map((video) => video.videoId);
  const existingIds = insertOnly ? new Set<string>() : await findExistingVideoIds(collection, routineIds);
  const existingRoutineIds = new Set(routineIds.filter(videoId => existingIds.has(videoId)));
  onStage?.('ingest-admission');
  const admission = await applyRoutineVideoIngestCap(await getDb(), deduplicated, new Date(), {
    dryRun,
    existingVideoIds: existingRoutineIds,
    conservativeInitialization: conservativeRoutineInitialization,
  });
  if (admission.filtered) {
    warnings.push({
      label: routineWarningLabel,
      message: `${admission.filtered} routine news, radio, podcast, or live video${admission.filtered === 1 ? '' : 's'} filtered; ${Math.min(ROUTINE_NEWS_RADIO_DAILY_LIMIT, admission.alreadyIngested + admission.admitted)}/${ROUTINE_NEWS_RADIO_DAILY_LIMIT} admitted in the last 24 hours`,
    });
  }

  const unique = admission.videos;
  const documents: VideoDocument[] = [];
  // What a line asked for, by video id: handed to the tagger at insert, kept out of every write.
  const universeHints = new Map<string, Universe>();
  let skippedInvalid = 0;
  for (const raw of unique) {
    const doc = buildVideoDocument(raw);
    if (!doc) {
      skippedInvalid += 1;
      continue;
    }
    if (raw.universeHint) universeHints.set(doc.videoId, raw.universeHint);
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
    existingSkipped: 0,
    providers: summaryProviders,
  };

  if (dryRun || !documents.length) {
    onStage?.('ingest-completed');
    return summary;
  }

  const observedTrends = documents.filter(doc => doc.trendObservedAt);
  if (insertOnly && observedTrends.length) {
    // One write for the whole batch, not one per video. These timestamps all
    // come from the same fetch, so a single $max over the list says exactly the
    // same thing. As a hundred separate updates it was three minutes of work on
    // our database, which is why the trending line stopped finishing at all.
    const videoIds = [...new Set(observedTrends.map(doc => doc.videoId).filter(Boolean))] as string[];
    const observedAt = observedTrends.reduce<Date>(
      (latest, doc) => (doc.trendObservedAt! > latest ? doc.trendObservedAt! : latest),
      observedTrends[0].trendObservedAt!,
    );
    // And only for the videos whose mark is stale. The same videos trend all day
    // long, so refreshing a timestamp that already says "today" rewrote almost
    // every row of the batch for nothing — and a row costs seconds here.
    const staleBefore = new Date(observedAt.getTime() - TREND_MARK_FRESH_MS);
    // Two steps, each a plain index seek. As one update with an $or of
    // "missing" and "older" marks, the planner left the video-id index and
    // walked every video without a mark — twelve minutes for a hundred ids,
    // and the phase never finished. Reading the ids first costs nothing and
    // leaves the planner no choice.
    const known = await collection
      .find(
        { type: 'video', videoId: { $in: videoIds } } as Filter<VideoDocument>,
        { projection: { _id: 1, trendObservedAt: 1 }, hint: 'video_id_lookup', maxTimeMS: 20000 },
      )
      .toArray();
    const staleIds = known
      .filter((row) => !(row.trendObservedAt instanceof Date) || row.trendObservedAt < staleBefore)
      .map((row) => row._id);
    const refreshed = staleIds.length
      ? await collection.updateMany({ _id: { $in: staleIds } } as Filter<VideoDocument>, { $max: { trendObservedAt: observedAt } })
      : { modifiedCount: 0 };
    summary.updated += refreshed.modifiedCount;
  }
  const writeDocuments = documents;

  if (!writeDocuments.length) {
    onStage?.('ingest-completed');
    return summary;
  }

  const now = new Date();
  if (insertOnly) {
    onStage?.('ingest-write');
    // Tag as we insert. Without this a new video arrives with no subject and
    // can never appear in a Wave until the next full pass runs.
    const insertDocuments = await tagForInsert(
      await getDb(),
      writeDocuments.map((doc) => ({
        ...doc,
        ...(universeHints.has(doc.videoId) ? { universeHint: universeHints.get(doc.videoId) } : {}),
        createdAt: now,
        updatedAt: now,
        rand: Math.random(),
      })),
      line,
    );
    let insertedIndexes = insertDocuments.map((_doc, index) => index);
    try {
      const insertResult = await collection.insertMany(insertDocuments, { ordered: false, maxTimeMS: 20000 });
      summary.inserted = insertResult.insertedCount || 0;
    } catch (error) {
      const bulk = error as { writeErrors?: Array<{ code?: number; index?: number }>; result?: { insertedCount?: number } };
      const writeErrors = bulk.writeErrors ?? [];
      if (!writeErrors.length || writeErrors.some(entry => entry.code !== 11000)) throw error;
      const duplicateIndexes = new Set(writeErrors.flatMap(entry => Number.isSafeInteger(entry.index) ? [entry.index!] : []));
      insertedIndexes = insertedIndexes.filter(index => !duplicateIndexes.has(index));
      summary.inserted = bulk.result?.insertedCount ?? insertedIndexes.length;
      summary.existingSkipped = duplicateIndexes.size;
    }
    const insertedByProvider: Record<string, number> = {};
    for (const index of insertedIndexes) {
      const provider = insertDocuments[index]?.provider;
      if (typeof provider === 'string' && provider) insertedByProvider[provider] = (insertedByProvider[provider] || 0) + 1;
    }
    summary.insertedByProvider = insertedByProvider;

    if (!skipDetails && summary.inserted > 0) {
      const newVideoIds = insertedIndexes
        .map(index => insertDocuments[index]?.videoId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      if (newVideoIds.length) {
        await updateYouTubeDetailsForIds(newVideoIds, warnings);
      }
    }

    onStage?.('ingest-completed');
    return summary;
  }

  const operations = writeDocuments.map((doc) => {
    const filter: Filter<VideoDocument> = { type: 'video', videoId: doc.videoId };
    return {
      updateOne: {
        filter,
        update: {
          $set: { ...doc, updatedAt: now },
          $setOnInsert: { createdAt: now, rand: Math.random() },
        },
        upsert: true,
      },
    };
  });

  const bulk = await collection.bulkWrite(operations, { ordered: false });
  summary.inserted = bulk.upsertedCount || 0;
  summary.updated = bulk.modifiedCount || 0;

  if (!skipDetails && bulk.upsertedCount && bulk.upsertedCount > 0) {
    const upsertedIndexes = Object.keys(bulk.upsertedIds || {}).map((key) => Number(key));
    const newVideoIds = upsertedIndexes
      .map((index) => writeDocuments[index]?.videoId)
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
    skipDetails = false,
    insertOnly = false,
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

    const batch = youtubeSearchBatch(per, pages, fast);
    const ytPer = options.youtubePer == null ? batch.per : Math.max(1, Math.min(50, Math.floor(options.youtubePer)));
    const { pages: ytPages, concurrency: ytConcurrency, timeout: ytTimeout } = batch;

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
            false, // One planned query must not silently fan out into six search calls.
            options.youtubeOrder,
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

    if (!youtubeResults.length && providerSet.has('youtube') &&
      !fetchWarnings.some(w => w.label === 'youtube:budget-unavailable' || w.status === 403 || w.status === 429) &&
      effectiveQueries.some((q) => /\d{4}/.test(q))) {
      const relaxedQueries = effectiveQueries
        .map((q) => q.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean).slice(0, 2);
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
            false,
            options.youtubeOrder,
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
    skipDetails,
    insertOnly,
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
  url.searchParams.set('part', 'snippet,contentDetails,statistics,status');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('regionCode', region);
  url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, limit))));
  const data = await fetchJson<YoutubeVideosResponse>(
    url.toString(),
    10000,
    'youtube:trending',
    warnings,
    { headers: USER_AGENT },
  );
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
      apiTags: snippet.tags,
      publishedAt: snippet.publishedAt,
      trendObservedAt: new Date(),
      viewCount: item.statistics?.viewCount != null ? Number(item.statistics.viewCount) : undefined,
      statsObservedAt: item.statistics ? new Date() : undefined,
      sourceStatus: item.status,
      thumb: thumb || undefined,
      channelId: snippet.channelId,
      channelTitle: snippet.channelTitle,
      duration: item?.contentDetails?.duration,
      categoryId: snippet.categoryId,
      liveBroadcastContent: snippet.liveBroadcastContent,
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
    fields: 'id,title,description,thumbnail_url,thumbnail_480_url,url,duration,channel.name,channel.id,owner.screenname,owner.id,created_time,views_total',
  });
  const locale = DAILYMOTION_LOCALE[region];
  if (locale) params.set('localization', locale);
  const data = await fetchJson<DailymotionResponse>(
    `https://api.dailymotion.com/videos?${params.toString()}`,
    8000,
    'dailymotion:trending',
    warnings,
    { headers: USER_AGENT },
  );
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
      channelId: item?.['owner.id'] || undefined,
      channelTitle: item?.['owner.screenname'] || undefined,
      categoryId: item?.['channel.id'],
      publishedAt: item.created_time ? new Date(item.created_time * 1000) : undefined,
      viewCount: item.views_total,
      statsObservedAt: item.views_total != null ? new Date() : undefined,
      trendObservedAt: new Date(),
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

export async function ingestTrendingVideos(regions: string[], options: { dryRun?: boolean; limitPerProvider?: number; skipDetails?: boolean; insertOnly?: boolean;
  providers?: Array<'youtube' | 'dailymotion'>; conservativeRoutineInitialization?: boolean } = {}): Promise<IngestResult> {
  const warnings: FetchWarning[] = [];
  const collected: RawVideo[] = [];
  const limit = Math.min(50, Math.max(10, options.limitPerProvider ?? YT_TRENDING_PER_REGION));
  const providers = options.providers ?? ['youtube', 'dailymotion'];
  const tasks = regions.slice(0, 2).flatMap(region => providers.map(provider => provider === 'youtube'
    ? fetchYouTubeTrending(region, limit, warnings) : fetchDailymotionTrending(region, limit, warnings)));
  const settled = await Promise.all(tasks);
  for (const rows of settled) collected.push(...rows);
  return finalizeVideoIngest(collected, {
    dryRun: Boolean(options.dryRun),
    sampleSize: Math.min(20, collected.length),
    warnings,
    providers,
    skipDetails: options.skipDetails ?? true,
    insertOnly: options.insertOnly ?? false,
    routineWarningLabel: 'trending:editorial-quota',
    conservativeRoutineInitialization: options.conservativeRoutineInitialization,
    line: 'trend',
  });
}

export async function ingestRetroTrendingVideos(options: {
  dryRun?: boolean
  queryCount?: number
  per?: number
  skipDetails?: boolean
} = {}): Promise<IngestResult> {
  const queryCount = Math.min(RETRO_QUERY_COUNT, Math.max(2, options.queryCount ?? RETRO_QUERY_COUNT))
  const per = Math.max(8, Math.min(RETRO_RESULTS_PER_QUERY, options.per ?? RETRO_RESULTS_PER_QUERY))
  const { queries, order } = retroSearchPlan(queryCount)
  return withRetroYouTubeBudget(() => ingestVideos({
    mode: 'search',
    queries,
    per,
    pages: 1,
    days: 0,
    providers: ['youtube', 'dailymotion'],
    fast: true,
    youtubeOrder: order,
    dryRun: Boolean(options.dryRun),
    sampleSize: 12,
    skipDetails: options.skipDetails ?? true,
  }))
}
