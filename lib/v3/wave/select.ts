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
/** Level 1 is the same primary subject, 2 a secondary one, 3 the same universe. */
export type WaveLevel = 1 | 2 | 3

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
}

const TEXT_TYPES: ItemType[] = ['quote', 'joke', 'fact']
const MAX_VIDEOS = 2

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
): boolean {
  if (candidate.id === anchor.id) return false
  if (excludeKeys.has(candidate.id)) return false

  // An angle already on screen — including the anchor's — adds nothing.
  if (candidate.v3.angle === anchor.v3.angle) return false
  if (chosen.some((item) => item.v3.angle === candidate.v3.angle)) return false

  // Never the anchor's author, never the same author twice.
  const author = candidate.v3.channelKey
  if (author) {
    if (author === anchor.v3.channelKey) return false
    if (chosen.some((item) => item.v3.channelKey === author)) return false
  }

  if (candidate.type === 'video' && chosen.filter((item) => item.type === 'video').length >= MAX_VIDEOS) {
    return false
  }

  // Texts only carry a Wave when the subject match is exact, which levels 1
  // and 2 guarantee and level 3 does not.
  if (TEXT_TYPES.includes(candidate.type) && candidate.level === 3) return false

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
 * Builds the Wave by walking down the levels: level 1 first, then 2, then 3,
 * so the closest links are used before the loosest.
 */
export function buildWave(
  anchor: WaveAnchor,
  candidates: WaveCandidate[],
  excludeKeys: string[] = [],
): { items: WaveCandidate[]; level: WaveLevel } {
  const excluded = new Set(excludeKeys)
  const chosen: WaveCandidate[] = []

  for (const level of [1, 2, 3] as WaveLevel[]) {
    const pool = candidates.filter((candidate) => candidate.level === level)
    while (chosen.length < WAVE_SIZE) {
      const usable = pool.filter((candidate) => accepts(anchor, chosen, candidate, excluded))
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

  // The level reported is the loosest link used, so callers can tell how close
  // the Wave really is.
  const level = (chosen.length ? Math.max(...chosen.map((item) => item.level)) : 3) as WaveLevel
  return { items: chosen, level }
}

export type { Angle, Popularity }
