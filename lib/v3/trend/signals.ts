/**
 * What the world is talking about, read from public, free, official feeds:
 * the day's Google Trends by country, the most-read Wikipedia pages by
 * edition, Giphy's trending GIFs, YouTube's most popular videos by region.
 * Each gives signals — a title, a rank, a day — and nothing more; making
 * subjects out of them is `candidates.ts`.
 */

import { parseGiphyTitle } from '../giphy'
import { fetchTopArticles, type TopArticle, type WikiLanguage } from '../subjects/wikipedia'

export type SignalSource = 'google-trends' | 'wikipedia' | 'giphy' | 'youtube'

export type Signal = {
  source: SignalSource
  /** ISO country, or WW when the feed has no country. */
  country: string
  /** The language a name is written in there. */
  lang: string
  rank: number
  title: string
  /** The page title as the edition writes it, for a Wikidata lookup. */
  page?: string
  day: string
  /** Strong enough to make a subject alone: Trends top 5, Wikipedia top 10. */
  strong: boolean
  /** Headlines Google Trends attaches, which say what the trend is about. */
  news?: string[]
  traffic?: number
}

export const TREND_COUNTRIES = ['FR', 'DE', 'ES', 'US', 'JP'] as const
export const LANGUAGE_OF: Record<string, WikiLanguage> = { FR: 'fr', DE: 'de', ES: 'es', US: 'en', JP: 'ja' }
/** Wikipedia ranks read per edition, after the housekeeping pages are removed. */
export const WIKIPEDIA_TOP = 100
const TRENDS_STRONG_RANK = 5
const WIKIPEDIA_STRONG_RANK = 10
const USER_AGENT = 'gorandom.fun trend-subjects (contact: github.com/gorandomfun-ui)'

export const dayOf = (date: Date): string => date.toISOString().slice(0, 10)

const decode = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .trim()

/** The day's trends of one country, from the RSS feed: title, rank, headlines. */
export function parseTrendsRss(xml: string, country: string, day: string): Signal[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
  return items.flatMap((item, index): Signal[] => {
    const title = decode(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1] ?? '')
    if (!title) return []
    const news = [...item.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)].map((match) => decode(match[1])).filter(Boolean).slice(0, 5)
    const traffic = Number((/<ht:approx_traffic>([\d,.]+)\+?<\/ht:approx_traffic>/.exec(item)?.[1] ?? '0').replace(/[,.]/g, ''))
    return [{ source: 'google-trends', country, lang: LANGUAGE_OF[country] ?? 'en', rank: index + 1, title, day, strong: index < TRENDS_STRONG_RANK, news, ...(traffic ? { traffic } : {}) }]
  })
}

export async function fetchTrendsSignals(country: string, day: string, request: typeof fetch = fetch, signal?: AbortSignal): Promise<Signal[]> {
  const response = await request(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(country)}`, { headers: { 'User-Agent': USER_AGENT }, signal })
  if (!response.ok) throw new Error(`Google Trends ${country}: HTTP ${response.status}`)
  return parseTrendsRss(await response.text(), country, day)
}

/** The most-read pages of one edition, housekeeping removed, the top hundred. */
export function wikipediaSignals(articles: TopArticle[], country: string, day: string): Signal[] {
  return articles.slice(0, WIKIPEDIA_TOP).map((article, index): Signal => ({
    source: 'wikipedia', country, lang: article.language, rank: index + 1,
    title: article.title.replace(/_/g, ' '), page: article.title, day, strong: index < WIKIPEDIA_STRONG_RANK,
  }))
}

/** Yesterday's figures, or the day before's: the top of a day is published with a delay. */
export async function fetchWikipediaSignals(country: string, now: Date, request: typeof fetch = fetch, signal?: AbortSignal): Promise<Signal[]> {
  const language = LANGUAGE_OF[country]
  if (!language) return []
  for (const daysAgo of [1, 2]) {
    const date = new Date(now.getTime() - daysAgo * 86_400_000)
    const articles = await fetchTopArticles(language, date, signal, 0, request)
    if (articles.length) return wikipediaSignals(articles, country, dayOf(date))
  }
  return []
}

/** What a trending GIF is about, read from its title: "Will Ferrell GIF" → Will Ferrell. */
export function giphySignals(titles: Array<string | null | undefined>, day: string): Signal[] {
  return titles.flatMap((title, index): Signal[] => {
    const { subjectText } = parseGiphyTitle(title)
    if (!subjectText) return []
    return [{ source: 'giphy', country: 'WW', lang: 'en', rank: index + 1, title: subjectText, day, strong: false }]
  })
}

export async function fetchGiphyTrending(apiKey: string, day: string, request: typeof fetch = fetch, signal?: AbortSignal): Promise<Signal[]> {
  const params = new URLSearchParams({ api_key: apiKey, limit: '50', rating: 'g' })
  const response = await request(`https://api.giphy.com/v1/gifs/trending?${params}`, { signal })
  if (!response.ok) throw new Error(`Giphy trending: HTTP ${response.status}`)
  const payload = (await response.json()) as { data?: Array<{ title?: string }> }
  return giphySignals((payload.data ?? []).map((item) => item.title), day)
}

/** The most popular videos of a region: their titles carry the names of the week. */
export function youtubeSignals(titles: Array<string | null | undefined>, country: string, day: string): Signal[] {
  return titles.flatMap((title, index): Signal[] => {
    const text = (title ?? '').trim()
    return text ? [{ source: 'youtube', country, lang: LANGUAGE_OF[country] ?? 'en', rank: index + 1, title: text, day, strong: false }] : []
  })
}

/** One unit of quota per call. */
export async function fetchYouTubeMostPopular(apiKey: string, country: string, day: string, request: typeof fetch = fetch, signal?: AbortSignal): Promise<Signal[]> {
  const params = new URLSearchParams({ key: apiKey, part: 'snippet', chart: 'mostPopular', regionCode: country, maxResults: '50' })
  const response = await request(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal })
  if (!response.ok) throw new Error(`YouTube mostPopular ${country}: HTTP ${response.status}`)
  const payload = (await response.json()) as { items?: Array<{ snippet?: { title?: string } }> }
  return youtubeSignals((payload.items ?? []).map((item) => item.snippet?.title), country, day)
}
