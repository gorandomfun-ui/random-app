/**
 * Wikidata turns a Wikipedia article title into what the v3 model needs:
 * the canonical name, spellings in other languages, and enough type
 * information to pick a universe.
 *
 * Free, no key. Up to 50 titles per call.
 */

import type { Universe } from '../types'

const USER_AGENT = 'gorandom.fun subject builder (contact: github.com/gorandomfun-ui)'
const LANGUAGES = 'en|fr|de|es|ja|pt|it'

/** P31 "instance of" — what the thing *is*. */
const INSTANCE_UNIVERSE: Record<string, Universe> = {
  Q11424: 'cinema-tv', // film
  Q5398426: 'cinema-tv', // television series
  Q1261214: 'cinema-tv', // television special
  Q15416: 'cinema-tv', // television programme
  Q202866: 'animation', // animated film
  Q581714: 'animation', // animated series
  Q1107: 'animation', // anime
  Q8274: 'animation', // manga
  Q7889: 'gaming', // video game
  Q7058673: 'gaming', // video game series
  Q215380: 'music', // musical group
  Q5741069: 'music', // rock band
  Q482994: 'music', // album
  Q134556: 'music', // single
  Q7366: 'music', // song
  Q2088357: 'music', // musical ensemble
  Q847017: 'sport', // sports club
  Q476028: 'sport', // association football club
  Q2736: 'sport', // association football
  Q349: 'sport', // sport
  Q13406554: 'sport', // sports competition
  Q2380335: 'art', // artistic work
  Q3305213: 'art', // painting
  Q860861: 'art', // sculpture
  Q571: 'art', // book
  Q1004: 'art', // comics
  Q11032: 'news-society', // newspaper
  Q4830453: 'news-society', // business
  Q43229: 'news-society', // organization
  Q3464665: 'cinema-tv', // television series season
  Q21191270: 'cinema-tv', // television series episode
  Q117467246: 'cinema-tv', // animated television series
  Q506240: 'cinema-tv', // television film
  Q24856: 'cinema-tv', // film series
  Q1667921: 'art', // novel series
  Q8261: 'art', // novel
  Q49084: 'art', // short story
  Q5292: 'history', // religious text
  Q179461: 'history', // religious text (holy book)
  Q13417114: 'history', // historical event
  Q198: 'history', // war
  Q178561: 'history', // battle
  Q1190554: 'news-society', // occurrence
  Q1656682: 'news-society', // event
  Q3001412: 'news-society', // legal case
  Q2334719: 'news-society', // legal case (court)
  Q515: 'travel', // city
  Q6256: 'travel', // country
  Q23413: 'travel', // castle
  Q839954: 'history', // archaeological site
  Q16521: 'nature-animals', // taxon
  Q55983715: 'nature-animals', // organisms known by a particular common name
  Q2095: 'food', // food
  Q746549: 'food', // dish
  Q44: 'food', // beer
}

/** P106 "occupation" — used when the entity is a human (P31 = Q5). */
const OCCUPATION_UNIVERSE: Record<string, Universe> = {
  Q177220: 'music', // singer
  Q753110: 'music', // songwriter
  Q639669: 'music', // musician
  Q36834: 'music', // composer
  Q130857: 'music', // disc jockey
  Q33999: 'cinema-tv', // actor
  Q10800557: 'cinema-tv', // film actor
  Q2405480: 'cinema-tv', // voice actor
  Q2526255: 'cinema-tv', // film director
  Q3282637: 'cinema-tv', // film producer
  Q28389: 'cinema-tv', // screenwriter
  Q947873: 'cinema-tv', // television presenter
  Q2066131: 'sport', // athlete
  Q937857: 'sport', // association football player
  Q3665646: 'sport', // basketball player
  Q10833314: 'sport', // tennis player
  Q10871364: 'sport', // rally driver
  Q11513337: 'sport', // athletics competitor
  Q245068: 'humor-memes', // comedian
  Q822146: 'humor-memes', // humorist
  Q482980: 'art', // author
  Q36180: 'art', // writer
  Q1028181: 'art', // painter
  Q1281618: 'art', // sculptor
  Q33231: 'art', // photographer
  Q3391743: 'art', // visual artist
  Q901: 'science', // scientist
  Q169470: 'science', // physicist
  Q593644: 'science', // chemist
  Q170790: 'science', // mathematician
  Q82955: 'news-society', // politician
  Q1930187: 'news-society', // journalist
  Q5482740: 'tech', // programmer
  Q81096: 'tech', // engineer
  Q3455803: 'cinema-tv', // director
  Q483501: 'art', // artist
  Q2259451: 'cinema-tv', // stage actor
  Q4610556: 'fashion', // model
  Q3501317: 'fashion', // fashion designer
  Q1114448: 'food', // chef
  Q3499072: 'food', // cook
}


export type WikidataSubject = {
  /** The Wikipedia title we asked about. */
  sourceTitle: string
  qid: string
  label: string
  aliases: string[]
  universe: Universe
  isHuman: boolean
}

type Snak = { mainsnak?: { datavalue?: { value?: { id?: string } } } }

type Entity = {
  labels?: Record<string, { value?: string }>
  aliases?: Record<string, Array<{ value?: string }>>
  claims?: Record<string, Snak[]>
  sitelinks?: Record<string, { title?: string }>
}

