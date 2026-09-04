import type { VideoItem } from '@/lib/random/clientTypes'

export type VideoPlaybackIssue = {
  reason: 'video-load-timeout' | 'video-error' | 'youtube-player-error'
  playerCode?: number
}

const reportedThisSession = new Set<string>()
const SESSION_TTL_MS = 60 * 60 * 1000

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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
