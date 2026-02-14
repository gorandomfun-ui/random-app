import { fetchRandom, type RandomTypes } from '@/lib/api'
import type { ItemType } from '@/lib/random/types'
import type { RandomContentItem } from '@/lib/random/clientTypes'
import { FIXED_SEQUENCE, type SequenceEntry } from '@/lib/random/sequence'
import {
  buildNoroscopeEntries,
  CACHE_STORAGE_KEY,
  CACHE_TTL_MS,
  TARGET_COUNT,
  type Lang,
} from '@/lib/noroscope/generator'

const RANDOM_PREFETCH_PREFIX = 'random-prefetch-'
const MAX_PREFETCH_ITEMS_PER_TYPE = 4
const PREFETCH_CYCLES = 2

const DEFAULT_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']

const noop = () => {}

let randomInFlight: Promise<void> | null = null
let pendingRandomRequest: { lang: Lang; types: ItemType[] } | null = null
let noroscopeQueue: Promise<void> = Promise.resolve()
let weQueue: Promise<void> = Promise.resolve()

export const WE_CACHE_KEY = 'we-likes-cache'
export const WE_CACHE_TTL_MS = 5 * 60 * 1000

export function startRandomPrefetch(lang: Lang, selectedTypes: ItemType[]) {
  if (typeof window === 'undefined') return
  const snapshot = [...(selectedTypes?.length ? selectedTypes : DEFAULT_TYPES)]
  enqueueRandomPrefetch({ lang, types: snapshot })
}

export function startNoroscopePrefetch(lang: Lang) {
  if (typeof window === 'undefined') return
  noroscopeQueue = noroscopeQueue.then(() => ensureNoroscopeCache(lang)).catch(noop)
}

export function startWeLikePrefetch() {
  if (typeof window === 'undefined') return
  weQueue = weQueue.then(() => ensureWeLikesCache()).catch(noop)
}

async function runRandomPrefetch(lang: Lang, selectedTypes: ItemType[]) {
  const allowed = new Set<ItemType>(selectedTypes.length ? selectedTypes : DEFAULT_TYPES)
  const sequence = resolveSequence(allowed)
  if (!sequence.length) return

  for (let cycle = 0; cycle < PREFETCH_CYCLES; cycle++) {
    for (const slot of sequence) {
      await attemptPrefetchSlot(lang, slot)
    }
  }
}

function enqueueRandomPrefetch(request: { lang: Lang; types: ItemType[] }) {
  const start = () => {
    randomInFlight = runRandomPrefetch(request.lang, request.types)
      .catch(noop)
      .finally(() => {
        randomInFlight = null
        if (pendingRandomRequest) {
          const next = pendingRandomRequest
          pendingRandomRequest = null
          enqueueRandomPrefetch(next)
        }
      })
  }

  if (randomInFlight) {
    pendingRandomRequest = request
    return
  }

  start()
}

type SequenceSlot = { itemType: ItemType; requireQuiz?: boolean }

function resolveSequence(allowed: Set<ItemType>): SequenceSlot[] {
  const slots: SequenceSlot[] = []
  for (const entry of FIXED_SEQUENCE) {
    const resolved = resolveEntry(entry, allowed)
    if (resolved) slots.push(resolved)
  }
  if (!slots.length) {
    const fallback: ItemType = allowed.values().next().value ?? 'fact'
    slots.push({ itemType: fallback })
  }
  return slots
}

function resolveEntry(entry: SequenceEntry, allowed: Set<ItemType>): SequenceSlot | null {
  if (entry.kind === 'fixed') {
    if (!allowed.has(entry.itemType)) return null
    return { itemType: entry.itemType }
  }
  if (entry.kind === 'choices') {
    const available = entry.types.filter((type) => allowed.has(type))
    if (!available.length) return null
    const chosen = available[Math.floor(Math.random() * available.length)]
    return { itemType: chosen }
  }
  if (entry.kind === 'quiz') {
    if (!allowed.has(entry.itemType)) return null
    return { itemType: entry.itemType, requireQuiz: true }
  }
  return null
}

async function attemptPrefetchSlot(lang: Lang, slot: SequenceSlot) {
  const maxAttempts = 4
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const item = await fetchItemOfType(slot.itemType, lang)
    if (!item) continue
    if (slot.requireQuiz && item.type === 'fact' && (item as { variant?: string }).variant !== 'quiz') {
      continue
    }
    const stored = storePrefetchedItem(lang, slot.itemType, item)
    if (stored) break
  }
}

async function fetchItemOfType(type: ItemType, lang: Lang): Promise<RandomContentItem | null> {
  try {
    const res = await fetchRandom({ types: [type] as RandomTypes, lang })
    const item = res?.item ?? null
    if (!item || item.type !== type) return null
    return item
  } catch {
    return null
  }
}

function readPrefetchBucket(key: string): { lang?: Lang; items: RandomContentItem[] } | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      const bucketEntries = (parsed as { items?: unknown[] }).items ?? []
      const bucketItems: RandomContentItem[] = []
      bucketEntries.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return
        const typedEntry = entry as Partial<RandomContentItem> & { type?: ItemType }
        if (!typedEntry.type) return
        bucketItems.push(entry as RandomContentItem)
      })
      const lang = (parsed as { lang?: Lang }).lang
      return { lang, items: bucketItems }
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { item?: RandomContentItem }).item &&
      typeof (parsed as { item?: RandomContentItem }).item === 'object'
    ) {
      return {
        lang: (parsed as { lang?: Lang }).lang,
        items: [(parsed as { item: RandomContentItem }).item],
      }
    }
    return null
  } catch {
    return null
  }
}

function storePrefetchedItem(lang: Lang, type: ItemType, item: RandomContentItem): boolean {
  if (typeof sessionStorage === 'undefined') return false
  const key = `${RANDOM_PREFETCH_PREFIX}${lang}-${type}`
  const bucket = readPrefetchBucket(key) ?? { lang, items: [] }
  if (bucket.items.length >= MAX_PREFETCH_ITEMS_PER_TYPE) return false
  bucket.items.push(item)
  try {
    sessionStorage.setItem(key, JSON.stringify(bucket))
    try {
      sessionStorage.removeItem(`${RANDOM_PREFETCH_PREFIX}${type}`)
    } catch {
      /* ignore */
    }
    return true
  } catch {
    return false
  }
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

function readWeLikesCache() {
  if (typeof window === 'undefined') return null
  const parse = (raw: string | null) => {
    if (!raw) return null
    try {
      return JSON.parse(raw) as { timestamp?: number; items?: unknown[] }
    } catch {
      return null
    }
  }
  try {
    const sessionEntry = parse(sessionStorage.getItem(WE_CACHE_KEY))
    if (sessionEntry) return sessionEntry
  } catch {
    /* ignore */
  }
  try {
    const localEntry = parse(localStorage.getItem(WE_CACHE_KEY))
    if (localEntry) return localEntry
  } catch {
    /* ignore */
  }
  return null
}

function writeWeLikesCache(payload: { timestamp: number; items: unknown[] }) {
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

async function ensureWeLikesCache() {
  const cacheEntry = readWeLikesCache()
  if (cacheEntry?.timestamp) {
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
