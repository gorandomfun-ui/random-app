/**
 * Mini-series: the vertical soap serials — "Pregnant by the Billionaire",
 * "From Puppet Bride to Alpha Queen", romance and AI action cut from the
 * same mould — that Dailymotion reupload accounts started posting by the
 * thousand in August 2026 as "[Full Movie]" compilations. The owner does not
 * want them: all alike, and nothing like the rest of Random.
 *
 * What must survive is just as precise. The same accounts repost forgotten
 * old films in full ("El Judas 1952", "Eegah (1962)"), TV episodes and
 * reality shows, and those are part of the fun. So the "[Full Movie]" tag
 * alone condemns nothing, an old year in the title shields a film from every
 * guess, and the stock situations are written narrowly enough to leave
 * "Duke Ellington full concert", "Divorce Court" or "An American Werewolf in
 * London" alone.
 *
 * Pure: no database here. The learned studios come in as an argument;
 * `miniSeriesStore.ts` loads them and records the refusals.
 */

export type MiniSeriesReason = 'label' | 'studio' | 'cjk' | 'trope' | 'ai-story' | 'narrative' | 'shape'

/** Words that only ever describe these serials, whatever else the title says. */
const LABEL = new RegExp([
  'short drama', 'full drama', 'drama hub', 'micro[- ]?drama', 'sd drama', '\\(\\d{1,3} ?eps?\\)', 'full \\d{1,3} ?eps?\\b',
  'full movies english sub', '\\bep\\.? ?\\d{1,3} ?- ?\\d{1,3}\\b', '\\bepisodes \\d{1,3} ?- ?\\d{2,3}\\b', 'part \\d/\\d ?[|｜] ?episodes', 'dailymotion (?:movie|episodes?)', 'full dailymotion',
  '#drama\\b', '#shortdrama', '#minidrama', '#fullepisode', '#reelshort', '#dramabox', '\\[recommended\\] ?full ep',
].join('|'), 'i')

/**
 * Studios and reupload labels seen on these serials on 26 September 2026.
 * The store adds the ones it learns; these hold from the first run.
 */
export const SEED_STUDIOS: readonly string[] = [
  'reelshort', 'dramabox', 'shortmax', 'flextv', 'goodshort', 'netshort', 'dramawave', 'moboreels',
  'nitro realms', 'glacier films', 'golden scene media', 'canyon reels', 'cliffrush drama', 'shock.drama', 'faithful.hearts',
]

/**
 * The stock situations of the genre. Each is written as the serials word it,
 * not as the plain word: "cold CEO", not "CEO", which an interview also says.
 */
const TROPE = new RegExp([
  'billionaire', 'milliardaire', 'millonari[oa]', 'billonari[oa]', 'milliard[äa]r', 'heiress', 'h[ée]riti[èe]re', 'heredera',
  '(?:cold|secret|billionaire|domineering|ruthless|hidden) ceo', 'ceo (?:husband|daddy|wife|boss|dad)',
  'the alpha', "alpha(?:'s)? (?:king|husband|daddy|mate|queen|heir|prince|wolf)", '(?:del|el) alfa', 'alfa (?:rey|lobo)',
  "(?:substitute|contract|masked|trophy|puppet|stand-?in|replacement|secret|billionaire'?s|ceo'?s|alpha'?s|duke'?s|mafia) bride",
  'divorced', 'after (?:the|my|our) divorce', 'divorce (?:sealed|papers|me)', 'pregnant (?:by|after|with (?:the|his|my)|for)',
  "duke'?s", 'my lord duke', 'tycoon', 'hidden identity', 'mafia (?:boss|princess|queen|king)', 'mafioso',
  'contract (?:marriage|wife|husband|lover)', 'stepbrother', 'ex-husband', 'ex-wife', 'ruined ex', '(?:my|his|her) (?:wife|husband|fianc[ée]e?|lover)\\b',
  "werewolf (?:prince|princess|king|alpha|mate|husband|ceo|queen)", 'wolf (?:king|god)', 'dragon king', 'reborn (?:as|to|in)',
  'was reborn', 'rebirth of', 'wiedergeboren', 'transmigrat', 'my system', "(?:became|i'?m|now i'?m) the strongest", 'spoiled by',
  'married into', 'cold husband', 'secret (?:fan|baby|wife|son|daughter|boss|twins)', 'first love', 'rejected by', 'cheating',
  'infidel', 'my in-laws', 'mother-in-law', 'suegra', 'vengeance', 'venganza', 'revenge (?:drama|romance|thriller)',
  '(?:her|his|my|sweet) revenge', 'romance', 'romantic', 'rom[áa]ntica', 'romantique', 'mafia don', 'my ex\\b',
  '(?:wrong|fake|substitute|runaway|contract|secret|trophy|stand-?in) (?:wife|husband)', 'emotional (?:drama|romance)',
].join('|'), 'i')

