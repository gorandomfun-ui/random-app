/** V2 profiles use source metadata only. Never pass search terms or public feedback. */
export const PROFILE_VERSION = 2 as const
export type Format = 'video' | 'image' | 'quote' | 'joke' | 'fact' | 'web'
export type Visual = 'video' | 'image'
export type SourceMetadata = {
  title?: string
  description?: string
  tags?: string[]
  language?: string
  /** Explicit, verified identifiers only; not inferred from a query. */
  entities?: string[]
  /** Optional trusted source annotation; never populated from a search query. */
  primarySubject?: import('./subjects').SubjectHint
  /** Unverified legacy fields cannot establish strong semantic relations. */
  legacyUnverified?: boolean
  category?: string
}
export type Profile = {
  version: typeof PROFILE_VERSION
  /** Matching revision, independent of the persisted catalogue schema version. */
  signalVersion?: number
  sourceRevision?: string
  titleTokens?: string[]
  titlePractices?: string[]
  subject?: import('./subjects').SubjectAnalysis
  /** Conservative classification for session repetition, never a verified series ID. */
  pattern?: string
  metadataQuality?: 'usable' | 'sparse' | 'unverified'
  metadataCluster?: string
  tokens: string[]
  entities: string[]
  practices: string[]
  themes: string[]
  family: string
  evidence: 'described' | 'unknown'
}
export type Candidate<T = unknown> = {
  key: string
  type: Format
  provider: string
  profile: Profile
  payload: T
  authorKey?: string
  /** Only populate from an actual series identifier, not a shared adjective. */
  seriesKey?: string
  duplicateKey?: string
  stock: boolean
  /** True only for ordinary news/radio/live programming; humorous exceptions stay false. */
  routineEditorial?: boolean
  quiz?: boolean
  available: boolean
  suppressed?: boolean
  trendObservedAt?: number
  publishedAt?: number
  views?: number
  /** Assigned server-side from active owner references, never from public likes. */
  editorialFamilies?: string[]
  directEditorialReference?: boolean
}
export type Seen = Pick<Candidate, 'key' | 'type' | 'authorKey' | 'seriesKey' | 'duplicateKey' | 'stock'> & { family: string; pattern?: string }
export function isVisual(type: Format): type is Visual { return type === 'video' || type === 'image' }
export function seenOf(c: Candidate): Seen {
  return { key: c.key, type: c.type, authorKey: c.authorKey, seriesKey: c.seriesKey,
    duplicateKey: c.duplicateKey, stock: c.stock, family: c.profile.family, pattern: c.profile.pattern }
}
