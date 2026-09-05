import type { VideoItem } from '@/lib/random/clientTypes'

export type VideoPlaybackIssue = {
  reason: 'video-load-timeout' | 'video-error' | 'youtube-player-error' | 'dailymotion-player-error'
  playerCode?: number
}

const reportedThisSession = new Set<string>()
const blockedThisSession = new Set<string>()
const SESSION_TTL_MS = 60 * 60 * 1000

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function itemKey(item: Partial<VideoItem> | null | undefined): string | null {
  if (!item || item.type !== 'video') return null
  return cleanString(item._id) || cleanString(item.url)
}

export function blockVideoForSession(item: Partial<VideoItem> | null | undefined) {
  const key = itemKey(item)
  if (!key) return
  blockedThisSession.add(key)
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(`random-video-blocked:${key}`, String(Date.now()))
  } catch {
    /* The in-memory block remains enough for this page. */
  }
}

export function isVideoBlockedThisSession(item: Partial<VideoItem> | null | undefined): boolean {
  const key = itemKey(item)
  if (!key) return false
  if (blockedThisSession.has(key)) return true
  if (typeof window === 'undefined') return false
  try {
    const timestamp = Number(window.sessionStorage.getItem(`random-video-blocked:${key}`) || 0)
    if (timestamp && Date.now() - timestamp < SESSION_TTL_MS) {
      blockedThisSession.add(key)
      return true
    }
  } catch {
    /* Ignore storage failures. */
  }
  return false
}

export function reportVideoPlaybackIssue(
  item: Partial<VideoItem> | null | undefined,
  issue: VideoPlaybackIssue,
) {
  if (!item || item.type !== 'video' || typeof window === 'undefined') return

  const itemId = cleanString(item._id)
  const url = cleanString(item.url)
  const key = itemId || url
  if (!key || reportedThisSession.has(key)) return
  blockVideoForSession(item)

  const now = Date.now()
  try {
    const storageKey = `random-video-suspect:${key}`
    const previous = Number(window.sessionStorage.getItem(storageKey) || 0)
    if (previous && now - previous < SESSION_TTL_MS) {
      reportedThisSession.add(key)
      return
    }
    window.sessionStorage.setItem(storageKey, String(now))
  } catch {
    /* Reporting must never affect playback. */
  }

  reportedThisSession.add(key)
  const payload = {
    itemId,
    url,
    provider: cleanString(item.provider),
    sourceUrl: cleanString(item.source?.url),
    reason: issue.reason,
    playerCode: typeof issue.playerCode === 'number' ? issue.playerCode : null,
  }

  try {
    void fetch('/api/feedback/video-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    /* Fire-and-forget: playback recovery continues locally. */
  }
}
