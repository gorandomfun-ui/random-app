export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ingestImages, IMAGE_PROVIDERS } from '@/lib/ingest/images';
import type { ImageProvider } from '@/lib/ingest/images';

function pickMany<T>(array: T[], size: number): T[] {
  const pool = array.slice();
  const result: T[] = [];
  while (result.length < size && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]!);
  }
  return result;
}

async function loadKeywordDictionary() {
  const file = path.resolve(process.cwd(), 'lib/ingest/keywords/images.json');
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as { photo: string[]; gif: string[] };
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
    const providers = normalizeProviders(providersRaw);

    let finalQueries = queries;
    if (!finalQueries.length) {
      const dict = await loadKeywordDictionary();
      const photos = pickMany(dict.photo || [], 4);
      const gifs = pickMany(dict.gif || [], 2);
      finalQueries = [...photos, ...gifs];
    }

    const result = await ingestImages({ queries: finalQueries, perQuery: per, providers });

    return NextResponse.json({
      ok: true,
      queries: finalQueries,
      providers: providers ?? [...IMAGE_PROVIDERS],
      ...result,
    });
  } catch (error: unknown) {
    console.error('[ingest:images]', error);
    const message = error instanceof Error ? error.message : 'ingest failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
