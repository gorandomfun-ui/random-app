/**
 * RANDOM ATTACKS' title screen, first sketch: a dine-in restaurant on Mars
 * with a few space details — portholes, landing legs, a dish and an
 * antenna on the roof — a rocket in neon on its pylon, the chef in front
 * with a bottle of ketchup and one of mustard held like two pistols, and in
 * the sky the burgers coming down in formation. ATTACKS over it all, in
 * perspective like a film's title, deep, its face in bands like the old
 * consoles' titles, a cream contour and an ink outline; in the theme's
 * colour. Two letterings to choose from (`zen`, `crisis`). RANDOM, LEVEL and
 * BEST stand where they stand on the other games' titles.
 */

import { ATTACKS_LETTERING, type AttacksLettering } from './attacks-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { secondNeon } from './logos'
import { dim, dither, drawText7, mix, PixelBuffer, text7Width } from './pixels'
import { rng, stars } from './scenes'
import { infoLine, pressStart } from './ui'

export type { AttacksLettering }
type Layout = 'landscape' | 'portrait'

const CREAM = '#f8f5e6'
const INK = '#0a0a14'
const KEY = '#ff00ff'

// ---------------------------------------------------------------- the title

type Mask = { w: number; h: number; data: Uint8Array }
const masks = new Map<AttacksLettering, Mask>()
function maskOf(name: AttacksLettering): Mask {
  let mask = masks.get(name)
  if (mask) return mask
  const spec = ATTACKS_LETTERING[name]
  const data = new Uint8Array(spec.width * spec.height)
  spec.runs.split(' ').forEach((row, y) => {
    let x = 0, on = false
    for (const k of row.split('.')) { const n = parseInt(k, 36); if (on) data.fill(1, y * spec.width + x, y * spec.width + x + n); x += n; on = !on }
  })
  mask = { w: spec.width, h: spec.height, data }
  masks.set(name, mask)
  return mask
}

/** A mask grown by one pixel in the eight directions, `times` times. */
function grow(m: Mask, times: number): Mask {
  let cur = m.data
  for (let t = 0; t < times; t += 1) {
    const next = new Uint8Array(cur)
    for (let y = 0; y < m.h; y += 1) for (let x = 0; x < m.w; x += 1) {
      if (cur[y * m.w + x]) continue
      for (let dy = -1; dy <= 1 && !next[y * m.w + x]; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const X = x + dx, Y = y + dy
        if (X >= 0 && Y >= 0 && X < m.w && Y < m.h && cur[Y * m.w + X]) { next[y * m.w + x] = 1; break }
      }
    }
    cur = next
  }
  return { w: m.w, h: m.h, data: cur }
}

/** `top`: the top's width, a fraction of the bottom's; `stretch`: taller letters than the font's, for a narrow screen; `depth` in pixels. */
export type AttacksLogoOptions = { top?: number; depth?: number; stretch?: number }

const faceHeight = (src: Mask, width: number, stretch = 1) => Math.round(width * (src.h / src.w) * 0.95 * stretch)
const depthOf = (face: number, options: AttacksLogoOptions) => options.depth ?? Math.round(face * 0.3)

/** How tall the title stands, all in, for a width: the face, its depth, the contour and the outline. */
export function attacksLogoHeight(name: AttacksLettering, width: number, options: AttacksLogoOptions = {}): number {
  const face = faceHeight(maskOf(name), width, options.stretch)
  return face + depthOf(face, options) + 8
}

/**
 * ATTACKS laid back like a film's title: the bottom `width` wide, the top
 * narrower (`top`, a fraction), the rows nearer the top drawn closer
 * together as true perspective does. Under it its depth, converging; around
 * the face a cream contour; around everything an ink outline. The face in
 * bands from cream to the colour, a thin line where each band meets the next.
 */
export function drawAttacksLogo(buffer: PixelBuffer, cx: number, y: number, width: number, accent: string, name: AttacksLettering, options: AttacksLogoOptions = {}): void {
  // the title does not move: worked out once for a lettering, a colour and a size, then only laid down
  const key = `${name}|${accent}|${width}|${options.top ?? ''}|${options.depth ?? ''}|${options.stretch ?? ''}`
  let pixels = logos.get(key)
  if (!pixels) { pixels = logoPixels(width, accent, name, options); logos.set(key, pixels) }
  const ox = Math.round(cx), oy = Math.round(y)
  for (const [dx, dy, color] of pixels) buffer.set(ox + dx, oy + dy, color)
}

const logos = new Map<string, Array<[number, number, string]>>()

