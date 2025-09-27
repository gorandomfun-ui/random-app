// app/api/ingest/jokes/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { createHash } from 'crypto'
import * as cheerio from 'cheerio'
import { createJokeDocument, type JokeDocument } from '@/lib/random/jokes'
import { DEFAULT_INGEST_HEADERS, fetchJson } from '@/lib/ingest/http'

/* =========================== DB =========================== */
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
  } catch {
    return null
  }
}

type JokeDoc = JokeDocument & {
  hash: string
  createdAt?: Date
  updatedAt?: Date
}

const norm = (v?: string | null) => (v || '').replace(/\s+/g, ' ').trim()
const jokeHash = (text: string) => createHash('sha1').update(norm(text)).digest('hex')

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

async function upsertManyJokes(rows: Omit<JokeDoc, 'createdAt' | 'updatedAt'>[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { type: 'joke', hash: r.hash },
      update: {
        $set: { ...r, type: 'joke', updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }))
  const res = await db.collection('items').bulkWrite(ops, { ordered: false })
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 }
}

/* ======================== Helpers HTTP ===================== */
const ROUTE_HEADERS = { ...DEFAULT_INGEST_HEADERS, 'User-Agent': 'RandomAppBot/1.0 (+https://gorandom.fun)' }

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { cache: 'no-store', headers: ROUTE_HEADERS, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

/* ======================== Providers ======================== */
async function pullJokesDataset(limit: number) {
  const url = 'https://raw.githubusercontent.com/taivop/joke-dataset/master/jokes.json'
  const json = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 12000 })
  if (!Array.isArray(json)) return []
  const mapped = json
    .map((entry) => {
      const row = asRecord(entry)
      const body = typeof row.body === 'string' ? row.body : ''
      const jokeText = typeof row.joke === 'string' ? row.joke : ''
      const text = norm(body || jokeText)
      if (!text) return null
      const link = typeof row.link === 'string' ? row.link : undefined
      const base = createJokeDocument({
        text,
        provider: 'github-jokes-dataset',
        source: { name: 'github:jokes-dataset', url: link || url },
      })
      if (!base) return null
      return { ...base, hash: jokeHash(base.text) }
    })
    .filter((entry): entry is JokeDoc => Boolean(entry))
  return mapped.slice(0, Math.min(limit * 3, mapped.length))
}

async function pullFunnyQuotes(limit: number) {
  const url = 'https://raw.githubusercontent.com/akhilRana/funny-quotes/master/funny-quotes.json'
  const json = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 12000 })
  if (!Array.isArray(json)) return []
  const mapped = json
    .map((entry) => {
      const row = asRecord(entry)
      const quote = typeof row.quote === 'string' ? row.quote : ''
      const joke = typeof row.joke === 'string' ? row.joke : ''
      const text = norm(quote || joke)
      if (!text) return null
      const author = norm(typeof row.author === 'string' ? row.author : '')
      const fullText = author ? `${text} — ${author}` : text
      const base = createJokeDocument({
        text: fullText,
        provider: 'github-funny-quotes',
        source: { name: 'github:funny-quotes', url },
      })
      if (!base) return null
      return { ...base, hash: jokeHash(base.text) }
    })
    .filter((entry): entry is JokeDoc => Boolean(entry))
  return mapped.slice(0, Math.min(limit * 2, mapped.length))
}

type CheerioRoot = ReturnType<typeof cheerio.load>

function collectJokeCandidates($: CheerioRoot, selectors: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const text = norm($(element).text())
      if (!text) return
      if (text.length < 10 || text.length > 320) return
      if (seen.has(text)) return
      seen.add(text)
      out.push(text)
    })
  }
  return out
}

async function scrapeBeano(limit: number): Promise<JokeDoc[]> {
  const urls = [
    'https://www.beano.com/categories/jokes',
    'https://www.beano.com/categories/jokes/funny',
    'https://www.beano.com/categories/jokes/knock-knock',
  ]
  const sliceCount = Math.min(urls.length, Math.max(1, Math.ceil(limit / 40)))
  const selected = urls.slice(0, sliceCount)
  const out: JokeDoc[] = []
  const seen = new Set<string>()

  for (const url of selected) {
    const html = await fetchText(url)
    if (!html) continue
    const $ = cheerio.load(html)
    const candidates = collectJokeCandidates($, ['.collection-list-item', '.collection-card', 'li', 'p'])
    for (const text of candidates) {
      if (seen.has(text)) continue
      const base = createJokeDocument({
        text,
        provider: 'beano',
        source: { name: 'Beano', url },
      })
      if (!base) continue
      out.push({ ...base, hash: jokeHash(base.text) })
      seen.add(text)
      if (out.length >= limit) break
    }
    if (out.length >= limit) break
  }

  return out
}