/**
 * The shapes a serial is posted in: whole, by the handful of episodes,
 * subtitled or dubbed. "Full" alone counts, not "full concert", "full match"
 * or a single "full episode", which is how a TV channel posts its shows.
 */
const FORM = new RegExp([
  'drama', 'full movies?', '(?<![a-z])full(?![a-z])(?!\\s+(?:documentary|match|concert|album|video|interview|speech|game|gameplay|playthrough|walkthrough|race|fight|performance|set|lecture|podcast|review|tutorial|course|episode\\b|ep\\b|show|hd(?! (?:movie|film|pel[íi]cula))|songs?|jukebox|mix|playlist|audio|mp3|lyrics))', 'full hd (?:movie|film|pel[íi]cula)',
  'episodes\\b', 'fullepisodes?', 'fullmovies?', '\\bep\\.? ?\\d', '\\bseries\\b', 'mini[- ]?series', '\\bsub\\b', '\\bdub\\b', 'engsub', 'ensub', 'eng ?dub', 'part \\d',
  'no cut', '\\buncut\\b', '\\bcompleto\\b', '\\bcompleta\\b', '\\bcompl[èe]te\\b', 'completed movie', '\\bdoblado\\b', '\\bdoubl[ée](?![a-zà-ÿ])', '\\bdubbed\\b', 'folgen', 'free episodes', 'all episodes',
].join('|'), 'i')

/** An old year or a label of the old catalogue: the forgotten films the owner wants to keep. */
const OLD_FILM = /\b(?:19[1-9]\d|200\d|201[0-8])\b|\bclassic\b|film noir|\bwestern\b|public domain|domaine public|dominio p[úu]blico/i

/** "AI" as a word of its own — "[AI BL]", "AI - …" — not inside another word. */
const AI_WORD = /(?:^|[\s[(|\-【])(?:ai|ia)(?=[\s\])|\-:】]|$)/i
const STORY = /story|stories|romance|romantic|drama|\bbl\b|serie completa|série complète|full series|穿越/i

/** A title told as a plot: "My Cold Husband Is My Secret Fan", "He Danced With His First Love…". */
const NARRATIVE = /^\W*(?:\[[^\]]*\]\s*)?(?:my|i|i'm|she|he|his|her|they|the day (?:i|she|he))\b/i
const NARRATIVE_MIN_WORDS = 6

/** The same genre as it is named in Chinese: time travel, rebirth, the domineering boss, the underdog's comeback. */
const CJK = /穿越|重生|总裁|總裁|豪门|豪門|逆袭|逆襲|战神|戰神|赘婿|贅婿|闪婚|閃婚|霸总|霸總|全集|爽劇|爽剧|短剧|短劇/

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One regex for a list of studio names, matched as whole words, case and spacing aside. */
export function studiosMatcher(names: Iterable<string>): RegExp | null {
  const unique = [...new Set([...names].map(normaliseStudio).filter(Boolean))]
  if (!unique.length) return null
  const alternatives = unique
    .sort((left, right) => right.length - left.length)
    .map((name) => escape(name).replace(/ /g, '[\\s._-]*'))
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alternatives.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu')
}

const SEED_MATCHER = studiosMatcher(SEED_STUDIOS)

const wordCount = (text: string) => text.replace(/\[[^\]]*\]|【[^】]*】/g, ' ').split(/\s+/).filter((word) => /\p{L}/u.test(word)).length

