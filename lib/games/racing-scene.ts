/**
 * What RANDOM RACING's road is drawn with: the colours taken from the
 * owner's pictures — the coast's, the mountains', the desert's, the city's —
 * as the evening goes (sunset, dusk, night, the storm) and fading into the
 * haze with the distance; the far view for each world and hour; the ground
 * along each kind of road; the rails, the rock and the tunnel's walls; what
 * stands by the road and lies on it; the cars, three ways each, with their
 * shadows. `racing-play.ts` puts them in place, after saying which world it
 * draws (`sceneWorld`).
 */

import { racingArt, type RacingArtName, type RacingCarKind } from './racing-art'
import { TRAFFIC_LIGHTS, TRAFFIC_SQUASH, TRAFFIC_WIDTH, trafficPicture, type TrafficModel } from './racing-traffic'
import type { RacingWorld, RacingZone } from './racing-worlds'
import { drawText7, mix, PixelBuffer, rgbOf, text7Width } from './pixels'
import { CREAM, INK } from './ui'

export type RGB = readonly [number, number, number]
/** The hour: 0 the picture's light (the sun above the sea, the mountains' and the desert's day, the city's evening), 1 the dusk, 2 the night, 3 the storm; in between, on its way from one to the next. */
export type Tier = number

/** The world being drawn: its colours, its far view, its hours. Said by the screen before it draws. */
let world: RacingWorld = 'coast'
export function sceneWorld(w: RacingWorld): void { world = w }
export const currentWorld = (): RacingWorld => world

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
  land: '#3a4a52', dash: '#d5bca5',
} as const
export type Colour = keyof typeof BASE
const NAMES = Object.keys(BASE) as Colour[]
/**
 * The other worlds' colours, by the same names: what the sand, the sea, the
 * rock and the rest are there. The mountains: a grey road, white and red
 * kerbs, meadows and the dark of the forest, the lake's turquoise, pebbles,
 * cobbles, grey granite, a metal rail. The desert: a dusty road with its
 * yellow dashes, sand, dry scrub, packed earth, adobe, red sandstone, a
 * wooden fence. The city at night: dark asphalt, concrete kerbs, the
 * pavements, the park's lawns, the bay, concrete.
 */
const WORLD_BASE: Record<Exclude<RacingWorld, 'coast'>, Partial<Record<Colour, string>>> = {
  mountain: {
    tar0: '#4a4c5e', tar1: '#525468', line: '#f2eee2', dash: '#f2eee2', kerb0: '#eeeae2', kerb1: '#d23a32',
    sand0: '#b8b0a2', sand1: '#a8a092', wet: '#7a8a92', foam: '#f4f8fa',
    sea0: '#38b4c8', sea1: '#2a98b8', sea2: '#5ad0da', deep: '#1a6a8a', glint: '#eaffff',
    grass0: '#62a84c', grass1: '#56984a', bush0: '#1f5a3a', bush1: '#28683f',
    pave0: '#bcb0a2', pave1: '#aca092', wall: '#7a6a5c',
    rock0: '#7e7e8c', rock1: '#6c6c7c', rockLit: '#a2a2b0', rockDark: '#3c3c4c',
    stone0: '#c4c8d0', stone1: '#9a9eaa', land: '#3e6e48',
  },
  desert: {
    tar0: '#463c46', tar1: '#4e434e', line: '#f2e6c8', dash: '#f4c430', kerb0: '#e6c898', kerb1: '#d8b886',
    sand0: '#f0b474', sand1: '#e6a666', wet: '#d8985e', foam: '#fff0d0',
    grass0: '#d4a462', grass1: '#c89858', bush0: '#9a8a4a', bush1: '#a89654',
    pave0: '#d8b090', pave1: '#cca282', wall: '#b07650',
    rock0: '#c45a3a', rock1: '#ac4c34', rockLit: '#e27e4c', rockDark: '#6e2c2c',
    stone0: '#8e6c4c', stone1: '#6c4c34', land: '#dc9c62',
  },
  city: {
    tar0: '#26263c', tar1: '#2c2c44', line: '#e6dec8', dash: '#e6dec8', kerb0: '#8c8ca4', kerb1: '#7a7a94',
    sand0: '#4c4664', sand1: '#46405e', wet: '#3a3456', foam: '#c8c8e0',
    sea0: '#1c3c6e', sea1: '#16325e', sea2: '#26528c', deep: '#0e2244', glint: '#ffd890',
    grass0: '#2c5e4c', grass1: '#265442', bush0: '#163c32', bush1: '#1e4636',
    pave0: '#5e5874', pave1: '#56506c', wall: '#3c3654',
    rock0: '#4c4c64', rock1: '#42425c', rockLit: '#6c6c88', rockDark: '#26263c',
    stone0: '#9c9cb4', stone1: '#7c7c98', land: '#1c1c34',
  },
}
const baseOf = (w: RacingWorld, n: Colour): RGB => hex((w === 'coast' ? undefined : WORLD_BASE[w][n]) ?? BASE[n])

/**
 * How each of the four hours turns a colour. The coast: the dusk deeper and
 * violet, the night dark blue, the storm dark grey-blue. The mountains and
 * the desert: the evening golden, the night dark blue, the snow's storm pale
 * and grey, the sand's dark and brown. The city, already lit up in the
 * evening: the night a little deeper at each hour, the rain grey-blue.
 */
