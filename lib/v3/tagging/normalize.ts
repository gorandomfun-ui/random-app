/**
 * Turning text into something an alias can be matched against.
 *
 * Deliberately blunt: lowercase, drop accents, turn punctuation into spaces.
 * No grammar, no guessing what a title "means" — the v3 plan matches names it
 * already knows and nothing else.
 */

/** Scripts written without spaces between words, where a substring match is right. */
const UNSPACED_SCRIPT = /[぀-ヿ㐀-䶿一-鿿가-힯]/u

export function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    // Strip diacritics from Latin letters only; Japanese marks change the word.
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** A subject id: "entity:johnny-hallyday", "topic:road-trip". */
export function subjectId(kind: string, label: string): string {
  const slug = normalize(label).replace(/ /g, '-')
  return `${kind}:${slug}`
}

export function comboId(firstTopicId: string, secondTopicId: string): string {
  const bare = [firstTopicId, secondTopicId].map((id) => id.replace(/^topic:/, ''))
  bare.sort()
  return `combo:${bare[0]}+${bare[1]}`
}

/**
 * True when `alias` appears in `haystack`.
 *
 * For Latin text the alias must line up with whole words, so "Cars" does not
 * match "Carson". For Japanese, Chinese and Korean, which do not separate
 * words with spaces, a plain substring match is the correct behaviour.
 */
export function containsAlias(haystack: string, alias: string): boolean {
  const text = normalize(haystack)
  const needle = normalize(alias)
  if (!text || !needle) return false
  if (UNSPACED_SCRIPT.test(needle)) return text.includes(needle)
  return ` ${text} `.includes(` ${needle} `)
}

/**
 * Single common words — "Cars", "Paris", "Friends" — match far too much.
 * The plan only accepts them with a second, independent clue, so they are
 * flagged here and the caller decides.
 */
export function needsSecondClue(alias: string): boolean {
  const normalized = normalize(alias)
  if (!normalized) return true
  if (UNSPACED_SCRIPT.test(normalized)) return normalized.length <= 2
  return !normalized.includes(' ') && normalized.length <= 12
}

/** Was the word capitalised in the untouched title? One of the accepted clues. */
export function appearsCapitalised(originalTitle: string, alias: string): boolean {
  const first = alias.trim().split(/\s+/)[0]
  if (!first) return false
  const capitalised = first.charAt(0).toUpperCase() + first.slice(1)
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(capitalised)}([^\\p{L}]|$)`, 'u').test(originalTitle)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Text an item offers for matching: title plus the head of its description. */
export function searchableText(item: { title?: string | null; description?: string | null }): string {
  const title = item.title?.trim() ?? ''
  const description = item.description?.trim().slice(0, 300) ?? ''
  return `${title} ${description}`.trim()
}
