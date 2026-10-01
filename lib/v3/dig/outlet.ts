/**
 * A media outlet, told from the data, never from a list.
 *
 * The audit of 30 September–1 October found the biggest channels of what
 * entered were all outlets on Dailymotion — showbiz agencies, trailer and
 * press channels, programme listings — brought by the people base: an actor's
 * name, a hundred clips about him. The owner: "des trucs chiants, on ne doit
 * pas avoir ça". An outlet has published thousands of videos and what it
 * posts is of the week; an archive — INA, BBC Archive, Pathé — has thousands
 * too, but what it posts is of another time, and Random wants it. INA's
 * stock is uploaded before 2019 to the last video and carries a year in one
 * title out of five; the agencies' is of this year to four fifths. So the
 * rule is per video: on a channel the provider counts past `OUTLET_VIDEOS`,
 * a video stays only when it is of another time — an old year in its title
 * or its first lines, or uploaded `OLD_UPLOAD_YEARS` ago — and the rest, the
 * week's clips, is refused. The subject's own channels are never judged: a
 * star's channel is read on purpose.
 */

import type { DigVideo } from './video'

/** Past this many published videos, a channel is a house, not a person. */
export const OUTLET_VIDEOS = Number(process.env.RANDOM_DIG_OUTLET_VIDEOS ?? 10_000)
/** A year this old in the title or the description makes a video "of another time". */
export const OLD_YEAR = 2005
/** An upload this old is of another time whatever its title says. */
export const OLD_UPLOAD_YEARS = 7

const YEAR = /\b(19\d{2}|20\d{2})\b/g

/** Whether a video is of another time: an old year in its title or the first lines of its description, or an upload of years ago. */
export function ofAnotherTime(video: Pick<DigVideo, 'title' | 'description' | 'publishedAt'>, now = new Date()): boolean {
  const text = `${video.title} ${(video.description ?? '').slice(0, 300)}`
  for (const match of text.matchAll(YEAR)) if (Number(match[1]) <= OLD_YEAR) return true
  const published = video.publishedAt instanceof Date ? video.publishedAt : typeof video.publishedAt === 'string' ? new Date(video.publishedAt) : null
  return Boolean(published && !Number.isNaN(published.getTime()) && published.getTime() <= now.getTime() - OLD_UPLOAD_YEARS * 365.25 * 86_400_000)
}

export type OutletVerdict = { kept: DigVideo[]; refused: number; outlets: string[] }

/**
 * The kept videos of a pass without the week's clips of outlets. `counts`
 * says how many videos each channel has published (the provider's number,
 * read for Dailymotion in the search itself, for YouTube in one call per
 * fifty); a channel past the threshold keeps only what is of another time.
 */
export function withoutOutlets(kept: DigVideo[], counts: (video: DigVideo) => number | undefined, own: ReadonlySet<string>, now = new Date()): OutletVerdict {
  const outlets = new Set<string>()
  const out = kept.filter((video) => {
    const channel = video.channelId ?? ''
    if (!channel || own.has(channel)) return true
    const total = counts(video)
    if (total === undefined || total < OUTLET_VIDEOS) return true
    if (ofAnotherTime(video, now)) return true
    outlets.add(channel)
    return false
  })
  return { kept: out, refused: kept.length - out.length, outlets: [...outlets] }
}