function stage(c: RGB, k: number, w: RacingWorld): RGB {
  if (k === 0) return c
  const grey = (c[0] + c[1] + c[2]) / 3
  if (w === 'city') return k === 1 ? lerp(times(c, 0.9), hex('#1a1040'), 0.08) : k === 2 ? lerp(times(c, 0.78), hex('#0c0c2a'), 0.14) : lerp(times(lerp(c, [grey, grey, grey], 0.3), 0.66), hex('#1c2030'), 0.25)
  if (w === 'mountain' || w === 'desert') {
    if (k === 1) return lerp(times(c, 0.84), hex(w === 'desert' ? '#c24a3a' : '#c8603a'), 0.16)
    if (k === 2) return lerp(times(c, 0.52), hex('#141436'), 0.28)
    return w === 'mountain' ? lerp(times(lerp(c, [grey, grey, grey], 0.5), 0.62), hex('#8a92a8'), 0.3) : lerp(times(c, 0.55), hex('#5a3424'), 0.32)
  }
  if (k === 1) return lerp(times(c, 0.8), hex('#4a2a6a'), 0.18)
  if (k === 2) return lerp(times(c, 0.56), hex('#141436'), 0.26)
  return lerp(times(lerp(c, [grey, grey, grey], 0.35), 0.5), hex('#1c2030'), 0.3)
}
/** Between two hours, a colour on its way from one to the next. */
const between = <T>(h: number, at: (k: number) => T, blend: (a: T, b: T, t: number) => T): T => { const k = Math.max(0, Math.min(3, Math.floor(h))), t = Math.max(0, Math.min(1, h - k)); return t < 1e-6 || k >= 3 ? at(k) : blend(at(k), at(k + 1), t) }
const hour = (c: RGB, h: Tier, w: RacingWorld): RGB => between(h, (k) => stage(c, k, w), lerp)
/**
 * The haze far off, for each world and hour, and how much of it at the far
 * end of the road: the coast's sunset pink, dusk violet, night blue, storm
 * grey; the mountains' pale blue air, golden evening, night, the snow's
 * white; the desert's dust, red evening, night, the sand blowing; the
 * city's violet glow, its deeper nights, the rain.
 */
const HAZES: Record<RacingWorld, RGB[]> = {
  coast: [hex('#e8768a'), hex('#5e3a7c'), hex('#1a1a42'), hex('#2a2e3e')],
  mountain: [hex('#b4d4ee'), hex('#e0946a'), hex('#1a2244'), hex('#c4c8d4')],
  desert: [hex('#f2d4a4'), hex('#e0705a'), hex('#1a1a3c'), hex('#b8804e')],
  city: [hex('#3a2a6a'), hex('#2a1e58'), hex('#16163c'), hex('#2a2e3e')],
}
const HAZE_MAXES: Record<RacingWorld, number[]> = { coast: [0.62, 0.7, 0.82, 0.88], mountain: [0.5, 0.62, 0.8, 0.9], desert: [0.55, 0.66, 0.8, 0.9], city: [0.68, 0.74, 0.82, 0.88] }
export const hazeAt = (h: Tier): RGB => between(h, (k) => HAZES[world][k], lerp)
const hazeMaxAt = (h: Tier): number => between(h, (k) => HAZE_MAXES[world][k], (a, b, t) => a + (b - a) * t)
/** The hour in eighths: what the colours are worked out for. */
const eighth = (h: Tier) => Math.round(h * 8) / 8

