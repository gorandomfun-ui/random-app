export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { looksMerchant } from '@/lib/v3/web/linkCheck'
import { boringWebReason } from '@/lib/v3/web/quality'
import { hnNextPage, hnQueries, hnSearchUrl, hnSite, type HnHit } from '@/lib/v3/web/hackerNews'
import { adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'
import type { Db } from 'mongodb'
import { DEFAULT_INGEST_HEADERS, fetchJson } from '@/lib/ingest/http'
import probe from 'probe-image-size'
import { generateKeywordCombo } from '@/lib/ingest/keywords/combo'
import { buildRegionalQuery, resolveRegionKey, type RegionKey } from '@/lib/ingest/keywords/regionPools'
import { CURATED_WEB_SOURCES, type CuratedWebSource } from '@/lib/ingest/sources/webCurated'
import { enqueueSites, type CandidateInput } from '@/lib/v3/web/candidates'
import { reserveCseSearch } from '@/lib/v3/web/cseQuota'
import { frontPageOf } from '@/lib/v3/web/quality'
import { upsertWebRows } from '@/lib/v3/web/store'
import { worldWebQueries, type WorldQuery } from '@/lib/v3/web/worldQueries'

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
  rand?: number,
  webImageValidatedAt?: Date,
  webImageValidation?: { width: number; height: number },
}

type WebRow = Omit<WebDoc, 'createdAt' | 'updatedAt'> & { imageMeta?: { width: number; height: number } }

async function upsertManyWeb(rows: WebRow[]) {
  const db = await getDbSafe()
  if (!db || !rows.length) return { inserted: 0, updated: 0 }
  // Same labels as the automatic ingestion: content added from the local
  // panel must be eligible for a Wave like everything else.
  return upsertWebRows(db, rows)
}

async function enqueue(rows: CandidateInput[]): Promise<number> {
  const db = await getDbSafe()
  if (!db || !rows.length) return 0
  return (await enqueueSites(db, rows)).queued
}

const ROUTE_HEADERS: HeadersInit = {
  ...DEFAULT_INGEST_HEADERS,
  'User-Agent': 'RandomAppBot/1.0 (+https://random.app)',
}

const NEGATIVE_QUERY_SUFFIX = '-reddit -forum -forums -thread -threads -discord -stackexchange -stackoverflow -subreddit -tapatalk -4chan';
const BLOCKED_HOST_SUBSTRINGS = [
  'reddit.com',
  'discord.com',
  'discord.gg',
  'stackexchange.com',
  'stackoverflow.com',
  'stackprinter.appspot.com',
  'steamcommunity.com',
  'tapatalk.com',
  '4chan.org',
  '8kun.top',
  'quora.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'pinterest.com',
  'cnn.com',
  'nytimes.com',
  'washingtonpost.com',
  'bbc.co.uk',
  'theguardian.com',
  'lemonde.fr',
  'reuters.com',
  'apnews.com',
  'bloomberg.com',
  'forbes.com',
  'foxnews.com',
  'huffpost.com',
] as const;

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /(^|\.)forums?\./i,
  /(^|\.)community\./i,
  /(^|\.)board\./i,
  /(^|\.)bbs\./i,
  /(^|\.)mail-archive\.com$/i,
  /(^|\.)groups\.google\.com$/i,
];

const FORUM_KEYWORDS_REGEX = /\b(forum|thread|threads|subreddit|discord|community board|message board)\b/i;
const MAX_PAGES_PER_DOMAIN = 2
const MIN_IMAGE_WIDTH = 500
const MIN_IMAGE_HEIGHT = 280
const MIN_IMAGE_AREA = 150_000
const MIN_IMAGE_BYTES = 15_000
const MIN_ASPECT_RATIO = 0.35
const MAX_ASPECT_RATIO = 3.2

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

const REGION_GL_MAP: Partial<Record<RegionKey, string>> = {
  'north-america': 'us',
  'south-america': 'br',
  europe: 'fr',
  asia: 'sg',
  africa: 'za',
}

function isHostBlocked(host: string): boolean {
  if (!host) return false
  const lower = host.toLowerCase()
  for (const token of BLOCKED_HOST_SUBSTRINGS) {
    if (lower.includes(token)) return true
  }
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(lower)) return true
  }
  return false
}

