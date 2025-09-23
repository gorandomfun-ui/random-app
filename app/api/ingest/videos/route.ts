// app/api/ingest/videos/route.ts
export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'

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

type VideoDoc = {
  type: 'video'
  videoId: string
  url: string
  title?: string
  thumb?: string
  provider?: string
  source?: { name: string; url?: string }
  createdAt?: Date
  updatedAt?: Date
}

async function upsertManyVideos(rows: Omit<VideoDoc,'createdAt'|'updatedAt'>[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  const ops = rows.map(r => ({
    updateOne: {
      filter: { type:'video', videoId: r.videoId },
      update: { $set: { ...r, type:'video', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      upsert: true,
    }
  }))
  const res = await db.collection('items').bulkWrite(ops, { ordered:false })
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 }
}

/* ============== Helpers ============== */
const YT_BASE = 'https://www.googleapis.com/youtube/v3'
const UA = { 'User-Agent': 'RandomAppBot/1.0 (+https://example.com)' }
const norm = (s?: string | null) => (s || '').toString().replace(/\s+/g,' ').trim()
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

async function fetchJson(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache:'no-store', headers: UA, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch { return null } finally { clearTimeout(t) }
}

/* ============== YouTube ============== */
async function ytSearchQueries(queries: string[], per: number, pages: number, days: number) {
  const out: Omit<VideoDoc,'createdAt'|'updatedAt'>[] = []
  const KEY = process.env.YOUTUBE_API_KEY
  if (!KEY) return out
  const publishedAfter = new Date(Date.now() - days*24*3600*1000).toISOString()

  for (const qRaw of queries) {
    const q = qRaw.trim(); if (!q) continue
    let pageToken = ''
    for (let p=0; p<Math.max(1,pages); p++) {
      const params = new URLSearchParams({
        key: KEY, part: 'snippet', type:'video', maxResults: String(Math.min(50, Math.max(1, per))),
        q, order: Math.random()<0.5 ? 'date' : 'relevance', publishedAfter, videoEmbeddable:'true'
      })
      if (pageToken) params.set('pageToken', pageToken)
      const d: any = await fetchJson(`${YT_BASE}/search?${params.toString()}`, 10000)
      const items: any[] = d?.items || []
      for (const it of items) {
        const id = it?.id?.videoId; if (!id) continue
        const sn = it?.snippet || {}
        out.push({ type:'video', videoId:id, url:`https://youtu.be/${id}`, title:norm(sn.title), thumb: ytThumb(id), provider:'youtube', source:{ name:'YouTube', url:`https://youtu.be/${id}` } })
      }
      pageToken = d?.nextPageToken || ''
      if (!pageToken) break
      await new Promise(r=>setTimeout(r, 250))
    }
  }
  return out
}

async function ytPlaylist(playlistId: string, per: number) {
  const out: Omit<VideoDoc,'createdAt'|'updatedAt'>[] = []
  const KEY = process.env.YOUTUBE_API_KEY
  if (!KEY || !playlistId) return out
  let pageToken = ''
  for (let guard=0; guard<10; guard++) {
    const params = new URLSearchParams({ key: KEY, part:'snippet,contentDetails', maxResults:String(Math.min(50, Math.max(1,per))), playlistId })
    if (pageToken) params.set('pageToken', pageToken)
    const d: any = await fetchJson(`${YT_BASE}/playlistItems?${params.toString()}`, 10000)
    const items: any[] = d?.items || []
    for (const it of items) {
      const id = it?.contentDetails?.videoId || it?.snippet?.resourceId?.videoId
      if (!id) continue
      const sn = it?.snippet || {}
      out.push({ type:'video', videoId:id, url:`https://youtu.be/${id}`, title:norm(sn.title), thumb: ytThumb(id), provider:'youtube', source:{ name:'YouTube', url:`https://youtu.be/${id}` } })
    }
    pageToken = d?.nextPageToken || ''
    if (!pageToken) break
    await new Promise(r=>setTimeout(r, 250))
  }
  return out
}

async function ytChannelUploads(channelId: string, per: number) {
  const KEY = process.env.YOUTUBE_API_KEY
  if (!KEY || !channelId) return []
  const d1: any = await fetchJson(`${YT_BASE}/channels?${new URLSearchParams({ key: KEY, part:'contentDetails', id: channelId })}`, 8000)
  const uploads = d1?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return []
  return ytPlaylist(uploads, per)
}

/* ============== Reddit (YT links) ============== */
async function redditYouTube(sub = 'funnyvideos', limit = 40) {
  const out: Omit<VideoDoc,'createdAt'|'updatedAt'>[] = []
  const j: any = await fetchJson(`https://www.reddit.com/r/${encodeURIComponent(sub)}/.json?limit=${Math.min(100, Math.max(5, limit))}`, 8000)
  const posts: any[] = j?.data?.children?.map((c:any)=>c?.data).filter(Boolean) || []
  for (const p of posts) {
    const u = String(p?.url || '')
    if (!/youtu\.be\//i.test(u) && !/youtube\.com\/watch\?/i.test(u)) continue
    let id = ''
    try { const uo = new URL(u); if (uo.hostname.includes('youtu')) id = uo.searchParams.get('v') || uo.pathname.split('/').pop() || '' } catch {}
    if (!id) continue
    out.push({ type:'video', videoId:id, url:`https://youtu.be/${id}`, title:norm(p?.title), thumb: ytThumb(id), provider:'reddit-youtube', source:{ name:'Reddit', url:`https://www.reddit.com${p?.permalink || ''}` } })
  }
  return out
}

/* ============== Handler ============== */
export async function GET(req: NextRequest) {
  // AUTH durcie — autorise les crons Vercel (header x-vercel-cron)
  const isCron = Boolean(req.headers.get('x-vercel-cron'))
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!isCron && (!expectedKey || providedKey !== expectedKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = (req.nextUrl.searchParams.get('mode') || 'search').toLowerCase()
  const per   = Math.max(1, Math.min(50, Number(req.nextUrl.searchParams.get('per') || 20)))
  const pages = Math.max(1, Math.min(5,  Number(req.nextUrl.searchParams.get('pages') || 1)))
  const days  = Math.max(1, Math.min(365,Number(req.nextUrl.searchParams.get('days') || 120)))

  let collected: Omit<VideoDoc,'createdAt'|'updatedAt'>[] = []

  // manual ids
  const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').map(s=>s.trim()).filter(Boolean)
  if (ids.length) collected = collected.concat(ids.map(id => ({ type:'video', videoId:id, url:`https://youtu.be/${id}`, title:'', thumb: ytThumb(id), provider:'manual', source:{ name:'YouTube', url:`https://youtu.be/${id}` } })))

  if (mode === 'search') {
    const def = [
      'absurd short film','street food recipe','playful diy project','retro dance performance','chaotic talent show'
    ]
    const queries = (req.nextUrl.searchParams.get('q') || '').split(',').map(s=>s.trim()).filter(Boolean)
    const q = queries.length ? queries : def
    try { collected = collected.concat(await ytSearchQueries(q, per, pages, days)) } catch {}
  } else if (mode === 'playlist') {
    const playlistId = String(req.nextUrl.searchParams.get('playlistId') || '')
    if (playlistId) { try { collected = collected.concat(await ytPlaylist(playlistId, per)) } catch {} }
  } else if (mode === 'channel') {
    const channelId = String(req.nextUrl.searchParams.get('channelId') || '')
    if (channelId) { try { collected = collected.concat(await ytChannelUploads(channelId, per)) } catch {} }
  }

  const useReddit = (req.nextUrl.searchParams.get('reddit') || '0') === '1'
  if (useReddit) {
    const sub = req.nextUrl.searchParams.get('sub') || 'funnyvideos'
    const limit = Math.max(5, Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 40)))
    try { collected = collected.concat(await redditYouTube(sub, limit)) } catch {}
  }

  const map = new Map<string, Omit<VideoDoc,'createdAt'|'updatedAt'>>()
  for (const v of collected) if (v.videoId && !map.has(v.videoId)) map.set(v.videoId, v)
  const unique = Array.from(map.values())

  let result = { inserted: 0, updated: 0 }
  try { result = await upsertManyVideos(unique) } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'bulkWrite failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mode, scanned: collected.length, unique: unique.length, ...result })
}
