/**
 * What RANDOM RACING's road is drawn with: the colours taken from the
 * owner's picture, as the evening goes (sunset, dusk, night, the storm) and
 * fading into the haze with the distance; the far view for each hour; the
 * ground along each kind of road; the rails, the cliff's rock and the
 * tunnel's; what stands by the road and lies on it; the cars, three ways
 * each, with their shadows. `racing-play.ts` puts them in place.
 */

import { racingArt, type RacingArtName, type RacingCarKind } from './racing-art'
import type { RacingZone } from './racing-rules'
import { drawText7, mix, PixelBuffer, rgbOf, text7Width } from './pixels'
import { CREAM, INK } from './ui'

export type RGB = readonly [number, number, number]
export type Tier = 0 | 1 | 2 | 3

// ---------------------------------------------------------------- the colours

const hex = (c: string): RGB => rgbOf(c)
const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const times = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k]

/** The ground's colours in the picture's light, by name. */
const BASE = {
  tar0: '#252645', tar1: '#2b2b4a', line: '#d5bca5', kerb0: '#f99259', kerb1: '#d8744a',
  sand0: '#f0a07a', sand1: '#e48e6c', wet: '#b9707a', foam: '#fbe6d8',
  sea0: '#0998b1', sea1: '#047ba5', sea2: '#13b0c4', deep: '#06628e', glint: '#d8faff',
  grass0: '#3f7a4a', grass1: '#356a42', bush0: '#1f4a3a', bush1: '#26573f',
  pave0: '#c9a59a', pave1: '#b8948c', wall: '#8c7086',
  rock0: '#5a2e5e', rock1: '#4a2652', rockLit: '#7a3e6e', rockDark: '#32193c',
  stone0: '#a08a96', stone1: '#8e7886',
  walk: '#3a3448', tunnel0: '#2c2638', tunnel1: '#241f30', ceiling: '#1c1828', light: '#fff0c0',
  land: '#3a4a52',
} as const
export type Colour = keyof typeof BASE
const NAMES = Object.keys(BASE) as Colour[]

/** How each hour turns a colour: the dusk deeper and violet, the night dark blue, the storm dark grey-blue. */
function hour(c: RGB, tier: Tier): RGB {
  if (tier === 0) return c
  if (tier === 1) return lerp(times(c, 0.8), hex('#4a2a6a'), 0.18)
  if (tier === 2) return lerp(times(c, 0.56), hex('#141436'), 0.26)
  const grey = (c[0] + c[1] + c[2]) / 3
  return lerp(times(lerp(c, [grey, grey, grey], 0.35), 0.5), hex('#1c2030'), 0.3)
}
/** The haze far off, for each hour: the sunset's pink, the dusk's violet, the night's blue, the storm's grey. */
export const HAZE: Record<Tier, RGB> = { 0: hex('#e8768a'), 1: hex('#5e3a7c'), 2: hex('#1a1a42'), 3: hex('#2a2e3e') }
/** How much haze at the far end of the road, for each hour. */
const HAZE_MAX: Record<Tier, number> = { 0: 0.62, 1: 0.7, 2: 0.82, 3: 0.88 }

/** Sixteen steps of haze, for each hour, each colour: worked out once. */
export const FOG_STEPS = 16
const palettes = new Map<Tier, RGB[][]>()
export function palette(tier: Tier): RGB[][] {
  let p = palettes.get(tier)
  if (!p) {
    p = Array.from({ length: FOG_STEPS }, (_, f) => NAMES.map((n) => lerp(hour(hex(BASE[n]), tier), HAZE[tier], (f / (FOG_STEPS - 1)) * HAZE_MAX[tier]).map(Math.round) as unknown as RGB))
    palettes.set(tier, p)
  }
  return p
}
export const colourIndex = Object.fromEntries(NAMES.map((n, i) => [n, i])) as Record<Colour, number>
/** The haze's step for a distance ahead, in half widths of the road. */
export const fogStep = (z: number, far: number): number => Math.max(0, Math.min(FOG_STEPS - 1, Math.round(Math.pow(Math.max(0, (z - 3) / far), 1.25) * (FOG_STEPS - 1))))
/** A colour by name at an hour and a haze step, as '#rrggbb'. */
const hexOf = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
export const shade = (name: Colour, tier: Tier, fog: number): string => hexOf(palette(tier)[fog][colourIndex[name]])

/** A number from 0 to 1 for a pixel, always the same. */
export const grain = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

// ---------------------------------------------------------------- the far view

const views = new Map<string, PixelBuffer | null>()
/**
 * The picture's far view at an hour: as it is at sunset; at dusk deeper and
 * violet; at night the sun gone under, a moon, stars, the city's lights still
 * on; in the storm darker still and grey, no stars.
 */
