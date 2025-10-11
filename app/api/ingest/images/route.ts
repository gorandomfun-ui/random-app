export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ingestImages, IMAGE_PROVIDERS } from '@/lib/ingest/images';
import type { ImageProvider } from '@/lib/ingest/images';
import { buildComboQueries } from '@/lib/ingest/keywords/combo';
import { buildRegionalQueries, resolveRegionKey, type RegionKey } from '@/lib/ingest/keywords/regionPools';

type PhotoKeywordDictionary = {
  adjectives: string[];
  subjects: string[];
  contexts: string[];
};

type GifKeywordDictionary = {
  actions: string[];
  styles: string[];
  themes: string[];
  feelings: string[];
};

type KeywordDictionary = {
  photo: PhotoKeywordDictionary;
  gif: GifKeywordDictionary;
};

async function loadKeywordDictionary(): Promise<KeywordDictionary> {
  const file = path.resolve(process.cwd(), 'lib/ingest/keywords/images.json');
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as KeywordDictionary;
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isImageProvider(value: string): value is ImageProvider {
  return (IMAGE_PROVIDERS as readonly string[]).includes(value);
}

function normalizeProviders(raw: string[]): ImageProvider[] | undefined {
  if (!raw.length) return undefined;
  const seen = new Set<ImageProvider>();
  const list: ImageProvider[] = [];
  for (const entry of raw) {
    const lower = entry.toLowerCase();
    if (!isImageProvider(lower)) continue;
    const provider = lower;
    if (seen.has(provider)) continue;
    seen.add(provider);
    list.push(provider);
  }
  return list.length ? list : undefined;
}

export async function GET(req: Request) {
  const authKey = req.headers.get('x-admin-ingest-key') || '';
  const expectedKey = process.env.ADMIN_INGEST_KEY || '';
  if (!expectedKey || authKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const queries = parseList(url.searchParams.get('q'));
    const per = Math.max(5, Math.min(80, Number(url.searchParams.get('per') || 40)));
    const providersRaw = parseList(url.searchParams.get('providers'));
    const region = resolveRegionKey(url.searchParams.get('region'));
    const providers = normalizeProviders(providersRaw);
    const dry = url.searchParams.get('dry') || url.searchParams.get('preview');
    const dryRun = dry === '1' || dry === 'true';

    let finalQueries = queries;
    if (!finalQueries.length) {
      if (region === 'global') {
        const combos = await buildComboQueries(9, { region: 'global' });
        finalQueries = combos.map((combo) => combo.query);
        if (!finalQueries.length) {
          const dict = await loadKeywordDictionary();
          const photos = buildPhotoQueries(dict.photo, 6, { region });
          const gifs = buildGifQueries(dict.gif, 3, { region });
          finalQueries = [...photos, ...gifs];
        }
      } else {
        const photos = buildRegionalQueries(region, 'image', 6).map((entry) => entry.query);
        const gifsRegional = buildRegionalQueries(region, 'video', 3).map((entry) => entry.query);
        finalQueries = [...photos, ...gifsRegional];
      }
    }

    const baseProviders = providers ?? [...IMAGE_PROVIDERS];
    const filteredProviders = region === 'global'
      ? baseProviders
      : baseProviders.filter((provider) => provider !== 'pixabay' && provider !== 'pexels');
    const finalProviders = filteredProviders.length ? filteredProviders : ['giphy', 'tenor'] as ImageProvider[];

    const result = await ingestImages({
      queries: finalQueries,
      perQuery: per,
      providers: finalProviders,
      dryRun,
      sampleSize: 6,
    });

    return NextResponse.json({
      ok: true,
      queries: finalQueries,
      providers: finalProviders,
      region,
      dryRun,
      ...result,
    });
  } catch (error: unknown) {
    console.error('[ingest:images]', error);
    const message = error instanceof Error ? error.message : 'ingest failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function pickOne<T>(array: T[], rng: () => number = Math.random): T | undefined {
  if (!array.length) return undefined;
  const index = Math.floor(rng() * array.length);
  return array[index];
}

function uniquePush(target: Set<string>, value: string | undefined) {
  if (!value) return;
  const trimmed = value.trim();
  if (trimmed) target.add(trimmed);
}

function buildPhotoQueries(dict: PhotoKeywordDictionary, count: number, options: { region?: RegionKey; rng?: () => number } = {}): string[] {
  const region = options.region ?? 'global';
  const rng = options.rng ?? Math.random;
  if (region !== 'global') {
    return buildRegionalQueries(region, 'image', count, rng).map((entry) => entry.query);
  }

  const results = new Set<string>();
  const adjectives = dict?.adjectives ?? [];
  const subjects = dict?.subjects ?? [];
  const contexts = dict?.contexts ?? [];

  const maxAttempts = count * 6;
  let attempts = 0;
  while (results.size < count && attempts < maxAttempts) {
    attempts += 1;
    const adj = pickOne(adjectives, rng);
    const subject = pickOne(subjects, rng);
    if (!subject || !adj) continue;
    const parts = [adj, subject];
    if (rng() < 0.6) {
      const context = pickOne(contexts, rng);
      if (context) parts.push(context);
    }
    uniquePush(results, parts.join(' '));
  }

  // fallback if not enough
  if (results.size < count) {
    subjects.slice(0, count).forEach((subject) => uniquePush(results, subject));
  }

  if (results.size < count) {
    const extras = buildRegionalQueries('global', 'image', count - results.size, rng)
    extras.forEach((entry) => uniquePush(results, entry.query))
  }

  return Array.from(results).slice(0, count);
}

function buildGifQueries(dict: GifKeywordDictionary, count: number, options: { region?: RegionKey; rng?: () => number } = {}): string[] {
  const region = options.region ?? 'global';
  const rng = options.rng ?? Math.random;
  if (region !== 'global') {
    return buildRegionalQueries(region, 'video', count, rng).map((entry) => entry.query);
  }

  const results = new Set<string>();
  const actions = dict?.actions ?? [];
  const styles = dict?.styles ?? [];
  const themes = dict?.themes ?? [];
  const feelings = dict?.feelings ?? [];

  const maxAttempts = count * 8;
  let attempts = 0;
  while (results.size < count && attempts < maxAttempts) {
    attempts += 1;
    const action = pickOne(actions, rng);
    const theme = pickOne(themes, rng);
    if (!action || !theme) continue;
    const parts = [action, theme];
    if (rng() < 0.7) {
      const style = pickOne(styles, rng);
      if (style) parts.push(style);
    }
    if (rng() < 0.4) {
      const feeling = pickOne(feelings, rng);
      if (feeling) parts.push(feeling);
    }
    uniquePush(results, parts.join(' '));
  }

  if (results.size < count) {
    themes.slice(0, count).forEach((theme) => uniquePush(results, theme));
  }

  if (results.size < count) {
    const extras = buildRegionalQueries('global', 'video', count - results.size, rng)
    extras.forEach((entry) => uniquePush(results, entry.query))
  }

  return Array.from(results).slice(0, count);
}
