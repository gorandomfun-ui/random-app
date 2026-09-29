/**
 * The four levels of a subject, from the mainstream to the confidential.
 *
 * Views alone would put a Hindi short at 300 million above everything: the
 * audience of a language is not the fame of a video (the owner, 28
 * September: "les trucs indiens ont forcément plus de vues"). The views are
 * divided by the language's audience factor, then cut at one million, a
 * hundred thousand and ten thousand. One table, one scale, for every base.
 */

import type { DigLevel } from '../types'

/** How many times bigger than a French or German audience a language's public is, roughly. */
export const AUDIENCE_FACTOR: Record<string, number> = {
  en: 3, hi: 8, bn: 6, ta: 6, te: 6, mr: 5, ur: 5, pa: 4,
  id: 5, ms: 3, fil: 4, tl: 4, vi: 3, th: 3,
  es: 3, pt: 3, ar: 4, tr: 2, fa: 2,
  ja: 2, ko: 2, zh: 3, ru: 2,
  fr: 1, de: 1, it: 1, nl: 1, pl: 1, sv: 1, no: 1, da: 1, fi: 1, cs: 1, hu: 1, ro: 1, el: 1, uk: 1,
}

export const LEVEL_FLOORS: Record<Exclude<DigLevel, 4>, number> = { 1: 1_000_000, 2: 100_000, 3: 10_000 }

/** The level of a video: its views brought back to a mid-sized audience. */
export function levelOf(views: number | null | undefined, lang?: string | null): DigLevel {
  if (typeof views !== 'number' || !Number.isFinite(views) || views < 0) return 4
  const factor = AUDIENCE_FACTOR[(lang ?? '').slice(0, 2).toLowerCase()] ?? 2
  const corrected = views / factor
  if (corrected >= LEVEL_FLOORS[1]) return 1
  if (corrected >= LEVEL_FLOORS[2]) return 2
  if (corrected >= LEVEL_FLOORS[3]) return 3
  return 4
}

const SCRIPTS: Array<[RegExp, string]> = [
  [/\p{Script=Devanagari}/u, 'hi'],
  [/\p{Script=Bengali}/u, 'bn'],
  [/\p{Script=Tamil}/u, 'ta'],
  [/\p{Script=Telugu}/u, 'te'],
  [/\p{Script=Gurmukhi}/u, 'pa'],
  [/\p{Script=Arabic}/u, 'ar'],
  [/\p{Script=Thai}/u, 'th'],
  [/\p{Script=Hangul}/u, 'ko'],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'],
  [/\p{Script=Han}/u, 'zh'],
  [/\p{Script=Cyrillic}/u, 'ru'],
  [/\p{Script=Greek}/u, 'el'],
  [/\p{Script=Hebrew}/u, 'he'],
]

/**
 * The language of a video, as best we can tell: what the provider says, else
 * the script of the title, else what the subject's country speaks. A Latin
 * title tells nothing on its own: "Sarkodie - Adonai" is English and Twi.
 */
export function languageOf(declared: string | null | undefined, title: string | null | undefined, fallback?: string | null): string | undefined {
  const code = (declared ?? '').trim().toLowerCase().replace(/[-_].*$/, '')
  if (/^[a-z]{2,3}$/.test(code)) return code
  for (const [script, lang] of SCRIPTS) if (script.test(title ?? '')) return lang
  return fallback ?? undefined
}
