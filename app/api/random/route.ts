export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { recordDailyUsage } from '@/lib/metrics/usage'
import webKeywordJson from '@/lib/ingest/keywords/web.json'
import { FALLBACK_IMAGES, selectImage } from '@/lib/random/images'
import { selectVideo } from '@/lib/random/videos'
import { selectQuote } from '@/lib/random/quotes'
import { selectFact } from '@/lib/random/facts'
import { selectJoke } from '@/lib/random/jokes'
import { shouldPreferFreshContent } from '@/lib/random/helpers'
import {
  markGlobalItem,
  isGlobalItemRecent,
  markGlobalTopics,
  areTopicsGloballyRecent,
  markGlobalKeywords,
  areKeywordsGloballyRecent,
  markGlobalProvider,
  isProviderGloballyRecent,
  getRecentOriginsWindow,
  markGlobalOrigin,
} from '@/lib/random/globalState'
import type { CandidateOrigin } from '@/lib/random/types'
import { getDbSafe, sampleFromCache, touchLastShown, upsertCache } from '@/lib/random/data'

import type { ImageItem } from '@/lib/random/images'
import type { VideoItem } from '@/lib/random/videos'

type ItemType = 'image'|'quote'|'fact'|'joke'|'video'|'web'
type Lang = 'en'|'fr'|'de'|'jp'

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const ITEM_TYPE_SEQUENCE: ItemType[] = ['image','quote','fact','joke','video','web']

const recentTypeHistory: ItemType[] = []

function typeFatigueScore(type: ItemType): number {
  let fatigue = 0
  let weight = 1
  for (let i = recentTypeHistory.length - 1; i >= 0 && weight <= 24; i--, weight++) {
    if (recentTypeHistory[i] === type) fatigue += 1 / weight
  }
  return fatigue
}

function markRecentType(type: ItemType) {
  recentTypeHistory.push(type)
  if (recentTypeHistory.length > 64) recentTypeHistory.shift()
}

function orderAsGiven(arr: ItemType[]): ItemType[] {
  if (!arr.length) return arr
  const enriched = arr.map((value, index) => ({
    value,
    index,
    fatigue: typeFatigueScore(value),
    jitter: Math.random() * 0.001,
  }))

  enriched.sort((a, b) => {
    const diff = a.fatigue - b.fatigue
    if (Math.abs(diff) > 0.0001) return diff
    if (a.jitter !== b.jitter) return a.jitter - b.jitter
    const baselineDiff = ITEM_TYPE_SEQUENCE.indexOf(a.value) - ITEM_TYPE_SEQUENCE.indexOf(b.value)
    if (baselineDiff !== 0) return baselineDiff
    return a.index - b.index
  })

  return enriched.map(({ value }) => value)
}

const PROVIDER_TIMEOUT_MS = Number(process.env.RANDOM_PROVIDER_TIMEOUT_MS || 2500)
const SELECTION_DEBUG = process.env.RANDOM_SELECTION_DEBUG === '1'

const WEB_KEYWORD_LISTS = webKeywordJson as { A: string[]; B: string[]; C: string[] }

const trimText = (value?: string | null) => (value || '').trim()

const DAY_MS = 1000 * 60 * 60 * 24

function pushRecent(list: string[], value: string, max: number) {
  const key = value.trim().toLowerCase()
  if (!key) return
  const idx = list.indexOf(key)
  if (idx >= 0) list.splice(idx, 1)
  list.push(key)
  while (list.length > max) list.shift()
}

function pushRecentMany(list: string[], values: string[], max: number) {
  for (const value of values) pushRecent(list, value, max)
  while (list.length > max) list.shift()
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

async function fetchWithTimeout(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1], timeout = PROVIDER_TIMEOUT_MS): Promise<Response | null> {
  if (typeof AbortController === 'undefined') {
    return Promise.race([
      fetch(input, init),
      new Promise<Response | null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ])
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(input, { ...(init || {}), signal: controller.signal })
    return res
  } catch (err: unknown) {
    if ((err as { name?: string } | null)?.name === 'AbortError') return null
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchLiveVideo(): Promise<VideoItem | null> {
  try {
    return await selectVideo(SELECTION_DEBUG)
  } catch (error) {
    console.error('[random:video] error', error)
    return null
  }
}

async function fetchLiveImage(): Promise<ImageItem> {
  try {
    return await selectImage(SELECTION_DEBUG)
  } catch (error) {
    console.error('[random:image] error', error)
    return {
      type: 'image',
      url: FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)],
      thumbUrl: null,
      source: { name: 'Unsplash', url: FALLBACK_IMAGES[0] },
    }
  }
}

