/**
 * The people of a country, from Wikidata: who is known there, in what, and
 * how widely (the number of Wikipedias that have an article on them). One
 * SPARQL query per occupation, capped, so a big country never times out.
 * Read from the owner's computer, never from the small server.
 */

import { subjectId } from '../tagging/normalize'
import { fetchWikidataByIds } from '../subjects/wikidata'
import type { Universe } from '../types'
import type { Fame, NewSubject } from './queue'

const SPARQL = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'gorandom.fun dig (contact: github.com/gorandomfun-ui)'

export const COUNTRIES: Record<string, { qid: string; lang: string; label: string }> = {
  FR: { qid: 'Q142', lang: 'fr', label: 'France' },
  US: { qid: 'Q30', lang: 'en', label: 'États-Unis' },
  BE: { qid: 'Q31', lang: 'fr', label: 'Belgique' },
  GH: { qid: 'Q117', lang: 'en', label: 'Ghana' },
  GB: { qid: 'Q145', lang: 'en', label: 'Royaume-Uni' },
  CA: { qid: 'Q16', lang: 'en', label: 'Canada' },
  DE: { qid: 'Q183', lang: 'de', label: 'Allemagne' },
  ES: { qid: 'Q29', lang: 'es', label: 'Espagne' },
  IT: { qid: 'Q38', lang: 'it', label: 'Italie' },
  BR: { qid: 'Q155', lang: 'pt', label: 'Brésil' },
  MX: { qid: 'Q96', lang: 'es', label: 'Mexique' },
  NG: { qid: 'Q1033', lang: 'en', label: 'Nigeria' },
  JP: { qid: 'Q17', lang: 'ja', label: 'Japon' },
  KR: { qid: 'Q884', lang: 'ko', label: 'Corée du Sud' },
  AU: { qid: 'Q408', lang: 'en', label: 'Australie' },
  CH: { qid: 'Q39', lang: 'fr', label: 'Suisse' },
  IN: { qid: 'Q668', lang: 'hi', label: 'Inde' },
  ZA: { qid: 'Q258', lang: 'en', label: 'Afrique du Sud' },
  AR: { qid: 'Q414', lang: 'es', label: 'Argentine' },
  EG: { qid: 'Q79', lang: 'ar', label: 'Égypte' },
  TR: { qid: 'Q43', lang: 'tr', label: 'Turquie' },
  ID: { qid: 'Q252', lang: 'id', label: 'Indonésie' },
  PH: { qid: 'Q928', lang: 'en', label: 'Philippines' },
  SE: { qid: 'Q34', lang: 'sv', label: 'Suède' },
  PL: { qid: 'Q36', lang: 'pl', label: 'Pologne' },
  RU: { qid: 'Q159', lang: 'ru', label: 'Russie' },
  CN: { qid: 'Q148', lang: 'zh', label: 'Chine' },
  KE: { qid: 'Q114', lang: 'en', label: 'Kenya' },
  SN: { qid: 'Q1041', lang: 'fr', label: 'Sénégal' },
  CI: { qid: 'Q1008', lang: 'fr', label: "Côte d'Ivoire" },
  CO: { qid: 'Q739', lang: 'es', label: 'Colombie' },
  NZ: { qid: 'Q664', lang: 'en', label: 'Nouvelle-Zélande' },
  TH: { qid: 'Q869', lang: 'th', label: 'Thaïlande' },
  VN: { qid: 'Q881', lang: 'vi', label: 'Vietnam' },
}

