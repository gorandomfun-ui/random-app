import { hash, weighted, type Rng } from './random'
import { isVisual, type Candidate } from './types'

/** Compact, session-local evidence of exposures, never a visitor preference profile. */
export type Exposure = {
  type: 'video' | 'image'; family: string; practices: string[]; terms: number[]
  pattern?: string; publicationYear?: number; author?: number; series?: number; subject?: number
  content?: number; metadata?: string
}
export const EXPOSURE_LIMIT = 100
export function exposureOf(candidate: Candidate): Exposure | null {
  if (!isVisual(candidate.type)) return null
  const year = candidate.publishedAt == null ? undefined : new Date(candidate.publishedAt).getUTCFullYear()
  return {
    type: candidate.type, family: candidate.profile.family,
    content: hash(candidate.key),
    ...(candidate.profile.metadataCluster ? { metadata: candidate.profile.metadataCluster } : {}),
    // Only title-grounded practices: incidental description tags do not establish a format.
    practices: [...new Set(candidate.profile.titlePractices ?? [])].slice(0, 6),
    terms: [...new Set((candidate.profile.titleTokens ?? []).slice(0, 12).map(hash))],
    ...(candidate.profile.pattern ? { pattern: candidate.profile.pattern } : {}),
    ...(candidate.profile.subject?.primary ? { subject: hash(candidate.profile.subject.primary.key) } : {}),
    ...(year != null && Number.isFinite(year) ? { publicationYear: year } : {}),
    ...(candidate.authorKey ? { author: hash(candidate.authorKey) } : {}),
    ...(candidate.seriesKey ? { series: hash(candidate.seriesKey) } : {}),
  }
}
export function appendExposure(history: readonly Exposure[] | undefined, candidate: Candidate): Exposure[] {
  const exposure = exposureOf(candidate)
  return exposure ? [...(history ?? []), exposure].slice(-EXPOSURE_LIMIT) : [...(history ?? [])]
}

const BROAD_PRACTICES = new Set(['cooking', 'singing', 'football', 'gameplay', 'commercial', 'film-trailer', 'home-recording'])
/** One rule for all recognised practices/patterns; no genre-specific rejection list. */
function resemblance(a: Exposure, b: Exposure): number {
  if (a.content != null && a.content === b.content || a.metadata && a.metadata === b.metadata) return 1
  if (a.series != null && a.series === b.series) return 1
  if (a.pattern && a.pattern === b.pattern) return .9
  let commonTerms = 0
  for (const term of a.terms) if (b.terms.includes(term)) commonTerms++
  const lexical = commonTerms >= 2 ? commonTerms / Math.max(2, Math.min(a.terms.length, b.terms.length)) : 0
  const commonPractices = a.practices.filter(p => b.practices.includes(p))
  const practice = commonPractices.some(p => !BROAD_PRACTICES.has(p)) ? .8 : commonPractices.length ? .35 : 0
  // A shared broad family, year or nationality alone never establishes resemblance.
  const subject = a.subject != null && a.subject === b.subject ? .8 : 0
  let score = Math.max(subject, practice, lexical >= .6 ? lexical : 0)
  if (score && a.publicationYear != null && b.publicationYear != null &&
    Math.floor(a.publicationYear / 10) === Math.floor(b.publicationYear / 10)) score = Math.min(1, score + .05)
  return score
}

export function diversityWeights<T>(items: readonly Candidate<T>[], history: readonly Exposure[]): Map<Candidate<T>, number> {
  const recent = history.slice(-EXPOSURE_LIMIT)
  const result = new Map<Candidate<T>, number>()
  const families = new Map<string, number>()
  for (const item of recent.slice(-20)) families.set(item.family, (families.get(item.family) ?? 0) + 1)
  for (const candidate of items) {
    const stamp = exposureOf(candidate)
    if (!stamp || !recent.length) { result.set(candidate, 1); continue }
    let near = 0, accumulated = 0, authorNear = 0
    for (let i = recent.length - 1; i >= 0; i--) {
      const age = recent.length - 1 - i, previous = recent[i]
      const similar = resemblance(stamp, previous)
      if (age < 12) near += similar * (1 - age / 12)
      accumulated += similar * (1 - age / EXPOSURE_LIMIT)
      if (stamp.author != null && stamp.author === previous.author && age < 20) authorNear += 1 - age / 20
    }
    const broadExcess = stamp.family === 'unknown' ? 0 : Math.max(0, (families.get(stamp.family) ?? 0) - 5)
    const longExcess = Math.max(0, accumulated - 4)
    // Positive floor means a sparse catalogue still yields an immediate random choice.
    const weight = 1 / (1 + 2.5 * near + .3 * longExcess ** 2 + 2 * authorNear + .25 * broadExcess ** 2)
    result.set(candidate, Math.max(.03, weight))
  }
  return result
}

function cellOf(candidate: Candidate): string {
  if (candidate.profile.metadataCluster) return `metadata:${candidate.profile.metadataCluster}`
  if (candidate.profile.subject?.primary?.kind === 'entity') return `subject:${candidate.profile.subject.primary.key}`
  if (candidate.profile.pattern) return `pattern:${candidate.profile.pattern}`
  const practices = [...new Set(candidate.profile.titlePractices ?? [])].sort()
  return practices.length ? `practice:${practices.join('|')}` : 'unclassified'
}

/** Item-based lottery with a bounded diversity boost. Averaging the weights of
 * families/cells gave a singleton the same allocation as thousands of items.
 * Smoothing and the shared 8x ceiling prevent that inverse-size amplification.
 * Preference and diversity boosts SHARE the ceiling; they never multiply it. */
export function pickDiverse<T>(items: Candidate<T>[], weights: Map<Candidate<T>, number>, random: Rng,
  preferences: ReadonlyMap<Candidate<T>, number> = new Map()): Candidate<T> | null {
  const families = new Map<string, number>(), cells = new Map<string, number>()
  const keys = new Map<Candidate<T>, string>()
  for (const candidate of items) {
    const family = candidate.profile.family, key = `${family}:${cellOf(candidate)}`
    keys.set(candidate, key)
    families.set(family, (families.get(family) ?? 0) + 1)
    cells.set(key, (cells.get(key) ?? 0) + 1)
  }
  let largest = 1
  for (const candidate of items) largest = Math.max(largest,
    (8 + families.get(candidate.profile.family)!) * (8 + cells.get(keys.get(candidate)!)!))
  return weighted(items, candidate => {
    const size = (8 + families.get(candidate.profile.family)!) * (8 + cells.get(keys.get(candidate)!)!)
    const balance = Math.sqrt(largest / size)
    const preference = Math.max(1, Math.min(8, preferences.get(candidate) ?? 1))
    return (weights.get(candidate) ?? 1) * Math.min(8, balance * preference)
  }, random)
}
