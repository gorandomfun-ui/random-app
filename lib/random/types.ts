export type ItemType = 'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'
export type VideoPool = 'trending' | 'fresh' | 'retro' | 'retro-ad'
export type RandomSelectOptions = {
  strong?: boolean
  videoPool?: VideoPool
  lang?: 'en' | 'fr' | 'de' | 'es' | 'jp' | 'unknown'
}
export type CandidateOrigin = 'db-fresh' | 'db-unseen' | 'db-backlog' | 'db-random' | 'network'

export type SelectionSkipReason = 'lowScore' | 'globallyRecent' | 'allRecent' | 'globalTopics' | 'providerFatigue' | 'preferFresh'

export type SelectionDebugContext = {
  total: number
  fallback: boolean
  relaxed: boolean
  selected?: string
  reasons: Record<SelectionSkipReason, number>
}
