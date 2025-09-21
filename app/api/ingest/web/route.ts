export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'

/* ---------- DB helpers (identiques au style des autres ingests) ---------- */
let _db: Db | null = null
async function getDbSafe(): Promise<Db | null> {
  try {
    const { MongoClient } = await import('mongodb')
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI
    const dbName = process.env.MONGODB_DB || 'randomapp'
    if (!uri) return null
    if (!_db) {
      const client = new MongoClient(uri)
      await client.connect()
      _db = client.db(dbName)
    }
    return _db
  } catch { return null }
}

type WebDoc = {
  type: 'web',
  url: string,
  title?: string,
  host?: string,
  ogImage?: string | null,
  provider?: string, // 'google-cse'
  createdAt?: Date,
  updatedAt?: Date,
}

async function upsertManyWeb(rows: Omit<WebDoc,'createdAt'|'updatedAt'>[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  const ops = rows.map(r => ({
    updateOne: {
      filter: { type: 'web', url: r.url },
      update: {
        $set: { ...r, type: 'web', updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    }
  }))
  const res = await db.collection('items').bulkWrite(ops, { ordered: false })
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 }
}

/* ------------------------------- OG fetcher ------------------------------ */
async function fetchOgImage(link: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1500)
    const res = await fetch(link, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (RandomApp Bot)' },
    })
    clearTimeout(t)
    if (!res.ok) return null
    const html = await res.text()
    const m1 = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    const m2 = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    const img = m1 || m2 || /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]
    if (!img) return null
    try { return new URL(img, link).toString() } catch { return img }
  } catch { return null }
}

/* --------------------------------- CSE ---------------------------------- */
async function runGoogleCSE(queries: string[], per: number, pages: number) {
  const KEY = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_API_KEY
  const CX  = process.env.GOOGLE_CSE_CX  || process.env.GOOGLE_CSE_ID
  if (!KEY || !CX) return []

  const out: Omit<WebDoc,'createdAt'|'updatedAt'>[] = []
  for (const raw of queries) {
    const q = raw.trim()
    if (!q) continue
    for (let p = 0; p < pages; p++) {
      const start = 1 + p * per // CSE start index (1-based)
      const url = `https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CX}&q=${encodeURIComponent(q)}&num=${per}&start=${start}&safe=off`
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) continue
        const data: any = await res.json()
        const items: any[] = data?.items || []
        for (const it of items) {
          const link: string | undefined = it?.link
          if (!link) continue
          let host = ''
          try { host = new URL(link).host.replace(/^www\./,'') } catch {}
          out.push({
            type: 'web',
            url: link,
            title: it?.title || host || link,
            host,
            ogImage: null,
            provider: 'google-cse',
          })
        }
      } catch { /* ignore */ }
    }
  }

  // enrich OG (light + safe)
  const enriched: Omit<WebDoc,'createdAt'|'updatedAt'>[] = []
  for (const row of out) {
    try {
      const og = await fetchOgImage(row.url)
      enriched.push({ ...row, ogImage: og || null })
    } catch { enriched.push(row) }
  }
  return enriched
}

/* -------------------------------- Handler -------------------------------- */
export async function GET(req: NextRequest) {
  // Auth (clé en query ou header — même logique que tes autres ingests)
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || ''
  if (!process.env.ADMIN_INGEST_KEY || key !== process.env.ADMIN_INGEST_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const per   = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get('per') || 10)))
  const pages = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get('pages') || 3)))
  const queries = (req.nextUrl.searchParams.get('q') || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  try {
    const rows = await runGoogleCSE(queries, per, pages)
    const dedup = Array.from(new Map(rows.map(r => [r.url, r])).values())
    const { inserted, updated } = await upsertManyWeb(dedup)
    return NextResponse.json({ ok: true, queries, per, pages, scanned: rows.length, unique: dedup.length, inserted, updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ingest web failed' }, { status: 500 })
  }
}
