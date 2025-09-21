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

export function buildId(p: any): string {
  if (!p) return String(Date.now())
  if (p._id) return String(p._id)
  if (p.type === 'video') {
    try { const u = new URL(p.url || ''); const v = u.searchParams.get('v') || u.pathname.split('/').pop() || ''; return `video:${v}` }
    catch { return `video:${p.url || Date.now()}` }
  }
  if (p.type === 'image' || p.type === 'web') return `${p.type}:${p.url || Date.now()}`
  if (p.text) return `${p.type}:${hash(p.text)}`
  return `${p.type}:${Date.now()}`
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

export function saveLike(payload: any, theme?: LikeItem['theme']) {
  try {
    const arr = getAll()
    const id = buildId(payload)
    const idx = arr.findIndex(x => x.id === id)
    const item: LikeItem = {
      id,
      type: payload.type,
      url: payload.url,
      text: payload.text || payload.author || '',
      thumbUrl: payload.thumbUrl ?? null,
      title: payload.title || '',
      ogImage: payload.ogImage ?? null,
      provider: payload.source?.name || payload.provider || '',
      theme,
      likedAt: Date.now(),
    }
    if (idx >= 0) arr.splice(idx, 1)
    arr.unshift(item)
    setStore(arr.slice(0, 200))
  } catch {}
}

export const addLike = saveLike

export function removeLike(idOrItem: string | any) {
  const id = typeof idOrItem === 'string' ? idOrItem : buildId(idOrItem)
  try { setStore(getAll().filter(x => x.id !== id)) } catch {}
}

export function isLiked(payload: any): boolean {
  const id = buildId(payload)
  return getAll().some(x => x.id === id)
}

export function clearExpired() { getAll() }
export function clearAll() { try { localStorage.setItem(KEY, '[]') } catch {} }