export function farViewAt(tier: Tier): PixelBuffer | null {
  const key = String(tier)
  if (views.has(key) && views.get(key)) return views.get(key)!
  const back = racingArt('playBack')
  if (!back) return null
  const out = new PixelBuffer(back.width, back.height)
  out.data.set(back.data)
  const W = out.width, H = out.height, d = out.data
  const lit = (o: number) => 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]
  if (tier >= 2) {
    // the sun gone: each of its rows filled from the sky beside it
    const sunny = (o: number) => d[o] > 215 && d[o + 1] > 140 && d[o + 2] < 150
    for (let y = 0; y < H - 8; y += 1) {
      const row = y * W * 4
      let x = 0
      while (x < Math.min(W, 230)) {
        if (!sunny(row + x * 4)) { x += 1; continue }
        let e = x
        while (e < W && sunny(row + e * 4)) e += 1
        const a = Math.max(0, x - 3), b = Math.min(W - 1, e + 2)
        for (let k = x; k < e; k += 1) { const t = (k - a) / Math.max(1, b - a); for (let c = 0; c < 3; c += 1) d[row + k * 4 + c] = d[row + a * 4 + c] + (d[row + b * 4 + c] - d[row + a * 4 + c]) * t }
        x = e
      }
    }
  }
  if (tier > 0) {
    const sky = tier === 1 ? hex('#3a1a5a') : tier === 2 ? hex('#0a0a2a') : hex('#1a1e2c')
    const keep = tier === 1 ? 0.78 : tier === 2 ? 0.5 : 0.42
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4
      // the city's lights low down stay lit after dark
      const light = tier >= 2 && y > H * 0.62 && lit(o) > 175
      if (light) continue
      const c = lerp(times([d[o], d[o + 1], d[o + 2]], keep), sky, tier === 1 ? 0.3 : 0.45)
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]
    }
  }
  if (tier === 2) {
    // stars, and the moon over the sea
    for (let k = 0; k < 70; k += 1) { const x = Math.floor(grain(k, 3) * W), y = 4 + Math.floor(grain(k, 7) * H * 0.5); const o = (y * W + x) * 4; const b = 150 + grain(k, 11) * 100; d[o] = b; d[o + 1] = b; d[o + 2] = b + 10 }
    const mx = 92, my = 34, r = 13
    for (let y = -r - 6; y <= r + 6; y += 1) for (let x = -r - 6; x <= r + 6; x += 1) {
      const q = Math.hypot(x, y), o = ((my + y) * W + mx + x) * 4
      if (q <= r) { const c = lerp(hex('#f4f0d8'), hex('#c8c4b0'), Math.max(0, (x + y) / (2 * r))); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2] }
      else if (q <= r + 6) { const c = lerp([d[o], d[o + 1], d[o + 2]], hex('#8a8ab0'), 0.35 * (1 - (q - r) / 6)); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2] }
    }
  }
  views.set(key, out)
  return out
}

// ---------------------------------------------------------------- the ground

/** A row of ground across the board: the road's middle and half width there, its stretch (even or odd), its kind, the haze step. */
export type GroundRow = { c: number; h: number; band: number; zone: RacingZone; fog: number; wave: number; land: boolean }

/** How far each side's bands reach, past the kerb, in half widths. */
const BEACH = 1.0, WET = 0.16, FOAM = 0.07, VERGE = 0.55, PAVE = 0.85, LEDGE = 0.22

/**
 * The ground on one row: the road with its lines and its two lanes' dashes,
 * the kerbs; on the sea's side the beach (sand, the wet sand, the foam) or
 * the promenade's paving and its sea wall, the cliff's edge, the causeway's
 * stone, then the sea with its waves coming in; on the land's side the grass
 * and the bushes, the paving and the gardens, the rock; in the tunnel its
 * walkways. Laid down in spans of one colour, outward in; only the sea and
 * the foam pixel by pixel.
 */