/** The title's pixels, as offsets from its top centre. */
function logoPixels(width: number, accent: string, name: AttacksLettering, options: AttacksLogoOptions): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = []
  const cx = 0, y = 0
  const src = maskOf(name)
  const r = options.top ?? 0.72
  const faceH = faceHeight(src, width, options.stretch)
  const depth = depthOf(faceH, options)
  const k = 1 / r - 1
  const bottom = y + faceH
  const horizon = bottom - faceH / (1 - r)
  const pad = 6
  const box = { x: Math.floor(cx - width / 2) - pad, y: y - pad, w: Math.ceil(width) + pad * 2, h: faceH + depth + pad * 2 }
  const at = (X: number, Y: number) => (Y - box.y) * box.w + (X - box.x)
  // the face, read through the perspective, four samples a pixel; and how far down the letters each pixel is (v)
  const face = new Uint8Array(box.w * box.h)
  const vOf = new Float32Array(box.w * box.h)
  for (let Y = y; Y < bottom; Y += 1) {
    for (let X = box.x; X < box.x + box.w; X += 1) {
      let n = 0, vs = 0
      for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) {
        const z = (bottom - horizon) / (Y + oy - horizon)
        const v = 1 - (z - 1) / k
        const u = 0.5 + ((X + ox - cx) * z) / width
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
        if (src.data[Math.floor(v * src.h) * src.w + Math.floor(u * src.w)]) { n += 1; vs += v }
      }
      if (n >= 2) { face[at(X, Y)] = 1; vOf[at(X, Y)] = vs / n }
    }
  }
  // the depth: the face pushed down a pixel at a time, drawing in toward a point below the middle
  const layer = new Uint8Array(box.w * box.h)
  for (let i = depth; i >= 1; i -= 1) {
    const pull = 1 - i * 0.0032
    for (let Y = y; Y < bottom; Y += 1) for (let X = box.x; X < box.x + box.w; X += 1) {
      if (!face[at(X, Y)]) continue
      const DX = Math.round(cx + (X - cx) * pull), DY = Y + i
      if (DX < box.x || DX >= box.x + box.w || DY >= box.y + box.h) continue
      layer[at(DX, DY)] = i
    }
  }
  const faceMask: Mask = { w: box.w, h: box.h, data: face }
  const contour = grow(faceMask, 2)
  const all = new Uint8Array(box.w * box.h)
  for (let i = 0; i < all.length; i += 1) all[i] = contour.data[i] || layer[i] ? 1 : 0
  const outline = grow({ w: box.w, h: box.h, data: all }, 2)
  // the depth's tones: lit near the face, dark at the back; the face's bands
  const near = mix(dim(accent, 0.62), INK, 0.1), mid = dim(accent, 0.45), far = mix(dim(accent, 0.28), INK, 0.3)
  const bands: Array<[number, string]> = [[0, CREAM], [0.17, mix(accent, CREAM, 0.72)], [0.35, mix(accent, CREAM, 0.45)], [0.53, accent], [0.8, dim(accent, 0.8)]]
  const line = (i: number) => (i <= 2 ? mix(accent, CREAM, 0.25) : dim(accent, 0.62))
  const bandOf = (v: number) => { let b = 0; for (let i = 0; i < bands.length; i += 1) if (v >= bands[i][0]) b = i; return b }
  for (let Y = box.y; Y < box.y + box.h; Y += 1) for (let X = box.x; X < box.x + box.w; X += 1) {
    const i = at(X, Y)
    if (!outline.data[i]) continue
    let color = INK
    if (face[i]) {
      const b = bandOf(vOf[i])
      const above = Y > y && face[i - box.w] ? bandOf(vOf[i - box.w]) : b
      color = above !== b ? line(b) : bands[b][1]
    } else if (contour.data[i]) color = CREAM
    else if (layer[i]) {
      const t = layer[i] / depth
      color = t < 0.4 ? (dither(X, Y, t / 0.4) ? mid : near) : dither(X, Y, (t - 0.4) / 0.6) ? far : mid
    }
    out.push([X, Y, color])
  }
  return out
}

// ---------------------------------------------------------------- figures with an ink outline

/** Something drawn on its own, then given an ink outline and laid on the scene, its feet at `x`, `y`. */
function figure(buffer: PixelBuffer, x: number, y: number, w: number, h: number, draw: (f: PixelBuffer) => void): void {
  const f = new PixelBuffer(w, h, KEY)
  draw(f)
  const solid = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && f.hex(X, Y) !== KEY
  const edges: Array<[number, number]> = []
  for (let Y = 0; Y < h; Y += 1) for (let X = 0; X < w; X += 1) if (!solid(X, Y) && (solid(X - 1, Y) || solid(X + 1, Y) || solid(X, Y - 1) || solid(X, Y + 1))) edges.push([X, Y])
  for (const [X, Y] of edges) f.set(X, Y, INK)
  buffer.stamp(f, Math.round(x - w / 2), Math.round(y - h), KEY)
}