async function scrapeGoodHousekeeping(limit: number): Promise<JokeDoc[]> {
  const urls = [
    'https://www.goodhousekeeping.com/life/entertainment/a41779929/corny-jokes/',
    'https://www.goodhousekeeping.com/life/entertainment/g5125/best-dad-jokes/',
  ]
  const out: JokeDoc[] = []
  const seen = new Set<string>()

  for (const url of urls) {
    const html = await fetchText(url)
    if (!html) continue
    const $ = cheerio.load(html)
    const candidates = collectJokeCandidates($, ['ol li', '.body-copy li', '.body-copy p', 'blockquote', 'li', 'p'])
    for (const text of candidates) {
      if (seen.has(text)) continue
      const base = createJokeDocument({
        text,
        provider: 'goodhousekeeping',
        source: { name: 'Good Housekeeping', url },
      })
      if (!base) continue
      out.push({ ...base, hash: jokeHash(base.text) })
      seen.add(text)
      if (out.length >= limit) break
    }
    if (out.length >= limit) break
  }

  return out
}

async function scrapePioneerWoman(limit: number): Promise<JokeDoc[]> {
  const urls = [
    'https://www.thepioneerwoman.com/home-lifestyle/a35617884/best-dad-jokes/',
    'https://www.thepioneerwoman.com/home-lifestyle/a41471366/corny-jokes/',
  ]
  const out: JokeDoc[] = []
  const seen = new Set<string>()

  for (const url of urls) {
    const html = await fetchText(url)
    if (!html) continue
    const $ = cheerio.load(html)
    const candidates = collectJokeCandidates($, ['.body-text li', '.body-text p', 'ol li', 'li', 'p'])
    for (const text of candidates) {
      if (seen.has(text)) continue
      const base = createJokeDocument({
        text,
        provider: 'pioneerwoman',
        source: { name: 'The Pioneer Woman', url },
      })
      if (!base) continue
      out.push({ ...base, hash: jokeHash(base.text) })
      seen.add(text)
      if (out.length >= limit) break
    }
    if (out.length >= limit) break
  }

  return out
}

async function scrapeJokesOfTheDay(limit: number): Promise<JokeDoc[]> {
  const urls = [
    'https://www.jokesoftheday.net/jokes/',
    'https://www.jokesoftheday.net/jokes/clean/',
  ]
  const out: JokeDoc[] = []
  const seen = new Set<string>()

  for (const url of urls) {
    const html = await fetchText(url)
    if (!html) continue
    const $ = cheerio.load(html)
    const candidates = collectJokeCandidates($, ['.joke', '.joke-text', '.entry-content p', 'article p', 'li', 'p'])
    for (const text of candidates) {
      if (seen.has(text)) continue
      const base = createJokeDocument({
        text,
        provider: 'jokesoftheday',
        source: { name: 'Jokes of the Day', url },
      })
      if (!base) continue
      out.push({ ...base, hash: jokeHash(base.text) })
      seen.add(text)
      if (out.length >= limit) break
    }
    if (out.length >= limit) break
  }

  return out
}

async function pullOfficialJokeApi(limit: number) {
  const url = 'https://official-joke-api.appspot.com/random_ten'
  const out: JokeDoc[] = []
  const batches = Math.ceil(limit / 10)
  for (let i = 0; i < batches; i++) {
    const arr = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 12000 })
    if (!Array.isArray(arr)) continue
    for (const joke of arr) {
      const entry = (joke ?? {}) as Record<string, unknown>
      const setup = norm(typeof entry.setup === 'string' ? entry.setup : '')
      const punchline = norm(typeof entry.punchline === 'string' ? entry.punchline : '')
      const text = punchline ? `${setup} ${setup ? '— ' : ''}${punchline}`.trim() : setup
      if (!text) continue
      const base = createJokeDocument({
        text,
        provider: 'official-joke-api',
        source: { name: 'Official Joke API', url: 'https://official-joke-api.appspot.com' },
      })
      if (!base) continue
      out.push({ ...base, hash: jokeHash(base.text) })
      if (out.length >= limit * 2) break
    }
    if (out.length >= limit * 2) break
  }
  return out
}

async function pullIcanHazDadJoke(limit: number): Promise<JokeDoc[]> {
  const perPage = 30
  const out: JokeDoc[] = []
  let page = 1
  while (out.length < limit * 2) {
    const data = await fetchJson<{ current_page?: number; total_pages?: number; results?: Array<{ id?: string; joke?: string }> }>(
      `https://icanhazdadjoke.com/search?limit=${perPage}&page=${page}`,
      {
        headers: { ...ROUTE_HEADERS, Accept: 'application/json' },
        timeoutMs: 10000,
      },
    )
    const results = Array.isArray(data?.results) ? data?.results ?? [] : []
    if (!results.length) break
    for (const entry of results) {
      const text = norm(entry?.joke || '')
      if (!text) continue
      const base = createJokeDocument({
        text,
        provider: 'icanhazdadjoke',
        source: { name: 'icanhazdadjoke.com', url: entry?.id ? `https://icanhazdadjoke.com/j/${entry.id}` : 'https://icanhazdadjoke.com' },
      })
      if (!base) continue
      out.push({ ...base, hash: jokeHash(base.text) })
      if (out.length >= limit * 2) break
    }
    if (out.length >= limit * 2) break
    const totalPages = Number(data?.total_pages || 0)
    if (!totalPages || page >= totalPages) break
    page += 1
  }
  return out
}

