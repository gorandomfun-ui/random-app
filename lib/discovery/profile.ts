import { PROFILE_VERSION, type Profile, type SourceMetadata } from './types'

// Broad themes balance Random; they are deliberately insufficient to establish a Wave.
const RULES: Record<string, Record<string, string[]>> = {
  music: { 'guitar-performance': ['guitar', 'guitare', 'gitarre', 'guitarra', 'ギター'], 'punk-performance': ['punk'], 'singing': ['singing', 'chanter', 'gesang', 'cantar', '歌唱'] },
  sport: { 'skateboarding': ['skateboard', 'skateboarding', 'スケートボード'], 'football': ['football', 'soccer', 'fussball', 'fútbol', 'サッカー'], 'surfing': ['surfing', 'surfen', 'サーフィン'] },
  craft: { 'stone-carving': ['stone carving', 'taille de pierre', 'steinmetz', '石彫'], 'pottery': ['pottery', 'poterie', 'töpferei', 'cerámica', '陶芸'] },
  food: { 'cooking': ['cooking', 'cuisine', 'kochen', 'cocinar', '料理'], 'noodle-making': ['noodles', 'nouilles', 'nudeln', '麺'] },
  art: { 'performance-art': ['performance art', 'performance artistique', 'aktionskunst'], 'stop-motion': ['stop motion', 'ストップモーション'] },
  advertising: { 'commercial': ['commercial', 'advertisement', 'publicité', 'werbespot', 'anuncio', '広告'] },
  cinema: { 'film-trailer': ['trailer', 'bande annonce', '予告編'], 'short-film': ['short film', 'court métrage', 'kurzfilm', '短編映画'] },
  science: { 'experiment': ['experiment', 'expérience scientifique', 'experimento', '実験'], 'astronomy': ['astronomy', 'astronomie', 'astronomía', '天文学'] },
  gaming: { 'speedrunning': ['speedrun', 'speedrunning'], 'gameplay': ['gameplay', 'let s play', '実況プレイ'] },
  technology: { 'generative-video': ['ai video', 'vidéo ia', 'ki video', '生成ai'], 'robotics': ['robotics', 'robotique', 'robotik', 'ロボット'] },
  travel: { 'walking-tour': ['walking tour', 'visite à pied', 'stadtrundgang', '街歩き'], 'rail-travel': ['train journey', 'voyage en train', 'zugfahrt', '鉄道旅行'] },
  everyday: { 'home-recording': ['home video', 'vidéo de famille', 'heimvideo', 'video casero', 'ホームビデオ'] },
}
const STOP = new Set(('the and this that with from for your you are was were what have has ' +
  'les des une dans avec pour sur est qui que pas par du un et de le la au aux ' +
  'der die das ein eine und mit von für ist aus dem den zu ' +
  'los las una con por para del el en y ' +
  'video videos youtube dailymotion official upload uploaded watch channel subscribe like share ' +
  'weird rare retro vintage amazing cool funny best new old hd hq music image photo compilation live concert recording performance festival archive full clip highlights').split(/\s+/))
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
export function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('und').normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
export function tokensOf(text: string): string[] {
  return [...new Set([...segmenter.segment(normalize(text).slice(0, 6000))]
    .filter(x => x.isWordLike).map(x => x.segment)
    .filter(x => !STOP.has(x) && !/^\d+$/.test(x) && (x.length >= 3 || /[^\p{Script=Latin}\d]/u.test(x))))].slice(0, 80)
}
export function buildProfile(source: SourceMetadata): Profile {
  const title = (source.title ?? '').slice(0, 500)
  const description = (source.description ?? '').slice(0, 3500).replace(/https?:\/\/\S+/g, ' ')
  const apiTags = (source.tags ?? []).slice(0, 30).map(x => x.slice(0, 100))
  const text = ` ${normalize([title, description, ...apiTags].join(' '))} `
  const themes: string[] = [], practices: string[] = []
  for (const [theme, rules] of Object.entries(RULES)) {
    for (const [practice, aliases] of Object.entries(rules)) {
      if (aliases.some(alias => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(alias) ? text.includes(normalize(alias)) : text.includes(` ${normalize(alias)} `))) {
        themes.push(theme); practices.push(practice)
      }
    }
  }
  const tokens = tokensOf([title, description, ...apiTags].join(' '))
  const entities = [...new Set((source.entities ?? []).map(normalize).filter(Boolean))].slice(0, 12)
  return { version: PROFILE_VERSION, tokens, entities, practices: [...new Set(practices)],
    themes: [...new Set(themes)], family: themes[0] ?? 'unknown',
    evidence: tokens.length >= 2 || practices.length > 0 || entities.length > 0 ? 'described' : 'unknown' }
}

export function isStockProvider(provider: string, url = ''): boolean {
  if (/^(pexels|pixabay)$/i.test(provider)) return true
  try { return /(^|\.)(pexels|pixabay)\.com$/i.test(new URL(url).hostname) } catch { return false }
}