/** The chef, standing: a tall toque, a white double-breasted jacket, checked trousers, ketchup up in one hand and mustard in the other. */
function chef(buffer: PixelBuffer, x: number, feet: number, frame: number): void {
  figure(buffer, x, feet, 64, 104, (f) => {
    const white = '#f6f4ee', shade = '#c9c6d4', skin = '#f2b98e', skinDark = '#c98760', hair = '#4a2a1a'
    // shoes and checked trousers
    f.rect(19, 98, 10, 5, '#16141c'); f.rect(35, 98, 10, 5, '#16141c')
    for (let yy = 70; yy < 98; yy += 1) for (let xx = 20; xx < 44; xx += 1) {
      if (xx >= 30 && xx < 34 && yy > 74) continue
      f.set(xx, yy, (Math.floor(xx / 2) + Math.floor(yy / 2)) % 2 ? '#2a2836' : '#d8d6e0')
    }
    // the jacket: double-breasted, two rows of buttons, a red neckerchief
    f.poly([[17, 40], [47, 40], [48, 72], [16, 72]], white)
    f.rect(16, 66, 32, 6, shade)
    f.rect(31, 42, 2, 28, shade)
    for (const by of [46, 54, 62]) { f.rect(26, by, 2, 2, '#3a3646'); f.rect(36, by, 2, 2, '#3a3646') }
    f.poly([[24, 36], [40, 36], [36, 44], [28, 44]], '#e0301e'); f.rect(30, 42, 4, 4, '#b81e14')
    // arms: out from the shoulders, down to the elbows, the forearms up, a bottle in each hand
    f.rect(9, 40, 9, 5, white); f.rect(7, 40, 5, 16, white); f.rect(7, 52, 5, 3, shade)
    f.rect(46, 40, 9, 5, white); f.rect(52, 40, 5, 16, white); f.rect(52, 52, 5, 3, shade)
    f.disc(9.5, 38, 3.2, skin); f.disc(54.5, 38, 3.2, skin)
    const bottle = (bx: number, body: string, dark: string) => {
      f.rect(bx - 3, 17, 7, 19, body); f.rect(bx + 2, 18, 2, 17, dark)
      f.rect(bx - 3, 24, 7, 5, white); f.rect(bx - 1, 25, 2, 3, body)
      f.rect(bx - 2, 13, 5, 4, white); f.rect(bx - 1, 8, 3, 5, body)
    }
    bottle(9, '#e0301e', '#9a1a12'); bottle(54, '#ffcc33', '#c89a10')
    // a squirt going up from the ketchup, on every other moment
    if (frame % 2 === 0) for (let d = 0; d < 4; d += 1) f.rect(9, 1 + d * 2, 2, 1, '#ff5a3c')
    // the head: a round face, a curled moustache, eyes, a rosy cheek
    f.disc(32, 27, 8, skin)
    f.rect(26, 31, 12, 2, skinDark)
    f.rect(27, 29, 4, 2, hair); f.rect(33, 29, 4, 2, hair); f.set(26, 28, hair); f.set(37, 28, hair)
    f.rect(28, 24, 2, 2, INK); f.rect(34, 24, 2, 2, INK)
    f.set(26, 27, '#f08a7a'); f.set(38, 27, '#f08a7a')
    // the toque: a band, a tall puff
    f.rect(23, 15, 18, 5, white); f.rect(23, 18, 18, 1, shade)
    f.disc(26, 9, 6, white); f.disc(38, 9, 6, white); f.disc(32, 6, 7.5, white)
    f.rect(26, 11, 12, 5, white)
    f.disc(36, 10, 2.5, shade); f.disc(27, 12, 1.5, shade)
  })
}

/** A burger come from space: eyes on stalks, a sesame bun, cheese dripping like fangs, little legs. */
function invader(buffer: PixelBuffer, x: number, y: number, frame: number, kind = 0): void {
  figure(buffer, x, y, 30, 28, (f) => {
    const bun = ['#e0a050', '#d88a3a', '#e8b860'][kind % 3], bunLight = mix(bun, '#fff4d0', 0.45)
    // stalks and eyes
    const lean = frame % 2 ? 1 : 0
    f.line(11, 8, 9 - lean, 2, '#3f9a6a'); f.line(19, 8, 21 + lean, 2, '#3f9a6a')
    f.disc(9 - lean, 2.5, 2.4, '#ffffff'); f.disc(21 + lean, 2.5, 2.4, '#ffffff')
    f.set(9 - lean, 3, INK); f.set(21 + lean, 3, INK)
    // the bun's dome, its light, sesame
    for (let yy = 6; yy < 15; yy += 1) for (let xx = 3; xx < 27; xx += 1) if (((xx + 0.5 - 15) / 12) ** 2 + ((yy + 0.5 - 15) / 9) ** 2 <= 1) f.set(xx, yy, yy < 10 && xx < 16 ? bunLight : bun)
    for (const [sx, sy] of [[9, 10], [14, 8], [19, 10], [23, 12], [12, 12]]) f.set(sx, sy, '#fff8e0')
    // cheese with its drips, lettuce, the patty with a grin, the bottom bun
    f.rect(3, 15, 24, 2, '#ffcc33'); f.rect(6, 17, 2, 2, '#ffcc33'); f.rect(14, 17, 2, 3, '#ffcc33'); f.rect(22, 17, 2, 2, '#ffcc33')
    for (let xx = 2; xx < 28; xx += 1) f.set(xx, 17 + ((xx >> 1) % 2), '#4cb05a')
    f.rect(3, 18, 24, 3, '#6a3a1e'); f.rect(9, 19, 12, 1, '#2a1208')
    f.rect(4, 21, 22, 3, bun); f.rect(5, 23, 20, 1, dim(bun, 0.75))
    // legs, stepping
    const step = frame % 2 ? 1 : -1
    f.rect(8 + step, 24, 2, 3, '#3f9a6a'); f.rect(20 - step, 24, 2, 3, '#3f9a6a')
  })
}

