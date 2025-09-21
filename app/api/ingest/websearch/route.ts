export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { MongoClient, Db } from 'mongodb'

let _client: MongoClient | null = null
let _db: Db | null = null
async function getDb() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB || 'randomapp'
  if (!uri) throw new Error('Missing MONGODB_URI')
  if (!_client) _client = new MongoClient(uri)
  if (!_db) {
    await _client.connect()
    _db = _client.db(dbName)
  }
  return _db
}

const CSE_KEY = process.env.GOOGLE_CSE_KEY
const CSE_CX = process.env.GOOGLE_CSE_CX

const WORDS_A = ['weird', 'odd', 'tiny', 'forgotten', 'handmade', 'ascii', 'retro', 'vintage', 'random', 'obscure']
const WORDS_B = ['toy', 'museum', 'diary', 'blog', 'gallery', 'generator', 'gospel', 'festival', 'game', 'zine']
const WORDS_C = ['2003', '2007', 'romania', 'argentina', 'finland', 'iceland', 'japan', 'france', 'village', 'basement']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

function normalizeUrl(href: string) {
  try {
    const u = new URL(href)
    u.searchParams.delete('utm_source')
    u.searchParams.delete('utm_medium')
    u.searchParams.delete('utm_campaign')
    let path = u.pathname.replace(/\/+$/, '')
    if (!path) path = '/'
    return `${u.protocol}//${u.host}${path}${u.search}`
  } catch {
    return href
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const adminKey = searchParams.get('key') || req.headers.get('x-admin-key')
    if (!process.env.ADMIN_INGEST_KEY || adminKey !== process.env.ADMIN_INGEST_KEY) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    if (!CSE_KEY || !CSE_CX) {
      return NextResponse.json({ ok: false, error: 'Missing GOOGLE_CSE_KEY / GOOGLE_CSE_CX' }, { status: 400 })
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 10)
    const q = searchParams.get('q') || `${pick(WORDS_A)} ${pick(WORDS_B)} ${pick(WORDS_C)}`
    const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(
      q,
    )}&num=${limit}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      const t = await res.text()
      return NextResponse.json({ ok: false, error: `CSE ${res.status}`, body: t }, { status: 500 })
    }
    const data = await res.json()
    const items = (data?.items || [])
      .map((it: any) => {
        if (!it?.link) return null
        const normalized = normalizeUrl(it.link)
        let host = ''
        try {
          host = new URL(normalized).host.replace(/^www\./, '')
        } catch {}
        return {
          type: 'web' as const,
          url: normalized,
          title: it.title || host || normalized,
          host,
          lang: 'en',
          tags: [q],
          addedAt: new Date(),
          source: { name: 'Google', url: normalized },
        }
      })
      .filter(Boolean)

    const db = await getDb()
    const col = db.collection('websites')
    await col.createIndex({ url: 1 }, { unique: true })

    let inserted = 0
    for (const doc of items) {
      try {
        await col.updateOne({ url: (doc as any).url }, { $setOnInsert: doc }, { upsert: true })
        inserted++
      } catch {}
    }

    return NextResponse.json({ ok: true, query: q, inserted, total: items.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
