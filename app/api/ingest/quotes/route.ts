// app/api/ingest/quotes/route.ts
export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { createHash } from 'crypto'
import * as cheerio from 'cheerio'

/* ============== DB ============== */
let _db: Db | null = null
async function getDbSafe(): Promise<Db | null> {
  try {
    const { MongoClient } = await import('mongodb')
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI
    const dbName = process.env.MONGODB_DB || 'randomapp'
    if (!uri) return null
    if (!_db) { const c = new MongoClient(uri); await c.connect(); _db = c.db(dbName) }
    return _db
  } catch { return null }
}

type QuoteDoc = {
  type: 'quote'
  text: string
  author?: string
  source?: { name: string; url?: string }
  provider?: string
  hash: string
  createdAt?: Date
  updatedAt?: Date
}

const norm = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim()
const quoteHash = (t: string, a?: string) => createHash('sha1').update(`${norm(t)}||${norm(a)}`).digest('hex')

async function upsertManyQuotes(rows: Omit<QuoteDoc,'createdAt'|'updatedAt'>[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  const ops = rows.map(r => ({
    updateOne: {
      filter: { type: 'quote', hash: r.hash },
      update: { $set: { ...r, type: 'quote', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      upsert: true,
    }
  }))
  const res = await db.collection('items').bulkWrite(ops, { ordered: false })
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 }
}

/* ============= Providers ============= */
const UA = { 'User-Agent': 'RandomAppBot/1.0 (+https://example.com)' }

async function scrapeTypeFit() {
  const url = 'https://type.fit/api/quotes'
  const out: Omit<QuoteDoc,'createdAt'|'updatedAt'>[] = []
  try {
    const res = await fetch(url, { cache:'no-store', headers: UA })
    if (!res.ok) return out
    const arr: any[] = await res.json()
    for (const q of arr) {
      const text = norm(q?.text); if (!text) continue
      const author = norm(q?.author)
      out.push({ type:'quote', text, author, source:{ name:'type.fit', url }, provider:'typefit', hash: quoteHash(text, author) })
    }
  } catch {}
  return out
}

async function scrapeToScrape(pages = 3) {
  const out: Omit<QuoteDoc,'createdAt'|'updatedAt'>[] = []
  for (let p=1; p<=pages; p++) {
    const url = p===1 ? 'https://quotes.toscrape.com/' : `https://quotes.toscrape.com/page/${p}/`
    try {
      const res = await fetch(url, { cache:'no-store', headers: UA }); if (!res.ok) break
      const html = await res.text(); const $ = cheerio.load(html)
      $('.quote').each((_, el) => {
        const text = norm($(el).find('.text').text())
        const author = norm($(el).find('.author').text())
        if (!text) return
        out.push({ type:'quote', text, author, source:{ name:'quotes.toscrape', url }, provider:'toscrape', hash: quoteHash(text, author) })
      })
    } catch { break }
  }
  return out
}

async function scrapePassItOn(pages = 2) {
  const out: Omit<QuoteDoc,'createdAt'|'updatedAt'>[] = []
  for (let p=1; p<=pages; p++) {
    const url = p===1 ? 'https://www.passiton.com/inspirational-quotes' : `https://www.passiton.com/inspirational-quotes?page=${p}`
    try {
      const res = await fetch(url, { cache:'no-store', headers: UA }); if (!res.ok) break
      const html = await res.text(); const $ = cheerio.load(html)
      $('.col-6.col-lg-4.text-center').each((_, el) => {
        const text = norm($(el).find('.d-none.d-lg-block .mb-0').text()) || norm($(el).find('blockquote').text())
        const author = norm($(el).find('.author').text()) || norm($(el).find('h5, h6').text())
        if (!text) return
        out.push({ type:'quote', text, author, source:{ name:'passiton.com', url }, provider:'passiton', hash: quoteHash(text, author) })
      })
    } catch { break }
  }
  return out
}

/* ============= Handler ============= */
export async function GET(req: NextRequest) {
  // AUTH durcie
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pages = Math.max(1, Math.min(20, Number(req.nextUrl.searchParams.get('pages') || 3)))
  const sites = (req.nextUrl.searchParams.get('sites') || 'toscrape,typefit,passiton')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  let collected: Omit<QuoteDoc,'createdAt'|'updatedAt'>[] = []
  try { if (sites.includes('typefit'))  collected = collected.concat(await scrapeTypeFit()) } catch {}
  try { if (sites.includes('toscrape')) collected = collected.concat(await scrapeToScrape(pages)) } catch {}
  try { if (sites.includes('passiton')) collected = collected.concat(await scrapePassItOn(Math.min(5,pages))) } catch {}

  // de-dup
  const map = new Map<string, Omit<QuoteDoc,'createdAt'|'updatedAt'>>()
  for (const q of collected) if (q?.hash && !map.has(q.hash)) map.set(q.hash, q)
  const unique = Array.from(map.values())

  let result = { inserted: 0, updated: 0 }
  try { result = await upsertManyQuotes(unique) } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'bulkWrite failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, requestedSites: sites, pages, scanned: collected.length, unique: unique.length, ...result })
}