/** What the burgers throw down: an onion ring, a tomato slice, a strip of bacon, a pickle. */
function droplet(buffer: PixelBuffer, x: number, y: number, kind: number): void {
  if (kind === 0) { for (let yy = -4; yy <= 4; yy += 1) for (let xx = -4; xx <= 4; xx += 1) { const d = Math.hypot(xx, yy); if (d <= 3.6 && d >= 1.8) buffer.set(x + xx, y + yy, d > 3 ? '#d8c8a0' : '#f4ecd0') } }
  else if (kind === 1) { buffer.disc(x, y, 3.5, '#e0301e'); buffer.set(x - 1, y - 1, '#ffd0a0'); buffer.set(x + 1, y + 1, '#ffd0a0') }
  else if (kind === 2) { for (let d = 0; d < 9; d += 1) buffer.rect(x - 1 + ((d >> 1) % 2), y - 4 + d, 3, 1, d % 3 ? '#d8505a' : '#f4a0a0') }
  else { buffer.disc(x, y, 3, '#3f8a3a'); buffer.disc(x, y, 1.5, '#9ad070') }
}

// ---------------------------------------------------------------- Mars

const MARS = {
  sky: ['#04030c', '#080516', '#0f0820', '#170b29', '#221030', '#2f1434', '#3e1836', '#511e36', '#672634', '#7c3032'],
  far: '#3b1b26', farLight: '#4e2430', mid: '#5c2628', midLight: '#74322c',
  ground: '#8a3f28', groundLight: '#a5532f', groundDark: '#6a2e20', groundDeep: '#4a2018',
  rock: '#5e2c22', rockLight: '#8e4c34',
}

function marsSky(buffer: PixelBuffer, horizon: number): void {
  const stops = MARS.sky
  for (let y = 0; y < buffer.height; y += 1) {
    const f = Math.min(stops.length - 1, (y / horizon) * (stops.length - 1))
    const i = Math.floor(f), frac = f - i, next = stops[Math.min(stops.length - 1, i + 1)]
    for (let x = 0; x < buffer.width; x += 1) buffer.set(x, y, dither(x, y, frac) ? next : stops[i])
  }
}

/** Phobos: lumpy, grey-brown, lit from the side, a big crater. */
function phobos(buffer: PixelBuffer, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r * 1.3); x <= cx + r * 1.3; x += 1) {
    const px = (x + 0.5 - cx) / (r * 1.3), py = (y + 0.5 - cy) / r
    const lump = 1 + 0.08 * Math.sin(px * 7) + 0.06 * Math.cos(py * 9)
    if (px * px + py * py > lump) continue
    buffer.set(x, y, px > 0.35 ? '#5e5048' : px > -0.2 ? '#8a7a6c' : '#a8988a')
  }
  buffer.disc(cx + r * 0.2, cy - r * 0.1, r * 0.32, '#6e6056'); buffer.disc(cx + r * 0.15, cy - r * 0.15, r * 0.22, '#5a4c44')
  buffer.disc(cx - r * 0.6, cy + r * 0.4, r * 0.14, '#7a6a5e')
}

/** The Earth, a blue dot with its halo. */
function earth(buffer: PixelBuffer, cx: number, cy: number): void {
  for (let d = 0; d < 9; d += 1) for (let a = 0; a < 24; a += 1) { const X = Math.round(cx + Math.cos(a / 3.8) * d), Y = Math.round(cy + Math.sin(a / 3.8) * d); if (dither(X, Y, 0.3 * (1 - d / 9))) buffer.tint(X, Y, '#8ac8ff', 0.25) }
  buffer.disc(cx, cy, 3, '#3a8ae8'); buffer.set(Math.round(cx) - 1, Math.round(cy) - 1, '#ffffff'); buffer.set(Math.round(cx), Math.round(cy) + 1, '#4cb05a')
}

/** Flat-topped hills on the horizon, two planes, each lit on its left edge. */
function mesas(buffer: PixelBuffer, base: number, shapes: ReadonlyArray<readonly [number, number, number, 0 | 1]>): void {
  for (const plane of [0, 1] as const) for (const [x, w, h, p] of shapes) {
    if (p !== plane) continue
    const color = plane === 0 ? MARS.far : MARS.mid, light = plane === 0 ? MARS.farLight : MARS.midLight
    const slope = Math.round(h * 0.35)
    buffer.poly([[x, base], [x + slope, base - h], [x + w - slope, base - h], [x + w, base]], color)
    buffer.rect(x + slope, base - h, w - slope * 2, 2, light)
    for (let d = 0; d < h; d += 1) buffer.set(Math.round(x + slope - (slope * d) / h), base - h + d, light)
    // strata
    for (let s = base - h + 8; s < base; s += 7) buffer.rect(x + slope + 2, s, w - slope * 2 - 4, 1, dim(color, 0.85))
  }
}

