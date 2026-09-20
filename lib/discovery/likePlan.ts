/**
 * What to search for around one liked content, turn after turn.
 *
 * Narrowest first, exactly as the Wave links: the subject by name, then the
 * title's first two telling words together, then the first word alone, then
 * the words that recur around the content in the catalogue. No fixed list of
 * treatments — a rotation of collection, drawing, cover and village festival
 * made sense for a band and wasted every turn on a LaserDisc player or a town.
 *
 * Every like gets the same small budget, however much a turn brings back: a
 * like that returned a thousand similar videos would otherwise be handed more
 * searches, and the catalogue would fill with a thousand more of the same.
 */

import type { SearchSpec } from './exploration'
import { SUBJECT_VERSION, type Subject } from './subjects'
import { normalize } from '../v3/tagging/normalize'

/** Turns a like may run in its lifetime. */
export const MAX_TURNS = 6
/** Words taken from the catalogue around the content, one turn each. */
export const EXPANSION_WORDS = 2
/** Likes served in one scheduling pass; the rest wait for the next. */
export const LIKES_PER_PASS = 3

export type LikeScope = { ownerId: string; referenceKey: string; referenceRevision?: string }

export type LikeSeed = {
  /** The subject the discovery analysis recognised — what the exact turn searches. */
  subject: Subject
  /** The content's telling words, in title order. */
  words: string[]
  /** The title as stored, to tell a model code from a word. */
  title?: string | null
  /** Words that recur around it in the catalogue; asked for only past the base steps. */
  expansion?: string[]
  scope: LikeScope
}

export type LikeStep = {
  /** What this turn searched, for the report: name:…, pair:…, word:…, around:… */
  label: string
  youtube: SearchSpec[]
  dailymotion: SearchSpec[]
  /** Giphy queries: images are direct, they need no ladder. */
  images: string[]
}

/** Task ids and pagination stay stable within a month. */
function window(now: number): { after: string; before: string } {
  const date = new Date(now)
  const before = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  return { after: new Date(Date.UTC(2005, 0, 1)).toISOString(), before: new Date(before).toISOString() }
}

/**
 * A subject the worker can check a result against. For a word step the
 * "subject" is the words themselves: a video must carry one of them in its
 * title to be kept, which is what focusMatchesVideo tests.
 */
function wordSubject(words: string[]): Subject {
  return { key: `words:${words.join('-')}`, label: words.join(' '), aliases: words, kind: 'topic', evidence: 'title' }
}

function focusFor(seed: LikeSeed, subject: Subject, angle: string) {
  return { subject, subjectVersion: SUBJECT_VERSION, ...seed.scope, branch: 'primary' as const, angle }
}

type Order = 'date' | 'relevance' | 'viewCount'

function youtube(seed: LikeSeed, subject: Subject, angle: string, query: string, order: Order, now: number): SearchSpec {
  return { kind: 'search', query, language: 'en', order, ...window(now), focus: focusFor(seed, subject, angle) }
}

function dailymotion(seed: LikeSeed, subject: Subject, angle: string, query: string, sort: 'relevance' | 'recent', now: number): SearchSpec {
  return { kind: 'dailymotion', query, sort, ...window(now), focus: focusFor(seed, subject, angle) }
}

/**
 * Words worth a search of their own.
 *
 * "Pioneer DVL-V888 LaserDisc" yields pioneer, dvl, v888, laserdisc, and the
 * model code's fragments would have taken the pair and the single word while
 * "laserdisc" — the word that matters — was never searched. A code is one
 * token with a digit in the title as written; every fragment it splits into
 * is left out, and short real words — car, dvd, tnt — stay.
 */
export function searchableWords(words: string[], title?: string | null): string[] {
  const codeFragments = new Set<string>()
  for (const token of (title ?? '').split(/\s+/)) {
    if (!/\d/.test(token)) continue
    for (const fragment of normalize(token).split(' ')) if (fragment) codeFragments.add(fragment)
  }
  return words.filter((word) => /^\p{L}{2,}$/u.test(word) && !codeFragments.has(word))
}

const MONTHS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  'januar', 'februar', 'marz', 'juni', 'juli', 'oktober', 'dezember',
  'gennaio', 'febbraio', 'aprile', 'maggio', 'giugno', 'luglio', 'settembre', 'ottobre', 'dicembre',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
])

/**
 * A date is not a subject. The analysis behind the likes reads "September 23"
 * out of "TNT Commercials Compilation September 23, 2003" and offers it as the
 * subject; searched by name it brings back whatever happened on that day.
 */
export function looksLikeDate(label: string): boolean {
  const words = normalize(label).split(' ').filter(Boolean)
  return words.length > 0 && words.every((word) => /^\d+$/.test(word) || MONTHS.has(word))
}

/** The steps a seed offers before any expansion word: name, pair, then each word alone. */
export function baseSteps(seed: LikeSeed, now: number): LikeStep[] {
  const steps: LikeStep[] = []
  const alias = seed.subject.aliases[0] ?? seed.subject.label
  const exact = seed.subject.kind === 'entity' ? `"${alias}"` : alias

  // The name, most seen first and most recent second: the proven, then the long tail.
  if (!looksLikeDate(alias)) steps.push({
    label: `name:${alias}`,
    youtube: [
      youtube(seed, seed.subject, 'name', exact, 'viewCount', now),
      youtube(seed, seed.subject, 'name', exact, 'date', now),
    ],
    dailymotion: [dailymotion(seed, seed.subject, 'name', exact, 'relevance', now)],
    images: [alias],
  })

  const [first, second] = searchableWords(seed.words, seed.title)
  if (first && second) {
    const pair = `${first} ${second}`
    const subject = wordSubject([first, second])
    steps.push({
      label: `pair:${pair}`,
      youtube: [youtube(seed, subject, 'pair', pair, 'date', now)],
      dailymotion: [dailymotion(seed, subject, 'pair', pair, 'recent', now)],
      images: [pair],
    })
  }
  for (const word of [first, second]) {
    if (!word) continue
    const subject = wordSubject([word])
    steps.push({
      label: `word:${word}`,
      youtube: [youtube(seed, subject, 'word', word, 'relevance', now)],
      dailymotion: [dailymotion(seed, subject, 'word', word, 'relevance', now)],
      images: [],
    })
  }
  return steps
}

/**
 * The step for a turn, or null when the like has had its budget. Expansion
 * words are asked one per turn, after the base steps.
 */
export function planLikeTurn(seed: LikeSeed, turn: number, now: number): LikeStep | null {
  if (turn < 0 || turn >= MAX_TURNS) return null
  const base = baseSteps(seed, now)
  if (turn < base.length) return base[turn]
  const word = (seed.expansion ?? []).slice(0, EXPANSION_WORDS)[turn - base.length]
  if (!word) return null
  const subject = wordSubject([word])
  return {
    label: `around:${word}`,
    youtube: [youtube(seed, subject, 'around', word, 'relevance', now)],
    dailymotion: [dailymotion(seed, subject, 'around', word, 'relevance', now)],
    images: [],
  }
}
