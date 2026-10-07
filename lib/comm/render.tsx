/**
 * From a template and what goes in it to the element tree Satori draws:
 * the media, the bands, the logo and icons, the text fitted to its lines,
 * the credit and the source that every slide carries, and the glitch when
 * asked. The same tree, without the media, is the overlay a video gets.
 */

// React stays in scope for the classic JSX transform the tests run with; Next uses the automatic one.
import React, { type ReactElement, type CSSProperties } from 'react'

import { fitText, type ColorToken, type Layer, type Template, FAMILY_SIZES } from './templates'
import { iconDataUri, logoDataUri, LOGO_SIZES, ICON_RATIO, resolveColor, type Palette } from './brand'

export type RenderInput = {
  template: Template
  palette: Palette
  /** The logo's colour on this slide, black or white (the site's deep and cream). */
  logo: 'black' | 'white'
  text: string
  credit: string
  source: string
  /** The picture as a data URI or a reachable URL; null for the overlay of a video or when it could not be fetched. */
  media: string | null
  mediaSize: { width: number; height: number } | null
  /** 'full' draws everything; 'overlay' leaves the media out on a transparent canvas. */
  mode: 'full' | 'overlay'
  /** 0 keeps the template's own intensity; otherwise overrides it. */
  glitch: number | null
  seed: string
}

export type RenderOutput = { element: ReactElement; width: number; height: number; truncated: boolean; textSize: number }

/** A small deterministic generator, so a slide looks the same twice. */
export function rng(seed: string): () => number {
  let h = 2166136261
  for (const char of seed) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619) }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: 'absolute', left, top, width, ...(height !== undefined ? { height } : {}), display: 'flex' })

