/**
 * From signals to subjects of the day.
 *
 * A candidate is a name the signals agree on: a dictionary subject the
 * titles mention, or an unknown name that Wikidata resolves. It becomes a
 * subject of the day when two sources or two countries carry it, or one
 * source carries it high (Trends top 5, Wikipedia top 10). Random is not a
 * news site: anything the world reads about because of a death, a disaster,
 * a trial or an election is refused, and so is the news-society universe.
 * Fifteen a day at most, the best scores first; a name that persists over
 * days scores higher and ends up rising.
 */

import { normalize } from '../tagging/normalize'
import type { Universe } from '../types'
import type { Signal, SignalSource } from './signals'

export const DAILY_CAP = 15

export type Candidate = {
  /** The subject id when known ("entity:lizzie-borden"), else "text:<normalised title>". */
  key: string
  label: string
  signals: Signal[]
  sources: SignalSource[]
  countries: string[]
  strong: boolean
  score: number
  /** Set once the dictionary or Wikidata named the thing. */
  subjectId?: string
  universe?: Universe
  aliases?: string[]
  isHuman?: boolean
  instances?: string[]
  description?: string
  qid?: string
  /** Days it was already seen on, before today. */
  daysSeen?: number
}

export type CandidatePiece = Pick<Candidate, 'key' | 'label'> & { signal: Signal } &
  Partial<Pick<Candidate, 'subjectId' | 'universe' | 'aliases' | 'isHuman' | 'instances' | 'description' | 'qid'>>

export const textKey = (text: string): string => `text:${normalize(text)}`

/** Wikipedia disambiguates in brackets: "Black Rain (film)" names Black Rain. */
export const displayLabel = (title: string): string => title.replace(/\s*[(（][^)）]*[)）]\s*$/u, '').trim() || title

/** Pieces of the same key become one candidate; sources and countries are counted once each. */
export function mergeCandidates(pieces: CandidatePiece[]): Candidate[] {
  const byKey = new Map<string, Candidate>()
  for (const piece of pieces) {
    const { signal, key, label, ...meta } = piece
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { key, label, signals: [signal], sources: [signal.source], countries: [signal.country], strong: signal.strong, score: 0, ...meta })
      continue
    }
    if (!existing.signals.some((seen) => seen.source === signal.source && seen.country === signal.country && seen.rank === signal.rank && seen.day === signal.day)) existing.signals.push(signal)
    if (!existing.sources.includes(signal.source)) existing.sources.push(signal.source)
    if (!existing.countries.includes(signal.country)) existing.countries.push(signal.country)
    existing.strong = existing.strong || signal.strong
    for (const [field, value] of Object.entries(meta)) {
      if (value !== undefined && (existing as Record<string, unknown>)[field] === undefined) (existing as Record<string, unknown>)[field] = value
    }
  }
  return [...byKey.values()].map((candidate) => ({ ...candidate, score: scoreCandidate(candidate) }))
}

/** Signals count, high ranks count double, agreement across sources and countries counts most, persistence counts. */
export function scoreCandidate(candidate: Pick<Candidate, 'signals' | 'sources' | 'countries' | 'daysSeen'>): number {
  const signals = candidate.signals.reduce((sum, signal) => sum + 1 + (signal.strong ? 2 : 0), 0)
  return signals + (candidate.sources.length - 1) * 3 + (candidate.countries.length - 1) * 2 + (candidate.daysSeen ?? 0) * 2
}

/** Two sources, or two countries, or one strong signal. */
export function qualifies(candidate: Pick<Candidate, 'sources' | 'countries' | 'strong'>): boolean {
  return candidate.sources.length >= 2 || candidate.countries.length >= 2 || candidate.strong
}

/** Wikidata classes (P31) of things Random does not build subjects on. */
export const SENSITIVE_CLASSES = new Set([
  'Q4', // death
  'Q3839081', // disaster
  'Q8065', // natural disaster
  'Q7944', // earthquake
  'Q8068', // flood
  'Q2223653', // terrorist attack
  'Q132821', // murder
  'Q744913', // aviation accident
  'Q3241045', // disease outbreak
  'Q2334719', // legal case
  'Q40231', // public election
  'Q198', // war
  'Q178561', // battle
  'Q124734', // rebellion
  'Q1190554', // occurrence
  'Q1656682', // planned event
  'Q7278', // political party
])

