import { getDb } from '@/lib/db';
import type { Collection, Db, Filter } from 'mongodb';
import { buildTagList, expandQueryToTags, mergeKeywordSources } from './extract';

export type VideoProvider = 'youtube' | 'reddit-youtube' | 'archive.org' | 'manual';

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
};

type IngestVideosOptions = {
  mode: 'search' | 'playlist' | 'channel';
  queries?: string[];
  per?: number;
  pages?: number;
  days?: number;
  playlistId?: string;
  channelId?: string;
  includeArchive?: boolean;
  reddit?: { sub: string; limit: number } | null;
  manualIds?: string[];
  dryRun?: boolean;
  sampleSize?: number;
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
};

const YT_ENDPOINT = 'https://www.googleapis.com/youtube/v3';
const ARCHIVE_BASE = 'https://archive.org';
const ARCHIVE_FIELDS = ['identifier', 'title', 'creator', 'mediatype', 'description'];
const ARCHIVE_VIDEO_FORMATS = ['mp4', 'mpeg4', 'h.264', 'h264', 'mpg4'];
const USER_AGENT = { 'User-Agent': 'RandomAppBot/1.0 (+https://random.app)' };

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

type ArchiveDoc = { identifier?: string; title?: string };

type ArchiveSearchResponse = {
  response?: { docs?: ArchiveDoc[] };
};

type ArchiveFile = { name?: string; format?: string };

type ArchiveMetadata = {
  files?: ArchiveFile[];
  metadata?: { title?: string; description?: string };
};

type RedditPost = {
  url?: string;
  title?: string;
  permalink?: string;
};

type RedditListing = {
  data?: {
    children?: Array<{ data?: RedditPost }>;
  };
};

type FetchWarning = {
  label: string;
  status?: number;
  statusText?: string;
  body?: string;
  message?: string;
};

function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

async function fetchJson<T = unknown>(
  url: string,
  timeoutMs = 10000,
  label?: string,
  warnings?: FetchWarning[],
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', headers: USER_AGENT, signal: controller.signal });
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
  warnings?: FetchWarning[],
): Promise<RawVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.warn('[ingest:youtube] missing YOUTUBE_API_KEY');
    return [];
  }
  const publishedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const collected: RawVideo[] = [];

  for (const query of queries) {
    const trimmed = query.trim();
    if (!trimmed) continue;
    let pageToken = '';
    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        key,
        part: 'snippet',
        type: 'video',
        maxResults: String(Math.min(50, Math.max(1, per))),
        q: trimmed,
        order: Math.random() < 0.5 ? 'date' : 'relevance',
        publishedAfter,
        videoEmbeddable: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await fetchJson<YoutubeSearchResponse>(
        `${YT_ENDPOINT}/search?${params.toString()}`,
        10000,
        'youtube:search',
        warnings,
      );
      const items = data?.items ?? [];
      for (const item of items) {
        const id = item?.id?.videoId;
        if (!id) continue;
        const snippet = item?.snippet;
        collected.push({
          videoId: id,
          url: `https://youtu.be/${id}`,
          provider: 'youtube',
          title: snippet?.title || '',
          thumb: youtubeThumb(id),
          source: { name: 'YouTube', url: `https://youtu.be/${id}` },
          contextQueries: [trimmed],
        });
      }
      pageToken = data?.nextPageToken || '';
      if (!pageToken) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
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

async function enrichYouTubeDetails(videos: RawVideo[], warnings?: FetchWarning[]): Promise<void> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return;
  const youtubeVideos = videos.filter((video) => video.provider === 'youtube');
  const ids = youtubeVideos.map((video) => video.videoId).filter(Boolean);
  if (!ids.length) return;

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const params = new URLSearchParams({ key, part: 'snippet,contentDetails', id: chunk.join(',') });
    const data = await fetchJson<YoutubeVideoDetailsResponse>(
      `${YT_ENDPOINT}/videos?${params.toString()}`,
      10000,
      'youtube:videos',
      warnings,
    );
    const items = data?.items ?? [];
    const map = new Map<string, YoutubeVideoDetailsItem>();
    for (const item of items) {
      if (!item?.id) continue;
      map.set(item.id, item);
    }

    for (const video of youtubeVideos) {
      const details = map.get(video.videoId);
      if (!details) continue;
      const snippet = details.snippet;
      if (snippet?.title) video.title = snippet.title;
      if (snippet?.description) video.description = snippet.description;
      if (snippet?.channelId) video.channelId = snippet.channelId;
      if (snippet?.channelTitle) video.channelTitle = snippet.channelTitle;
      if (Array.isArray(snippet?.tags)) video.apiTags = (video.apiTags || []).concat(snippet.tags);
      const thumbnails = snippet?.thumbnails;
      const high = thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url;
      if (high) video.thumb = high;
      if (details.contentDetails?.duration) video.duration = details.contentDetails.duration;
    }
  }
}

