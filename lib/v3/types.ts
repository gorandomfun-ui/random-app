/**
 * The v3 label vocabulary.
 *
 * Every list here is closed: a tagger may only pick from these values, never
 * invent one. That is what lets the Wave and the Random draw reason about
 * items without ever precomputing a link between two of them.
 */

export type ItemType = 'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'

/** Roughly twenty broad worlds. `other` is the honest fallback, not a bin. */
export const UNIVERSES = [
  'music',
  'cinema-tv',
  'animation',
  'gaming',
  'sport',
  'food',
  'craft',
  'art',
  'fashion',
  'vehicles',
  'travel',
  'nature-animals',
  'science',
  'tech',
  'history',
  'humor-memes',
  'people-everyday',
  'events-parties',
  'news-society',
  'other',
] as const

export type Universe = (typeof UNIVERSES)[number]

/** How a piece feels. An item may carry several. */
export const MOODS = ['fun', 'weird', 'dark', 'chill', 'epic', 'cute', 'nostalgic', 'wholesome'] as const

export type Mood = (typeof MOODS)[number]

/**
 * How the subject is treated. This is the axis the Wave varies: seeing a
 * subject through a different angle is what makes the next item interesting
 * rather than repetitive.
 */
export const ANGLES = [
  'official-clip',
  'live-concert',
  'amateur-cover',
  'fan-footage',
  'home-video',
  'local-event',
  'mainstream-report',
  'interview',
  'tv-archive',
  'parody-sketch',
  'tutorial',
  'reaction',
  'compilation',
  'gameplay',
  'travel-vlog',
  'documentary',
  'episode-extract',
  'meme-gif',
  'photo-image',
  'fan-art',
  'text-quote',
  'text-joke',
  'text-fact',
  'quiz',
  'website',
  'other',
] as const

export type Angle = (typeof ANGLES)[number]

/**
 * Four tiers rather than the brief's three.
 *
 * Measured on the catalogue: 6,303 videos sit between 1M and 2M views and are
 * not big hits, while 437 are above 100M. A single ">1M = mainstream" line put
 * those in the same bucket, so `known` was split out.
 */
export type Popularity = 'niche' | 'mid' | 'known' | 'mainstream' | 'unknown'

export type Era = 'trend' | 'recent' | 'retro' | 'unknown'

/** Which ingestion line brought the item in. */
export type Line = 'trend' | 'retro-trend' | 'mainstream' | 'combo' | 'like-dig' | 'subject-dig' | 'legacy'

export type SubjectKind = 'entity' | 'topic' | 'combo'

export type SubjectSource = 'like' | 'trend' | 'retro-trend' | 'mainstream' | 'combo' | 'backfill' | 'ai'

/** How we came to believe an item is about a subject. */
export type Evidence = 'alias' | 'ai' | 'search-verified'

export type SubjectRef = {
  id: string
  role: 'primary' | 'secondary'
  evidence: Evidence
}

export type DigStatus = 'none' | 'planned' | 'running' | 'done'

export type Subject = {
  /** "entity:johnny-hallyday", "topic:road-trip", "combo:road-trip+desert" */
  _id: string
  kind: SubjectKind
  label: string
  /** Normalised spellings, across languages. */
  aliases: string[]
  universe: Universe
  /** For a combo: the topics it joins. */
  parents?: string[]
  sources: SubjectSource[]
  counts: Partial<Record<ItemType, number>>
  angleCounts: Partial<Record<Angle, number>>
  dig?: {
    status: DigStatus
    budget: number
    ingested: number
    lastRunAt?: Date
  }
  createdAt: Date
}

/** The `v3` block written on every tagged item. */
export type ItemTags = {
  subjects: SubjectRef[]
  universe: Universe
  moods: Mood[]
  angle: Angle
  popularity: Popularity
  era: Era
  year?: number
  /** "youtube:UCxxx" or "dailymotion:xxxxx" — the real author, never a category. */
  channelKey?: string
  line: Line
  usable: boolean
  tagVersion: 1
  taggedAt: Date
}

export const TAG_VERSION = 1 as const

function isMember<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

export const isUniverse = (value: unknown): value is Universe => isMember(UNIVERSES, value)
export const isMood = (value: unknown): value is Mood => isMember(MOODS, value)
export const isAngle = (value: unknown): value is Angle => isMember(ANGLES, value)