export function groundRow(d: Uint8ClampedArray, W: number, y: number, row: GroundRow, tier: Tier, frame: number): void {
  const pal = palette(tier)[row.fog]
  const { c, h, band, zone } = row
  const at = (name: Colour) => pal[colourIndex[name]]
  const base = y * W * 4
  const span = (x0: number, x1: number, rgb: RGB) => {
    const a = Math.max(0, Math.round(x0)), b = Math.min(W, Math.round(x1))
    for (let x = a, t = base + a * 4; x < b; x += 1, t += 4) { d[t] = rgb[0]; d[t + 1] = rgb[1]; d[t + 2] = rgb[2]; d[t + 3] = 255 }
  }
  const glint = at('glint'), s0 = at(row.wave ? 'sea0' : 'sea1'), s1 = at(row.wave ? 'sea2' : 'sea0'), cut = row.wave ? 0.7 : 0.75, shift = ((frame >> 3) & 63) * 7
  const sea = (x0: number, x1: number) => {
    const a = Math.max(0, Math.round(x0)), b = Math.min(W, Math.round(x1))
    for (let x = a, t = base + a * 4; x < b; x += 1, t += 4) { const g = grain(x, y + shift), rgb = g > 0.988 ? glint : g > cut ? s1 : s0; d[t] = rgb[0]; d[t + 1] = rgb[1]; d[t + 2] = rgb[2]; d[t + 3] = 255 }
  }
  const kerb = h * 1.12, L = c - kerb, R = c + kerb
  if (zone === 'tunnel') span(0, W, at('walk'))
  else {
    // the sea's side, from the screen's edge in to the kerb
    if (zone === 'beach') {
      const sand = L - BEACH * h, wet = sand - WET * h, foam = wet - FOAM * h
      sea(0, foam)
      const fa = Math.max(0, Math.round(foam)), fb = Math.min(W, Math.round(wet)), f = at('foam'), wt = at('wet')
      for (let x = fa, t = base + fa * 4; x < fb; x += 1, t += 4) { const rgb = (x + (frame >> 2)) % 7 < 5 ? f : wt; d[t] = rgb[0]; d[t + 1] = rgb[1]; d[t + 2] = rgb[2]; d[t + 3] = 255 }
      span(wet, sand, wt)
      span(sand, L, at(band ? 'sand0' : 'sand1'))
    } else if (zone === 'promenade') {
      const pave = L - PAVE * h, wall = pave - 0.12 * h
      sea(0, wall); span(wall, pave, at('wall')); span(pave, L, at(band ? 'pave0' : 'pave1'))
    } else if (zone === 'cliff') {
      const ledge = L - LEDGE * h, drop = ledge - 0.08 * h
      span(0, drop, at('deep')); span(drop, ledge, at('rockDark')); span(ledge, L, at(band ? 'rock0' : 'rock1'))
    } else {
      const ledge = L - LEDGE * h
      sea(0, ledge); span(ledge, L, at(band ? 'stone0' : 'stone1'))
    }
    // the land's side, from the kerb out to the screen's edge
    if (zone === 'beach') { const verge = R + VERGE * h; span(R, verge, at(band ? 'grass0' : 'grass1')); span(verge, W, at(band ? 'bush0' : 'bush1')) }
    else if (zone === 'promenade') { const pave = R + PAVE * h, wall = pave + 0.1 * h; span(R, pave, at(band ? 'pave0' : 'pave1')); span(pave, wall, at('wall')); span(wall, W, at(band ? 'grass1' : 'bush1')) }
    else if (zone === 'cliff') span(R, W, at(band ? 'rock0' : 'rock1'))
    else { const ledge = R + LEDGE * h; span(R, ledge, at(band ? 'stone0' : 'stone1')); sea(ledge, W) }
    // the kerbs
    const k = at(band ? 'kerb0' : 'kerb1')
    span(L, c - h, k); span(c + h, R, k)
  }
  // the road, its edge lines, its lanes' dashes
  span(c - h, c + h, at(band ? 'tar0' : 'tar1'))
  const edge = Math.max(1, h * 0.028), line = at('line')
  span(c - h + edge * 1.7, c - h + edge * 2.7, line); span(c + h - edge * 2.7, c + h - edge * 1.7, line)
  if (band) { const lane = Math.max(1, h * 0.022); span(c - h / 3 - lane / 2, c - h / 3 + lane / 2, line); span(c + h / 3 - lane / 2, c + h / 3 + lane / 2, line) }
}

/** Under the horizon where no road is drawn: the sea, and the land on the land's side of the road's far end (`split`); in the tunnel, its dark. */
export function farGround(d: Uint8ClampedArray, W: number, from: number, to: number, split: number, zone: RacingZone, tier: Tier, frame: number): void {
  const pal = palette(tier)[FOG_STEPS - 1]
  const sea = pal[colourIndex.sea0], sea1 = pal[colourIndex.sea1], land = pal[colourIndex.land], dark = pal[colourIndex.tunnel1], glint = pal[colourIndex.glint]
  for (let y = from; y < to; y += 1) for (let x = 0; x < W; x += 1) {
    const g = grain(x, y + ((frame >> 3) & 63) * 7)
    const rgb = zone === 'tunnel' ? dark : zone !== 'causeway' && x >= split ? land : g > 0.992 ? glint : y % 3 === 0 ? sea1 : sea
    const t = (y * W + x) * 4
    d[t] = rgb[0]; d[t + 1] = rgb[1]; d[t + 2] = rgb[2]; d[t + 3] = 255
  }
}

// ---------------------------------------------------------------- what stands up: rails, rock, the tunnel

/** One end of a stretch on the screen: the road's middle, its row, the scale (pixels a half width), and the row nearer ground hides from. */
export type End = { x: number; y: number; u: number }

/** A wall standing along the road, `off` half widths out, `high` tall, between a stretch's two ends: filled column by column, its colour by height. */
export function wallPiece(buffer: PixelBuffer, a: End, b: End, off: number, high: number, clip: number, colour: (t: number, x: number, y: number) => RGB): void {
  const xa = a.x + off * a.u, xb = b.x + off * b.u
  const from = Math.max(0, Math.round(Math.min(xa, xb))), to = Math.min(buffer.width - 1, Math.round(Math.max(xa, xb)))
  const d = buffer.data, W = buffer.width, bottom = Math.min(clip, buffer.height)
  for (let x = from; x <= to; x += 1) {
    const t = xb === xa ? 0 : (x - xa) / (xb - xa)
    const foot = a.y + (b.y - a.y) * t, u = a.u + (b.u - a.u) * t, top = foot - high * u, span = Math.max(1, foot - top)
    for (let y = Math.max(0, Math.round(top)); y < Math.min(bottom, Math.round(foot)); y += 1) { const rgb = colour((foot - y) / span, x, y), o = (y * W + x) * 4; d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2] }
  }
}
/** A colour by name at an hour and a haze step, as numbers. */
const tone = (name: Colour, tier: Tier, fog: number): RGB => palette(tier)[fog][colourIndex[name]]

