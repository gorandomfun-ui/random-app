export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logCronRun } from '@/lib/metrics/cron';

function resolveBaseUrl(req: Request): string {
  const candidates = [
    process.env.CRON_SELF_BASE_URL,
    process.env.INGEST_BASE_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\/$/, '');
    }
  }
  try {
    const current = new URL(req.url);
    return `${current.protocol}//${current.host}`;
  } catch {
    return 'http://localhost:3000';
  }
}

function pickMany<T>(arr: T[], n: number): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  }
  return out;
}

type ImageKeywords = { photo: string[]; gif: string[] }

async function loadWords(): Promise<ImageKeywords> {
  const keywordsPath = path.resolve(process.cwd(), 'lib/ingest/keywords/images.json');
  const raw = await fs.readFile(keywordsPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<ImageKeywords> | null;
  const photo = Array.isArray(parsed?.photo) ? (parsed?.photo as string[]) : [];
  const gif = Array.isArray(parsed?.gif) ? (parsed?.gif as string[]) : [];
  return { photo, gif };
}

type IngestImagesResponse = {
  ok?: boolean;
  error?: string;
  scanned?: number;
  unique?: number;
  inserted?: number;
  updated?: number;
}

export async function GET(req: Request) {
  const startedAt = new Date();
  const triggeredBy = req.headers.get('x-vercel-cron') ? 'cron' : 'manual';
  let queries: string[] = [];

  try {
    const KEY = process.env.ADMIN_INGEST_KEY || '';
    if (!KEY) {
      const finishedAt = new Date();
      await logCronRun({
        name: 'cron:images',
        status: 'failure',
        startedAt,
        finishedAt,
        triggeredBy,
        error: 'missing ADMIN_INGEST_KEY',
      });
      return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 });
    }

    const dict = await loadWords();
    const qPhoto = pickMany(dict.photo, 3).join(',');
    const qGif = pickMany(dict.gif, 2).join(',');
    queries = [qPhoto, qGif];

    const baseUrl = resolveBaseUrl(req);
    const url = new URL('/api/ingest/images', `${baseUrl}/`);
    url.searchParams.set('q', queries.join(','));
    url.searchParams.set('per', '40');

    const res = await fetch(url.toString(), {
      headers: { 'x-admin-ingest-key': KEY },
      cache: 'no-store',
    });

    let json: IngestImagesResponse | null = null;
    try {
      json = (await res.json()) as IngestImagesResponse;
    } catch {
      json = null;
    }

    if (!res.ok || json?.ok === false) {
      const finishedAt = new Date();
      await logCronRun({
        name: 'cron:images',
        status: 'failure',
        startedAt,
        finishedAt,
        triggeredBy,
        error: json?.error ? String(json.error) : `HTTP ${res.status}`,
        details: { queries, status: res.status, upstream: json },
      });
      return NextResponse.json({ error: json?.error || 'ingest images failed', upstream: json }, { status: res.status >= 400 ? res.status : 502 });
    }

    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:images',
      status: 'success',
      startedAt,
      finishedAt,
      triggeredBy,
      details: {
        queries,
        stats: {
          scanned: json?.scanned ?? 0,
          unique: json?.unique ?? 0,
          inserted: json?.inserted ?? 0,
          updated: json?.updated ?? 0,
        },
      },
    });

    return NextResponse.json({ ok: true, queries: queries.flatMap((q) => q.split(',')), upstream: json, triggeredAt: finishedAt.toISOString() });
  } catch (error: unknown) {
    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:images',
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy,
      error: error instanceof Error ? error.message : 'cron failed',
      details: { queries },
    });
    const message = error instanceof Error ? error.message : 'cron failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
