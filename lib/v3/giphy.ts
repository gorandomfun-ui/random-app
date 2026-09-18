/**
 * Getting more out of Giphy, which the audit found at 27% tagged although its
 * titles are perfectly usable.
 *
 * Giphy titles follow a strong convention — "<subject> GIF by <studio>" — and
 * the studio is both a reliable author and often a subject in its own right
 * (Apple Music, Annapurna Interactive, One Chicago).
 */

import type { Db } from 'mongodb'

import { normalize } from './tagging/normalize'
import { SUBJECTS_COLLECTION } from './subjects/build'

export type GiphyTitleParts = {
  /** The words before "GIF", which name what the GIF is about. */
  subjectText: string | null
  /** The studio or user after "by". */
  studio: string | null
}

/**
 * Splits "Fps Platformer GIF by Annapurna Interactive" into its two halves.
 *
 * Handles the variants seen in the catalogue: no studio ("asian food GIF"),
 * no "GIF" marker at all, and "Sticker" which Giphy uses for the same shape.
 */
export function parseGiphyTitle(title: string | null | undefined): GiphyTitleParts {
  const text = (title ?? '').trim()
  if (!text) return { subjectText: null, studio: null }

  const match = text.match(/^(.*?)\s*\b(?:GIF|Sticker)\b\s*(?:by\s+(.+))?$/i)
  if (!match) return { subjectText: text || null, studio: null }

  const subjectText = match[1]?.trim() || null
  const studio = match[2]?.trim() || null
  return { subjectText, studio }
}

/** Words worth matching against the dictionary, most specific first. */
export function giphySearchableText(input: {
  title?: string | null
  slug?: string | null
  username?: string | null
}): string {
  const { subjectText, studio } = parseGiphyTitle(input.title)
  const slugWords = (input.slug ?? '')
    .split('-')
    // The trailing token of a Giphy slug is its random id.
    .slice(0, -1)
    .join(' ')
  return [subjectText, studio, input.username, slugWords].filter(Boolean).join(' ')
}

export type SubjectGap = {
  id: string
  label: string
  videos: number
  images: number
}

/**
 * Subjects the catalogue has videos for but no image.
 *
 * This is the fix that matters most: searching Giphy for subjects we already
 * hold, instead of random keywords, is what lets a Wave work in both
 * directions — a South Park GIF leading to a South Park video, and back.
 */
export async function findSubjectsMissingImages(db: Db, limit = 200): Promise<SubjectGap[]> {
  const rows = await db
    .collection(SUBJECTS_COLLECTION)
    .aggregate(
      [
        {
          $match: {
            'counts.video': { $gte: 3 },
            $or: [{ 'counts.image': { $exists: false } }, { 'counts.image': { $lt: 1 } }],
          },
        },
        { $sort: { 'counts.video': -1 } },
        { $limit: limit },
        { $project: { label: 1, videos: '$counts.video', images: { $ifNull: ['$counts.image', 0] } } },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  return rows.map((row) => ({
    id: String(row._id),
    label: String(row.label ?? row._id),
    videos: Number(row.videos ?? 0),
    images: Number(row.images ?? 0),
  }))
}

/** A Giphy result only counts for the subject we asked about if it says so. */
export function mentionsSubject(text: string, subjectLabel: string): boolean {
  const haystack = normalize(text)
  const needle = normalize(subjectLabel)
  if (!haystack || needle.length < 2) return false
  return ` ${haystack} `.includes(` ${needle} `)
}
