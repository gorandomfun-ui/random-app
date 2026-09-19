/**
 * Whether an item has a Wave, answered without touching the catalogue.
 *
 * The button must be there or not the instant the content appears — no
 * spinner, no "preparing", no timeout. The per-subject counts already say how
 * many contents a subject holds, so the answer is a lookup in a small map
 * held in memory rather than a query per draw.
 */

import type { Db } from 'mongodb'

import { SUBJECTS_COLLECTION } from '../subjects/build'
import type { SubjectRef } from '../types'

/** A subject needs at least this many contents for a Wave to be worth offering. */
const ENOUGH_FOR_A_WAVE = 2

const REFRESH_AFTER_MS = 5 * 60 * 1000

let counts: Map<string, number> | null = null
let loadedAt = 0
let loading: Promise<Map<string, number>> | null = null

async function load(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .collection(SUBJECTS_COLLECTION)
    .find({ counts: { $exists: true } }, { projection: { counts: 1 } })
    .toArray()

  const next = new Map<string, number>()
  for (const row of rows) {
    const bucket = (row.counts ?? {}) as Record<string, number>
    const total = Object.values(bucket).reduce((sum, value) => sum + (value || 0), 0)
    if (total >= ENOUGH_FOR_A_WAVE) next.set(String(row._id), total)
  }

  counts = next
  loadedAt = Date.now()
  return next
}

async function subjectCounts(db: Db): Promise<Map<string, number>> {
  if (counts && Date.now() - loadedAt < REFRESH_AFTER_MS) return counts
  if (loading) return loading

  loading = load(db).finally(() => {
    loading = null
  })

  try {
    return await loading
  } catch (error) {
    console.error('[v3] compteurs de sujets illisibles', error)
    // An empty map hides the button rather than promising a Wave that fails.
    return counts ?? new Map()
  }
}

/**
 * True when at least one of the item's subjects holds enough content.
 *
 * Deliberately optimistic about which subject: the Wave itself walks down to
 * the universe if the primary subject disappoints, so a button shown on a
 * thin subject still leads somewhere.
 */
export async function hasWave(db: Db, subjects: SubjectRef[] | undefined): Promise<boolean> {
  if (!subjects?.length) return false
  const map = await subjectCounts(db)
  return subjects.some((subject) => map.has(subject.id))
}

/** Test seam, and a way to pick up new counts immediately. */
export function resetWaveAvailability(): void {
  counts = null
  loadedAt = 0
  loading = null
}
