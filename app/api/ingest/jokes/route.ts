// app/api/ingest/jokes/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { createHash } from 'crypto'
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
  return sampleArray(mapped, Math.min(limit * 3, 300))
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
  return sampleArray(mapped, Math.min(limit * 2, 200))
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

    let collected: JokeDoc[] = []
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
    const map = new Map<string, JokeDoc>()
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'ingest jokes failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
