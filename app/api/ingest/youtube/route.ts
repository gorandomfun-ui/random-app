// ==============================================
// File: app/api/ingest/videos/route.ts — FULL
// ==============================================
// Ingest YouTube videos (Search / Playlist / Channel) + Reddit (YT links)
// Upserts into MongoDB collection `items` with type: 'video'.
//
// Usage examples (local):
//   /api/ingest/videos?key=ADMIN_INGEST_KEY&mode=search&q=weird,retro,lofi&per=20&pages=2&days=120
//   /api/ingest/videos?key=ADMIN_INGEST_KEY&mode=playlist&playlistId=PLxxxxxx&per=50
//   /api/ingest/videos?key=ADMIN_INGEST_KEY&mode=channel&channelId=UCxxxxxx&per=50
//   /api/ingest/videos?key=ADMIN_INGEST_KEY&reddit=1&sub=funnyvideos&limit=40
//   /api/ingest/videos?key=ADMIN_INGEST_KEY&ids=VIDEOID1,VIDEOID2  (manual add)
//
// Notes:
//  - Requires YOUTUBE_API_KEY for YouTube calls (skips gracefully if missing).
//  - Adds provider: 'youtube' | 'reddit-youtube' | 'manual'.
//  - De-duplicates in-memory via videoId and in DB via upsert on { videoId }.

export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'

// ---------------------------- DB helpers ----------------------------------
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

