/**
 * The language a served video speaks, in two letters, for the page's subtitles
 * (lib/random/captions.ts): YouTube lists only the subtitles people wrote, so the
 * page asks for the automatic track of the video's language by its code.
 *
 * The platform's word first, then the language the wheel already read for its
 * proportions, then the title read by the detector. Computed once, on the video
 * the draw serves, never on the rows it reads.
 */

import { isoTwo } from './catalog'
import { titleLanguage } from './language'
import type { Candidate } from './types'

export function spokenLanguage(candidate: Pick<Candidate, 'declaredLang' | 'lang' | 'title'>): string | undefined {
  const code = candidate.declaredLang ?? candidate.lang ?? titleLanguage(candidate.title)
  return (code ? isoTwo(code) : undefined) ?? scriptLanguage(candidate.title)
}

/** Alphabets one language mostly owns: a short Korean title ("사람만 보면 하악질하던 고양이에게 간택당함") is too short for the detector, not for its letters. */
const SCRIPTS: Array<[RegExp, string]> = [
  [/\p{Script=Hangul}/gu, 'ko'], [/[\p{Script=Hiragana}\p{Script=Katakana}]/gu, 'ja'], [/\p{Script=Thai}/gu, 'th'], [/\p{Script=Tamil}/gu, 'ta'],
  [/\p{Script=Telugu}/gu, 'te'], [/\p{Script=Bengali}/gu, 'bn'], [/\p{Script=Gujarati}/gu, 'gu'], [/\p{Script=Kannada}/gu, 'kn'],
  [/\p{Script=Malayalam}/gu, 'ml'], [/\p{Script=Devanagari}/gu, 'hi'], [/\p{Script=Greek}/gu, 'el'], [/\p{Script=Hebrew}/gu, 'he'],
  [/\p{Script=Georgian}/gu, 'ka'], [/\p{Script=Armenian}/gu, 'hy'], [/\p{Script=Khmer}/gu, 'km'], [/\p{Script=Lao}/gu, 'lo'], [/\p{Script=Myanmar}/gu, 'my'],
]
/** Four letters of such an alphabet at least; the one with the most letters wins. */
const SCRIPT_MIN_LETTERS = 4

export function scriptLanguage(title: string | null | undefined): string | undefined {
  if (!title) return undefined
  let best: { code: string; letters: number } | undefined
  for (const [pattern, code] of SCRIPTS) {
    const letters = title.match(pattern)?.length ?? 0
    if (letters >= SCRIPT_MIN_LETTERS && (!best || letters > best.letters)) best = { code, letters }
  }
  return best?.code
}
