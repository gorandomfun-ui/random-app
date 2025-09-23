// app/api/ingest/quotes/route.ts
export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { createHash } from 'crypto'
import * as cheerio from 'cheerio'

const UA = { 'User-Agent': 'RandomAppBot/1.0 (+https://gorandom.fun)' }

async function fetchJson(url: string, timeoutMs = 10000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', headers: UA, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function sampleArray<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr.slice()
  const out: T[] = []
  const used = new Set<number>()
  while (out.length < max && used.size < arr.length) {
    const idx = Math.floor(Math.random() * arr.length)
    if (used.has(idx)) continue
    used.add(idx)
    out.push(arr[idx]!)
  }
  return out
}

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

async function fetchGithubQuotesDatabase(limit: number) {
  const url = 'https://raw.githubusercontent.com/JamesFT/Database-Quotes-JSON/master/quotes.json'
  const arr: any[] | null = await fetchJson(url, 15000)
  if (!Array.isArray(arr)) return []
  const mapped = arr
    .map((entry) => {
      const text = norm(entry?.quote || entry?.text || entry?.quoteText || entry?.en || '')
      if (!text) return null
      const author = norm(entry?.author || entry?.quoteAuthor || entry?.quoteAuthorName || '')
      return {
        type: 'quote' as const,
        text,
        author: author || undefined,
        source: { name: 'github:quotes-database', url },
        provider: 'github-quotes-database',
        hash: quoteHash(text, author),
      }
    })
    .filter(Boolean) as Omit<QuoteDoc, 'createdAt' | 'updatedAt'>[]
  return sampleArray(mapped, Math.min(limit, 400))
}

async function fetchGithubProgrammingQuotes(limit: number) {
  const url = 'https://raw.githubusercontent.com/skolakoda/programming-quotes-api/master/quotes.json'
  const arr: any[] | null = await fetchJson(url, 15000)
  if (!Array.isArray(arr)) return []
  const mapped = arr
    .map((entry) => {
      const text = norm(entry?.en || entry?.quote || entry?.text || '')
      if (!text) return null
      const author = norm(entry?.author || '')
      return {
        type: 'quote' as const,
        text,
        author: author || undefined,
        source: { name: 'github:programming-quotes', url },
        provider: 'github-programming-quotes',
        hash: quoteHash(text, author),
      }
    })
    .filter(Boolean) as Omit<QuoteDoc, 'createdAt' | 'updatedAt'>[]
  return sampleArray(mapped, Math.min(limit, 200))
}

async function fetchGithubFamousQuotes(limit: number) {
  const url = 'https://raw.githubusercontent.com/prairieworks/Famous-Quotes/master/famous-quotes.json'
  const arr: any[] | null = await fetchJson(url, 15000)
  if (!Array.isArray(arr)) return []
  const mapped = arr
    .map((entry) => {
      const text = norm(entry?.quote || entry?.text || '')
      if (!text) return null
      const author = norm(entry?.author || entry?.by || '')
      return {
        type: 'quote' as const,
        text,
        author: author || undefined,
        source: { name: 'github:famous-quotes', url },
        provider: 'github-famous-quotes',
        hash: quoteHash(text, author),
      }
    })
    .filter(Boolean) as Omit<QuoteDoc, 'createdAt' | 'updatedAt'>[]
  return sampleArray(mapped, Math.min(limit, 200))
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
  const sites = (req.nextUrl.searchParams.get('sites') || 'toscrape,typefit,passiton,github-db,github-programming,github-famous')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  let collected: Omit<QuoteDoc,'createdAt'|'updatedAt'>[] = []
  try { if (sites.includes('typefit'))  collected = collected.concat(await scrapeTypeFit()) } catch {}
  try { if (sites.includes('toscrape')) collected = collected.concat(await scrapeToScrape(pages)) } catch {}
  try { if (sites.includes('passiton')) collected = collected.concat(await scrapePassItOn(Math.min(5,pages))) } catch {}
  const githubTarget = Math.max(20, Math.ceil(180 / Math.max(1, sites.length)))
  try { if (sites.includes('github-db')) collected = collected.concat(await fetchGithubQuotesDatabase(githubTarget)) } catch {}
  try { if (sites.includes('github-programming')) collected = collected.concat(await fetchGithubProgrammingQuotes(githubTarget)) } catch {}
  try { if (sites.includes('github-famous')) collected = collected.concat(await fetchGithubFamousQuotes(githubTarget)) } catch {}

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