async function upsertManyVideos(rows: Omit<VideoDoc, 'createdAt'|'updatedAt'>[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  const ops = rows.map(r => ({
    updateOne: {
      filter: { type: 'video', videoId: r.videoId },
      update: {
        $set: { ...r, type: 'video', updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }))
  const res = await db.collection('items').bulkWrite(ops, { ordered: false })
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 }
}

// ---------------------------- Helpers -------------------------------------
const YT_BASE = 'https://www.googleapis.com/youtube/v3'
const UA = { 'User-Agent': 'RandomAppBot/1.0 (+https://example.com)' }

function norm(s?: string | null) { return (s || '').toString().replace(/\s+/g, ' ').trim() }

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', headers: UA, signal: ctrl.signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function ytThumb(id: string) { return `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }

type YoutubeSearchItem = {
  id?: { videoId?: string }
  snippet?: { title?: string }
}

type YoutubeSearchResponse = {
  items?: YoutubeSearchItem[]
  nextPageToken?: string
}

// ---------------------------- YouTube: Search ------------------------------
async function ytSearchQueries(queries: string[], per: number, pages: number, days: number) {
  const out: Omit<VideoDoc, 'createdAt'|'updatedAt'>[] = []
  const KEY = process.env.YOUTUBE_API_KEY
  if (!KEY) return out

  const publishedAfter = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  for (const qRaw of queries) {
    const q = qRaw.trim()
    if (!q) continue
    let pageToken = ''
    for (let p = 0; p < Math.max(1, pages); p++) {
      const params = new URLSearchParams({
        key: KEY,
        part: 'snippet',
        type: 'video',
        maxResults: String(Math.min(50, Math.max(1, per))),
        q,
        order: Math.random() < 0.5 ? 'date' : 'relevance',
        publishedAfter,
        videoEmbeddable: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const url = `${YT_BASE}/search?${params.toString()}`
      const data = await fetchJson<YoutubeSearchResponse>(url, 10000)
      const items = data?.items ?? []
      for (const it of items) {
        const id = it?.id?.videoId
        if (!id) continue
        const sn = it?.snippet || {}
        out.push({
          type: 'video',
          videoId: id,
          url: `https://youtu.be/${id}`,
          title: norm(sn.title),
          thumb: ytThumb(id),
          provider: 'youtube',
          source: { name: 'YouTube', url: `https://youtu.be/${id}` },
        })
      }
      pageToken = data?.nextPageToken || ''
      if (!pageToken) break
      await new Promise(r => setTimeout(r, 250))
    }
  }
  return out
}

type YoutubePlaylistItem = {
  contentDetails?: { videoId?: string }
  snippet?: { resourceId?: { videoId?: string }; title?: string }
}

type YoutubePlaylistResponse = {
  items?: YoutubePlaylistItem[]
  nextPageToken?: string
}

// ---------------------------- YouTube: Playlist ---------------------------
async function ytPlaylist(playlistId: string, per: number) {
  const out: Omit<VideoDoc, 'createdAt'|'updatedAt'>[] = []
  const KEY = process.env.YOUTUBE_API_KEY
  if (!KEY || !playlistId) return out

  let pageToken = ''
  for (let guard = 0; guard < 10; guard++) {
    const params = new URLSearchParams({
      key: KEY,
      part: 'snippet,contentDetails',
      maxResults: String(Math.min(50, Math.max(1, per))),
      playlistId,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `${YT_BASE}/playlistItems?${params.toString()}`
    const data = await fetchJson<YoutubePlaylistResponse>(url, 10000)
    const items = data?.items ?? []
    for (const it of items) {
      const id = it?.contentDetails?.videoId || it?.snippet?.resourceId?.videoId
      if (!id) continue
      const sn = it?.snippet || {}
      out.push({
        type: 'video',
        videoId: id,
        url: `https://youtu.be/${id}`,
        title: norm(sn.title),
        thumb: ytThumb(id),
        provider: 'youtube',
        source: { name: 'YouTube', url: `https://youtu.be/${id}` },
      })
    }
    pageToken = data?.nextPageToken || ''
    if (!pageToken) break
    await new Promise(r => setTimeout(r, 250))
  }
  return out
}

type YoutubeChannelResponse = {
  items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
}

// ---------------------------- YouTube: Channel uploads --------------------
async function ytChannelUploads(channelId: string, per: number) {
  const out: Omit<VideoDoc, 'createdAt'|'updatedAt'>[] = []
  const KEY = process.env.YOUTUBE_API_KEY
  if (!KEY || !channelId) return out

  const detailUrl = `${YT_BASE}/channels?${new URLSearchParams({ key: KEY, part: 'contentDetails', id: channelId })}`
  const details = await fetchJson<YoutubeChannelResponse>(detailUrl, 8000)
  const uploads = details?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return out
  return ytPlaylist(uploads, per)
}

// ---------------------------- Reddit (YouTube links) ----------------------
type RedditPost = {
  data?: {
    url?: string
    title?: string
    permalink?: string
  }
}

type RedditListing = {
  data?: {
    children?: RedditPost[]
  }
}

async function redditYouTube(sub = 'funnyvideos', limit = 40) {
  const out: Omit<VideoDoc, 'createdAt'|'updatedAt'>[] = []
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/.json?limit=${Math.min(100, Math.max(5, limit))}`
  const listing = await fetchJson<RedditListing>(url, 8000)
  const posts = listing?.data?.children?.map((child) => child?.data).filter((entry): entry is { url?: string; title?: string; permalink?: string } => Boolean(entry)) || []
  for (const p of posts) {
    const u = String(p?.url || '')
    if (!/youtu\.be\//i.test(u) && !/youtube\.com\/watch\?/i.test(u)) continue
    let id = ''
    try {
      const uo = new URL(u)
      if (uo.hostname.includes('youtu')) id = uo.searchParams.get('v') || uo.pathname.split('/').pop() || ''
    } catch {}
    if (!id) continue
    out.push({
      type: 'video',
      videoId: id,
      url: `https://youtu.be/${id}`,
      title: norm(p?.title),
      thumb: ytThumb(id),
      provider: 'reddit-youtube',
      source: { name: 'Reddit', url: `https://www.reddit.com${p?.permalink || ''}` },
    })
  }
  return out
}

// ---------------------------- Handler -------------------------------------
export async function GET(req: NextRequest) {
  // Auth
  const key = req.nextUrl.searchParams.get('key') || ''
  if (!process.env.ADMIN_INGEST_KEY || key !== process.env.ADMIN_INGEST_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const mode = (req.nextUrl.searchParams.get('mode') || 'search').toLowerCase()

  // Common params
  const per = Math.max(1, Math.min(50, Number(req.nextUrl.searchParams.get('per') || 20)))
  const pages = Math.max(1, Math.min(5, Number(req.nextUrl.searchParams.get('pages') || 1)))
  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days') || 120)))

  let collected: Omit<VideoDoc, 'createdAt'|'updatedAt'>[] = []

  // Manual IDs
  const idsRaw = (req.nextUrl.searchParams.get('ids') || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (idsRaw.length) {
    collected = collected.concat(idsRaw.map(id => ({
      type: 'video', videoId: id, url: `https://youtu.be/${id}`, title: '', thumb: ytThumb(id), provider: 'manual', source: { name: 'YouTube', url: `https://youtu.be/${id}` }
    })))
  }

  // YouTube
  if (mode === 'search') {
    const DEFAULT_QUERIES = [
      'weird vintage', 'obscure retro', 'lofi session', 'vhs concert', 'tiny desk cover',
      'street performance choir', 'found footage music', 'school recital', 'basement show', 'toy orchestra',
    ]
    const queries = (req.nextUrl.searchParams.get('q') || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const q = queries.length ? queries : DEFAULT_QUERIES
    try { const a = await ytSearchQueries(q, per, pages, days); collected = collected.concat(a) } catch {}
  } else if (mode === 'playlist') {
    const playlistId = String(req.nextUrl.searchParams.get('playlistId') || '')
    if (playlistId) { try { const a = await ytPlaylist(playlistId, per); collected = collected.concat(a) } catch {} }
  } else if (mode === 'channel') {
    const channelId = String(req.nextUrl.searchParams.get('channelId') || '')
    if (channelId) { try { const a = await ytChannelUploads(channelId, per); collected = collected.concat(a) } catch {} }
  }

  // Reddit (optional) — turned on by &reddit=1
  const useReddit = (req.nextUrl.searchParams.get('reddit') || '0') === '1'
  if (useReddit) {
    const sub = req.nextUrl.searchParams.get('sub') || 'funnyvideos'
    const limit = Math.max(5, Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 40)))
    try { const a = await redditYouTube(sub, limit); collected = collected.concat(a) } catch {}
  }

  // Deduplicate in-memory by videoId
  const map = new Map<string, Omit<VideoDoc, 'createdAt'|'updatedAt'>>()
  for (const v of collected) if (v.videoId && !map.has(v.videoId)) map.set(v.videoId, v)
  const unique = Array.from(map.values())

  // Upsert to DB
  let result = { inserted: 0, updated: 0 }
  try {
    result = await upsertManyVideos(unique)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'bulkWrite failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mode, scanned: collected.length, unique: unique.length, ...result })
}


// ==============================================
// File: vercel.json — place at project root
// ==============================================
// Three scheduled crons: QUOTES, FACTS, VIDEOS
// - Replace %ADMIN_INGEST_KEY% by your env var value in Vercel UI (or keep and set same named secret)
// - You can tweak schedules (UTC) and parameters to your taste
/*
{
  "crons": [
    {
      "path": "/api/ingest/quotes?key=%ADMIN_INGEST_KEY%&pages=5&sites=toscrape,typefit,passiton,brainyquote,goodreads,azquotes,quoteslyfe",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/ingest/facts?key=%ADMIN_INGEST_KEY%&n=80&sites=useless,numbers,cat,meow,dog",
      "schedule": "30 3 * * *"
    },
    {
      "path": "/api/ingest/videos?key=%ADMIN_INGEST_KEY%&mode=search&q=weird%20vintage,obscure%20retro,lofi%20session,vhs%20concert,street%20performance%20choir,found%20footage%20music,school%20recital,basement%20show&per=25&pages=2&days=180&reddit=1&sub=funnyvideos&limit=40",
      "schedule": "0 4 * * *"
    }
  ]
}
*/
