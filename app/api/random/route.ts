export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '@/lib/db'

type ItemType = 'image'|'quote'|'fact'|'joke'|'video'|'web'
type Lang = 'en'|'fr'|'de'|'jp'

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const orderAsGiven = <T,>(arr: T[]) => arr

const PROVIDER_TIMEOUT_MS = Number(process.env.RANDOM_PROVIDER_TIMEOUT_MS || 2500)

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
  } catch (err: any) {
    if (err?.name === 'AbortError') return null
    return null
  } finally {
    clearTimeout(timer)
  }
}

/* --------------------------- DB light cache helpers ----------------------- */
let cachedDb: Db | null = null
async function getDbSafe(): Promise<Db | null> {
  try {
    if (cachedDb) return cachedDb
    cachedDb = await getDb(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    return cachedDb
  } catch {
    return null
  }
}

async function upsertCache(type: ItemType, key: Record<string, any>, doc: Record<string, any>) {
  const db = await getDbSafe()
  if (!db) return
  try {
    await db.collection('items').updateOne(
      { type, ...key },
      { $set: { type, ...key, ...doc, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    )
  } catch {}
}

async function touchLastShown(type: ItemType, key: Record<string, any>) {
  const db = await getDbSafe()
  if (!db) return
  try {
    await db.collection('items').updateOne({ type, ...key }, { $set: { lastShownAt: new Date() } })
  } catch {}
}

async function sampleFromCache(type: ItemType, extraMatch: Record<string, any> = {}): Promise<any | null> {
  const db = await getDbSafe()
  if (!db) return null
  try {
    const arr = await db.collection('items').aggregate([
      { $match: { type, ...extraMatch } },
      { $sample: { size: 1 } },
    ]).toArray()
    return arr[0] || null
  } catch { return null }
}

/* --- NEW: quote sampler that avoids the recent buffer --- */
async function sampleQuoteFromCache(): Promise<any | null> {
  const db = await getDbSafe()
  if (!db) return null
  try {
    const arr = await db.collection('items').aggregate([
      { $match: { type: 'quote', text: { $nin: recentQuotes } } },
      { $sample: { size: 1 } },
    ]).toArray()
    return arr[0] || null
  } catch { return null }
}

/* -------------------------------- Fallbacks ------------------------------- */
const FB_IMAGES = [
  'https://images.unsplash.com/photo-1519681393784-d120267933ba',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
  'https://images.unsplash.com/photo-1495567720989-cebdbdd97913',
]

/* ------------------------------ LIVE: IMAGES ------------------------------ */

/** Pixabay provider */
async function fetchFromPixabay(query: string): Promise<any | null> {
  const key = process.env.PIXABAY_API_KEY
  if (!key) return null
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', key)
  url.searchParams.set('q', query)
  url.searchParams.set('image_type', 'photo')
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('per_page', '50')

  const res = await fetchWithTimeout(url, { cache: 'no-store' })
  if (!res?.ok) return null
  const data: any = await res.json()
  const hits: any[] = data?.hits || []
  if (!hits.length) return null
  const hit = pick(hits)

  const urlImg: string | undefined = hit.largeImageURL || hit.webformatURL
  if (!urlImg) return null
  const item = {
    type: 'image' as const,
    url: urlImg,
    thumbUrl: hit.previewURL || hit.webformatURL || null,
    source: { name: 'Pixabay', url: hit.pageURL || urlImg },
    provider: 'pixabay',
  }
  try {
    await upsertCache('image', { url: urlImg }, { thumb: item.thumbUrl, source: item.source, provider: 'pixabay' })
    await touchLastShown('image', { url: urlImg })
  } catch {}
  return item
}

/** Tenor provider (GIFs) */
async function fetchFromTenor(query: string): Promise<any | null> {
  const key = process.env.TENOR_API_KEY
  if (!key) return null
  const u = new URL('https://tenor.googleapis.com/v2/search')
  u.searchParams.set('q', query)
  u.searchParams.set('key', key)
  u.searchParams.set('limit', '50')
  u.searchParams.set('media_filter', 'gif,tinygif')
  u.searchParams.set('random', 'true')

  const res = await fetchWithTimeout(u.toString(), { cache: 'no-store' })
  if (!res?.ok) return null
  const d: any = await res.json()
  const r: any[] = d?.results || []
  if (!r.length) return null

  const it: any = r[Math.floor(Math.random() * r.length)]
  const m = it?.media_formats || {}
  const urlGif: string | undefined =
    m.gif?.url || m.tinygif?.url || m.mediumgif?.url || m.nanogif?.url
  if (!urlGif) return null

  const item = {
    type: 'image' as const,
    url: urlGif,
    thumbUrl: m.tinygif?.url || null,
    source: { name: 'Tenor', url: it?.itemurl || urlGif },
  }
  try {
    await upsertCache('image', { url: urlGif }, { thumb: item.thumbUrl, source: item.source, provider: 'tenor' })
    await touchLastShown('image', { url: urlGif })
  } catch {}
  return item
}

/** Imgflip (meme templates – pas de clé) */
async function fetchFromImgflip(): Promise<any | null> {
  try {
    const res = await fetchWithTimeout('https://api.imgflip.com/get_memes', { cache: 'no-store' })
    if (!res?.ok) return null
    const d: any = await res.json()
    const arr: any[] = d?.data?.memes || []
    if (!arr.length) return null
    const m = arr[Math.floor(Math.random() * arr.length)]
    const urlImg: string | undefined = m?.url
    if (!urlImg) return null
    const item = {
      type: 'image' as const,
      url: urlImg,
      thumbUrl: urlImg,
      source: { name: 'Imgflip', url: 'https://imgflip.com' },
    }
    await upsertCache('image', { url: urlImg }, { thumb: item.thumbUrl, source: item.source, provider: 'imgflip' })
    await touchLastShown('image', { url: urlImg })
    return item
  } catch { return null }
}

async function fetchLiveImage(): Promise<any | null> {
  const PEXELS_KEY = process.env.PEXELS_API_KEY
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY
  const GIPHY_KEY = process.env.GIPHY_API_KEY
  const TENOR_KEY = process.env.TENOR_API_KEY

  const WORDS_PHOTO = ['weird','vintage','odd','retro','obscure','fun','tiny','toy','museum','street','festival','garage','zine']
  const WORDS_GIF = [
    'reaction', 'fail', 'dance', 'facepalm', 'meme', 'lol', 'weirdcore', 'glitch', 'vaporwave',
    'awkward', 'party', 'vibes', 'hype', 'surprised', 'blink', 'zoom', 'spin', 'confused',
    'retro gif', 'vhs glitch', 'ascii art', 'pixel art'
  ]

  const roll = Math.random()
  const providers: Array<'giphy'|'tenor'|'pexels'|'pixabay'|'unsplash'|'imgflip'> =
    roll < 0.30 ? ['giphy','tenor','pexels','pixabay','imgflip','unsplash']
  : roll < 0.60 ? ['tenor','giphy','pexels','pixabay','imgflip','unsplash']
  : roll < 0.75 ? ['pexels','giphy','tenor','pixabay','imgflip','unsplash']
  : roll < 0.90 ? ['pixabay','giphy','tenor','pexels','imgflip','unsplash']
  : roll < 1.00 ? ['imgflip','giphy','tenor','pexels','pixabay','unsplash']
               : ['unsplash','giphy','tenor','pexels','pixabay','imgflip']

  const first = providers[0]
  const isGifFirst = first === 'giphy' || first === 'tenor'
  const queryGif = pick(WORDS_GIF)
  const queryPhoto = pick(WORDS_PHOTO)

  for (const prov of providers) {
    try {
      if (prov === 'giphy' && GIPHY_KEY) {
        const q = isGifFirst ? queryGif : queryPhoto
        const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=50&rating=g`
        const res = await fetchWithTimeout(url, { cache: 'no-store' })
        if (res?.ok) {
          const data: any = await res.json()
          const items: any[] = data?.data || []
          if (items.length) {
            const g: any = pick(items)
            const urlGif: string | undefined =
              g?.images?.original?.url || g?.images?.downsized_large?.url || g?.images?.downsized?.url
            if (urlGif) {
              const item = {
                type: 'image' as const,
                url: urlGif,
                thumbUrl: g?.images?.fixed_width?.url || null,
                source: { name: 'Giphy', url: g?.url || urlGif },
              }
              await upsertCache('image', { url: urlGif }, { thumb: item.thumbUrl, source: item.source, provider: 'giphy' })
              await touchLastShown('image', { url: urlGif })
              return item
            }
          }
        }
      }

      if (prov === 'tenor' && TENOR_KEY) {
        const q = isGifFirst ? queryGif : queryPhoto
        const viaTenor = await fetchFromTenor(q)
        if (viaTenor) return viaTenor
      }

      if (prov === 'pexels' && PEXELS_KEY) {
        const q = queryPhoto
        const url = `https://api.pexels.com/v1/search?per_page=80&query=${encodeURIComponent(q)}`
        const res = await fetchWithTimeout(url, { headers: { Authorization: PEXELS_KEY }, cache: 'no-store' })
        if (res?.ok) {
          const data: any = await res.json()
          const photos: any[] = data?.photos || []
          if (photos.length) {
            const p: any = pick(photos)
            const src: any = p?.src || {}
            const urlImg: string | undefined = src.large2x || src.large || src.original
            if (urlImg) {
              const item = { type:'image' as const, url: urlImg, thumbUrl: src.medium || null, source: { name:'Pexels', url: p?.url || urlImg } }
              await upsertCache('image', { url: urlImg }, { thumb: item.thumbUrl, source: item.source, provider: 'pexels' })
              await touchLastShown('image', { url: urlImg })
              return item
            }
          }
        }
      }

      if (prov === 'pixabay') {
        const q = queryPhoto
        const viaPixabay = await fetchFromPixabay(q)
        if (viaPixabay) return viaPixabay
      }

      if (prov === 'unsplash' && UNSPLASH_KEY) {
        const q = queryPhoto
        const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&count=1&client_id=${UNSPLASH_KEY}`
        const res = await fetchWithTimeout(url, { cache: 'no-store' })
        if (res?.ok) {
          const data: any = await res.json()
          const it: any = Array.isArray(data) ? data[0] : data
          const urls: any = it?.urls || {}
          const url2: string | undefined = urls.regular || urls.full
          if (url2) {
            const item = { type:'image' as const, url: url2, thumbUrl: urls.small || null, source: { name:'Unsplash', url:(it?.links && it.links.html) || url2 } }
            await upsertCache('image', { url: url2 }, { thumb: item.thumbUrl, source: item.source, provider: 'unsplash' })
            await touchLastShown('image', { url: url2 })
            return item
          }
        }
      }

      if (prov === 'imgflip') {
        const viaImgflip = await fetchFromImgflip()
        if (viaImgflip) return viaImgflip
      }
    } catch {
      /* try next provider */
    }
  }

  const cached = await sampleFromCache('image')
  if (cached?.url) {
    await touchLastShown('image', { url: cached.url })
    return {
      type: 'image' as const,
      url: cached.url,
      thumbUrl: cached.thumb || null,
      source: cached.source || { name: cached.provider || 'cache', url: cached.url },
    }
  }

  return null
}

/* ------------------------------ LIVE: QUOTE/FACT/JOKE --------------------- */

/* --- NEW: anti-repeat buffer for quotes --- */
const recentQuotes: string[] = []
function markRecentQuote(text: string) {
  const t = (text || '').trim()
  if (!t) return
  const i = recentQuotes.indexOf(t)
  if (i >= 0) recentQuotes.splice(i, 1)
  recentQuotes.push(t)
  if (recentQuotes.length > 30) recentQuotes.shift()
}
const isRecentQuote = (t?: string) => !!t && recentQuotes.includes((t || '').trim())

/* --- REPLACED: fetchLiveQuote keeps providers + DB + local --- */
async function fetchLiveQuote(): Promise<any | null> {
  const base = process.env.QUOTABLE_BASE || 'https://api.quotable.io'

  // 1) Try batch from provider
  try {
    const res = await fetchWithTimeout(`${base}/quotes/random?limit=5`, { cache: 'no-store' })
    if (res?.ok) {
      const data: any[] = await res.json()
      const candidates = (Array.isArray(data) ? data : [data])
        .filter(q => q?.content && !isRecentQuote(q.content))

      const q = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null

      if (q?.content) {
        const item = {
          type: 'quote' as const,
          text: q.content,
          author: q.author || '',
          source: { name: 'Quotable', url: 'https://quotable.io' },
          provider: 'quotable',
        }
        upsertCache('quote', { text: item.text }, {
          author: item.author,
          source: item.source,
          provider: item.provider,
        })
        touchLastShown('quote', { text: item.text })
        markRecentQuote(item.text)
        return item
      }
    }
  } catch {}

  // 2) DB cache (exclude recent)
  const cached = await sampleQuoteFromCache()
  if (cached?.text) {
    touchLastShown('quote', { text: cached.text })
    markRecentQuote(cached.text)
    return {
      type: 'quote' as const,
      text: cached.text,
      author: cached.author || '',
      source: cached.source || { name: cached.provider || 'cache', url: '' },
    }
  }

  // 3) Local last-resort
  const local = [
    'Simplicity is the soul of efficiency.',
    'Make it work, make it right, make it fast.',
    'Creativity is intelligence having fun.',
    'The best way to predict the future is to invent it.'
  ]
  const text = local.find(t => !isRecentQuote(t)) || local[Math.floor(Math.random() * local.length)]
  markRecentQuote(text)
  return { type: 'quote' as const, text, author: '', source: { name: 'Local', url: '' } }
}

/* ---------------- FACTS: multi-providers + timeouts (patch important) --------------- */

const FACT_HEADERS = { 'User-Agent': 'RandomAppBot/1.0 (+https://example.com)' }
async function fetchJson(url: string, timeoutMs = 6000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', headers: FACT_HEADERS, signal: ctrl.signal as any })
    if (!res.ok) return null
    return await res.json()
  } catch { return null } finally { clearTimeout(t) }
}

async function factUselessfacts() {
  const base = process.env.USELESSFACTS_BASE || 'https://uselessfacts.jsph.pl'
  const d: any = await fetchJson(`${base}/random.json?language=en`)
  const text = (d?.text || d?.data || '').toString().trim()
  return text ? { text, source: { name: 'UselessFacts', url: 'https://uselessfacts.jsph.pl' } } : null
}
async function factNumbers() {
  const d: any = await fetchJson('https://numbersapi.com/random/trivia?json')
  const text = (d?.text || '').toString().trim()
  return text ? { text, source: { name: 'Numbers API', url: 'https://numbersapi.com' } } : null
}
async function factCat() {
  const d: any = await fetchJson('https://catfact.ninja/fact')
  const text = (d?.fact || '').toString().trim()
  return text ? { text, source: { name: 'catfact.ninja', url: 'https://catfact.ninja' } } : null
}
async function factMeow() {
  const d: any = await fetchJson('https://meowfacts.herokuapp.com/')
  const text = (Array.isArray(d?.data) ? d.data[0] : '').toString().trim()
  return text ? { text, source: { name: 'meowfacts', url: 'https://meowfacts.herokuapp.com' } } : null
}
async function factDog() {
  const d: any = await fetchJson('https://dogapi.dog/api/facts')
  const text = (Array.isArray(d?.facts) ? d.facts[0] : '').toString().trim()
  return text ? { text, source: { name: 'dogapi.dog', url: 'https://dogapi.dog' } } : null
}
function shuffle<T>(arr: T[]) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] } return arr }

async function fetchLiveFact(): Promise<any | null> {
  const providers = shuffle([factUselessfacts, factNumbers, factCat, factMeow, factDog])
  for (const p of providers) {
    try {
      const f = await p()
      if (f?.text) return { type: 'fact' as const, text: f.text, source: f.source }
    } catch {}
  }
  const cached = await sampleFromCache('fact')
  if (cached?.text) {
    touchLastShown('fact', { text: cached.text })
    return { type: 'fact' as const, text: cached.text, source: cached.source || { name: cached.provider || 'cache', url: '' } }
  }
  const local = [
    'Honey never spoils.',
    'Octopuses have three hearts.',
    'Bananas are berries.',
    'A group of flamingos is a flamboyance.',
  ]
  const text = pick(local)
  upsertCache('fact', { text }, { source: { name: 'Local' }, provider: 'local' })
  touchLastShown('fact', { text })
  return { type: 'fact' as const, text, source: { name: 'Local', url: '' } }
}

/** Chuck Norris API */
async function fetchChuckNorrisJoke(): Promise<any | null> {
  const base = process.env.CHUCK_BASE || 'https://api.chucknorris.io'
  try {
    const res = await fetchWithTimeout(`${base}/jokes/random`, { cache: 'no-store' })
    if (!res?.ok) return null
    const d: any = await res.json()
    if (!d?.value) return null
    return {
      type: 'joke',
      text: d.value,
      url: d.url,
      source: { name: 'api.chucknorris.io', url: d.url },
      provider: 'chucknorris',
      id: d.id,
    }
  } catch { return null }
}

/** shortjokes.csv (fallback local) */
let SHORT_JOKES_CACHE: string[] | null = null
async function loadShortJokesCSV(): Promise<string[]> {
  if (SHORT_JOKES_CACHE) return SHORT_JOKES_CACHE
  try {
    const p = path.resolve(process.cwd(), process.env.SHORTJOKES_PATH || 'public/data/shortjokes.csv')
    const raw = await fs.readFile(p, 'utf8')
    SHORT_JOKES_CACHE = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    return SHORT_JOKES_CACHE
  } catch { SHORT_JOKES_CACHE = []; return [] }
}
async function getShortJokeFromCSV(): Promise<any | null> {
  const list = await loadShortJokesCSV()
  if (!list.length) return null
  const text = pick(list)
  return { type: 'joke', text, source: { name: 'local-csv' }, provider: 'shortjokes.csv' }
}

/** ✅ Jokes : répartition pondérée pour varier (JokeAPI / Chuck / CSV) */
async function fetchLiveJoke(): Promise<any | null> {
  const roll = Math.random()
  if (roll < 0.50) {
    try {
      const res = await fetchWithTimeout('https://v2.jokeapi.dev/joke/Any?type=single', { cache: 'no-store' })
      if (res?.ok) {
        const j: any = await res.json()
        if (j?.joke) return { type: 'joke', text: j.joke, source: { name: 'JokeAPI', url: 'https://jokeapi.dev' } }
      }
    } catch {}
    const chuck = await fetchChuckNorrisJoke(); if (chuck) return chuck
    const csv = await getShortJokeFromCSV();    if (csv)   return csv
    return null
  } else if (roll < 0.80) {
    const chuck = await fetchChuckNorrisJoke(); if (chuck) return chuck
    try {
      const res = await fetchWithTimeout('https://v2.jokeapi.dev/joke/Any?type=single', { cache: 'no-store' })
      if (res?.ok) {
        const j: any = await res.json()
        if (j?.joke) return { type: 'joke', text: j.joke, source: { name: 'JokeAPI', url: 'https://jokeapi.dev' } }
      }
    } catch {}
    const csv = await getShortJokeFromCSV(); if (csv) return csv
    return null
  } else {
    const csv = await getShortJokeFromCSV(); if (csv) return csv
    try {
      const res = await fetchWithTimeout('https://v2.jokeapi.dev/joke/Any?type=single', { cache: 'no-store' })
      if (res?.ok) {
        const j: any = await res.json()
        if (j?.joke) return { type: 'joke', text: j.joke, source: { name: 'JokeAPI', url: 'https://jokeapi.dev' } }
      }
    } catch {}
    const chuck = await fetchChuckNorrisJoke(); if (chuck) return chuck
    return null
  }
}

// ------------------------------ LIVE: VIDEO -------------------------------
const YT_ENDPOINT = 'https://www.googleapis.com/youtube/v3'
const KEYWORDS: string[] = [
 'weird','obscure','retro','vintage','lofi','lo-fi','analog','super 8','vhs','camcorder',
  'crt scanlines','mono audio','field recording','one take','bedroom recording','demo tape',
  'b-side','bootleg','lost media','found footage','public access tv','community tv',
  'radio archive','open reel','cassette rip','vinyl rip','shellac 78','archive footage',
  'home video','school recital','talent show','garage rehearsal','backyard session',
  'kitchen session','living room session','live session','studio live','acoustic set',
  'tiny desk style','busking','street performance','subway performance','rooftop concert',
  'basement show','barn session','porch session','campfire song','circle singing',
  'choir warmup','soundcheck','rehearsal take','improv jam','loop pedal','one man band',
  'homemade instrument','marble machine','toy orchestra','8bit music','chiptune','flash game',
  'pixel art cutscene','retro game intro','speedrun highlight','lan party',
  'amateur animation','paper stop motion','claymation','flipbook','stickman fight',
  'funny sketch','micro budget short','student film','no dialogue short',
  'outsider art','performance art','site specific art','happening','kinetic sculpture','sex','love','chocolate','sexy',
  'cake','cook','kitchen','sugar','recipe','vintage commercial','psa announcement','station ident','closing theme','end credits'
]
const COMBOS: [string, string][] = [ ['gospel','romania'], ['festival','village'], ['folk','iceland'], ['choir','argentina'], ['busking','japan'], ['retro game','speedrun'], ['home made','instrument'], ['toy','orchestra'], ['amateur','sport'], ['art','fun'], ['obscure','retro'], ['rare','game'], ['sea shanty','brittany'], ['sea shanty','cornwall'], ['polyphonic','georgia'], ['brass band','serbia'], ['klezmer','poland'], ['fado','lisbon'], ['flamenco','andalusia'], ['rebetiko','athens'], ['tarantella','naples'], ['cumbia','colombia'], ['forró','northeast brazil'], ['samba','bahia'], ['huapongo','mexico'], ['tango','buenos aires'], ['gnawa','essaouira'], ['rai','oran'], ['dabke','lebanon'], ['qawwali','lahore'], ['bhajan','varanasi'], ['enka','tokyo'], ['minyo','tohoku'], ['joik','sapmi'], ['yodel','tyrol'], ['bluegrass','kentucky'], ['old-time','appalachia'], ['zydeco','louisiana'], ['kora','mali'], ['mbira','zimbabwe'], ['hurdy-gurdy','drone'], ['nyckelharpa','folk'], ['charango','andean'], ['bandoneon','milonga'], ['oud','taqsim'], ['saz','anatolian'], ['kanun','takht'], ['duduk','lament'], ['kaval','shepherd'], ['bagpipes','procession'], ['steelpan','street'], ['handpan','improv'], ['theremin','noir'], ['washboard','skiffle'], ['lap steel','hawaiian'], ['hardanger','waltz'], ['tiny desk','cover'], ['tiny desk','choir'], ['living room','session'], ['kitchen','session'], ['porch','session'], ['barn','session'], ['backyard','concert'], ['rooftop','concert'], ['basement','show'], ['subway','performance'], ['market','busking'], ['train platform','choir'], ['church','reverb'], ['cave','echo'], ['lighthouse','stairwell'], ['factory','reverb'], ['courtyard','ensemble'], ['river bank','song'], ['forest','chorus'], ['tea house','duo'], ['izakaya','live'], ['yurt','jam'], ['vhs','concert'], ['camcorder','wedding'], ['super 8','parade'], ['black and white','choir'], ['sepia','waltz'], ['cassette','demo'], ['vinyl','rip'], ['reel to reel','transfer'], ['public access','variety'], ['local tv','showcase'], ['newsreel','march'], ['colorized','archive'], ['school','recital'], ['talent','show'], ['family','band'], ['birthday','serenade'], ['farewell','song'], ['lullaby','grandma'], ['flash','animation'], ['pixel','cutscene'], ['8bit','cover'], ['chip','remix'], ['crt','capture'], ['lan','party'], ['speedrun','glitch'], ['retro','longplay'], ['odd','sport'], ['rural','games'], ['stone','lifting'], ['log','toss'], ['banjo','spaghetti'], ['pingouin','synthwave'], ['moquette','symphonie'], ['baguette','laser'], ['chaussette','opera'], ['brume','karaoké'], ['pyramide','yodel'], ['pastèque','minuet'], ['escargot','free-jazz'], ['moustache','autotune'], ['chausson','dubstep'], ['fondue','breakbeat'], ['poney','maracas'], ['bibliothèque','techno'], ['chandelle','hip-hop'], ['parapluie','boléro'], ['cornichon','requiem'], ['béret','sitar'], ['météorite','berceuse'], ['citron','dissonance'], ['radis','madrigal'], ['cartouche','tamboo'], ['serpent','bal musette'], ['biscotte','koto'], ['zanzibar','trombone'], ['tortue','clapping'], ['larme','tambourin'], ['nuage','scat'], ['mouette','bossa'], ['glaçon','ragtime'], ['gruyère','chorale'], ['caméléon','vocoder'], ['chausson','kazoo'], ['tuba','grenadine'], ['haricot','fugue'], ['bretzel','ukulélé'], ['chou-fleur','clavecin'], ['pamplemousse','gamelan'], ['cornemuse','bubblegum'], ['pierre','beatbox'], ['sabayon','timbales'], ['yéti','harmonium'], ['cactus','bongos'], ['hamac','arpèges'], ['baleine','triangle'], ['girafe','sifflement'], ['lama','riff'], ['café','tremolo'], ['soufflé','chorus'], ['ampoule','bpm'], ['glacier','cassette'], ['patate','vibrato'], ['courgette','polyrythmie'], ['mangue','contrepoint'], ['poussière','refrain'], ['aquarium','dub'], ['navet','flanger'], ['fantôme','clave'], ['cerf-volant','toccata'], ['scaphandre','mazurka'], ['parpaing','salsa'], ['lutin','samba'], ['orage','menuet'], ['tornade','cadenza'], ['brouillard','beat'], ['valise','glissando'], ['tournesol','rave'], ['boussole','nocturne'], ['bouchon','aria'], ['gaufre','chorinho'], ['sardine','cantate'], ['chouette','grind'], ['mirabelle','groove'], ['crocodile','valse'], ['rose des vents','hocket'], ['bourdon','limbique'], ['cabane','syncopes'], ['fenouil','crescendo'], ['fourchette','counter-melody'], ['serrure','harmoniques'], ['ballon','distorsion'], ['soucoupe','reverb'], ['marmotte','fadeout'], ['moutarde','autopan'], ['pastel','sidechain'], ['puzzle','clave'], ['cathédrale','lo-fi'], ['cymbale','confettis'], ['pissenlit','drop'], ['brouette','riff'], ['tapir','chorale'], ['pluie','sample'], ['savonnette','drone'], ['poubelle','oratorio'], ['carton','808'], ['bretelle','arpège'], ['bourricot','syncopé'], ['clairière','harmonie'], ['kiwi','sustain'], ['grenouille','snare'] ]
const recentVideoIds: string[] = []
function markRecentVideo(id: string) { const i = recentVideoIds.indexOf(id); if (i >= 0) recentVideoIds.splice(i, 1); recentVideoIds.push(id); if (recentVideoIds.length > 30) recentVideoIds.shift() }
const isRecentVideo = (id?: string) => !!id && recentVideoIds.includes(id)
function buildYouTubeQuery(): string { return Math.random() < 0.45 ? pick(KEYWORDS) : `${pick(COMBOS)[0]} ${pick(COMBOS)[1]}` }

async function fetchFromRedditFunnyYouTube(): Promise<any | null> {
  try {
    const res = await fetchWithTimeout('https://www.reddit.com/r/funnyvideos/.json?limit=20', { cache: 'no-store' })
    if (!res?.ok) return null
    const j: any = await res.json()
    const posts: any[] = j?.data?.children?.map((c: any) => c?.data).filter(Boolean) || []
    const yt = posts.filter(p => /youtu\.be\/|youtube\.com\/watch\?/.test((p?.url || '').toString()))
    if (!yt.length) return null
    const p = pick(yt)
    const url: string = p.url
    let id = ''
    try { const u = new URL(url); if (u.hostname.includes('youtu')) id = u.searchParams.get('v') || u.pathname.split('/').pop() || '' } catch {}
    if (!id) return null

    const title = (p?.title || '').toString()
    const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    const item = { type: 'video' as const, url, thumbUrl: thumb, text: title, source: { name: 'Reddit', url: `https://www.reddit.com${p?.permalink || ''}` } }
    await upsertCache('video', { videoId: id }, { title, thumb, provider: 'reddit-youtube' })
    await touchLastShown('video', { videoId: id })
    return item
  } catch { return null }
}

async function fetchFromVimeo(query: string): Promise<any | null> {
  const token = process.env.VIMEO_ACCESS_TOKEN
  if (!token) return null
  try {
    const u = new URL('https://api.vimeo.com/videos')
    u.searchParams.set('query', query)
    u.searchParams.set('per_page', '20')
    u.searchParams.set('sort', 'relevant')
    const res = await fetchWithTimeout(u.toString(), { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
    if (!res?.ok) return null
    const d: any = await res.json()
    const arr: any[] = d?.data || []
    if (!arr.length) return null
    const v = pick(arr)
    const link: string = v?.link || ''
    const pictures = v?.pictures?.sizes || []
    const og = (pictures[pictures.length - 1]?.link) || (pictures[0]?.link) || null
    const title = (v?.name || '').toString()

    const item = { type: 'web' as const, url: link, text: title || link, ogImage: og, source: { name: 'Vimeo', url: link } }
    await upsertCache('web', { url: link }, { title: item.text, ogImage: og, provider: 'vimeo' })
    await touchLastShown('web', { url: link })
    return item
  } catch { return null }
}

async function fetchLiveVideo(): Promise<any | null> {
  const KEY = process.env.YOUTUBE_API_KEY
  const roll = Math.random()

  if (roll < 0.60) {
    if (!KEY) {
      const cached = await sampleFromCache('video')
      if (cached?.videoId || cached?.url) {
        const id = cached.videoId || ''
        const u  = cached.url || (id ? `https://youtu.be/${id}` : '')
        if (u) {
          if (id) touchLastShown('video', { videoId: id })
          return { type:'video', url: u, thumbUrl: cached.thumb || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined), text: cached.title || '', source: { name:'YouTube', url: u } }
        }
      }
    } else {
      const q = buildYouTubeQuery()
      const publishedAfter = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString()
      const params = new URLSearchParams({ key: KEY, part: 'snippet', type: 'video', maxResults: '25', q, order: Math.random() < 0.5 ? 'date' : 'relevance', publishedAfter, videoEmbeddable: 'true' })
      try {
        const res = await fetchWithTimeout(`${YT_ENDPOINT}/search?${params.toString()}`, { cache: 'no-store' })
        if (res?.ok) {
          const data: any = await res.json()
          const items: any[] = data?.items || []
          const pool = items.filter((it: any) => !isRecentVideo(it?.id?.videoId))
          const chosen: any = (pool.length ? pool : items)[Math.floor(Math.random() * (pool.length ? pool.length : items.length))] || null
          const id: string | undefined = chosen?.id?.videoId
          const sn: any = chosen?.snippet
          if (id) {
            markRecentVideo(id)
            const item = { type:'video' as const, url:`https://youtu.be/${id}`, thumbUrl:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, text:sn?.title || '', source:{ name:'YouTube', url:`https://youtu.be/${id}` } }
            upsertCache('video', { videoId: id }, { title: item.text, thumb: item.thumbUrl, provider: 'youtube' })
            touchLastShown('video', { videoId: id })
            return item
          }
        }
      } catch {}
    }
  }

  if (roll >= 0.60 && roll < 0.85) {
    const viaReddit = await fetchFromRedditFunnyYouTube()
    if (viaReddit) return viaReddit
  }

  const q2 = buildYouTubeQuery()
  const viaVimeo = await fetchFromVimeo(q2)
  if (viaVimeo) return viaVimeo

  const cached = await sampleFromCache('video')
  if (cached?.videoId || cached?.url) {
    const id = cached.videoId || ''
    const u  = cached.url || (id ? `https://youtu.be/${id}` : '')
    if (u) {
      if (id) touchLastShown('video', { videoId: id })
      return { type:'video', url: u, thumbUrl: cached.thumb || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined), text: cached.title || '', source: { name:'YouTube', url: u } }
    }
  }

  const cachedWeb = await sampleFromCache('web', { provider: 'vimeo' })
  if (cachedWeb?.url) {
    touchLastShown('web', { url: cachedWeb.url })
    return { type: 'web', url: cachedWeb.url, text: cachedWeb.title || cachedWeb.url, ogImage: cachedWeb.ogImage || null, source: { name: 'Vimeo', url: cachedWeb.url } }
  }

  return null
}

// ------------------------------- LIVE: WEB --------------------------------
const recentHosts: string[] = []
function markRecentHost(h: string) { const i = recentHosts.indexOf(h); if (i >= 0) recentHosts.splice(i, 1); recentHosts.push(h); if (recentHosts.length > 30) recentHosts.shift() }
const isRecentHost = (h?: string) => !!h && recentHosts.includes(h)

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

async function fetchLiveWeb(): Promise<any | null> {
  const KEY = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_API_KEY
  const CX  = process.env.GOOGLE_CSE_CX  || process.env.GOOGLE_CSE_ID

  if (!KEY || !CX) {
    const cached = await sampleFromCache('web')
    if (cached?.url) {
      touchLastShown('web', { url: cached.url })
      return { type:'web', url: cached.url, text: cached.title || cached.host || cached.url, ogImage: cached.ogImage || null, source: { name:'cache', url: cached.url } }
    }
    return null
  }

  const A = ['weird','forgotten','retro','vintage','ascii','obscure','random','tiny','handmade','zine','folk','outsider','underground','amateur','mini','old web','geocities','blogspot','freewebs','tripod','myspace','lofi','lo-fi','pixel','8bit','chiptune','crt','scanlines','vhs','camcorder','super 8','blinkies','glitter','marquee','under construction','guestbook-core','y2k','webcore','brutalist','demoscene','net.art','netlabel','homebrew','shareware','abandonware','warez','torrent-era','java applet','shockwave','flash','frameset','table layout','iframes','cursor trail','hit counter','animated gif','sprite','midi','soundfont','winamp skin','realplayer','quicktime','silverlight','bbs','gopher','telnet','irc','icq','msn','aim','neocities']
  const B = ['blog','diary','gallery','generator','zine','festival','toy','museum','game','playlist','lyrics','fan page','tutorial','archive','personal site','homepage','forum','webring','guestbook','shoutbox','tagboard','message board','bulletin board','imageboard','chan','wiki','knowledge base','faq','how-to','cookbook','cheatsheet','guide','blogroll','link list','directory','portal','start page','topsites','ring hub','rss feed','newsletter','mirror','ftp dump','pastebin','snippet vault','userscripts','bookmarklet','rom hack','mod','skin pack','cursor pack','icon set','avatar gallery','wallpaper pack','screensaver','soundfont pack','midi pack','sprite sheet','tileset','amv hub','fanfic archive','scanlation','pet game','virtual pet','clicker','quiz','personality test','shrine','guestmap','netlabel','tape archive','radio stream','dj set','mix series','field recordings','toolkit','toybox','sandbox','playground','lab','experiments']
  const C = ['1998','2003','2007','romania','argentina','finland','iceland','japan','france','village','basement','attic','garage','1996','1999','2000','2001','2002','2004','2005','2006','2008','2009','2010','2012','poland','serbia','georgia','brittany','sardinia','mexico','brazil','colombia','morocco','lebanon','turkey','greece','portugal','scotland','internet cafe','cybercafe','school computer lab','library','dorm room','bedroom','rooftop','cellar','shed','barn','market square','village hall','church hall','community center','subway','train platform','pier','lighthouse','forest','river bank']
  const q = `${pick(A)} ${pick(B)} ${pick(C)}`
  const start = String([1,1,1,11,21,31][Math.floor(Math.random()*6)])
  const num = String([10,10,10,9,8][Math.floor(Math.random()*5)])

  try {
    const res = await fetchWithTimeout(`https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CX}&q=${encodeURIComponent(q)}&num=${num}&start=${start}&safe=off`, { cache: 'no-store' })
    if (!res?.ok) throw new Error('cse-failed')
    const data: any = await res.json()
    const items: any[] = data?.items || []
    const chosen: any = items[Math.floor(Math.random() * (items.length || 1))] || null
    const link: string | undefined = chosen?.link
    if (!link) throw new Error('no-link')

    let host = ''
    try { host = new URL(link).host.replace(/^www\./,'') } catch {}
    markRecentHost(host)

    const ogImage = await fetchOgImage(link)
    const item = { type:'web', url: link, text: chosen?.title || host || link, ogImage: ogImage || null, source: { name:'Google', url: link } }
    upsertCache('web', { url: link }, { title: item.text, host, ogImage: item.ogImage, provider: 'google-cse' })
    touchLastShown('web', { url: link })
    return item
  } catch {
    const cached = await sampleFromCache('web')
    if (cached?.url) {
      touchLastShown('web', { url: cached.url })
      return { type:'web', url: cached.url, text: cached.title || cached.host || cached.url, ogImage: cached.ogImage || null, source: { name:'cache', url: cached.url } }
    }
    return null
  }
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
      let it: any | null = null
      if (t === 'image') it = await fetchLiveImage()
      else if (t === 'video') it = await fetchLiveVideo()      // ⬅ garde ta version
      else if (t === 'quote') it = await fetchLiveQuote()
      else if (t === 'joke')  it = await fetchLiveJoke()
      else if (t === 'fact')  it = await fetchLiveFact()
      else if (t === 'web')   it = await fetchLiveWeb()        // ⬅ garde ta version
      if (it) return NextResponse.json({ item: it })
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
      return NextResponse.json({
        item: { type: 'quote' as const, text, author: '', source: { name: 'Local', url: '' } }
      })
    }

    const img = pick(FB_IMAGES)
    return NextResponse.json({
      item: { type: 'image' as const, url: img, source: { name: 'Unsplash', url: img } }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
