/**
 * The theme first, then the content (the owner, 28 September: "on arrive pas
 * à trouver la bonne formule pour avoir une diversité de trucs"). Six replayed
 * sessions showed the feed amplifying what bored him — gaming 16 % of what was
 * shown for 6 % of the catalogue, music 20 % for 13 % — and hiding the rest —
 * humour 2 % for 5.5 %. Nothing in the draw ever said "after music, something
 * else": the diversity rule only keeps near-duplicates apart.
 *
 * So every visual of a session first turns a card of a deck of universes,
 * shuffled by the session's seed, never the same universe twice in a row,
 * the deck after deck; then the usual draw — fresh of the day, the cool bag,
 * the common pool — looks for its content in that universe, and falls back
 * to what it did before when the universe has nothing for it. Proportions,
 * not exclusions: every universe keeps its turn.
 *
 * Inside a universe, what is lively and short comes first (`livelyRank`): a
 * clip of a few minutes before a four-hour live, a moving picture before a
 * still album cover; and a session sees two trailers at most.
 */

import { arrangement } from './bag'
import type { Universe } from '../types'

/**
 * The deck: how many cards of each universe. Humour, sport, discoveries,
 * animals, people's everyday lives and science carry the feed; music keeps
 * two cards, gaming one, as their share of what a visitor wants to see and
 * no longer their share of what the charts push.
 */
export const DEFAULT_THEME_DECK: Partial<Record<Universe, number>> = {
  'humor-memes': 3, sport: 2, travel: 2, 'nature-animals': 2, 'people-everyday': 2, science: 2, music: 2,
  food: 1, art: 1, craft: 1, vehicles: 1, animation: 1, history: 1, 'events-parties': 1, fashion: 1, tech: 1,
  gaming: 1, 'cinema-tv': 1, 'news-society': 1, other: 1,
}

export function themeDeck(weights: Partial<Record<Universe, number>> = DEFAULT_THEME_DECK): Universe[] {
  return Object.entries(weights).flatMap(([universe, count]) => Array<Universe>(Math.max(0, Math.floor(count ?? 0))).fill(universe as Universe))
}

/**
 * The universe of the session's `index`-th visual. Deck after deck, each
 * shuffled by the seed and never starting with the universe the previous one
 * ended on: two visuals in a row never share a universe.
 */
export function themeAt(seed: number, index: number, deck: readonly Universe[] = themeDeck()): Universe {
  const at = Math.max(0, Math.floor(index))
  const ordinal = Math.floor(at / deck.length)
  let previous: Universe | null = null
  let order: Universe[] = []
  for (let round = 0; round <= ordinal; round += 1) {
    order = arrangement(seed, 'theme', round, deck, previous)
    previous = order[order.length - 1] ?? null
  }
  return order[at % deck.length]
}

/** Is the theme deck on for this request: the switch on Vercel, or the admin's rehearsal. */
export function themeDeckSwitchedOn(): boolean {
  return process.env.RANDOM_THEME_DECK === '1'
}

const TRAILER = /\b(trailer|teaser|bande[- ]annonce|tráiler|avance oficial)\b/i
/**
 * Marks of a video made by AI, as its title, channel or description says:
 * "des trucs IA", the owner's constant complaint. Only what is written; an
 * unmarked AI video needs its channel (scripts/v3/ai-channels.ts).
 */
