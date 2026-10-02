/**
 * The subjects of the keywords base, read from Wikipedia's lists.
 *
 * The hand-written theme list (`themes.json`, 538 entries) was the whole of
 * what the dig could search by keyword, and the owner found it narrow ("la
 * liste des sujets est trop bornée… on monte à presque 10 000", 30
 * September). Here the dig reads the lists Wikipedia keeps — dance styles,
 * street foods, circus skills, hobbies, optical illusions, fads — one page
 * per universe or two, and queues every short entry as a topic of that
 * universe. What is written here is where to look, never what to find.
 *
 * Such a subject is a probe: Dailymotion, which has no quota, searches it
 * first; only a subject that bites there (`PROBE_HITS` videos admitted) goes
 * on to YouTube, one search. A dud costs nothing and is done. So thousands
 * of subjects can be tried without burning the day's quota on names that
 * have no videos.
 */

import { subjectId } from '../tagging/normalize'
import type { Universe } from '../types'
import type { NewSubject } from './queue'

export type ListSource = { lang: string; page: string; universe: Universe; fr: string }

/** Wikipedia's lists, by the universe their entries belong to. */
export const LISTS: ListSource[] = [
  { lang: 'en', page: 'List of music genres and styles', universe: 'music', fr: 'genres musicaux' },
  { lang: 'en', page: 'List of musical instruments', universe: 'music', fr: 'instruments' },
  { lang: 'en', page: 'List of dance styles', universe: 'art', fr: 'danses' },
  { lang: 'en', page: 'List of art techniques', universe: 'art', fr: "techniques d'art" },
  { lang: 'en', page: 'List of circus skills', universe: 'art', fr: 'cirque' },
  { lang: 'en', page: 'Street performance', universe: 'art', fr: 'spectacle de rue' },
  { lang: 'en', page: 'List of sports', universe: 'sport', fr: 'sports' },
  { lang: 'en', page: 'List of martial arts', universe: 'sport', fr: 'arts martiaux' },
  { lang: 'en', page: 'List of video game genres', universe: 'gaming', fr: 'genres de jeux vidéo' },
  { lang: 'en', page: 'List of best-selling video games', universe: 'gaming', fr: 'jeux vidéo les plus vendus' },
  { lang: 'en', page: 'List of handheld game consoles', universe: 'gaming', fr: 'consoles portables' },
  { lang: 'en', page: 'Outline of crafts', universe: 'craft', fr: 'artisanat' },
  { lang: 'en', page: 'Hobby', universe: 'people-everyday', fr: 'loisirs' },
  { lang: 'en', page: 'List of toys', universe: 'people-everyday', fr: 'jouets' },
  { lang: 'en', page: 'List of games', universe: 'people-everyday', fr: 'jeux' },
  { lang: 'en', page: "List of traditional children's games", universe: 'people-everyday', fr: 'jeux d\'enfants' },
  { lang: 'en', page: 'List of optical illusions', universe: 'science', fr: 'illusions d\'optique' },
  { lang: 'en', page: 'List of natural phenomena', universe: 'science', fr: 'phénomènes naturels' },
  { lang: 'en', page: 'Car body style', universe: 'vehicles', fr: 'carrosseries' },
  { lang: 'en', page: 'List of boat types', universe: 'vehicles', fr: 'bateaux' },
  { lang: 'en', page: 'List of bicycle types', universe: 'vehicles', fr: 'vélos' },
  { lang: 'en', page: 'Mode of transport', universe: 'vehicles', fr: 'moyens de transport' },
  { lang: 'en', page: 'List of dog breeds', universe: 'nature-animals', fr: 'races de chiens' },
  { lang: 'en', page: 'List of cat breeds', universe: 'nature-animals', fr: 'races de chats' },
  { lang: 'en', page: 'List of domesticated animals', universe: 'nature-animals', fr: 'animaux domestiques' },
  { lang: 'en', page: 'List of Internet phenomena', universe: 'humor-memes', fr: 'phénomènes internet' },
  { lang: 'en', page: 'List of practical joke topics', universe: 'humor-memes', fr: 'farces' },
  { lang: 'en', page: 'Wikipedia:Unusual articles', universe: 'humor-memes', fr: 'insolite' },
  { lang: 'en', page: 'List of fads', universe: 'humor-memes', fr: 'modes passagères' },
  { lang: 'en', page: 'List of amusement rides', universe: 'travel', fr: 'manèges' },
  { lang: 'en', page: 'List of subcultures', universe: 'people-everyday', fr: 'subcultures' },
  { lang: 'en', page: 'List of street foods', universe: 'food', fr: 'cuisine de rue' },
  { lang: 'en', page: 'List of desserts', universe: 'food', fr: 'desserts' },
  { lang: 'en', page: 'List of snack foods', universe: 'food', fr: 'snacks' },
  { lang: 'en', page: 'List of cooking techniques', universe: 'food', fr: 'techniques de cuisine' },
  { lang: 'en', page: 'List of hairstyles', universe: 'fashion', fr: 'coiffures' },
  { lang: 'en', page: 'List of hats and headgear', universe: 'fashion', fr: 'chapeaux' },
  { lang: 'en', page: 'List of home appliances', universe: 'tech', fr: 'appareils ménagers' },
  { lang: 'en', page: 'Novelty and fad dances', universe: 'history', fr: 'danses éphémères' },
  { lang: 'en', page: 'List of party games', universe: 'events-parties', fr: 'jeux de soirée' },
  { lang: 'en', page: 'List of genres', universe: 'cinema-tv', fr: 'genres' },
  { lang: 'en', page: 'List of animation techniques', universe: 'animation', fr: "techniques d'animation" },
  { lang: 'en', page: 'List of world records', universe: 'other', fr: 'records' },
]