function isLikelyForum(row: Pick<WebRow, 'url' | 'title' | 'text' | 'host'>): boolean {
  const haystack = `${row.host || ''} ${row.title || ''} ${row.text || ''} ${row.url || ''}`
  return FORUM_KEYWORDS_REGEX.test(haystack)
}

/**
 * `judged`: whether the page must also be a site worth a draw
 * (lib/v3/web/quality.ts) — a product, an article, a menu or, from Google, a
 * single page deep inside some site is refused. The hand-picked list is not
 * judged: it was chosen one by one.
 */
function filterBlockedRows(rows: WebRow[], judged = true): { rows: WebRow[]; filtered: number } {
  if (!rows.length) return { rows: [], filtered: 0 }
  const out: WebRow[] = []
  let filtered = 0
  for (const row of rows) {
    const host = row?.host || hostFromUrl(row?.url || '')
    if (isHostBlocked(host) || isLikelyForum({ ...row, host }) || looksMerchant(row.url)
      || (judged && boringWebReason(row.url, row.title, row.provider))) {
      filtered += 1
      continue
    }
    out.push({ ...row, host })
  }
  return { rows: out, filtered }
}

function limitRowsByDomain(rows: WebRow[], perDomain: number): WebRow[] {
  if (!rows.length || perDomain <= 0) return []
  const out: WebRow[] = []
  const counts = new Map<string, number>()
  for (const row of rows) {
    const host = row.host || hostFromUrl(row.url || '')
    const count = counts.get(host) || 0
    if (count >= perDomain) continue
    counts.set(host, count + 1)
    out.push(row)
  }
  return out
}

/* ------------------------------- OG fetcher ------------------------------ */
async function fetchOgImage(link: string, timeoutMs = 1500): Promise<string | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(link, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (RandomApp Bot)' },
    })
    clearTimeout(t)
    if (!res.ok) return null
    const html = await res.text()
    const m1 = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
      || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)?.[1]
    const m2 = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
      || /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i.exec(html)?.[1]
    const img = m1 || m2 || /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]
    if (!img) return null
    try { return new URL(img, link).toString() } catch { return img }
  } catch { return null }
}

function isValidImageUrl(url: string | null | undefined): url is string {
  if (typeof url !== 'string') return false
  if (!/^https?:\/\//i.test(url)) return false
  const lower = url.toLowerCase()
  if (lower.startsWith('data:')) return false
  const EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']
  if (!EXT.some((ext) => lower.includes(ext))) return false
  return true
}

const PICTURE_TYPES = new Set(['jpg', 'png', 'gif', 'webp', 'avif'])

async function validateRemoteImage(url: string): Promise<{ url: string; width: number; height: number } | null> {
  try {
    const result = await probe(url, { timeout: 4500 })
    if (!result?.width || !result?.height) return null
    if (result.type && !PICTURE_TYPES.has(result.type)) return null
    const { width, height } = result
    if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) return null
    if (width * height < MIN_IMAGE_AREA) return null
    const ratio = width / height
    if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) return null
    const length = Number(result.length || 0)
    if (Number.isFinite(length) && length > 0 && length < MIN_IMAGE_BYTES) return null
    const resolvedUrl = typeof result.url === 'string' && result.url.startsWith('http') ? result.url : url
    return { url: resolvedUrl, width, height }
  } catch (error) {
    return null
  }
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

/**
 * `patient`: small personal sites answer slower than 1.5 s from a server and
 * often serve their preview from an address without a file extension (an
 * image service); the image itself is still probed for its type and size.
 */