/** Along the promenade and the causeway, low concrete blocks as in the picture, with gaps between them: a face lit from above, a shadow at its foot. */
export function blocks(buffer: PixelBuffer, a: End, b: End, side: -1 | 1, i: number, clip: number, tier: Tier, fog: number): void {
  if (i % 3 === 2) return
  const face = tone('stone0', tier, fog), top = tone('foam', tier, fog), dark = tone('stone1', tier, fog)
  wallPiece(buffer, a, b, side * 1.72, 0.2, clip, (t) => (t > 0.8 ? top : t < 0.18 ? dark : face))
}

/** Along the beach and the cliff, the metal rail on its posts, a post every fourth stretch: the sea and the sand seen under it. */
export function rail(buffer: PixelBuffer, a: End, b: End, side: -1 | 1, i: number, clip: number, tier: Tier, fog: number): void {
  const bar = tone('stone0', tier, fog), top = tone('foam', tier, fog), post = mix(shade('rockDark', tier, fog), '#1c2474', 0.5 * (1 - fog / FOG_STEPS))
  const ta = { ...a, y: a.y - 0.24 * a.u }, tb = { ...b, y: b.y - 0.24 * b.u }
  wallPiece(buffer, ta, tb, side * 1.72, 0.09, clip, (t) => (t > 0.6 ? top : bar))
  if (i % 4 === 0) { const x = a.x + side * 1.72 * a.u, w = Math.max(1, 0.05 * a.u); for (let y = Math.round(a.y - 0.24 * a.u); y < Math.min(clip, Math.round(a.y)); y += 1) for (let k = 0; k < w; k += 1) buffer.set(Math.round(x) + k, y, post) }
}

/** The cliff's rock along the land's side: in layers, lit at their tops, darker low down. */
export function cliffPiece(buffer: PixelBuffer, a: End, b: End, side: -1 | 1, band: number, clip: number, tier: Tier, fog: number): void {
  const lit = tone('rockLit', tier, fog), r0 = tone('rock0', tier, fog), r1 = tone('rock1', tier, fog), dark = tone('rockDark', tier, fog)
  wallPiece(buffer, a, b, side * 1.92, 4.2, clip, (t, x, y) => {
    const layer = Math.floor(t * 9 + band * 0.5) % 3
    const g = grain(x >> 1, y >> 1)
    return t < 0.12 ? dark : layer === 0 && g > 0.4 ? lit : g > 0.55 ? r0 : r1
  })
}

/** The tunnel at a stretch: its two walls and its vault, a light in the vault every eighth stretch. */
export function tunnelPiece(buffer: PixelBuffer, a: End, b: End, i: number, clip: number, tier: Tier, fog: number): void {
  const w0 = tone('tunnel0', tier, fog), w1 = tone('tunnel1', tier, fog), roof = shade('ceiling', tier, fog), light = shade('light', 0, Math.min(fog, 6))
  for (const side of [-1, 1] as const) wallPiece(buffer, a, b, side * 1.75, 2.3, clip, (t) => (t < 0.08 || (i % 6 === 0 && t > 0.3) ? w1 : w0))
  // the vault: from one wall's top to the other's, between the stretch's two ends
  const topA = a.y - 2.3 * a.u, topB = b.y - 2.3 * b.u
  for (let y = Math.max(0, Math.round(topA)); y < Math.min(clip, Math.round(topB)); y += 1) {
    const t = (y - topA) / Math.max(1, topB - topA), cx = a.x + (b.x - a.x) * t, u = a.u + (b.u - a.u) * t
    for (let x = Math.round(cx - 1.75 * u); x < Math.round(cx + 1.75 * u); x += 1) if (x >= 0 && x < buffer.width) buffer.set(x, y, i % 8 === 0 && Math.abs(x - cx) < 0.25 * u ? light : roof)
  }
}

/** The tunnel's mouth seen from outside: the rock round the opening, at the stretch where it starts. */
export function tunnelMouth(buffer: PixelBuffer, a: End, clip: number, tier: Tier, fog: number): void {
  const r0 = shade('rock0', tier, fog), r1 = shade('rock1', tier, fog), lit = shade('rockLit', tier, fog)
  const left = a.x - 1.75 * a.u, right = a.x + 1.75 * a.u, top = a.y - 2.3 * a.u
  for (let y = Math.max(0, Math.round(a.y - 7 * a.u)); y < Math.min(clip, Math.round(a.y)); y += 1) for (let x = Math.max(0, Math.round(a.x - 9 * a.u)); x < Math.min(buffer.width, Math.round(a.x + 9 * a.u)); x += 1) {
    if (x >= left && x < right && y >= top) continue
    const g = grain(x >> 1, y >> 1)
    buffer.set(x, y, Math.abs(y - top) < Math.max(1, 0.08 * a.u) && x >= left - 0.1 * a.u && x < right + 0.1 * a.u ? lit : g > 0.5 ? r0 : r1)
  }
}

// ---------------------------------------------------------------- what stands by the road and lies on it

