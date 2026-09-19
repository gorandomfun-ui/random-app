/**
 * Turning one stored item into its v3 labels. Pure: no database, no network,
 * so it can be tested on a handful of examples and trusted on 1.67M.
 */

import type { Evidence, ItemTags, ItemType, Line, SubjectRef, Universe } from '../types'
import { TAG_VERSION, isUniverse } from '../types'
import { detectAngle } from './angle'
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

function pickUniverse(matches: AliasMatch[]): Universe {
  for (const match of matches) {
    if (isUniverse(match.subject.universe) && match.subject.universe !== 'other') {
      return match.subject.universe
    }
  }
  return 'other'
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

export function tagItem(item: TaggableItem, index: SubjectIndex, now = new Date()): ItemTags {
  const usable = isUsableItem(item)
  const haystack = [
    searchableText({
      title: item.title ?? item.quiz?.question ?? item.text,
      description: item.description ?? item.text,
    }),
    providerExtras(item),
  ]
    .filter(Boolean)
    .join(' ')

  const matches = usable
    ? matchSubjects(index, haystack, (match) => hasSecondClue(item, match))
    : []

  const ordered = [...matches].sort((left, right) => right.words - left.words)

  return {
    subjects: toSubjectRefs(ordered, 'alias'),
    universe: pickUniverse(ordered),
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
