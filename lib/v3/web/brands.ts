/**
 * Brands of a country, from Wikidata (CC0, free, no key): brands, and firms whose kind or description says they make
 * something people buy — food and drink, sweets, cosmetics, toys, clothes. The owner, 22 October: "des trucs pour des
 * marques (de jambon en Croatie ou je ne sais quoi)". For Croatia that day: Podravka, Cedevita, Maraska, Badel 1862,
 * and Gavrilović, whose site refuses to open inside another page.
 *
 * They go onto the waiting list (source 'wikidata-brand'), where the visit judges each site like any other (alive, a
 * site, opening inside Random, a picture); they count among the fun third (lib/v3/web/kinds.ts).
 */

import type { CandidateInput } from './candidates'

const SPARQL = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'RandomIngest/1.0 (+https://www.gorandom.fun)'
const TIMEOUT_MS = 70_000

/** Kinds that are brands or makers of things people buy by themselves: brand, brewery, winery, distillery, food manufacturer, fashion house, chocolaterie. */
const MAKERS = ['Q431289', 'Q131734', 'Q156362', 'Q1251750', 'Q1252971', 'Q1941779', 'Q762548']
/** Kinds of firms, kept when their description names what they make: business, company, enterprise, corporation, public company. */
const FIRMS = ['Q4830453', 'Q783794', 'Q6881511', 'Q167037', 'Q891723']
const MADE = /\b(?:foods?|drinks?|beverages?|beers?|brew\w*|wines?|spirits|liqueurs?|vodka|whisk(?:e)?y|rum|gin|chocolates?|confection\w*|cand(?:y|ies)|sweets|snacks?|biscuits?|cookies?|bakery|pastr(?:y|ies)|dairy|cheeses?|ice cream|meat|hams?|sausages?|salami|coffee|teas?|juices?|mineral water|olive oil|honey|jams?|pasta|toys?|games?|cosmetics?|perfumes?|fashion|clothing|apparel|shoes|footwear|jewel\w*|watches|bicycles?)\b/i

/** Wikidata knows a country by its ISO code; the world's list of places says `uk` for it. */
export const isoCountry = (code: string): string => (code.toLowerCase() === 'uk' ? 'GB' : code.toUpperCase())

/**
 * The countries a night asks for brands: their own turn around the world, `count` further each day, never the night's
 * Common Crawl countries (24 October: Angola and Mozambique brought none; France has 770, the United States 1,490).
 */
export function brandCountriesOf(countries: readonly string[], count: number, now = new Date()): string[] {
  if (!countries.length || count < 1) return []
  const day = Math.floor(now.getTime() / 86_400_000)
  const start = (((day * count) % countries.length) + countries.length) % countries.length
  return Array.from({ length: Math.min(count, countries.length) }, (_, index) => countries[(start + index) % countries.length])
}

/**
 * The question asked of Wikidata for one country (its item, `Q142` for France): its brands and firms with an official
 * website, with kind and description. The kinds come first and the order is kept as written: starting from the
 * country, Wikidata went through all its items and gave up past its minute for France, the United States and Japan.
 * `makersOnly`: the brands and makers alone, when the firms are still too many.
 */
export function brandQuery(countryItem: string, makersOnly = false): string {
  const kinds = (makersOnly ? MAKERS : [...MAKERS, ...FIRMS]).map((id) => `wd:${id}`).join(' ')
  return `SELECT DISTINCT ?item ?itemLabel ?site ?kind ?desc WHERE {
  hint:Query hint:optimizer "None" .
  VALUES ?kind { ${kinds} }
  ?item wdt:P31 ?kind .
  ?item wdt:P17 wd:${countryItem.replace(/[^Q0-9]/g, '')} .
  ?item wdt:P856 ?site .
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,it,pt". }
} LIMIT 6000`
}

/** A country's Wikidata item, from its ISO code. */
export function countryQuery(country: string): string {
  return `SELECT ?country WHERE { ?country wdt:P297 "${isoCountry(country).replace(/[^A-Z]/g, '')}" . } LIMIT 1`
}

type Binding = Record<string, { value?: string } | undefined>

/** The brands in Wikidata's answer, one site each, onto the waiting list: makers by their kind, firms by what they make. */
export function brandCandidates(answer: unknown, country: string): CandidateInput[] {
  const rows = ((answer as { results?: { bindings?: Binding[] } } | null)?.results?.bindings ?? [])
  const byItem = new Map<string, { label: string; sites: Set<string>; maker: boolean; desc: string }>()
  for (const row of rows) {
    const item = row.item?.value?.split('/').pop() ?? ''
    const site = row.site?.value ?? ''
    if (!/^Q\d+$/.test(item) || !/^https?:\/\//i.test(site)) continue
    const entry = byItem.get(item) ?? { label: '', sites: new Set<string>(), maker: false, desc: '' }
    const label = row.itemLabel?.value ?? ''
    if (label && label !== item) entry.label = label
    entry.sites.add(site)
    if (MAKERS.includes(row.kind?.value?.split('/').pop() ?? '')) entry.maker = true
    if (row.desc?.value) entry.desc = row.desc.value
    byItem.set(item, entry)
  }
  const candidates: CandidateInput[] = []
  for (const [item, entry] of byItem) {
    if (!entry.maker && !MADE.test(`${entry.desc} ${entry.label}`)) continue
    // One site a brand: the secure one when it has both.
    const site = [...entry.sites].sort((left, right) => Number(right.startsWith('https')) - Number(left.startsWith('https')))[0]
    candidates.push({ url: site, source: 'wikidata-brand', ...(entry.label ? { title: entry.label } : {}), sourceName: 'Wikidata', sourceUrl: `https://www.wikidata.org/wiki/${item}`, tags: [`country:${country.toLowerCase()}`, 'marque'] })
  }
  return candidates
}

async function ask(query: string, request: typeof fetch): Promise<unknown> {
  const response = await request(`${SPARQL}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`wikidata HTTP ${response.status}`)
  return response.json()
}

/**
 * A country's brands, asked of Wikidata's public endpoint (a minute at most): its item first, then its brands; the brands
 * and makers alone when its firms are still too many for that minute.
 */
export async function brandSites(country: string, request: typeof fetch = fetch, random: () => number = Math.random): Promise<CandidateInput[]> {
  const found = await ask(countryQuery(country), request) as { results?: { bindings?: Binding[] } }
  const item = found.results?.bindings?.[0]?.country?.value?.split('/').pop() ?? ''
  if (!/^Q\d+$/.test(item)) return []
  let sites: CandidateInput[]
  try {
    sites = brandCandidates(await ask(brandQuery(item), request), country)
  } catch {
    sites = brandCandidates(await ask(brandQuery(item, true), request), country)
  }
  // In a random order: a big country gives more than a night takes, and its next visit takes others.
  for (let index = sites.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[sites[index], sites[other]] = [sites[other], sites[index]]
  }
  return sites
}