/** A traced picture's pixels onto the buffer at `x`, `y`, leaving out its clear ones; drawn `w` × `h` (each pixel taken from the nearest), its own size if not given; no row at or under `clip`; mirrored if asked; through the haze and the hour (`tint`, `by`) if asked. */
export function drawArt(buffer: PixelBuffer, pic: PixelBuffer, x: number, y: number, w = pic.width, h = pic.height, clip = buffer.height, flip = false, tint?: RGB, by = 0): void {
  const sx = pic.width / w, sy = pic.height / h, d = buffer.data, s = pic.data
  const x0 = Math.round(x), y0 = Math.round(y), W = Math.round(w), H = Math.round(h)
  const bottom = Math.min(buffer.height, clip)
  const k = tint && by > 0.01 ? by : 0
  for (let yy = 0; yy < H; yy += 1) {
    const ty = y0 + yy
    if (ty < 0) continue
    if (ty >= bottom) break
    const py = Math.min(pic.height - 1, Math.floor((yy + 0.5) * sy))
    for (let xx = 0; xx < W; xx += 1) {
      const tx = x0 + xx
      if (tx < 0 || tx >= buffer.width) continue
      const px = Math.min(pic.width - 1, Math.floor(((flip ? W - 1 - xx : xx) + 0.5) * sx))
      const o = (py * pic.width + px) * 4
      if (s[o + 3] < 128) continue
      const t = (ty * buffer.width + tx) * 4
      if (k) { d[t] = s[o] + (tint![0] - s[o]) * k; d[t + 1] = s[o + 1] + (tint![1] - s[o + 1]) * k; d[t + 2] = s[o + 2] + (tint![2] - s[o + 2]) * k }
      else { d[t] = s[o]; d[t + 1] = s[o + 1]; d[t + 2] = s[o + 2] }
      d[t + 3] = 255
    }
  }
}

/** How a traced picture is darkened for an hour, before the haze: none at sunset. */
export const HOUR_TINT: Record<Tier, { rgb: RGB; by: number }> = { 0: { rgb: hex('#000000'), by: 0 }, 1: { rgb: hex('#2a1640'), by: 0.3 }, 2: { rgb: hex('#0a0a24'), by: 0.55 }, 3: { rgb: hex('#141824'), by: 0.6 } }
/** The tint for a picture at an hour and a haze step: the hour's darkness and the haze together. */
export function tintFor(tier: Tier, fog: number): { rgb: RGB; by: number } {
  const hourT = HOUR_TINT[tier], f = (fog / (FOG_STEPS - 1)) * HAZE_MAX[tier]
  const by = 1 - (1 - hourT.by) * (1 - f)
  if (by < 0.01) return { rgb: hourT.rgb, by: 0 }
  // the mix of the two, weighted by how much each darkens
  const rgb = lerp(hourT.rgb, HAZE[tier], f / Math.max(0.0001, hourT.by + f))
  return { rgb, by }
}

/** Fills a rectangle (fractions allowed), no row at or under `clip`. */
function fill(buffer: PixelBuffer, x: number, y: number, w: number, h: number, colour: string, clip: number): void {
  const x0 = Math.round(x), x1 = Math.round(x + w), y0 = Math.max(0, Math.round(y)), y1 = Math.min(clip, buffer.height, Math.round(y + h))
  for (let yy = y0; yy < y1; yy += 1) for (let xx = Math.max(0, x0); xx < Math.min(buffer.width, Math.max(x1, x0 + 1)); xx += 1) buffer.set(xx, yy, colour)
}
const disc = (buffer: PixelBuffer, cx: number, cy: number, r: number, colour: string, clip: number) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) { if (y < 0 || y >= clip || y >= buffer.height) continue; for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) buffer.set(x, y, colour) }
}
/** A soft round light added over what is there, strongest in the middle. */
export function glow(buffer: PixelBuffer, cx: number, cy: number, r: number, colour: string, strength: number, clip = buffer.height, flat = 1): void {
  const [cr, cg, cb] = rgbOf(colour), d = buffer.data
  for (let y = Math.floor(cy - r * flat); y <= Math.ceil(cy + r * flat); y += 1) {
    if (y < 0 || y >= clip || y >= buffer.height) continue
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
      if (x < 0 || x >= buffer.width) continue
      const q = ((x - cx) / r) ** 2 + ((y - cy) / (r * flat)) ** 2
      if (q >= 1) continue
      const f = 1 - q, k = strength * f * f, o = (y * buffer.width + x) * 4
      d[o] += (cr - d[o]) * k; d[o + 1] += (cg - d[o + 1]) * k; d[o + 2] += (cb - d[o + 2]) * k
    }
  }
}

/** A chevron sign on its post, `u` pixels to a half width, its foot at `y`: white, a red arrow pointing right (left if `flip`), an ink edge. */
export function chevron(buffer: PixelBuffer, cx: number, y: number, u: number, flip: boolean, clip: number, tier: Tier, fog: number): void {
  const w = 0.5 * u, h = 0.36 * u, top = y - 0.62 * u
  if (h < 2) return
  const white = shade('foam', tier, fog), red = mix(shade('kerb1', tier, fog), '#c81e1e', 0.6 * (1 - fog / FOG_STEPS)), ink = shade('rockDark', tier, fog), post = shade('stone1', tier, fog)
  fill(buffer, cx - 0.03 * u, top + h, 0.06 * u, y - top - h, post, clip)
  fill(buffer, cx - w / 2 - 1, top - 1, w + 2, h + 2, ink, clip)
  fill(buffer, cx - w / 2, top, w, h, white, clip)
  // the arrow: two strokes meeting at its point
  const t = Math.max(1, 0.09 * u)
  for (let k = 0; k <= h; k += 0.5) {
    const along = Math.abs(k - h / 2) / (h / 2), px = cx + (flip ? 1 : -1) * (along * w * 0.3 - w * 0.15)
    fill(buffer, px - t / 2, top + k, t, 1, red, clip)
  }
}

