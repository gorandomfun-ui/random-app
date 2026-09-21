/**
 * An in-memory index of every alias, so tagging a title costs the number of
 * words it has rather than the number of aliases in the dictionary.
 *
 * Comparing 1.67M items against every alias would be billions of string
 * checks. Instead each Latin alias is filed under its first word: a title is
 * split into words, and only the aliases starting with one of those words are
 * ever compared. Aliases written in a script without spaces cannot be indexed
 * that way and are kept in a separate, much smaller list.
 */

import { containsAlias, namesSomething, needsSecondClue, normalize } from './normalize'

export type IndexedSubject = {
  id: string
  label: string
  universe: string
  kind: string
  /** True for short common words, which need a second clue to apply. */
  ambiguous: boolean
}

export type SubjectAlias = {
  alias: string
  subject: IndexedSubject
  /** Number of words, so the most specific match can win. */
  words: number
  /**
   * Whether *this spelling* needs a second clue — not whether the subject
   * does. "Magic: The Gathering" is a specific name, but its alias "magic"
   * is not, and matching on it tagged an Urdu drama episode as a card game.
   */
  ambiguous: boolean
}

export type SubjectIndex = {
  /** First word of the alias → the aliases starting with it. */
  byFirstWord: Map<string, SubjectAlias[]>
  /** Aliases in scripts without word separators, matched as substrings. */
  unspaced: SubjectAlias[]
  subjects: Map<string, IndexedSubject>
  aliasCount: number
}

const UNSPACED_SCRIPT = /[぀-ヿ㐀-䶿一-鿿가-힯]/u

export type SubjectRow = {
  _id: string
  label?: string
  universe?: string
  kind?: string
  aliases?: string[]
  ambiguous?: boolean
}

export function buildSubjectIndex(rows: SubjectRow[]): SubjectIndex {
  const byFirstWord = new Map<string, SubjectAlias[]>()
  const unspaced: SubjectAlias[] = []
  const subjects = new Map<string, IndexedSubject>()
  let aliasCount = 0

  for (const row of rows) {
    const subject: IndexedSubject = {
      id: row._id,
      label: row.label ?? row._id,
      universe: row.universe ?? 'other',
      kind: row.kind ?? 'topic',
      ambiguous: row.ambiguous ?? false,
    }
    subjects.set(subject.id, subject)

    for (const rawAlias of row.aliases ?? []) {
      const alias = normalize(rawAlias)
      if (alias.length < 2 || !namesSomething(alias)) continue
      aliasCount += 1

      // A single common word is never a usable name for an entity. Wikidata
      // lists "magic" for Magic: The Gathering and "video" for Video
      // recording; capitalisation cannot rescue them either, since English
      // titles are written in Title Case and every word looks like a name.
      // Curated themes keep theirs: "moto" and "café" were chosen to be safe.
      const shortSingleWord = needsSecondClue(alias)
      if (shortSingleWord && subject.kind === 'entity') continue

      const ambiguous = subject.ambiguous || shortSingleWord

      if (UNSPACED_SCRIPT.test(alias)) {
        unspaced.push({ alias, subject, words: 1, ambiguous })
        continue
      }

      const firstWord = alias.split(' ')[0]
      if (!firstWord) continue
      const bucket = byFirstWord.get(firstWord)
      const entry: SubjectAlias = { alias, subject, words: alias.split(' ').length, ambiguous }
      if (bucket) bucket.push(entry)
      else byFirstWord.set(firstWord, [entry])
    }
  }

  return { byFirstWord, unspaced, subjects, aliasCount }
}

export type AliasMatch = {
  subject: IndexedSubject
  alias: string
  words: number
  ambiguous: boolean
  /** Where the alias was found, so overlapping matches can be resolved. */
  start: number
  end: number
}

/**
 * Every subject whose alias appears in the text.
 *
 * `ambiguous` subjects — a single common word like "Cars" or "Paris" — are
 * only returned when `secondClue` agrees, which the caller decides from the
 * untouched title's capitalisation or the provider's own category.
 */
export function matchSubjects(
  index: SubjectIndex,
  text: string,
  secondClue: (match: AliasMatch) => boolean,
): AliasMatch[] {
  const normalized = normalize(text)
  if (!normalized) return []

  const found = new Map<string, AliasMatch>()
  const words = normalized.split(' ')
  const padded = ` ${normalized} `

  for (const word of words) {
    const candidates = index.byFirstWord.get(word)
    if (!candidates) continue
    for (const candidate of candidates) {
      const at = padded.indexOf(` ${candidate.alias} `)
      if (at < 0) continue
      keepBest(found, candidate, at, at + candidate.alias.length + 2)
    }
  }

  if (UNSPACED_SCRIPT.test(normalized)) {
    for (const candidate of index.unspaced) {
      const at = normalized.indexOf(candidate.alias)
      if (at < 0) continue
      keepBest(found, candidate, at, at + candidate.alias.length)
    }
  }

  const kept = Array.from(found.values()).filter((match) => !match.ambiguous || secondClue(match))

  // "Assassin's Creed II" also matches "Creed II". The two names claim
  // overlapping words of the same title, and only the longer one is right, so
  // a match covered by a longer one that shares any of its span is dropped.
  return kept.filter((match) => {
    return !kept.some((other) => {
      if (other === match) return false
      if (other.alias.length <= match.alias.length) return false
      return other.start < match.end && match.start < other.end
    })
  })
}

/** One subject, matched by its most specific alias. */
function keepBest(found: Map<string, AliasMatch>, candidate: SubjectAlias, start: number, end: number): void {
  const existing = found.get(candidate.subject.id)
  if (!existing || candidate.words > existing.words) {
    found.set(candidate.subject.id, {
      subject: candidate.subject,
      alias: candidate.alias,
      words: candidate.words,
      ambiguous: candidate.ambiguous,
      start,
      end,
    })
  }
}

/** Re-exported so callers do not need to know where the rule lives. */
export { containsAlias, needsSecondClue }
