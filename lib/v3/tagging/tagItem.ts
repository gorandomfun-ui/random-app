/**
 * Turning one stored item into its v3 labels. Pure: no database, no network,
 * so it can be tested on a handful of examples and trusted on 1.67M.
 */

import type { Evidence, ItemTags, ItemType, Line, SubjectRef, Universe } from '../types'
import { TAG_VERSION, isUniverse } from '../types'
import { computeRegisters, wordsRegex } from '../cool/registers'
import { detectAngle } from './angle'
import { cueText, universeFromCues } from './cues'
import { channelKey, classifyEra, classifyPopularity, isUsableItem, yearFromTitle } from './classify'
import { appearsCapitalised, searchableText } from './normalize'
import { matchSubjects, type AliasMatch, type SubjectIndex } from './subjectIndex'

export type TaggableItem = {
  type: ItemType
  title?: string | null
  description?: string | null
  /**
   * Words the provider supplies outside the title. Giphy puts real subject
   * words in its slug ("onechicago-nbc-chicago-fire") and its username, which
   * the tagger never saw because it only read title and description.
   */
  apiTags?: string[] | null
  creatorId?: string | null
  slug?: string | null
  text?: string | null
  provider?: string | null
  channelId?: string | null
  channelTitle?: string | null
  viewCount?: number | null
  /**
   * The universe the line that found the item was looking for. It wins over
   * the subjects: a pool pass that asked for "barbecue argentin" found food,
   * whatever film happens to be called "Barbecue".
   */
  universeHint?: Universe | null
  publishedAt?: Date | null
  trendObservedAt?: Date | null
  categoryId?: string | null
  isAnimated?: boolean
  /** Facts stored as a quiz: the question is the subject-bearing text. */
  variant?: string | null
  quiz?: { question?: string | null } | null
}

/** At most this many subjects per item: beyond that they stop meaning anything. */
const MAX_SUBJECTS = 6

/**
 * A one-word common name only applies with a second, independent clue.
 * Two are accepted: the word was capitalised in the untouched title, or the
 * provider filed the item in a category matching the subject's universe.
 */
function hasSecondClue(item: TaggableItem, match: AliasMatch): boolean {
  if (appearsCapitalised(item.title ?? '', match.alias)) return true
  const category = item.categoryId?.toLowerCase() ?? ''
  if (!category) return false
  return match.subject.universe.split('-').some((part) => category.includes(part))
}

/** The line an item came in on, when the stored fields still say. */
function detectLine(item: TaggableItem): Line {
  if (item.trendObservedAt) return 'trend'
  return 'legacy'
}

/**
 * Words that say a title is about film or television. Films and series are
 * named with ordinary phrases — "The Truth", "Before and After", "Step by
 * Step", "Independence Day" — so on 26 September a quarter of what entered
 * cinema was cooking, sport and travel carried there by a title found in the
 * description. A cinema subject now needs one of these in the title, or a
 * provider category of film or TV, to make the item cinema.
 */
const CINEMA_CLUE = wordsRegex([
  'film', 'films', 'movie', 'movies', 'full movie', 'trailer', 'trailers', 'teaser', 'bande-annonce', 'bande annonce', 'tráiler',
  'película', 'pelicula', 'filme', 'cinema', 'cinéma', 'cine', 'kino', 'episode', 'épisode', 'episodio', 'series', 'série', 'serie',
  'season', 'saison', 'temporada', 'sitcom', 'tv show', 'tv series', 'scene', 'scène', 'clip', 'movie clip', 'actor', 'actress',
  'acteur', 'actrice', 'director', 'réalisateur', 'oscars', 'oscar', 'cannes', 'netflix', 'hbo', 'making of', 'behind the scenes',
  'explained', 'court métrage', 'short film', 'cortometraje', 'documentary', 'documentaire', 'feature', 'sequel', 'remake', 'cast',
])
/** YouTube's Film & Animation, Movies, Shows and Trailers; Dailymotion's short films and TV. */
const CINEMA_CATEGORIES = new Set(['1', '30', '43', '44', 'shortfilms', 'tv', 'film', 'movies'])

export function hasCinemaClue(item: Pick<TaggableItem, 'title' | 'categoryId'>): boolean {
  if (CINEMA_CLUE.test(item.title ?? '')) return true
  return CINEMA_CATEGORIES.has((item.categoryId ?? '').trim().toLowerCase())
}

