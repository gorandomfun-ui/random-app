/**
 * The registers of the cool pool.
 *
 * The cool pool is RANDOM's shop window: a content that catches the eye in
 * three seconds, whatever its age, with a proof that it does — a real
 * audience where it was published. Four registers say what that looks like
 * on the labels every content carries (universe, angle, era, popularity) and
 * in its title; a fifth keeps the cool GIFs. Nothing here matches a word
 * "anywhere": the description and the tags are where mainstream junk hid a
 * cool word.
 *
 * The rules are written once and evaluated twice: on a stored row when the
 * catalogue is labelled (`computeRegisters`), and as a Mongo filter when a
 * board samples the catalogue (`registerMatch`). The label is what the live
 * draw uses — one index seek, never a scan.
 */

import type { Document, Filter } from 'mongodb'

import { STRONG_BLOCKED_TERMS, STRONG_TERMS } from '@/lib/random/strongPool'
import type { Angle, CoolRegister, Era, ItemType, Popularity, Universe } from '../types'

export type Register = {
  id: Exclude<CoolRegister, 'cool-words'>
  label: string
  /** The universes the register lives in; unset = any. */
  universes?: Universe[]
  /** The angles that fit; videos only, a GIF has no angle worth the name. */
  angles?: Angle[]
  /** At least one of these must appear in the title, as a whole word. */
  titleWords?: string[]
  /** For images only, when the videos are told apart by their angle and a GIF has none. */
  imageTitleWords?: string[]
  /** A title written in another script counts as being from elsewhere. */
  titleScript?: RegExp
  /** "both": every condition given must hold; "any": one of them is enough. */
  combine: 'any' | 'both'
  /** Words that disqualify a title for this register, on top of the global ones. */
  excludeWords?: string[]
  /** Universes that never belong to this register, on top of the global ones. */
  excludeUniverses?: Universe[]
  /** The proof: the least audience a video needs. Images carry no audience. */
  minPopularity: Popularity
  /** Only old contents; videos only, a GIF has no year. */
  era?: Era
}

const POPULARITY_ORDER: Popularity[] = ['unknown', 'niche', 'mid', 'known', 'mainstream']

/** Words that disqualify any title, whatever the register. */
export const GLOBAL_EXCLUDE_WORDS = [
  'trailer', 'teaser', 'bande annonce', 'bande-annonce',
  'lyric', 'lyrics', 'letra', 'letras', 'karaoke', 'official audio', 'full album', 'playlist',
  'full movie', 'full episode', 'full film', 'película completa', 'film complet',
  'ai video', 'ai generated', 'ai-generated', 'sora', 'veo', 'midjourney', 'ai art', 'ai animation', 'ai film', 'ai music',
  'live stream', 'livestream', 'live streaming', 'streaming', 'en directo', 'ao vivo', 'en direct',
  'breaking news', 'news today', 'headlines', 'podcast',
  'tutorial', 'how to use', 'full guide', 'guide complet',
  'unboxing', 'review', 'reseña',
  'health', 'doctor', 'cancer', 'pregnancy', 'symptoms', 'treatment',
  'lofi', 'lo-fi', 'chill mix', 'relaxing', 'ambience', 'study music', 'sleep music',
  '#shorts', '#short', '#viral', '#trending',
]

/** Universes and angles that are never cool. */
export const EXCLUDED_UNIVERSES: Universe[] = ['news-society']
export const EXCLUDED_ANGLES: Angle[] = ['mainstream-report', 'reaction', 'website', 'text-quote', 'text-joke', 'text-fact', 'quiz']
/** Stock photographs are never cool. */
const STOCK_PROVIDERS = ['pexels', 'pixabay']

