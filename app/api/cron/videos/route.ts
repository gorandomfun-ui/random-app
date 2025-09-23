export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

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

export async function GET() {
  try {
    const KEY = process.env.ADMIN_INGEST_KEY || '';
    if (!KEY) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 });

    const lists = await loadKeywords();
    const bag = ([] as string[]).concat(lists.core, lists.folk, lists.fun);
    const queries = pickMany(bag, 5); // 5 requêtes uniques / run
    const q = encodeURIComponent(queries.join(','));

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
      cache: 'no-store'
    });

    const json = await res.json();
    return NextResponse.json({ ok: true, queries, upstream: json, triggeredAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'cron failed' }, { status: 500 });
  }
}
