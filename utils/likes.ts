// utils/likes.ts
export type LikeType = 'image' | 'video' | 'web' | 'quote' | 'joke' | 'fact'

export type LikeItem = {
  id: string
  type: LikeType
  url?: string
  text?: string
  thumbUrl?: string | null
  title?: string
  ogImage?: string | null
  provider?: string
  theme?: { bg: string; deep: string; cream: string; text: string }
  likedAt: number
}

export type GlobalLikeItem = LikeItem & {
  count: number
}

const KEY = 'likes'               // <- important: aligne avec l’existant
const TTL = 24 * 60 * 60 * 1000   // 24h

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}
function setStore(arr: LikeItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)) } catch {}
}
function hash(t: string) { let h=0; for (let i=0;i<t.length;i++) h=((h<<5)-h)+t.charCodeAt(i)|0; return String(h) }

type SourceLike = {
  name?: string | null
  url?: string | null
} | null | undefined

export type LikeablePayload = {
  _id?: string | number | null
  type: LikeType
  url?: string | null
  text?: string | null
  author?: string | null
  title?: string | null
  thumbUrl?: string | null
  ogImage?: string | null
  provider?: string | null
  source?: SourceLike
}

function normaliseIdCandidate(value?: string | number | null): string | null {
  if (value == null) return null
  return String(value)
}

function cleanUrl(value?: string | null): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function getSourceName(source: SourceLike, fallback?: string | null): string {
  if (source && typeof source === 'object' && source.name && source.name.trim()) {
    return source.name.trim()
  }
  return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : ''
}

export function buildId(payload: LikeablePayload | null | undefined): string {
  if (!payload) return String(Date.now())
  const explicitId = normaliseIdCandidate(payload._id)
  if (explicitId) return explicitId

  const type = payload.type || 'web'
  if (type === 'video') {
    try {
      const rawUrl = cleanUrl(payload.url)
      const u = rawUrl ? new URL(rawUrl) : new URL('https://example.com')
      const videoId = u.searchParams.get('v') || u.pathname.split('/').pop() || ''
      return `video:${videoId || rawUrl || Date.now()}`
    } catch {
      return `video:${payload.url || Date.now()}`
    }
  }

  const url = cleanUrl(payload.url)
  if (type === 'image' || type === 'web') {
    return `${type}:${url || Date.now()}`
  }

  const text = payload.text || payload.author
  if (text) return `${type}:${hash(text)}`

  return `${type}:${Date.now()}`
}

export function getAll(): LikeItem[] {
  try {
    const now = Date.now()
    const arr = safeParse<LikeItem[]>(localStorage.getItem(KEY), [])
    const fresh = arr.filter(x => now - x.likedAt < TTL)
    if (fresh.length !== arr.length) setStore(fresh)
    return fresh
  } catch { return [] }
}

export const getLikes = getAll

export function saveLike(payload: LikeablePayload, theme?: LikeItem['theme']) {
  try {
    const arr = getAll()
    const id = buildId(payload)
    const idx = arr.findIndex(x => x.id === id)
    const item: LikeItem = {
      id,
      type: payload.type,
      url: cleanUrl(payload.url) || undefined,
      text: payload.text || payload.author || '',
      thumbUrl: payload.thumbUrl ?? null,
      title: payload.title || '',
      ogImage: payload.ogImage ?? null,
      provider: getSourceName(payload.source, payload.provider) || undefined,
      theme,
      likedAt: Date.now(),
    }
    if (idx >= 0) arr.splice(idx, 1)
    arr.unshift(item)
    setStore(arr.slice(0, 200))

    void recordGlobalLike({ id, type: payload.type, item, theme })
  } catch {}
}

export const addLike = saveLike

export function removeLike(idOrItem: string | LikeablePayload) {
  const id = typeof idOrItem === 'string' ? idOrItem : buildId(idOrItem)
  try { setStore(getAll().filter(x => x.id !== id)) } catch {}
}

export function isLiked(payload: LikeablePayload): boolean {
  const id = buildId(payload)
  return getAll().some(x => x.id === id)
}

export function clearExpired() { getAll() }
export function clearAll() { try { localStorage.setItem(KEY, '[]') } catch {} }

async function recordGlobalLike(params: { id: string; type: LikeType; item: LikeItem; theme?: LikeItem['theme'] }) {
  try {
    if (typeof fetch !== 'function') return
    const { id, type, item, theme } = params
    await fetch('/api/likes/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        type,
        item: {
          url: item.url,
          text: item.text,
          title: item.title,
          thumbUrl: item.thumbUrl,
          ogImage: item.ogImage,
          provider: item.provider,
        },
        theme,
      }),
    }).catch(() => undefined)
  } catch {}
}

export async function fetchGlobalTop(limit = 100): Promise<GlobalLikeItem[]> {
  try {
    const res = await fetch(`/api/likes/top?limit=${encodeURIComponent(String(limit))}`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json().catch(() => null)
    if (!data || !Array.isArray(data.items)) return []
    const list = data.items as Array<Record<string, unknown>>
    return list.map((entry) => {
      const themeRecord = entry.theme && typeof entry.theme === 'object'
        ? entry.theme as Record<string, unknown>
        : null

      const theme = themeRecord
        ? {
            bg: typeof themeRecord.bg === 'string' ? themeRecord.bg : undefined,
            deep: typeof themeRecord.deep === 'string' ? themeRecord.deep : undefined,
            cream: typeof themeRecord.cream === 'string' ? themeRecord.cream : undefined,
            text: typeof themeRecord.text === 'string' ? themeRecord.text : undefined,
          }
        : undefined

      return {
        id: typeof entry.id === 'string' ? entry.id : String(entry.id || ''),
        type: entry.type as LikeType,
        url: typeof entry.url === 'string' ? entry.url : undefined,
        text: typeof entry.text === 'string' ? entry.text : undefined,
        title: typeof entry.title === 'string' ? entry.title : undefined,
        thumbUrl: typeof entry.thumbUrl === 'string' ? entry.thumbUrl : null,
        ogImage: typeof entry.ogImage === 'string' ? entry.ogImage : null,
        provider: typeof entry.provider === 'string' ? entry.provider : undefined,
        theme,
        likedAt: typeof entry.likedAt === 'number' ? entry.likedAt : Date.now(),
        count: typeof entry.count === 'number' ? entry.count : 0,
      }
    }) as GlobalLikeItem[]
  } catch {
    return []
  }
}