/** Sixteen steps of haze, for each hour, each colour: worked out once. */
export const FOG_STEPS = 16
const palettes = new Map<string, RGB[][]>()
export function palette(h: Tier): RGB[][] {
  const q = eighth(h), key = `${world}|${q}`
  let p = palettes.get(key)
  if (!p) {
    const haze = hazeAt(q), far = hazeMaxAt(q), w = world
    p = Array.from({ length: FOG_STEPS }, (_, f) => NAMES.map((n) => lerp(hour(baseOf(w, n), q, w), haze, (f / (FOG_STEPS - 1)) * far).map(Math.round) as unknown as RGB))
    palettes.set(key, p)
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

/** The far view's sun, lifted off the picture: its pixels and the row it sinks behind. */
type Sun = { px: Array<[number, number, number, number, number]>; bottom: number; height: number }
let sunOf: Sun | null = null
const sunny = (d: Uint8ClampedArray, o: number) => d[o] > 215 && d[o + 1] > 140 && d[o + 2] < 150

const bases = new Map<number, PixelBuffer>()
/**
 * The picture's far view without its sun, at one of the four hours: as it
 * is at sunset; at dusk deeper and violet; at night a moon, stars, the
 * city's lights still on; in the storm darker still and grey, no stars.
 */
function baseView(k: number): PixelBuffer | null {
  const known = bases.get(k)
  if (known) return known
  const back = racingArt('playBack')
  if (!back) return null
  const out = new PixelBuffer(back.width, back.height)
  out.data.set(back.data)
  const W = out.width, H = out.height, d = out.data
  const lit = (o: number) => 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]
  // the sun lifted off, each of its rows filled from the sky beside it
  const sun: Sun = { px: [], bottom: 0, height: 0 }
  let top = H
  for (let y = 0; y < H - 8; y += 1) {
    const row = y * W * 4
    let x = 0
    while (x < Math.min(W, 230)) {
      if (!sunny(d, row + x * 4)) { x += 1; continue }
      let e = x
      while (e < W && sunny(d, row + e * 4)) e += 1
      for (let k2 = x; k2 < e; k2 += 1) { const o = row + k2 * 4; sun.px.push([k2, y, d[o], d[o + 1], d[o + 2]]); top = Math.min(top, y); sun.bottom = Math.max(sun.bottom, y) }
      const a = Math.max(0, x - 3), b = Math.min(W - 1, e + 2)
      for (let k2 = x; k2 < e; k2 += 1) { const t = (k2 - a) / Math.max(1, b - a); for (let c = 0; c < 3; c += 1) d[row + k2 * 4 + c] = d[row + a * 4 + c] + (d[row + b * 4 + c] - d[row + a * 4 + c]) * t }
      x = e
    }
  }
  sun.height = sun.bottom - top + 1
  if (!sunOf) sunOf = sun
  if (k > 0) {
    const sky = k === 1 ? hex('#3a1a5a') : k === 2 ? hex('#0a0a2a') : hex('#1a1e2c')
    const keep = k === 1 ? 0.78 : k === 2 ? 0.5 : 0.42
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4
      // the city's lights low down stay lit after dark
      if (k >= 2 && y > H * 0.62 && lit(o) > 175) continue
      const c = lerp(times([d[o], d[o + 1], d[o + 2]], keep), sky, k === 1 ? 0.3 : 0.45)
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]
    }
  }
  if (k === 2) {
    // stars, and the moon over the sea
    for (let n = 0; n < 70; n += 1) { const x = Math.floor(grain(n, 3) * W), y = 4 + Math.floor(grain(n, 7) * H * 0.5); const o = (y * W + x) * 4; const b = 150 + grain(n, 11) * 100; d[o] = b; d[o + 1] = b; d[o + 2] = b + 10 }
    const mx = 92, my = 34, r = 13
    for (let y = -r - 6; y <= r + 6; y += 1) for (let x = -r - 6; x <= r + 6; x += 1) {
      const q = Math.hypot(x, y), o = ((my + y) * W + mx + x) * 4
      if (q <= r) { const c = lerp(hex('#f4f0d8'), hex('#c8c4b0'), Math.max(0, (x + y) / (2 * r))); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2] }
      else if (q <= r + 6) { const c = lerp([d[o], d[o + 1], d[o + 2]], hex('#8a8ab0'), 0.35 * (1 - (q - r) / 6)); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2] }
    }
  }
  bases.set(k, out)
  return out
}

/**
 * Another world's far view (its picture's) at one of the four hours: as it
 * is; in the evening golden (the mountains, the desert) or a little deeper
 * (the city); at night dark blue with stars and a moon, the city's windows
 * and signs still lit; in the storm pale with snow, brown with sand, grey
 * with rain.
 */
const worldBases = new Map<string, PixelBuffer>()
function worldView(w: Exclude<RacingWorld, 'coast'>, k: number): PixelBuffer | null {
  const key = `${w}|${k}`, known = worldBases.get(key)
  if (known) return known
  const back = racingArt(`far-${w}`)
  if (!back) return null
  const out = new PixelBuffer(back.width, back.height)
  out.data.set(back.data)
  const W = out.width, H = out.height, d = out.data
  const lit = (o: number) => 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]
  const turn: Record<string, [number, string, number]> = {
    'mountain|1': [0.86, '#e07a4a', 0.22], 'mountain|2': [0.46, '#0a0c2c', 0.45], 'mountain|3': [0.62, '#a4aabc', 0.5],
    'desert|1': [0.86, '#d8583a', 0.24], 'desert|2': [0.46, '#0a0a2a', 0.45], 'desert|3': [0.56, '#8c5a38', 0.52],
    'city|1': [0.9, '#0c0a2a', 0.12], 'city|2': [0.78, '#0a0a24', 0.2], 'city|3': [0.6, '#1a1e2c', 0.4],
  }
  const how = turn[key]
  if (how) {
    const [keep, toward, by] = how, sky = hex(toward)
    for (let i = 0; i < d.length; i += 4) {
      // the city's lights stay lit
      if (w === 'city' && lit(i) > 170) continue
      const c = lerp(times([d[i], d[i + 1], d[i + 2]], keep), sky, by)
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]
    }
  }
  if (k === 2 && w !== 'city') {
    // stars over the peaks and the mesas, a moon
    for (let n = 0; n < 60; n += 1) { const x = Math.floor(grain(n, 5) * W), y = 3 + Math.floor(grain(n, 9) * H * 0.38); const o = (y * W + x) * 4; const b = 150 + grain(n, 13) * 100; d[o] = b; d[o + 1] = b; d[o + 2] = b + 10 }
    const mx = W - 84, my = 26, r = 11
    for (let y = -r - 5; y <= r + 5; y += 1) for (let x = -r - 5; x <= r + 5; x += 1) {
      const q = Math.hypot(x, y), o = ((my + y) * W + mx + x) * 4
      if (q <= r) { const c = lerp(hex('#f4f0d8'), hex('#c8c4b0'), Math.max(0, (x + y) / (2 * r))); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2] }
      else if (q <= r + 5) { const c = lerp([d[o], d[o + 1], d[o + 2]], hex('#8a8ab0'), 0.35 * (1 - (q - r) / 5)); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2] }
    }
  }
  worldBases.set(key, out)
  return out
}

