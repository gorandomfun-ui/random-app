import { getDb } from '@/lib/db';
import type { Collection, Db, Filter } from 'mongodb';
import { buildTagList, expandQueryToTags, mergeKeywordSources } from './extract';

export const IMAGE_PROVIDERS = ['giphy', 'pixabay', 'tenor', 'pexels'] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

type SourceRef = { name: string; url?: string };

type PixabayHit = {
  largeImageURL?: string;
  webformatURL?: string;
  previewURL?: string;
  pageURL?: string;
  tags?: string;
};

type PixabayResponse = {
  hits?: PixabayHit[];
};

type GiphyImages = {
  original?: { url?: string };
  downsized_large?: { url?: string };
  downsized?: { url?: string };
  preview_gif?: { url?: string };
  fixed_width_small?: { url?: string };
};

type GiphyUser = { username?: string } | null | undefined;

type GiphyItem = {
  images?: GiphyImages;
  title?: string;
  slug?: string;
  user?: GiphyUser;
  url?: string;
  content_description?: string;
};

type GiphyResponse = {
  data?: GiphyItem[];
};

type TenorMedia = {
  gif?: { url?: string; preview?: string };
  mediumgif?: { url?: string; preview?: string };
};

type TenorResult = {
  media_formats?: TenorMedia;
  content_description?: string;
  tags?: string[];
  user?: { username?: string } | null;
  itemurl?: string;
};

type TenorResponse = {
  results?: TenorResult[];
};

type PexelsPhoto = {
  src?: {
    large2x?: string;
    large?: string;
    original?: string;
    medium?: string;
    small?: string;
  };
  photographer?: string;
  alt?: string;
  url?: string;
};

type PexelsResponse = {
  photos?: PexelsPhoto[];
};

type ImageSource = {
  url: string;
  thumb?: string | null;
  provider: ImageProvider;
  source?: SourceRef;
  title?: string;
  alt?: string;
  apiTags?: string[];
  contextQueries?: string[];
  description?: string;
};

export type ImageDocument = {
  type: 'image';
  url: string;
  thumb?: string | null;
  provider: ImageProvider;
  source?: SourceRef;
  tags: string[];
  keywords: string[];
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
  description?: string | null;
};

type IngestImagesOptions = {
  queries: string[];
  perQuery?: number;
  providers?: ImageProvider[];
};

type IngestResult = {
  scanned: number;
  unique: number;
  inserted: number;
  updated: number;
};

type Fetcher = (query: string, per: number) => Promise<ImageSource[]>;

const DEFAULT_PROVIDERS: ImageProvider[] = [...IMAGE_PROVIDERS];

const STOP_TAGS = new Set(['pixabay', 'pexels', 'giphy', 'tenor', 'image', 'photo', 'gif']);

function parsePixabayTags(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseSlugWords(slug?: string): string[] {
  if (!slug) return [];
  return slug
    .split('-')
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && !STOP_TAGS.has(part));
}