/** The plain: rolling dunes at the back, the ground nearer and redder, rocks and a crater, pebbles. */
function plain(buffer: PixelBuffer, ground: number, bottom: number, seed: number): void {
  const W = buffer.width
  for (let x = 0; x < W; x += 1) {
    const top = ground - 6 - Math.round(4 * Math.sin(x / 37) + 3 * Math.sin(x / 13 + 1))
    for (let y = top; y < bottom; y += 1) {
      const t = (y - ground) / (bottom - ground)
      const base = y < ground ? MARS.groundDark : dither(x, y, Math.max(0, Math.min(1, t * 1.4))) ? MARS.ground : MARS.groundDark
      buffer.set(x, y, base)
    }
    buffer.set(x, top, MARS.groundLight)
  }
  const next = rng(seed)
  for (let i = 0; i < 90; i += 1) {
    const x = Math.floor(next() * W), y = ground + 4 + Math.floor(next() * (bottom - ground - 6))
    const size = 1 + Math.floor(((y - ground) / (bottom - ground)) * 3 * next())
    buffer.rect(x, y, size + 1, size, MARS.rock); buffer.rect(x, y, size + 1, 1, MARS.rockLight)
  }
}

function rock(buffer: PixelBuffer, x: number, y: number, w: number, h: number): void {
  buffer.poly([[x, y], [x + w * 0.2, y - h], [x + w * 0.7, y - h * 1.05], [x + w, y]], MARS.rock)
  buffer.poly([[x + w * 0.2, y - h], [x + w * 0.45, y - h * 1.02], [x + w * 0.3, y - h * 0.4], [x + w * 0.1, y - h * 0.3]], MARS.rockLight)
  buffer.rect(x - 2, y, w + 4, 2, MARS.groundDeep)
}

function crater(buffer: PixelBuffer, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
    if (d > 1) continue
    buffer.set(x, y, d > 0.72 ? (y < cy ? MARS.groundDeep : MARS.groundLight) : y < cy - ry * 0.2 ? MARS.groundDeep : MARS.groundDark)
  }
}

/** A little rover parked on the plain: six wheels, a panel, a mast with its eye. */
function rover(buffer: PixelBuffer, x: number, ground: number, frame: number): void {
  figure(buffer, x, ground, 78, 50, (f) => {
    f.rect(8, 24, 60, 12, '#d8d8e0'); f.rect(8, 24, 60, 2, '#ffffff'); f.rect(8, 34, 60, 2, '#9a9aaa')
    f.rect(12, 20, 52, 4, '#2a3a8a'); for (let px = 14; px < 62; px += 6) f.rect(px, 21, 4, 2, '#4a6ad0')
    f.rect(54, 8, 3, 12, '#9a9aaa'); f.rect(50, 4, 11, 6, '#d8d8e0'); f.rect(57, 6, 3, 2, frame % 2 ? '#ff5a3c' : '#5aa8ff')
    f.rect(14, 12, 2, 8, '#9a9aaa'); f.disc(15, 11, 2.5, '#c8c8d0')
    for (const wx of [14, 30, 46, 62]) { f.disc(wx, 41, 6, '#2a2a34'); f.disc(wx, 41, 2.5, '#8a8a9a') }
    f.rect(10, 36, 56, 2, '#5a5a6a')
  })
}

/** The rocket in neon on its pylon: a dark board, the rocket drawn in tubes, its flame flickering, BURGERS under it. */
function rocketSign(buffer: PixelBuffer, x: number, ground: number, top: number, accent: string, frame: number): void {
  const second = secondNeon(accent)
  const chrome = '#c9ccd8', chromeDark = '#8a8ea4'
  // the pylon, up to the plate; two struts from the plate up to the rocket's fins
  buffer.rect(x - 3, top + 96, 6, ground - top - 96, chromeDark); buffer.rect(x - 3, top + 96, 2, ground - top - 96, chrome)
  buffer.rect(x - 14, ground - 6, 28, 6, chromeDark); buffer.rect(x - 14, ground - 6, 28, 1, chrome)
  for (const sx of [x - 16, x + 14]) { buffer.rect(sx, top + 54, 2, 20, chromeDark); buffer.rect(sx, top + 54, 1, 20, chrome) }
  // BURGERS on a plate, in neon letters
  buffer.rect(x - 32, top + 74, 64, 20, '#140c22'); buffer.rect(x - 32, top + 74, 64, 2, chromeDark); buffer.rect(x - 32, top + 92, 64, 2, chromeDark)
  drawText7(buffer, 'BURGERS', Math.round(x - text7Width('BURGERS') / 2), top + 80, mix(second, '#ffffff', 0.35))
  // the rocket: body, nose, fins, a porthole — in tubes with their glow
  const tube = (pts: Array<[number, number]>, color: string) => {
    for (let i = 0; i < pts.length; i += 1) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
      for (const [ox, oy, c, t] of [[0, -1, color, 0.25], [0, 1, color, 0.25], [-1, 0, color, 0.25], [1, 0, color, 0.25]] as const) {
        const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1)
        for (let s = 0; s <= steps; s += 1) buffer.tint(Math.round(ax + ((bx - ax) * s) / steps) + ox * 2, Math.round(ay + ((by - ay) * s) / steps) + oy * 2, c, t)
      }
      buffer.line(ax, ay, bx, by, color)
      buffer.line(ax + 1, ay, bx + 1, by, mix(color, '#ffffff', 0.55))
    }
  }
  const body: Array<[number, number]> = [[x, top], [x + 9, top + 14], [x + 10, top + 52], [x - 10, top + 52], [x - 9, top + 14]]
  buffer.poly(body, '#1c1430')
  tube(body, accent)
  tube([[x + 10, top + 38], [x + 20, top + 56], [x + 10, top + 52]], accent)
  tube([[x - 10, top + 38], [x - 20, top + 56], [x - 10, top + 52]], accent)
  buffer.disc(x, top + 26, 5, '#1c1430')
  for (let a = 0; a < 32; a += 1) buffer.set(Math.round(x + Math.cos(a / 5.1) * 5), Math.round(top + 26 + Math.sin(a / 5.1) * 5), mix(second, '#ffffff', 0.4))
  const flame = frame % 2 ? 16 : 11
  tube([[x - 6, top + 54], [x, top + 54 + flame], [x + 6, top + 54]], second)
}

