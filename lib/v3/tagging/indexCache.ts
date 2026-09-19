/**
 * Keeps the subject dictionary in memory so ingestion can tag as it inserts.
 *
 * The dictionary is 63,137 subjects and a quarter of a million aliases;
 * loading it per request would cost more than the ingestion itself. It is
 * loaded once and reused, and refreshed on a timer so subjects added by a
 * like or a trend start applying within the hour without a restart.
 */

import type { Db } from 'mongodb'

import { buildSubjectIndex, type SubjectIndex, type SubjectRow } from './subjectIndex'
import { SUBJECTS_COLLECTION } from '../subjects/build'

const REFRESH_AFTER_MS = 30 * 60 * 1000

let cached: SubjectIndex | null = null
let loadedAt = 0
let loading: Promise<SubjectIndex> | null = null

async function load(db: Db): Promise<SubjectIndex> {
  const rows = (await db
    .collection(SUBJECTS_COLLECTION)
    .find({}, { projection: { label: 1, universe: 1, kind: 1, aliases: 1, ambiguous: 1 } })
    .toArray()) as unknown as SubjectRow[]
  cached = buildSubjectIndex(rows)
  loadedAt = Date.now()
  return cached
}

/**
 * Returns null rather than throwing if the dictionary cannot be read: an
 * ingestion run that cannot tag should still store its videos, and the next
 * tagging pass will label them.
 */
export async function getSubjectIndex(db: Db): Promise<SubjectIndex | null> {
  if (cached && Date.now() - loadedAt < REFRESH_AFTER_MS) return cached
  if (loading) return loading

  loading = load(db)
    .catch((error) => {
      console.error('[v3] dictionnaire illisible, ingestion sans étiquettes', error)
      throw error
    })
    .finally(() => {
      loading = null
    })

  try {
    return await loading
  } catch {
    return cached
  }
}

/** Test seam, and a way to force a reload after the dictionary changes. */
export function resetSubjectIndexCache(): void {
  cached = null
  loadedAt = 0
  loading = null
}
