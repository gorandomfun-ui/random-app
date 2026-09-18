/**
 * Recognising videos that are the same thing over and over.
 *
 * The per-author cap is not enough: one format — AI-illustrated history
 * stories, serial dance tutorials — can arrive from hundreds of different
 * channels. Two families are computed per item, and neither forbids any
 * country, language or genre. Only proportions are capped.
 */

import { createHash } from 'node:crypto'

import type { Angle, Universe } from './types'
import { normalize } from './tagging/normalize'

/**
 * A near-duplicate fingerprint over the "skeleton" of the title.
 *
 * Numbers, emojis and hashtags vary between otherwise identical uploads
 * ("L'histoire INCROYABLE de Marie, 1847 — Partie 3 😱"), so they are stripped
 * before hashing. Recognised subject names are stripped too: what remains is
 * the shape of the sentence, which is what repeats.
 */
export function titleSkeleton(title: string, subjectLabels: string[] = []): string {
  let text = normalize(title)
  for (const label of subjectLabels) {
    const normalizedLabel = normalize(label)
    if (normalizedLabel.length >= 3) text = text.split(normalizedLabel).join(' ')
  }
  return text
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Groups of three consecutive words: the unit SimHash compares. */
function shingles(text: string): string[] {
  const words = text.split(' ').filter(Boolean)
  if (words.length <= 3) return words.length ? [words.join(' ')] : []
  const result: string[] = []
  for (let index = 0; index + 3 <= words.length; index += 1) {
    result.push(words.slice(index, index + 3).join(' '))
  }
  return result
}

function hash64(value: string): bigint {
  const digest = createHash('sha1').update(value).digest()
  return digest.readBigUInt64BE(0)
}

/**
 * A 64-bit SimHash: similar texts give similar numbers, unlike a normal hash
 * where one changed letter changes everything.
 */
export function simhash(text: string): bigint {
  const parts = shingles(text)
  if (!parts.length) return 0n

  const weights = new Array<number>(64).fill(0)
  for (const part of parts) {
    const value = hash64(part)
    for (let bit = 0; bit < 64; bit += 1) {
      const isSet = (value >> BigInt(bit)) & 1n
      weights[bit] += isSet ? 1 : -1
    }
  }

  let fingerprint = 0n
  for (let bit = 0; bit < 64; bit += 1) {
    if (weights[bit] > 0) fingerprint |= 1n << BigInt(bit)
  }
  return fingerprint
}

/** How many bits differ. Two items are near-duplicates at 3 or fewer. */
export function hammingDistance(left: bigint, right: bigint): number {
  let difference = left ^ right
  let bits = 0
  while (difference) {
    bits += Number(difference & 1n)
    difference >>= 1n
  }
  return bits
}

export const NEAR_DUPLICATE_MAX_BITS = 3

/**
 * Stored as a string: MongoDB has no unsigned 64-bit integer, and the value is
 * only ever compared, never summed.
 */
export function nearFamilyKey(title: string, subjectLabels: string[] = []): string {
  return simhash(titleSkeleton(title, subjectLabels)).toString(16).padStart(16, '0')
}

/**
 * The broader family: same kind of video, whoever made it. Catches what the
 * fingerprint misses — a hundred AI history videos with genuinely different
 * titles still share theme, angle and language.
 */
export function formatFamilyKey(input: {
  primarySubjectId?: string | null
  universe: Universe
  angle: Angle
  lang?: string | null
}): string {
  const theme = input.primarySubjectId?.trim() || input.universe
  const lang = input.lang?.trim().toLowerCase() || 'xx'
  return `${theme}×${input.angle}×${lang}`
}

/** Catalogue-wide caps from section 7.8 of the brief. */
export const NEAR_FAMILY_MAX_ITEMS = 5
export const NEAR_FAMILY_MAX_PER_DAY = 1
export const FORMAT_FAMILY_MAX_ITEMS = 150
export const FORMAT_FAMILY_MAX_PER_DAY = 20
