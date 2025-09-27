// app/api/ingest/facts/route.ts
export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { createHash } from 'crypto'
import { DEFAULT_INGEST_HEADERS, fetchJson } from '@/lib/ingest/http'
import { createFactDocument, type FactDocument } from '@/lib/random/facts'

/* =========================== DB =========================== */
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

type FactDoc = FactDocument & {
  hash: string
  createdAt?: Date
  updatedAt?: Date
}

const norm = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim()
const factHash = (t: string) => createHash('sha1').update(norm(t)).digest('hex')

async function upsertManyFacts(rows: Omit<FactDoc, 'createdAt' | 'updatedAt'>[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  const ops = rows.map(r => ({
    updateOne: {
      filter: { type: 'fact', hash: r.hash },
      update: { $set: { ...r, type: 'fact', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      upsert: true,
    }
  }))
  const res = await db.collection('items').bulkWrite(ops, { ordered: false })
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 }
}

/* ======================== Helpers HTTP ===================== */
const ROUTE_HEADERS = { ...DEFAULT_INGEST_HEADERS, 'User-Agent': 'RandomAppBot/1.0 (+https://example.com)' }

/* ======================== Providers ======================== */
type UselessFact = { text?: string; data?: string }
type NumbersFact = { text?: string }
type CatFactsResponse = { data?: Array<{ fact?: string; text?: string }> }
type MeowFactsResponse = { data?: string[] }
type DogFactsResponse = { facts?: string[] }
type UrbanDictionaryEntry = {
  definition?: string
  example?: string
  word?: string
  permalink?: string
  tags?: unknown
}
type UrbanDictionaryResponse = {
  list?: UrbanDictionaryEntry[]
}

const stripSquareMarkup = (value: string) => value.replace(/\[([^\]]+)\]/g, '$1')

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed) out.push(trimmed.toLowerCase())
    }
  }
  return Array.from(new Set(out))
}

async function pullUrbanDictionary(n: number): Promise<FactDoc[]> {
  const out: FactDoc[] = []
  const seen = new Set<string>()
  const attempts = Math.max(2, Math.ceil(n / 8))
  for (let i = 0; i < attempts && out.length < n * 2; i++) {
    const response = await fetchJson<UrbanDictionaryResponse>('https://api.urbandictionary.com/v0/random', {
      headers: ROUTE_HEADERS,
      timeoutMs: 10000,
    })
    const entries = Array.isArray(response?.list) ? response?.list ?? [] : []
    for (const entry of entries) {
      if (!entry) continue
      const definition = norm(stripSquareMarkup(entry.definition || ''))
      if (!definition) continue
      const tagList = normalizeStringArray(entry.tags)
      const wordTag = typeof entry.word === 'string' ? entry.word.trim().toLowerCase() : ''
      const baseDoc = createFactDocument({
        text: definition,
        provider: 'urban-dictionary',
        source: {
          name: entry.word ? `Urban Dictionary – ${entry.word}` : 'Urban Dictionary',
          url: entry.permalink || 'https://www.urbandictionary.com',
        },
        tags: wordTag ? [...tagList, wordTag] : tagList,
      })
      if (!baseDoc) continue
      const hash = factHash(baseDoc.text)
      if (seen.has(hash)) continue
      seen.add(hash)
      out.push({ ...baseDoc, hash })
      if (out.length >= n) break
    }
  }
  return out.slice(0, n)
}

async function pullUselessFacts(n: number): Promise<FactDoc[]> {
  const base = process.env.USELESSFACTS_BASE || 'https://uselessfacts.jsph.pl'
  const out: FactDoc[] = []
  for (let i = 0; i < n; i++) {
    const record = await fetchJson<UselessFact>(`${base}/random.json?language=en`, {
      headers: ROUTE_HEADERS,
      timeoutMs: 8000,
    })
    const text = norm(record?.text || record?.data || '')
    if (!text) continue
    const baseDoc = createFactDocument({
      text,
      provider: 'uselessfacts',
      source: { name: 'UselessFacts', url: 'https://uselessfacts.jsph.pl' },
    })
    if (!baseDoc) continue
    out.push({ ...baseDoc, hash: factHash(baseDoc.text) })
  }
  return out
}

async function pullNumbers(n: number): Promise<FactDoc[]> {
  const out: FactDoc[] = []
  for (let i = 0; i < n; i++) {
    const record = await fetchJson<NumbersFact>('https://numbersapi.com/random/trivia?json', {
      headers: ROUTE_HEADERS,
      timeoutMs: 8000,
    })
    const text = norm(record?.text || '')
    if (!text) continue
    const baseDoc = createFactDocument({
      text,
      provider: 'numbers',
      source: { name: 'Numbers API', url: 'https://numbersapi.com' },
    })
    if (!baseDoc) continue
    out.push({ ...baseDoc, hash: factHash(baseDoc.text) })
  }
  return out
}

async function pullCatFacts(n: number): Promise<FactDoc[]> {
  const page = Math.min(100, Math.max(1, n))
  const response = await fetchJson<CatFactsResponse>(`https://catfact.ninja/facts?limit=${page}`, {
    headers: ROUTE_HEADERS,
    timeoutMs: 8000,
  })
  const entries = Array.isArray(response?.data) ? response?.data ?? [] : []
  return entries.slice(0, n).map((record) => {
    const text = norm(record?.fact || record?.text || '')
    if (!text) return null
    const baseDoc = createFactDocument({
      text,
      provider: 'catfact',
      source: { name: 'catfact.ninja', url: 'https://catfact.ninja' },
    })
    if (!baseDoc) return null
    return { ...baseDoc, hash: factHash(baseDoc.text) }
  }).filter((entry): entry is FactDoc => Boolean(entry))
}

