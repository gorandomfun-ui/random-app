export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'

type ItemType = 'video'
function checkKey(req: Request) {
  const reqKey = new URL(req.url).searchParams.get('key')
  return reqKey && reqKey === (process.env.ADMIN_INGEST_KEY || '')
}

/* --------------------------- DB helpers (light) --------------------------- */
let _db: Db | null = null
async function getDbSafe(): Promise<Db | null> {
  try {
    const { MongoClient } = await import('mongodb')
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI
    const dbName = process.env.MONGODB_DB || 'randomdb'
    if (!uri) return null
    if (!_db) {
      const client = new MongoClient(uri)
      await client.connect()
      _db = client.db(dbName)
    }
    return _db
  } catch { return null }
}

async function upsertCache(type: ItemType, key: Record<string, any>, doc: Record<string, any>) {
  const db = await getDbSafe()
  if (!db) return
  try {
    await db.collection('items').updateOne(
      { type, ...key },
      {
        $set: { type, ...key, ...doc, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    )
  } catch {}
}

function extractYouTubeId(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.split('/').pop() || ''
      return id
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      // formats courts (embed, share, etc.)
      const parts = u.pathname.split('/')
      const last = parts.pop() || ''
      if (last && last !== 'watch') return last
    }
  } catch {}
  return ''
}

export async function GET(req: Request) {
  if (!checkKey(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const res = await fetch('https://www.reddit.com/r/funnyvideos/.json?limit=100', { cache: 'no-store' })
    if (!res.ok) throw new Error('reddit-failed')
    const j: any = await res.json()
    const posts: any[] = j?.data?.children?.map((c: any) => c?.data).filter(Boolean) || []

    let inserted = 0
    for (const p of posts) {
      const url: string = p?.url || ''
      if (!url) continue
      if (!/youtu\.be\/|youtube\.com\/watch\?/.test(url)) continue
      const id = extractYouTubeId(url)
      if (!id) continue
      const title = (p?.title || '').toString()
      const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      await upsertCache('video', { videoId: id }, {
        title,
        thumb,
        provider: 'reddit-youtube',
      })
      inserted++
    }

    return NextResponse.json({ ok: true, inserted })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
