import { PROFILE_VERSION, type Profile, type SourceMetadata } from './types'
import { analyseSubject, topicSubject, foldSubject } from './subjects'
import { metadataIntegrity, plainSource } from './integrity'
import { sourceRevision } from './sourceRevision'
import { providerPageWords, permalinkSubject, subjectTitle } from './sourceEvidence'

// Broad themes balance Random; they are deliberately insufficient to establish a Wave.
const RULES: Record<string, Record<string, string[]>> = {
  music: { 'guitar-performance': ['guitar', 'guitare', 'gitarre', 'guitarra', 'ギター'], 'punk-performance': ['punk'], 'singing': ['singing', 'chanter', 'gesang', 'cantar', '歌唱'] },
  sport: { 'skateboarding': ['skateboard', 'skateboarding', 'スケートボード'], 'football': ['football', 'soccer', 'fussball', 'fútbol', 'サッカー'], 'surfing': ['surfing', 'surfen', 'サーフィン'] },
  craft: { 'stone-carving': ['stone carving', 'taille de pierre', 'steinmetz', '石彫'], 'pottery': ['pottery', 'poterie', 'töpferei', 'cerámica', '陶芸'] },
  food: { 'cooking': ['cooking', 'cuisine', 'kochen', 'cocinar', '料理'], 'noodle-making': ['noodles', 'nouilles', 'nudeln', '麺'] },
  art: { 'performance-art': ['performance art', 'performance artistique', 'aktionskunst'], 'stop-motion': ['stop motion', 'ストップモーション'] },
  advertising: { 'advertising-media': ['commercials', 'tv ads', 'television ads', 'tv commercial', 'tv commercials',
    'television commercial', 'television commercials', 'commercial compilation', 'commercial break',
    'publicité', 'publicites', 'werbespot', 'werbung', 'anuncio', '広告'] },
  cinema: { 'film-trailer': ['trailer', 'bande annonce', '予告編'], 'short-film': ['short film', 'court métrage', 'kurzfilm', '短編映画'] },
  science: { 'experiment': ['experiment', 'expérience scientifique', 'experimento', '実験'], 'astronomy': ['astronomy', 'astronomie', 'astronomía', '天文学'] },
  gaming: { 'speedrunning': ['speedrun', 'speedrunning'], 'gameplay': ['gameplay', 'let s play', '実況プレイ'] },
  technology: { 'generative-video': ['ai video', 'vidéo ia', 'ki video', '生成ai'], 'robotics': ['robotics', 'robotique', 'robotik', 'ロボット'] },
  travel: { 'walking-tour': ['walking tour', 'rain walk', 'walk pov', 'pov walk', 'visite à pied', 'stadtrundgang', '街歩き'], 'rail-travel': ['train journey', 'voyage en train', 'zugfahrt', '鉄道旅行'] },
  everyday: { 'home-recording': ['home video', 'vidéo de famille', 'heimvideo', 'video casero', 'ホームビデオ'] },
}
const STOP = new Set(('the and this that with from for your you are was were what have has him himself herself myself ourselves themselves thought every once still said says thing things shown shows someone something ' +
  'les des une dans avec pour sur est qui que pas par du un et de le la au aux ' +
  'der die das ein eine und mit von für ist aus dem den zu ' +
  'los las una con por para del el en y ' +
  'video videos youtube dailymotion official upload uploaded watch channel subscribe like share ' +
  'weird rare retro vintage amazing cool funny best new old hd hq music image photo compilation live concert recording performance festival archive full clip highlights ' +
  'how why know they them their there these those other each more most much many all any some both only also just about into over under before after through when where which who will would can could should may might must does did doing not don didn isn wasn aren been being our ours his her hers its than then very really make made get got see want need use using enjoy today now here please follow support comments copyright rights reserved without original content trending trend viral shorts fyp foryou tiktok edit ' +
  'comment pourquoi savoir nous vous votre vos notre nos sont etre c est ce ces cette cet ses son sa aussi plus moins tres tous tout toutes comme faire fait dans cette video abonnez merci ' +
  'wie warum wissen nicht auch aber dieser diese dieses sind bitte danke mais porque como voce voces seu sua tudo muito apenas foi este esta aqui gracias esto esta esto solo todo todos' ).split(/\s+/))
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
const CATEGORIES: Record<string, string> = { '20': 'gaming', videogames: 'gaming', '10': 'music', music: 'music',
  '17': 'sport', sport: 'sport', '28': 'science', school: 'science', '19': 'travel', travel: 'travel',
  tech: 'technology', '22': 'everyday', people: 'everyday', lifestyle: 'everyday', '1': 'cinema', shortfilms: 'cinema', creation: 'art' }
