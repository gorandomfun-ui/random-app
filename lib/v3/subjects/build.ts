/**
 * Assembling subjects_v3.
 *
 * Two sources: the hand-written themes, and the entities people actually read
 * about on Wikipedia. Both end up in the same shape, deduplicated by
 * normalised label so "Johnny Hallyday" arriving from three languages stays
 * one subject.
 */

import type { Db, Document } from 'mongodb'

import type { Subject, SubjectSource, Universe } from '../types'
import { needsSecondClue, normalize, subjectId } from '../tagging/normalize'
import { THEMES } from './themes'
import type { WikidataSubject } from './wikidata'

export const SUBJECTS_COLLECTION = 'subjects_v3'

export type BuiltSubject = Subject & { ambiguous: boolean }

function emptySubject(id: string, label: string, universe: Universe, kind: Subject['kind'], source: SubjectSource): BuiltSubject {
  return {
    _id: id,
    kind,
    label,
    aliases: [],
    universe,
    sources: [source],
    counts: {},
    angleCounts: {},
    createdAt: new Date(),
    ambiguous: false,
  }
}

/** Normalised, deduplicated, empties removed. */
function cleanAliases(values: string[]): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalize(value)
    if (normalized.length >= 2) seen.add(normalized)
  }
  return Array.from(seen)
}

export function buildThemeSubjects(): BuiltSubject[] {
  return THEMES.map((theme) => {
    const id = `topic:${theme.slug}`
    const subject = emptySubject(id, theme.label, theme.universe, 'topic', 'backfill')
    subject.aliases = cleanAliases([theme.label, ...theme.aliases])
    subject.ambiguous = subject.aliases.every((alias) => needsSecondClue(alias))
    return subject
  })
}

export function buildEntitySubject(entity: WikidataSubject): BuiltSubject | null {
  const label = entity.label.trim()
  if (!label || label.length > 100) return null
  const normalized = normalize(label)
  if (normalized.length < 2) return null

  const subject = emptySubject(subjectId('entity', label), label, entity.universe, 'entity', 'mainstream')
  subject.aliases = cleanAliases([label, ...entity.aliases])
  // A one-word common name ("Friends", "Cars") only applies with a second clue.
  subject.ambiguous = needsSecondClue(label)
  return subject
}

/** Later duplicates merge their aliases and sources into the first one seen. */
export function mergeSubjects(subjects: BuiltSubject[]): BuiltSubject[] {
  const byId = new Map<string, BuiltSubject>()

  for (const subject of subjects) {
    const existing = byId.get(subject._id)
    if (!existing) {
      byId.set(subject._id, subject)
      continue
    }
    existing.aliases = Array.from(new Set([...existing.aliases, ...subject.aliases]))
    existing.sources = Array.from(new Set([...existing.sources, ...subject.sources])) as SubjectSource[]
    // A theme keeps its curated universe; entities may disagree, first wins.
    if (existing.universe === 'other' && subject.universe !== 'other') {
      existing.universe = subject.universe
    }
  }

  return Array.from(byId.values())
}

/** Mongo needs the string _id declared, otherwise it assumes an ObjectId. */
type SubjectDocument = Document & { _id: string }

export type WriteResult = { inserted: number; updated: number }

/** Upserts so a rerun adds new subjects without discarding counts already gathered. */
export async function writeSubjects(db: Db, subjects: BuiltSubject[]): Promise<WriteResult> {
  if (!subjects.length) return { inserted: 0, updated: 0 }

  const operations = subjects.map((subject) => ({
    updateOne: {
      filter: { _id: subject._id },
      update: {
        $setOnInsert: {
          kind: subject.kind,
          label: subject.label,
          universe: subject.universe,
          counts: {},
          angleCounts: {},
          createdAt: subject.createdAt,
        },
        $addToSet: {
          aliases: { $each: subject.aliases },
          sources: { $each: subject.sources },
        },
        $set: { ambiguous: subject.ambiguous },
      },
      upsert: true,
    },
  }))

  const result = await db.collection<SubjectDocument>(SUBJECTS_COLLECTION).bulkWrite(operations, { ordered: false })
  return { inserted: result.upsertedCount, updated: result.modifiedCount }
}