function pickUniverse(matches: AliasMatch[], item: TaggableItem): Universe {
  // The line that found the item said what it was looking for (a pool pass asks Dailymotion for "concert rock 90s").
  if (item.universeHint && isUniverse(item.universeHint) && item.universeHint !== 'other') return item.universeHint
  for (const match of matches) {
    const universe = match.subject.universe
    if (!isUniverse(universe) || universe === 'other') continue
    // A film or a series named by an ordinary phrase says nothing without a word of cinema beside it.
    // Videos only: a GIF from a show ("Happy Dance GIF by Friends") is rightly the show's.
    if (universe === 'cinema-tv' && item.type === 'video' && !hasCinemaClue(item)) continue
    return universe
  }
  // No subject the dictionaries know: the words of the title still say "gameplay", "recipe", "concert".
  return universeFromCues(cueText(item as { title?: string | null; keywords?: unknown; tags?: unknown })) ?? 'other'
}

/**
 * Subjects are ordered by how specific the matching alias was, so "Johnny
 * Hallyday" outranks "moto" on a video about both, and the first one becomes
 * the primary subject the Wave keys on.
 */
function toSubjectRefs(matches: AliasMatch[], evidence: Evidence): SubjectRef[] {
  const ordered = [...matches].sort((left, right) => right.words - left.words)
  return ordered.slice(0, MAX_SUBJECTS).map((match, position) => ({
    id: match.subject.id,
    role: position === 0 ? 'primary' : 'secondary',
    evidence,
  }))
}

/** Subject words a provider files outside the title. */
function providerExtras(item: TaggableItem): string {
  const parts: string[] = []
  if (item.slug) {
    // A Giphy slug ends with a random id, which is noise.
    parts.push(item.slug.split('-').slice(0, -1).join(' '))
  }
  if (Array.isArray(item.apiTags)) parts.push(item.apiTags.join(' '))
  if (item.creatorId) parts.push(item.creatorId)
  return parts.filter(Boolean).join(' ')
}

/** Exactly the text tagItem searches, so a lookup asks for the right aliases. */
export function taggableText(item: TaggableItem): string {
  return [
    searchableText({
      title: item.title ?? item.quiz?.question ?? item.text,
      description: item.description ?? item.text,
    }),
    providerExtras(item),
  ]
    .filter(Boolean)
    .join(' ')
}

export function tagItem(item: TaggableItem, index: SubjectIndex, now = new Date()): ItemTags {
  const tags = labelItem(item, index, now)
  // The cool registers are read from the labels just written and the title,
  // so a content is part of the cool pool the moment it is stored.
  const registers = computeRegisters({ type: item.type, title: item.title, provider: item.provider, v3: tags })
  return registers.length ? { ...tags, registers } : tags
}

function labelItem(item: TaggableItem, index: SubjectIndex, now: Date): ItemTags {
  const usable = isUsableItem(item)
  const haystack = taggableText(item)

  const matches = usable
    ? matchSubjects(index, haystack, (match) => hasSecondClue(item, match))
    : []

  const ordered = [...matches].sort((left, right) => right.words - left.words)

  return {
    subjects: toSubjectRefs(ordered, 'alias'),
    universe: pickUniverse(ordered, item),
    // Moods stay empty for now: no rule fills them without guessing, and an
    // invented mood would poison the Wave's level 3.
    moods: [],
    angle: detectAngle({
      type: item.type,
      variant: item.variant,
      title: item.title,
      description: item.description,
      channelTitle: item.channelTitle,
      viewCount: item.viewCount,
      isAnimated: item.isAnimated,
    }),
    popularity: classifyPopularity(item.viewCount),
    era: classifyEra(
      { publishedAt: item.publishedAt, trendObservedAt: item.trendObservedAt, title: item.title },
      now,
    ),
    ...(yearFromTitle(item.title, now) !== undefined ? { year: yearFromTitle(item.title, now) } : {}),
    ...(channelKey(item) ? { channelKey: channelKey(item) } : {}),
    line: detectLine(item),
    usable,
    tagVersion: TAG_VERSION,
    taggedAt: now,
  }
}
