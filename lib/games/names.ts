/**
 * The names the world's table may show: cleaned like the device's, and
 * PLAYER in place of anything rude, in the site's languages.
 */

import { cleanName } from './scores'

/** Words a name may not carry anywhere in it, in the site's languages, looked for once spaces and look-alike digits are gone. */
const BANNED = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'pussy', 'nazi', 'hitler',
  'merde', 'salope', 'connard', 'connasse', 'encul', 'batard', 'couille', 'putain',
  'mierda', 'cabron', 'joder', 'pendejo', 'maricon',
  'scheiss', 'fotze', 'wichser', 'arschloch', 'schlampe',
]
/** Short words that are rude only as a word of their own (COMPUTER and UNIQUE are fine). */
const BANNED_WORDS = ['pute', 'nique', 'rape', 'pd', 'fdp', 'ntm', 'cul', 'bite', 'dick', 'cock', 'puta', 'hure', 'porn', 'sex']

const unleet = (text: string) => text.toLowerCase().replace(/0/g, 'o').replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')

/** A name as the world's table shows it: cleaned like the device's, and PLAYER when it says something it should not. */
export function worldName(raw: unknown): string {
  const name = cleanName(typeof raw === 'string' ? raw : '')
  const plain = unleet(name).replace(/[\s._-]/g, '')
  const words = unleet(name).split(/[\s._-]+/)
  return !name || BANNED.some((word) => plain.includes(word)) || words.some((word) => BANNED_WORDS.includes(word)) ? 'PLAYER' : name
}
