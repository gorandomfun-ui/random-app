/**
 * The labels that come from numbers and dates rather than from words:
 * how widely seen an item is, which era it belongs to, and who made it.
 */

import type { Era, ItemType, Popularity } from '../types'

/**
 * Thresholds taken from the catalogue's real distribution rather than round
 * numbers: 78% of videos are under 1,000 views, and the >1M bucket held both
 * modest 1.2M videos and 500M mega-hits.
 */
const NICHE_CEILING = 1_000
const MID_CEILING = 100_000
const KNOWN_CEILING = 2_000_000

/** A trend observation older than this no longer makes an item "trending". */
const TREND_WINDOW_DAYS = 14

/** Published this many years ago, or older, counts as retro. */
const RETRO_YEARS = 5

export function classifyPopularity(viewCount: number | null | undefined): Popularity {
  if (typeof viewCount !== 'number' || !Number.isFinite(viewCount) || viewCount < 0) return 'unknown'
  if (viewCount < NICHE_CEILING) return 'niche'
  if (viewCount < MID_CEILING) return 'mid'
  if (viewCount <= KNOWN_CEILING) return 'known'
  return 'mainstream'
}

/** A four-digit year in the title, when it is a plausible one. */
export function yearFromTitle(title: string | null | undefined, now: Date): number | undefined {
  if (!title) return undefined
  const currentYear = now.getUTCFullYear()
  const candidates = title.match(/\b(19\d{2}|20\d{2})\b/g)
  if (!candidates) return undefined
  const years = candidates.map(Number).filter((year) => year >= 1900 && year <= currentYear)
  if (!years.length) return undefined
  // The oldest plausible year wins: "Best of 1987 (2024 remaster)" is about 1987.
  return Math.min(...years)
}

export type EraInput = {
  publishedAt?: Date | null
  trendObservedAt?: Date | null
  title?: string | null
}

export function classifyEra(input: EraInput, now = new Date()): Era {
  if (input.trendObservedAt) {
    const ageDays = (now.getTime() - input.trendObservedAt.getTime()) / 86_400_000
    if (ageDays >= 0 && ageDays < TREND_WINDOW_DAYS) return 'trend'
  }

  const retroThreshold = now.getUTCFullYear() - RETRO_YEARS

  if (input.publishedAt) {
    const publishedYear = input.publishedAt.getUTCFullYear()
    if (publishedYear <= retroThreshold) return 'retro'
    return 'recent'
  }

  const titleYear = yearFromTitle(input.title, now)
  if (titleYear !== undefined && titleYear <= retroThreshold) return 'retro'

  return 'unknown'
}

/**
 * The stable key identifying who made an item.
 *
 * Dailymotion's API calls a *category* a "channel" — `news`, `music`,
 * `shortfilms` — and stores the uploader under `owner`. Items ingested before
 * 2026-09-13 recorded the category here, which is why this function refuses
 * anything that is not a real Dailymotion owner id. A missing key is correct;
 * a wrong one would quietly defeat every per-author rule built on top of it.
 */
const DAILYMOTION_OWNER_ID = /^x[a-z0-9]+$/i
const YOUTUBE_CHANNEL_ID = /^UC[\w-]{20,}$/

export function channelKey(input: { provider?: string | null; channelId?: string | null }): string | undefined {
  const provider = input.provider?.trim().toLowerCase()
  const id = input.channelId?.trim()
  if (!provider || !id) return undefined

  if (provider === 'youtube') {
    return YOUTUBE_CHANNEL_ID.test(id) ? `youtube:${id}` : undefined
  }
  if (provider === 'dailymotion') {
    return DAILYMOTION_OWNER_ID.test(id) ? `dailymotion:${id}` : undefined
  }
  return `${provider}:${id}`
}

/** True when the stored channel is a Dailymotion category, not an author. */
export function isCategoryMasqueradingAsChannel(input: {
  provider?: string | null
  channelId?: string | null
}): boolean {
  if (input.provider?.trim().toLowerCase() !== 'dailymotion') return false
  const id = input.channelId?.trim()
  return Boolean(id) && !DAILYMOTION_OWNER_ID.test(id as string)
}

/**
 * An item is usable when something can be said about it. Items that fail this
 * are suspended in phase 5.F rather than deleted.
 */
const FILENAME_TITLE = /^(?:vid|img|mov|dsc|dscn|pxl|wa|whatsapp|screenshot|capture|photo|video)[-_\s]*\d/i
const HASHTAGS_ONLY = /^(?:\s*#[^\s#]+\s*)+$/

export function isUsableTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim() ?? ''
  if (trimmed.length < 3) return false
  if (FILENAME_TITLE.test(trimmed)) return false
  if (HASHTAGS_ONLY.test(trimmed)) return false
  return true
}

/** Text items carry their content in `text`, so an empty title is fine there. */
export function isUsableItem(input: { type: ItemType; title?: string | null; text?: string | null }): boolean {
  if (input.type === 'quote' || input.type === 'joke' || input.type === 'fact') {
    return Boolean(input.text?.trim())
  }
  return isUsableTitle(input.title)
}