/** A street lamp, `u` pixels to a half width, its foot at `y`: a pale post, an arm over the road (`toward` −1 left, 1 right), its orange lamp; lit after dark, a glow and a pool of light under it. */
export function lamp(buffer: PixelBuffer, x: number, y: number, u: number, toward: -1 | 1, clip: number, tier: Tier, fog: number, lit: boolean): void {
  const high = 2.3 * u, post = Math.max(1, 0.05 * u)
  if (high < 4) return
  const pole = shade('pave0', tier, Math.min(FOG_STEPS - 1, fog + 1)), dark = shade('wall', tier, fog)
  fill(buffer, x - post / 2, y - high, post, high, pole, clip)
  fill(buffer, x - post / 2 + post * 0.6, y - high, Math.max(1, post * 0.4), high, dark, clip)
  const arm = 0.42 * u, hx = x + toward * arm
  fill(buffer, Math.min(x, hx), y - high, Math.abs(hx - x) + post, Math.max(1, post * 0.7), pole, clip)
  const r = Math.max(1, 0.1 * u)
  disc(buffer, hx, y - high + r * 0.6, r, lit ? '#ffe2a0' : mix('#ff6a3a', '#3a2040', fog / FOG_STEPS), clip)
  if (lit) glow(buffer, hx, y - high + r, r * 4.5, '#ffb070', 0.55, clip)
}

/** A light's pool on the road under a lamp, after dark. */
export function lampPool(buffer: PixelBuffer, x: number, y: number, u: number, clip: number): void {
  glow(buffer, x, y, 0.9 * u, '#ffc890', 0.32, clip, 0.22)
}

/** A bush on the land, `u` pixels to a half width: three round clumps, dark below, lit on top, a shadow at its foot. */
export function shrub(buffer: PixelBuffer, cx: number, y: number, u: number, flip: boolean, clip: number, tier: Tier, fog: number): void {
  const r = 0.26 * u
  if (r < 1) return
  const dark = shade('bush0', tier, fog), mid = shade('bush1', tier, fog), lit = shade('grass0', tier, fog)
  const s = flip ? -1 : 1
  for (const [dx, dy, k] of [[-0.55, -0.85, 0.85], [0.55, -0.8, 0.8], [0, -1.25, 1]] as const) {
    disc(buffer, cx + s * dx * r, y + dy * r, r * k, dark, clip)
    disc(buffer, cx + s * dx * r - r * 0.12, y + dy * r - r * 0.18, r * k * 0.72, mid, clip)
    if (r > 3) disc(buffer, cx + s * dx * r - r * 0.25, y + dy * r - r * 0.35, r * k * 0.32, lit, clip)
  }
}

/** A cone of the roadworks, `u` pixels to a half width: orange with a white band, on its base. */
export function cone(buffer: PixelBuffer, cx: number, y: number, u: number, clip: number, tier: Tier, fog: number): void {
  const h = 0.3 * u, base = 0.22 * u
  if (h < 2) return
  const orange = mix(shade('kerb0', tier, fog), '#ff6a10', 0.5 * (1 - fog / FOG_STEPS)), white = shade('foam', tier, fog), dark = shade('rockDark', tier, fog)
  fill(buffer, cx - base / 2, y - Math.max(1, 0.04 * u), base, Math.max(1, 0.04 * u), dark, clip)
  for (let k = 0; k < h; k += 1) {
    const t = k / h, w = Math.max(1, base * 0.85 * (1 - t) + 1)
    fill(buffer, cx - w / 2, y - Math.max(1, 0.04 * u) - k, w, 1, t > 0.4 && t < 0.6 ? white : orange, clip)
  }
}

/** A ketchup puddle on the road, flat with the perspective: dark red, a lighter middle, a glint. */
export function puddle(buffer: PixelBuffer, cx: number, y: number, u: number, clip: number, tier: Tier, fog: number): void {
  const w = 0.42 * u, h = Math.max(1, 0.07 * u)
  if (w < 2) return
  const dark = mix('#7a0c10', hexOf(HAZE[tier]), (fog / FOG_STEPS) * 0.6), red = mix('#c81a1a', hexOf(HAZE[tier]), (fog / FOG_STEPS) * 0.6)
  for (let yy = Math.floor(y - h); yy <= Math.ceil(y + h); yy += 1) {
    if (yy < 0 || yy >= clip || yy >= buffer.height) continue
    for (let xx = Math.floor(cx - w); xx <= Math.ceil(cx + w); xx += 1) {
      const q = ((xx - cx) / w) ** 2 + ((yy - y) / h) ** 2 + 0.25 * Math.sin(xx * 0.7 + yy) * (1 / Math.max(1, w / 8))
      if (q <= 1) buffer.set(xx, yy, q < 0.45 ? red : dark)
    }
  }
  if (w > 6) fill(buffer, cx - w * 0.35, y - h * 0.35, w * 0.2, 1, '#ff9a8a', clip)
}

