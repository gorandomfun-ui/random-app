/**
 * What a cool content's title must not say. The registers already refuse
 * news, stock and hashtag spam (`isCoolCandidate`); this adds two refusals
 * the trend brought in: the words of a death, an accident, a trial or an
 * election (Random is not a news site), and the junk a search on a name
 * drags along — fetish, explicit, gambling, "ASMR".
 */

import { hasSensitiveWord } from '../trend/candidates'
import { wordsRegex } from './registers'

/** Junk around a name, whatever the language: refused on the title alone. */
export const JUNK_WORDS = [
  'feet', 'foot fetish', 'fetish', 'soles', 'toes', 'tickling', 'licking', 'lick', 'asmr', 'onlyfans', 'leaked', 'leak', 'leaks',
  'nude', 'nudes', 'naked', 'sexy', 'bikini', 'thirst trap', 'hot girl', 'hot girls', 'lingerie', 'twerk', 'twerking',
  'casino', 'jackpot', 'slots', 'slot machine', 'betting', 'bet365', 'poker', 'hold em', "hold'em", 'crypto', 'forex', 'free robux', 'giveaway',
]
const JUNK = wordsRegex(JUNK_WORDS)

/** Scripts the "elsewhere" register is made for; a modern content "from here" is written in Latin letters. */
const NON_LATIN_SCRIPT = /[぀-ヿ一-鿿가-힯฀-๿ऀ-ॿঀ-৿஀-௿ఀ-౿؀-ۿЀ-ӿ֐-׿]/u

export function isJunkTitle(title: string): boolean {
  return JUNK.test(title)
}

/** Neither news words nor junk: what the trend and the recent sources ask of a title. */
export function isCleanTitle(title: string | null | undefined): boolean {
  const text = (title ?? '').trim()
  if (!text) return false
  return !hasSensitiveWord(text) && !isJunkTitle(text)
}

export function isLatinTitle(title: string | null | undefined): boolean {
  return !NON_LATIN_SCRIPT.test(title ?? '')
}
