import { buildProfile } from '../discovery/profile'
import type { Profile, SourceMetadata } from '../discovery/types'

export type DiscoveryVideoFields = {
  sourceMetadata: SourceMetadata
  discoveryProfile: Profile
  discoveryFamily: string
  discoveryVersion: 2
  discoveryQueries: string[]
  metadataRefreshedAt: Date
  publishedAt?: Date
  trendObservedAt?: Date
  statsObservedAt?: Date
  viewCount?: number
  sourceStatus?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string }
}
export function validDate(value?: string | Date): Date | undefined {
  if (value == null) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}
export function videoDiscoveryFields(raw: {
  provider: string; title?: string; description?: string; apiTags?: string[]; contextQueries?: string[];
  publishedAt?: string | Date; trendObservedAt?: Date; viewCount?: number;
  statsObservedAt?: Date; sourceStatus?: DiscoveryVideoFields['sourceStatus']
}, now = new Date()): DiscoveryVideoFields {
  // A Reddit post title is not the video's source metadata. Keep it in the legacy display fields only.
  const sourceMetadata: SourceMetadata = raw.provider === 'reddit-youtube' ? {} : {
    title: raw.title ?? '', description: raw.description ?? '', tags: raw.apiTags ?? [] }
  const profile = buildProfile(sourceMetadata)
  const publishedAt = validDate(raw.publishedAt), trendObservedAt = validDate(raw.trendObservedAt)
  const statsObservedAt = validDate(raw.statsObservedAt)
  return { sourceMetadata, discoveryProfile: profile, discoveryFamily: profile.family, discoveryVersion: 2,
    discoveryQueries: [...new Set(raw.contextQueries ?? [])].slice(0, 24), metadataRefreshedAt: now,
    ...(publishedAt ? { publishedAt } : {}), ...(trendObservedAt ? { trendObservedAt } : {}),
    ...(statsObservedAt ? { statsObservedAt } : {}),
    ...(raw.viewCount != null && Number.isFinite(raw.viewCount) && raw.viewCount >= 0 ? { viewCount: raw.viewCount } : {}),
    ...(raw.sourceStatus ? { sourceStatus: raw.sourceStatus } : {}) }
}
