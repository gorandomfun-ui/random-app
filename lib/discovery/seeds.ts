import { type SearchSpec } from './exploration'
import { hash, seeded, shuffled, type Rng } from './random'

/** Starter vocabulary, deliberately configurable. This is search coverage, never proof of a result's subject. */
export const SEARCH_AXES: Record<string, string[]> = {
  pt: ['televisão local', 'filme caseiro', 'publicidade antiga', 'música experimental', 'torneio amador'],
  pl: ['telewizja lokalna', 'film amatorski', 'stare reklamy', 'koncert garażowy'],
  tr: ['yerel televizyon', 'eski reklamlar', 'amatör turnuva', 'ev yapımı'],
  ru: ['домашнее видео', 'старая реклама', 'любительский концерт', 'научный эксперимент'],
  zh: ['家庭录像', '老广告', '手工制作', '业余比赛', '实验音乐'],
  no: ['lokal tv', 'gammel reklame', 'hjemmevideo', 'amatørkonsert'],
  en: ['public access television', 'independent animation', 'local sports tournament', 'street performance', 'experimental instrument', 'handmade machine', 'home movie', 'regional television commercial', 'science demonstration', 'underground short film', 'speedrun', 'generative animation', 'gaming challenge', 'creator vlog', 'independent game', 'fan concert recording'],
  fr: ['télévision locale', 'animation indépendante', 'tournoi amateur', 'spectacle de rue', 'instrument expérimental', 'machine artisanale', 'film de famille', 'publicité régionale', 'expérience scientifique', 'court métrage expérimental', 'jeu vidéo insolite', 'animation générative', 'défi gaming', 'vlog créateur', 'jeu indépendant', 'concert filmé par un fan'],
  de: ['Lokalfernsehen', 'unabhängige Animation', 'Amateurturnier', 'Straßenkunst', 'experimentelles Instrument', 'selbstgebaute Maschine', 'Familienfilm', 'regionale Werbung', 'Wissenschaftsexperiment', 'experimenteller Kurzfilm', 'Computerspiel', 'generative Animation', 'Gaming Challenge', 'Creator Vlog'],
  es: ['televisión local', 'animación independiente', 'torneo amateur', 'espectáculo callejero', 'instrumento experimental', 'máquina casera', 'película familiar', 'publicidad regional', 'experimento científico', 'cortometraje experimental', 'videojuego', 'animación generativa', 'reto videojuegos', 'vlog creador'],
  ja: ['ローカルテレビ', '自主制作アニメ', 'アマチュア大会', '大道芸', '実験楽器', '自作機械', 'ホームビデオ', 'ローカルCM', '科学実験', '自主制作映画', 'ゲーム実況', '生成アニメ', 'ゲームチャレンジ', '日常vlog'],
}
export function createSearchSeeds(random: Rng, now: number, limit = 20, axes = SEARCH_AXES, rotation?: number): SearchSpec[] {
  const current = new Date(now), year = current.getUTCFullYear()
  const vocabulary = Object.entries(axes).flatMap(([language, queries]) => queries.map(query => ({ language, query })))
  if (!vocabulary.length) return []
  const size = Math.max(0, Math.min(vocabulary.length, 100, Math.floor(limit)))
  const rotating = Number.isSafeInteger(rotation) && rotation! >= 0
  const pairs = shuffled(vocabulary, rotating ? seeded(hash('discovery-search-rotation-v1')) : random)
  const start = rotating ? (rotation! * size) % pairs.length : 0
  const selected = Array.from({ length: size }, (_, index) => pairs[(start + index) % pairs.length])
  return selected.map(({ language, query }, i) => {
    // Rotate actual publication windows. They never claim to be the footage's recording date.
    const fromYear = i % 3 === 0 ? year : i % 3 === 1 ? 2005 + Math.floor(random() * Math.max(1, year - 2010)) : year - 5 + Math.floor(random() * 5)
    const dayBoundary = Date.UTC(year, current.getUTCMonth(), current.getUTCDate())
    const end = Math.min(dayBoundary, Date.UTC(fromYear + 1, 0, 1))
    const after = new Date(Math.min(Date.UTC(fromYear, 0, 1), end - 86400000)).toISOString()
    const before = new Date(end).toISOString()
    return { kind: 'search', query, language, after, before, order: i % 3 === 0 ? 'date' : 'relevance' }
  })
}