const skies = new Map<string, PixelBuffer>()
/**
 * The far view at an hour, on its way from one of the four to the next, and
 * its sun as low as the hour has it: in the picture's place at first,
 * sinking and reddening as the race goes on, gone under the sea's line once
 * dusk has come (`sinking` from 0 to 1).
 */
export function skyAt(h: Tier, sinking: number): PixelBuffer | null {
  const q = eighth(h), k = Math.min(3, Math.floor(q)), t = q - k
  if (world !== 'coast') {
    const w = world, low = worldView(w, k)
    if (!low || t <= 0 || k >= 3) return low
    const key = `${w}|${q}`, known = skies.get(key)
    if (known) return known
    const high = worldView(w, k + 1)
    if (!high) return low
    const out = new PixelBuffer(low.width, low.height)
    for (let i = 0; i < out.data.length; i += 4) { for (let c = 0; c < 3; c += 1) out.data[i + c] = low.data[i + c] + (high.data[i + c] - low.data[i + c]) * t; out.data[i + 3] = 255 }
    if (skies.size > 40) skies.clear()
    skies.set(key, out)
    return out
  }
  const low = baseView(k)
  if (!low || !sunOf) return low
  const drop = Math.round(Math.max(0, Math.min(1, sinking)) * (sunOf.height + 2))
  const key = `${q}|${drop}`
  const known = skies.get(key)
  if (known) return known
  const out = new PixelBuffer(low.width, low.height)
  out.data.set(low.data)
  const high = t > 0 && k < 3 ? baseView(k + 1) : null
  if (high) for (let i = 0; i < out.data.length; i += 4) for (let c = 0; c < 3; c += 1) out.data[i + c] = low.data[i + c] + (high.data[i + c] - low.data[i + c]) * t
  if (drop <= sunOf.height + 1) {
    // the sun, lower and redder as it sets, cut by the sea's line
    const red = Math.max(0, Math.min(1, sinking)), dim = 1 - Math.min(0.5, q * 0.4)
    for (const [x, y, r, g, b] of sunOf.px) {
      const Y = y + drop
      if (Y > sunOf.bottom) continue
      const o = (Y * out.width + x) * 4
      out.data[o] = r * dim; out.data[o + 1] = (g - (g - 70) * red * 0.55) * dim; out.data[o + 2] = (b - b * red * 0.4) * dim
    }
  }
  if (skies.size > 40) skies.clear()
  skies.set(key, out)
  return out
}

// ---------------------------------------------------------------- the ground

/** A row of ground across the board: the road's middle and half width there, its stretch (even or odd), its kind, the haze step. */
export type GroundRow = { c: number; h: number; band: number; zone: RacingZone; fog: number; wave: number; land: boolean }

/** How far each side's bands reach, past the kerb, in half widths. */
const BEACH = 1.0, WET = 0.16, FOAM = 0.07, VERGE = 0.55, PAVE = 0.85, LEDGE = 0.22

