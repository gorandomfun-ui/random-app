/**
 * A media outlet, told from the data, never from a list — and what of it
 * Random keeps, by the category the platform itself gives the video.
 *
 * The audit of 30 September–1 October found the biggest channels of what
 * entered were all outlets on Dailymotion — showbiz agencies, trailer and
 * press channels, programme listings — brought by the people base: an actor's
 * name, a hundred clips about him. An outlet has published thousands of
 * videos (`OUTLET_VIDEOS`, the provider's own count). The owner, 1 October:
 * a news clip is worth it this week (one feels up to date) or twenty years
 * later (an archive), never in between; a trailer keeps a year; a cat that
 * falls has no age. So on such a channel the window depends on the category
 * the platform wrote on the video — Dailymotion's "news", "sport", "people",
 * "tv", "shortfilms", "videogames", "fun"…, YouTube's numbers — never on a
 * list of ours:
 *   - news, sport, people, tv: of the moment (`MOMENT_DAYS`) or of another
 *     time (`OLD_UPLOAD_BEFORE`, or an old year in the text), nothing between;
 *   - film and gaming sites, and any trailer by its title: a year, or of
 *     another time;
 *   - the rest — fun, animals, music, science, travel, creation: no window.
 * The same windows are read at the draw, so a clip of the moment fades out
 * by itself. The subject's own channels are never judged: a star's channel
 * is read on purpose.
 */

import { isTrailerTitle } from '../cool/themes'
import { ARCHIVE_TITLE_YEAR, ARCHIVE_UPLOAD_BEFORE } from '../tagging/classify'
import type { DigVideo } from './video'

/** Past this many published videos, a channel is a house, not a person. */
export const OUTLET_VIDEOS = Number(process.env.RANDOM_DIG_OUTLET_VIDEOS ?? 10_000)
/** A year this old in the title or the description makes a video "of another time" (lib/v3/tagging/classify.ts: the same boundary labels the era). */
export const OLD_YEAR = ARCHIVE_TITLE_YEAR
/**
 * An upload from before this year is of another time whatever its title says. Seven years, before 8 October, let five bulk
 * uploaders of old clips past the week's cap per channel at a hundred and ten a day each (the drift, 7 October).
 */
export const OLD_UPLOAD_BEFORE = ARCHIVE_UPLOAD_BEFORE
/** A news, sport, people or TV clip is of the moment this long. */
export const MOMENT_DAYS = Number(process.env.RANDOM_MEDIA_MOMENT_DAYS ?? 15)
/** A trailer, a film or a game clip keeps this long. */
export const TRAILER_DAYS = Number(process.env.RANDOM_MEDIA_TRAILER_DAYS ?? 365)

export type MediaFamily = 'news' | 'trailer' | 'rest' | 'unknown'

/** The platforms' own categories, by family. Dailymotion names them; YouTube numbers them (25 news, 17 sport, 24 entertainment, 1 film, 20 gaming). */
const NEWS_CATEGORIES = new Set(['news', 'sport', 'people', 'tv', '25', '17', '24'])
const TRAILER_CATEGORIES = new Set(['shortfilms', 'videogames', '1', '20'])

const YEAR = /\b(19\d{2}|20\d{2})\b/g
const DAY_MS = 86_400_000

/** The family of a video on a media channel, by the category the platform gave it, a trailer by its title whatever the category. */
export function mediaFamily(video: Pick<DigVideo, 'title' | 'categoryId'>): MediaFamily {
  if (isTrailerTitle(video.title)) return 'trailer'
  const category = String(video.categoryId ?? '').trim().toLowerCase()
  if (!category) return 'unknown'
  if (NEWS_CATEGORIES.has(category)) return 'news'
  if (TRAILER_CATEGORIES.has(category)) return 'trailer'
  return 'rest'
}

const publishedDate = (value: unknown): Date | null => {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

/** Whether a video is of another time: an old year in its title or the first lines of its description, or an upload of years ago. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the moment no longer matters to the rule; the callers still pass it
export function ofAnotherTime(video: Pick<DigVideo, 'title' | 'description' | 'publishedAt'>, _now = new Date()): boolean {
  const text = `${video.title} ${(video.description ?? '').slice(0, 300)}`
  for (const match of text.matchAll(YEAR)) if (Number(match[1]) <= OLD_YEAR) return true
  const published = publishedDate(video.publishedAt)
  return Boolean(published && published.getUTCFullYear() < OLD_UPLOAD_BEFORE)
}

/** How many days ago the video was uploaded; unknown when the platform did not say. */
export function uploadAgeDays(video: Pick<DigVideo, 'publishedAt'>, now = new Date()): number | undefined {
  const published = publishedDate(video.publishedAt)
  return published ? (now.getTime() - published.getTime()) / DAY_MS : undefined
}

export type MediaVerdict = 'keep' | 'moment' | 'refuse'

/**
 * What Random does with a video of a media channel: keeps it, keeps it as a
 * clip of the moment (to be served soon, then to fade), or refuses it. A
 * video of another time is always kept; a category the platform did not
 * give gets the news window, the strictest — an outlet is an outlet.
 */
export function mediaVerdict(video: Pick<DigVideo, 'title' | 'description' | 'publishedAt' | 'categoryId'>, now = new Date()): MediaVerdict {
  if (ofAnotherTime(video, now)) return 'keep'
  const family = mediaFamily(video)
  if (family === 'rest') return 'keep'
  const age = uploadAgeDays(video, now)
  if (age === undefined) return 'refuse'
  if (family === 'trailer') return age <= TRAILER_DAYS ? 'keep' : 'refuse'
  return age <= MOMENT_DAYS ? 'moment' : 'refuse'
}

export type OutletVerdict = { kept: DigVideo[]; moment: DigVideo[]; refused: number; outlets: string[] }

/**
 * The kept videos of a pass without what the media windows refuse. `counts`
 * says how many videos each channel has published (the provider's number,
 * read for Dailymotion in the search itself, for YouTube in one call per
 * fifty); on a channel past the threshold, each video gets its verdict.
 */
export function withoutOutlets(kept: DigVideo[], counts: (video: DigVideo) => number | undefined, own: ReadonlySet<string>, now = new Date()): OutletVerdict {
  const outlets = new Set<string>()
  const moment: DigVideo[] = []
  const out = kept.filter((video) => {
    const channel = video.channelId ?? ''
    if (!channel || own.has(channel)) return true
    const total = counts(video)
    if (total === undefined || total < OUTLET_VIDEOS) return true
    const verdict = mediaVerdict(video, now)
    if (verdict === 'moment') moment.push(video)
    if (verdict === 'refuse') outlets.add(channel)
    return verdict !== 'refuse'
  })
  return { kept: out, moment, refused: kept.length - out.length, outlets: [...outlets] }
}