/** Where a country sits, for the turn-taking: one of each part of the world before a second of any. */
export const REGION_OF: Record<string, string> = {
  FR: 'europe', BE: 'europe', GB: 'europe', DE: 'europe', ES: 'europe', IT: 'europe', CH: 'europe', SE: 'europe', PL: 'europe', RU: 'europe',
  US: 'north-america', CA: 'north-america', MX: 'north-america',
  BR: 'south-america', AR: 'south-america', CO: 'south-america',
  GH: 'africa', NG: 'africa', ZA: 'africa', EG: 'africa', KE: 'africa', SN: 'africa', CI: 'africa',
  JP: 'asia', KR: 'asia', IN: 'asia', CN: 'asia', TR: 'asia', ID: 'asia', PH: 'asia', TH: 'asia', VN: 'asia',
  AU: 'oceania', NZ: 'oceania',
}

/** The occupations worth a dig, and the universe each one lands in. */
export const OCCUPATIONS: Array<{ qid: string; label: string; universe: Universe }> = [
  { qid: 'Q33999', label: 'acteur', universe: 'cinema-tv' },
  { qid: 'Q10800557', label: 'acteur de cinéma', universe: 'cinema-tv' },
  { qid: 'Q10798782', label: 'acteur de télévision', universe: 'cinema-tv' },
  { qid: 'Q245068', label: 'humoriste', universe: 'humor-memes' },
  { qid: 'Q177220', label: 'chanteur', universe: 'music' },
  { qid: 'Q2252262', label: 'rappeur', universe: 'music' },
  { qid: 'Q639669', label: 'musicien', universe: 'music' },
  { qid: 'Q130857', label: 'DJ', universe: 'music' },
  { qid: 'Q947873', label: 'animateur télé', universe: 'cinema-tv' },
  { qid: 'Q937857', label: 'footballeur', universe: 'sport' },
  { qid: 'Q3665646', label: 'basketteur', universe: 'sport' },
  { qid: 'Q10833314', label: 'joueur de tennis', universe: 'sport' },
  { qid: 'Q11338576', label: 'boxeur', universe: 'sport' },
  { qid: 'Q2309784', label: 'cycliste', universe: 'sport' },
  { qid: 'Q10843402', label: 'nageur', universe: 'sport' },
  { qid: 'Q11513337', label: 'athlète', universe: 'sport' },
  { qid: 'Q17125263', label: 'youtubeur', universe: 'people-everyday' },
  { qid: 'Q4610556', label: 'mannequin', universe: 'fashion' },
  { qid: 'Q3499072', label: 'cuisinier', universe: 'food' },
  { qid: 'Q15855449', label: 'magicien', universe: 'art' },
  { qid: 'Q5716684', label: 'danseur', universe: 'art' },
  { qid: 'Q2526255', label: 'réalisateur', universe: 'cinema-tv' },
  { qid: 'Q1028181', label: 'peintre', universe: 'art' },
  { qid: 'Q11774202', label: 'essayiste', universe: 'other' },
  { qid: 'Q36180', label: 'écrivain', universe: 'other' },
  { qid: 'Q483501', label: 'artiste', universe: 'art' },
  { qid: 'Q2066131', label: 'sportif', universe: 'sport' },
  { qid: 'Q10871364', label: 'joueur de baseball', universe: 'sport' },
  { qid: 'Q19204627', label: 'joueur de football américain', universe: 'sport' },
  { qid: 'Q4009406', label: 'pilote automobile', universe: 'vehicles' },
  { qid: 'Q1367729', label: 'humoriste de stand-up', universe: 'humor-memes' },
  { qid: 'Q3282637', label: 'producteur de cinéma', universe: 'cinema-tv' },
  { qid: 'Q753110', label: 'auteur-compositeur', universe: 'music' },
  { qid: 'Q855091', label: 'guitariste', universe: 'music' },
  { qid: 'Q488205', label: 'auteur-compositeur-interprète', universe: 'music' },
  { qid: 'Q2405480', label: 'doubleur', universe: 'animation' },
  { qid: 'Q1259917', label: 'cascadeur', universe: 'cinema-tv' },
  { qid: 'Q3400985', label: 'skateur', universe: 'sport' },
  { qid: 'Q13382576', label: 'catcheur', universe: 'sport' },
  { qid: 'Q1414443', label: 'mixed martial artist', universe: 'sport' },
]

