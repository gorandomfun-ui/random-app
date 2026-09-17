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

import { containsAlias, needsSecondClue, normalize } from './normalize'

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
      if (alias.length < 2) continue
      aliasCount += 1

      if (UNSPACED_SCRIPT.test(alias)) {
        unspaced.push({ alias, subject, words: 1 })
        continue
      }

      const firstWord = alias.split(' ')[0]
      if (!firstWord) continue
      const bucket = byFirstWord.get(firstWord)
      const entry: SubjectAlias = { alias, subject, words: alias.split(' ').length }
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
      if (!padded.includes(` ${candidate.alias} `)) continue
      keepBest(found, candidate)
    }
  }

  if (UNSPACED_SCRIPT.test(normalized)) {
    for (const candidate of index.unspaced) {
      if (normalized.includes(candidate.alias)) keepBest(found, candidate)
    }
  }

  return Array.from(found.values()).filter((match) => !match.subject.ambiguous || secondClue(match))
}

/** One subject, matched by its most specific alias. */
function keepBest(found: Map<string, AliasMatch>, candidate: SubjectAlias): void {
  const existing = found.get(candidate.subject.id)
  if (!existing || candidate.words > existing.words) {
    found.set(candidate.subject.id, {
      subject: candidate.subject,
      alias: candidate.alias,
      words: candidate.words,
    })
  }
}

/** Re-exported so callers do not need to know where the rule lives. */
export { containsAlias, needsSecondClue }