export const REGISTERS: Register[] = [
  {
    id: 'gaming', label: 'Gaming niche',
    universes: ['gaming'],
    titleWords: ['speedrun', 'speedrunner', 'retro', 'longplay', 'demoscene', 'demo', 'tas', 'mod', 'mods', 'modding', 'indie', 'indie game', 'arcade', 'glitch', 'glitches', 'world record', 'any%', '100%',
      'nes', 'snes', 'sega', 'genesis', 'mega drive', 'atari', 'amiga', 'commodore', 'c64', 'msx', 'ms-dos', 'dos', 'ps1', 'psx', 'ps2', 'dreamcast', 'n64', 'gamecube', 'game boy', 'gameboy', 'psp', 'pico-8',
      'emulator', 'pixel art', 'chiptune', 'quake', 'doom', 'homebrew', 'romhack', 'rom hack', 'fan game', 'jam', 'game jam', 'ludum dare', 'itch.io', 'prototype', 'unreleased', 'beta', 'cancelled', 'lost', 'mame',
      'roguelike', 'metroidvania', 'platformer', 'shmup', 'bullet hell', 'fighting game', 'rhythm game', 'point and click', 'text adventure', 'visual novel', 'devlog', 'postmortem', 'gdc', 'making of',
      'easter egg', 'easter eggs', 'cut content', 'developer commentary', 'tool-assisted', 'no hit', 'no damage', 'blindfolded', 'lan party', 'esport', 'esports', 'tournament', 'evo', 'grand finals'],
    combine: 'both', minPopularity: 'mid',
    excludeWords: ['roblox', 'minecraft', 'fortnite', 'gta 5', 'gta v', 'free fire', 'brawl stars', 'fnaf', 'among us', 'fifa', 'ea fc', 'call of duty', 'warzone', 'valorant', 'skibidi', 'brainrot',
      'stream', 'new class', 'preview', 'update', 'patch', 'explored'],
  },
  {
    id: 'archive', label: 'Archives / nostalgie',
    angles: ['tv-archive', 'home-video', 'documentary', 'local-event', 'fan-footage', 'official-clip', 'episode-extract'],
    titleWords: ['vintage', 'archive', 'archives', 'footage', 'home movie', 'home movies', 'vhs', 'betamax', 'super 8', '8mm', '16mm', '35mm', 'commercial', 'commercials', 'publicité', 'pub',
      'newsreel', 'travelogue', 'retro', 'rétro', 'nostalgia', 'nostalgie', 'classic', 'classique', 'old', 'rare', 'lost', 'found'],
    combine: 'both', minPopularity: 'mid', era: 'retro',
    excludeWords: ['logo', 'logos', 'ident', 'idents', 'opening', 'closing', 'bumper', 'bumpers', 'warning screen', 'fbi warning', 'arcade archives', 'vhs rip', 'home video'],
    excludeUniverses: ['gaming'],
  },
  {
    id: 'music', label: 'Musical',
    universes: ['music'], angles: ['live-concert', 'official-clip', 'amateur-cover', 'tv-archive', 'fan-footage', 'local-event'],
    // A GIF has no angle: it must say something musical itself, or every reaction GIF of a singer counts.
    imageTitleWords: ['music', 'musique', 'musica', 'concert', 'live', 'guitar', 'guitare', 'bass', 'drums', 'drummer', 'batterie', 'piano', 'synth', 'dj', 'vinyl', 'vinyle', 'turntable',
      'band', 'singer', 'singing', 'chanteur', 'chanteuse', 'rapper', 'rap', 'hip hop', 'hiphop', 'jazz', 'rock', 'punk', 'metal', 'techno', 'house music', 'disco', 'funk', 'soul', 'reggae', 'ska', 'blues',
      'orchestra', 'orchestre', 'opera', 'opéra', 'choir', 'symphony', 'album', 'on tour', 'on stage', 'festival', 'gig', 'rehearsal', 'music video', 'clip', 'sax', 'saxophone', 'trumpet', 'violin', 'cello', 'accordion', 'accordéon'],
    combine: 'both', minPopularity: 'mid',
    excludeWords: ['1 hour', 'one hour', '2 hours', '10 hours', 'mix', 'megamix', 'mashup', 'remix', 'instrumental', 'backing track', 'lesson', 'cover art', 'vaquejada'],
  },
  {
    id: 'elsewhere', label: 'Ailleurs',
    universes: ['music', 'cinema-tv', 'animation', 'humor-memes', 'food', 'events-parties', 'fashion', 'sport', 'travel', 'art', 'craft'],
    titleScript: /[぀-ヿ一-鿿가-힯฀-๿ऀ-ॿঀ-৿஀-௿ఀ-౿؀-ۿЀ-ӿ֐-׿]/,
    titleWords: ['japan', 'japanese', 'japon', 'japonais', 'tokyo', 'osaka', 'korea', 'korean', 'corée', 'coréen', 'seoul', 'bollywood', 'tamil', 'telugu', 'thai', 'thaïlande', 'bangkok',
      'vietnam', 'indonesia', 'jakarta', 'philippines', 'manila', 'brazil', 'brasil', 'brésil', 'mexico', 'méxico', 'mexican', 'cumbia', 'tango', 'salsa', 'k-pop', 'kpop', 'j-pop', 'jpop', 'c-pop',
      'turkish', 'türk', 'istanbul', 'arabic', 'egypt', 'cairo', 'nigeria', 'lagos', 'ghana', 'kenya', 'hindi', 'mumbai', 'bhangra', 'africa', 'african', 'afrique',
      'soviet', 'russian', 'moscow', 'polish', 'warsaw', 'iran', 'pakistan', 'bangladesh', 'peru', 'colombia', 'bogotá', 'argentina', 'buenos aires', 'havana'],
    combine: 'both', minPopularity: 'known',
    excludeWords: ['war', 'guerre', 'election', 'minister', 'president', 'jersey', 'evolution', 'highlights', 'persian wine', 'demon hunters'],
  },
]

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
export const wordsRegex = (words: string[]) => new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(escape).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu')
/** Three hashtags or more is not a title. */
const HASHTAG_SPAM = /(#\S+\s*){3,}/
const GLOBAL_EXCLUDE = wordsRegex(GLOBAL_EXCLUDE_WORDS)
/** The forty cool words, less the ones a reaction GIF says about anything — "that's odd", "unexpected". */
const GENERIC_COOL_WORDS = new Set(['odd', 'trending', 'rare', 'unexpected', 'curious', 'unusual'])
const COOL_WORDS = wordsRegex(STRONG_TERMS.filter((term) => !GENERIC_COOL_WORDS.has(term)))
/** Adult and blocked terms rule a title out of every register. */
const BLOCKED_WORDS = new RegExp(STRONG_BLOCKED_TERMS.map(escape).join('|'), 'i')

export function popularityAtLeast(min: Popularity): Popularity[] {
  return POPULARITY_ORDER.slice(POPULARITY_ORDER.indexOf(min))
}

/** The filter for one register and one format, for a board that samples the catalogue. */
export function registerMatch(register: Register, type: 'video' | 'image'): Filter<Document> {
  const labels: Filter<Document>[] = []
  if (register.universes?.length) labels.push({ 'v3.universe': { $in: register.universes } })
  if (type === 'video' && register.angles?.length) labels.push({ 'v3.angle': { $in: register.angles } })
  const title: Filter<Document>[] = []
  const words = type === 'image' && register.imageTitleWords?.length ? register.imageTitleWords : register.titleWords
  if (words?.length) title.push({ title: { $regex: wordsRegex(words).source, $options: 'iu' } })
  if (register.titleScript) title.push({ title: { $regex: register.titleScript.source } })

  const conditions: Filter<Document>[] = [
    { type },
    { 'v3.usable': true, isSuppressed: { $ne: true }, obsoleteVideoStatus: { $ne: 'obsolete' }, editorialRoutine: { $ne: true } },
    { 'v3.universe': { $nin: [...EXCLUDED_UNIVERSES, ...(register.excludeUniverses ?? [])] }, 'v3.angle': { $nin: EXCLUDED_ANGLES } },
    { provider: { $nin: STOCK_PROVIDERS } },
    { title: { $not: wordsRegex([...GLOBAL_EXCLUDE_WORDS, ...(register.excludeWords ?? [])]) } },
    { title: { $not: HASHTAG_SPAM } },
    { title: { $not: BLOCKED_WORDS } },
  ]
  if (type === 'video') conditions.push({ 'v3.popularity': { $in: popularityAtLeast(register.minPopularity) } })
  if (type === 'video' && register.era) conditions.push({ 'v3.era': register.era })

  const titleOr = title.length ? { $or: title } : null
  if (register.combine === 'both') {
    conditions.push(...labels)
    if (titleOr) conditions.push(titleOr)
  } else {
    const any = [...labels, ...title]
    if (any.length) conditions.push({ $or: any })
  }
  return { $and: conditions }
}

/** What the labelling reads on a row: the labels already written, and the title. */
export type LabelableRow = {
  type: ItemType
  title?: string | null
  provider?: string | null
  isSuppressed?: boolean | null
  obsoleteVideoStatus?: string | null
  editorialRoutine?: boolean | null
  v3?: { universe: Universe; angle: Angle; era: Era; popularity: Popularity; usable: boolean } | null
}

const COMPILED = REGISTERS.map((register) => ({
  register,
  words: register.titleWords?.length ? wordsRegex(register.titleWords) : null,
  imageWords: register.imageTitleWords?.length ? wordsRegex(register.imageTitleWords) : null,
  exclude: register.excludeWords?.length ? wordsRegex(register.excludeWords) : null,
}))

const rank = (popularity: Popularity) => POPULARITY_ORDER.indexOf(popularity)

/**
 * The registers a stored content belongs to — the same rules as
 * `registerMatch`, evaluated on the row. Empty for most of the catalogue.
 */
/**
 * What every cool content must be, whatever its register: showable, not
 * stock, not news, a real title. The trend source draws contents that carry
 * no register label and asks this of them.
 */
export function isCoolCandidate(row: LabelableRow): boolean {
  if (row.type !== 'video' && row.type !== 'image') return false
  const v3 = row.v3
  if (!v3?.usable) return false
  if (row.isSuppressed || row.obsoleteVideoStatus === 'obsolete' || row.editorialRoutine) return false
  if (row.provider && STOCK_PROVIDERS.includes(row.provider.toLowerCase())) return false
  const title = (row.title ?? '').trim()
  if (!title || HASHTAG_SPAM.test(title) || GLOBAL_EXCLUDE.test(title) || BLOCKED_WORDS.test(title)) return false
  if (EXCLUDED_UNIVERSES.includes(v3.universe) || EXCLUDED_ANGLES.includes(v3.angle)) return false
  return true
}

export function computeRegisters(row: LabelableRow): CoolRegister[] {
  if (!isCoolCandidate(row)) return []
  const v3 = row.v3!
  const title = (row.title ?? '').trim()

  const video = row.type === 'video'
  const found: CoolRegister[] = []
  for (const { register, words, imageWords, exclude } of COMPILED) {
    if (register.excludeUniverses?.includes(v3.universe)) continue
    if (exclude?.test(title)) continue
    if (video && rank(v3.popularity) < rank(register.minPopularity)) continue
    if (video && register.era && v3.era !== register.era) continue

    const checks: boolean[] = []
    if (register.universes) checks.push(register.universes.includes(v3.universe))
    if (video && register.angles) checks.push(register.angles.includes(v3.angle))
    const titleRegex = !video && imageWords ? imageWords : words
    if (titleRegex || register.titleScript) {
      checks.push(Boolean(titleRegex?.test(title)) || Boolean(register.titleScript?.test(title)))
    }
    if (!checks.length) continue
    if (register.combine === 'both' ? checks.every(Boolean) : checks.some(Boolean)) found.push(register.id)
  }
  // The cool GIFs: the forty words, in the title, and none of the blocked ones.
  if (!video && COOL_WORDS.test(title) && !BLOCKED_WORDS.test(title)) found.push('cool-words')
  return found
}
