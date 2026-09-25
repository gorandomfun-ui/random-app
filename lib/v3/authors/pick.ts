/**
 * Which authors to go back to, and how much to take from them.
 *
 * A video that passed the filters and that someone liked was made by a person,
 * and that person keeps publishing. Following them is the nearest thing we have
 * to the way a feed of shared clips stays good: it follows people, not words.
 *
 * The whole point of this file is the restraint. An author is a vein, not a
 * mine: a channel with fifty thousand near-identical tutorials would drown the
 * catalogue in one night. So there is a ceiling on what we ever hold from one
 * author, a small take per pass, and a test that refuses a handful of videos
 * that are all the same video.
 */

/** Never hold more than this from one author, however much they publish. */
export const HOLD_CAP = 40
/** At most this many new videos from one author in one pass. */
export const TAKE_PER_PASS = 8
/** At most this many from one author whose titles all begin the same way. */
export const SAME_SHAPE_CAP = 2
/** Authors visited in one pass. Two units each: the price of one search buys fifty. */
export const AUTHORS_PER_PASS = 40

export type AuthorZone = { key: string; video: number; likeIds: string[] }
export type AuthorVisit = { key: string; provider: 'youtube' | 'dailymotion'; id: string; room: number }

/** The provider and the identifier inside an author key, when it is one we can read. */
export function splitAuthorKey(key: string): { provider: 'youtube' | 'dailymotion'; id: string } | null {
  const at = key.indexOf(':')
  if (at < 1) return null
  const provider = key.slice(0, at)
  const id = key.slice(at + 1)
  if (!id) return null
  if (provider === 'youtube' || provider === 'dailymotion') return { provider, id }
  return null
}

/**
 * The authors worth a visit tonight: liked by someone, still under the ceiling,
 * the emptiest first so the ones we barely know get their turn. `room` is what
 * the ceiling still allows for each.
 */
export function pickAuthors(zones: AuthorZone[], limit = AUTHORS_PER_PASS): AuthorVisit[] {
  const visits: AuthorVisit[] = []
  for (const zone of zones) {
    if (!zone.likeIds.length) continue
    const room = HOLD_CAP - zone.video
    if (room <= 0) continue
    const split = splitAuthorKey(zone.key)
    if (!split) continue
    visits.push({ key: zone.key, provider: split.provider, id: split.id, room: Math.min(room, TAKE_PER_PASS) })
  }
  // The least known first: an author we hold two videos of teaches more than one we hold thirty-nine of.
  visits.sort((a, b) => b.room - a.room || a.key.localeCompare(b.key))
  return visits.slice(0, Math.max(0, limit))
}

const NOISE = new Set(['the', 'a', 'an', 'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'and', 'et', 'of', 'to', 'in', 'on', 'my', 'we', 'i'])

/** What a title looks like, stripped to its first real words: two titles of the same shape share it. */
export function titleShape(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[|•\-–—_,.!?:;"'()[\]{}]/g, ' ')
    .replace(/\d+/g, '#')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !NOISE.has(word))
  return words.slice(0, 3).join(' ')
}

/**
 * What to keep out of what an author just gave: never more than the room left,
 * and never a run of videos that are the same video with another number.
 */
export function keepFromAuthor<T extends { title?: string | null }>(videos: T[], room: number): T[] {
  const shapes = new Map<string, number>()
  const kept: T[] = []
  for (const video of videos) {
    if (kept.length >= room) break
    const shape = titleShape(String(video.title ?? ''))
    const seen = shapes.get(shape) ?? 0
    // An empty shape means a title with nothing to compare; it is not a series.
    if (shape && seen >= SAME_SHAPE_CAP) continue
    shapes.set(shape, seen + 1)
    kept.push(video)
  }
  return kept
}