export async function buildSlide(input: RenderInput): Promise<RenderOutput> {
  const { template, palette } = input
  const { width, height } = FAMILY_SIZES[template.family]
  const scale = width / 1080
  const color = (token: ColorToken) => resolveColor(token, palette)
  const logoColor = input.logo === 'black' ? palette.deep : palette.cream
  const children: ReactElement[] = []
  let truncated = false, textSize = 0
  const random = rng(input.seed)

  // The media's frame: the whole canvas, or the band a framed template leaves it.
  const mediaLayer = template.layers.find((layer): layer is Extract<Layer, { type: 'media' }> => layer.type === 'media')
  const mediaTop = Math.round((mediaLayer?.top ?? 0) * height), mediaHeight = Math.round((mediaLayer?.height ?? 1) * height)

  for (const [index, layer] of template.layers.entries()) {
    const key = `${layer.type}-${index}`
    switch (layer.type) {
      case 'media': {
        if (input.mode !== 'full' || !input.media) break
        children.push(
          <div key={key} style={{ ...abs(0, mediaTop, width, mediaHeight), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: layer.opacity ?? 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain pictures */}
            <img src={input.media} alt="" width={width} height={mediaHeight} style={{ width, height: mediaHeight, objectFit: layer.fit }} />
          </div>,
        )
        break
      }
      case 'band': {
        const bandHeight = Math.round(layer.height * height)
        children.push(<div key={key} style={{ ...abs(0, layer.position === 'top' ? 0 : height - bandHeight, width, bandHeight), background: color(layer.color) }} />)
        break
      }
      case 'gradient': {
        const top = Math.round((layer.top ?? 0) * height), h = Math.round((layer.height ?? 1) * height)
        children.push(<div key={key} style={{ ...abs(0, top, width, h), backgroundImage: `linear-gradient(${layer.direction}, ${color(layer.from)}, ${color(layer.to)})` }} />)
        break
      }
      case 'logo': {
        const uri = await logoDataUri(layer.variant, layer.color === 'auto' ? logoColor : color(layer.color))
        if (!uri) break
        const size = LOGO_SIZES[layer.variant]
        const w = Math.round(layer.width * width), h = Math.round(w * size.height / size.width)
        children.push(
          <div key={key} style={abs(Math.round(layer.x * width), Math.round(layer.y * height), w, h)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the logo composed from its letters */}
            <img src={uri} alt="Random" width={w} height={h} style={{ width: w, height: h }} />
          </div>,
        )
        break
      }
      case 'icon': {
        const uri = await iconDataUri(layer.name, color(layer.color))
        if (!uri) break
        const w = Math.round(layer.width * width), h = Math.round(w * ICON_RATIO)
        children.push(
          <div key={key} style={abs(Math.round(layer.x * width), Math.round(layer.y * height), w, h)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- one of the site's icons */}
            <img src={uri} alt="" width={w} height={h} style={{ width: w, height: h }} />
          </div>,
        )
        break
      }
      case 'text': {
        if (!input.text.trim()) break
        const maxWidthPx = Math.round(layer.maxWidth * width)
        const fitted = fitText(input.text, { font: layer.font, size: Math.round(layer.size * scale), maxWidthPx, lines: layer.lines, uppercase: layer.uppercase })
        truncated = truncated || fitted.truncated; textSize = fitted.size
        children.push(
          <div key={key} style={{ ...abs(Math.round(layer.x * width), Math.round(layer.y * height), maxWidthPx), flexDirection: 'column', alignItems: layer.align === 'center' ? 'center' : layer.align === 'right' ? 'flex-end' : 'flex-start', fontFamily: layer.font, fontWeight: layer.weight, fontSize: fitted.size, lineHeight: 1.1, color: color(layer.color) }}>
            {fitted.lines.map((line, i) => <div key={i} style={{ display: 'flex', whiteSpace: 'nowrap' }}>{line}</div>)}
          </div>,
        )
        break
      }
      case 'credit':
      case 'source': {
        const value = layer.type === 'credit' ? input.credit : input.source
        if (!value.trim()) break
        const maxWidthPx = Math.round(layer.maxWidth * width)
        const fitted = fitText(value, { font: layer.font, size: Math.round(layer.size * scale), maxWidthPx, lines: 1 })
        children.push(
          <div key={key} style={{ ...abs(Math.round(layer.x * width), Math.round(layer.y * height), maxWidthPx), justifyContent: layer.align === 'center' ? 'center' : layer.align === 'right' ? 'flex-end' : 'flex-start', fontFamily: layer.font, fontWeight: layer.type === 'credit' ? 700 : 400, fontSize: fitted.size, color: color(layer.color), whiteSpace: 'nowrap' }}>
            {fitted.lines[0] ?? ''}
          </div>,
        )
        break
      }
      case 'glitch': {
        const intensity = input.glitch ?? layer.intensity
        if (intensity <= 0) break
        children.push(...glitchPieces(input, intensity, random, width, height, mediaTop, mediaHeight))
        break
      }
    }
  }

  const element = (
    <div style={{ position: 'relative', width, height, display: 'flex', overflow: 'hidden', background: input.mode === 'full' ? palette.bg : 'transparent' }}>
      {children}
    </div>
  )
  return { element, width, height, truncated, textSize }
}

/**
 * The Random page's glitch, one frame of it: lines in the theme's inks, a few
 * whole pieces of the picture shifted sideways with a thin cream edge; calm,
 * normal or rich with the intensity; never on the credit's line.
 */
function glitchPieces(input: RenderInput, intensity: number, random: () => number, width: number, height: number, mediaTop: number, mediaHeight: number): ReactElement[] {
  const { palette } = input
  const inks = [palette.accent, palette.cream, palette.deep, palette.accent]
  const out: ReactElement[] = []
  // The lines and pieces stay clear of the credit's zone, the bottom sixth, and of the logo's, the top tenth.
  const zoneTop = Math.round(height * 0.1), zoneBottom = Math.round(height * 0.84)
  const lines = Math.round(3 + intensity * 9)
  for (let i = 0; i < lines; i += 1) {
    const top = Math.round(zoneTop + random() * (zoneBottom - zoneTop))
    const h = Math.max(2, Math.round((1 + random() * 5) * intensity * (width / 1080)))
    const ink = inks[Math.floor(random() * inks.length)]
    const left = Math.round(random() * width * 0.4), w = Math.round(width * (0.3 + random() * 0.7))
    out.push(<div key={`gl-${i}`} style={{ ...abs(left, top, w, h), backgroundImage: `linear-gradient(90deg, transparent, ${ink} 16%, ${palette.cream}80 46%, ${ink} 70%, transparent)`, opacity: 0.55 + random() * 0.35 }} />)
  }
  if (input.mode === 'full' && input.media) {
    const pieces = Math.round(1 + intensity * 4)
    for (let i = 0; i < pieces; i += 1) {
      const big = random() < 0.2 * intensity + 0.05
      const pw = Math.round(width * (big ? 0.18 + random() * 0.14 : 0.06 + random() * 0.14))
      const ph = Math.round(height * (big ? 0.03 + random() * 0.02 : 0.008 + random() * 0.02))
      const low = Math.max(mediaTop, zoneTop), high = Math.min(mediaTop + mediaHeight, zoneBottom) - ph
      if (high <= low) continue
      const top = Math.round(low + random() * (high - low))
      const left = Math.round(random() * (width - pw))
      const shift = Math.round((random() - 0.5) * width * 0.08)
      out.push(
        <div key={`gp-${i}`} style={{ ...abs(left, top, pw, ph), overflow: 'hidden', opacity: 0.6 + random() * 0.3, borderTop: `1px solid ${palette.cream}`, borderBottom: `1px solid ${palette.cream}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a piece of the picture */}
          <img src={input.media} alt="" width={width} height={mediaHeight} style={{ position: 'absolute', left: -left + shift, top: -(top - mediaTop), width, height: mediaHeight, objectFit: 'cover' }} />
        </div>,
      )
    }
  }
  return out
}
