// app/api/ingest/quotes/route.ts
export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { createHash } from 'crypto'
import * as cheerio from 'cheerio'
import { createQuoteDocument, type QuoteDocument } from '@/lib/random/quotes'
import { DEFAULT_INGEST_HEADERS, fetchJson, fetchText } from '@/lib/ingest/http'

const ROUTE_HEADERS = { ...DEFAULT_INGEST_HEADERS, 'User-Agent': 'RandomAppBot/1.0 (+https://gorandom.fun)' }

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

type QuoteDoc = QuoteDocument & {
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
  const out: QuoteDoc[] = []
  const arr = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 10000 })
  if (!Array.isArray(arr)) return out
  for (const entry of arr) {
    const record = (entry ?? {}) as Record<string, unknown>
    const text = norm(typeof record.text === 'string' ? record.text : '')
    if (!text) continue
    const author = norm(typeof record.author === 'string' ? record.author : '')
    const base = createQuoteDocument({
      text,
      author,
      provider: 'typefit',
      source: { name: 'type.fit', url },
    })
    if (base) out.push({ ...base, hash: quoteHash(base.text, base.author) })
  }
  return out
}

async function fetchGithubQuotesDatabase() {
  const url = 'https://raw.githubusercontent.com/JamesFT/Database-Quotes-JSON/master/quotes.json'
  const arr = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 15000 })
  if (!Array.isArray(arr)) return []
  const mapped = arr
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>
      const text = norm(
        typeof record.quote === 'string'
          ? record.quote
          : typeof record.text === 'string'
            ? record.text
            : typeof record.quoteText === 'string'
              ? record.quoteText
              : typeof record.en === 'string'
                ? record.en
                : '',
      )
      if (!text) return null
      const author = norm(
        typeof record.author === 'string'
          ? record.author
          : typeof record.quoteAuthor === 'string'
            ? record.quoteAuthor
            : typeof record.quoteAuthorName === 'string'
              ? record.quoteAuthorName
              : '',
      )
      const base = createQuoteDocument({
        text,
        author,
        provider: 'github-quotes-database',
        source: { name: 'github:quotes-database', url },
      })
      if (!base) return null
      return {
        ...base,
        hash: quoteHash(base.text, base.author),
      }
    })
    .filter((entry): entry is QuoteDoc => Boolean(entry))
  return mapped
}

async function fetchGithubProgrammingQuotes() {
  const url = 'https://raw.githubusercontent.com/skolakoda/programming-quotes-api/master/quotes.json'
  const arr = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 15000 })
  if (!Array.isArray(arr)) return []
  const mapped = arr
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>
      const text = norm(
        typeof record.en === 'string'
          ? record.en
          : typeof record.quote === 'string'
            ? record.quote
            : typeof record.text === 'string'
              ? record.text
              : '',
      )
      if (!text) return null
      const author = norm(typeof record.author === 'string' ? record.author : '')
      const base = createQuoteDocument({
        text,
        author,
        provider: 'github-programming-quotes',
        source: { name: 'github:programming-quotes', url },
      })
      if (!base) return null
      return {
        ...base,
        hash: quoteHash(base.text, base.author),
      }
    })
    .filter((entry): entry is QuoteDoc => Boolean(entry))
  return mapped
}

async function fetchGithubFamousQuotes() {
  const url = 'https://raw.githubusercontent.com/prairieworks/Famous-Quotes/master/famous-quotes.json'
  const arr = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 15000 })
  if (!Array.isArray(arr)) return []
  const mapped = arr
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>
      const text = norm(typeof record.quote === 'string' ? record.quote : typeof record.text === 'string' ? record.text : '')
      if (!text) return null
      const author = norm(typeof record.author === 'string' ? record.author : typeof record.by === 'string' ? record.by : '')
      const base = createQuoteDocument({
        text,
        author,
        provider: 'github-famous-quotes',
        source: { name: 'github:famous-quotes', url },
      })
      if (!base) return null
      return {
        ...base,
        hash: quoteHash(base.text, base.author),
      }
    })
    .filter((entry): entry is QuoteDoc => Boolean(entry))
  return mapped
}

