/**
 * The door of a dig: what a pass found, reduced to what one subject may keep.
 *
 * The common door (ads, serials, AI, duplicates) is behind `ctx.admit`. This
 * one is per subject, decided on 28 September with the owner:
 *   - the video names the subject: in its title for the top pass and for
 *     Dailymotion, whose search is loose; in title, description or hashtags
 *     around (YouTube linked the #willsmith steak to "will smith homemade");
 *   - at most two per channel, five for the subject's own channel;
 *   - one moment at most three times (the slap), the most watched copies;
 *   - twins keep the most watched (two Will Smiths in clay);
 *   - at most two interviews, no celebrity news, no live, nothing over two hours.
 */

import { normalize, containsAlias } from '../tagging/normalize'
import type { DigPass } from '../types'

export type DoorSubject = { id: string; label: string; aliases: string[]; ownChannels?: string[]; kind?: 'entity' | 'topic' | 'channel' }

export type DoorVideo = {
  videoId: string
  title: string
  description?: string
  apiTags?: string[]
  channelId?: string
  viewCount?: number
  seconds?: number
  live?: boolean
}

export type DoorVerdict<T> = { kept: T[]; refused: Record<string, number> }

export const MAX_PER_CHANNEL = 2
export const MAX_PER_OWN_CHANNEL = 5
export const MAX_PER_MOMENT = 3
export const MAX_INTERVIEWS = 2
export const MAX_SECONDS = 2 * 3600

const INTERVIEW = /\b(interview|entrevista|entretien|intervista|podcast|talk show|q ?& ?a|press conference|conférence de presse|conferencia de prensa|in conversation)\b/i
/** The owner keeps the weird moments, not the news desk: death, court, divorce, "what happened to". */
const CELEBRITY_NEWS = /\b(dies|died|death|dead|mort|décès|décédé|muere|murió|morreu|funeral|obsèques|arrested|arrêté|court|tribunal|procès|trial|lawsuit|divorce|divorcio|cause of death|autopsy|hospitalized|hospitalisé|breaking news|dernière minute|que devient|what happened to|où en est)\b/i
const STOP = new Set(['official', 'video', 'videos', 'full', 'live', 'music', 'clip', 'new', 'best', 'funny', 'moment', 'moments', 'shorts', 'short', 'with', 'from', 'this', 'that', 'what', 'when', 'your', 'the', 'and', 'for', 'video', 'avec', 'dans', 'pour', 'plus', 'part', 'episode', 'feat', 'version', 'audio', 'lyrics', 'trailer', 'movie', 'film', 'song', 'remix', 'cover', 'reaction', 'ever', 'most', 'like', 'you', 'all', 'about', 'over', 'into', 'out', 'top', 'compilation', 'highlights', 'react', 'reacts', 'edit', 'vlog', 'show', 'hd', 'hq', 'sub', 'subtitles', 'legendado', 'español', 'english'])

/** A street named after the subject is not the subject: "Siticash : 26 Bd Robert Schuman" came in for Robert Schuman (29 September). */
const STREET = /\b(?:bd|boulevard|blvd|rue|avenue|av|ave|place|pl|allée|allee|impasse|quai|square|chemin|route|rd|road|street|st|lane|drive|dr|cours|promenade|esplanade|passage|villa|cité|cite|résidence|residence|lycée|lycee|collège|college|école|ecole|stade|gymnase|salle|espace|centre|center|hôpital|hopital|gare|station|parc|jardin)\.?\s+(?:du |de la |de l'|des |de |d')?$/iu

/** Whether every mention of the subject in the title sits right after a street or place word. */
export function isAddressOf(title: string, subject: Pick<DoorSubject, 'label' | 'aliases'>): boolean {
  const text = normalize(title)
  let mentions = 0
  let addressed = 0
  for (const alias of [subject.label, ...subject.aliases]) {
    const needle = normalize(alias)
    if (!needle || needle.length < 3) continue
    let from = 0
    while (true) {
      const at = text.indexOf(needle, from)
      if (at < 0) break
      mentions += 1
      if (STREET.test(text.slice(Math.max(0, at - 24), at))) addressed += 1
      from = at + needle.length
    }
  }
  return mentions > 0 && addressed === mentions
}

export function isInterview(title: string): boolean {
  return INTERVIEW.test(title)
}

export function isCelebrityNews(title: string): boolean {
  return CELEBRITY_NEWS.test(title)
}

/** An alias, its plural and its singular: "japanese ad" answers to "Weird Japanese Ads Compilation". */
export function aliasForms(alias: string): string[] {
  const base = normalize(alias)
  if (!base || !/[a-z]$/.test(base)) return [base]
  const forms = new Set([base, `${base}s`, `${base}es`])
  if (base.endsWith('s')) forms.add(base.slice(0, -1))
  if (base.endsWith('y')) forms.add(`${base.slice(0, -1)}ies`)
  return [...forms]
}

/** Whether the text names the subject: any alias, whole words in Latin script, plural or not; a hashtag glues the words ("#willsmith"). */
export function namesSubject(text: string, subject: Pick<DoorSubject, 'label' | 'aliases'>): boolean {
  return [subject.label, ...subject.aliases].some((alias) => {
    if (alias.length < 3) return false
    if (aliasForms(alias).some((form) => containsAlias(text, form))) return true
    const glued = normalize(alias).replace(/ /g, '')
    return glued.length >= 6 && glued !== normalize(alias) && containsAlias(text, glued)
  })
}