/**
 * Why a title is a mini-series, or null when it is not one.
 * `studios` is the matcher of the learned studio names, when there are any.
 */
export function miniSeriesReason(title: string | null | undefined, studios: RegExp | null = null): MiniSeriesReason | null {
  const text = (title ?? '').trim()
  if (!text) return null
  if (LABEL.test(text)) return 'label'
  if (SEED_MATCHER?.test(text)) return 'studio'
  if (CJK.test(text)) return 'cjk'
  const form = FORM.test(text)
  // A learned name is only a clue: it condemns a title that is also shaped like a serial, never a plain one.
  if (form && studios?.test(text)) return 'studio'
  // Past this point every clue is a guess, and a guess never beats an old film.
  if (OLD_FILM.test(text)) return null
  if (TROPE.test(text) && form) return 'trope'
  // AI alone is a podcast or a news item; AI telling a love story or a drama is the genre.
  if (AI_WORD.test(text) && STORY.test(text)) return 'ai-story'
  if (NARRATIVE.test(text) && form && wordCount(text) >= NARRATIVE_MIN_WORDS) return 'narrative'
  return null
}

export const isMiniSeries = (title: string | null | undefined, studios: RegExp | null = null): boolean =>
  miniSeriesReason(title, studios) !== null

/**
 * The shape of the thing, whatever its title says. Measured on 27 September:
 * 88% of the serials already caught were vertical and over fifteen minutes,
 * every vertical video over fifteen minutes posted by the reupload accounts
 * was a serial ("Quand un PDG consulte une Sexologue", "Le Sacrifice de la
 * Vierge réclamé par le Roi Dragon"), and their films and TV are horizontal.
 * A vertical clip of a few minutes is an ordinary short and stays.
 */
export const VERTICAL_MAX_RATIO = 0.9
export const LONG_FORM_SECONDS = 20 * 60
/**
 * Vertical and long, yet not a serial: a concert filmed on a phone, a live, a
 * talk, a workout. Only for a title that has no serial shape at all: on 27
 * September the loose words ("live", "concert") spared "Long Live His Fake
 * Majesty" and "The Crazy Night at the Concert [Full Movie]".
 */
const LONG_VERTICAL_EXCEPTIONS = /\b(?:concert|concierto|live at|live in|live from|live recording|live session|en vivo|ao vivo|dj set|gameplay|walkthrough|podcast|interview|sermon|messe|misa|webcam|lecture|workout|yoga|asmr|timelapse|documentary|documentaire|conference|conférence)\b/i

/** Seconds from a stored "PT1H2M3S" duration, or null. */
export function isoSeconds(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec((value ?? '').trim())
  if (!match || match[0] === 'P' || match[0] === 'PT') return null
  const [, days, hours, minutes, seconds] = match
  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
}

export type ShapedVideo = { title?: string | null; aspectRatio?: number | null; duration?: string | number | null }

export function isVerticalSerial(video: ShapedVideo): boolean {
  const ratio = video.aspectRatio
  if (typeof ratio !== 'number' || !(ratio > 0) || ratio >= VERTICAL_MAX_RATIO) return false
  const seconds = isoSeconds(video.duration)
  if (seconds === null || seconds < LONG_FORM_SECONDS) return false
  const title = video.title ?? ''
  return FORM.test(title) || !LONG_VERTICAL_EXCEPTIONS.test(title)
}

/** The whole verdict: the title first, then the shape. */
export function miniSeriesVerdict(video: ShapedVideo, studios: RegExp | null = null): MiniSeriesReason | null {
  return miniSeriesReason(video.title, studios) ?? (isVerticalSerial(video) ? 'shape' : null)
}

/**
 * Words that say nothing about who posted a serial. A title segment made of
 * these alone ("Short Drama English", "Full HD") is never taken for a studio.
 */
