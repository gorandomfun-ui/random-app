export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { Db } from 'mongodb';

let _db: Db | null = null;
async function getDbSafe(): Promise<Db | null> {
  try {
    const { MongoClient } = await import('mongodb');
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGODB_DB || 'randomapp';
    if (!uri) return null;
    if (!_db) {
      const client = new MongoClient(uri);
      await client.connect();
      _db = client.db(dbName);
    }
    return _db;
  } catch { return null }
}

type ImgDoc = {
  type: 'image';
  url: string;
  thumb?: string | null;
  provider?: string;
  source?: { name: string; url?: string };
  createdAt?: Date;
  updatedAt?: Date;
};

async function upsertMany(items: ImgDoc[]) {
  const db = await getDbSafe();
  if (!db || !items.length) return { inserted: 0, updated: 0 };
  const ops = items.map((r) => ({
    updateOne: {
      filter: { type: 'image', url: r.url },
      update: { $set: { ...r, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      upsert: true
    }
  }));
  const res = await db.collection('items').bulkWrite(ops, { ordered: false });
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 };
}

async function fetchPixabayMany(qs: string[], per = 40): Promise<ImgDoc[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const out: ImgDoc[] = [];
  for (const q of qs) {
    const u = new URL('https://pixabay.com/api/');
    u.searchParams.set('key', key);
    u.searchParams.set('q', q);
    u.searchParams.set('image_type', 'photo');
    u.searchParams.set('safesearch', 'true');
    u.searchParams.set('per_page', String(per));
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) continue;
    const d: any = await r.json();
    for (const h of d?.hits || []) {
      const url: string | undefined = h.largeImageURL || h.webformatURL;
      if (!url) continue;
      out.push({
        type: 'image',
        url,
        thumb: h.previewURL || h.webformatURL || null,
        provider: 'pixabay',
        source: { name: 'Pixabay', url: h.pageURL || url }
      });
    }
  }
  return out;
}

async function fetchPexelsMany(qs: string[], per = 40): Promise<ImgDoc[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const out: ImgDoc[] = [];
  for (const q of qs) {
    const u = new URL('https://api.pexels.com/v1/search');
    u.searchParams.set('per_page', String(per));
    u.searchParams.set('query', q);
    const r = await fetch(u.toString(), {
      headers: { Authorization: key },
      cache: 'no-store'
    });
    if (!r.ok) continue;
    const d: any = await r.json();
    for (const p of d?.photos || []) {
      const src = p?.src || {};
      const url: string | undefined = src.large2x || src.large || src.original;
      if (!url) continue;
      out.push({
        type: 'image',
        url,
        thumb: src.medium || null,
        provider: 'pexels',
        source: { name: 'Pexels', url: p?.url || url }
      });
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    // auth
    const key = req.headers.get('x-admin-ingest-key') || '';
    if (!process.env.ADMIN_INGEST_KEY || key !== process.env.ADMIN_INGEST_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const qraw = (searchParams.get('q') || '').split(',').map(s => s.trim()).filter(Boolean);
    const per = Math.max(5, Math.min(80, Number(searchParams.get('per') || 40)));

    const results: ImgDoc[] = [];
    // ordre: Pixabay -> Pexels (les deux peuvent empiler)
    results.push(...await fetchPixabayMany(qraw, per));
    results.push(...await fetchPexelsMany(qraw, per));

    // dédoublonnage par URL
    const uniqMap = new Map<string, ImgDoc>();
    for (const it of results) if (!uniqMap.has(it.url)) uniqMap.set(it.url, it);
    const uniq = Array.from(uniqMap.values());

    const dbRes = await upsertMany(uniq);
    return NextResponse.json({
      ok: true,
      queries: qraw,
      scanned: results.length,
      unique: uniq.length,
      ...dbRes
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ingest failed' }, { status: 500 });
  }
}
