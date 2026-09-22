import type { ImageItem } from '@/lib/random/clientTypes'

type ReportableImageItem = Partial<ImageItem> & {
  type?: unknown
  _id?: unknown
}

export type ImageLoadIssue = { reason: 'image-load-error' | 'image-load-timeout' }

const reportedThisSession = new Set<string>()
const blockedThisSession = new Set<string>()
const SESSION_TTL_MS = 60 * 60 * 1000

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getSourceUrl(item: ReportableImageItem): string | null {
  const source = item.source
  if (!source || typeof source !== 'object') return null
  return cleanString(source.url)
}

function itemKey(item: ReportableImageItem | null | undefined): string | null {
  if (!item || item.type !== 'image') return null
  return cleanString(item._id) || cleanString(item.url)
}

/** An image that failed once is not shown again in this session, whatever the draw. */
export function blockImageForSession(item: ReportableImageItem | null | undefined) {
  const key = itemKey(item)
  if (!key) return
  blockedThisSession.add(key)
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(`random-image-blocked:${key}`, String(Date.now()))
  } catch {
    /* The in-memory block remains enough for this page. */
  }
}

export function isImageBlockedThisSession(item: ReportableImageItem | null | undefined): boolean {
  const key = itemKey(item)
  if (!key) return false
  if (blockedThisSession.has(key)) return true
  if (typeof window === 'undefined') return false
  try {
    const timestamp = Number(window.sessionStorage.getItem(`random-image-blocked:${key}`) || 0)
    if (timestamp && Date.now() - timestamp < SESSION_TTL_MS) {
      blockedThisSession.add(key)
      return true
    }
  } catch {
    /* Ignore storage failures. */
  }
  return false
}

export function reportImageLoadIssue(
  item: ReportableImageItem | null | undefined,
  reason = 'image-load-error',
  failedUrl?: string,
) {
  if (!item || item.type !== 'image') return
  if (typeof window === 'undefined') return

  const itemId = cleanString(item._id)
  const canonicalUrl = cleanString(item.url) || cleanString(failedUrl) || cleanString(item.thumbUrl)
  const failedImageUrl = cleanString(failedUrl) || canonicalUrl
  const key = itemId || canonicalUrl
  if (!key || reportedThisSession.has(key)) return
  blockImageForSession(item)

  const now = Date.now()
  try {
    const storageKey = `random-image-suspect:${key}`
    const previous = Number(window.sessionStorage.getItem(storageKey) || 0)
    if (previous && now - previous < SESSION_TTL_MS) {
      reportedThisSession.add(key)
      return
    }
    window.sessionStorage.setItem(storageKey, String(now))
  } catch {
    /* sessionStorage is optional; reporting should never affect rendering. */
  }

  reportedThisSession.add(key)

  const payload = {
    itemId,
    url: canonicalUrl,
    failedUrl: failedImageUrl,
    provider: cleanString(item.provider),
    reason,
    sourceUrl: getSourceUrl(item) || cleanString(item.pageUrl) || cleanString(item.link),
  }

  try {
    void fetch('/api/feedback/image-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    /* Fire-and-forget: never block or break the user experience. */
  }
}
