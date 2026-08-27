import type { Document, Filter } from 'mongodb'

const STRONG_TERMS = [
  'absurd',
  'analog',
  'archive',
  'archival',
  'bizarre',
  'curious',
  'forgotten',
  'found footage',
  'glitch',
  'homemade',
  'improbable',
  'lost tape',
  'mysterious',
  'obscure',
  'odd',
  'oddity',
  'outsider',
  'public access',
  'rare',
  'retro',
  'strange',
  'surreal',
  'uncanny',
  'unexpected',
  'unusual',
  'vintage',
  'weird',
]

const STRONG_REGEXES = STRONG_TERMS.map((term) => new RegExp(term.replace(/\s+/g, '\\s+'), 'i'))
export const STRONG_POOL_MAX_TIME_MS = 900

export function buildStrongPoolMatch<T extends Document>(): Filter<T> {
  const match = {
    isSuppressed: { $ne: true },
    $or: [
      { likeCount: { $gte: 1 } },
      { quality: { $gte: 2 } },
      { showWeight: { $gte: 1.2 } },
      { title: { $in: STRONG_REGEXES } },
      { text: { $in: STRONG_REGEXES } },
      { description: { $in: STRONG_REGEXES } },
      { channelTitle: { $in: STRONG_REGEXES } },
      { host: { $in: STRONG_REGEXES } },
      { tags: { $in: STRONG_REGEXES } },
      { keywords: { $in: STRONG_REGEXES } },
      { toneSignals: { $in: STRONG_REGEXES } },
      { apiTags: { $in: STRONG_REGEXES } },
    ],
  }
  return match as unknown as Filter<T>
}
