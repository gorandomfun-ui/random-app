export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { logCronRun } from '@/lib/metrics/cron';
import { buildVideoQueries, loadVideoKeywordDictionary } from '@/lib/ingest/videoKeywords';

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

type IngestVideosResponse = {
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
        name: 'cron:videos',
        status: 'failure',
        startedAt,
        finishedAt,
        triggeredBy,
        error: 'missing ADMIN_INGEST_KEY',
      });
      return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 });
    }

    const dictionary = await loadVideoKeywordDictionary();
    queries = buildVideoQueries(dictionary, 12);

    const baseUrl = resolveBaseUrl(req);
    const url = new URL('/api/ingest/videos', `${baseUrl}/`);
    url.searchParams.set('mode', 'search'); // ton ingest sait déjà faire 'search'
    url.searchParams.set('q', queries.join(','));
    url.searchParams.set('count', String(Math.max(queries.length, 12)));
    url.searchParams.set('per', '25');
    url.searchParams.set('pages', '2');
    url.searchParams.set('days', String([120, 180, 240, 365][Math.floor(Math.random() * 4)]));
    url.searchParams.set('reddit', '1');
    url.searchParams.set('sub', 'funnyvideos');
    url.searchParams.set('limit', '40');
    url.searchParams.set('archive', '1');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'x-admin-ingest-key': KEY },
      cache: 'no-store',
    });

    let json: IngestVideosResponse | null = null;
    try {
      json = (await res.json()) as IngestVideosResponse;
    } catch {
      json = null;
    }

    if (!res.ok || json?.ok === false) {
      const finishedAt = new Date();
      await logCronRun({
        name: 'cron:videos',
        status: 'failure',
        startedAt,
        finishedAt,
        triggeredBy,
        error: json?.error ? String(json.error) : `HTTP ${res.status}`,
        details: { queries, status: res.status, upstream: json },
      });
      return NextResponse.json({ error: json?.error || 'ingest videos failed', upstream: json }, { status: res.status >= 400 ? res.status : 502 });
    }

    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:videos',
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

    return NextResponse.json({ ok: true, queries, upstream: json, triggeredAt: finishedAt.toISOString() });
  } catch (error: unknown) {
    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:videos',
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
