// app/api/ingest/facts/route.ts
export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
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
    if (!_db) { const c = new MongoClient(uri); await c.connect(); _db = c.db(dbName) }
    return _db
  } catch { return null }
}

type FactDoc = {
  type: 'fact'
  text: string
  source?: { name: string; url?: string }
  provider?: string
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
const UA = { 'User-Agent': 'RandomAppBot/1.0 (+https://example.com)' }
async function fetchJson(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', headers: UA, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch { return null } finally { clearTimeout(t) }
}

/* ======================== Providers ======================== */
async function pullUselessFacts(n: number): Promise<Omit<FactDoc,'createdAt'|'updatedAt'>[]> {
  const base = process.env.USELESSFACTS_BASE || 'https://uselessfacts.jsph.pl'
  const out: Omit<FactDoc,'createdAt'|'updatedAt'>[] = []
  for (let i = 0; i < n; i++) {
    const d: any = await fetchJson(`${base}/random.json?language=en`)
    const text = norm(d?.text || d?.data || '')
    if (!text) continue
    out.push({
      type: 'fact' as const,
      text,
      source: { name: 'UselessFacts', url: 'https://uselessfacts.jsph.pl' },
      provider: 'uselessfacts',
      hash: factHash(text)
    })
  }
  return out
}

async function pullNumbers(n: number): Promise<Omit<FactDoc,'createdAt'|'updatedAt'>[]> {
  const out: Omit<FactDoc,'createdAt'|'updatedAt'>[] = []
  for (let i = 0; i < n; i++) {
    const d: any = await fetchJson('https://numbersapi.com/random/trivia?json')
    const text = norm(d?.text || '')
    if (!text) continue
    out.push({
      type: 'fact' as const,
      text,
      source: { name: 'Numbers API', url: 'https://numbersapi.com' },
      provider: 'numbers',
      hash: factHash(text)
    })
  }
  return out
}

async function pullCatFacts(n: number): Promise<Omit<FactDoc,'createdAt'|'updatedAt'>[]> {
  const page = Math.min(100, Math.max(1, n))
  const d: any = await fetchJson(`https://catfact.ninja/facts?limit=${page}`)
  const arr: any[] = Array.isArray(d?.data) ? d.data : []
  return arr.slice(0, n).map((it) => {
    const text = norm(it?.fact || it?.text || '')
    return {
      type: 'fact' as const,
      text,
      source: { name: 'catfact.ninja', url: 'https://catfact.ninja' },
      provider: 'catfact',
      hash: factHash(text)
    }
  }).filter(x => x.text)
}

async function pullMeowFacts(n: number): Promise<Omit<FactDoc,'createdAt'|'updatedAt'>[]> {
  const d: any = await fetchJson(`https://meowfacts.herokuapp.com/?count=${Math.min(50, Math.max(1, n))}`)
  const arr: any[] = Array.isArray(d?.data) ? d.data : []
  return arr.slice(0, n).map(s => {
    const text = norm(String(s || ''))
    return {
      type: 'fact' as const,
      text,
      source: { name: 'meowfacts', url: 'https://meowfacts.herokuapp.com' },
      provider: 'meowfacts',
      hash: factHash(text)
    }
  }).filter(x => x.text)
}

async function pullDogFacts(n: number): Promise<Omit<FactDoc,'createdAt'|'updatedAt'>[]> {
  const out: Omit<FactDoc,'createdAt'|'updatedAt'>[] = []
  const batches = Math.ceil(n / 5)
  for (let i = 0; i < batches; i++) {
    const d: any = await fetchJson('https://dogapi.dog/api/facts')
    const arr: any[] = Array.isArray(d?.facts) ? d.facts : []
    for (const s of arr) {
      if (out.length >= n) break
      const text = norm(String(s || ''))
      if (!text) continue
      out.push({
        type: 'fact' as const,
        text,
        source: { name: 'dogapi.dog', url: 'https://dogapi.dog' },
        provider: 'dogapi',
        hash: factHash(text)
      })
    }
  }
  return out
}

/* ========================= Handler ========================= */
export async function GET(req: NextRequest) {
  // AUTH durcie (clé en query OU header) + trim
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const n = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get('n') || 60)))
  const sites = (req.nextUrl.searchParams.get('sites') || 'useless,numbers,cat,meow,dog')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  let collected: Omit<FactDoc,'createdAt'|'updatedAt'>[] = []
  const add = (a?: Omit<FactDoc,'createdAt'|'updatedAt'>[]) => { if (Array.isArray(a) && a.length) collected = collected.concat(a) }

  try { if (sites.includes('useless')) add(await pullUselessFacts(Math.ceil(n/sites.length))) } catch {}
  try { if (sites.includes('numbers')) add(await pullNumbers(Math.ceil(n/sites.length))) } catch {}
  try { if (sites.includes('cat'))     add(await pullCatFacts(Math.ceil(n/sites.length))) } catch {}
  try { if (sites.includes('meow'))    add(await pullMeowFacts(Math.ceil(n/sites.length))) } catch {}
  try { if (sites.includes('dog'))     add(await pullDogFacts(Math.ceil(n/sites.length))) } catch {}

  while (collected.length < n) {
    try {
      const pick = ['numbers','useless','meow','cat','dog'].filter(s=>sites.includes(s))
      if (!pick.length) break
      const which = pick[Math.floor(Math.random()*pick.length)]
      const more = which==='numbers' ? await pullNumbers(1)
                : which==='useless' ? await pullUselessFacts(1)
                : which==='meow'    ? await pullMeowFacts(1)
                : which==='cat'     ? await pullCatFacts(1)
                : await pullDogFacts(1)
      collected = collected.concat(more)
    } catch { break }
  }

  // de-dup
  const map = new Map<string, Omit<FactDoc,'createdAt'|'updatedAt'>>()
  for (const f of collected) if (f?.hash && !map.has(f.hash)) map.set(f.hash, f)
  const unique = Array.from(map.values())

  let result = { inserted: 0, updated: 0 }
  try { result = await upsertManyFacts(unique) } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'bulkWrite failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, requested: n, scanned: collected.length, unique: unique.length, ...result })
}