/** Words that say a page or a headline is about a death, an accident, a disaster, a trial or an election. */
const SENSITIVE_LATIN = [
  // en
  'death', 'dies', 'died', 'dead', 'killed', 'murder', 'murdered', 'homicide', 'shooting', 'stabbing', 'stabbed', 'terror', 'terrorist',
  'crash', 'accident', 'disaster', 'earthquake', 'flood', 'floods', 'wildfire', 'hurricane', 'tornado', 'trial', 'verdict', 'sentenced', 'arrested', 'arrest',
  'indicted', 'election', 'elections', 'suicide', 'rape', 'assault', 'missile', 'bombing', 'explosion', 'massacre', 'genocide', 'hostage', 'kidnapped', 'overdose',
  'murders', 'killer', 'murderer', 'serial', 'convicted', 'executed', 'execution', 'prisoner', 'crime', 'crimes', 'criminal',
  // fr
  'mort', 'morte', 'décès', 'deces', 'décédé', 'décédée', 'tué', 'tuée', 'meurtre', 'assassinat', 'assassiné', 'fusillade', 'attentat', 'catastrophe', 'séisme', 'inondation',
  'inondations', 'incendie', 'procès', 'condamné', 'condamnée', 'arrêté', 'arrestation', 'élection', 'élections', 'viol', 'agression', 'guerre', 'otage', 'enlèvement', 'disparu', 'disparue',
  'meurtres', 'tueur', 'tueuse', 'meurtrier', 'meurtrière', 'criminel', 'criminelle', 'crime', 'crimes',
  // de
  'tot', 'gestorben', 'tod', 'getötet', 'mord', 'anschlag', 'unfall', 'absturz', 'katastrophe', 'erdbeben', 'hochwasser', 'prozess', 'urteil', 'verhaftet', 'festgenommen', 'wahl', 'selbstmord', 'krieg',
  'morde', 'mörder', 'mörderin', 'verbrechen', 'landtagswahl', 'bundestagswahl',
  // es
  'muerte', 'muerto', 'muerta', 'murió', 'fallece', 'fallecido', 'fallecida', 'asesinato', 'asesinado', 'tiroteo', 'atentado', 'accidente', 'catástrofe', 'terremoto', 'inundación',
  'inundaciones', 'juicio', 'condenado', 'detenido', 'detenida', 'detención', 'elección', 'elecciones', 'suicidio', 'violación', 'secuestro', 'desaparecido', 'desaparecida',
  'asesinatos', 'asesino', 'asesina', 'crimen', 'crímenes', 'criminal',
]
/** Scripts without word boundaries: matched as substrings. */
const SENSITIVE_CJK = ['死亡', '死去', '殺害', '殺人', '事件', '事故', '地震', '洪水', '裁判', '逮捕', '選挙', '自殺', '戦争', '爆発', 'テロ', '訃報', '火災', '墜落', '遺体', '殺人犯', '犯罪']

const SENSITIVE_WORDS = new Set(SENSITIVE_LATIN.map((word) => normalize(word)))

function sensitiveText(text: string): boolean {
  if (!text) return false
  if (SENSITIVE_CJK.some((word) => text.includes(word))) return true
  return normalize(text).split(' ').some((word) => SENSITIVE_WORDS.has(word))
}

/**
 * Whether the thing is a piece of news rather than a subject: its Wikidata
 * description, its headlines, and — for names written without word
 * boundaries — its title. "Attack on Titan" is a manga; a page called
 * "千葉小3女児殺害事件" is a murder case.
 */
export function looksSensitive(input: { title?: string; description?: string; news?: string[] }): boolean {
  if (sensitiveText(input.description ?? '')) return true
  if ((input.news ?? []).some(sensitiveText)) return true
  const title = input.title ?? ''
  return SENSITIVE_CJK.some((word) => title.includes(word))
}

export type Refusal = 'news-society' | 'sensitive-class' | 'sensitive' | 'vague'

/** Why a candidate is not a subject of the day, or null. */
export function refusalOf(candidate: Candidate): Refusal | null {
  if (candidate.universe === 'news-society') return 'news-society'
  if ((candidate.instances ?? []).some((instance) => SENSITIVE_CLASSES.has(instance))) return 'sensitive-class'
  const news = candidate.signals.flatMap((signal) => signal.news ?? [])
  if (looksSensitive({ title: candidate.label, description: candidate.description, news })) return 'sensitive'
  // A thing with no world of its own — "hacker", "music video", "television series" — names no subject a visitor would follow.
  if ((candidate.universe ?? 'other') === 'other' && !candidate.isHuman) return 'vague'
  return null
}

/** The subjects of the day: those that qualify, best scores first, the cap applied. */
export function selectSubjects(candidates: Candidate[], cap = DAILY_CAP): Candidate[] {
  return candidates
    .filter(qualifies)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, cap)
}