/** How many Dailymotion videos a probe must bring in before YouTube is asked. */
export const PROBE_HITS = 8
/** Entries kept per list: the longest lists are the noisiest. */
export const PER_LIST = 300
const USER_AGENT = 'gorandom.fun dig (contact: github.com/gorandomfun-ui)'

/** A list entry the dig can search: one to three words, letters, a capital first (a word linked in prose is not an entry), no year, no bracket, no list or category. */
export function keepTitle(title: string): boolean {
  const text = title.trim()
  if (!text || text.length > 32 || !/^[A-ZÀ-Þ]/.test(text)) return false
  if (/\d{4}|\(|List of|Lists of|Category:|Wikipedia:|disambiguation|^Outline of/i.test(text)) return false
  const words = text.split(/\s+/)
  if (words.length < 1 || words.length > 3) return false
  return /^[A-Za-zÀ-ÿ' \-&.]+$/.test(text)
}

/** Past these headings a page cites and links out; the list is over. */
const END_OF_LIST = /^==+\s*(See also|References|Notes|Further reading|External links|Bibliography|Sources)\s*==+/i

/** A picture, a file, a category: a link that is not an entry. */
const NOT_AN_ENTRY = /^(?:File|Image|Category|Fichier|Media|Wikipedia|Template):/i

/**
 * The entries of a list page: the link that opens each bullet line — after
 * a flag template or a bold mark, within its first forty characters — or the
 * first link of a table row that is not a picture, up to the "See also":
 * the list itself, never the navigation boxes around it nor the prose that
 * mentions a country (the hairstyles and the handheld consoles are tables
 * with a picture first; the fads are bullets with a template first).
 */
export function titlesInWikitext(wikitext: string): string[] {
  const titles = new Set<string>()
  for (const raw of wikitext.split('\n')) {
    const line = raw.trim()
    if (END_OF_LIST.test(line)) break
    if (!/^(\*|#|\||!)/.test(line) || line.startsWith('|-') || line.startsWith('|}') || line.startsWith('|+')) continue
    const table = line.startsWith('|') || line.startsWith('!')
    // Templates and bold marks stripped from a bullet's opening, so "* {{flag|JP}} '''[[Name]]'''" reads as "* [[Name]]".
    const opening = table ? line : line.replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '')
    for (const match of opening.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
      const title = match[1].trim()
      if (NOT_AN_ENTRY.test(title)) continue
      // In a bullet, the entry opens the line (once the templates and bold marks are gone); a link further on is prose.
      if (!table && (match.index ?? 0) > 3) break
      if (keepTitle(title)) titles.add(title)
      break
    }
  }
  return [...titles]
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** One list page's entries; Wikipedia's rate limit is waited out, three times at most. */
export async function fetchListTitles(source: ListSource, request: typeof fetch = fetch, attempt = 0): Promise<string[]> {
  const url = `https://${source.lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'parse', page: source.page, prop: 'wikitext', format: 'json', redirects: '1', formatversion: '2' })}`
  const response = await request(url, { headers: { 'User-Agent': USER_AGENT } })
  if (response.status === 429 || response.status === 503) {
    if (attempt >= 3) throw new Error(`Wikipedia HTTP ${response.status} (${source.page})`)
    await wait(10_000 * (attempt + 1))
    return fetchListTitles(source, request, attempt + 1)
  }
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status} (${source.page})`)
  const payload = (await response.json()) as { parse?: { wikitext?: string }; error?: { info?: string } }
  if (payload.error) throw new Error(`Wikipedia : ${payload.error.info ?? 'erreur'} (${source.page})`)
  return titlesInWikitext(payload.parse?.wikitext ?? '').slice(0, PER_LIST)
}

/** A list entry as the queue takes it: a small topic of the list's universe, a probe for Dailymotion first. */
export function listSubject(title: string, source: ListSource): NewSubject {
  return {
    _id: subjectId('topic', title), label: title, aliases: [title], kind: 'topic', base: 'keywords', fame: 'small',
    universe: source.universe, angles: [], priority: 3, probe: true, source: { list: source.page, lang: source.lang, fr: source.fr },
  }
}
