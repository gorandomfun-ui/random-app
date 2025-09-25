export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { DEFAULT_INGEST_HEADERS, fetchJson } from '@/lib/ingest/http'

/* ---------- DB helpers (identiques au style des autres ingests) ---------- */
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

type WebSource = { name: string; url?: string }

type WebDoc = {
  type: 'web',
  url: string,
  title?: string,
  text?: string,
  host?: string,
  ogImage?: string | null,
  provider?: string, // 'google-cse'
  source?: WebSource,
  tags?: string[],
  keywords?: string[],
  createdAt?: Date,
  updatedAt?: Date,
}

async function upsertManyWeb(rows: Omit<WebDoc,'createdAt'|'updatedAt'>[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  const ops = rows.map(r => ({
    updateOne: {
      filter: { type: 'web', url: r.url },
      update: {
        $set: { ...r, type: 'web', updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    }
  }))
  const res = await db.collection('items').bulkWrite(ops, { ordered: false })
  return { inserted: res.upsertedCount || 0, updated: res.modifiedCount || 0 }
}

const ROUTE_HEADERS: HeadersInit = {
  ...DEFAULT_INGEST_HEADERS,
  'User-Agent': 'RandomAppBot/1.0 (+https://random.app)',
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function deriveKeywords(value: string, limit = 8): string[] {
  if (!value) return []
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && word.length <= 18)

  const out: string[] = []
  for (const word of words) {
    if (!out.includes(word)) out.push(word)
    if (out.length >= limit) break
  }
  return out
}

function normalizeStrings(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : typeof entry === 'number' ? String(entry) : ''))
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.toLowerCase())
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  }
  return []
}

type WebRow = Omit<WebDoc, 'createdAt' | 'updatedAt'>

/* ------------------------------- OG fetcher ------------------------------ */
async function fetchOgImage(link: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1500)
    const res = await fetch(link, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (RandomApp Bot)' },
    })
    clearTimeout(t)
    if (!res.ok) return null
    const html = await res.text()
    const m1 = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    const m2 = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    const img = m1 || m2 || /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]
    if (!img) return null
    try { return new URL(img, link).toString() } catch { return img }
  } catch { return null }
}

function dedupeByUrl<T extends { url: string }>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of rows) {
    if (!row?.url) continue
    if (!map.has(row.url)) map.set(row.url, row)
  }
  return Array.from(map.values())
}

function dedupeRowsWithOg(rows: WebRow[]): WebRow[] {
  const map = new Map<string, WebRow>()
  for (const row of rows) {
    if (!row.url || !row.ogImage) continue
    if (!map.has(row.url)) map.set(row.url, row)
  }
  return Array.from(map.values())
}

async function ensureOgImages(rows: WebRow[], limit: number): Promise<{ rows: WebRow[]; checked: number }> {
  const out: WebRow[] = []
  let checked = 0
  for (const row of rows) {
    if (!row.url) continue
    checked += 1
    let og = row.ogImage || null
    if (!og) og = await fetchOgImage(row.url)
    if (!og) continue
    out.push({ ...row, ogImage: og })
    if (out.length >= limit) break
  }
  return { rows: out, checked }
}

/* --------------------------------- CSE ---------------------------------- */
type GoogleCSEItem = { link?: string; title?: string; snippet?: string }
type GoogleCSEResponse = { items?: GoogleCSEItem[] }

type ProviderResult = { rows: WebRow[]; scanned: number; checked: number }