/**
 * The ground on one row: the road with its lines and its two lanes' dashes,
 * the kerbs; on the coast, on the sea's side the beach (sand, the wet sand,
 * the foam) or the promenade's paving and its sea wall, the cliff's edge,
 * the causeway's stone, then the sea with its waves coming in; on the land's
 * side the grass and the bushes, the paving and the gardens, the rock. In
 * the mountains the verges and the forest's floor, the village's cobbles,
 * the lake's shore and water, the gorge's edge over the river and its rock;
 * in the desert the sand, the town's packed earth and its low adobe walls,
 * the canyon's and the mesa's rock; in the city the pavements, the park's
 * paths and lawns, the bridge's edge over the bay. In the tunnel its
 * walkways. Laid down in spans of one colour, outward in; only the water and
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
  else if (zone !== 'beach' && zone !== 'promenade' && zone !== 'cliff' && zone !== 'causeway') {
    // the other worlds: each side from the kerb outward, by bands (half widths) — the last one reaching the screen's edge
    const lay = (side: -1 | 1, bands: Array<[number, RGB | 'water']>) => {
      let from = side < 0 ? L : R
      bands.forEach(([w, rgb], k) => {
        const to = k === bands.length - 1 ? (side < 0 ? 0 : W) : from + side * w * h
        const a = Math.min(from, to), b = Math.max(from, to)
        if (rgb === 'water') sea(a, b); else span(a, b, rgb)
        from = to
      })
    }
    const g = at(band ? 'grass0' : 'grass1'), floor = at(band ? 'bush0' : 'bush1'), pave = at(band ? 'pave0' : 'pave1'), sand = at(band ? 'sand0' : 'sand1'), rock = at(band ? 'rock0' : 'rock1'), stone = at(band ? 'stone0' : 'stone1')
    const sideOf = (side: -1 | 1): Array<[number, RGB | 'water']> => {
      switch (zone) {
        case 'forest': return [[0.45, g], [0, floor]]
        case 'village': return [[0.85, pave], [0.1, at('wall')], [0, at(band ? 'grass1' : 'bush1')]]
        case 'lake': return side < 0 ? [[0.3, sand], [0.06, at('wet')], [0, 'water']] : [[0.45, g], [0, floor]]
        case 'gorge': return side < 0 ? [[LEDGE, rock], [0.08, at('rockDark')], [0, at('deep')]] : [[0, rock]]
        case 'dunes': return [[0.5, at(band ? 'grass0' : 'grass1')], [0, sand]]
        case 'town': return [[0.85, pave], [0.1, at('wall')], [0, sand]]
        case 'canyon': return [[0.3, sand], [0, rock]]
        case 'mesa': return side < 0 ? [[0.5, at(band ? 'grass0' : 'grass1')], [0, sand]] : [[0.3, sand], [0, rock]]
        case 'avenue': return [[0.85, pave], [0.1, at('wall')], [0, at(band ? 'grass1' : 'bush1')]]
        case 'downtown': return [[0, pave]]
        case 'park': return [[0.3, pave], [0, g]]
        default: return [[LEDGE, stone], [0, 'water']]
      }
    }
    lay(-1, sideOf(-1)); lay(1, sideOf(1))
    const k = at(band ? 'kerb0' : 'kerb1')
    span(L, c - h, k); span(c + h, R, k)
  } else {
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
  if (band) { const lane = Math.max(1, h * 0.022), dash = at('dash'); span(c - h / 3 - lane / 2, c - h / 3 + lane / 2, dash); span(c + h / 3 - lane / 2, c + h / 3 + lane / 2, dash) }
}

/** Under the horizon where no road is drawn: the water (the coast's sea on its side of the road's far end, `split`; the lake on its side; the bay all round the bridge), the land elsewhere; in the tunnel, its dark. */
export function farGround(d: Uint8ClampedArray, W: number, from: number, to: number, split: number, zone: RacingZone, tier: Tier, frame: number): void {
  const pal = palette(tier)[FOG_STEPS - 1]
  const sea = pal[colourIndex.sea0], sea1 = pal[colourIndex.sea1], land = pal[colourIndex.land], dark = pal[colourIndex.tunnel1], glint = pal[colourIndex.glint]
  const wet = world === 'coast' ? (x: number) => zone === 'causeway' || x < split : zone === 'lake' ? (x: number) => x < split : zone === 'bridge' ? () => true : () => false
  // the other worlds' land, less lost in the haze, in two colours: the forest's dark, the desert's sand, the city's dark streets
  const near = palette(tier)[Math.round(FOG_STEPS * 0.62)]
  const [l0, l1] = world === 'coast' ? [land, land] : world === 'mountain' ? [near[colourIndex.bush0], near[colourIndex.bush1]] : world === 'desert' ? [near[colourIndex.sand0], near[colourIndex.grass1]] : [near[colourIndex.land], near[colourIndex.wall]]
  for (let y = from; y < to; y += 1) for (let x = 0; x < W; x += 1) {
    const g = grain(x, y + ((frame >> 3) & 63) * 7)
    const rgb = zone === 'tunnel' ? dark : !wet(x) ? (grain(x >> 1, y >> 1) > 0.5 ? l0 : l1) : g > 0.992 ? glint : y % 3 === 0 ? sea1 : sea
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

/**
 * A shop's front along the road between a stretch's two ends, `off` half
 * widths out, `high` tall: its picture's columns from `ua` (at the near
 * end) to `ub` (at the far end) laid along it, its rows up it, so it goes by
 * in perspective; its clear pixels left out; through the hour and the haze.
 */
export function facadePiece(buffer: PixelBuffer, a: End, b: End, off: number, high: number, clip: number, tex: PixelBuffer, ua: number, ub: number, tint: { rgb: RGB; by: number }): void {
  const xa = a.x + off * a.u, xb = b.x + off * b.u
  const from = Math.max(0, Math.round(Math.min(xa, xb))), to = Math.min(buffer.width - 1, Math.round(Math.max(xa, xb)))
  const d = buffer.data, s = tex.data, W = buffer.width, tw = tex.width, th = tex.height, bottom = Math.min(clip, buffer.height)
  const [tr, tg, tb] = tint.rgb, k = tint.by
  for (let x = from; x <= to; x += 1) {
    const t = xb === xa ? 0 : (x - xa) / (xb - xa)
    const foot = a.y + (b.y - a.y) * t, u = a.u + (b.u - a.u) * t, top = foot - high * u, span = Math.max(1, foot - top)
    const col = Math.max(0, Math.min(tw - 1, Math.floor(ua + (ub - ua) * t)))
    for (let y = Math.max(0, Math.round(top)); y < Math.min(bottom, Math.round(foot)); y += 1) {
      const row = Math.max(0, Math.min(th - 1, Math.floor(((y - top) / span) * th))), o = (row * tw + col) * 4
      if (s[o + 3] < 128) continue
      const q = (y * W + x) * 4
      d[q] = s[o] + (tr - s[o]) * k; d[q + 1] = s[o + 1] + (tg - s[o + 1]) * k; d[q + 2] = s[o + 2] + (tb - s[o + 2]) * k
    }
  }
}

/** A shop's side facing the road ahead, at its near end `a`: from its front (`off`, negative on the left) back `depth` half widths away from the road, `high` tall; its walls in shade, a window or two a floor (lit after dark), the roof's edge on top. */
export function shopSide(buffer: PixelBuffer, a: End, off: number, depth: number, high: number, clip: number, wall: string, floors: number, lit: boolean, tint: { rgb: RGB; by: number }): void {
  const xa = a.x + off * a.u, xb = a.x + (off + Math.sign(off) * depth) * a.u, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), top = a.y - high * a.u
  const paint = (c: string) => { const [r, g, b] = rgbOf(c); return `#${[r, g, b].map((v, i) => Math.round(v + (tint.rgb[i] - v) * tint.by).toString(16).padStart(2, '0')).join('')}` }
  const side = paint(mix(wall, '#2a1a3a', 0.32)), edge = paint(mix(wall, '#ffffff', 0.2)), glass = paint(lit ? '#ffd690' : '#2a3a62'), foot = paint(mix(wall, '#2a1a3a', 0.5))
  const W = x1 - x0, H = a.y - top
  if (W < 1 || H < 2) return
  fill(buffer, x0, top, W, H, side, clip)
  fill(buffer, x0, top, W, Math.max(1, H * 0.05), edge, clip)
  fill(buffer, x0, a.y - Math.max(1, H * 0.06), W, Math.max(1, H * 0.06), foot, clip)
  for (let f = 0; f < floors; f += 1) {
    const fy = top + H * (0.12 + (f / Math.max(1, floors)) * 0.8), fh = (H * 0.8) / Math.max(1, floors)
    for (const k of [0.22, 0.6]) fill(buffer, x0 + W * k, fy + fh * 0.15, W * 0.2, fh * 0.45, glass, clip)
  }
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

/** A row of column numbers, kept for the next picture drawn. */
let columnRow = new Int32Array(512)
const columns = (n: number) => { if (columnRow.length < n) columnRow = new Int32Array(n * 2); return columnRow }

/** A traced picture's pixels onto the buffer at `x`, `y`, leaving out its clear ones; drawn `w` × `h` (each pixel taken from the nearest), its own size if not given; no row at or under `clip`; mirrored if asked; through the haze and the hour (`tint`, `by`) if asked; its top pushed aside by `sway` pixels, as a palm in the wind, its foot not. */
export function drawArt(buffer: PixelBuffer, pic: PixelBuffer, x: number, y: number, w = pic.width, h = pic.height, clip = buffer.height, flip = false, tint?: RGB, by = 0, sway = 0): void {
  const sx = pic.width / w, sy = pic.height / h, d = buffer.data, s = pic.data
  const x0 = Math.round(x), y0 = Math.round(y), W = Math.round(w), H = Math.round(h)
  const bottom = Math.min(buffer.height, clip)
  const k = tint && by > 0.01 ? by : 0
  if (W <= 0 || H <= 0) return
  // each column's pixel in the picture, worked out once
  const cols = columns(W)
  for (let xx = 0; xx < W; xx += 1) cols[xx] = Math.min(pic.width - 1, Math.floor(((flip ? W - 1 - xx : xx) + 0.5) * sx)) * 4
  const tr = k ? tint![0] : 0, tg = k ? tint![1] : 0, tb = k ? tint![2] : 0, BW = buffer.width
  for (let yy = 0; yy < H; yy += 1) {
    const ty = y0 + yy
    if (ty < 0) continue
    if (ty >= bottom) break
    const row = Math.min(pic.height - 1, Math.floor((yy + 0.5) * sy)) * pic.width * 4
    const lean = sway ? Math.round(sway * (1 - yy / H) ** 2) : 0
    const from = Math.max(0, -(x0 + lean)), to = Math.min(W, BW - x0 - lean)
    for (let xx = from, t = (ty * BW + x0 + lean + from) * 4; xx < to; xx += 1, t += 4) {
      const o = row + cols[xx]
      if (s[o + 3] < 128) continue
      if (k) { d[t] = s[o] + (tr - s[o]) * k; d[t + 1] = s[o + 1] + (tg - s[o + 1]) * k; d[t + 2] = s[o + 2] + (tb - s[o + 2]) * k }
      else { d[t] = s[o]; d[t + 1] = s[o + 1]; d[t + 2] = s[o + 2] }
      d[t + 3] = 255
    }
  }
}

/** How a traced picture is darkened for an hour in each world, before the haze: none in the picture's light, the city's a little as its night is. */
const HOUR_TINTS: Record<RacingWorld, Array<{ rgb: RGB; by: number }>> = {
  coast: [{ rgb: hex('#2a1640'), by: 0 }, { rgb: hex('#2a1640'), by: 0.3 }, { rgb: hex('#0a0a24'), by: 0.55 }, { rgb: hex('#141824'), by: 0.6 }],
  mountain: [{ rgb: hex('#6a3020'), by: 0 }, { rgb: hex('#6a3020'), by: 0.2 }, { rgb: hex('#0a0a24'), by: 0.55 }, { rgb: hex('#5a6278'), by: 0.45 }],
  desert: [{ rgb: hex('#6a2420'), by: 0 }, { rgb: hex('#6a2420'), by: 0.22 }, { rgb: hex('#0a0a24'), by: 0.55 }, { rgb: hex('#4a2a1c'), by: 0.5 }],
  city: [{ rgb: hex('#140e34'), by: 0.22 }, { rgb: hex('#120c30'), by: 0.3 }, { rgb: hex('#0a0a24'), by: 0.4 }, { rgb: hex('#141824'), by: 0.55 }],
}
/** The tint for a picture at an hour and a haze step: the hour's darkness and the haze together. */
export function tintFor(h: Tier, fog: number): { rgb: RGB; by: number } {
  const tints = HOUR_TINTS[world]
  const hourT = between(h, (k) => tints[k], (a, b, t) => ({ rgb: lerp(a.rgb, b.rgb, t), by: a.by + (b.by - a.by) * t }))
  const f = (fog / (FOG_STEPS - 1)) * hazeMaxAt(h)
  const by = 1 - (1 - hourT.by) * (1 - f)
  if (by < 0.01) return { rgb: hourT.rgb, by: 0 }
  // the mix of the two, weighted by how much each darkens
  const rgb = lerp(hourT.rgb, hazeAt(h), f / Math.max(0.0001, hourT.by + f))
  return { rgb, by }
}

/** Fills a rectangle (fractions allowed), no row at or under `clip`. */
function fill(buffer: PixelBuffer, x: number, y: number, w: number, h: number, colour: string, clip: number): void {
  const x0 = Math.max(0, Math.round(x)), x1 = Math.min(buffer.width, Math.max(Math.round(x + w), Math.round(x) + 1)), y0 = Math.max(0, Math.round(y)), y1 = Math.min(clip, buffer.height, Math.round(y + h))
  const [r, g, b] = rgbOf(colour), d = buffer.data, W = buffer.width
  for (let yy = y0; yy < y1; yy += 1) for (let xx = x0, t = (yy * W + x0) * 4; xx < x1; xx += 1, t += 4) { d[t] = r; d[t + 1] = g; d[t + 2] = b; d[t + 3] = 255 }
}
const disc = (buffer: PixelBuffer, cx: number, cy: number, r: number, colour: string, clip: number) => {
  const [cr, cg, cb] = rgbOf(colour), d = buffer.data, W = buffer.width
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(Math.ceil(cy + r), clip - 1, buffer.height - 1); y += 1) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(Math.ceil(cx + r), W - 1); x += 1) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) { const t = (y * W + x) * 4; d[t] = cr; d[t + 1] = cg; d[t + 2] = cb; d[t + 3] = 255 }
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

