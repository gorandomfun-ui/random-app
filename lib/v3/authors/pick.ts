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
/**
 * Only the small authors: a channel of more than this many videos is a factory, not a person (the owner, 22 October:
 * "une chaîne indienne avec 3000 vidéos de merde répétitives c'est nul, mais si c'est des petites vidéos d'un petit
 * auteur c'est pas pareil").
 */
export const SMALL_AUTHOR_MAX = 200

/** Whether a channel is small enough to follow, by the count of videos its platform gives; an unknown count is not small. */
export const smallAuthor = (total: number | null | undefined): boolean => typeof total === 'number' && Number.isFinite(total) && total >= 0 && total <= SMALL_AUTHOR_MAX

export type AuthorZone = { key: string; video: number; likeIds: string[] }
export type AuthorVisit = { key: string; provider: 'youtube' | 'dailymotion'; id: string; room: number }
/** What the line remembers of an author (lib/v3/ingest/lines/authors.ts): when it last went, and whether the channel was too big then. */
export type AuthorMemory = { visitedAt: number; big: boolean }

/** A channel found too big is asked again after this many days: it may have shrunk, or the count may have been missing. */
export const BIG_RECHECK_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

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
 * the ceiling still allows for each. A channel found too big lately is left
 * alone (`memory`): it would otherwise come back every night, at the same place
 * in the order, and take a small author's turn.
 */
export function pickAuthors(zones: AuthorZone[], limit = AUTHORS_PER_PASS, memory: ReadonlyMap<string, AuthorMemory> = new Map(), now = Date.now()): AuthorVisit[] {
  const visits: AuthorVisit[] = []
  for (const zone of zones) {
    if (!zone.likeIds.length) continue
    const room = HOLD_CAP - zone.video
    if (room <= 0) continue
    const split = splitAuthorKey(zone.key)
    if (!split) continue
    const known = memory.get(zone.key)
    if (known?.big && now - known.visitedAt < BIG_RECHECK_DAYS * DAY_MS) continue
    visits.push({ key: zone.key, provider: split.provider, id: split.id, room: Math.min(room, TAKE_PER_PASS) })
  }
  // The least known first: an author we hold two videos of teaches more than one we hold thirty-nine of. Then the one
  // visited longest ago, never visited first: the same forty would otherwise be visited every night, in the alphabet's order.
  const last = (key: string) => memory.get(key)?.visitedAt ?? 0
  visits.sort((a, b) => b.room - a.room || last(a.key) - last(b.key) || a.key.localeCompare(b.key))
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