export const SIGNAL_VERSION = 8
export function normalize(text: string): string {
  return foldSubject(text)
}
export function tokensOf(text: string): string[] {
  return [...new Set([...segmenter.segment(normalize(text).slice(0, 6000))]
    .filter(x => x.isWordLike).map(x => x.segment)
    .filter(x => !STOP.has(x) && !/^\d+$/.test(x) && (x.length >= 3 || /[^\p{Script=Latin}\d]/u.test(x))))].slice(0, 80)
}
/** Tags supplied by creators are discovery hints, not evidence of the video's subject. */
const PROMO = /^(?:(?:tags?|keywords?|hashtags?|related tags?|tegs)(?:\s*[:=-]|\s*$)|copyright\b|all rights\b|disclaimer\b|aviso\b|creditos\b|subscribe\b|follow (?:me|us)\b|support (?:me|us|the)\b|don't forget\b|do not forget\b|abonnez|suivez|merci de|suscrib|inscreva)/iu

function plainText(value: string): string {
  return plainSource(value)
}
function tagList(value: string): boolean {
  return (value.match(/,/g)?.length ?? 0) >= 8 || (value.match(/#/g)?.length ?? 0) >= 4
}
const ADVERTISING_MEDIA_TITLE = /(?:^| )(?:(?:tv|television|radio|vintage|classic|retro) (?:commercials?|advertisements?)|[12]\d{3}(?: [\p{L}\p{N}]+){0,6} commercials?|commercials? (?:compilation|break|collection|restored)|(?:ads?|advertisements?) (?:compilation|break|collection|restored))(?: |$)/u
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

/** A quoted work named by a quiz/question is an answer option, not the question's subject. */
function subjectBearingTitle(value: string): string {
  if (!/(?:known for|which (?:show|film|artist|band)|songs?|tracks?|titled|called)/iu.test(value)) return value
  return value.replace(/["“”„«»][^"“”„«»]{1,160}["“”„«»]/gu, ' ')
}
export function buildProfile(source: SourceMetadata): Profile {
  const integrity = metadataIntegrity(source.title ?? '', source.description ?? '', source.legacyUnverified)
  const rawTitle = source.legacyUnverified ? '' : plainText((source.title ?? '').slice(0, 500))
  const title = tagList(rawTitle) ? rawTitle.split(/[#，,]/u)[0] : rawTitle.split(/#[\p{L}_]/u)[0]
  const semanticTitle = subjectBearingTitle(subjectTitle(title))
  const description = integrity.reliable ? cleanDescription(source.description ?? '') : ''
  const primary = classify(semanticTitle), secondary = classify(description)
  const titleTokens = tokensOf(title).slice(0, 32)
  const pageWords = providerPageWords(source)
  const tokens = [...new Set([...titleTokens, ...tokensOf(pageWords.join(' ')), ...tokensOf(description)])].slice(0, 64)
  const entities = [...new Set((source.entities ?? []).map(normalize).filter(Boolean))].slice(0, 12)
  // An unambiguous title wins over incidental subjects in the description.
  const themes = primary.themes.length ? primary.themes : secondary.themes.length ? secondary.themes
    : integrity.reliable && source.category && CATEGORIES[source.category] ? [CATEGORIES[source.category]] : []
  const practices = primary.practices.length ? primary.practices : secondary.practices
  const normalizedTitle = normalize(title)
  let subject = analyseSubject(semanticTitle, source.primarySubject, CATEGORIES[source.category ?? ''] === 'music')
  const permalink = permalinkSubject(source)
  if (permalink && !subject.primary) {
    // A provider's literal permalink can identify a GIF whose alt text only describes its pixels.
    // Creator tags and ingestion queries remain excluded.
    const recovered = analyseSubject(`${permalink} interview`)
    if (recovered.primary && (!recovered.primary.tentative || foldSubject(permalink).split(' ').length >= 2)) subject = { ...subject, primary: { ...recovered.primary, evidence: 'permalink' },
      title: `${subject.title} ${foldSubject(permalink)}` }
  }
  // A worker may attach a canonical identity only after literal source verification.
  if (source.primarySubject && permalink) {
    const canonical = analyseSubject(`${semanticTitle} ${permalink}`, source.primarySubject)
    if (canonical.primary?.evidence === 'verified') subject = { ...subject, primary: canonical.primary }
  }
  // The same explicit practice vocabulary already used by Waves also supplies owner searches.
  // This covers ordinary topics without inventing a capitalised person or requiring a manual registry entry.
  const practiceTopics = primary.practices.flatMap(practice => {
    const aliases = Object.values(RULES).map(rules => rules[practice]).find(Boolean)
    return aliases ? [topicSubject(practice, aliases)] : []
  }).filter(topic => topic.key !== subject.primary?.key && !subject.secondary.some(s => s.key === topic.key))
  if (!subject.primary && practiceTopics.length) subject.primary = practiceTopics.shift()
  subject.secondary = [...subject.secondary, ...practiceTopics].slice(0, 6)
  // A camera filename can still have a useful, real description. Do not replace a descriptive title.
  if (!subject.primary && (integrity.sparse || !titleTokens.length)) {
    const described = analyseSubject(description.split(/[.!?]\s/u)[0], source.primarySubject)
    if (described.primary) subject = { ...subject,
      primary: { ...described.primary, evidence: 'description' }, secondary: described.secondary,
      moods: described.moods, treatments: described.treatments }
  }
  const ai = /(?:^| )(?:ai|ia|ki|generative|generated|ghibli|sora)(?: |$)/u.test(normalizedTitle)
  const narrative = /(?:^| )(?:story|stories|storytelling|novel|romance|roman|histoire|histoires)(?: |$)/u.test(normalizedTitle)
  return { version: PROFILE_VERSION, signalVersion: SIGNAL_VERSION, sourceRevision: sourceRevision(source), tokens, titleTokens,
    titleYearHints: [...new Set(rawTitle.match(/\b(?:19|20)\d{2}\b/gu) ?? [])].slice(0, 5),
    metadataQuality: !integrity.reliable ? 'unverified' : integrity.sparse ? 'sparse' : 'usable',
    ...(integrity.cluster ? { metadataCluster: integrity.cluster } : {}),
    subject,
    titlePractices: primary.practices, entities, practices, themes, family: themes[0] ?? 'unknown',
    ...(ai && narrative ? { pattern: 'ai-narrative' } : {}),
    evidence: integrity.reliable && (tokens.length >= 2 || practices.length > 0 || entities.length > 0) ? 'described' : 'unknown' }
}

export function isStockProvider(provider: string, url = ''): boolean {
  if (/^(pexels|pixabay)$/i.test(provider)) return true
  try { return /(^|\.)(pexels|pixabay)\.com$/i.test(new URL(url).hostname) } catch { return false }
}
