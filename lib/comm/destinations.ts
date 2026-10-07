/**
 * Where a post goes, and what each place accepts: dimensions, length, number
 * of slides, text limits. The journey reads this; adding a network is adding
 * an entry here, not touching the pages. Reddit is out of v1 (6 October 2026).
 */

import type { Destination } from './model'
import type { Family } from './templates'

export type FormatSpec = {
  key: string
  name: string
  family: Family
  /** What a slide may hold. */
  media: 'image' | 'video' | 'both'
  slides: { min: number; max: number }
  maxSeconds: number | null
  /** The caption's limit in characters, and how many hashtags are reasonable. */
  caption: number
  hashtags: number
}

export type DestinationSpec = {
  key: Destination
  name: string
  /** Direct publication from the tool, or an export of files. */
  direct: boolean
  directNote: string
  /** The caption's links are not clickable there: the bio page carries them. */
  linkInBio: boolean
  formats: FormatSpec[]
}

export const DESTINATION_SPECS: DestinationSpec[] = [
  {
    key: 'instagram', name: 'Instagram', direct: true, linkInBio: true,
    directNote: 'Publication directe depuis l’outil, compte professionnel et application Meta en mode développement.',
    formats: [
      { key: 'story', name: 'Story', family: '9:16', media: 'both', slides: { min: 1, max: 10 }, maxSeconds: 60, caption: 2200, hashtags: 10 },
      { key: 'post', name: 'Post', family: '4:5', media: 'image', slides: { min: 1, max: 1 }, maxSeconds: null, caption: 2200, hashtags: 30 },
      { key: 'carousel', name: 'Carrousel', family: '4:5', media: 'image', slides: { min: 2, max: 10 }, maxSeconds: null, caption: 2200, hashtags: 30 },
      { key: 'reel', name: 'Reel', family: '9:16', media: 'video', slides: { min: 1, max: 1 }, maxSeconds: 90, caption: 2200, hashtags: 30 },
    ],
  },
  {
    key: 'tiktok', name: 'TikTok', direct: false, linkInBio: true,
    directNote: 'Export de fichiers : sans audit de l’application, TikTok force les publications de l’API en privé.',
    formats: [
      { key: 'video', name: 'Vidéo', family: '9:16', media: 'video', slides: { min: 1, max: 1 }, maxSeconds: 60, caption: 2200, hashtags: 10 },
      { key: 'photos', name: 'Photos', family: '9:16', media: 'image', slides: { min: 1, max: 35 }, maxSeconds: null, caption: 2200, hashtags: 10 },
    ],
  },
  {
    key: 'x', name: 'X', direct: false, linkInBio: false,
    directNote: 'Export de fichiers : plus de palier gratuit pour écrire par l’API depuis février 2026.',
    formats: [
      { key: 'post', name: 'Post', family: '16:9', media: 'both', slides: { min: 1, max: 4 }, maxSeconds: 140, caption: 280, hashtags: 3 },
    ],
  },
]

export function destinationSpec(key: string): DestinationSpec | null {
  return DESTINATION_SPECS.find((spec) => spec.key === key) ?? null
}

export function formatSpec(destination: string, format: string): FormatSpec | null {
  return destinationSpec(destination)?.formats.find((spec) => spec.key === format) ?? null
}