async function runGoogleCSE(queries: string[], per: number, pages: number, limit: number): Promise<ProviderResult> {
  const KEY = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_API_KEY
  const CX  = process.env.GOOGLE_CSE_CX  || process.env.GOOGLE_CSE_ID
  if (!KEY || !CX) return { rows: [], scanned: 0, checked: 0 }

  const raw: WebRow[] = []
  for (const rawQuery of queries) {
    const q = rawQuery.trim()
    if (!q) continue
    for (let p = 0; p < pages; p++) {
      const start = 1 + p * per
      const url = `https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CX}&q=${encodeURIComponent(q)}&num=${per}&start=${start}&safe=off`
      try {
        const data = await fetchJson<GoogleCSEResponse>(url, { headers: ROUTE_HEADERS, timeoutMs: 10000 })
        const items = Array.isArray(data?.items) ? data?.items ?? [] : []
        for (const it of items) {
          const link = it?.link?.trim()
          if (!link) continue
          const host = hostFromUrl(link)
          const title = (it?.title || '').trim() || host || link
          const snippet = (it?.snippet || '').trim()
          const descriptor = `${title} ${snippet}`
          const keywords = deriveKeywords(descriptor, 7)
          const tags = Array.from(new Set([host, 'search'])).filter(Boolean)
          raw.push({
            type: 'web',
            url: link,
            title,
            text: snippet || title,
            host,
            ogImage: null,
            provider: 'google-cse',
            source: { name: host || 'Google Custom Search', url: link },
            tags,
            keywords,
          })
        }
      } catch { /* ignore */ }
    }
  }

  const deduped = dedupeByUrl(raw)
  const { rows, checked } = await ensureOgImages(deduped, limit)
  return { rows, scanned: raw.length, checked }
}

type NeocitiesListResponse = {
  result?: string
  sites?: Array<{
    sitename?: string
    description?: string
    tags?: unknown
    url?: string
    views?: number
    updated_at?: string
  }>
}

async function pullNeocities(limit: number): Promise<ProviderResult> {
  const response = await fetchJson<NeocitiesListResponse>('https://neocities.org/api/list?t=' + Date.now(), {
    headers: ROUTE_HEADERS,
    timeoutMs: 10000,
  })
  const sites = Array.isArray(response?.sites) ? response?.sites ?? [] : []
  if (!sites.length) return { rows: [], scanned: 0, checked: 0 }

  const raw: WebRow[] = []
  for (const site of shuffle(sites)) {
    if (!site) continue
    const name = typeof site.sitename === 'string' ? site.sitename.trim() : ''
    if (!name) continue
    const link = site.url && typeof site.url === 'string' && site.url.startsWith('http')
      ? site.url.trim()
      : `https://${name}.neocities.org`
    const host = hostFromUrl(link)
    if (!host) continue
    const description = typeof site.description === 'string' ? site.description.trim() : ''
    const title = description ? `${name} — ${description}` : `${name}.neocities.org`
    const sitePage = `https://neocities.org/site/${encodeURIComponent(name)}`
    const tags = Array.from(new Set([
      ...normalizeStrings(site.tags),
      'neocities',
      'retro',
      host,
    ])).filter(Boolean)
    const keywords = deriveKeywords(`${name} ${description}`, 8)
    raw.push({
      type: 'web',
      url: link,
      title,
      text: description || title,
      host,
      ogImage: null,
      provider: 'neocities',
      source: { name: 'Neocities', url: sitePage },
      tags,
      keywords,
    })
  }

  const deduped = dedupeByUrl(raw)
  const { rows, checked } = await ensureOgImages(deduped, limit)
  return { rows, scanned: raw.length, checked }
}

type ArchiveSearchDoc = {
  identifier?: string
  title?: string
  description?: string
  originalurl?: string
  original?: string
  subject?: unknown
  creator?: unknown
}

type ArchiveSearchResponse = {
  response?: { docs?: ArchiveSearchDoc[] }
}

