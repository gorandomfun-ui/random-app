/**
 * Images for the subjects the owner liked.
 *
 * The owner's curation likes already drive a video search that rotates angles,
 * languages and eras around the subject. Images were never part of it: the
 * exploration only ever queued YouTube and Dailymotion. That is how the
 * catalogue ended up holding 360 Die Toten Hosen videos — a liked subject — and
 * no image of the band at all.
 *
 * Images need no ladder. A subject either has GIFs or it does not, and the
 * nuance of mainstream-to-niche belongs to the video side. So this asks one
 * direct question per subject and stops.
 */

import type { Db } from 'mongodb'

import { ingestImages } from '@/lib/ingest/images'
import { hydrateOwnerReferences } from '@/lib/discovery/ownerStore'
import { curatorOwnerId } from '@/lib/discovery/curatorAuth'
import type { OwnerReference } from '@/lib/discovery/editorial'

const REFERENCES = 'discovery_owner_references_v2'

/** Below this, a subject is treated as having no images worth serving. */
export const THIN_IMAGE_COUNT = 5

/** Refusals in a row before giving up, as the provider is rate limited by the day. */
const REFUSALS_BEFORE_STOPPING = 3

export type LikedSubject = {
  key: string
  label: string
  /** Images already held for this subject. */
  images: number
}

export type LikedImagesReport = {
  subjects: number
  asked: number
  inserted: number
  refused: number
  stoppedEarly: boolean
  perSubject: { label: string; found: number; inserted: number }[]
}

/**
 * The subjects behind the owner's active likes, thinnest in images first, so a
 * limited run spends itself where the gap is widest.
 */
export async function likedSubjectsMissingImages(db: Db, limit = 20): Promise<LikedSubject[]> {
  const ownerId = curatorOwnerId()
  const references = await db
    .collection<OwnerReference>(REFERENCES)
    .find({ ownerId, active: true })
    .limit(200)
    .toArray()

  const hydrated = await hydrateOwnerReferences(db, references)

  // Only named things, never topics. A like on a stop-motion film yields both
  // "Hasbro's Marvel Legends" and "stop motion"; searching images for the second
  // brings back GIFs that have nothing to do with what was liked. An entity is
  // specific enough that its images belong to it.
  const seen = new Map<string, string>()
  for (const reference of hydrated) {
    const analysis = reference.profile?.subject
    for (const subject of [analysis?.primary, ...(analysis?.secondary ?? [])]) {
      if (!subject?.key || !subject.label) continue
      if (subject.kind !== 'entity') continue
      if (!seen.has(subject.key)) seen.set(subject.key, subject.label)
    }
  }

  const items = db.collection('items')
  const counted: LikedSubject[] = []
  for (const [key, label] of seen) {
    const images = await items.countDocuments(
      { type: 'image', 'v3.subjects.id': key },
      { maxTimeMS: 15_000 },
    )
    if (images >= THIN_IMAGE_COUNT) continue
    counted.push({ key, label, images })
  }

  return counted.sort((left, right) => left.images - right.images).slice(0, limit)
}

/**
 * Asks the image providers about each subject, once. Stops when the provider
 * starts refusing rather than recording the rest as having no images.
 */
export async function ingestImagesForLikedSubjects(
  db: Db,
  { limit = 20, dryRun = false }: { limit?: number; dryRun?: boolean } = {},
): Promise<LikedImagesReport> {
  const subjects = await likedSubjectsMissingImages(db, limit)
  const report: LikedImagesReport = {
    subjects: subjects.length,
    asked: 0,
    inserted: 0,
    refused: 0,
    stoppedEarly: false,
    perSubject: [],
  }

  let refusedInARow = 0
  for (const subject of subjects) {
    const result = await ingestImages({
      queries: [subject.label],
      perQuery: 25,
      providers: ['giphy'],
      dryRun,
      insertOnly: true,
    })
    report.asked += 1

    if (result.refusals?.length) {
      report.refused += 1
      refusedInARow += 1
      if (refusedInARow >= REFUSALS_BEFORE_STOPPING) {
        report.stoppedEarly = true
        break
      }
      continue
    }

    refusedInARow = 0
    report.inserted += result.inserted
    report.perSubject.push({ label: subject.label, found: result.unique, inserted: result.inserted })
  }

  return report
}
