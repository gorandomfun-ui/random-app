/**
 * Whether a site's own preview image is good enough to stand for it: the same
 * rule as the web ingest (app/api/ingest/web/route.ts) — big enough, not a
 * strip, not a logo of a few kilobytes, a real picture format.
 */

import probe from 'probe-image-size'

const MIN_WIDTH = 500
const MIN_HEIGHT = 280
const MIN_AREA = 150_000
const MIN_BYTES = 15_000
const MIN_RATIO = 0.35
const MAX_RATIO = 3.2
const PICTURE_TYPES = new Set(['jpg', 'png', 'gif', 'webp', 'avif'])

export function acceptablePreview(image: { width?: number; height?: number; type?: string; length?: number }): boolean {
  const { width = 0, height = 0 } = image
  if (!width || !height || width < MIN_WIDTH || height < MIN_HEIGHT || width * height < MIN_AREA) return false
  const ratio = width / height
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return false
  if (image.type && !PICTURE_TYPES.has(image.type)) return false
  const length = Number(image.length || 0)
  return !(Number.isFinite(length) && length > 0 && length < MIN_BYTES)
}

export async function probePreview(url: string): Promise<{ url: string; width: number; height: number } | null> {
  try {
    const result = await probe(url, { timeout: 6000 })
    if (!acceptablePreview(result)) return null
    return { url: typeof result.url === 'string' && result.url.startsWith('http') ? result.url : url, width: result.width, height: result.height }
  } catch {
    return null
  }
}
