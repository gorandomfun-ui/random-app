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
/**
 * Words ordinary sentences are made of.
 *
 * Wikidata holds real subjects called "The Wall", "The Following", "The King"
 * and "Non-Stop". Matching them on phrase alone tagged a joke about Java and C
 * as Pink Floyd, and a quiz asking "which of the following" as a TV series.
 * An entity whose every word is in this list therefore needs a second clue.
 * Words that merely *feel* common are left out — "park" and "south" are here
 * absent on purpose, so South Park keeps working.
 */
const EVERYDAY_WORDS = new Set(
  ('the a an and or of in on at to for with from by is are was were be this that it its ' +
    'wall king queen following stop thing things world life time way day night man woman ' +
    'boy girl people house home room door water fire air land show movie film game play ' +
    'story end start first last new old good bad big small long short high low right left ' +
    'one two three non all some any every other another same different next back front ' +
    'le la les des du un une et ou de dans sur avec pour par est sont ce cette qui que ' +
    'mur roi reine chose monde vie temps jour nuit homme femme maison jeu fin debut')
    .split(' '),
)

/** True when every word of the alias is an everyday one. */
export function isEverydayPhrase(alias: string): boolean {
  const words = normalize(alias).split(' ').filter(Boolean)
  if (!words.length) return true
  return words.every((word) => EVERYDAY_WORDS.has(word))
}

export function needsSecondClue(alias: string): boolean {
  const normalized = normalize(alias)
  if (!normalized) return true
  if (UNSPACED_SCRIPT.test(normalized)) return normalized.length <= 2
  if (!normalized.includes(' ') && normalized.length <= 12) return true
  return isEverydayPhrase(normalized)
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
