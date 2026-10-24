/**
 * Which archive pages hold which months.
 *
 *   fr  "Wikipédia:Le saviez-vous ?/Archives": the year under way, every anecdote dated by its days on the main page;
 *       the years before under ".../Archives/2025" and so on.
 *   en  "Wikipedia:Did you know archive": the month under way (and the month before, until it is archived);
 *       the months before under ".../2026/September" and so on (formerly "Wikipedia:Recent additions/…").
 *   de  "Wikipedia:Hauptseite/Schon gewusst/Archiv/2026/10": one page a month, the current one written day by day.
 *   es  dormant since 2008 (read once, on 20 October); ja has no such section.
 */

import type { AnecdoteLang } from './parse'

export const FR_ARCHIVE = 'Wikipédia:Le saviez-vous ?/Archives'
export const EN_ARCHIVE = 'Wikipedia:Did you know archive'
export const DE_ARCHIVE = 'Wikipedia:Hauptseite/Schon gewusst/Archiv'

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A page to read; `months` ("YYYY-MM") keeps only the hooks of those months, for a page that holds more. */
export type PageToRead = { lang: AnecdoteLang; title: string; months?: string[] }

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

/** The month under way and the one before it, by Wikipedia's clock (UTC). */
export function weekMonths(now: Date): { previous: { year: number; month: number }; current: { year: number; month: number } } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  return { previous: month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }, current: { year, month } }
}

/**
 * What the week reads, the month before first: the current and the previous month in French, English and German.
 * Six pages at most, about a megabyte.
 */
export function weeklyPages(now: Date): PageToRead[] {
  const { previous, current } = weekMonths(now)
  const months = [monthKey(previous.year, previous.month), monthKey(current.year, current.month)]
  return [
    // In January, December may already have left the page of the year under way for its own.
    ...(current.month === 1 ? [{ lang: 'fr' as const, title: `${FR_ARCHIVE}/${previous.year}`, months }] : []),
    { lang: 'fr', title: FR_ARCHIVE, months },
    // Until it is archived (a few days into the month), the past month is still on the page of the month under way.
    { lang: 'en', title: `${EN_ARCHIVE}/${previous.year}/${EN_MONTHS[previous.month - 1]}` },
    { lang: 'en', title: EN_ARCHIVE },
    { lang: 'de', title: `${DE_ARCHIVE}/${previous.year}/${String(previous.month).padStart(2, '0')}` },
    { lang: 'de', title: `${DE_ARCHIVE}/${current.year}/${String(current.month).padStart(2, '0')}` },
  ]
}

const EN_MONTH_PAGE = new RegExp(`^${EN_ARCHIVE}/(\\d{4})/(${EN_MONTHS.join('|')})$`)

/**
 * The English months the import of 20 October did not read, oldest first, from the archive's list of pages: it read
 * all of 2025 and March of every year (2026's too), to measure the whole archive (about 122,000 anecdotes).
 */
export function englishCatchUpPages(titles: readonly string[]): string[] {
  return titles
    .map((title) => ({ title, match: EN_MONTH_PAGE.exec(title) }))
    .filter((page): page is { title: string; match: RegExpExecArray } => page.match !== null)
    .filter(({ match }) => match[1] !== '2025' && match[2] !== 'March')
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]) || EN_MONTHS.indexOf(left.match[2]) - EN_MONTHS.indexOf(right.match[2]))
    .map(({ title }) => title)
}