async function fetchPixabay(query: string, per: number): Promise<ImageSource[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const search = new URL('https://pixabay.com/api/');
  search.searchParams.set('key', key);
  search.searchParams.set('q', query);
  search.searchParams.set('image_type', 'photo');
  search.searchParams.set('safesearch', 'true');
  search.searchParams.set('per_page', String(per));
  const res = await fetch(search, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = (await res.json()) as PixabayResponse;
  const hits = json.hits ?? [];
  return hits.flatMap((hit): ImageSource[] => {
    const url: string | undefined = hit?.largeImageURL || hit?.webformatURL;
    if (!url) return [];
    return [{
      url,
      thumb: hit?.previewURL || hit?.webformatURL || null,
      provider: 'pixabay',
      source: { name: 'Pixabay', url: hit?.pageURL || url },
      title: hit?.tags || '',
      alt: hit?.tags || '',
      apiTags: parsePixabayTags(hit?.tags),
      contextQueries: [query],
    }];
  });
}

async function fetchGiphy(query: string, per: number): Promise<ImageSource[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return [];
  const search = new URL('https://api.giphy.com/v1/gifs/search');
  search.searchParams.set('api_key', key);
  search.searchParams.set('q', query);
  search.searchParams.set('limit', String(per));
  search.searchParams.set('rating', 'pg-13');
  const res = await fetch(search, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = (await res.json()) as GiphyResponse;
  const data = json.data ?? [];
  return data.flatMap((item): ImageSource[] => {
    const images = item?.images;
    const url: string | undefined = images?.original?.url || images?.downsized_large?.url || images?.downsized?.url;
    if (!url) return [];
    const title = typeof item?.title === 'string' ? item.title : '';
    const slugTags = parseSlugWords(item?.slug);
    const user = item?.user?.username ? [item.user.username] : [];
    return [{
      url,
      thumb: images?.preview_gif?.url || images?.fixed_width_small?.url || null,
      provider: 'giphy',
      source: { name: 'Giphy', url: item?.url || url },
      title,
      alt: title,
      apiTags: [...slugTags, ...user],
      contextQueries: [query],
      description: typeof item?.content_description === 'string' ? item.content_description : undefined,
    }];
  });
}

async function fetchTenor(query: string, per: number): Promise<ImageSource[]> {
  const key = process.env.TENOR_API_KEY;
  if (!key) return [];
  const search = new URL('https://tenor.googleapis.com/v2/search');
  search.searchParams.set('key', key);
  search.searchParams.set('q', query);
  search.searchParams.set('limit', String(per));
  search.searchParams.set('media_filter', 'gif');
  search.searchParams.set('random', 'true');
  const res = await fetch(search, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = (await res.json()) as TenorResponse;
  const results = json.results ?? [];
  return results.flatMap((item): ImageSource[] => {
    const media = item?.media_formats?.gif || item?.media_formats?.mediumgif || {};
    const url: string | undefined = media?.url;
    if (!url) return [];
    const title = typeof item?.content_description === 'string' ? item.content_description : '';
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    const author = item?.user?.username ? [item.user.username] : [];
    return [{
      url,
      thumb: media?.preview || media?.url || null,
      provider: 'tenor',
      source: { name: 'Tenor', url: item?.itemurl || url },
      title,
      alt: title,
      apiTags: [...tags, ...author],
      contextQueries: [query],
      description: title,
    }];
  });
}

async function fetchPexels(query: string, per: number): Promise<ImageSource[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const search = new URL('https://api.pexels.com/v1/search');
  search.searchParams.set('query', query);
  search.searchParams.set('per_page', String(per));
  const res = await fetch(search, {
    headers: { Authorization: key },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as PexelsResponse;
  const photos = json.photos ?? [];
  return photos.flatMap((photo): ImageSource[] => {
    const src = photo?.src || {};
    const url: string | undefined = src.large2x || src.large || src.original;
    if (!url) return [];
    const photographer = typeof photo?.photographer === 'string' ? photo.photographer : '';
    const alt = typeof photo?.alt === 'string' ? photo.alt : '';
    return [{
      url,
      thumb: src.medium || src.small || null,
      provider: 'pexels',
      source: { name: photographer || 'Pexels', url: photo?.url || url },
      title: alt,
      alt,
      apiTags: [photographer].filter(Boolean),
      contextQueries: [query],
    }];
  });
}

function buildImageDocument(source: ImageSource): ImageDocument {
  const contextTags = expandQueryToTags(source.contextQueries || []);
  const candidates = [
    source.provider,
    contextTags,
    source.apiTags,
    source.title,
    source.alt,
    source.description,
  ];
  const tags = buildTagList(candidates, 12).filter((tag) => !STOP_TAGS.has(tag));
  const keywords = mergeKeywordSources([
    source.title,
    source.alt,
    (source.contextQueries || []).join(' '),
    source.description,
  ], 14);

  return {
    type: 'image',
    url: source.url,
    thumb: source.thumb ?? undefined,
    provider: source.provider,
    source: source.source,
    tags,
    keywords,
    title: source.title,
  };
}

async function getCollection(): Promise<Collection<ImageDocument>> {
  const db: Db = await getDb();
  return db.collection<ImageDocument>('items');
}

export async function ingestImages({ queries, perQuery = 40, providers }: IngestImagesOptions): Promise<IngestResult> {
  if (!queries.length) {
    return { scanned: 0, unique: 0, inserted: 0, updated: 0 };
  }

  const fetchers: Record<ImageProvider, Fetcher> = {
    giphy: fetchGiphy,
    pixabay: fetchPixabay,
    tenor: fetchTenor,
    pexels: fetchPexels,
  };

  const collected: ImageSource[] = [];
  const providerList = providers && providers.length ? providers : DEFAULT_PROVIDERS;
  for (const query of queries) {
    const trimmed = query.trim();
    if (!trimmed) continue;
    for (const provider of providerList) {
      const fetcher = fetchers[provider];
      if (!fetcher) continue;
      try {
        const results = await fetcher(trimmed, perQuery);
        collected.push(...results);
      } catch (error) {
        console.error(`[ingest:images] ${provider} failed`, error);
      }
    }
  }

  const map = new Map<string, ImageDocument>();
  for (const entry of collected) {
    const doc = buildImageDocument(entry);
    if (!map.has(doc.url)) map.set(doc.url, doc);
  }

  const uniqueDocs = Array.from(map.values());
  if (!uniqueDocs.length) {
    return { scanned: collected.length, unique: 0, inserted: 0, updated: 0 };
  }

  const coll = await getCollection();
  const operations = uniqueDocs.map((doc) => {
    const filter: Filter<ImageDocument> = { type: 'image', url: doc.url };
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

  const result = await coll.bulkWrite(operations, { ordered: false });
  return {
    scanned: collected.length,
    unique: uniqueDocs.length,
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
}