const AI_MARKS = /(?:^|[^\p{L}\p{N}])(?:#ai(?:art|video|videos|generated|animation|music|story|shorts)?|ai[- ]?generated|generated (?:with|by) ai|made (?:with|by) ai|midjourney|stable diffusion|sora|kling|hailuo|runway ?ml|pika labs|leonardo ai|suno|udio|dall-?e|généré par (?:l'?)?ia|créé avec (?:l'?)?ia|hecho con ia|feito com ia|gerado por ia)(?=$|[^\p{L}\p{N}])/iu
/**
 * "AI video", "Ai Animation", "A.I. Studio" — but never a lowercase "ai": in
 * Italian it means "to the" ("REACTION ai VIDEO POPOLARI" put an Italian
 * youtuber among the AI factories on 28 September).
 */
const AI_WORD_THEN_NOUN = /(?:^|[^\p{L}\p{N}])(AI|Ai|A\.I\.)[\s_-]*(?:video|videos|art|story|stories|music|song|animation|cover|film|films|movie|documentary|studio|studios|generated|shorts)(?=$|[^\p{L}\p{N}])/iu
/** News told by its title, whatever universe it was filed under: at most the news card's share. */
const NEWS_TITLE = /\b(?:breaking(?: news)?|live updates?|update:|mlb update|nba update|nfl update|cosa sappiamo|ce que l'on sait|lo que sabemos|o que se sabe|en direct|latest news|news live|headlines|वनइंडिया|ब्रेकिंग)\b/iu
/** Lessons, tutorials, exam preparation, court cases explained: dead in a feed. */
const LESSON = /\b(?:tutorial|tuto|step[- ]by[- ]step|beginner'?s? guide|full course|crash course|lecture|lesson \d|class \d|syllabus|exam|examen|recruitment|vacancy|previous year|mcq|interview (?:document|preparation)|prep(?:aration)? for|how to (?:insert|install|use|add|fix|set ?up|download|update|create) .* (?:in|on) (?:adobe|excel|word|photoshop|indesign|illustrator|windows|android|iphone|wordpress|canva|powerpoint|google)|v\. .+ \(\d{4}\)|explained \(\d{4}\)|passive income|make money online|side hustles?)\b/i
/** A GIF an institution or a brand posts for itself: a team, a university, a label, a campaign. */
const BRAND_GIF = /\bGIF by .*\b(?:university|college|athletics|football|basketball|baseball|hockey|soccer|fc|cougars|terrapins|hoosiers|records|music|brands?|coffee|machine|fabrication|arquitectura|architects?|agency|bank|insurance|hotel|restaurant|official|tv|network|news|radio|democrats|republicans|gop|senate|campaign|for president|city of|county|ministry|government|inc|llc|ltd|company|corp|group|foundation|museum|library)\b/i

export function isNewsTitle(title: unknown): boolean {
  return NEWS_TITLE.test(String(title ?? ''))
}

export function isAiMarked(text: unknown): boolean {
  const value = String(text ?? '')
  if (AI_MARKS.test(value)) return true
  const word = AI_WORD_THEN_NOUN.exec(value)?.[1]
  return Boolean(word && word !== 'ai' && word.toLowerCase() !== 'a.i.' ? true : word === 'A.I.')
}
const STREAM = /\b(live ?stream|en direct|directo|ao vivo|stream(?:ing)?|🔴)/i
/** How many trailers a session may see: "1 ou 2 trailers c'est marrant, plus c'est comme regarder de la pub". */
export const TRAILERS_PER_SESSION = 2

export function isTrailerTitle(title: unknown): boolean {
  return TRAILER.test(String(title ?? ''))
}

function seconds(duration: unknown): number | null {
  if (typeof duration === 'number' && Number.isFinite(duration)) return duration
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(duration ?? ''))
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : null
}

/**
 * How lively a row is, 0 best: a video between fifteen seconds and eight
 * minutes, moving, not a live stream. 1: a bit long, or its length unknown,
 * or a GIF a brand posts. 2: a still album cover ("- Topic" channels), a
 * stream, past twenty minutes, a trailer, news filed elsewhere, a lesson,
 * an institution's GIF — served only when the universe offers nothing else.
 * `Infinity`: marked as made by AI, or a trailer past the session's two.
 */
export function livelyRank(row: Record<string, unknown>, trailersSeen = 0): number {
  const title = String(row.title ?? '')
  if (isAiMarked(`${title} ${row.channelTitle ?? ''} ${String(row.description ?? '').slice(0, 1500)}`)) return Infinity
  if (isTrailerTitle(title)) return trailersSeen >= TRAILERS_PER_SESSION ? Infinity : 2
  if (row.type === 'image') return BRAND_GIF.test(title) ? 2 : / GIF by /i.test(title) ? 1 : 0
  if (LESSON.test(title) || (row.v3 as { universe?: string } | undefined)?.universe !== 'news-society' && NEWS_TITLE.test(title)) return 2
  if (row.type !== 'video') return 0
  const length = seconds(row.duration)
  if (/ - Topic$/.test(String(row.channelTitle ?? ''))) return 2
  if (row.liveBroadcastContent === 'live' || row.liveBroadcastContent === 'upcoming') return 2
  if (length !== null && length > 20 * 60) return 2
  if (STREAM.test(String(row.title ?? '')) && (length === null || length > 10 * 60)) return 2
  if (length === null || length > 8 * 60 || length < 15) return 1
  return 0
}

/** The rows, the liveliest first, the order within a rank kept (it is already random); the trailers past the session's two left out. */
export function byLiveliness<T extends Record<string, unknown>>(rows: readonly T[], trailersSeen = 0): T[] {
  return rows
    .map((row, order) => ({ row, order, rank: livelyRank(row, trailersSeen) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .map((entry) => entry.row)
}

/** The trailers a session has seen, read from what it keeps of its visuals (their title practices). */
export function trailersSeenIn(exposures: ReadonlyArray<{ practices?: readonly string[] }> | undefined): number {
  return (exposures ?? []).filter((exposure) => exposure.practices?.includes('film-trailer')).length
}
