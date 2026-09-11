import { buildProfile, isStockProvider } from './profile'
import { hash } from './random'
import type { Candidate, Format, Profile, SourceMetadata } from './types'

export type CatalogueRow = Record<string, unknown> & { _id?: unknown; type?: string }
const text = (x: unknown): string | undefined => typeof x === 'string' && x.trim() ? x : undefined
function date(x: unknown): number | undefined {
  const n = x instanceof Date ? x.getTime() : typeof x === 'string' || typeof x === 'number' ? new Date(x).getTime() : NaN
  return Number.isFinite(n) ? n : undefined
}
export function canonicalMediaKey(row: CatalogueRow): string {
  const provider = text(row.provider) ?? 'unknown'
  const id = text(row.videoId)
  if (row.type === 'video' && id) return /^(youtube|reddit-youtube|manual)$/.test(provider) ? `youtube:${id}` : `${provider}:${id.replace(`${provider}:`, '')}`
  if (['quote', 'joke', 'fact'].includes(row.type ?? '')) {
    const quiz = row.quiz as { question?: string } | undefined
    const content = (row.type === 'fact' && row.variant === 'quiz' ? text(quiz?.question) : undefined) ?? text(row.text)
    if (content) {
      const canonical = `${content}|${row.type === 'quote' ? text(row.author) ?? '' : ''}`.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
      return `${row.type}:text:${hash(canonical)}:${hash([...canonical].reverse().join(''))}`
    }
  }
  const url = text(row.url)
  if (url) {
    try {
      const parsed = new URL(url)
      if (row.type === 'video' && /^(www\.|m\.)?(youtu\.be|youtube\.com)$/.test(parsed.hostname)) {
        const ytId = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
        if (ytId) return `youtube:${ytId}`
      }
      // Query strings can identify an image variant; do not strip them blindly.
      parsed.hash = ''
      return `${row.type}:${parsed.href}`
    } catch { /* Fall back to the persisted identity. */ }
  }
  return `${row.type}:${String(row._id ?? '')}`
}
/** Backfill only from a source snapshot. Legacy tags/keywords can contain the search query. */
export function profileFromRow(row: CatalogueRow): Profile {
  const profile = row.discoveryProfile as Profile | undefined
  if (row.discoveryVersion === 2 && profile?.version === 2) return profile
  const source = row.sourceMetadata as SourceMetadata | undefined
  return buildProfile(source ?? {})
}
export function candidateFromRow<T>(row: CatalogueRow, payload: T, now: number): Candidate<T> {
  const provider = text(row.provider) ?? 'unknown'
  const status = row.sourceStatus as { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string } | undefined
  const until = date(row.obsoleteVideoRuntimeBlockedUntil)
  const channel = provider === 'dailymotion' && row.discoveryProvenance === 'legacy-source-fields' ? undefined : text(row.channelId) ?? text(row.creatorId)
  return { key: canonicalMediaKey(row), type: row.type as Format, provider, payload,
    profile: profileFromRow(row), authorKey: channel ? `${provider === 'reddit-youtube' ? 'youtube' : provider}:${channel}` : undefined,
    seriesKey: text(row.verifiedSeriesKey), duplicateKey: text(row.verifiedDuplicateKey),
    stock: isStockProvider(provider, text(row.url)), quiz: row.type === 'fact' && row.variant === 'quiz',
    available: row.obsoleteVideoStatus !== 'obsolete' && (until == null || until <= now) &&
      status?.embeddable !== false && status?.privacyStatus !== 'private' &&
      !['rejected', 'failed', 'deleted'].includes(status?.uploadStatus ?? ''),
    suppressed: row.isSuppressed === true, trendObservedAt: date(row.trendObservedAt),
    publishedAt: date(row.publishedAt), views: typeof row.viewCount === 'number' ? row.viewCount : undefined }
}
