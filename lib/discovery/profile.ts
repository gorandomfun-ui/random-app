import { PROFILE_VERSION, type Profile, type SourceMetadata } from './types'

// Broad themes balance Random; they are deliberately insufficient to establish a Wave.
const RULES: Record<string, Record<string, string[]>> = {
  music: { 'guitar-performance': ['guitar', 'guitare', 'gitarre', 'guitarra', 'ギター'], 'punk-performance': ['punk'], 'singing': ['singing', 'chanter', 'gesang', 'cantar', '歌唱'] },
  sport: { 'skateboarding': ['skateboard', 'skateboarding', 'スケートボード'], 'football': ['football', 'soccer', 'fussball', 'fútbol', 'サッカー'], 'surfing': ['surfing', 'surfen', 'サーフィン'] },
  craft: { 'stone-carving': ['stone carving', 'taille de pierre', 'steinmetz', '石彫'], 'pottery': ['pottery', 'poterie', 'töpferei', 'cerámica', '陶芸'] },
  food: { 'cooking': ['cooking', 'cuisine', 'kochen', 'cocinar', '料理'], 'noodle-making': ['noodles', 'nouilles', 'nudeln', '麺'] },
  art: { 'performance-art': ['performance art', 'performance artistique', 'aktionskunst'], 'stop-motion': ['stop motion', 'ストップモーション'] },
  advertising: { 'advertising-media': ['commercials', 'tv ads', 'television ads', 'tv commercial', 'tv commercials',
    'television commercial', 'television commercials', 'commercial compilation', 'commercial break',
    'advertisement', 'advertisements', 'publicité', 'publicites', 'werbespot', 'werbung', 'anuncio', '広告'] },
  cinema: { 'film-trailer': ['trailer', 'bande annonce', '予告編'], 'short-film': ['short film', 'court métrage', 'kurzfilm', '短編映画'] },
  science: { 'experiment': ['experiment', 'expérience scientifique', 'experimento', '実験'], 'astronomy': ['astronomy', 'astronomie', 'astronomía', '天文学'] },
  gaming: { 'speedrunning': ['speedrun', 'speedrunning'], 'gameplay': ['gameplay', 'let s play', '実況プレイ'] },
  technology: { 'generative-video': ['ai video', 'vidéo ia', 'ki video', '生成ai'], 'robotics': ['robotics', 'robotique', 'robotik', 'ロボット'] },
  travel: { 'walking-tour': ['walking tour', 'rain walk', 'walk pov', 'pov walk', 'visite à pied', 'stadtrundgang', '街歩き'], 'rail-travel': ['train journey', 'voyage en train', 'zugfahrt', '鉄道旅行'] },
  everyday: { 'home-recording': ['home video', 'vidéo de famille', 'heimvideo', 'video casero', 'ホームビデオ'] },
}
const STOP = new Set(('the and this that with from for your you are was were what have has ' +
  'les des une dans avec pour sur est qui que pas par du un et de le la au aux ' +
  'der die das ein eine und mit von für ist aus dem den zu ' +
  'los las una con por para del el en y ' +
  'video videos youtube dailymotion official upload uploaded watch channel subscribe like share ' +
  'weird rare retro vintage amazing cool funny best new old hd hq music image photo compilation live concert recording performance festival archive full clip highlights ' +
  'how why know they them their there these those other each more most much many all any some both only also just about into over under before after through when where which who will would can could should may might must does did doing not don didn isn wasn aren been being our ours his her hers its than then very really make made get got see want need use using enjoy today now here please follow support comments copyright rights reserved without original content trending trend viral shorts fyp foryou tiktok edit ' +
  'comment pourquoi savoir nous vous votre vos notre nos sont etre c est ce ces cette cet ses son sa aussi plus moins tres tous tout toutes comme faire fait dans cette video abonnez merci ' +
  'wie warum wissen nicht auch aber dieser diese dieses sind bitte danke mais porque como voce voces seu sua tudo muito apenas foi este esta aqui gracias esto esta esto solo todo todos' ).split(/\s+/))
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
export const SIGNAL_VERSION = 3
export function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('und').normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
export function tokensOf(text: string): string[] {
  return [...new Set([...segmenter.segment(normalize(text).slice(0, 6000))]
    .filter(x => x.isWordLike).map(x => x.segment)
    .filter(x => !STOP.has(x) && !/^\d+$/.test(x) && (x.length >= 3 || /[^\p{Script=Latin}\d]/u.test(x))))].slice(0, 80)
}
/** Tags supplied by creators are discovery hints, not evidence of the video's subject. */
const PROMO = /^(?:(?:tags?|keywords?|hashtags?|related tags?|tegs)(?:\s*[:=-]|\s*$)|copyright\b|all rights\b|disclaimer\b|aviso\b|creditos\b|subscribe\b|follow (?:me|us)\b|support (?:me|us|the)\b|don't forget\b|do not forget\b|abonnez|suivez|merci de|suscrib|inscreva)/iu

function plainText(value: string): string {
  return value.replace(/<[^>]{0,500}>/g, ' ').replace(/https?:\/\/\S+/g, ' ')
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, ' ')
}
function tagList(value: string): boolean {
  return (value.match(/,/g)?.length ?? 0) >= 8 || (value.match(/#/g)?.length ?? 0) >= 4
}
const ADVERTISING_MEDIA_TITLE = /(?:^| )(?:(?:tv|television|radio|vintage|classic|retro) commercials?|[12]\d{3}(?: [\p{L}\p{N}]+){0,6} commercials?|commercials? (?:compilation|break|collection|restored)|(?:ads?|advertisements?) (?:compilation|break|collection|restored))(?: |$)/u
export function cleanDescription(value: string): string {
  const result: string[] = []
  for (const raw of plainText(value.slice(0, 3500)).split(/[\r\n]+/)) {
    const line = raw.trim()
    if (!line) continue
    if (PROMO.test(line)) break
    // Preserve prose before a trailing hashtag block, but never the hashtag list itself.
    const prose = line.split(/#[\p{L}_]/u)[0].trim()
    if (!prose || tagList(prose)) continue
    for (const sentence of prose.split(/(?<=[.!?])\s+/)) {
      if (!PROMO.test(sentence.trim())) result.push(sentence)
      if (result.length >= 6) return result.join(' ').slice(0, 1000)
    }
  }
  return result.join(' ').slice(0, 1000)
}
function classify(value: string): { practices: string[]; themes: string[] } {
  const text = ` ${normalize(value)} `, practices: string[] = [], themes: string[] = []
  for (const [theme, rules] of Object.entries(RULES)) {
    for (const [practice, aliases] of Object.entries(rules)) {
      if (aliases.some(alias => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(alias)
        ? text.includes(normalize(alias)) : text.includes(` ${normalize(alias)} `))) {
        practices.push(practice); themes.push(theme)
      }
    }
  }
  // “Commercial” alone is polysemous (commercial failure, commercial use, etc.).
  // Only audiovisual advertising context can create the advertising relation.
  if (ADVERTISING_MEDIA_TITLE.test(text)) {
    practices.push('advertising-media')
    themes.push('advertising')
  }
  return { practices: [...new Set(practices)], themes: [...new Set(themes)] }
}
export function buildProfile(source: SourceMetadata): Profile {
  const rawTitle = plainText((source.title ?? '').slice(0, 500))
  const title = tagList(rawTitle) ? rawTitle.split(/[#，,]/u)[0] : rawTitle.split(/#[\p{L}_]/u)[0]
  const description = cleanDescription(source.description ?? '')
  const primary = classify(title), secondary = classify(description)
  const titleTokens = tokensOf(title).slice(0, 32)
  const tokens = [...new Set([...titleTokens, ...tokensOf(description)])].slice(0, 64)
  const entities = [...new Set((source.entities ?? []).map(normalize).filter(Boolean))].slice(0, 12)
  // An unambiguous title wins over incidental subjects in the description.
  const themes = primary.themes.length ? primary.themes : secondary.themes
  const practices = primary.practices.length ? primary.practices : secondary.practices
  const normalizedTitle = normalize(title)
  const ai = /(?:^| )(?:ai|ia|ki|generative|generated|ghibli|sora)(?: |$)/u.test(normalizedTitle)
  const narrative = /(?:^| )(?:story|stories|storytelling|novel|romance|roman|histoire|histoires)(?: |$)/u.test(normalizedTitle)
  return { version: PROFILE_VERSION, signalVersion: SIGNAL_VERSION, tokens, titleTokens,
    titlePractices: primary.practices, entities, practices, themes, family: themes[0] ?? 'unknown',
    ...(ai && narrative ? { pattern: 'ai-narrative' } : {}),
    evidence: tokens.length >= 2 || practices.length > 0 || entities.length > 0 ? 'described' : 'unknown' }
}

export function isStockProvider(provider: string, url = ''): boolean {
  if (/^(pexels|pixabay)$/i.test(provider)) return true
  try { return /(^|\.)(pexels|pixabay)\.com$/i.test(new URL(url).hostname) } catch { return false }
}
