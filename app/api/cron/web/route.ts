export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logCronRun } from '@/lib/metrics/cron';

function rand<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }

type WebKeywords = { A: string[]; B: string[]; C: string[] }

async function loadABCs(): Promise<WebKeywords> {
  const keywordsPath = path.resolve(process.cwd(), 'lib/ingest/keywords/web.json');
  const raw = await fs.readFile(keywordsPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<WebKeywords> | null;
  return {
    A: Array.isArray(parsed?.A) ? (parsed?.A as string[]) : [],
    B: Array.isArray(parsed?.B) ? (parsed?.B as string[]) : [],
    C: Array.isArray(parsed?.C) ? (parsed?.C as string[]) : [],
  };
}

type IngestWebResponse = {
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
        name: 'cron:web',
        status: 'failure',
        startedAt,
        finishedAt,
        triggeredBy,
        error: 'missing ADMIN_INGEST_KEY',
      });
      return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 });
    }

    const dict = await loadABCs();
    // fabrique 4 requêtes "A B C"
    queries = [];
    for (let i = 0; i < 4; i++) {
      queries.push(`${rand(dict.A)} ${rand(dict.B)} ${rand(dict.C)}`);
    }

    const url = new URL(req.url);
    url.pathname = '/api/ingest/web';
    url.search = '';
    url.searchParams.set('q', queries.join(','));
    const incomingDry = new URL(req.url).searchParams.get('dry');
    if (incomingDry) url.searchParams.set('dry', incomingDry);
    url.searchParams.set('per', '10');
    url.searchParams.set('pages', '3');

    const res = await fetch(url.toString(), {
      headers: { 'x-admin-ingest-key': KEY },
      cache: 'no-store',
    });

    let json: IngestWebResponse | null = null;
    try {
      json = (await res.json()) as IngestWebResponse;
    } catch {
      json = null;
    }

    if (!res.ok || json?.ok === false) {
      const finishedAt = new Date();
      await logCronRun({
        name: 'cron:web',
        status: 'failure',
        startedAt,
        finishedAt,
        triggeredBy,
        error: json?.error ? String(json.error) : `HTTP ${res.status}`,
        details: { queries, status: res.status, upstream: json },
      });
      return NextResponse.json({ error: json?.error || 'ingest web failed', upstream: json }, { status: res.status >= 400 ? res.status : 502 });
    }

    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:web',
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
      name: 'cron:web',
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
