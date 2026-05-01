export const WE_CACHE_KEY = 'we-likes-cache'
export const WE_CACHE_TTL_MS = 5 * 60 * 1000
export const WE_LIKES_INVALIDATED_EVENT = 'likes:we-invalidated'

export type WeLikesCachePayload<T = unknown> = {
  timestamp: number
  items: T[]
}

function parseWeLikesCache<T>(raw: string | null): WeLikesCachePayload<T> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { timestamp?: unknown; items?: unknown }
    if (!parsed || typeof parsed.timestamp !== 'number' || !Array.isArray(parsed.items)) {
      return null
    }
    return { timestamp: parsed.timestamp, items: parsed.items as T[] }
  } catch {
    return null
  }
}

export function readWeLikesCache<T = unknown>(): WeLikesCachePayload<T> | null {
  if (typeof window === 'undefined') return null

  try {
    const sessionEntry = parseWeLikesCache<T>(sessionStorage.getItem(WE_CACHE_KEY))
    if (sessionEntry) return sessionEntry
  } catch {
    /* ignore */
  }

  try {
    const localEntry = parseWeLikesCache<T>(localStorage.getItem(WE_CACHE_KEY))
    if (localEntry) return localEntry
  } catch {
    /* ignore */
  }

  return null
}

export function writeWeLikesCache(payload: WeLikesCachePayload): void {
  if (typeof window === 'undefined') return
  const serialized = JSON.stringify(payload)

  try {
    sessionStorage.setItem(WE_CACHE_KEY, serialized)
  } catch {
    /* ignore */
  }

  try {
    localStorage.setItem(WE_CACHE_KEY, serialized)
  } catch {
    /* ignore */
  }
}

export function clearWeLikesCache(): void {
  if (typeof window === 'undefined') return

  try {
    sessionStorage.removeItem(WE_CACHE_KEY)
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem(WE_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

export function invalidateWeLikesCache(): void {
  clearWeLikesCache()
  if (typeof window === 'undefined') return

  try {
    window.dispatchEvent(new CustomEvent(WE_LIKES_INVALIDATED_EVENT))
  } catch {
    /* ignore */
  }
}
