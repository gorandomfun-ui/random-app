export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

function rand<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }

async function loadABCs(): Promise<{ A: string[]; B: string[]; C: string[] }> {
  const p = path.resolve(process.cwd(), 'lib/ingest/keywords/web.json');
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

export async function GET() {
  try {
    const KEY = process.env.ADMIN_INGEST_KEY || '';
    if (!KEY) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 });

    const dict = await loadABCs();
    // fabrique 4 requêtes "A B C"
    const queries: string[] = [];
    for (let i = 0; i < 4; i++) {
      queries.push(`${rand(dict.A)} ${rand(dict.B)} ${rand(dict.C)}`);
    }

    const url = new URL(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ingest/web`);
    url.searchParams.set('q', queries.join(','));
    url.searchParams.set('per', '10');
    url.searchParams.set('pages', '3');

    const res = await fetch(url.toString(), {
      headers: { 'x-admin-ingest-key': KEY },
      cache: 'no-store'
    });

    const json = await res.json();
    return NextResponse.json({ ok: true, queries, upstream: json, triggeredAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'cron failed' }, { status: 500 });
  }
}
