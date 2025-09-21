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

async function loadWords(): Promise<{ photo: string[]; gif: string[] }> {
  const p = path.resolve(process.cwd(), 'lib/ingest/keywords/images.json');
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

export async function GET() {
  try {
    const KEY = process.env.ADMIN_INGEST_KEY || '';
    if (!KEY) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 });

    const dict = await loadWords();
    const qPhoto = pickMany(dict.photo, 3).join(',');
    const qGif = pickMany(dict.gif, 2).join(',');
    const queries = [qPhoto, qGif].join(',');

    const url = new URL(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ingest/images`);
    url.searchParams.set('q', queries);
    url.searchParams.set('per', '40');

    const res = await fetch(url.toString(), {
      headers: { 'x-admin-ingest-key': KEY },
      cache: 'no-store'
    });

    const json = await res.json();
    return NextResponse.json({ ok: true, queries: queries.split(','), upstream: json });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'cron failed' }, { status: 500 });
  }
}