/**
 * The restaurant: a stainless dine-in with rounded ends and a roof swept up
 * at both ends, its neon under the roof, big warm windows with booths,
 * portholes at the ends, an airlock of a door with its round window and
 * warning stripes, landing legs under it, a dish and an antenna on the roof.
 */
function marsDiner(buffer: PixelBuffer, x: number, width: number, ground: number, accent: string, frame: number): void {
  const roof = ground - 118
  const body = roof + 14, foot = ground - 14
  const steel = '#b8bccb', steelLight = '#dfe2ec', steelDark = '#8e92a6', steelDeep = '#5e6276'
  const end = 26
  // roof gear first: the dish, the antenna and its light, two tanks
  const dishX = x + Math.round(width * 0.24)
  buffer.rect(dishX - 2, roof - 8, 4, 8, steelDark)
  for (let yy = -12; yy <= 0; yy += 1) for (let xx = -14; xx <= 14; xx += 1) if ((xx / 14) ** 2 + ((yy + 6) / 7) ** 2 <= 1 && yy <= -6 + xx * 0.25) buffer.set(dishX + xx, roof - 12 + yy, xx < -4 ? steelLight : steel)
  buffer.rect(dishX + 2, roof - 22, 2, 8, steelDark); buffer.disc(dishX + 3, roof - 23, 2, '#ff5a3c')
  const antX = x + Math.round(width * 0.78)
  buffer.rect(antX, roof - 22, 2, 22, steelDark); for (const ay of [roof - 16, roof - 9]) buffer.rect(antX - 5, ay, 12, 1, steelDark)
  buffer.disc(antX + 1, roof - 24, 2.5, frame % 2 ? '#ff3a3a' : '#7a1a1a')
  for (const tx of [x + width * 0.55, x + width * 0.62]) { buffer.rect(Math.round(tx), roof - 12, 12, 12, steel); buffer.rect(Math.round(tx), roof - 12, 12, 2, steelLight); buffer.rect(Math.round(tx) + 9, roof - 10, 2, 10, steelDark) }
  // the body: rounded ends, ribbed stainless
  for (let yy = body; yy < foot; yy += 1) {
    const rib = (yy - body) % 6
    const tone = rib === 0 ? steelLight : rib === 5 ? steelDark : steel
    const inset = Math.max(0, end - Math.round(Math.sqrt(Math.max(0, end * end - (Math.max(0, body + end - yy)) ** 2))))
    buffer.rect(x + inset, yy, width - inset * 2, 1, tone)
  }
  // the roof, swept up at both ends, the neon under its edge
  buffer.poly([[x - 26, roof - 6], [x + width / 2, roof + 8], [x + width + 26, roof - 6], [x + width + 30, roof - 1], [x + width / 2, roof + 16], [x - 30, roof - 1]], '#2a2244')
  buffer.poly([[x - 26, roof - 6], [x + width / 2, roof + 8], [x + width + 26, roof - 6], [x + width + 27, roof - 4], [x + width / 2, roof + 10], [x - 27, roof - 4]], mix('#2a2244', '#ffffff', 0.25))
  for (let xx = x - 20; xx < x + width + 20; xx += 1) {
    const yy = Math.round(roof + 16 - Math.abs(xx - (x + width / 2)) * (14 / (width / 2 + 26)))
    buffer.set(xx, yy + 1, accent); buffer.set(xx, yy + 2, mix(accent, '#ffffff', 0.6)); buffer.set(xx, yy + 3, accent)
    for (let g = 4; g < 9; g += 1) if (dither(xx, yy + g, 0.5 - g * 0.05)) buffer.tint(xx, yy + g, accent, 0.35)
  }
  // the windows: warm, with booths and their lamps; portholes at the ends
  const doorW = 40, doorX = x + Math.round(width / 2 - doorW / 2)
  const winTop = body + 22, winBottom = foot - 26
  const panes: Array<[number, number]> = []
  for (const [a, b] of [[x + end + 6, doorX - 8], [doorX + doorW + 8, x + width - end - 6]] as const) {
    const n = Math.max(1, Math.round((b - a) / 46))
    for (let i = 0; i < n; i += 1) panes.push([a + Math.round(((b - a) * i) / n), a + Math.round(((b - a) * (i + 1)) / n)])
  }
  for (const [a, b] of panes) {
    const w = b - a - 4
    buffer.rect(a, winTop, w, winBottom - winTop, '#ffcf86')
    for (let yy = winTop; yy < winBottom; yy += 1) if (dither(a, yy, (yy - winTop) / (winBottom - winTop))) buffer.rect(a, yy, w, 1, '#f08a4a')
    const mid = a + Math.round(w / 2)
    buffer.rect(mid, winTop, 1, 6, '#3a2a2a'); buffer.poly([[mid - 5, winTop + 11], [mid - 3, winTop + 6], [mid + 4, winTop + 6], [mid + 6, winTop + 11]], accent)
    buffer.rect(a + 3, winBottom - 14, 8, 14, dim(accent, 0.75)); buffer.rect(a + w - 11, winBottom - 14, 8, 14, dim(accent, 0.75))
    buffer.rect(mid - 9, winBottom - 9, 18, 2, CREAM)
    buffer.rect(a - 3, winTop - 2, 3, winBottom - winTop + 4, steelLight)
  }
  buffer.rect(x + end, winTop - 3, width - end * 2, 2, steelDeep); buffer.rect(x + end, winBottom, width - end * 2, 3, steelDeep)
  for (const px of [x + end - 6, x + width - end + 6]) {
    buffer.disc(px, winTop + 14, 9, steelDeep); buffer.disc(px, winTop + 14, 7, '#ffcf86'); buffer.disc(px - 2, winTop + 12, 2, '#fff0c0')
  }
  // the band under the windows: the colour, with rivets
  buffer.rect(x + end - 10, winBottom + 3, width - (end - 10) * 2, foot - winBottom - 5, dim(accent, 0.7))
  for (let rx = x + end - 6; rx < x + width - end + 6; rx += 8) buffer.set(rx, winBottom + 8, mix(accent, '#ffffff', 0.5))
  // the door: an airlock, chrome frame, round window, warning stripes, OPEN in neon over it
  buffer.rect(doorX - 5, winTop - 8, doorW + 10, ground - winTop + 8, steelDark)
  buffer.rect(doorX - 5, winTop - 8, doorW + 10, 2, steelLight)
  buffer.rect(doorX, winTop - 3, doorW, ground - winTop + 3, '#1c1636')
  buffer.disc(doorX + doorW / 2, winTop + 14, 9, steelDeep); buffer.disc(doorX + doorW / 2, winTop + 14, 7, '#ffcf7a')
  for (let sx = doorX - 5; sx < doorX + doorW + 5; sx += 1) for (let sy = ground - 8; sy < ground - 3; sy += 1) buffer.set(sx, sy, Math.floor((sx + sy) / 4) % 2 ? '#ffcc33' : '#16141c')
  // the foot and its landing legs
  buffer.rect(x + 8, foot, width - 16, 4, steelDark); buffer.rect(x + 8, foot, width - 16, 1, steelLight)
  for (const lx of [x + 16, x + width - 16]) {
    const dir = lx < x + width / 2 ? -1 : 1
    buffer.line(lx, foot + 3, lx + dir * 12, ground - 1, steelDeep); buffer.line(lx + 1, foot + 3, lx + 1 + dir * 12, ground - 1, steelDark)
    buffer.rect(lx + dir * 12 - 5, ground - 2, 11, 3, steelDark)
  }
  buffer.rect(x + 20, foot + 4, width - 40, ground - foot - 4, '#2a2238')
}

