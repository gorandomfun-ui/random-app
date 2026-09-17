/**
 * The free Wikimedia pageviews API: which articles people actually read on a
 * given day, in a given language. Data goes back to 2015, so sampling many
 * past dates yields the names that mattered over a decade — exactly the
 * entities the catalogue should know about.
 *
 * No key, no quota to manage; just a polite user agent and a gap between calls.
 */

const USER_AGENT = 'gorandom.fun subject builder (contact: github.com/gorandomfun-ui)'

/** Wikipedia editions worth sampling, widest readerships first. */
export const WIKI_LANGUAGES = ['en', 'fr', 'de', 'es', 'ja', 'pt', 'it', 'ru', 'ko'] as const

export type WikiLanguage = (typeof WIKI_LANGUAGES)[number]

/** Namespaces and housekeeping pages that are not subjects. */
const NOT_A_SUBJECT = [
  /^(?:wikipedia|wikipédia|wikipedia_talk|portal|portail|category|catégorie|kategorie|categoría|file|fichier|datei|help|aide|hilfe|template|modèle|vorlage|special|spécial|spezial|especial|talk|discussion|module|draft)[:：]/i,
  /^(?:main_page|accueil|hauptseite|portada|メインページ|wikipedia|pagina_principale|pagina_principal)/i,
  /^(?:list[ae]?_(?:of|de|des|von)|liste_)/i,
  // "Deaths in 2020", "Décès en 2020" — a running index, not a subject.
  /^(?:deaths?|décès|deces|todesfälle|todesfalle|muertes|morti|mortes)_(?:in|en|im|de)_/i,
  /^\d{4}(?:_|$)/,
  /_(?:season|saison|staffel|temporada)_\d+$/i,
  /_\(disambiguation\)$|_\(homonymie\)$|_\(begriffsklärung\)$|_\(desambiguación\)$/i,
  /^\d{4}$/,
]

export type TopArticle = {
  title: string
  views: number
  language: WikiLanguage
}

export function looksLikeSubject(title: string): boolean {
  if (!title || title.length > 120) return false
  return !NOT_A_SUBJECT.some((pattern) => pattern.test(title))
}

export class RateLimited extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Wikimedia rate limit; retry in ${Math.round(retryAfterMs / 1000)}s`)
    this.name = 'RateLimited'
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One day of one edition.
 *
 * Throws rather than returning an empty list: an earlier version swallowed
 * every error, so a run where six languages out of nine were rate limited
 * still reported success and wrote a third of the dictionary it should have.
 * A caller that wants to continue past a failure has to say so explicitly.
 */
export async function fetchTopArticles(
  language: WikiLanguage,
  date: Date,
  signal?: AbortSignal,
  attempt = 0,
): Promise<TopArticle[]> {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${language}.wikipedia/all-access/${year}/${month}/${day}`

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal })

  if (response.status === 429) {
    const headerSeconds = Number(response.headers.get('retry-after'))
    const backoffMs = Number.isFinite(headerSeconds) && headerSeconds > 0
      ? headerSeconds * 1000
      : Math.min(60_000, 2_000 * 2 ** attempt)
    if (attempt >= 4) throw new RateLimited(backoffMs)
    await wait(backoffMs)
    return fetchTopArticles(language, date, signal, attempt + 1)
  }

  // A day with no data is normal for some editions; that is not a failure.
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`Wikimedia ${language} ${year}-${month}-${day}: HTTP ${response.status}`)

  const payload = (await response.json()) as {
    items?: Array<{ articles?: Array<{ article?: string; views?: number }> }>
  }
  const articles = payload.items?.[0]?.articles ?? []
  return articles
    .map((entry) => ({ title: (entry.article ?? '').trim(), views: entry.views ?? 0, language }))
    .filter((entry) => entry.title && looksLikeSubject(entry.title))
}

/** Random days spread across the years the API covers. */
export function sampleDates(count: number, random = Math.random): Date[] {
  const earliest = Date.UTC(2015, 6, 1)
  // Yesterday: today's figures are not published yet.
  const latest = Date.now() - 2 * 86_400_000
  const dates: Date[] = []
  for (let index = 0; index < count; index += 1) {
    dates.push(new Date(earliest + random() * (latest - earliest)))
  }
  return dates
}