const BASE_STOP_WORDS = new Set([
  'the','and','with','from','that','this','your','our','for','into','over','under','about','just','make','made','making','best','how','what','when','where','why','who','are','was','were','will','can','get','been','take','takes','took','first','second','third','day','night','amp','episode','official','new','video','full','hd','challenge','vs','vs.','edition','life','hack','hacks','trick','tricks','tip','tips','tutorial','amazing','awesome','incredible','really','very','here','there','have','without','inside','outside','their','them','they','you','yours','give','given','giving','see','seen','look','looking','want','wanted','watch','watching','every','always','never','still','into','out','once','again','another','ever','more','less','thing','things','stuff','maybe','some','someone','something','going','around','back','front','little','big'
])

function extractKeywordsFromText(text: string, stopWords = BASE_STOP_WORDS, limit = 6): string[] {
  if (!text) return []
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = lower.split(/\s+/).filter(Boolean)
  const unique: string[] = []
  for (const word of words) {
    if (word.length < 3 || word.length > 18) continue
    if (stopWords.has(word)) continue
    if (!unique.includes(word)) unique.push(word)
    if (unique.length >= limit) break
  }
  return unique
}

function extractTagsFromSeeds(text: string, seedMap: Record<string, string[]>): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(seedMap)) {
    if (seeds.some((seed) => lower.includes(seed))) tags.push(tag)
  }
  return Array.from(new Set(tags))
}

function normalizeStringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed) out.push(trimmed.toLowerCase())
    } else if (entry && typeof entry === 'object' && 'toString' in entry) {
      const str = String(entry).trim()
      if (str) out.push(str.toLowerCase())
    }
    if (out.length >= limit) break
  }
  return Array.from(new Set(out))
}

type GlobalFootprint = {
  type: ItemType
  key?: string | null
  tags?: string[]
  keywords?: string[]
  provider?: string
  origin?: CandidateOrigin | 'fallback'
}

function registerGlobalFootprint(meta: GlobalFootprint) {
  if (meta.key) markGlobalItem(meta.type, meta.key)
  if (meta.tags?.length) markGlobalTopics(meta.tags)
  if (meta.keywords?.length) markGlobalKeywords(meta.keywords)
  if (meta.provider) markGlobalProvider(meta.provider)
  if (meta.origin) markGlobalOrigin(meta.origin)
}

function resolveProvider(item: RandomItem): string | null {
  if ('provider' in item && typeof item.provider === 'string') return item.provider
  if ('source' in item && item.source) {
    const candidate = item.source?.name
    if (candidate && typeof candidate === 'string') return candidate
  }
  return null
}

type SourceInfo = { name: string; url?: string | null }

type WebItem = {
  type: 'web'
  url: string
  text: string
  ogImage: string | null
  source: SourceInfo
  provider?: string
}

type WebRecord = {
  url?: string | null
  host?: string | null
  title?: string | null
  text?: string | null
  ogImage?: string | null
  thumb?: string | null
  provider?: string | null
  source?: SourceInfo | null
  tags?: unknown
  keywords?: unknown
  updatedAt?: Date | string | null
  lastShownAt?: Date | string | null
}

type GoogleSearchItem = { link?: string; title?: string }
type GoogleSearchResponse = { items?: GoogleSearchItem[] }

type QuoteItem = Exclude<Awaited<ReturnType<typeof selectQuote>>, null>
type FactItem = Exclude<Awaited<ReturnType<typeof selectFact>>, null>
type JokeItem = Exclude<Awaited<ReturnType<typeof selectJoke>>, null>

type RandomItem = ImageItem | VideoItem | QuoteItem | FactItem | JokeItem | WebItem

