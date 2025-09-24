export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logCronRun } from '@/lib/metrics/cron';

function rand<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }

async function loadABCs(): Promise<{ A: string[]; B: string[]; C: string[] }> {
  const p = path.resolve(process.cwd(), 'lib/ingest/keywords/web.json');
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

    const url = new URL(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ingest/web`);
    url.searchParams.set('q', queries.join(','));
    url.searchParams.set('per', '10');
    url.searchParams.set('pages', '3');

    const res = await fetch(url.toString(), {
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
  } catch (e: any) {
    const finishedAt = new Date();
    await logCronRun({
      name: 'cron:web',
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