/** The city's lamp: a dark post, a crossbar, its white globe; lit after dark, a warm glow round it. */
export function globeLamp(buffer: PixelBuffer, x: number, y: number, u: number, clip: number, tier: Tier, fog: number, lit: boolean): void {
  const high = 1.9 * u, post = Math.max(1, 0.05 * u)
  if (high < 4) return
  const pole = shade('rockDark', tier, fog), r = Math.max(1, 0.12 * u)
  fill(buffer, x - post / 2, y - high, post, high, pole, clip)
  fill(buffer, x - post * 1.5, y - Math.max(2, 0.12 * u), post * 3, Math.max(1, 0.12 * u), pole, clip)
  disc(buffer, x, y - high - r * 0.6, r, lit ? '#fff2c8' : mix('#e8e4dc', hexOf(hazeAt(tier)), fog / FOG_STEPS), clip)
  if (lit) glow(buffer, x, y - high - r * 0.6, r * 5, '#ffc070', 0.5, clip)
}

/** Traffic lights over the road at a stretch (`a` its near end): a post on the right, its arm over the lanes, two lights hanging from it, red, amber and green in turn. */
export function trafficLights(buffer: PixelBuffer, a: End, clip: number, tier: Tier, fog: number, frame: number, look: number): void {
  const u = a.u, high = 2.5 * u, post = Math.max(1, 0.06 * u)
  if (high < 6) return
  const pole = shade('rockDark', tier, fog), x = a.x + 1.95 * u, top = a.y - high
  fill(buffer, x - post / 2, top, post, high, pole, clip)
  fill(buffer, a.x - 0.4 * u, top, x - (a.x - 0.4 * u), Math.max(1, post * 0.8), pole, clip)
  const on = ((frame >> 7) + look) % 3, colours = ['#ff3a2a', '#ffb020', '#3aff6a']
  for (const at of [0.05, 1.05]) {
    const bx = a.x + at * u, bw = Math.max(2, 0.18 * u), bh = bw * 2.6, by = top + post
    fill(buffer, bx - bw / 2 - 1, by - 1, bw + 2, bh + 2, '#0c0c14', clip)
    fill(buffer, bx - bw / 2, by, bw, bh, '#1c1c28', clip)
    for (let k = 0; k < 3; k += 1) {
      const cy = by + bh * (0.2 + k * 0.3), r = Math.max(0.6, bw * 0.3)
      disc(buffer, bx, cy, r, k === on ? colours[k] : '#3a3040', clip)
      if (k === on && bw > 3) glow(buffer, bx, cy, r * 4, colours[k], 0.45, clip)
    }
  }
}

