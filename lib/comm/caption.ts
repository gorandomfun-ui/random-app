/**
 * The words of a post: the credit and the source every slide carries, the
 * caption with its lines that cannot be removed, the hashtags from the
 * subjects. No AI, no outside call: the title cleaned, a phrase, the facts.
 */

import type { QueueSnapshot, QueueSubject } from './model'
import { destinationSpec, formatSpec } from './destinations'

/** The address made short for an image: host and path, no scheme, no query. */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/$/, '')
    const shown = `${parsed.host.replace(/^www\./, '')}${path}`
    return shown.length > 48 ? `${shown.slice(0, 45)}…` : shown
  } catch { return url }
}

/** Who to credit on the slide: the author, typed by hand when the base has none; the provider for a stock picture without one. */
export function creditLineOf(snapshot: QueueSnapshot, typed = ''): string {
  const author = typed.trim() || snapshot.author.trim()
  if (author) return author
  return snapshot.authorRequired ? '' : snapshot.providerLabel
}

/** Where it comes from, on the slide: "YouTube · youtu.be/abc". */
export function sourceLineOf(snapshot: QueueSnapshot): string {
  const link = shortUrl(snapshot.sourceUrl || snapshot.url)
  return link ? `${snapshot.providerLabel} · ${link}` : snapshot.providerLabel
}

/** True when the publication must wait for an author typed by hand. */
export function authorMissing(snapshot: QueueSnapshot, typed = ''): boolean {
  return snapshot.authorRequired && !snapshot.author.trim() && !typed.trim()
}

/** A title without its hashtags, its shouting and its clutter; 120 characters at most. */
export function cleanTitle(title: string): string {
  // Hashtags go; so does a short "| Channel" tail, the way YouTube titles carry their author.
  let out = title.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/\s*[|•]\s*[^|•]{1,30}$/u, '').replace(/[|•·]+\s*$/u, '').replace(/\s+/g, ' ').trim()
  if (out.length > 6 && out === out.toUpperCase() && /[A-Z]/.test(out)) out = out.charAt(0) + out.slice(1).toLowerCase()
  if (out.length > 120) out = `${out.slice(0, 117).trimEnd()}…`
  return out
}

/** "Retro Busker" → "#RetroBusker"; accents dropped, three characters at least. */
export function normalizeHashtag(label: string): string | null {
  const words = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const tag = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  return tag.length >= 3 && tag.length <= 40 && !/^\d+$/.test(tag) ? `#${tag}` : null
}

/** The hashtags a post may pick: the subjects' labels, then the brand's own, without doubles. */
export function suggestHashtags(subjects: QueueSubject[], brand: string[] = ['#Random', '#GoRandom']): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of [...subjects.map((s) => s.label), ...brand]) {
    const tag = label.startsWith('#') ? label : normalizeHashtag(label)
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase()); out.push(tag)
  }
  return out
}

export type CaptionInput = {
  destination: string
  format: string
  title: string
  phrase: string
  snapshot: QueueSnapshot
  /** The author typed by hand when the base has none. */
  credit?: string
  /** The post's readable number, the one the links page shows. */
  number: number | null
  hashtags: string[]
  /** The optional line pointing at Random's home. */
  homeUrl?: string | null
}

export type Caption = {
  text: string
  /** The lines that cannot be removed, in order. */
  mandatory: string[]
  length: number
  limit: number
  overLimit: boolean
  hashtagLimit: number
  tooManyHashtags: boolean
}

/**
 * Title and phrase, then the lines that stay: the credit, the source's link
 * in clear, "lien dans la bio" with the number where links are not clickable;
 * then the home, if asked; then the hashtags. Never a link to a Random page.
 */