async function scrapeToScrape(pages = 10) {
  const out: QuoteDoc[] = []
  for (let p=1; p<=pages; p++) {
    const url = p===1 ? 'https://quotes.toscrape.com/' : `https://quotes.toscrape.com/page/${p}/`
    try {
      const html = await fetchText(url, { headers: ROUTE_HEADERS, timeoutMs: 15000 })
      if (!html) break
      const $ = cheerio.load(html)
      $('.quote').each((_, el) => {
        const text = norm($(el).find('.text').text())
        const author = norm($(el).find('.author').text())
        if (!text) return
        const base = createQuoteDocument({
          text,
          author,
          provider: 'toscrape',
          source: { name: 'quotes.toscrape', url },
        })
        if (!base) return
        out.push({ ...base, hash: quoteHash(base.text, base.author) })
      })
    } catch { break }
  }
  return out
}

async function scrapePassItOn(pages = 30) {
  const out: QuoteDoc[] = []
  for (let p=1; p<=pages; p++) {
    const url = p===1 ? 'https://www.passiton.com/inspirational-quotes' : `https://www.passiton.com/inspirational-quotes?page=${p}`
    try {
      const html = await fetchText(url, { headers: ROUTE_HEADERS, timeoutMs: 15000 })
      if (!html) break
      const $ = cheerio.load(html)
      $('.col-6.col-lg-4.text-center').each((_, el) => {
        const text = norm($(el).find('.d-none.d-lg-block .mb-0').text()) || norm($(el).find('blockquote').text())
        const author = norm($(el).find('.author').text()) || norm($(el).find('h5, h6').text())
        if (!text) return
        const base = createQuoteDocument({
          text,
          author,
          provider: 'passiton',
          source: { name: 'passiton.com', url },
        })
        if (!base) return
        out.push({ ...base, hash: quoteHash(base.text, base.author) })
      })
    } catch { break }
  }
  return out
}

async function fetchZenQuotes() {
  const url = 'https://zenquotes.io/api/quotes'
  const arr = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 15000 })
  if (!Array.isArray(arr)) return []
  return arr
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>
      const text = norm(typeof record.q === 'string' ? record.q : typeof record.quote === 'string' ? record.quote : '')
      if (!text) return null
      const author = norm(typeof record.a === 'string' ? record.a : typeof record.author === 'string' ? record.author : '')
      const base = createQuoteDocument({
        text,
        author,
        provider: 'zenquotes',
        source: { name: 'ZenQuotes', url },
      })
      if (!base) return null
      return {
        ...base,
        hash: quoteHash(base.text, base.author),
      }
    })
    .filter((entry): entry is QuoteDoc => Boolean(entry))
}

/* ============= Handler ============= */
export async function GET(req: NextRequest) {
  // AUTH durcie
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pagesRaw = Number(req.nextUrl.searchParams.get('pages') || 10)
  const pages = Number.isFinite(pagesRaw) ? Math.max(1, Math.min(50, pagesRaw)) : 10
  const sites = (req.nextUrl.searchParams.get('sites') || 'toscrape,typefit,passiton,zenquotes,github-db,github-programming,github-famous')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  let collected: QuoteDoc[] = []
  try { if (sites.includes('typefit'))  collected = collected.concat(await scrapeTypeFit()) } catch {}
  try { if (sites.includes('zenquotes')) collected = collected.concat(await fetchZenQuotes()) } catch {}
  try { if (sites.includes('toscrape')) collected = collected.concat(await scrapeToScrape(pages)) } catch {}
  try { if (sites.includes('passiton')) collected = collected.concat(await scrapePassItOn(pages)) } catch {}
  try { if (sites.includes('github-db')) collected = collected.concat(await fetchGithubQuotesDatabase()) } catch {}
  try { if (sites.includes('github-programming')) collected = collected.concat(await fetchGithubProgrammingQuotes()) } catch {}
  try { if (sites.includes('github-famous')) collected = collected.concat(await fetchGithubFamousQuotes()) } catch {}

  // de-dup
  const map = new Map<string, QuoteDoc>()
  for (const q of collected) if (q?.hash && !map.has(q.hash)) map.set(q.hash, q)
  const unique = Array.from(map.values())

  let result = { inserted: 0, updated: 0 }
  try {
    result = await upsertManyQuotes(unique)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'bulkWrite failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, requestedSites: sites, pages, scanned: collected.length, unique: unique.length, ...result })
}
