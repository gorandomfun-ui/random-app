/**
 * The PNG of a slide: Satori and resvg, as next/og ships them, with the site's
 * typefaces. The picture to show is fetched here with a short wait and a size
 * cap, then embedded; a picture that does not come leaves a plain band, never
 * a 500.
 */

import { ImageResponse } from 'next/og'

import { loadFonts } from './brand'
import { buildSlide, type RenderInput, type RenderOutput } from './render'
import { imageSizeOf } from './imageSize'

export const MEDIA_FETCH_MS = 6000
export const MEDIA_FETCH_MAX = 25 * 1024 * 1024

/** A picture as a data URI the renderer can embed, or null when it will not come in time or is not a picture. */
export async function pictureDataUri(url: string | null): Promise<{ uri: string; size: { width: number; height: number } | null } | null> {
  if (!url) return null
  if (url.startsWith('data:image/')) return { uri: url, size: null }
  if (!/^https?:\/\//i.test(url)) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MEDIA_FETCH_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'image/*' } })
    if (!response.ok) return null
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type)) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!bytes.byteLength || bytes.byteLength > MEDIA_FETCH_MAX) return null
    return { uri: `data:${type};base64,${Buffer.from(bytes).toString('base64')}`, size: imageSizeOf(bytes) }
  } catch { return null } finally { clearTimeout(timer) }
}

export type SlidePng = { png: ArrayBuffer; width: number; height: number; truncated: boolean; textSize: number }

export async function renderSlidePng(input: RenderInput): Promise<SlidePng> {
  const built: RenderOutput = await buildSlide(input)
  const fonts = await loadFonts()
  const response = new ImageResponse(built.element, { width: built.width, height: built.height, fonts: fonts.map((font) => ({ name: font.name, data: font.data, weight: font.weight, style: font.style })) })
  return { png: await response.arrayBuffer(), width: built.width, height: built.height, truncated: built.truncated, textSize: built.textSize }
}
