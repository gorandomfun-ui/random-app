/**
 * Finding the handful of subjects a batch could possibly mention.
 *
 * Tagging at insertion used to load the whole dictionary into memory. That was
 * affordable at 63,000 subjects; at 152,517 subjects and 567,549 aliases it
 * costs about nine seconds against a nearby database and far more from a
 * serverless function, which is what pushed the trending line past its four
 * minute budget until it stopped producing anything at all.
 *
 * Nothing needs the whole dictionary. A batch of forty titles contains a few
 * hundred distinct words, so the aliases worth considering are the ones that
 * actually appear in them. One indexed query returns those, and the matcher
 * then works exactly as before on a dictionary of a few dozen subjects.
 */

import type { Db } from 'mongodb'

import { normalize } from './normalize'
import { buildSubjectIndex, type SubjectIndex, type SubjectRow } from './subjectIndex'
import { SUBJECTS_COLLECTION } from '../subjects/build'

/**
 * Longest alias worth assembling, in words. Film and show titles run long —
 * "teenage mutant ninja turtles mutant mayhem" is six — and stopping at four
 * made the matcher settle for a shorter, vaguer subject.
 */
const MAX_ALIAS_WORDS = 7

/**
 * Words read per document. Capping the batch as a whole was a mistake: the
 * limit was reached partway through and the documents after it were searched
 * for nothing at all, so they came back untagged. A per-document ceiling costs
 * every document the same.
 */
const MAX_WORDS_PER_TEXT = 80

/**
 * Every run of one to four consecutive words in the text, normalised the same
 * way aliases are, so a lookup matches what the matcher would match.
 */
export function aliasCandidates(texts: string[]): string[] {
  const candidates = new Set<string>()

  for (const text of texts) {
    const words = normalize(text).split(' ').filter(Boolean).slice(0, MAX_WORDS_PER_TEXT)
    for (let start = 0; start < words.length; start += 1) {
      for (let length = 1; length <= MAX_ALIAS_WORDS; length += 1) {
        if (start + length > words.length) break
        candidates.add(words.slice(start, start + length).join(' '))
      }
    }
  }

  return [...candidates]
}

/**
 * Aliases asked for in one query. A batch of forty titles yields thousands of
 * word runs, and asking for all of them at once was a single huge query that
 * this database could not answer inside any sensible budget.
 */
const CANDIDATES_PER_QUERY = 1200

/** Per query. Reads on this database average 277ms, so this is generous. */
const QUERY_BUDGET_MS = 12_000

export type LookupResult = {
  index: SubjectIndex
  /** True when at least one chunk failed, so the labels may be incomplete. */
  partial: boolean
}

/**
 * The subjects whose aliases appear in these texts.
 *
 * Asked for in chunks, and a chunk that fails costs only its own aliases: the
 * rest still label what they can. Returning nothing on the first timeout is
 * what let four thousand videos be stored with no labels at all in one
 * afternoon.
 *
 * Aliases written without spaces — Japanese and Korean above all — cannot be
 * rebuilt from words, so they are not found here. The periodic pass over the
 * whole catalogue still uses the complete dictionary and catches them.
 */
export async function lookupSubjectIndex(db: Db, texts: string[]): Promise<LookupResult> {
  const candidates = aliasCandidates(texts)
  if (!candidates.length) return { index: buildSubjectIndex([]), partial: false }

  const rows: SubjectRow[] = []
  let partial = false

  for (let offset = 0; offset < candidates.length; offset += CANDIDATES_PER_QUERY) {
    const chunk = candidates.slice(offset, offset + CANDIDATES_PER_QUERY)
    try {
      const found = (await db
        .collection(SUBJECTS_COLLECTION)
        .find(
          { aliases: { $in: chunk } },
          {
            projection: { label: 1, universe: 1, kind: 1, aliases: 1, ambiguous: 1 },
            maxTimeMS: QUERY_BUDGET_MS,
          },
        )
        .toArray()) as unknown as SubjectRow[]
      rows.push(...found)
    } catch (error) {
      partial = true
      console.error('[v3] un lot d_alias n_a pas pu être lu, étiquetage partiel', error)
    }
  }

  return { index: buildSubjectIndex(rows), partial }
}