async function redditYouTube(sub: string, limit: number, warnings?: FetchWarning[]): Promise<RawVideo[]> {
  const json = await fetchJson<RedditListing>(
    `https://www.reddit.com/r/${encodeURIComponent(sub)}/.json?limit=${Math.min(100, Math.max(5, limit))}`,
    8000,
    `reddit:${sub}`,
    warnings,
  );
  const posts = json?.data?.children?.map((child) => child?.data).filter((entry): entry is RedditPost => Boolean(entry)) || [];
  const out: RawVideo[] = [];
  for (const post of posts) {
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
    out.push({
      videoId,
      url: `https://youtu.be/${videoId}`,
      provider: 'reddit-youtube',
      title: post?.title || '',
      thumb: youtubeThumb(videoId),
      source: { name: 'Reddit', url: `https://www.reddit.com${post?.permalink || ''}` },
      contextQueries: [`reddit:${sub}`],
    });
  }
  return out;
}

async function archiveAdvancedSearch(
  query: string,
  rows: number,
  page: number,
  warnings?: FetchWarning[],
): Promise<ArchiveDoc[]> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('output', 'json');
  params.set('rows', String(rows));
  params.set('page', String(Math.max(1, page)));
  for (const field of ARCHIVE_FIELDS) params.append('fl[]', field);
  params.append('sort[]', 'downloads desc');
  const url = `${ARCHIVE_BASE}/advancedsearch.php?${params.toString()}`;
  const data = await fetchJson<ArchiveSearchResponse>(url, 12000, 'archive:search', warnings);
  return Array.isArray(data?.response?.docs) ? data.response.docs : [];
}

async function archiveMetadata(identifier: string, warnings?: FetchWarning[]): Promise<ArchiveMetadata | null> {
  const url = `${ARCHIVE_BASE}/metadata/${encodeURIComponent(identifier)}`;
  return fetchJson<ArchiveMetadata>(url, 12000, 'archive:metadata', warnings);
}

function pickArchiveFile(files: ArchiveFile[] | undefined): { name: string; format?: string } | null {
  if (!Array.isArray(files)) return null;
  for (const file of files) {
    const format = String(file?.format || '').toLowerCase();
    const name = String(file?.name || '');
    if (!name) continue;
    const matchesFormat = ARCHIVE_VIDEO_FORMATS.some((token) => format.includes(token) || name.toLowerCase().endsWith(`.${token.replace(/[^a-z0-9]/g, '')}`));
    if (matchesFormat) return { name, format: file?.format };
  }
  return null;
}

function pickArchiveThumbnail(identifier: string, files: ArchiveFile[] | undefined): string | undefined {
  if (!Array.isArray(files)) return undefined;
  const thumb = files.find((file) => {
    const fmt = String(file?.format || '').toLowerCase();
    return fmt.includes('thumbnail') || fmt.includes('jpeg') || fmt.includes('jpg') || fmt.includes('png');
  });
  if (!thumb?.name) return undefined;
  return `${ARCHIVE_BASE}/download/${identifier}/${thumb.name}`;
}

