import type { RandomContentItem } from '@/lib/random/clientTypes'
import {
  buildNoroscopeEntries,
  CACHE_STORAGE_KEY,
  CACHE_TTL_MS,
  TARGET_COUNT,
  type Lang,
} from '@/lib/noroscope/generator'
import {
  readWeLikesCache,
  WE_CACHE_TTL_MS,
  writeWeLikesCache,
} from '@/lib/likes/weCache'

export { WE_CACHE_KEY, WE_CACHE_TTL_MS } from '@/lib/likes/weCache'

/**
 * What the home warms besides the Random advance (`lib/discovery/homePrefetch.ts`):
 * the noroscope and the "we" likes.
 */

const noop = () => {}

let noroscopeQueue: Promise<void> = Promise.resolve()
let weQueue: Promise<void> = Promise.resolve()

export function startNoroscopePrefetch(lang: Lang) {
  if (typeof window === 'undefined') return
  noroscopeQueue = noroscopeQueue.then(() => ensureNoroscopeCache(lang)).catch(noop)
}

export function startWeLikePrefetch() {
  if (typeof window === 'undefined') return
  weQueue = weQueue.then(() => ensureWeLikesCache(true)).catch(noop)
}

async function ensureNoroscopeCache(lang: Lang) {
  if (typeof localStorage === 'undefined') return
  try {
    const storageKey = `${CACHE_STORAGE_KEY}-${lang}`
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as { timestamp?: number; entries?: RandomContentItem[]; lang?: Lang }
      const isFresh = typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp <= CACHE_TTL_MS
      const hasEntries = Array.isArray(parsed?.entries) && parsed.entries.length === TARGET_COUNT
      if (isFresh && hasEntries && parsed.lang === lang) {
        return
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const { entries, funPhrase } = await buildNoroscopeEntries(lang)
    const payload = { timestamp: Date.now(), entries, funPhrase, lang }
    localStorage.setItem(`${CACHE_STORAGE_KEY}-${lang}`, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

async function ensureWeLikesCache(force = false) {
  const cacheEntry = readWeLikesCache()
  if (!force && cacheEntry?.timestamp) {
    const isFresh = Date.now() - cacheEntry.timestamp <= WE_CACHE_TTL_MS
    if (isFresh) return
  }

  try {
    const res = await fetch(`/api/likes/top?limit=200`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (!data || !Array.isArray(data.items)) return
    const payload = { timestamp: Date.now(), items: data.items }
    writeWeLikesCache(payload)
  } catch {
    /* ignore */
  }
}