/** A stopwatch floating over the road, bobbing: a red case, a white face, its hands; `u` pixels to a half width. */
export function stopwatch(buffer: PixelBuffer, cx: number, y: number, u: number, clip: number, frame: number): void {
  const r = 0.16 * u
  if (r < 1.5) return
  const cy = y - 0.42 * u + Math.sin(frame * 0.12) * 0.04 * u
  glow(buffer, cx, cy, r * 2.4, '#fff4c0', 0.35, clip)
  fill(buffer, cx - r * 0.25, cy - r * 1.45, r * 0.5, r * 0.4, '#c81e1e', clip)
  disc(buffer, cx, cy, r, INK, clip)
  disc(buffer, cx, cy, r * 0.92, '#e2302a', clip)
  disc(buffer, cx, cy, r * 0.7, '#faf6ec', clip)
  if (r >= 4) { fill(buffer, cx - 0.5, cy - r * 0.55, 1, r * 0.55, INK, clip); fill(buffer, cx, cy - 0.5, r * 0.4, 1, INK, clip) }
}

/** The mustard turbo floating over the road: ATTACKS' yellow bottle, at any size; `u` pixels to a half width. */
export function bottle(buffer: PixelBuffer, cx: number, y: number, u: number, clip: number, frame: number): void {
  const h = 0.42 * u, w = h * 0.55
  if (h < 4) return
  const top = y - 0.62 * u + Math.sin(frame * 0.12 + 1) * 0.04 * u
  glow(buffer, cx, top + h / 2, h * 1.1, '#fff0a0', 0.35, clip)
  fill(buffer, cx - w * 0.12, top, w * 0.24, h * 0.16, '#c89a10', clip)
  fill(buffer, cx - w * 0.3, top + h * 0.14, w * 0.6, h * 0.12, '#faf6ec', clip)
  fill(buffer, cx - w / 2 - 1, top + h * 0.25 - 1, w + 2, h * 0.75 + 2, INK, clip)
  fill(buffer, cx - w / 2, top + h * 0.25, w, h * 0.75, '#ffd02a', clip)
  fill(buffer, cx - w / 2, top + h * 0.52, w, Math.max(1, h * 0.1), '#faf6ec', clip)
  fill(buffer, cx - w * 0.32, top + h * 0.32, Math.max(1, w * 0.14), h * 0.5, '#fff3a0', clip)
  fill(buffer, cx + w * 0.3, top + h * 0.3, Math.max(1, w * 0.15), h * 0.65, '#c89a10', clip)
}

/** A coin over the road, turning: gold, its rim, a shine; `u` pixels to a half width. */
export function coin(buffer: PixelBuffer, cx: number, y: number, u: number, clip: number, frame: number, seed: number): void {
  const r = 0.13 * u
  if (r < 1) return
  const cy = y - 0.36 * u, turn = Math.abs(Math.cos((frame + seed * 9) * 0.1))
  const w = Math.max(1, r * turn)
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy += 1) {
    if (yy < 0 || yy >= clip || yy >= buffer.height) continue
    for (let xx = Math.floor(cx - w); xx <= Math.ceil(cx + w); xx += 1) {
      const q = ((xx + 0.5 - cx) / w) ** 2 + ((yy + 0.5 - cy) / r) ** 2
      if (q <= 1) buffer.set(xx, yy, q > 0.6 ? '#c8901a' : xx < cx - w * 0.2 && yy < cy ? '#fff3a0' : '#ffd23f')
    }
  }
}

/** A gantry across the road: two posts and a beam; the start's with its three lights, a checkpoint's in the theme's colour with its word, the finish line's chequered. */
export function gantry(buffer: PixelBuffer, p: { x: number; y: number; u: number }, clip: number, kind: 'start' | 'check' | 'finish', lit: number, accent: string, tier: Tier, fog: number): void {
  const u = p.u, xl = p.x - 1.95 * u, xr = p.x + 1.95 * u
  const top = p.y - 2 * u, beam = Math.max(2, Math.round(0.34 * u)), post = Math.max(1, Math.round(0.08 * u))
  const postC = shade('walk', tier, fog)
  fill(buffer, xl - post / 2, top, post, p.y - top, postC, clip)
  fill(buffer, xr - post / 2, top, post, p.y - top, postC, clip)
  if (kind === 'finish') {
    const sq = Math.max(1, Math.round(beam / 2))
    for (let y = Math.max(0, Math.round(top)); y < Math.min(clip, Math.round(top + beam)); y += 1) for (let x = Math.round(xl); x < Math.round(xr); x += 1) buffer.set(x, y, (Math.floor((x - xl) / sq) + Math.floor((y - top) / sq)) % 2 ? CREAM : '#1a1a22')
    return
  }
  fill(buffer, xl, top, xr - xl, beam, kind === 'check' ? mix(accent, '#1a1a2a', 0.35) : '#1c1a2e', clip)
  if (kind === 'check') {
    const scale = beam >= 16 ? 2 : 1, word = 'CHECKPOINT', w = text7Width(word, scale, true)
    if (w < xr - xl - 4 && beam >= 9 && top + beam < clip) drawText7(buffer, word, Math.round(p.x - w / 2), Math.round(top + (beam - 7 * scale) / 2), CREAM, scale, true)
    return
  }
  const r = Math.max(1, beam * 0.32)
  for (let k = 0; k < 3; k += 1) {
    const cx = p.x + (k - 1) * beam * 1.2, cy = top + beam / 2
    if (cy + r >= clip) continue
    buffer.disc(cx, cy, r, lit >= 3 ? '#3aff6a' : k <= lit ? '#ff3a2a' : '#4a2a2a')
  }
}