// ---------------------------------------------------------------- the scene

type Place = {
  randomY: number; markY: number; markWidth: number
  horizon: number; ground: number; bottom: number
  diner: [number, number]; sign: [number, number]; rover: [number, number]
  phobos: [number, number, number]; deimos: [number, number]; earth: [number, number]
  formation: { x: number; y: number; cols: number; rows: number; gap: [number, number] }
  mesas: Array<readonly [number, number, number, 0 | 1]>
  rocks: Array<[number, number, number, number]>; crater: [number, number, number, number]
  press: number; info: 'top' | 'bottom'
}

const PLACES: Record<Layout, Place> = {
  landscape: {
    randomY: 16, markY: 64, markWidth: 600,
    horizon: 300, ground: 344, bottom: 432,
    diner: [234, 300], sign: [606, 176], rover: [92, 408],
    phobos: [700, 196, 13], deimos: [52, 176], earth: [146, 222],
    formation: { x: 214, y: 168, cols: 9, rows: 1, gap: [42, 30] },
    mesas: [[-20, 150, 52, 0], [90, 120, 34, 1], [470, 190, 60, 0], [600, 180, 40, 1], [-40, 90, 26, 1]],
    rocks: [[300, 420, 26, 14], [520, 398, 18, 10], [700, 426, 30, 16]], crater: [610, 380, 34, 9],
    press: 412, info: 'top',
  },
  portrait: {
    randomY: 196, markY: 244, markWidth: 412,
    horizon: 500, ground: 566, bottom: 768,
    diner: [126, 282], sign: [62, 400], rover: [330, 664],
    phobos: [370, 410, 14], deimos: [40, 380], earth: [400, 460],
    formation: { x: 62, y: 40, cols: 6, rows: 3, gap: [62, 46] },
    mesas: [[-30, 170, 60, 0], [250, 220, 76, 0], [80, 140, 36, 1], [330, 130, 30, 1]],
    rocks: [[40, 690, 30, 16], [190, 620, 18, 10], [250, 740, 36, 18]], crater: [120, 660, 40, 10],
    press: 724, info: 'bottom',
  },
}