export function buildCaption(input: CaptionInput): Caption {
  const spec = destinationSpec(input.destination)
  const format = formatSpec(input.destination, input.format)
  const credit = creditLineOf(input.snapshot, input.credit)
  const mandatory: string[] = []
  mandatory.push(credit && credit !== input.snapshot.providerLabel ? `${credit} · ${input.snapshot.providerLabel}` : input.snapshot.providerLabel)
  mandatory.push(input.snapshot.sourceUrl || input.snapshot.url)
  if (spec?.linkInBio) mandatory.push(input.number ? `Lien dans la bio · n° ${input.number}` : 'Lien dans la bio')
  const head = [cleanTitle(input.title), input.phrase.trim()].filter(Boolean).join('\n')
  const parts = [head, mandatory.join('\n')]
  if (input.homeUrl) parts.push(`Découvert sur Random · ${shortUrl(input.homeUrl)}`)
  if (input.hashtags.length) parts.push(input.hashtags.join(' '))
  const text = parts.filter(Boolean).join('\n\n')
  const limit = format?.caption ?? 2200
  const hashtagLimit = format?.hashtags ?? 30
  const length = input.destination === 'x' ? xLength(text) : [...text].length
  return { text, mandatory, length, limit, overLimit: length > limit, hashtagLimit, tooManyHashtags: input.hashtags.length > hashtagLimit }
}

/** X counts every link as 23 characters, whatever its length. */
export function xLength(text: string): number {
  return [...text.replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length
}

/** The reminder shown on a video extract: information, not a block. */
export const MUSIC_NOTE = 'Un extrait avec une musique connue est fréquemment coupé ou retiré automatiquement par Instagram et TikTok.'

export type Phrase = { _id?: string; family: 'decouverte' | 'invitation' | 'reaction' | 'serie' | 'vide'; lang: 'fr' | 'en'; text: string; seed?: boolean }

export const PHRASE_FAMILIES: Record<Phrase['family'], string> = { decouverte: 'Découverte', invitation: 'Invitation', reaction: 'Réaction', serie: 'Série', vide: 'Aucun texte' }

/** The ready-made lines, French and English, by family; the seed writes them once. */
export function seedPhrases(): Phrase[] {
  const p = (family: Phrase['family'], lang: Phrase['lang'], text: string): Phrase => ({ family, lang, text, seed: true })
  return [
    p('decouverte', 'fr', 'Trouvé sur Random'), p('decouverte', 'fr', 'Ça vient de sortir du hasard'), p('decouverte', 'fr', 'Le hasard fait bien les choses'), p('decouverte', 'fr', 'Tombé dessus par hasard'), p('decouverte', 'fr', 'Une découverte du jour'),
    p('decouverte', 'en', 'Found on Random'), p('decouverte', 'en', 'Straight out of the random'), p('decouverte', 'en', 'Today’s find'), p('decouverte', 'en', 'Stumbled upon this'),
    p('invitation', 'fr', 'Tu tombes sur quoi, toi ?'), p('invitation', 'fr', 'À ton tour de tirer'), p('invitation', 'fr', 'Un random, et on voit'),
    p('invitation', 'en', 'What do you land on?'), p('invitation', 'en', 'Your turn to roll'), p('invitation', 'en', 'One random, and we’ll see'),
    p('reaction', 'fr', 'Je ne m’attendais pas à ça'), p('reaction', 'fr', 'Celui-là, je le garde'), p('reaction', 'fr', 'Pourquoi c’est si bien ?'), p('reaction', 'fr', 'Regarde jusqu’au bout'),
    p('reaction', 'en', 'Did not see that coming'), p('reaction', 'en', 'This one stays with me'), p('reaction', 'en', 'Watch till the end'),
    p('serie', 'fr', '5 trucs de la semaine'), p('serie', 'fr', 'Les trouvailles du dimanche'), p('serie', 'fr', 'Un par jour'),
    p('serie', 'en', '5 things this week'), p('serie', 'en', 'Sunday finds'), p('serie', 'en', 'One a day'),
    p('vide', 'fr', ''), p('vide', 'en', ''),
  ]
}