export type WikidataPerson = { qid: string; label: string; sitelinks: number; occupation: string; universe: Universe; born?: number; aliases: string[] }

/** The fame of a person, by how many Wikipedias know them. */
export function fameOf(sitelinks: number): Fame {
  if (sitelinks >= 45) return 'star'
  if (sitelinks >= 12) return 'known'
  return 'small'
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** People of one country and one occupation, the most known first; born after 1900. Names only: the aliases come by batches of fifty afterwards. */
export async function fetchPeople(country: string, occupation: { qid: string; label: string; universe: Universe }, limit: number, request: typeof fetch = fetch, attempt = 0): Promise<WikidataPerson[]> {
  const place = COUNTRIES[country]
  if (!place) throw new Error(`pays inconnu : ${country}`)
  // No aliases, no grouping: the query stays under Wikidata's minute for a big country. Aliases are read by id, fifty at a time.
  const query = `
SELECT ?item ?itemLabel ?sitelinks ?born WHERE {
  ?item wdt:P106 wd:${occupation.qid}; wdt:P27 wd:${place.qid}; wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks >= 5)
  OPTIONAL { ?item wdt:P569 ?birth. }
  BIND(YEAR(?birth) AS ?born)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${place.lang},en". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${Math.max(1, Math.min(limit, 1000))}`
  const response = await request(`${SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } })
  if (response.status === 429 || response.status === 503 || response.status === 504) {
    if (attempt >= 3) throw new Error(`Wikidata HTTP ${response.status}`)
    await wait(8_000 * (attempt + 1))
    return fetchPeople(country, occupation, limit, request, attempt + 1)
  }
  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`)
  const payload = (await response.json()) as { results?: { bindings?: Array<Record<string, { value?: string }>> } }
  return (payload.results?.bindings ?? []).flatMap((row): WikidataPerson[] => {
    const qid = (row.item?.value ?? '').split('/').pop() ?? ''
    const label = row.itemLabel?.value ?? ''
    if (!/^Q\d+$/.test(qid) || !label || label === qid) return []
    const born = Number(row.born?.value)
    if (Number.isFinite(born) && born < 1900) return []
    return [{ qid, label, sitelinks: Number(row.sitelinks?.value ?? 0), occupation: occupation.label, universe: occupation.universe, ...(Number.isFinite(born) ? { born } : {}), aliases: [] }]
  })
}

/** The aliases of the people found, fifty ids at a time, from the existing Wikidata reader. */
export async function withAliases(people: WikidataPerson[], request: typeof fetch = fetch): Promise<WikidataPerson[]> {
  const byQid = new Map(people.map((person) => [person.qid, person]))
  const ids = [...byQid.keys()]
  for (let start = 0; start < ids.length; start += 50) {
    try {
      const entities = await fetchWikidataByIds(ids.slice(start, start + 50), undefined, request)
      for (const entity of entities) {
        const person = byQid.get(entity.qid)
        if (person) person.aliases = entity.aliases.filter((alias) => alias !== person.label && alias.length <= 60).slice(0, 8)
      }
    } catch {
      // Aliases are a help, not a need: a batch that fails leaves its people with their name alone.
    }
    await wait(300)
  }
  return [...byQid.values()]
}

/** A person as the queue takes them. */
export function personSubject(person: WikidataPerson, country: string): NewSubject {
  const fame = fameOf(person.sitelinks)
  return {
    _id: subjectId('entity', person.label), label: person.label, aliases: person.aliases, kind: 'entity', base: 'people', fame,
    country, lang: COUNTRIES[country]?.lang, universe: person.universe,
    priority: fame === 'star' ? 30 : fame === 'known' ? 20 : 10,
    source: { qid: person.qid, sitelinks: person.sitelinks, occupation: person.occupation, ...(person.born ? { born: person.born } : {}) },
  }
}
