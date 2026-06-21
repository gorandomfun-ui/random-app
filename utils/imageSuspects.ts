import type { ImageItem } from '@/lib/random/clientTypes'

type ReportableImageItem = Partial<ImageItem> & {
  type?: unknown
  _id?: unknown
}

const reportedThisSession = new Set<string>()
const SESSION_TTL_MS = 60 * 60 * 1000

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getSourceUrl(item: ReportableImageItem): string | null {
  const source = item.source
  if (!source || typeof source !== 'object') return null
  return cleanString(source.url)
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
