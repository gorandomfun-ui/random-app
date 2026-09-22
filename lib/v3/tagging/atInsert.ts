/**
 * Tagging content as it is ingested.
 *
 * Without this, everything stored since the labels existed arrives blank: the
 * catalogue gets tagged in one pass while several thousand new videos a day
 * enter with nothing, and the gap reopens every night.
 */

import type { Db } from 'mongodb'

import { lookupSubjectIndex } from './lookup'
import { tagItem, taggableText, type TaggableItem } from './tagItem'
import { formatFamilyKey, nearFamilyKey } from '../families'
import type { ItemTags, Line } from '../types'

export type TaggableDocument = TaggableItem & {
  title?: string | null
  lang?: string | null
  slug?: string | null
  apiTags?: string[] | null
  creatorId?: string | null
}

export type TaggedDocument<T> = T & { v3: ItemTags & { nearFamily: string; formatFamily: string } }

/**
 * Adds the `v3` block to each document.
 *
 * On failure the documents come back untouched: a dictionary that cannot be
 * read must not stop an ingestion run, and the next tagging pass will catch up.
 */
export async function tagForInsert<T extends TaggableDocument>(
  db: Db,
  documents: T[],
  /**
   * The ingestion line, when the caller knows it. Left out, the line the
   * tagger reads from the document stands: a default of `legacy` here
   * overwrote `trend` on every trending video since 19 September, and the
   * cool pool's trend source found 25 of them.
   */
  line?: Line,
  now = new Date(),
): Promise<Array<T | TaggedDocument<T>>> {
  if (!documents.length) return documents
  // Only the subjects these documents could possibly mention, rather than the
  // whole dictionary: the cost follows the batch, not the catalogue.
  //
  // Whatever comes back, every document is labelled. A lookup that fails only
  // costs the subjects; the universe, the angle, the era and the two family
  // fingerprints are read from the document itself and are what the draw rules
  // and the Wave's looser levels work on. Returning the documents untouched
  // instead stored four thousand videos with no v3 block at all, invisible to
  // everything, until a full pass over the catalogue picked them up.
  const { index, partial } = await lookupSubjectIndex(db, documents.map(taggableText))
  if (partial) {
    console.warn(`[v3] étiquetage partiel pour ${documents.length} contenus : sujets possiblement manquants`)
  }

  return documents.map((document) => {
    const tags = tagItem(document, index, now)
    const labels = tags.subjects
      .map((subject) => index.subjects.get(subject.id)?.label)
      .filter((label): label is string => Boolean(label))

    return {
      ...document,
      v3: {
        ...tags,
        line: line ?? tags.line,
        nearFamily: nearFamilyKey(document.title ?? '', labels),
        formatFamily: formatFamilyKey({
          primarySubjectId: tags.subjects[0]?.id,
          universe: tags.universe,
          angle: tags.angle,
          lang: document.lang,
        }),
      },
    }
  })
}