const WEB_TOPIC_SEEDS: Record<string, string[]> = {
  archive: ['archive','retro','vintage','geocities','old web','guestbook','blinkies','y2k','frameset','marquee'],
  food: ['recipe','food','cooking','kitchen','dessert','eat','restaurant','snack'],
  diy: ['diy','craft','maker','build','tutorial','how to','hack','guide'],
  music: ['music','band','playlist','dj','mix','sound','radio','tape','cassette'],
  travel: ['travel','guide','map','city','tour','museum','attraction','itinerary'],
  fandom: ['fan','shrine','tribute','club','community','fanpage','fan site'],
  tech: ['software','download','program','code','script','terminal','retro computing'],
  culture: ['zine','gallery','exhibition','art','design','fashion','style'],
  odd: ['weird','strange','bizarre','curious','odd','mystery'],
}

// ------------------------------- LIVE: WEB --------------------------------
const recentHosts: string[] = []
function markRecentHost(h: string) { const i = recentHosts.indexOf(h); if (i >= 0) recentHosts.splice(i, 1); recentHosts.push(h); if (recentHosts.length > 30) recentHosts.shift() }
const isRecentHost = (h?: string) => !!h && recentHosts.includes(h)
type WebCandidate = {
  url: string
  host: string
  item: WebItem
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function extractWebTags(text: string): string[] {
  const tags = extractTagsFromSeeds(text, WEB_TOPIC_SEEDS)
  return tags.length ? tags : ['misc']
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function buildWebCandidate(doc: WebRecord | null | undefined, origin: CandidateOrigin): WebCandidate | null {
  const url = trimText(doc?.url)
  if (!url) return null
  let host = trimText(doc?.host || '')
  if (!host) {
    try { host = new URL(url).host.replace(/^www\./, '') } catch {}
  }
  const text = trimText(doc?.title || doc?.text || host || url)
  const ogImage = doc?.ogImage || doc?.thumb || null
  const provider = trimText(doc?.provider) || 'web'
  const rawSource = doc?.source
  const source: SourceInfo = {
    name: typeof rawSource?.name === 'string' && rawSource.name.trim() ? rawSource.name.trim() : provider,
    url: typeof rawSource?.url === 'string' && rawSource.url ? rawSource.url : url,
  }
  const descriptor = `${text} ${host} ${provider}`
  const storedTags = normalizeStringArray(doc?.tags)
  const storedKeywords = normalizeStringArray(doc?.keywords)
  const tags = storedTags.length ? storedTags : extractWebTags(descriptor)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(descriptor)
  const updatedAt = toDate(doc?.updatedAt)
  const lastShownAt = toDate(doc?.lastShownAt)
  return {
    url,
    host,
    item: { type: 'web', url, text, ogImage, source, provider },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function webCandidateKey(candidate: WebCandidate): string {
  return candidate.url
}

function scoreWebCandidate(candidate: WebCandidate): number {
  let score = 0

  if (!recentHosts.includes(candidate.host)) score += 8
  else score -= 9

  if (!recentWebProviders.includes(candidate.provider)) score += 3
  else score -= 3

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentWebTags.includes(tag)) score -= 2
    else score += 3
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentWebKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.4
  score -= repeatedKeywords * 2.4

  if (candidate.origin === 'network') score += 4
  else if (candidate.origin === 'db-unseen') score += 2

  if (!candidate.lastShownAt) score += 3
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 4
    else if (days < 3) score -= 3
  }

  score += Math.random()
  return score
}

async function collectWebCandidates(): Promise<WebCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []
  const bucket = new Map<string, WebCandidate>()
  const add = (doc: WebRecord, origin: CandidateOrigin) => {
    const candidate = buildWebCandidate(doc, origin)
    if (!candidate) return
    const key = webCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      db.collection<WebRecord>('items').find({ type: 'web' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      db.collection<WebRecord>('items').find({ type: 'web', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      db.collection<WebRecord>('items').find({ type: 'web', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      db.collection<WebRecord>('items').aggregate([{ $match: { type: 'web' } }, { $sample: { size: 60 } }]).toArray(),
    ])
    for (const doc of fresh) add(doc, 'db-fresh')
    for (const doc of unseen) add(doc, 'db-unseen')
    for (const doc of backlog) add(doc, 'db-backlog')
    for (const doc of randomDocs) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchNetworkWebCandidates(): Promise<WebCandidate[]> {
  const KEY = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_API_KEY
  const CX = process.env.GOOGLE_CSE_CX  || process.env.GOOGLE_CSE_ID
  if (!KEY || !CX) return []

  const A = Array.from(new Set([...(WEB_KEYWORD_LISTS.A || []), 'weird','forgotten','retro','vintage','ascii','obscure','random','tiny','handmade','zine','folk','outsider','underground','amateur','old web','geocities','blogspot','tripod','myspace','lofi','pixel','crt','vhs','camcorder','guestbook','y2k','webcore','demoscene','net.art']))
  const B = Array.from(new Set([...(WEB_KEYWORD_LISTS.B || []), 'blog','diary','gallery','generator','zine','festival','toy','museum','game','playlist','lyrics','fan page','tutorial','archive','personal site','homepage','forum','webring','guestbook','wiki','cookbook','guide','blogroll','directory','portal','topsites','newsletter','mirror','ftp','userscripts','bookmarklet','fanfic','scanlation','pet game','virtual pet','toybox','playground','lab','experiments']))
  const C = Array.from(new Set([...(WEB_KEYWORD_LISTS.C || []), '1998','2003','romania','argentina','finland','iceland','japan','france','village','basement','attic','garage','mexico','brazil','colombia','morocco','turkey','greece','portugal','neon','cybercafe','library','dorm room','rooftop','market','pier','lighthouse','forest','river']))

  const queries = new Set<string>()
  while (queries.size < 4) {
    queries.add(`${pick(A)} ${pick(B)} ${pick(C)}`)
  }

  const out: WebCandidate[] = []
  for (const query of queries) {
    try {
      const start = String([1,1,1,11,21][Math.floor(Math.random() * 5)])
      const num = String([10,9,8][Math.floor(Math.random() * 3)])
      const res = await fetchWithTimeout(`https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CX}&q=${encodeURIComponent(query)}&num=${num}&start=${start}&safe=off`, { cache: 'no-store' })
      if (!res?.ok) continue
      const data = (await res.json()) as GoogleSearchResponse
      const items = data.items ?? []
      for (const candidate of shuffle(items.slice())) {
        const link: string | undefined = candidate?.link
        if (!link) continue
        let host = ''
        try { host = new URL(link).host.replace(/^www\./,'') } catch {}
        if (host && isRecentHost(host)) continue
        const ogImage = await fetchOgImage(link)
        if (!ogImage) continue
        const doc: WebRecord = {
          url: link,
          host,
          title: candidate?.title || host || link,
          ogImage,
          provider: 'google-cse',
          source: { name: 'Google', url: link },
        }
        const built = buildWebCandidate(doc, 'network')
        if (built) out.push(built)
        if (out.length >= 6) break
      }
    } catch {}
    if (out.length >= 6) break
  }
  return out
}
const recentWebTags: string[] = []
const recentWebKeywords: string[] = []
const recentWebProviders: string[] = []

async function fetchOgImage(link: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      link,
      { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (RandomApp Bot; +https://example.com)' } },
      1500,
    )
    if (!res?.ok) return null
    const html = await res.text()
    const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
      || /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    if (og) return new URL(og, link).toString()
    const img = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec(html)?.[1]
    return img ? new URL(img, link).toString() : null
  } catch { return null }
}

async function fetchLiveWeb(): Promise<WebItem | null> {
  const candidateMap = new Map<string, WebCandidate>()
  const add = (candidate: WebCandidate | null) => {
    if (!candidate) return
    const key = webCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectWebCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkWebCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: scoreWebCandidate(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent(getRecentOriginsWindow(10))
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const allTagsRecent = candidate.tags.every((tag) => recentWebTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentWebKeywords.includes(word))
      : false
    const globallyRecent = isGlobalItemRecent('web', candidate.url)
    const topicsGloballyTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsGloballyTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 1) continue
    if (allTagsRecent && allKeywordsRecent && scored.length > 1) continue
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 1) continue
    if (providerGloballyTired && scored.length > 2 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 1) continue

    if (candidate.origin === 'network') {
      await upsertCache('web', { url: candidate.url }, {
        title: candidate.item.text,
        host: candidate.host,
        ogImage: candidate.item.ogImage,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('web', { url: candidate.url })
    if (candidate.host) markRecentHost(candidate.host)
    pushRecentMany(recentWebTags, candidate.tags, 120)
    pushRecentMany(recentWebKeywords, candidate.keywords, 160)
    pushRecent(recentWebProviders, candidate.provider, 40)
    registerGlobalFootprint({
      type: 'web',
      key: candidate.url,
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  const cached = (await sampleFromCache('web', { ogImage: { $nin: [null, '', false] } })) as WebRecord | null
  if (cached?.url) {
    await touchLastShown('web', { url: cached.url })
    const fallback = buildWebCandidate(cached, 'db-random')
    if (fallback) {
      pushRecentMany(recentWebTags, fallback.tags, 120)
      pushRecentMany(recentWebKeywords, fallback.keywords, 160)
      if (fallback.host) markRecentHost(fallback.host)
      registerGlobalFootprint({
        type: 'web',
        key: fallback.item.url,
        tags: fallback.tags,
        keywords: fallback.keywords,
        provider: fallback.provider,
        origin: fallback.origin,
      })
      return fallback.item
    }
    const cachedUrl = typeof cached.url === 'string' ? cached.url : ''
    const provider = typeof cached.provider === 'string' ? cached.provider : 'cache'
    const title = typeof cached.title === 'string' ? cached.title : typeof cached.host === 'string' ? cached.host : cachedUrl
    const ogImage = typeof cached.ogImage === 'string' ? cached.ogImage : null
    const source: SourceInfo = cached.source && typeof cached.source === 'object'
      ? {
          name: typeof cached.source.name === 'string' && cached.source.name.trim() ? cached.source.name.trim() : provider,
          url: typeof cached.source.url === 'string' && cached.source.url ? cached.source.url : cachedUrl,
        }
      : { name: provider, url: cachedUrl }

    registerGlobalFootprint({
      type: 'web',
      key: cachedUrl,
      provider,
      origin: 'db-random',
    })

    return { type: 'web', url: cachedUrl, text: title, ogImage, source, provider }
  }

  return null
}

/* -------------------------------- Handler -------------------------------- */
function parseTypes(param: string | null | undefined): ItemType[] {
  const allow = new Set<ItemType>(['image','quote','fact','joke','video','web'])
  const list = (param || '').split(',').map(s => s.trim()).filter(Boolean) as ItemType[]
  const filtered = list.filter(t => allow.has(t))
  return filtered.length ? filtered : ['image','quote','fact']
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const lang = (searchParams.get('lang') || 'en') as Lang
    const types = orderAsGiven(parseTypes(searchParams.get('types')))

    // on essaie les types demandés dans l'ordre
    for (const t of types) {
      let item: RandomItem | null = null
      if (t === 'image') {
        item = await fetchLiveImage()
      } else if (t === 'video') {
        item = await fetchLiveVideo()
      } else if (t === 'quote') {
        const quote = await selectQuote()
        if (quote) item = quote
      } else if (t === 'joke') {
        const joke = await selectJoke()
        if (joke) item = joke
      } else if (t === 'fact') {
        const fact = await selectFact()
        if (fact) item = fact
      } else if (t === 'web') {
        const web = await fetchLiveWeb()
        if (web) item = web
      }

      if (item) {
        markRecentType(item.type)
        await recordDailyUsage({
          type: item.type,
          lang,
          provider: resolveProvider(item),
        })
        return NextResponse.json({ item })
      }
    }

    // ---- Fallback final (pour ne jamais retourner null) ----
    if (types.includes('quote')) {
      const local = [
        'Simplicity is the soul of efficiency.',
        'Make it work, make it right, make it fast.',
        'Creativity is intelligence having fun.',
        'The best way to predict the future is to invent it.'
      ]
      const text = local[Math.floor(Math.random() * local.length)]
    const fallbackQuote: QuoteItem = { type: 'quote', text, author: '', source: { name: 'Local', url: '' }, provider: 'local' }
    markRecentType('quote')
    registerGlobalFootprint({ type: 'quote', key: text, provider: fallbackQuote.source.name || 'local', origin: 'fallback' })
    await recordDailyUsage({ type: fallbackQuote.type, lang, provider: fallbackQuote.source.name })
    return NextResponse.json({ item: fallbackQuote })
  }

  const img = pick([...FALLBACK_IMAGES])
  const fallbackImage: ImageItem = { type: 'image', url: img, thumbUrl: null, source: { name: 'Unsplash', url: img } }
    markRecentType('image')
    registerGlobalFootprint({ type: 'image', key: img, provider: fallbackImage.source.name || 'unsplash', origin: 'fallback' })
    await recordDailyUsage({ type: fallbackImage.type, lang, provider: fallbackImage.source.name })
    return NextResponse.json({ item: fallbackImage })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