async function pullArchiveVideos(queries: string[], limit: number, warnings?: FetchWarning[]): Promise<RawVideo[]> {
  const results: RawVideo[] = [];
  const perQuery = Math.max(1, Math.ceil(limit / Math.max(1, queries.length)));

  for (const query of queries) {
    const compiled = `(${query}) AND mediatype:(movies) AND format:(MP4)`;
    const docs = await archiveAdvancedSearch(
      compiled,
      Math.min(30, perQuery * 6),
      Math.floor(Math.random() * 3) + 1,
      warnings,
    );
    for (const doc of docs) {
      if (results.length >= limit) break;
      const identifier = String(doc?.identifier || '');
      if (!identifier) continue;
      const metadata = await archiveMetadata(identifier, warnings);
      const file = pickArchiveFile(metadata?.files);
      if (!file?.name) continue;
      const downloadUrl = `${ARCHIVE_BASE}/download/${identifier}/${encodeURIComponent(file.name)}`;
      const videoId = `archive:${identifier}:${file.name}`;
      results.push({
        videoId,
        url: downloadUrl,
        provider: 'archive.org',
        title: doc?.title || metadata?.metadata?.title || identifier,
        thumb: pickArchiveThumbnail(identifier, metadata?.files) || undefined,
        source: { name: 'Internet Archive', url: `${ARCHIVE_BASE}/details/${identifier}` },
        contextQueries: [query],
        description: metadata?.metadata?.description || '',
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (results.length >= limit) break;
  }

  return results;
}

function buildVideoDocument(raw: RawVideo): VideoDocument {
  const contextTags = expandQueryToTags(raw.contextQueries || []);
  const candidates = [
    raw.provider,
    contextTags,
    raw.apiTags,
    raw.channelTitle,
  ];
  const tags = buildTagList(candidates, 14);
  const keywords = mergeKeywordSources([
    raw.title,
    raw.description,
    raw.channelTitle,
    (raw.contextQueries || []).join(' '),
  ], 16);

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
  };
}

async function getCollection(): Promise<Collection<VideoDocument>> {
  const db: Db = await getDb();
  return db.collection<VideoDocument>('items');
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
    includeArchive = true,
    reddit,
    manualIds = [],
    dryRun = false,
    sampleSize = 6,
  } = options;

  const collected: RawVideo[] = [];
  const fetchWarnings: FetchWarning[] = [];

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
    const effectiveQueries = queries.length ? queries : ['weird archive footage', 'retro craft tutorial'];
    collected.push(...await searchYouTube(effectiveQueries, per, pages, days, fetchWarnings));
    if (includeArchive) {
      collected.push(...await pullArchiveVideos(effectiveQueries, Math.max(6, Math.ceil(per / 2)), fetchWarnings));
    }
  } else if (mode === 'playlist' && playlistId) {
    collected.push(...await playlistYouTube(playlistId, per, fetchWarnings));
  } else if (mode === 'channel' && channelId) {
    collected.push(...await channelUploadsYouTube(channelId, per, fetchWarnings));
  }

  if (reddit) {
    collected.push(...await redditYouTube(reddit.sub, reddit.limit, fetchWarnings));
  }

  await enrichYouTubeDetails(collected, fetchWarnings);

  const map = new Map<string, RawVideo>();
  for (const video of collected) {
    if (!video.videoId || map.has(video.videoId)) continue;
    map.set(video.videoId, video);
  }

  const unique = Array.from(map.values());
  const documents = unique.map((raw) => buildVideoDocument(raw));

  const providerCounts: Record<string, number> = {};
  for (const doc of documents) {
    providerCounts[doc.provider] = (providerCounts[doc.provider] || 0) + 1;
  }

  const sampleDocuments = documents.slice(0, Math.max(0, sampleSize));
  const sampleVideoIds = sampleDocuments.map((doc) => doc.videoId);

  const summary: IngestResult = {
    scanned: collected.length,
    unique: documents.length,
    inserted: 0,
    updated: 0,
    dryRun,
    providerCounts,
    sample: sampleDocuments,
    warnings: fetchWarnings,
  };

  console.log('[ingest:videos] processed', {
    mode,
    dryRun,
    scanned: summary.scanned,
    unique: summary.unique,
    providerCounts,
    sampleVideoIds,
    warnings: fetchWarnings,
  });

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
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    };
  });

  const bulk = await collection.bulkWrite(operations, { ordered: false });
  summary.inserted = bulk.upsertedCount || 0;
  summary.updated = bulk.modifiedCount || 0;
  return summary;
}
