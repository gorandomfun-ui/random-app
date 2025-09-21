// lib/fetchers.ts
export type ContentItem = {
  type: 'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'
  lang?: 'en' | 'fr' | 'de' | 'jp'
  text?: string
  author?: string
  url?: string
  thumbUrl?: string
  width?: number
  height?: number
  source?: { name?: string; url?: string }
  tags?: string[]
  nsfw?: boolean
}

const PEXELS_KEY = process.env.PEXELS_API_KEY
const GIPHY_KEY = process.env.GIPHY_API_KEY

// ————— PEXELS (images) —————
export async function fetchPexelsRandomImage(): Promise<ContentItem | null> {
  if (!PEXELS_KEY) return null
  // On fait une recherche large et on tire au sort dans les résultats
  const topics = ['weird', 'abstract', 'retro', 'neon', 'macro', 'pattern', 'texture', 'odd']
  const q = topics[Math.floor(Math.random() * topics.length)]
  const page = 1 + Math.floor(Math.random() * 10)
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=40&page=${page}`

  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } })
  if (!res.ok) return null
  const data = await res.json()
  const photos = Array.isArray(data.photos) ? data.photos : []
  if (!photos.length) return null

  const p = photos[Math.floor(Math.random() * photos.length)]
  return {
    type: 'image',
    lang: 'en',
    url: p.src?.large || p.src?.original,
    thumbUrl: p.src?.medium || p.src?.small,
    width: p.width,
    height: p.height,
    source: { name: 'Pexels', url: p.url },
    tags: [q],
    nsfw: false,
  }
}

// ————— GIPHY (GIF bizarres) —————
export async function fetchGiphyWeird(): Promise<ContentItem | null> {
  if (!GIPHY_KEY) return null
  const tags = ['weird', 'glitch', 'trippy', 'retro', 'vaporwave']
  const tag = tags[Math.floor(Math.random() * tags.length)]
  const url = `https://api.giphy.com/v1/gifs/random?api_key=${GIPHY_KEY}&tag=${encodeURIComponent(tag)}&rating=pg-13`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const g = data?.data
  const gifUrl = g?.images?.original?.url || g?.image_url
  if (!gifUrl) return null

  return {
    type: 'image', // on traite le GIF comme une image animée pour l’instant
    lang: 'en',
    url: gifUrl,
    thumbUrl: g?.images?.downsized_small?.mp4 || g?.images?.preview_gif?.url,
    width: Number(g?.images?.original?.width) || undefined,
    height: Number(g?.images?.original?.height) || undefined,
    source: { name: 'GIPHY', url: g?.url },
    tags: [tag, 'gif'],
    nsfw: false,
  }
}

// ————— QUOTES (ZenQuotes) —————
export async function fetchQuote(): Promise<ContentItem | null> {
  // ZenQuotes n'exige pas de clé (idéal pour démarrer)
  const res = await fetch('https://zenquotes.io/api/random', { cache: 'no-store' })
  if (!res.ok) return null
  const arr = await res.json()
  const q = Array.isArray(arr) ? arr[0] : null
  if (!q?.q) return null
  return {
    type: 'quote',
    lang: 'en',
    text: q.q,
    author: q.a,
    source: { name: 'ZenQuotes', url: 'https://zenquotes.io' },
  }
}

// ————— FACTS (Useless Facts) —————
export async function fetchFact(lang: 'en' | 'fr' | 'de' | 'jp' = 'en'): Promise<ContentItem | null> {
  // API supporte surtout EN; pour d'autres langues on retombe sur EN
  const l = ['en', 'fr', 'de'].includes(lang) ? lang : 'en'
  const url = `https://uselessfacts.jsph.pl/api/v2/facts/random?language=${l}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  const text = data?.text || data?.data
  if (!text) return null
  return {
    type: 'fact',
    lang: l as any,
    text,
    source: { name: 'Useless Facts', url: 'https://uselessfacts.jsph.pl' },
  }
}
