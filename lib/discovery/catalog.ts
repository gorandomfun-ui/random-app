import { buildProfile, isStockProvider, SIGNAL_VERSION } from './profile'
import { hash } from './random'
import { legacySourceSnapshot } from './backfill'
import type { Candidate, Format, Profile } from './types'
import { isOrdinaryRoutineVideo } from '../random/videoEditorial'

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
      // Provider IDs identify the work; delivery parameters only identify encodings/tracking.
      if (row.type === 'image' && /(^|\.)giphy\.com$/i.test(parsed.hostname)) {
        const media = parsed.pathname.match(/\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]+)(?:\/|$)/)
        const page = parsed.pathname.match(/\/(?:gifs|stickers)\/(?:.*-)?([A-Za-z0-9]+)\/?$/)
        const gifId = media?.[1] ?? page?.[1]
        if (gifId) return `giphy:${gifId}`
      }
      if (row.type === 'image' && /(^|\.)tenor\.com$/i.test(parsed.hostname)) {
        const pageId = parsed.pathname.match(/^\/view\/.*-([0-9]+)\/?$/)?.[1]
        if (pageId) return `tenor:${pageId}`
        // CDN IDs differ between GIF/MP4: only strip the known rendition segment.
        const mediaId = /^(?:media[0-9]*|c)\.tenor\.com$/i.test(parsed.hostname)
          ? parsed.pathname.match(/^\/([^/]+)\/[^/]+$/)?.[1] : undefined
        if (mediaId) return `tenor-media:${mediaId}`
      }
      // Preserve query strings for unknown providers: they can identify distinct images.
      parsed.hash = ''
      return `${row.type}:${parsed.href}`
    } catch { /* Fall back to the persisted identity. */ }
  }
  return `${row.type}:${String(row._id ?? '')}`
}
/** Backfill only from a source snapshot. Legacy tags/keywords can contain the search query. */
export function profileFromRow(row: CatalogueRow): Profile {
  const profile = row.discoveryProfile as Profile | undefined
  if (row.discoveryVersion === 2 && profile?.version === 2 && profile.signalVersion === SIGNAL_VERSION) return profile
  // Bounded read-time refresh only: no writes, no provider calls, no catalogue-wide migration.
  return buildProfile(legacySourceSnapshot(row))
}
export function candidateFromRow<T>(row: CatalogueRow, payload: T, now: number): Candidate<T> {
  const provider = text(row.provider) ?? 'unknown'
  const status = row.sourceStatus as { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string } | undefined
  const until = date(row.obsoleteVideoRuntimeBlockedUntil)
  const channel = provider === 'dailymotion' && row.discoveryProvenance === 'legacy-source-fields' ? undefined : text(row.channelId) ?? text(row.creatorId)
  const routineEditorial = row.type === 'video' && (row.editorialRoutine === true || isOrdinaryRoutineVideo({
    title: text(row.title) ?? text(row.text),
    description: text(row.description),
    channelTitle: text(row.channelTitle),
    categoryId: text(row.categoryId),
    liveBroadcastContent: text(row.liveBroadcastContent),
  }))
  return { key: canonicalMediaKey(row), type: row.type as Format, provider, payload,
    profile: profileFromRow(row), authorKey: channel ? `${provider === 'reddit-youtube' ? 'youtube' : provider}:${channel}` : undefined,
    seriesKey: text(row.verifiedSeriesKey), duplicateKey: text(row.verifiedDuplicateKey),
    stock: isStockProvider(provider, text(row.url)), routineEditorial, quiz: row.type === 'fact' && row.variant === 'quiz',
    available: row.obsoleteVideoStatus !== 'obsolete' && (until == null || until <= now) &&
      status?.embeddable !== false && status?.privacyStatus !== 'private' &&
      !['rejected', 'failed', 'deleted'].includes(status?.uploadStatus ?? ''),
    suppressed: row.isSuppressed === true, trendObservedAt: date(row.trendObservedAt),
    publishedAt: date(row.publishedAt), views: typeof row.viewCount === 'number' ? row.viewCount : undefined }
}
