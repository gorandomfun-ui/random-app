/**
 * The indexes the v3 label system needs.
 *
 * Declared here as data so they can be listed in a dry run before anything is
 * created. Creating an index is a write, which the plan gates behind an
 * explicit go-ahead.
 */

import type { Db, IndexSpecification, CreateIndexesOptions } from 'mongodb'

export const ITEMS = 'items'
export const SUBJECTS = 'subjects_v3'

export type PlannedIndex = {
  collection: string
  name: string
  key: IndexSpecification
  options?: CreateIndexesOptions
  /** Why it exists, so a later reader can tell whether it is still needed. */
  purpose: string
}

export const V3_INDEXES: PlannedIndex[] = [
  {
    collection: ITEMS,
    name: 'v3_subject_type_rand',
    key: { 'v3.subjects.id': 1, type: 1, rand: 1 },
    purpose: 'Wave level 1 and 2: items sharing a subject, drawn at random.',
  },
  {
    collection: ITEMS,
    name: 'v3_universe_type_rand',
    key: { 'v3.universe': 1, type: 1, rand: 1 },
    purpose: 'Wave level 3: same universe, drawn at random.',
  },
  {
    collection: ITEMS,
    name: 'v3_line_type_rand',
    key: { 'v3.line': 1, type: 1, rand: 1 },
    purpose: 'Random draw: pick a line, then an item inside it.',
  },
  {
    collection: ITEMS,
    name: 'type_provider_counts',
    key: { type: 1, provider: 1 },
    purpose: 'Admin stats: count by type and provider without reading every document.',
  },
  {
    collection: ITEMS,
    name: 'v3_channel_key',
    key: { 'v3.channelKey': 1 },
    purpose: 'Per-author caps and the "never twice the same author" rules.',
  },
  {
    collection: SUBJECTS,
    name: 'subject_aliases',
    key: { aliases: 1 },
    purpose: 'Alias tagging: find the subject an alias belongs to.',
  },
  {
    collection: SUBJECTS,
    name: 'subject_sources_dig',
    key: { sources: 1, 'dig.status': 1 },
    purpose: 'Ingestion: find subjects waiting to be dug into.',
  },
]

export type IndexReport = {
  collection: string
  name: string
  key: string
  purpose: string
  alreadyPresent: boolean
}

/** Reads only. Says what would be created, without creating anything. */
export async function planIndexes(db: Db): Promise<IndexReport[]> {
  const reports: IndexReport[] = []
  for (const index of V3_INDEXES) {
    const existing = await db
      .collection(index.collection)
      .indexes()
      .catch(() => [])
    const alreadyPresent = existing.some((candidate) => candidate.name === index.name)
    reports.push({
      collection: index.collection,
      name: index.name,
      key: JSON.stringify(index.key),
      purpose: index.purpose,
      alreadyPresent,
    })
  }
  return reports
}

/** Creates the missing indexes. Building them in the background keeps the site responsive. */
export async function installIndexes(db: Db): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = []
  const skipped: string[] = []

  for (const index of V3_INDEXES) {
    const existing = await db
      .collection(index.collection)
      .indexes()
      .catch(() => [])
    if (existing.some((candidate) => candidate.name === index.name)) {
      skipped.push(`${index.collection}.${index.name}`)
      continue
    }
    await db.collection(index.collection).createIndex(index.key, {
      name: index.name,
      background: true,
      ...index.options,
    })
    created.push(`${index.collection}.${index.name}`)
  }

  return { created, skipped }
}
