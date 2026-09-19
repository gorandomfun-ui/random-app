/**
 * Tagging content as it is ingested.
 *
 * Without this, everything stored since the labels existed arrives blank: the
 * catalogue gets tagged in one pass while several thousand new videos a day
 * enter with nothing, and the gap reopens every night.
 */

import type { Db } from 'mongodb'

import { getSubjectIndex } from './indexCache'
import { tagItem, type TaggableItem } from './tagItem'
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
  line: Line = 'legacy',
  now = new Date(),
): Promise<Array<T | TaggedDocument<T>>> {
  if (!documents.length) return documents
  const index = await getSubjectIndex(db)
  if (!index) return documents

  return documents.map((document) => {
    const tags = tagItem(document, index, now)
    const labels = tags.subjects
      .map((subject) => index.subjects.get(subject.id)?.label)
      .filter((label): label is string => Boolean(label))

    return {
      ...document,
      v3: {
        ...tags,
        line,
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