function claimIds(entity: Entity, property: string): string[] {
  return (entity.claims?.[property] ?? [])
    .map((snak) => snak.mainsnak?.datavalue?.value?.id)
    .filter((id): id is string => Boolean(id))
}

function pickUniverse(entity: Entity): { universe: Universe; isHuman: boolean } {
  const instances = claimIds(entity, 'P31')
  const isHuman = instances.includes('Q5')

  if (isHuman) {
    // Wikidata lists occupations roughly by prominence, so the first one that
    // maps is the best guess. Reordering by a fixed preference was tried and
    // was far worse: putting music first filed Pelé, Fernandel and Henry VIII
    // under music, because each has some musical credit somewhere.
    for (const occupation of claimIds(entity, 'P106')) {
      const universe = OCCUPATION_UNIVERSE[occupation]
      if (universe) return { universe, isHuman }
    }
    return { universe: 'people-everyday', isHuman }
  }

  for (const instance of instances) {
    const universe = INSTANCE_UNIVERSE[instance]
    if (universe) return { universe, isHuman }
  }
  return { universe: 'other', isHuman }
}

/**
 * Labels are the authoritative name of the thing in each language, so every
 * one is kept — that is where "ジョニー・アリディ" comes from.
 *
 * The alias list is looser and sometimes wrong: Wikidata had
 * "ヘレナ アーカンソー州" (a town in Arkansas) filed under Hunter Biden. An alias
 * is therefore only kept when it shares a word with one of the labels, which
 * covers real variants ("Joseph Robinette Biden Jr") and rejects unrelated
 * entries.
 */
function collectAliases(entity: Entity, canonical: string): string[] {
  const labels = Object.values(entity.labels ?? {})
    .map((label) => label.value)
    .filter((value): value is string => Boolean(value))

  const labelWords = new Set<string>()
  for (const label of [...labels, canonical]) {
    for (const word of label.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (word.length >= 3) labelWords.add(word)
    }
  }

  /**
   * Sharing one word is not enough: "South America" shares "south" with
   * "South Park" and would drag every South America video into South Park.
   * A same-script alias must therefore have *all* of its significant words
   * present in a label — which keeps "Beatles" for "The Beatles" and rejects
   * both "South America" and the initialism "SP".
   */
  const relatedToLabel = (alias: string): boolean => {
    // A disambiguated page title, never a name someone would write in a video
    // title: "ヘレナ (アーカンソー州)" was filed under Hunter Biden.
    if (/[(（\[]/u.test(alias)) return false

    // Written in another script entirely: a transliteration, which shares no
    // words with the Latin label by definition. Length alone guards against
    // initialisms.
    if (!/\p{Script=Latin}/u.test(alias)) return alias.trim().length >= 3
    const words = alias.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3)
    if (!words.length) return false
    return words.every((word) => labelWords.has(word))
  }

  const collected = new Set<string>(labels)
  for (const list of Object.values(entity.aliases ?? {})) {
    for (const alias of list) {
      if (alias.value && relatedToLabel(alias.value)) collected.add(alias.value)
    }
  }

  collected.delete(canonical)
  return Array.from(collected)
    .filter((alias) => alias.length >= 2 && alias.length <= 80)
    .slice(0, 12)
}

/** One batch of at most 50 Wikipedia titles from a single edition. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchWikidataSubjects(
  language: string,
  titles: string[],
  signal?: AbortSignal,
  attempt = 0,
): Promise<WikidataSubject[]> {
  if (!titles.length) return []
  const params = new URLSearchParams({
    action: 'wbgetentities',
    sites: `${language}wiki`,
    titles: titles.slice(0, 50).join('|'),
    props: 'labels|aliases|claims|sitelinks',
    languages: LANGUAGES,
    format: 'json',
    origin: '*',
  })

  const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  })
  // Wikidata rate-limits like Wikimedia does; back off and retry rather than
  // losing a whole batch of fifty entities.
  if (response.status === 429 || response.status === 503) {
    const headerSeconds = Number(response.headers.get('retry-after'))
    const backoffMs = Number.isFinite(headerSeconds) && headerSeconds > 0
      ? headerSeconds * 1000
      : Math.min(60_000, 3_000 * 2 ** attempt)
    if (attempt >= 4) throw new Error(`Wikidata ${language}: HTTP ${response.status} après ${attempt + 1} essais`)
    await wait(backoffMs)
    return fetchWikidataSubjects(language, titles, signal, attempt + 1)
  }
  if (!response.ok) throw new Error(`Wikidata ${language}: HTTP ${response.status}`)
  const payload = (await response.json()) as { entities?: Record<string, Entity> }
  const entities = payload.entities ?? {}

  const results: WikidataSubject[] = []
  for (const [qid, entity] of Object.entries(entities)) {
    if (!qid.startsWith('Q')) continue
    const label = entity.labels?.en?.value ?? entity.labels?.fr?.value
    if (!label) continue
    const sourceTitle = entity.sitelinks?.[`${language}wiki`]?.title ?? label
    const { universe, isHuman } = pickUniverse(entity)
    results.push({
      sourceTitle,
      qid,
      label,
      aliases: collectAliases(entity, label),
      universe,
      isHuman,
    })
  }
  return results
}
