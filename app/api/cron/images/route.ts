export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logCronRun } from '@/lib/metrics/cron';

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
  let targetUrl = '';

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

    const url = new URL(req.url);
    url.pathname = '/api/ingest/images';
    url.search = '';
    url.searchParams.set('q', queries.join(','));
    url.searchParams.set('per', '40');
    const incomingDry = new URL(req.url).searchParams.get('dry');
    if (incomingDry) url.searchParams.set('dry', incomingDry);

    targetUrl = url.toString();

    const res = await fetch(targetUrl, {
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

    return NextResponse.json({ ok: true, queries: queries.flatMap((q) => q.split(',')), upstream: json, targetUrl, triggeredAt: finishedAt.toISOString() });
  } catch (error: unknown) {
    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:images',
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy,
      error: error instanceof Error ? error.message : 'cron failed',
      details: { queries, targetUrl },
    });
    const message = error instanceof Error ? error.message : 'cron failed';
    return NextResponse.json({ error: message, targetUrl }, { status: 500 });
  }
}
