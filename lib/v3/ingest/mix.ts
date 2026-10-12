/**
 * A good mix, not exclusions (the owner, 12 October: "limiter n'est pas exclure… pas d'extrême, mais avoir un bon
 * mélange c'est ça le truc"). Two kinds of video he asked "pas trop" of keep a share of what a line lets in: the Shorts
 * (under a minute, some very good) and the little videos of Brazil and South and Southeast Asia — told by the title's
 * language or script, the only sign a video carries of where it is from.
 */

import { titleLanguage } from '../../discovery/language'

export const SHORT_SECONDS = 60
/** Of what a line lets in, at most this share of Shorts… */
export const SHORT_SHARE = 0.15
/** …and this share for each of the places below. */
export const HEAVY_GROUP_SHARE = 0.06

const LANGUAGE_GROUP: Readonly<Record<string, string>> = {
  por: 'BR', hin: 'IN', npi: 'IN', mar: 'IN', ben: 'IN', urd: 'IN', tam: 'IN', tel: 'IN', mal: 'IN', kan: 'IN', guj: 'IN', pan: 'IN', bho: 'IN',
  ind: 'ID', jav: 'ID', sun: 'ID', msa: 'ID', zlm: 'ID', tgl: 'PH', ceb: 'PH', ilo: 'PH', tha: 'TH', vie: 'VN',
}
const SCRIPT_GROUP: ReadonlyArray<[RegExp, string]> = [
  [/\p{Script=Devanagari}|\p{Script=Bengali}|\p{Script=Tamil}|\p{Script=Telugu}|\p{Script=Malayalam}|\p{Script=Kannada}|\p{Script=Gujarati}|\p{Script=Gurmukhi}/u, 'IN'],
  [/\p{Script=Thai}/u, 'TH'],
]

/** The place a title's language or script points to, among those kept to a share; null for every other. */
export function heavyGroupOf(title: string): string | null {
  for (const [script, group] of SCRIPT_GROUP) if (script.test(title)) return group
  return LANGUAGE_GROUP[titleLanguage(title) ?? ''] ?? null
}

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
  accepts(video: { title: string; seconds?: number }): boolean {
    const short = isShort(video.seconds)
    const group = heavyGroupOf(video.title)
    if (short && this.shorts + 1 > this.shortShare * (this.total + 1) + this.room) return false
    if (group && (this.groups.get(group) ?? 0) + 1 > this.groupShare * (this.total + 1) + this.room) return false
    this.total += 1
    if (short) this.shorts += 1
    if (group) this.groups.set(group, (this.groups.get(group) ?? 0) + 1)
    return true
  }
}
