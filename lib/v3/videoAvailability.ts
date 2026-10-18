import { noteBaseYouTubeQuota, permitBaseYouTube } from '@/lib/ingest/youtubeQuota'

/**
 * Server-side confirmation that a YouTube video is really gone or cannot be
 * embedded. One `videos.list` call costs 1 quota unit, so callers must rate
 * their checks (see `app/api/feedback/video-error`).
 */

export type AvailabilityVerdict =
  | { checked: false; reason: 'no-video-id' | 'no-api-key' | 'quota' | 'request-failed' }
  | { checked: true; available: true }
  | { checked: true; available: false; reason: 'not-found' | 'not-embeddable' | 'not-public' | 'age-restricted' }
  /** Plays elsewhere, not in the reporter's country: a fact recorded, never a reason to retire it for everyone. */
  | { checked: true; available: true; regionBlocked: string }

export type YouTubeVideosListResponse = {
  items?: Array<{
    status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string }
    contentDetails?: { contentRating?: { ytRating?: string }; regionRestriction?: { allowed?: string[]; blocked?: string[] } }
  }>
}

/** Extracts the YouTube id from a stored `videoId` or a watch/share URL. */
export function youtubeVideoId(input: { videoId?: unknown; url?: unknown }): string | null {
  const direct = typeof input.videoId === 'string' ? input.videoId.trim() : ''
  if (/^[\w-]{11}$/.test(direct)) return direct

  const url = typeof input.url === 'string' ? input.url.trim() : ''
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const candidate = parsed.pathname.split('/').filter(Boolean)[0] || ''
      return /^[\w-]{11}$/.test(candidate) ? candidate : null
    }
    if (host.endsWith('youtube.com')) {
      const candidate = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || ''
      return /^[\w-]{11}$/.test(candidate) ? candidate : null
    }
  } catch {
    return null
  }
  return null
}

/**
 * `country`: the reporter's (Vercel's x-vercel-ip-country). The same single
 * unit reads the age restriction, which no embed plays anywhere, and the
 * countries the video is kept from.
 */
export async function checkYouTubeAvailability(videoId: string, options: { country?: string | null } = {}): Promise<AvailabilityVerdict> {
  if (!/^[\w-]{11}$/.test(videoId)) return { checked: false, reason: 'no-video-id' }

  const apiKey = (process.env.YOUTUBE_API_KEY || '').trim()
  if (!apiKey) return { checked: false, reason: 'no-api-key' }

  const params = new URLSearchParams({ key: apiKey, part: 'status,contentDetails', id: videoId })
  const endpoint = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`

  if (!(await permitBaseYouTube(endpoint))) {
    return { checked: false, reason: 'quota' }
  }

  try {
    const response = await fetch(endpoint, { cache: 'no-store' })
    if (!response.ok) {
      await noteBaseYouTubeQuota(endpoint, response.status, await response.text().catch(() => ''))
      return { checked: false, reason: 'request-failed' }
    }
    const payload = (await response.json()) as YouTubeVideosListResponse
    return youtubeVerdict(payload, options.country)
  } catch {
    return { checked: false, reason: 'request-failed' }
  }
}

/** What one `videos.list` answer says of an embed: pure, so it can be read on recorded answers. */
export function youtubeVerdict(payload: YouTubeVideosListResponse, country?: string | null): AvailabilityVerdict {
  const status = payload.items?.[0]?.status
  if (!status) return { checked: true, available: false, reason: 'not-found' }
  if (status.privacyStatus && status.privacyStatus !== 'public') {
    return { checked: true, available: false, reason: 'not-public' }
  }
  if (status.embeddable === false) {
    return { checked: true, available: false, reason: 'not-embeddable' }
  }
  const details = payload.items?.[0]?.contentDetails
  if (details?.contentRating?.ytRating === 'ytAgeRestricted') {
    return { checked: true, available: false, reason: 'age-restricted' }
  }
  const where = typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null
  const restriction = details?.regionRestriction
  if (where && restriction && (restriction.blocked?.includes(where) || (Array.isArray(restriction.allowed) && !restriction.allowed.includes(where)))) {
    return { checked: true, available: true, regionBlocked: where }
  }
  return { checked: true, available: true }
}
