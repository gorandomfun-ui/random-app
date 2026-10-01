/**
 * The language a title is written in, read by a trained detector (franc, a
 * trigram model over the world's languages), never by a list of our own.
 * Videos carry no language label in the catalogue (none of 237 sampled on
 * 1 October had one), and the owner found "pas mal de trucs français": the
 * stock is two thirds Dailymotion. A title too short to tell stays unknown,
 * and an unknown language is never counted against a proportion.
 */

import { franc } from 'franc-min'

/** Fewer letters than this and the detector guesses: the title stays unknown. */
const MIN_LETTERS = 20

export function titleLanguage(title: string | null | undefined): string | undefined {
  const text = (title ?? '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (text.replace(/\s/g, '').length < MIN_LETTERS) return undefined
  const code = franc(text, { minLength: MIN_LETTERS })
  return code === 'und' ? undefined : code
}