const GENERIC = new Set([
  'full', 'movie', 'movies', 'film', 'films', 'drama', 'dramas', 'short', 'series', 'serie', 'série', 'completa', 'complète', 'complete',
  'completo', 'episode', 'episodes', 'episodio', 'ep', 'eps', 'english', 'español', 'espanol', 'français', 'francais', 'sub', 'subs',
  'subtitles', 'subtitle', 'dub', 'dubbed', 'doblado', 'doublé', 'engsub', 'ensub', 'eng', 'esp', 'hd', '4k', 'new', 'hot', 'part',
  'parte', 'vostfr', 'vf', 'no', 'cut', 'uncut', 'romance', 'revenge', 'billionaire', 'ceo', 'fantasy', 'action', 'thriller', 'comedy',
  'love', 'mafia', 'werewolf', 'dailymotion', 'watch', 'now', 'free', 'online', 'the', 'a', 'of', 'in', 'en', 'de', 'la', 'le', 'el',
  'and', 'y', 'et', 'with', 'version', 'latest', 'best', 'top', 'official', 'trailer', 'recommended', 'mini', 'micro', 'romantic',
  'comedia', 'romántica', 'drame', 'story', 'stories', 'all', 'sd', 'fhd', 'uhd', 'multi', 'audio', 'latino', 'castellano', 'season',
  'hindi', 'dubbing', 'sub español', 'eng sub', 'short film', 'mystery', 'dark', 'viral', 'powerful', 'woman', 'women',
  'updated', 'update', 'nueva', 'nuevo', 'versión', 'épisode', 'épisodes', 'complet', 'capítulo', 'capitulo', 'streaming', 'stream',
  'video', 'vidéo', 'clip', 'music', 'song', 'live', 'full hd', 'hq', 'high', 'quality', 'today', 'tonight', 'week', 'day',
  'detailed', 'komplette', 'combined', 'miniseries', 'mini-series', 'dream', 'dreams', 'lgbtq', 'chinese', 'korean', 'japanese',
])

/** A one-word name has to be a made-up brand ("reelshort", "shortmax"), not a word of the language. */
const SINGLE_WORD_MIN = 7

export function normaliseStudio(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}.\s'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The parts of a title that could name who posted it: the short segments
 * between bars, dashes, brackets and hashtags, when at least one of their
 * words is not a generic one. "… | Short Drama English | NITRO REALMS"
 * gives "nitro realms".
 */
export function studioCandidates(title: string | null | undefined): string[] {
  const text = (title ?? '').trim()
  if (!text) return []
  const segments = text.split(/\s*[|｜]\s*|\s[-–—]\s|[[\]()【】#]|\s{2,}/u)
  const out = new Set<string>()
  for (const raw of segments) {
    const segment = normaliseStudio(raw ?? '')
    if (segment.length < 4 || segment.length > 30) continue
    const words = segment.split(' ').filter(Boolean)
    if (words.length > 3) continue
    if (words.length === 1 && segment.length < SINGLE_WORD_MIN) continue
    if (!/\p{L}/u.test(segment)) continue
    if (words.every((word) => GENERIC.has(word) || /^\d+$/.test(word))) continue
    out.add(segment)
  }
  return [...out]
}

/**
 * Which learned names count as studios: seen on enough refused serials, and
 * rarely on anything that was let in. A story's own name repeated across its
 * episodes qualifies too, which is right: it only ever names that serial.
 */
export const STUDIO_MIN_REFUSED = 8
export const STUDIO_REFUSED_PER_KEPT = 4

export function isLearnedStudio(counts: { refused: number; kept: number }): boolean {
  return counts.refused >= STUDIO_MIN_REFUSED && counts.refused >= STUDIO_REFUSED_PER_KEPT * (counts.kept + 1)
}

/** One serial in a hundred is let through, chosen by its id so the choice never changes between runs. */
export const KEEP_ONE_IN = 100

export function inKeptShare(videoId: string | null | undefined): boolean {
  const id = videoId ?? ''
  if (!id) return false
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % KEEP_ONE_IN === 0
}