async function pullJokeApi(limit: number): Promise<JokeDoc[]> {
  const out: JokeDoc[] = []
  while (out.length < limit * 2) {
    const data = await fetchJson<
      | { jokes?: Array<{ type?: string; setup?: string; delivery?: string; joke?: string }> }
      | { type?: string; setup?: string; delivery?: string; joke?: string }
    >('https://v2.jokeapi.dev/joke/Any?amount=10', { headers: ROUTE_HEADERS, timeoutMs: 10000 })
    if (!data) break
    const list = Array.isArray((data as { jokes?: unknown }).jokes)
      ? ((data as { jokes?: Array<{ type?: string; setup?: string; delivery?: string; joke?: string }> }).jokes ?? [])
      : [data as { type?: string; setup?: string; delivery?: string; joke?: string }]
    if (!list.length) break
    for (const entry of list) {
      if (!entry) continue
      const setup = norm(entry.setup || '')
      const delivery = norm(entry.delivery || '')
      const single = norm(entry.joke || '')
      const text = single || (delivery ? `${setup}${setup ? ' — ' : ''}${delivery}` : setup)
      if (!text) continue
      const base = createJokeDocument({
        text,
        provider: 'jokeapi',
        source: { name: 'JokeAPI', url: 'https://v2.jokeapi.dev' },
      })
      if (!base) continue
      out.push({ ...base, hash: jokeHash(base.text) })
      if (out.length >= limit * 2) break
    }
    if (out.length >= limit * 2) break
  }
  return out
}

/* ========================= Handler ========================= */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const providedKey = (url.searchParams.get('key') || request.headers.get('x-admin-ingest-key') || '').trim()
    const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
    if (!expectedKey || providedKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limitParam = url.searchParams.get('limit')
    const limit = Math.max(1, Math.min(1000, Number(limitParam || 200)))
    const dryRun = url.searchParams.get('dryRun') === '1'
    const sourcesParam = url.searchParams.get('sources') || 'dataset,funnyquotes,official,icanhaz,jokeapi,beano,goodhousekeeping,pioneerwoman,jokesoftheday'
    const sources = sourcesParam
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)

    let collected: JokeDoc[] = []
    const targetPerSource = Math.max(10, Math.ceil(limit / Math.max(1, sources.length)))

    try { if (sources.includes('dataset')) collected = collected.concat(await pullJokesDataset(targetPerSource)) } catch {}
    try { if (sources.includes('funnyquotes')) collected = collected.concat(await pullFunnyQuotes(targetPerSource)) } catch {}
    try { if (sources.includes('official')) collected = collected.concat(await pullOfficialJokeApi(targetPerSource)) } catch {}
    try { if (sources.includes('icanhaz')) collected = collected.concat(await pullIcanHazDadJoke(targetPerSource)) } catch {}
    try { if (sources.includes('jokeapi')) collected = collected.concat(await pullJokeApi(targetPerSource)) } catch {}
    try { if (sources.includes('beano')) collected = collected.concat(await scrapeBeano(targetPerSource)) } catch {}
    try { if (sources.includes('goodhousekeeping')) collected = collected.concat(await scrapeGoodHousekeeping(targetPerSource)) } catch {}
    try { if (sources.includes('pioneerwoman')) collected = collected.concat(await scrapePioneerWoman(targetPerSource)) } catch {}
    try { if (sources.includes('jokesoftheday')) collected = collected.concat(await scrapeJokesOfTheDay(targetPerSource)) } catch {}

    if (!collected.length) {
      return NextResponse.json({ ok: false, error: 'No jokes collected' }, { status: 500 })
    }

    // de-dup & sample
    const map = new Map<string, JokeDoc>()
    for (const joke of collected) {
      if (!joke?.hash) continue
      if (!map.has(joke.hash)) map.set(joke.hash, joke)
    }
    const unique = Array.from(map.values())
    const finalBatch = unique.slice(0, Math.min(limit, unique.length))

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, unique: unique.length, wouldInsert: finalBatch.length, sources })
    }

    const result = await upsertManyJokes(finalBatch)
    return NextResponse.json({ ok: true, requested: limit, unique: unique.length, inserted: result.inserted, updated: result.updated, sources })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'ingest jokes failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
