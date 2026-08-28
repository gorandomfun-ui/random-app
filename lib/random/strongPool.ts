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
  'glamour',
  'homemade',
  'improbable',
  'latin dance',
  'lost tape',
  'mysterious',
  'obscure',
  'odd',
  'oddity',
  'outsider',
  'pin up',
  'pin-up',
  'public access',
  'rare',
  'red carpet',
  'retro',
  'runway',
  'strange',
  'sensual',
  'sexy',
  'showgirl',
  'swimwear',
  'surreal',
  'tango',
  'uncanny',
  'unexpected',
  'unusual',
  'vintage',
  'weird',
]

const STRONG_REGEXES = STRONG_TERMS.map((term) => new RegExp(term.replace(/\s+/g, '\\s+'), 'i'))
const STRONG_BLOCKED_TERMS = [
  'porn',
  'porno',
  'pornhub',
  'xxx',
  'x-rated',
  'x rated',
  'explicit',
  'nsfw',
  'nude',
  'nudity',
  'naked',
  'onlyfans',
  'sex tape',
  'webcam sex',
  'hardcore',
  'softcore',
  'hentai',
  'underage',
  'schoolgirl',
  'schoolboy',
  'jailbait',
]
const STRONG_BLOCKED_REGEXES = STRONG_BLOCKED_TERMS.map((term) => new RegExp(term.replace(/\s+/g, '\\s+'), 'i'))
const STRONG_TEXT_FIELDS = [
  'title',
  'text',
  'description',
  'channelTitle',
  'host',
  'tags',
  'keywords',
  'toneSignals',
  'apiTags',
] as const
export const STRONG_POOL_MAX_TIME_MS = 900

export function buildStrongPoolMatch<T extends Document>(): Filter<T> {
  const blockedMatches = STRONG_TEXT_FIELDS.flatMap((field) =>
    STRONG_BLOCKED_REGEXES.map((regex) => ({ [field]: regex })),
  )
  const match = {
    isSuppressed: { $ne: true },
    $nor: blockedMatches,
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
