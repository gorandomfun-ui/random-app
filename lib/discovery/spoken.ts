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
  return code ? isoTwo(code) : undefined
}
