/**
 * Choosing the three items a Wave offers.
 *
 * The rule the whole plan rests on: link by the simplest label — the same
 * subject — and vary everything else. A South Park GIF should lead to a South
 * Park video, a South Park quiz and a South Park image; never to three more
 * South Park GIFs.
 *
 * No AI, no precomputed links, at most three queries.
 */

import type { Angle, ItemTags, ItemType, Popularity } from '../types'

export const WAVE_SIZE = 3
/**
 * How the Wave found a content, narrowest first: a subject named in the title
 * (1), the title's first two telling words together (2), its first telling word
 * alone (3), a subject the title does not name (4), the same universe (5). A
 * looser level is only used when the tighter ones could not fill the Wave.
 */
export type WaveLevel = 1 | 2 | 3 | 4 | 5

export type WaveCandidate = {
  id: string
  type: ItemType
  title?: string | null
  v3: Pick<ItemTags, 'subjects' | 'universe' | 'angle' | 'popularity' | 'era'> & {
    channelKey?: string
    nearFamily?: string
  }
  level: WaveLevel
}

export type WaveAnchor = {
  id: string
  type: ItemType
  title?: string | null
  v3: Pick<ItemTags, 'subjects' | 'universe' | 'angle'> & { channelKey?: string }
  /** Its telling words in title order; every content has some, even with no subject. */
  words?: string[]
}

export const TEXT_TYPES: ItemType[] = ['quote', 'joke', 'fact']

/**
 * Angles that only name a format. Two contents sharing one are not repeating a
 * treatment — every stock photograph is a "photo-image" — so the angle rule
 * leaves them to the format caps.
 */
const GENERIC_ANGLES = new Set<Angle>([
  'other', 'photo-image', 'meme-gif', 'website', 'text-quote', 'text-joke', 'text-fact', 'quiz',
])
/**
 * Two of a format is comfortable, three is a last resort.
 *
 * Two videos and an image, two images and a video, a video with a text are
 * the good shapes. Three of the same is allowed only when nothing else can
 * fill the slot — a subject with videos and no image should still get a
 * Wave rather than a short one.
 */
const COMFORTABLE_PER_TYPE = 2
const MAX_PER_TYPE = 3
/**
 * Only video gets the third slot. Three images or three texts in a row is
 * never worth serving, however thin the subject — and video is what the draw
 * shows most anyway.
 */
const MAY_FILL_THREE: ItemType[] = ['video']

function normalisedTitle(title: string | null | undefined): string {
  return (title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * Whether a candidate may join the Wave being built.
 *
 * Every rule here exists to stop the Wave feeling like more of the same:
 * a different angle from the anchor and from each other, a different author,
 * no more than two videos, and no repeat of a near-duplicate family.
 */
export function accepts(
  anchor: WaveAnchor,
  chosen: WaveCandidate[],
  candidate: WaveCandidate,
  excludeKeys: Set<string>,
  /** Raised only on the fallback pass, when the strict shape found nothing. */
  perType: number = COMFORTABLE_PER_TYPE,
): boolean {
  if (candidate.id === anchor.id) return false
  if (excludeKeys.has(candidate.id)) return false

  // Nor the anchor under another id. The same GIF is sometimes stored twice,
  // and "Moonwalk Macron" was answered with "Moonwalk Macron".
  const anchorTitle = normalisedTitle(anchor.title)
  if (anchorTitle && normalisedTitle(candidate.title) === anchorTitle) return false

  // A treatment already on screen — including the anchor's — adds nothing: a
  // live concert after a live concert. Angles that only name a format say
  // nothing about treatment and are left to the format caps.
  if (!GENERIC_ANGLES.has(candidate.v3.angle)) {
    if (candidate.v3.angle === anchor.v3.angle) return false
    if (chosen.some((item) => item.v3.angle === candidate.v3.angle)) return false
  }

  // Never the anchor's author, never the same author twice.
  const author = candidate.v3.channelKey
  if (author) {
    if (author === anchor.v3.channelKey) return false
    if (chosen.some((item) => item.v3.channelKey === author)) return false
  }

  // Quote, joke and fact are three types but one experience: three of them is
  // three walls of text, so they are counted together.
  const sameKind = TEXT_TYPES.includes(candidate.type)
    ? chosen.filter((item) => TEXT_TYPES.includes(item.type)).length
    : chosen.filter((item) => item.type === candidate.type).length
  const allowed = MAY_FILL_THREE.includes(candidate.type) ? perType : COMFORTABLE_PER_TYPE
  if (sameKind >= allowed) return false

  // A text only carries a Wave on a precise link — a named subject or the
  // word pair. On a single word or a universe it is a wall of text about
  // something else.
  if (TEXT_TYPES.includes(candidate.type) && candidate.level >= 3) return false

  const title = normalisedTitle(candidate.title)
  if (title && chosen.some((item) => normalisedTitle(item.title) === title)) return false

  const family = candidate.v3.nearFamily
  if (family && chosen.some((item) => item.v3.nearFamily === family)) return false

  return true
}

/** Popularity already on screen, so the three are not all mainstream. */
function popularitySpread(chosen: WaveCandidate[], candidate: WaveCandidate): number {
  const already = chosen.filter((item) => item.v3.popularity === candidate.v3.popularity).length
  return already === 0 ? 2 : already === 1 ? 1 : 0
}

/** A Wave of three videos is a worse Wave, whatever its subjects. */
function formatSpread(chosen: WaveCandidate[], candidate: WaveCandidate): number {
  const sameType = chosen.filter((item) => item.type === candidate.type).length
  return sameType === 0 ? 3 : 0
}

/**
 * Builds the Wave by walking down the levels, tightest first, and never taking
 * from a looser level while a tighter one can still fill a slot. The second
 * pass, which allows a third video, runs only when the first found no other
 * format anywhere.
 */
export function buildWave(
  anchor: WaveAnchor,
  candidates: WaveCandidate[],
  excludeKeys: string[] = [],
): { items: WaveCandidate[]; level: WaveLevel } {
  const excluded = new Set(excludeKeys)
  const chosen: WaveCandidate[] = []

  for (const perType of [COMFORTABLE_PER_TYPE, MAX_PER_TYPE]) {
    for (const level of [1, 2, 3, 4, 5] as WaveLevel[]) {
      const pool = candidates.filter((candidate) => candidate.level === level)
      while (chosen.length < WAVE_SIZE) {
        const usable = pool.filter((candidate) => accepts(anchor, chosen, candidate, excluded, perType))
        if (!usable.length) break
        usable.sort(
          (left, right) =>
            formatSpread(chosen, right) + popularitySpread(chosen, right) -
            (formatSpread(chosen, left) + popularitySpread(chosen, left)),
        )
        const best = usable[0]
        chosen.push(best)
        excluded.add(best.id)
      }
      if (chosen.length >= WAVE_SIZE) break
    }
    if (chosen.length >= WAVE_SIZE) break
  }

  // The level reported is the loosest link used, so callers can tell how close
  // the Wave really is.
  const level = (chosen.length ? Math.max(...chosen.map((item) => item.level)) : 5) as WaveLevel
  return { items: chosen, level }
}

export type { Angle, Popularity }