async function pullMeowFacts(n: number): Promise<FactDoc[]> {
  const response = await fetchJson<MeowFactsResponse>(`https://meowfacts.herokuapp.com/?count=${Math.min(50, Math.max(1, n))}`, {
    headers: ROUTE_HEADERS,
    timeoutMs: 8000,
  })
  const entries = Array.isArray(response?.data) ? response?.data ?? [] : []
  return entries.slice(0, n).map((s) => {
    const text = norm(typeof s === 'string' ? s : '')
    if (!text) return null
    const baseDoc = createFactDocument({
      text,
      provider: 'meowfacts',
      source: { name: 'meowfacts', url: 'https://meowfacts.herokuapp.com' },
    })
    if (!baseDoc) return null
    return { ...baseDoc, hash: factHash(baseDoc.text) }
  }).filter((entry): entry is FactDoc => Boolean(entry))
}

async function pullDogFacts(n: number): Promise<FactDoc[]> {
  const out: FactDoc[] = []
  const batches = Math.ceil(n / 5)
  for (let i = 0; i < batches; i++) {
    const response = await fetchJson<DogFactsResponse>('https://dogapi.dog/api/facts', {
      headers: ROUTE_HEADERS,
      timeoutMs: 8000,
    })
    const entries = Array.isArray(response?.facts) ? response?.facts ?? [] : []
    for (const s of entries) {
      if (out.length >= n) break
      const text = norm(typeof s === 'string' ? s : '')
      if (!text) continue
      const baseDoc = createFactDocument({
        text,
        provider: 'dogapi',
        source: { name: 'dogapi.dog', url: 'https://dogapi.dog' },
      })
      if (!baseDoc) continue
      out.push({ ...baseDoc, hash: factHash(baseDoc.text) })
    }
  }
  return out
}

async function pullAwesomeFacts(): Promise<FactDoc[]> {
  const url = 'https://raw.githubusercontent.com/sapher/awesome-facts/master/facts.json'
  const arr = await fetchJson<unknown[]>(url, { headers: ROUTE_HEADERS, timeoutMs: 12000 })
  if (!Array.isArray(arr)) return []
  return arr
    .map((entry) => {
      const text = norm(typeof entry === 'string' ? entry : '')
      if (!text) return null
      const baseDoc = createFactDocument({
        text,
        provider: 'github-awesome-facts',
        source: { name: 'github:awesome-facts', url },
      })
      if (!baseDoc) return null
      return { ...baseDoc, hash: factHash(baseDoc.text) }
    })
    .filter((entry): entry is FactDoc => Boolean(entry))
}

/* ========================= Handler ========================= */
export async function GET(req: NextRequest) {
  // AUTH durcie (clé en query OU header) + trim
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const n = Math.max(1, Math.min(1200, Number(req.nextUrl.searchParams.get('n') || 120)))
  const sites = (req.nextUrl.searchParams.get('sites') || 'awesomefacts,useless,numbers,cat,meow,dog,urban')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  let collected: FactDoc[] = []
  const add = (a?: FactDoc[]) => { if (Array.isArray(a) && a.length) collected = collected.concat(a) }

  const basePerProvider = Math.max(20, Math.ceil(n / Math.max(1, sites.length)))

  try { if (sites.includes('awesomefacts')) add(await pullAwesomeFacts()) } catch {}
  try { if (sites.includes('useless')) add(await pullUselessFacts(basePerProvider)) } catch {}
  try { if (sites.includes('numbers')) add(await pullNumbers(basePerProvider)) } catch {}
  try { if (sites.includes('cat'))     add(await pullCatFacts(basePerProvider)) } catch {}
  try { if (sites.includes('meow'))    add(await pullMeowFacts(basePerProvider)) } catch {}
  try { if (sites.includes('dog'))     add(await pullDogFacts(basePerProvider)) } catch {}
  try { if (sites.includes('urban'))   add(await pullUrbanDictionary(basePerProvider)) } catch {}

  while (collected.length < n) {
    try {
      const pick = ['numbers','useless','meow','cat','dog','urban','awesomefacts'].filter(s=>sites.includes(s))
      if (!pick.length) break
      const which = pick[Math.floor(Math.random()*pick.length)]
      const more = which==='numbers' ? await pullNumbers(1)
                : which==='useless' ? await pullUselessFacts(1)
                : which==='meow'    ? await pullMeowFacts(1)
                : which==='cat'     ? await pullCatFacts(1)
                : which==='dog'     ? await pullDogFacts(1)
                : which==='awesomefacts' ? (await pullAwesomeFacts()).slice(0, 1)
                : await pullUrbanDictionary(1)
      collected = collected.concat(more)
    } catch { break }
  }

  // de-dup
  const map = new Map<string, FactDoc>()
  for (const f of collected) if (f?.hash && !map.has(f.hash)) map.set(f.hash, f)
  const unique = Array.from(map.values())

  let result = { inserted: 0, updated: 0 }
  try {
    result = await upsertManyFacts(unique)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'bulkWrite failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, requested: n, scanned: collected.length, unique: unique.length, ...result })
}