// ---------------------------------------------------------------- the cars

/** The traffic's colours: the red car's and the yellow car's shapes in others. */
const LOOKS: readonly RGB[] = [hex('#2a6aff'), hex('#f2efe6'), hex('#2ab070'), hex('#9a4ad8')]
const recoloured = new Map<string, PixelBuffer>()
/** A car's picture in another colour: its body's red or yellow turned to the colour, its lights and glass left as they are. */
function inColour(pic: PixelBuffer, key: string, kind: RacingCarKind, look: number): PixelBuffer {
  const k = `${key}|${look}`
  let out = recoloured.get(k)
  if (out) return out
  out = new PixelBuffer(pic.width, pic.height)
  out.data.set(pic.data)
  const to = LOOKS[look % LOOKS.length], d = out.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    const r = d[i], g = d[i + 1], b = d[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b)
    // the body: saturated red (the red car) or yellow (the yellow car); the lamps (bright red on the yellow car) kept
    const body = kind === 'rosso' ? r > g + 50 && r > b + 50 && max - min > 70 && !(r > 240 && g > 150) : r > 150 && g > 110 && b < 110 && max - min > 60
    if (!body) continue
    const light = (0.3 * r + 0.59 * g + 0.11 * b) / (kind === 'rosso' ? 120 : 200)
    d[i] = Math.min(255, to[0] * light); d[i + 1] = Math.min(255, to[1] * light); d[i + 2] = Math.min(255, to[2] * light)
  }
  recoloured.set(k, out)
  return out
}

/** The size of each car's picture to use for a width on the screen. */
const sizeFor = (width: number) => (width > 112 ? 130 : width > 70 ? 104 : 60)

/**
 * A car seen from behind, `width` wide on the screen (its back), its foot at
 * `foot`, its middle at `cx`: straight, or turning (`turn` −1 left, 1
 * right) with its flank showing; its shadow on the road under it; in
 * another colour for the traffic (`look`); through the hour and the haze.
 */
export function drawCar(buffer: PixelBuffer, kind: RacingCarKind, cx: number, foot: number, width: number, options: { turn?: -1 | 0 | 1; clip?: number; look?: number; tier?: Tier; fog?: number; lights?: boolean } = {}): void {
  const turn = options.turn ?? 0, clip = options.clip ?? buffer.height, size = sizeFor(width)
  const straightName = `car-${kind}-${size}` as RacingArtName, turnName = `car-${kind}-${size}-turn` as RacingArtName
  const straight = racingArt(straightName)
  if (!straight || width < 2) return
  const turnPic = turn ? racingArt(turnName) : null
  let pic = turnPic ?? straight
  if (options.look != null) pic = inColour(pic, turnPic ? turnName : straightName, kind, options.look)
  // the back is the straight picture's width; a turning picture's flank (or lean) reaches past it
  const scale = width / straight.width, w = Math.max(2, Math.round(pic.width * scale)), h = Math.max(1, Math.round(pic.height * scale))
  const x0 = turnPic && turn < 0 ? Math.round(cx + width / 2 - w) : Math.round(cx - width / 2)
  glow(buffer, cx, foot - 1, width * 0.58, '#0a0814', 0.55, clip, 0.13)
  const { rgb, by } = tintFor(options.tier ?? 0, options.fog ?? 0)
  drawArt(buffer, pic, x0, Math.round(foot - h), w, h, clip, !!turnPic && turn < 0, rgb, by)
  // after dark, its rear lights
  if (options.lights && kind !== 'burger' && width > 8) for (const side of [-1, 1]) glow(buffer, cx + side * width * 0.32, foot - h * 0.52, Math.max(2, width * 0.14), '#ff2a2a', 0.5, clip)
}

/** A puff from an exhaust, low by the road, swelling and thinning as it drifts out, one moment after another. */
export function puff(buffer: PixelBuffer, x: number, y: number, dir: number, frame: number, seed: number, color = '#e8dcf0', strength = 0.38): void {
  const age = (frame + seed) % 5, r = 2 + age * 1.6
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
    const q = (dx * dx + dy * dy) / (r * r)
    if (q <= 1) buffer.tint(Math.round(x + dir * age * 3 + dx), Math.round(y + age * 0.6 + dy * 0.6), color, strength * (1 - age / 5) * (1 - q * 0.5))
  }
}

/** The turbo's flames out of the exhausts, flickering. */
export function flames(buffer: PixelBuffer, x: number, y: number, size: number, frame: number): void {
  const len = size * (0.7 + ((frame * 7) % 5) * 0.12)
  glow(buffer, x, y + len * 0.35, len, '#ff7a1a', 0.75)
  glow(buffer, x, y + len * 0.2, len * 0.55, '#fff0a0', 0.8)
}
