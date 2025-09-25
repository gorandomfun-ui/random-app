import type { CandidateOrigin, ItemType } from './types'

const DAY_MS = 1000 * 60 * 60 * 24

const globalRecentItems: string[] = []
const globalRecentTopics: string[] = []
const globalRecentProviders: string[] = []
const globalRecentKeywords: string[] = []
const globalRecentOrigins: CandidateOrigin[] = []

function buildKey(type: ItemType, key?: string | null): string | null {
  if (!key) return null
  const normalized = String(key).trim().toLowerCase()
  if (!normalized) return null
  return `${type}:${normalized}`
}

export function markGlobalItem(type: ItemType, key?: string | null) {
  const globalKey = buildKey(type, key)
  if (!globalKey) return
  pushRecent(globalRecentItems, globalKey, 260)
}

export function isGlobalItemRecent(type: ItemType, key?: string | null): boolean {
  const globalKey = buildKey(type, key)
  if (!globalKey) return false
  return globalRecentItems.includes(globalKey)
}

export function markGlobalTopics(tags: string[]) {
  pushRecentMany(globalRecentTopics, tags, 220)
}

export function areTopicsGloballyRecent(tags: string[]): boolean {
  const normalized = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
  if (!normalized.length) return false
  return normalized.every((tag) => globalRecentTopics.includes(tag))
}

export function markGlobalKeywords(words: string[]) {
  pushRecentMany(globalRecentKeywords, words, 260)
}

export function areKeywordsGloballyRecent(words: string[]): boolean {
  const normalized = words.map((word) => word.trim().toLowerCase()).filter(Boolean)
  if (!normalized.length) return false
  return normalized.every((word) => globalRecentKeywords.includes(word))
}

export function markGlobalProvider(provider?: string) {
  if (!provider) return
  pushRecent(globalRecentProviders, provider.trim().toLowerCase(), 140)
}

export function isProviderGloballyRecent(provider?: string): boolean {
  if (!provider) return false
  return globalRecentProviders.includes(provider.trim().toLowerCase())
}

export function markGlobalOrigin(origin: CandidateOrigin | 'fallback') {
  pushRecent(globalRecentOrigins, origin as CandidateOrigin, 160)
}

export function getRecentOriginsWindow(size: number): CandidateOrigin[] {
  return globalRecentOrigins.slice(-size)
}

function pushRecent<T>(list: T[], value: T | null | undefined, max: number) {
  if (value === null || value === undefined) return
  const idx = list.indexOf(value)
  if (idx >= 0) list.splice(idx, 1)
  list.push(value)
  while (list.length > max) list.shift()
}

function pushRecentMany<T>(list: T[], values: Iterable<T>, max: number) {
  for (const value of values) pushRecent(list, value, max)
  while (list.length > max) list.shift()
}

export const DAY_IN_MS = DAY_MS
