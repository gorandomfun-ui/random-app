// lib/likes.ts
export type LikeItem = {
  id: string
  createdAt: number // timestamp ms
  // Données affichables
  url?: string
  thumbUrl?: string
  text?: string
  author?: string
  source?: { name?: string; url?: string }
}

// stockage
const LS_KEY = 'random.likes.v1'
const TTL_MS = 24 * 60 * 60 * 1000 // 24h
const MAX_LIKES = 6

function now() {
  return Date.now()
}

function readRaw(): LikeItem[] {
  if (typeof window === 'undefined') return []
  try {
    const s = window.localStorage.getItem(LS_KEY)
    if (!s) return []
    const arr = JSON.parse(s) as LikeItem[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function write(arr: LikeItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(arr))
  } catch {}
}

function purgeExpired(arr: LikeItem[]) {
  const limit = now() - TTL_MS
  return arr.filter((it) => (it?.createdAt ?? 0) >= limit)
}

export function getLikes(): LikeItem[] {
  return purgeExpired(readRaw())
}

export function addLike(partial: Omit<LikeItem, 'id' | 'createdAt'>) {
  const list = getLikes()

  // Si déjà 6, on enlève le plus ancien (comportement simple & non bloquant)
  while (list.length >= MAX_LIKES) list.shift()

  const item: LikeItem = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(now()),
    createdAt: now(),
    url: partial.url,
    thumbUrl: partial.thumbUrl,
    text: partial.text,
    author: partial.author,
    source: partial.source,
  }

  list.push(item)
  write(list)
  return item
}

export function removeLike(id: string) {
  const list = getLikes().filter((it) => it.id !== id)
  write(list)
}

export function clearLikes() {
  write([])
}

// petit helper si tu veux savoir si une url est déjà likée
export function isLikedByUrl(url?: string) {
  if (!url) return false
  return getLikes().some((it) => it.url === url)
}
