/**
 * The légende under a content (app/random/RandomExperience.tsx, SourceBlock): its title's measures, and the owner's
 * rules of 21 October for that title. A title on one line keeps no room for a second. A title never leaves a single
 * word, or a lone sign, on its second line: it shrinks a little to hold on one line instead. A long title keeps its
 * two lines.
 */

/** The title: 17px letters on 22px lines, two lines at most. */
export const LEGEND_SIZE = 17
export const LEGEND_LINE = 22
/** The smallest the title shrinks to rather than leave a single word on its second line. */
export const LEGEND_MIN_SIZE = 14
/** The mark │ author row under the title, and the gap above it. */
export const LEGEND_ROW = 22
export const LEGEND_ROW_GAP = 5

/** French spacing: a sign after a word stays with it, so "BLOQUÉE ?" never sends its "?" alone to the second line. */
export function keepSignsAttached(text: string): string {
  return text.replace(/[ \t]+([?!:;»%])/g, ' $1').replace(/«[ \t]+/g, '« ')
}

/** A second line that holds one word, or one sign or character: no ordinary space in it (a no-break space joins). */
export function aloneOnSecondLine(second: string): boolean {
  const rest = second.trim()
  return rest.length > 0 && !/[ \t]/.test(rest)
}

/**
 * The size at which a title `oneLine` pixels long at LEGEND_SIZE holds on a line `width` pixels wide, in quarter
 * pixels and a hair under. Null when that would go below LEGEND_MIN_SIZE: the title then keeps its two lines.
 */
export function sizeForOneLine(width: number, oneLine: number): number | null {
  if (!(width > 0) || !(oneLine > 0)) return null
  if (oneLine <= width) return LEGEND_SIZE
  const size = Math.floor(((LEGEND_SIZE * width) / oneLine) * 4) / 4 - 0.25
  return size >= LEGEND_MIN_SIZE ? size : null
}
