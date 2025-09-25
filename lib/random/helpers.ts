import { buildTagList, mergeKeywordSources } from '@/lib/ingest/extract'
import { CandidateOrigin, SelectionDebugContext, SelectionSkipReason } from './types'

export function shouldPreferFreshContent(window: CandidateOrigin[]): boolean {
  if (window.length < 5) return false
  const fresh = window.filter((v) => v === 'network' || v === 'db-fresh' || v === 'db-unseen').length
  const backlog = window.filter((v) => v === 'db-backlog' || v === 'db-random').length
  return fresh < 3 && backlog >= fresh + 2
}

export function createDebugContext(enabled: boolean, total: number): SelectionDebugContext | null {
  if (!enabled) return null
  return {
    total,
    fallback: false,
    relaxed: false,
    reasons: {
      lowScore: 0,
      globallyRecent: 0,
      allRecent: 0,
      globalTopics: 0,
      providerFatigue: 0,
      preferFresh: 0,
    },
  }
}

export function trackReason(debug: SelectionDebugContext | null, reason: SelectionSkipReason) {
  if (!debug) return
  debug.reasons[reason] += 1
}

export function finalizeDebugSelection(debug: SelectionDebugContext | null, key: string, relaxed: boolean) {
  if (!debug) return
  debug.selected = key
  debug.relaxed = relaxed
}

export function markFallback(debug: SelectionDebugContext | null) {
  if (!debug) return
  debug.fallback = true
}

export function buildImageTags(provider: string, sourceTags: Array<string[] | string | undefined>, description?: string) {
  const tags = buildTagList([provider, ...sourceTags, description].filter(Boolean), 12)
  return tags
}

export function buildKeywords(parts: (string | undefined | null)[], max = 14) {
  return mergeKeywordSources(parts, max)
}
