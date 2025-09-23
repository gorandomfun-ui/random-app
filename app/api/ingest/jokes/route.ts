// app/api/ingest/jokes/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { createHash } from 'crypto'

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

type JokeDoc = {
  type: 'joke'
  text: string
  source?: { name: string; url?: string }
  provider?: string
  hash: string
  createdAt?: Date
  updatedAt?: Date
}

const norm = (v?: string | null) => (v || '').replace(/\s+/g, ' ').trim()
const jokeHash = (text: string) => createHash('sha1').update(norm(text)).digest('hex')

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
const HTTP_HEADERS = { 'User-Agent': 'RandomAppBot/1.0 (+https://gorandom.fun)' }

async function fetchJson(url: string, timeoutMs = 10000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', headers: HTTP_HEADERS, signal: ctrl.signal })
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
  const taken = new Set<number>()
  while (out.length < max && taken.size < arr.length) {
    const idx = Math.floor(Math.random() * arr.length)
    if (taken.has(idx)) continue
    taken.add(idx)
    out.push(arr[idx]!)
  }
  return out
}

/* ======================== Providers ======================== */
async function pullJokesDataset(limit: number) {
  const url = 'https://raw.githubusercontent.com/taivop/joke-dataset/master/jokes.json'
  const json: any[] | null = await fetchJson(url)
  if (!Array.isArray(json)) return []
  const mapped = json
    .map((entry) => {
      const text = norm(entry?.body || entry?.joke || '')
      if (!text) return null
      const link = typeof entry?.link === 'string' ? entry.link : undefined
      return {
        type: 'joke' as const,
        text,
        source: { name: 'github:jokes-dataset', url: link || url },
        provider: 'github-jokes-dataset',
        hash: jokeHash(text),
      }
    })
    .filter(Boolean) as Omit<JokeDoc, 'createdAt' | 'updatedAt'>[]
  return sampleArray(mapped, Math.min(limit * 3, 300))
}

async function pullFunnyQuotes(limit: number) {
  const url = 'https://raw.githubusercontent.com/akhilRana/funny-quotes/master/funny-quotes.json'
  const json: any[] | null = await fetchJson(url)
  if (!Array.isArray(json)) return []
  const mapped = json
    .map((entry) => {
      const text = norm(entry?.quote || entry?.joke || '')
      if (!text) return null
      const author = norm(entry?.author)
      const fullText = author ? `${text} — ${author}` : text
      return {
        type: 'joke' as const,
        text: fullText,
        source: { name: 'github:funny-quotes', url },
        provider: 'github-funny-quotes',
        hash: jokeHash(fullText),
      }
    })
    .filter(Boolean) as Omit<JokeDoc, 'createdAt' | 'updatedAt'>[]
  return sampleArray(mapped, Math.min(limit * 2, 200))
}

async function pullOfficialJokeApi(limit: number) {
  const url = 'https://official-joke-api.appspot.com/random_ten'
  const out: Omit<JokeDoc, 'createdAt' | 'updatedAt'>[] = []
  const batches = Math.ceil(limit / 10)
  for (let i = 0; i < batches; i++) {
    const arr: any[] | null = await fetchJson(url)
    if (!Array.isArray(arr)) continue
    for (const joke of arr) {
      const setup = norm(joke?.setup)
      const punchline = norm(joke?.punchline)
      const text = punchline ? `${setup} ${setup ? '— ' : ''}${punchline}`.trim() : setup
      if (!text) continue
      out.push({
        type: 'joke' as const,
        text,
        source: { name: 'Official Joke API', url: 'https://official-joke-api.appspot.com' },
        provider: 'official-joke-api',
        hash: jokeHash(text),
      })
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
    const limit = Math.max(1, Math.min(500, Number(limitParam || 80)))
    const dryRun = url.searchParams.get('dryRun') === '1'
    const sourcesParam = url.searchParams.get('sources') || 'dataset,funnyquotes,official'
    const sources = sourcesParam
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)

    let collected: Omit<JokeDoc, 'createdAt' | 'updatedAt'>[] = []
    const targetPerSource = Math.max(10, Math.ceil(limit / Math.max(1, sources.length)))

    try {
      if (sources.includes('dataset')) {
        collected = collected.concat(await pullJokesDataset(targetPerSource))
      }
    } catch {}

    try {
      if (sources.includes('funnyquotes')) {
        collected = collected.concat(await pullFunnyQuotes(targetPerSource))
      }
    } catch {}

    try {
      if (sources.includes('official')) {
        collected = collected.concat(await pullOfficialJokeApi(targetPerSource))
      }
    } catch {}

    if (!collected.length) {
      return NextResponse.json({ ok: false, error: 'No jokes collected' }, { status: 500 })
    }

    // de-dup & sample
    const map = new Map<string, Omit<JokeDoc, 'createdAt' | 'updatedAt'>>()
    for (const joke of collected) {
      if (!joke?.hash) continue
      if (!map.has(joke.hash)) map.set(joke.hash, joke)
    }
    const unique = Array.from(map.values())
    const finalBatch = sampleArray(unique, limit)

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, unique: unique.length, wouldInsert: finalBatch.length })
    }

    const result = await upsertManyJokes(finalBatch)
    return NextResponse.json({ ok: true, requested: limit, unique: unique.length, inserted: result.inserted, updated: result.updated })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'ingest jokes failed' }, { status: 500 })
  }
}