export type AttacksTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean }

/** RANDOM ATTACKS' title, wide (768 × 432) or tall (432 × 768), in one of the two letterings. */
export function renderAttacksTitle(layout: Layout, accent: string, lettering: AttacksLettering, options: AttacksTitleOptions = {}): PixelBuffer {
  const W = layout === 'landscape' ? 768 : 432, H = layout === 'landscape' ? 432 : 768
  const buffer = new PixelBuffer(W, H, INK)
  const p = PLACES[layout]
  const frame = options.frame ?? 0
  marsSky(buffer, p.horizon)
  stars(buffer, 23, layout === 'landscape' ? 140 : 170, p.horizon - 40, frame)
  phobos(buffer, ...p.phobos)
  buffer.disc(p.deimos[0], p.deimos[1], 3.5, '#a89a8a'); buffer.set(p.deimos[0] - 1, p.deimos[1] - 1, '#d0c4b4')
  earth(buffer, ...p.earth)
  mesas(buffer, p.ground - 4, p.mesas)
  plain(buffer, p.ground, p.bottom, layout === 'landscape' ? 5 : 9)
  crater(buffer, ...p.crater)
  for (const [x, y, w, h] of p.rocks) rock(buffer, x, y, w, h)
  // the burgers coming down: the formation, and what they throw
  const f = p.formation
  const drift = (frame % 4) * 2
  for (let row = 0; row < f.rows; row += 1) for (let col = 0; col < f.cols; col += 1) {
    invader(buffer, f.x + col * f.gap[0] + drift, f.y + row * f.gap[1] + 28, frame + col, row)
  }
  const drops: Array<[number, number, number]> = layout === 'landscape'
    ? [[f.x + f.gap[0] * 2 + 15, f.y + 44, 0], [f.x + f.gap[0] * 5 + 15, f.y + 52, 1], [f.x + f.gap[0] * 7 + 15, f.y + 40, 2]]
    : [[f.x + 15, f.y + f.gap[1] * 3 + 10, 1], [f.x + f.gap[0] * 3 + 15, f.y + f.gap[1] * 3 + 22, 0], [f.x + f.gap[0] * 5 + 15, f.y + f.gap[1] * 3 + 6, 3]]
  for (const [x, y, kind] of drops) droplet(buffer, x + drift, y + (frame % 2) * 3, kind)
  // RANDOM where it stands on every title, ATTACKS under it
  const rx = Math.round(W / 2 - LOGO_WIDTH)
  drawLogo(buffer, rx + 3, p.randomY + 4, INK, 2)
  drawLogo(buffer, rx, p.randomY, mix(accent, CREAM, 0.25), 2)
  drawAttacksLogo(buffer, W / 2, p.markY, p.markWidth, accent, lettering, { stretch: layout === 'landscape' ? 1.05 : 1.5 })
  // the restaurant, its sign, the rover, the chef at the door
  rocketSign(buffer, p.sign[0], p.ground, p.sign[1], accent, frame)
  marsDiner(buffer, p.diner[0], p.diner[1], p.ground, accent, frame)
  rover(buffer, p.rover[0], p.rover[1], frame)
  chef(buffer, p.diner[0] + p.diner[1] / 2, p.ground + 8, frame)
  if (options.press !== false) pressStart(buffer, W / 2, p.press, accent, options.blink !== false, 2)
  const level = String(options.level ?? 1), best = String(options.best ?? 0).padStart(5, '0')
  if (p.info === 'top') {
    infoLine(buffer, 16, 16, 'LEVEL', level, 'left', 2)
    infoLine(buffer, W - 16, 16, 'BEST', best, 'right', 2)
  } else {
    infoLine(buffer, W / 2 - 14, p.press + 24, 'LEVEL', level, 'right', 2)
    infoLine(buffer, W / 2 + 14, p.press + 24, 'BEST', best, 'left', 2)
  }
  return buffer
}