/** A light's pool on the road under a lamp, after dark. */
export function lampPool(buffer: PixelBuffer, x: number, y: number, u: number, clip: number): void {
  glow(buffer, x, y, 0.9 * u, '#ffc890', 0.32, clip, 0.22)
}

/** A bush's picture, made once: three round clumps, dark below, lit on top. */
let bushPic: PixelBuffer | null = null
function bushPicture(): PixelBuffer {
  if (bushPic) return bushPic
  const w = 28, h = 20, out = new PixelBuffer(w, h, '#000000')
  out.data.fill(0)
  const dark = hexOf(hex(BASE.bush0)), mid = hexOf(hex(BASE.bush1)), lit = hexOf(hex(BASE.grass0)), r = 7
  for (const [dx, dy, k] of [[-0.55, -0.85, 0.85], [0.55, -0.8, 0.8], [0, -1.25, 1]] as const) {
    const cx = w / 2 + dx * r, cy = h + dy * r
    disc(out, cx, cy, r * k, dark, h)
    disc(out, cx - r * 0.12, cy - r * 0.18, r * k * 0.72, mid, h)
    disc(out, cx - r * 0.25, cy - r * 0.35, r * k * 0.32, lit, h)
  }
  bushPic = out
  return out
}
/** A bush on the land, `u` pixels to a half width, its foot at `y`, through the hour and the haze. */
export function shrub(buffer: PixelBuffer, cx: number, y: number, u: number, flip: boolean, clip: number, tier: Tier, fog: number): void {
  const h = 0.52 * u
  if (h < 2) return
  const pic = bushPicture(), w = (pic.width * h) / pic.height, { rgb, by } = tintFor(tier, fog)
  drawArt(buffer, pic, cx - w / 2, y - h, w, h, clip, flip, rgb, by)
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
  const dark = mix('#7a0c10', hexOf(hazeAt(tier)), (fog / FOG_STEPS) * 0.6), red = mix('#c81a1a', hexOf(hazeAt(tier)), (fog / FOG_STEPS) * 0.6)
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

/** The size of each car's picture to use for a width on the screen. */
const sizeFor = (width: number) => (width > 112 ? 130 : width > 70 ? 104 : 60)

/**
 * A car seen from behind, `width` wide on the screen (its back), its foot at
 * `foot`, its middle at `cx`: straight, or turning (`turn` −1 left, 1
 * right) with its flank showing; its shadow on the road under it; through
 * the hour and the haze.
 */
export function drawCar(buffer: PixelBuffer, kind: RacingCarKind, cx: number, foot: number, width: number, options: { turn?: -1 | 0 | 1; clip?: number; tier?: Tier; fog?: number; lights?: boolean } = {}): void {
  const turn = options.turn ?? 0, clip = options.clip ?? buffer.height, size = sizeFor(width)
  const straightName = `car-${kind}-${size}` as RacingArtName, turnName = `car-${kind}-${size}-turn` as RacingArtName
  const straight = racingArt(straightName)
  if (!straight || width < 2) return
  const turnPic = turn ? racingArt(turnName) : null
  const pic = turnPic ?? straight
  // the back is the straight picture's width; a turning picture's flank (or lean) reaches past it
  const scale = width / straight.width, w = Math.max(2, Math.round(pic.width * scale)), h = Math.max(1, Math.round(pic.height * scale))
  const x0 = turnPic && turn < 0 ? Math.round(cx + width / 2 - w) : Math.round(cx - width / 2)
  glow(buffer, cx, foot - 1, width * 0.58, '#0a0814', 0.55, clip, 0.13)
  const { rgb, by } = tintFor(options.tier ?? 0, options.fog ?? 0)
  drawArt(buffer, pic, x0, Math.round(foot - h), w, h, clip, !!turnPic && turn < 0, rgb, by)
  // after dark, its rear lights
  if (options.lights && kind !== 'burger' && width > 8) for (const side of [-1, 1]) glow(buffer, cx + side * width * 0.32, foot - h * 0.52, Math.max(2, width * 0.14), '#ff2a2a', 0.5, clip)
}

/** An everyday car of the traffic, `width` wide on the screen (with its share of a racing car's width), as `drawCar` draws the racing ones. */
export function drawTraffic(buffer: PixelBuffer, model: TrafficModel, colour: number, cx: number, foot: number, width: number, options: { turn?: -1 | 0 | 1; clip?: number; tier?: Tier; fog?: number; lights?: boolean } = {}): void {
  const turn = options.turn ?? 0, clip = options.clip ?? buffer.height
  const back = width * TRAFFIC_WIDTH[model]
  if (back < 2) return
  const { pic, back: steps } = trafficPicture(model, colour, turn !== 0, back)
  const scale = back / steps, w = Math.max(2, Math.round(pic.width * scale)), h = Math.max(1, Math.round(pic.height * scale * (TRAFFIC_SQUASH[model] ?? 1)))
  const x0 = turn < 0 ? Math.round(cx + back / 2 - w) : Math.round(cx - back / 2)
  glow(buffer, cx, foot - 1, back * 0.58, '#0a0814', 0.55, clip, 0.13)
  const { rgb, by } = tintFor(options.tier ?? 0, options.fog ?? 0)
  drawArt(buffer, pic, x0, Math.round(foot - h), w, h, clip, turn < 0, rgb, by)
  if (options.lights && back > 8) for (const [fx, fy] of TRAFFIC_LIGHTS[model]) glow(buffer, cx + (fx - 0.5) * back, foot - h + fy * h, Math.max(2, back * 0.12), '#ff2a2a', 0.5, clip)
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