async function ensureOgImages(
  rows: WebRow[],
  limit: number,
  concurrency = 6,
  patient = false,
): Promise<{ rows: WebRow[]; checked: number; failed: number; refused: WebRow[] }> {
  if (!rows.length || limit <= 0) return { rows: [], checked: 0, failed: 0, refused: [] }
  const out: WebRow[] = []
  const refused: WebRow[] = []
  let checked = 0
  let failed = 0
  let index = 0
  const workers = Math.max(1, Math.min(concurrency, rows.length))

  async function worker() {
    while (index < rows.length && out.length < limit) {
      const current = rows[index++]
      if (!current?.url) continue
      checked += 1
      let og = current.ogImage || null
      if (!og) og = await fetchOgImage(current.url, patient ? 5000 : 1500)
      if (!(isValidImageUrl(og) || (patient && typeof og === 'string' && /^https:\/\//i.test(og)))) {
        failed += 1
        refused.push(current)
        continue
      }
      const meta = await validateRemoteImage(og)
      if (!meta) {
        failed += 1
        refused.push(current)
        continue
      }
      if (out.length >= limit) break
      out.push({ ...current, ogImage: meta.url, imageMeta: { width: meta.width, height: meta.height } })
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return { rows: out.slice(0, limit), checked, failed, refused }
}

/* --------------------------------- CSE ---------------------------------- */
type GoogleCSEItem = { link?: string; title?: string; snippet?: string }
type GoogleCSEResponse = { items?: GoogleCSEItem[] }

type ProviderResult = {
  rows: WebRow[]
  scanned: number
  checked: number
  filtered?: number
  ogFailed?: number
  /** Sent to the server's preview line instead (lib/v3/web/candidates.ts). */
  queued?: number
  searches?: number
}

/**
 * Google's results never go straight into the catalogue any more: each one is
 * kept as the page itself when it is worth it (a front page, a curious page),
 * or as the front page of its site otherwise, and waits for the server to
 * visit it and make its preview. At most CSE_DAILY_FREE searches a day: free.
 */
async function runGoogleCSE(queries: Array<string | WorldQuery>, per: number, pages: number, region: RegionKey, dryRun = false): Promise<ProviderResult> {
  const KEY = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_API_KEY
  const CX  = process.env.GOOGLE_CSE_CX  || process.env.GOOGLE_CSE_ID
  const db = await getDbSafe()
  if (!KEY || !CX || !db) return { rows: [], scanned: 0, checked: 0 }

  const found: CandidateInput[] = []
  let scanned = 0
  let filteredLocal = 0
  let searches = 0
  search: for (const entry of queries) {
    const query = typeof entry === 'string' ? { q: entry.trim(), gl: REGION_GL_MAP[region] } : entry
    if (!query.q) continue
    for (let p = 0; p < pages; p++) {
      if (!(await reserveCseSearch(db))) break search
      searches += 1
      const url = new URL('https://www.googleapis.com/customsearch/v1')
      url.searchParams.set('key', KEY)
      url.searchParams.set('cx', CX)
      url.searchParams.set('q', `${query.q} ${NEGATIVE_QUERY_SUFFIX}`.trim())
      url.searchParams.set('num', String(per))
      url.searchParams.set('start', String(1 + p * per))
      url.searchParams.set('safe', 'off')
      if (query.gl) url.searchParams.set('gl', query.gl)
      if ('lr' in query && query.lr) url.searchParams.set('lr', query.lr)
      try {
        const data = await fetchJson<GoogleCSEResponse>(url.toString(), { headers: ROUTE_HEADERS, timeoutMs: 10000 })
        const items = Array.isArray(data?.items) ? data?.items ?? [] : []
        scanned += items.length
        for (const it of items) {
          const link = it?.link?.trim()
          if (!link) continue
          const host = hostFromUrl(link)
          const title = (it?.title || '').trim()
          const snippet = (it?.snippet || '').trim()
          if (isHostBlocked(host) || isLikelyForum({ url: link, title, text: snippet, host })) {
            filteredLocal += 1
            continue
          }
          const keep = !boringWebReason(link, title, 'google-cse')
          const site = keep ? link : frontPageOf(link)
          if (!site) {
            filteredLocal += 1
            continue
          }
          found.push({
            url: site,
            source: 'google-cse',
            // The front page's own name is read on the visit; a kept page keeps what Google called it.
            ...(keep ? { title, text: snippet || title } : {}),
            tags: [query.q],
          })
        }
      } catch { /* ignore */ }
    }
  }
  const queued = dryRun ? 0 : (await enqueueSites(db, found)).queued
  return { rows: [], scanned, checked: 0, filtered: filteredLocal, queued, searches }
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

async function pullNeocities(limit: number, requireOg = true): Promise<ProviderResult> {
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

  const { rows: filteredRows, filtered } = filterBlockedRows(dedupeByUrl(raw))
  const limited = limitRowsByDomain(filteredRows, MAX_PAGES_PER_DOMAIN)
  if (!requireOg) {
    return { rows: limited.slice(0, limit), scanned: raw.length, checked: limited.length, filtered: filtered + (filteredRows.length - limited.length) }
  }

  const ensured = await ensureOgImages(limited, limit)
  return { rows: ensured.rows, scanned: raw.length, checked: ensured.checked, filtered: filtered + (filteredRows.length - limited.length), ogFailed: ensured.failed }
}

type WikipediaExternalLinksResponse = {
  parse?: {
    externallinks?: unknown
  }
}

async function pullWikipediaList(limit: number, requireOg = true): Promise<ProviderResult> {
  const data = await fetchJson<WikipediaExternalLinksResponse>(
    'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_websites&prop=externallinks&format=json',
    { headers: ROUTE_HEADERS, timeoutMs: 10000 },
  )
  const rawLinks = Array.isArray(data?.parse?.externallinks) ? data?.parse?.externallinks ?? [] : []
  if (!rawLinks.length) return { rows: [], scanned: 0, checked: 0 }

  const links = rawLinks
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.startsWith('http'))

  const raw: WebRow[] = []
  for (const link of shuffle(links)) {
    if (!link) continue
    const host = hostFromUrl(link)
    if (!host) continue
    if (host.includes('wikipedia.org')) continue
    const title = host
    const tags = Array.from(new Set(['wikipedia', host])).filter(Boolean)
    const keywords = deriveKeywords(`${host} ${title}`, 8)
    raw.push({
      type: 'web',
      url: link,
      title,
      text: title,
      host,
      ogImage: null,
      provider: 'wikipedia-list',
      source: { name: 'Wikipedia — List of websites', url: 'https://en.wikipedia.org/wiki/List_of_websites' },
      tags,
      keywords,
    })
  }

  const { rows: filteredRows, filtered } = filterBlockedRows(dedupeByUrl(raw))
  const limited = limitRowsByDomain(filteredRows, MAX_PAGES_PER_DOMAIN)
  if (!requireOg) {
    return { rows: limited.slice(0, limit), scanned: raw.length, checked: limited.length, filtered: filtered + (filteredRows.length - limited.length) }
  }

  const ensured = await ensureOgImages(limited, limit)
  return { rows: ensured.rows, scanned: raw.length, checked: ensured.checked, filtered: filtered + (filteredRows.length - limited.length), ogFailed: ensured.failed }
}

async function pullCurated(limit: number, requireOg = true, region: RegionKey = 'global'): Promise<ProviderResult> {
  if (!CURATED_WEB_SOURCES.length || limit <= 0) {
    return { rows: [], scanned: 0, checked: 0 }
  }

  const raw: WebRow[] = []
  const seen = new Set<string>()

  const regionalSources = CURATED_WEB_SOURCES.filter((entry) => {
    if (!entry.regions || !entry.regions.length) return true
    if (entry.regions.includes('global')) return true
    return entry.regions.includes(region)
  })

  for (const entry of shuffle<CuratedWebSource>(regionalSources)) {
    const url = entry.url?.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    const host = hostFromUrl(url)
    if (!host) continue
    const title = entry.title?.trim() || host
    const description = entry.description?.trim() || title
    const tags = Array.from(new Set([host, 'curated', ...(entry.tags || [])])).filter(Boolean)
    const keywords = deriveKeywords(`${title} ${description}`, 8)
    raw.push({
      type: 'web',
      url,
      title,
      text: description,
      host,
      ogImage: null,
      provider: entry.provider || 'curated-list',
      source: { name: entry.sourceName || title, url: entry.sourceUrl || url },
      tags,
      keywords,
    })
  }

  const { rows: filteredRows, filtered } = filterBlockedRows(dedupeByUrl(raw), false)
  const limited = limitRowsByDomain(filteredRows, MAX_PAGES_PER_DOMAIN)
  if (!requireOg) {
    return { rows: limited.slice(0, limit), scanned: raw.length, checked: limited.length, filtered: filtered + (filteredRows.length - limited.length) }
  }

  const ensured = await ensureOgImages(limited, limit)
  return {
    rows: ensured.rows,
    scanned: raw.length,
    checked: ensured.checked,
    filtered: filtered + (filteredRows.length - limited.length),
    ogFailed: ensured.failed,
  }
}

/* ---------------------------- Hacker News ------------------------------ */
const HN_SEARCHES_PER_RUN = 8

/** Addresses already in the catalogue: no need to fetch their preview again. */
async function storedUrls(urls: string[]): Promise<Set<string>> {
  const db = await getDbSafe()
  if (!db || !urls.length) return new Set()
  const docs = await db.collection('items').find({ type: 'web', url: { $in: urls } }, { projection: { url: 1 } }).toArray()
  return new Set(docs.map((doc) => String(doc.url)))
}

async function pullHackerNews(limit: number, requireOg = true, dryRun = false): Promise<ProviderResult> {
  const raw: WebRow[] = []
  for (const query of hnQueries(HN_SEARCHES_PER_RUN, Math.random)) {
    const first = await fetchJson<{ hits?: HnHit[]; nbPages?: number }>(hnSearchUrl(query), { headers: ROUTE_HEADERS, timeoutMs: 10000 })
    const page = hnNextPage(Number(first?.nbPages) || 0, Math.random)
    const next = page == null ? null : await fetchJson<{ hits?: HnHit[] }>(hnSearchUrl(query, page), { headers: ROUTE_HEADERS, timeoutMs: 10000 })
    for (const hit of [...(first?.hits ?? []), ...(next?.hits ?? [])]) {
      const site = hnSite(hit)
      if (!site) continue
      const host = hostFromUrl(site.url)
      raw.push({
        type: 'web',
        url: site.url,
        title: site.title,
        text: site.text,
        host,
        ogImage: null,
        provider: 'hn',
        source: { name: 'Show HN', url: `https://news.ycombinator.com/item?id=${site.postId}` },
        tags: Array.from(new Set([host, 'show-hn', query])).filter(Boolean),
        keywords: deriveKeywords(`${site.title} ${site.text}`, 8),
      })
    }
  }
  const deduped = dedupeByUrl(raw)
  const stored = await storedUrls(deduped.map((row) => row.url))
  const { rows: filteredRows, filtered } = filterBlockedRows(shuffle(deduped.filter((row) => !stored.has(row.url))))
  const limited = limitRowsByDomain(filteredRows, 1)
  if (!requireOg) {
    return { rows: limited.slice(0, limit), scanned: raw.length, checked: limited.length, filtered: filtered + (filteredRows.length - limited.length) }
  }
  const ensured = await ensureOgImages(limited, limit, 8, true)
  // Two good sites in three have no usable preview: the server photographs them.
  const queued = dryRun ? 0 : await enqueue(ensured.refused.map((row) => ({
    url: row.url, source: 'hn', title: row.title, text: row.text, tags: row.tags, sourceName: row.source?.name, sourceUrl: row.source?.url,
  })))
  return { rows: ensured.rows, scanned: raw.length, checked: ensured.checked, filtered: filtered + (filteredRows.length - limited.length), ogFailed: ensured.failed, queued }
}

/* -------------------------------- Handler -------------------------------- */
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  const per   = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get('per') || 10)))
  const pages = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get('pages') || 3)))
  const region = resolveRegionKey(req.nextUrl.searchParams.get('region'))
  const incoming = (req.nextUrl.searchParams.get('q') || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  let fallbackQuery: string
  if (region === 'global') {
    const combo = await generateKeywordCombo({ region: 'global' })
    fallbackQuery = combo.query
  } else {
    fallbackQuery = buildRegionalQuery(region, 'web').terms.join(' ')
  }

  const queries = incoming.length ? incoming : [fallbackQuery]
  // Without explicit searches, Google is asked for the small sites of the world, one page each.
  const cseSearches = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('cseSearches') || 45)))
  const cseQueries: Array<string | WorldQuery> = incoming.length ? incoming : worldWebQueries(cseSearches)

  const providersParam = (req.nextUrl.searchParams.get('providers') || 'hn,curated,cse')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const allowedProviders = new Set(['cse', 'curated', 'neocities', 'wikipedia', 'hn'])
  const requestedProviders = providersParam.filter((value) => allowedProviders.has(value))
  // Google's search only when a caller names it: the owner wants sites found without CSE (2 October), and a caller
  // without providers — the old lines, back by mistake on 1-2 October — spent the free searches of two days.
  const providers = requestedProviders.length ? requestedProviders : ['hn', 'curated']

  const requireOgParam = req.nextUrl.searchParams.get('requireOg')
  const requireOg = requireOgParam == null
    ? true
    : !['0', 'false', 'no'].includes(requireOgParam.toLowerCase())

  const dryParam = req.nextUrl.searchParams.get('dry') || req.nextUrl.searchParams.get('preview')
  const dryRun = dryParam === '1' || dryParam === 'true'
  const sampleSizeRaw = Number(req.nextUrl.searchParams.get('sample') || 6)
  const sampleSize = Number.isFinite(sampleSizeRaw) ? Math.max(1, Math.min(20, sampleSizeRaw)) : 6

  const limitParam = Number(req.nextUrl.searchParams.get('limit') || 0)
  const baseTarget = Math.max(24, per * pages * Math.max(queries.length, 1))
  const MAX_BATCH = 2000
  const totalTarget = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.max(8, Math.floor(limitParam)), MAX_BATCH)
    : Math.min(baseTarget, MAX_BATCH)
  const perProviderTarget = Math.max(5, Math.ceil(totalTarget / providers.length))

  const aggregated: WebRow[] = []
  let scanned = 0
  let checked = 0
  let filteredByHost = 0
  let ogFailed = 0
  let queued = 0
  let searches = 0

  if (providers.includes('cse')) {
    try {
      const result = await runGoogleCSE(cseQueries, per, incoming.length ? pages : 1, region, dryRun)
      aggregated.push(...result.rows)
      queued += result.queued ?? 0
      searches += result.searches ?? 0
      scanned += result.scanned
      checked += result.checked
      filteredByHost += result.filtered ?? 0
      ogFailed += result.ogFailed ?? 0
    } catch {}
  }

  if (providers.includes('curated')) {
    try {
      const result = await pullCurated(perProviderTarget, requireOg, region)
      aggregated.push(...result.rows)
      scanned += result.scanned
      checked += result.checked
      filteredByHost += result.filtered ?? 0
      ogFailed += result.ogFailed ?? 0
    } catch {}
  }

  if (providers.includes('neocities')) {
    try {
      const result = await pullNeocities(perProviderTarget, requireOg)
      aggregated.push(...result.rows)
      scanned += result.scanned
      checked += result.checked
      filteredByHost += result.filtered ?? 0
      ogFailed += result.ogFailed ?? 0
    } catch {}
  }

  if (providers.includes('hn')) {
    try {
      const result = await pullHackerNews(Math.min(perProviderTarget, 60), requireOg, dryRun)
      aggregated.push(...result.rows)
      queued += result.queued ?? 0
      scanned += result.scanned
      checked += result.checked
      filteredByHost += result.filtered ?? 0
      ogFailed += result.ogFailed ?? 0
    } catch {}
  }

  if (providers.includes('wikipedia')) {
    try {
      const result = await pullWikipediaList(perProviderTarget, requireOg)
      aggregated.push(...result.rows)
      scanned += result.scanned
      checked += result.checked
      filteredByHost += result.filtered ?? 0
      ogFailed += result.ogFailed ?? 0
    } catch {}
  }

  const deduped = requireOg ? dedupeRowsWithOg(aggregated) : dedupeByUrl(aggregated)
  const sample = deduped.slice(0, Math.max(0, sampleSize))
  const providerCounts: Record<string, number> = {}
  for (const row of deduped) {
    const name = row.provider || 'web'
    providerCounts[name] = (providerCounts[name] || 0) + 1
  }

  try {
    if (!deduped.length || dryRun) {
      return NextResponse.json({
        ok: true,
        providers,
        providerCounts,
        queries,
        region,
        per,
        pages,
        limit: totalTarget,
        scanned,
        checked,
        unique: deduped.length,
        filtered: filteredByHost,
        ogFailed,
        queued,
        searches,
        dryRun,
        sample,
        inserted: 0,
        updated: 0,
      })
    }

    const { inserted, updated } = await upsertManyWeb(deduped)
    return NextResponse.json({
      ok: true,
      providers,
      providerCounts,
      queries,
      region,
      per,
      pages,
      limit: totalTarget,
      scanned,
      checked,
      unique: deduped.length,
      filtered: filteredByHost,
      ogFailed,
      queued,
      searches,
      dryRun,
      sample,
      inserted,
      updated,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'ingest web failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
