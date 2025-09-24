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

async function loadKeywords(): Promise<{ core: string[]; folk: string[]; fun: string[] }> {
  const p = path.resolve(process.cwd(), 'lib/ingest/keywords/video.json');
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
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

    const lists = await loadKeywords();
    const bag = ([] as string[]).concat(lists.core, lists.folk, lists.fun);
    queries = pickMany(bag, 5); // 5 requêtes uniques / run

    const url = new URL(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ingest/videos`);
    url.searchParams.set('mode', 'search'); // ton ingest sait déjà faire 'search'
    url.searchParams.set('q', queries.join(','));
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

    let json: any = null;
    try {
      json = await res.json();
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
  } catch (e: any) {
    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:videos',
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy,
      error: e?.message || 'cron failed',
      details: { queries },
    });
    return NextResponse.json({ error: e?.message || 'cron failed' }, { status: 500 });
  }
}