/** Where the subject must appear for a pass: the title, or the whole text around — and everywhere for a theme, whose words are ordinary. */
export function namesSubjectFor(video: DoorVideo, subject: DoorSubject, pass: DigPass): boolean {
  if (pass === 'around' || pass === 'channel' || subject.kind === 'topic') {
    const hashtags = (video.apiTags ?? []).join(' ')
    return namesSubject(`${video.title} ${video.description ?? ''} ${hashtags}`, subject)
  }
  return namesSubject(video.title, subject)
}

/**
 * The words that tell one moment from another: not the subject's name, not
 * the words every title has. "slap", "oscars", "clay", "bloopers".
 */
export function tellingWords(title: string, subject: Pick<DoorSubject, 'label' | 'aliases'>): Set<string> {
  const subjectWords = new Set([subject.label, ...subject.aliases].flatMap((alias) => normalize(alias).split(' ')))
  return new Set(normalize(title).split(' ').filter((word) => word.length >= 4 && !STOP.has(word) && !subjectWords.has(word) && !/^\d+$/.test(word)))
}

/**
 * One moment, a few copies. Titles are read most watched first; a title whose
 * telling word has already been kept three times is another copy of that
 * moment ("slap" the fourth time). The subject's own words and the words
 * every title has ("official", "video") never count.
 */
export function capMoments<T extends { title: string; viewCount?: number }>(videos: T[], subject: Pick<DoorSubject, 'label' | 'aliases'>, max = MAX_PER_MOMENT): { kept: T[]; refused: number } {
  const sorted = [...videos].sort((left, right) => (right.viewCount ?? 0) - (left.viewCount ?? 0))
  const seen = new Map<string, number>()
  const kept: T[] = []
  let refused = 0
  for (const video of sorted) {
    const words = [...tellingWords(video.title, subject)]
    const full = words.find((word) => (seen.get(word) ?? 0) >= max)
    if (full) { refused += 1; continue }
    for (const word of words) seen.set(word, (seen.get(word) ?? 0) + 1)
    kept.push(video)
  }
  return { kept, refused }
}

/** Two titles are twins when they share most of their telling words: "fully handmade from polymer clay" and "handmade from polymer clay shorts". */
export const TWIN_SHARE = 0.6

function twins(left: Set<string>, right: Set<string>): boolean {
  if (!left.size || !right.size) return false
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / Math.max(left.size, right.size) >= TWIN_SHARE
}

/** Twins, the same title reworded: the most watched stays. */
export function keepMostWatchedTwin<T extends { title: string; viewCount?: number }>(videos: T[], subject: Pick<DoorSubject, 'label' | 'aliases'>): { kept: T[]; refused: number } {
  const sorted = [...videos].sort((left, right) => (right.viewCount ?? 0) - (left.viewCount ?? 0))
  const keptWords: Set<string>[] = []
  const kept: T[] = []
  let refused = 0
  for (const video of sorted) {
    const words = tellingWords(video.title, subject)
    if (keptWords.some((other) => twins(words, other))) { refused += 1; continue }
    keptWords.push(words)
    kept.push(video)
  }
  return { kept, refused }
}

/** The whole door of one pass, in order: names the subject (unless the pass reads a channel that is the subject), form, channel, interviews, twins, moments. */
export function subjectDoor<T extends DoorVideo>(videos: T[], subject: DoorSubject, pass: DigPass, requireName = true): DoorVerdict<T> {
  const refused: Record<string, number> = {}
  const refuse = (why: string) => { refused[why] = (refused[why] ?? 0) + 1 }
  const own = new Set(subject.ownChannels ?? [])
  const perChannel = new Map<string, number>()
  let interviews = 0
  const first: T[] = []
  for (const video of [...videos].sort((left, right) => (right.viewCount ?? 0) - (left.viewCount ?? 0))) {
    if (!video.title) { refuse('sans titre'); continue }
    if (requireName && !namesSubjectFor(video, subject, pass)) { refuse('ne parle pas du sujet'); continue }
    if (video.live) { refuse('direct'); continue }
    if (isAddressOf(video.title, subject)) { refuse('adresse'); continue }
    if ((video.seconds ?? 0) > MAX_SECONDS) { refuse('plus de deux heures'); continue }
    if (isCelebrityNews(video.title)) { refuse('actu people'); continue }
    if (isInterview(video.title)) {
      if (interviews >= MAX_INTERVIEWS) { refuse('interview en trop'); continue }
      interviews += 1
    }
    const channel = video.channelId ?? ''
    if (channel) {
      const count = perChannel.get(channel) ?? 0
      if (count >= (own.has(channel) ? MAX_PER_OWN_CHANNEL : MAX_PER_CHANNEL)) { refuse('chaîne déjà servie'); continue }
      perChannel.set(channel, count + 1)
    }
    first.push(video)
  }
  const twins = keepMostWatchedTwin(first, subject)
  if (twins.refused) refused['jumelle'] = twins.refused
  const moments = capMoments(twins.kept, subject)
  if (moments.refused) refused['même moment'] = moments.refused
  return { kept: moments.kept, refused }
}