async function pullArchiveOrg(limit: number): Promise<ProviderResult> {
  const query = 'collection:(geocities OR webring OR archiveteam_geocities) AND mediatype:web'
  const fetchRows = Math.min(200, Math.max(limit * 4, 40))
  const url = `https://archive.org/advancedsearch.php?output=json&q=${encodeURIComponent(query)}&rows=${fetchRows}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=originalurl&fl[]=subject&sort[]=downloads+desc`

  const data = await fetchJson<ArchiveSearchResponse>(url, { headers: ROUTE_HEADERS, timeoutMs: 12000 })
  const docs = Array.isArray(data?.response?.docs) ? data?.response?.docs ?? [] : []
  if (!docs.length) return { rows: [], scanned: 0, checked: 0 }

  const raw: WebRow[] = []
  for (const doc of shuffle(docs)) {
    if (!doc) continue
    const identifier = typeof doc.identifier === 'string' ? doc.identifier.trim() : ''
    const itemUrl = identifier ? `https://archive.org/details/${identifier}` : ''
    const target = itemUrl || (typeof doc.originalurl === 'string' ? doc.originalurl.trim() : '') || (typeof doc.original === 'string' ? doc.original.trim() : '')
    if (!target) continue
    const host = hostFromUrl(target)
    const title = (doc.title || '').trim() || (host ? `Internet Archive — ${host}` : target)
    const description = (doc.description || '').trim()
    const subjectTags = normalizeStrings(doc.subject)
    const tags = Array.from(new Set([...subjectTags, 'archive', 'webring', host].filter(Boolean)))
    const keywords = deriveKeywords(`${title} ${description}`, 10)
    raw.push({
      type: 'web',
      url: target,
      title,
      text: description || title,
      host,
      ogImage: null,
      provider: 'archive-webring',
      source: { name: 'Internet Archive', url: itemUrl || target },
      tags,
      keywords,
    })
  }

  const deduped = dedupeByUrl(raw)
  const ensured = await ensureOgImages(deduped, limit)
  return { rows: ensured.rows, scanned: raw.length, checked: ensured.checked }
}

/* -------------------------------- Handler -------------------------------- */
export async function GET(req: NextRequest) {
  // Auth (clé ou cron Vercel)
  const isCron = Boolean(req.headers.get('x-vercel-cron'))
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || ''
  if (!isCron && (!process.env.ADMIN_INGEST_KEY || key !== process.env.ADMIN_INGEST_KEY)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const per   = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get('per') || 10)))
  const pages = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get('pages') || 3)))
  const incoming = (req.nextUrl.searchParams.get('q') || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const fallback = [
    'weird interactive site','dessert recipe blog','late night advice column','hidden travel diary','odd fashion zine'
  ]
  const queries = incoming.length ? incoming : fallback

  const providersParam = (req.nextUrl.searchParams.get('providers') || 'cse,neocities,archive')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const allowedProviders = new Set(['cse', 'neocities', 'archive'])
  const requestedProviders = providersParam.filter((value) => allowedProviders.has(value))
  const providers = requestedProviders.length ? requestedProviders : ['cse', 'neocities', 'archive']

  const limitParam = Number(req.nextUrl.searchParams.get('limit') || 0)
  const baseTarget = Math.max(12, per * pages * queries.length)
  const totalTarget = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.max(8, Math.floor(limitParam)), 200)
    : Math.min(baseTarget, 200)
  const perProviderTarget = Math.max(5, Math.ceil(totalTarget / providers.length))

  const aggregated: WebRow[] = []
  let scanned = 0
  let checked = 0

  if (providers.includes('cse')) {
    try {
      const result = await runGoogleCSE(queries, per, pages, perProviderTarget)
      aggregated.push(...result.rows)
      scanned += result.scanned
      checked += result.checked
    } catch {}
  }

  if (providers.includes('neocities')) {
    try {
      const result = await pullNeocities(perProviderTarget)
      aggregated.push(...result.rows)
      scanned += result.scanned
      checked += result.checked
    } catch {}
  }

  if (providers.includes('archive')) {
    try {
      const result = await pullArchiveOrg(perProviderTarget)
      aggregated.push(...result.rows)
      scanned += result.scanned
      checked += result.checked
    } catch {}
  }

  const deduped = dedupeRowsWithOg(aggregated)
  const providerCounts: Record<string, number> = {}
  for (const row of deduped) {
    const name = row.provider || 'web'
    providerCounts[name] = (providerCounts[name] || 0) + 1
  }

  try {
    const { inserted, updated } = await upsertManyWeb(deduped)
    return NextResponse.json({
      ok: true,
      providers,
      providerCounts,
      queries,
      per,
      pages,
      limit: totalTarget,
      scanned,
      checked,
      unique: deduped.length,
      inserted,
      updated,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'ingest web failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
