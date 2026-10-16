/**
 * A good mix, not exclusions (the owner, 12 October: "limiter n'est pas exclure… pas d'extrême, mais avoir un bon
 * mélange c'est ça le truc"). Two kinds of video he asked "pas trop" of keep a share of what a line lets in: the Shorts
 * (under a minute, some very good) and the little videos of Brazil and South and Southeast Asia — and since 16 October
 * those of Turkey and the Arab world, which took the room the others left (the dig's personalities of the world, 9 % Turkish
 * and 5 % Arabic; the owner: "c'est sympa mais c'est toujours la même règle, de la variété"). On 13 October, on every
 * server line ("vas-y pour tout"), through the admission (lib/v3/ingest/direct.ts).
 *
 * Where a video is from is read, in order, from the language its platform declared (YouTube's default audio language,
 * Dailymotion's language: kept on the row since 13 October), from the title's script (Thai, Devanagari… cannot be
 * anything else), and only then from the title's words — and those only when the title is clearly not English: on
 * 13 October the detector read "Blade Runner 2099 – NYCC Trailer" as Portuguese and "Surviving My First Pokemon
 * Nuzlocke" as Cebuano, and counted one video in ten of the stock as from these places where half were.
 */

import { francAll } from 'franc-min'

import { titleLanguage } from '../../discovery/language'

export const SHORT_SECONDS = 60
/** Of what a line lets in, at most this share of Shorts… */
export const SHORT_SHARE = 0.15
/** …and this share for each of the places below. */
export const HEAVY_GROUP_SHARE = 0.06

/** The places kept to a share, by language: two letters as the platforms declare it, three as the detector reads it. */
const PLACE_OF_LANGUAGE: Readonly<Record<string, string>> = {
  pt: 'BR', por: 'BR',
  hi: 'IN', hin: 'IN', bn: 'IN', ben: 'IN', mr: 'IN', mar: 'IN', ta: 'IN', tam: 'IN', te: 'IN', tel: 'IN', ml: 'IN', mal: 'IN',
  kn: 'IN', kan: 'IN', gu: 'IN', guj: 'IN', pa: 'IN', pan: 'IN', ur: 'IN', urd: 'IN', ne: 'IN', npi: 'IN', nep: 'IN', bh: 'IN', bho: 'IN',
  as: 'IN', asm: 'IN', or: 'IN', ory: 'IN',
  id: 'ID', ind: 'ID', ms: 'ID', msa: 'ID', zlm: 'ID', jv: 'ID', jav: 'ID', su: 'ID', sun: 'ID',
  tl: 'PH', tgl: 'PH', fil: 'PH', ceb: 'PH', ilo: 'PH',
  th: 'TH', tha: 'TH',
  vi: 'VN', vie: 'VN',
  tr: 'TR', tur: 'TR',
  ar: 'AR', arb: 'AR', ara: 'AR',
}
/**
 * Arabic letters with no declared language: the Arab world — the detector reads Arabic titles as Persian (16 October:
 * "واخيرا بعد 5 سنوات…" read as Persian), so only Urdu, India's share, is told apart. Declared, Persian and Urdu say so.
 */
const ARABIC_SCRIPT = /\p{Script=Arabic}/u
const SCRIPT_PLACE: ReadonlyArray<[RegExp, string]> = [
  [/\p{Script=Devanagari}|\p{Script=Bengali}|\p{Script=Tamil}|\p{Script=Telugu}|\p{Script=Malayalam}|\p{Script=Kannada}|\p{Script=Gujarati}|\p{Script=Gurmukhi}/u, 'IN'],
  [/\p{Script=Thai}/u, 'TH'],
]
/** A title read as one of these languages counts only when it resembles English less than this (the detector's own scale). */
const ENGLISH_DOUBT = 0.6

/** The place a video is from, among those kept to a share; null for every other, and when the title alone cannot tell. */
export function placeOf(video: { title?: string | null; lang?: string | null }): string | null {
  const title = video.title ?? ''
  for (const [script, place] of SCRIPT_PLACE) if (script.test(title)) return place
  // As the platform gave it ("pt-BR", "en-US") or as stored ("pt"): its language is what counts.
  const declared = typeof video.lang === 'string' ? video.lang.trim().toLowerCase().split(/[-_]/)[0] : ''
  if (declared) return PLACE_OF_LANGUAGE[declared] ?? null
  if (ARABIC_SCRIPT.test(title)) return titleLanguage(title) === 'urd' ? 'IN' : 'AR'
  const read = titleLanguage(title)
  const place = read ? PLACE_OF_LANGUAGE[read] ?? null : null
  if (!place) return null
  // Read on the title as written: its numbers and signs make an English title read more English ("Blade Runner 2099 -
  // NYCC Trailer | Prime Video" 0.74, against 0.50 once stripped).
  const english = francAll(title, { minLength: 10 }).find(([code]) => code === 'eng')?.[1] ?? 0
  return english < ENGLISH_DOUBT ? place : null
}

/** The place a title alone points to (no declared language). */
export const heavyGroupOf = (title: string): string | null => placeOf({ title })

export const isShort = (seconds: number | undefined): boolean => typeof seconds === 'number' && seconds > 0 && seconds < SHORT_SECONDS

/**
 * A running mix over what a line lets in: a Short, or a video of one of the places, passes while its kind stays under its
 * share of everything let in so far (with a little room at the start, so the first ones are not refused for being first).
 */
export class Mix {
  private total = 0
  private shorts = 0
  private groups = new Map<string, number>()
  constructor(private readonly shortShare = SHORT_SHARE, private readonly groupShare = HEAVY_GROUP_SHARE, private readonly room = 2) {}
  accepts(video: { title?: string | null; seconds?: number; lang?: string | null }): boolean {
    const short = isShort(video.seconds)
    const group = placeOf(video)
    if (short && this.shorts + 1 > this.shortShare * (this.total + 1) + this.room) return false
    if (group && (this.groups.get(group) ?? 0) + 1 > this.groupShare * (this.total + 1) + this.room) return false
    this.total += 1
    if (short) this.shorts += 1
    if (group) this.groups.set(group, (this.groups.get(group) ?? 0) + 1)
    return true
  }
}
