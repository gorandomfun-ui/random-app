/**
 * RANDOM ATTACKS' screens, sketched: the title and a moment of play.
 *
 * The title: night on Mars — a deep starry sky, a big banded planet and a
 * small moon, ranges of rock lit on their ridges over a blue haze, a plain
 * in layers of red — and a fast food of the fifties and sixties with a few
 * space details: a folded roof edged with diamonds, slanted glass showing
 * the counter and its stools, beams across the glass, a dish and an
 * antenna. Beside it RANDOM BURGER on its pylon, a rocket in volume tilted
 * over a starry disc; the chef next to the door, a friendly cook of those
 * days in his paper cap, with a touch of the future, ketchup and mustard in
 * hand; and far off, a swarm of burgers coming. ATTACKS over it all, laid
 * back like a film's title, deep, its face in bands, a cream contour and an
 * ink outline, in the theme's colour; two letterings to choose from (`zen`,
 * `crisis`). RANDOM, LEVEL and BEST stand where they do on the other games.
 *
 * The play: the chef at the bottom with his ketchup, three kinds of burgers
 * in rows, stacks of plates to hide behind, what each side throws, the
 * golden burger across the top, a bonus falling.
 */

import { ATTACKS_LETTERING, type AttacksLettering } from './attacks-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { dim, dither, drawText, drawText7, mix, PixelBuffer, text7Width, textWidth } from './pixels'
import { rng } from './scenes'
import { GREY, HUD_HEIGHT, infoLine, pressStart } from './ui'

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
const depthOf = (face: number, options: AttacksLogoOptions) => options.depth ?? Math.round(face * 0.45)

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
  const r = options.top ?? 0.75
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

// ---------------------------------------------------------------- drawing helpers

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

/** A thick stroke: discs along a line. */
function stroke(f: PixelBuffer, x0: number, y0: number, x1: number, y1: number, r: number, color: string): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let i = 0; i <= steps; i += 1) f.disc(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, r, color)
}

/** A number from 0 to 1 for a lattice point, always the same: never Math.random, which the page's draws share. */
function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth noise from 0 to 1, and its sum over a few octaves. */
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}
function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0
  for (let o = 0; o < octaves; o += 1) { sum += amp * noise(x * freq, y * freq, seed + o * 17); norm += amp; amp *= 0.5; freq *= 2 }
  return sum / norm
}

/** A colour from a ramp at `t` (0 to 1), dithered between two neighbours. */
function ramp(colors: readonly string[], t: number, x: number, y: number): string {
  const f = Math.max(0, Math.min(colors.length - 1.001, t * (colors.length - 1)))
  const i = Math.floor(f)
  return dither(x, y, f - i) ? colors[i + 1] : colors[i]
}

// ---------------------------------------------------------------- Mars at night

const SKY = ['#05071a', '#080b22', '#0b1029', '#0f1532', '#131b3c', '#182246', '#1e2a52', '#26345f', '#2f406d', '#3a4e7c']
const HAZE = ['#2c4678', '#38588c', '#4a6ea2', '#5e86b6']
const PLANET = ['#2a0e14', '#4a1a1a', '#6a2620', '#8a3424', '#a8442a', '#c25a32', '#d6723c', '#e48c4c', '#eeaa66', '#f6c888']
const MOON = ['#1e1820', '#3a2e30', '#5a4840', '#7a6250', '#9a7e64', '#b89a7c', '#d0b496']
type Tones = { edge: string; lit: string; mid: string; shade: string; deep: string }
const FAR: Tones = { edge: '#5a5288', lit: '#4a4478', mid: '#38345e', shade: '#2a2648', deep: '#201c3a' }
const MID: Tones = { edge: '#f0a060', lit: '#c8643c', mid: '#8e3e2c', shade: '#5e2622', deep: '#3e181a' }
const NEAR: Tones = { edge: '#ffb070', lit: '#d8703e', mid: '#a04a30', shade: '#6a2a22', deep: '#40181a' }
const GROUND = ['#3a1618', '#4e1e1c', '#642822', '#7a3226', '#8e3c2a', '#a24a30', '#b65838', '#c86a42', '#d8804e', '#e69a60']

/** The sky deepening upward, dithered. */
function nightSky(buffer: PixelBuffer, horizon: number): void {
  for (let y = 0; y < buffer.height; y += 1) {
    const t = Math.min(1, y / horizon)
    for (let x = 0; x < buffer.width; x += 1) buffer.set(x, y, ramp(SKY, t, x, y))
  }
}

/** A world in the sky: shaded from the upper left, its surface in bands stirred by noise, a few craters, a halo. */
function planet(buffer: PixelBuffer, cx: number, cy: number, r: number, seed: number, colors: readonly string[], halo: string): void {
  for (let y = Math.floor(cy - r * 1.3); y <= cy + r * 1.3; y += 1) for (let x = Math.floor(cx - r * 1.3); x <= cx + r * 1.3; x += 1) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if (d > r && d < r * 1.3 && dither(x, y, 0.3 * (1 - (d - r) / (r * 0.3)))) buffer.tint(x, y, halo, 0.22)
  }
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
    const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r
    const d2 = nx * nx + ny * ny
    if (d2 > 1) continue
    const nz = Math.sqrt(1 - d2)
    const light = Math.max(0, Math.min(1, -nx * 0.55 - ny * 0.45 + nz * 0.7))
    const lat = ny + 0.22 * (fbm(nx * 2.5 + 3, ny * 5, seed) - 0.5)
    const tex = fbm(nx * 3 / (nz + 0.35), lat * 6, seed + 5, 4)
    const band = 0.5 + 0.5 * Math.sin(lat * 12 + tex * 5)
    let t = 0.08 + light * 0.72 + (band - 0.5) * 0.22 + (tex - 0.5) * 0.25
    if (d2 > 0.9 && light > 0.45) t += 0.12
    let color = ramp(colors, t, x, y)
    if (light < 0.1) color = mix(color, SKY[2], 0.45)
    buffer.set(x, y, color)
  }
  // craters on the lit side
  for (const [ox, oy, rr] of [[-0.35, -0.25, 0.12], [0.1, 0.35, 0.09], [-0.5, 0.25, 0.07]] as const) {
    const ccx = cx + ox * r, ccy = cy + oy * r, cr = rr * r
    for (let y = Math.floor(ccy - cr); y <= ccy + cr; y += 1) for (let x = Math.floor(ccx - cr); x <= ccx + cr; x += 1) {
      const d = Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy)
      if (d > cr) continue
      const n = colors.length
      buffer.set(x, y, d > cr - 1.2 ? (x < ccx ? colors[Math.floor(n * 0.3)] : colors[Math.floor(n * 0.75)]) : mix(buffer.hex(x, y), colors[Math.floor(n * 0.2)], 0.35))
    }
  }
}

/** Stars in colours, from fine dots to four-pointed sparkles that pulse; only on what is still sky. */
function starfield(buffer: PixelBuffer, sky: Uint8Array, seed: number, count: number, frame: number): void {
  const next = rng(seed)
  const W = buffer.width
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < buffer.height && sky[y * W + x] === 1
  const colors = ['#f8f5e6', '#ffd27a', '#ff9a5a', '#9ab8ff', '#f8f5e6']
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(next() * W), y = Math.floor(next() * buffer.height)
    const kind = next(), color = colors[Math.floor(next() * colors.length)]
    if (!free(x, y)) continue
    const on = (i + frame) % 5 !== 0
    if (kind < 0.06) {
      const len = on ? 4 : 2
      for (let d = 1; d <= len; d += 1) {
        const c = d === 1 ? color : d < len ? mix(color, SKY[3], 0.4) : mix(color, SKY[3], 0.7)
        for (const [px, py] of [[x + d, y], [x - d, y], [x, y + d], [x, y - d]]) if (free(px, py)) buffer.set(px, py, c)
      }
      buffer.set(x, y, '#ffffff')
    } else if (kind < 0.2) {
      buffer.set(x, y, on ? color : mix(color, SKY[3], 0.5))
      if (on) for (const [px, py] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (free(px, py)) buffer.tint(px, py, color, 0.45)
    } else if (on || kind > 0.6) buffer.set(x, y, kind > 0.6 ? mix(color, SKY[4], 0.55) : color)
  }
}

/** A range of rock: ridged peaks from noise, lit on the slopes that face the left, strata, darker at the foot. */
function range(buffer: PixelBuffer, sky: Uint8Array, base: number, height: number, scale: number, seed: number, tones: Tones, from = 0, to = buffer.width, lift = 0.35): void {
  const W = buffer.width
  const h = (x: number) => {
    const n = fbm(x / scale, 0.5, seed, 4)
    const ridge = 1 - Math.abs(2 * n - 1)
    // a range dies down at its ends
    const fade = Math.min(1, (x - from) / 40, (to - x) / 40)
    return height * (lift + (1 - lift) * ridge * ridge) * Math.max(0, fade)
  }
  for (let x = Math.max(0, from); x < Math.min(W, to); x += 1) {
    const hx = h(x), top = Math.round(base - hx)
    const slope = h(x + 2) - h(x - 2)
    for (let y = top; y < base; y += 1) {
      const depth = (y - top) / Math.max(1, base - top)
      const strata = fbm(x / 22, y / 3.5, seed + 9)
      let color = slope > 1.2 ? (dither(x, y, Math.min(1, slope / 4)) ? tones.lit : tones.mid) : slope < -1.2 ? tones.shade : tones.mid
      if (y - top < 2) color = slope > 0 ? tones.edge : tones.shade
      else if (strata > 0.68) color = color === tones.lit ? tones.mid : tones.shade
      if (depth > 0.55 && dither(x, y, (depth - 0.55) * 1.8)) color = tones.deep
      buffer.set(x, y, color)
      sky[y * W + x] = 0
    }
  }
}

/** The plain: layers of red streaked by the wind, longer streaks far off, coarser near; pebbles. */
function plain(buffer: PixelBuffer, sky: Uint8Array, top: number, bottom: number, seed: number): void {
  const W = buffer.width
  for (let y = top; y < bottom; y += 1) {
    const t = (y - top) / Math.max(1, bottom - top)
    for (let x = 0; x < W; x += 1) {
      const streak = fbm(x / (46 - 34 * t), y / (1.6 + 3 * t), seed, 3)
      buffer.set(x, y, ramp(GROUND, 0.22 + t * 0.55 + (streak - 0.5) * 0.5, x, y))
      sky[y * W + x] = 0
    }
  }
  const next = rng(seed + 3)
  for (let i = 0; i < 220; i += 1) {
    const t = next(), x = Math.floor(next() * W), y = Math.round(top + 2 + t * t * (bottom - top - 4))
    const size = Math.max(1, Math.round(t * t * 4 * (0.5 + next())))
    buffer.rect(x, y, size + 1, size, GROUND[2]); buffer.rect(x, y, size, 1, GROUND[7])
  }
}

/** A rock lying on the plain: lit on its left face, its right face in shadow, an edge of light, its shadow. */
function boulder(buffer: PixelBuffer, x: number, y: number, w: number, h: number, seed: number): void {
  const pts: Array<[number, number]> = [[x, y]]
  const n = 7
  for (let i = 1; i < n; i += 1) { const t = i / n; pts.push([x + w * t, y - h * Math.sin(Math.PI * t) * (0.75 + 0.5 * hash(i, seed, 3))]) }
  pts.push([x + w, y])
  buffer.rect(Math.round(x - 3), Math.round(y), Math.round(w + 10), 2, GROUND[1])
  buffer.poly(pts, NEAR.shade)
  buffer.poly([[x, y], ...pts.slice(1, 4), [x + w * 0.45, y]], NEAR.mid)
  buffer.poly([[x + 1, y - 1], ...pts.slice(1, 3).map(([px, py]) => [px, py + 1] as [number, number]), [x + w * 0.22, y - h * 0.2]], NEAR.lit)
  for (let i = 1; i < 4; i += 1) buffer.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], NEAR.edge)
}

function crater(buffer: PixelBuffer, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
    if (d > 1) continue
    buffer.set(x, y, d > 0.7 ? (y < cy ? GROUND[1] : GROUND[8]) : y < cy - ry * 0.15 ? GROUND[0] : GROUND[3])
  }
}

// ---------------------------------------------------------------- the burgers from space

const BUNS = ['#e0a050', '#d88a3a', '#e8b860']

/** A burger come from space, 30 × 28: eyes on stalks, a sesame bun, cheese dripping like fangs, a grin, little legs. */
function alien(buffer: PixelBuffer, x: number, feet: number, frame: number, kind = 0): void {
  figure(buffer, x, feet, 30, 28, (f) => {
    const bun = BUNS[kind % 3], bunLight = mix(bun, '#fff4d0', 0.45)
    const lean = frame % 2 ? 1 : 0
    f.line(11, 8, 9 - lean, 2, '#3f9a6a'); f.line(19, 8, 21 + lean, 2, '#3f9a6a')
    f.disc(9 - lean, 2.5, 2.4, '#ffffff'); f.disc(21 + lean, 2.5, 2.4, '#ffffff')
    f.set(9 - lean, 3, INK); f.set(21 + lean, 3, INK)
    for (let yy = 6; yy < 15; yy += 1) for (let xx = 3; xx < 27; xx += 1) if (((xx + 0.5 - 15) / 12) ** 2 + ((yy + 0.5 - 15) / 9) ** 2 <= 1) f.set(xx, yy, yy < 10 && xx < 16 ? bunLight : bun)
    for (const [sx, sy] of [[9, 10], [14, 8], [19, 10], [23, 12], [12, 12]]) f.set(sx, sy, '#fff8e0')
    f.rect(3, 15, 24, 2, '#ffcc33'); f.rect(6, 17, 2, 2, '#ffcc33'); f.rect(14, 17, 2, 3, '#ffcc33'); f.rect(22, 17, 2, 2, '#ffcc33')
    for (let xx = 2; xx < 28; xx += 1) f.set(xx, 17 + ((xx >> 1) % 2), '#4cb05a')
    f.rect(3, 18, 24, 3, '#6a3a1e'); f.rect(9, 19, 12, 1, '#2a1208')
    f.rect(4, 21, 22, 3, bun); f.rect(5, 23, 20, 1, dim(bun, 0.75))
    const step = frame % 2 ? 1 : -1
    f.rect(8 + step, 24, 2, 3, '#3f9a6a'); f.rect(20 - step, 24, 2, 3, '#3f9a6a')
  })
}

/** The same burger small, for the play and for the swarm's middle distance: 16 × 14 (a slider 12 wide, a double 18). */
function alienSmall(buffer: PixelBuffer, x: number, feet: number, frame: number, kind = 1): void {
  const w = kind === 0 ? 14 : kind === 2 ? 20 : 16
  figure(buffer, x, feet, w + 2, kind === 2 ? 17 : 15, (f) => {
    const bun = BUNS[kind % 3], bunLight = mix(bun, '#fff4d0', 0.45)
    const c = (w + 2) / 2, lean = frame % 2
    f.set(Math.round(c - 3 - lean), 0, '#ffffff'); f.set(Math.round(c + 2 + lean), 0, '#ffffff')
    f.set(Math.round(c - 3), 1, '#3f9a6a'); f.set(Math.round(c + 2), 1, '#3f9a6a')
    for (let yy = 2; yy < 7; yy += 1) for (let xx = 1; xx < w + 1; xx += 1) if (((xx + 0.5 - c) / (w / 2)) ** 2 + ((yy + 0.5 - 7) / 5) ** 2 <= 1) f.set(xx, yy, yy < 4 && xx < c ? bunLight : bun)
    f.set(Math.round(c - 2), 4, '#fff8e0'); f.set(Math.round(c + 2), 3, '#fff8e0')
    let y = 7
    const layers = kind === 2 ? ['#ffcc33', '#6a3a1e', '#ffcc33', '#6a3a1e'] : kind === 1 ? ['#ffcc33', '#4cb05a', '#6a3a1e'] : ['#6a3a1e']
    for (const color of layers) { f.rect(1, y, w, color === '#6a3a1e' ? 2 : 1, color); y += color === '#6a3a1e' ? 2 : 1 }
    f.rect(Math.round(c - 3), y - 1, 6, 1, '#2a1208')
    f.rect(2, y, w - 2, 2, bun)
    const step = frame % 2 ? 1 : -1
    f.set(Math.round(c - 3 + step), y + 2, '#3f9a6a'); f.set(Math.round(c + 2 - step), y + 2, '#3f9a6a')
  })
}

/** Far away, a burger is a few dots: bun, patty, bun. */
function speck(buffer: PixelBuffer, x: number, y: number, size: 1 | 2): void {
  if (size === 1) { buffer.rect(x, y, 3, 1, BUNS[0]); buffer.set(x + 1, y + 1, '#6a3a1e'); buffer.rect(x, y + 2, 3, 1, BUNS[0]); return }
  buffer.rect(x + 1, y, 4, 1, BUNS[0]); buffer.rect(x, y + 1, 6, 1, BUNS[2]); buffer.rect(x, y + 2, 6, 1, '#ffcc33'); buffer.rect(x, y + 3, 6, 1, '#6a3a1e'); buffer.rect(x, y + 4, 6, 1, BUNS[1])
  buffer.set(x + 1, y - 1, '#ffffff'); buffer.set(x + 4, y - 1, '#ffffff')
}

/** The swarm: from far off, specks at first, then small burgers, then a few big ones nearest, coming toward the restaurant. */
function swarm(buffer: PixelBuffer, from: [number, number], to: [number, number], count: number, spread: number, frame: number, seed: number, big = true): void {
  const items: Array<{ x: number; y: number; t: number }> = []
  for (let i = 0; i < count; i += 1) {
    const t = Math.pow(hash(i, seed, 1), 1.6)
    const across = (hash(i, seed, 2) - 0.5) * 2, along = (hash(i, seed, 3) - 0.5) * 0.08
    const tt = Math.min(1, Math.max(0, t + along))
    const x = from[0] + (to[0] - from[0]) * tt + across * spread * (0.25 + tt)
    const y = from[1] + (to[1] - from[1]) * tt + (hash(i, seed, 4) - 0.5) * spread * 0.6 * (0.25 + tt)
    items.push({ x, y, t: tt })
  }
  items.sort((a, b) => a.t - b.t)
  const bob = frame % 2
  items.forEach(({ x, y, t }, i) => {
    if (t < 0.45) speck(buffer, Math.round(x), Math.round(y) + (i % 2 ? bob : 0), 1)
    else if (t < 0.72) speck(buffer, Math.round(x), Math.round(y) + (i % 2 ? bob : 0), 2)
    else if (t < 0.965 || !big) alienSmall(buffer, x, y + 14 + (i % 2 ? bob : 0), frame + i, i % 3)
    else alien(buffer, x, y + 28 + (i % 2 ? bob : 0), frame + i, i % 3)
  })
}

/** What the burgers throw down: an onion ring, a tomato slice, a strip of bacon, a pickle. */
function droplet(buffer: PixelBuffer, x: number, y: number, kind: number): void {
  if (kind === 0) { for (let yy = -4; yy <= 4; yy += 1) for (let xx = -4; xx <= 4; xx += 1) { const d = Math.hypot(xx, yy); if (d <= 3.6 && d >= 1.8) buffer.set(x + xx, y + yy, d > 3 ? '#d8c8a0' : '#f4ecd0') } }
  else if (kind === 1) { buffer.disc(x, y, 3.5, '#e0301e'); buffer.disc(x, y, 2.2, '#f05a3c'); buffer.set(x - 1, y - 1, '#ffd0a0'); buffer.set(x + 1, y + 1, '#ffd0a0') }
  else if (kind === 2) { for (let d = 0; d < 9; d += 1) buffer.rect(x - 1 + ((d >> 1) % 2), y - 4 + d, 3, 1, d % 3 ? '#d8505a' : '#f4a0a0') }
  else { buffer.disc(x, y, 3, '#3f8a3a'); buffer.disc(x, y, 1.5, '#9ad070') }
}

// ---------------------------------------------------------------- the chef

const SKIN = '#f6c49c', SKIN_DARK = '#d8946c'
const WHITE = '#f6f4ee', WHITE_SHADE = '#cfcbd8'
const SILVER = '#c8ccd8', SILVER_LIGHT = '#f2f4fa', SILVER_DARK = '#8a8ea4'

/**
 * The cook, 70 × 122: a friendly face, a big smile, rosy cheeks; the paper
 * cap of the fifties' diners with a stripe in the colour and a rocket on it;
 * a white shirt, a bow tie, an apron, a chrome belt; the future's touch in
 * silver — collar tabs, boots. Ketchup up beside his head, mustard at his hip.
 */
function chef(buffer: PixelBuffer, x: number, feet: number, accent: string, frame: number): void {
  figure(buffer, x, feet, 72, 124, (f) => {
    // boots, silver and round, and the trousers above them
    for (const bx of [27, 45]) { f.disc(bx, 115, 6.5, SILVER); f.rect(bx - 6, 115, 13, 7, SILVER); f.rect(bx - 6, 120, 13, 2, SILVER_DARK); f.disc(bx - 2, 113, 2, SILVER_LIGHT) }
    f.rect(23, 96, 9, 16, '#2a3050'); f.rect(40, 96, 9, 16, '#2a3050'); f.rect(29, 96, 2, 16, '#3a4268')
    // the shirt: a round body, short sleeves
    f.disc(36, 66, 16, WHITE); f.rect(22, 58, 28, 22, WHITE)
    f.disc(19, 56, 6, WHITE); f.disc(53, 56, 6, WHITE)
    f.rect(48, 60, 6, 2, WHITE_SHADE); f.rect(18, 60, 6, 2, WHITE_SHADE)
    // the apron, its trim in the colour, a pocket; the chrome belt and its buckle
    f.poly([[24, 76], [48, 76], [52, 100], [20, 100]], WHITE)
    f.rect(20, 98, 33, 2, accent); f.rect(30, 84, 12, 8, WHITE_SHADE); f.rect(30, 84, 12, 1, accent)
    f.rect(22, 74, 28, 3, SILVER); f.rect(22, 74, 28, 1, SILVER_LIGHT); f.disc(36, 75.5, 2.5, SILVER_LIGHT); f.set(36, 76, SILVER_DARK)
    // silver collar tabs, a red bow tie, a little rocket badge
    f.poly([[28, 48], [34, 48], [32, 53]], SILVER); f.poly([[38, 48], [44, 48], [40, 53]], SILVER)
    f.poly([[31, 50], [36, 52], [31, 55]], '#e0301e'); f.poly([[41, 50], [36, 52], [41, 55]], '#e0301e'); f.disc(36, 52, 1.5, '#b81e14')
    f.rect(26, 60, 2, 4, '#ffcc33'); f.set(26, 59, '#ffcc33'); f.set(25, 63, '#e0301e'); f.set(28, 63, '#e0301e')
    // the right arm up, ketchup beside the head; the left down, mustard at the hip
    stroke(f, 17, 57, 11, 46, 3, SKIN); stroke(f, 11, 46, 11, 40, 3.2, SKIN)
    f.rect(8, 18, 7, 22, '#e0301e'); f.rect(13, 19, 2, 20, '#9a1a12'); f.rect(8, 26, 7, 5, WHITE); f.rect(10, 27, 3, 3, '#e0301e')
    f.rect(9, 14, 5, 4, WHITE); f.rect(10, 9, 3, 5, '#e0301e')
    if (frame % 2 === 0) for (let d = 0; d < 3; d += 1) f.rect(11, 1 + d * 3, 2, 2, '#ff5a3c')
    stroke(f, 55, 58, 59, 70, 3, SKIN)
    f.rect(57, 66, 7, 20, '#ffcc33'); f.rect(62, 67, 2, 18, '#c89a10'); f.rect(57, 73, 7, 5, WHITE); f.rect(59, 74, 3, 3, '#ffcc33')
    f.rect(58, 62, 5, 4, WHITE); f.rect(59, 57, 3, 5, '#ffcc33')
    f.disc(60, 70, 3, SKIN)
    // the neck and the head: round, ears, hair at the sides
    f.rect(32, 42, 8, 7, SKIN_DARK)
    f.disc(36, 31, 12.5, SKIN)
    f.disc(23.5, 32, 3, SKIN); f.disc(48.5, 32, 3, SKIN); f.set(23, 32, SKIN_DARK); f.set(49, 32, SKIN_DARK)
    f.rect(24, 22, 4, 9, '#5a3420'); f.rect(44, 22, 4, 9, '#5a3420')
    // the face: brows, kind eyes with a glint, a nose, rosy cheeks, a wide smile with teeth
    f.rect(28, 25, 5, 1, '#5a3420'); f.rect(39, 25, 5, 1, '#5a3420')
    f.rect(29, 28, 3, 3, INK); f.rect(40, 28, 3, 3, INK); f.set(30, 28, '#ffffff'); f.set(41, 28, '#ffffff')
    f.rect(35, 31, 2, 3, SKIN_DARK)
    f.disc(27, 35, 2.2, '#f49a8a'); f.disc(45, 35, 2.2, '#f49a8a')
    f.poly([[29, 36], [43, 36], [40, 41], [32, 41]], '#8a2a2a'); f.rect(30, 36, 12, 2, '#ffffff'); f.poly([[33, 40], [39, 40], [38, 41], [34, 41]], '#e86a6a')
    // the paper cap: a boat folded long, a stripe in the colour, a rocket on its side
    f.poly([[20, 22], [36, 9], [52, 22], [50, 25], [22, 25]], WHITE)
    f.poly([[36, 9], [52, 22], [44, 22]], WHITE_SHADE)
    f.rect(22, 22, 29, 3, accent); f.line(36, 10, 36, 21, WHITE_SHADE)
    f.rect(27, 15, 2, 4, '#ffcc33'); f.set(27, 14, '#ffcc33'); f.set(26, 18, '#e0301e'); f.set(29, 18, '#e0301e')
  })
}

/** The cook small, for the play: his cap, his smile, ketchup up. */
function chefSmall(buffer: PixelBuffer, x: number, feet: number, accent: string): void {
  figure(buffer, x, feet, 22, 30, (f) => {
    f.rect(6, 25, 4, 4, SILVER); f.rect(12, 25, 4, 4, SILVER)
    f.rect(6, 21, 4, 4, '#2a3050'); f.rect(12, 21, 4, 4, '#2a3050')
    f.disc(11, 16, 6, WHITE); f.rect(6, 15, 10, 7, WHITE); f.rect(6, 20, 10, 1, accent)
    f.set(10, 12, '#e0301e'); f.set(11, 12, '#e0301e')
    f.disc(11, 7, 4.5, SKIN); f.set(9, 6, INK); f.set(13, 6, INK); f.rect(9, 9, 4, 1, '#8a2a2a')
    f.poly([[5, 4], [11, 0], [17, 4], [16, 5], [6, 5]], WHITE); f.rect(6, 4, 10, 1, accent)
    stroke(f, 6, 14, 3, 9, 1.4, SKIN)
    f.rect(2, 1, 3, 8, '#e0301e'); f.rect(2, 3, 3, 2, WHITE); f.set(3, 0, '#e0301e')
  })
}

// ---------------------------------------------------------------- the restaurant and its sign

/**
 * A fast food of the fifties and sixties on Mars, `width` wide on `ground`:
 * a folded roof whose fascia carries diamonds in the colour, slanted beams
 * across tall glass, behind it the counter, its stools, round lamps and the
 * cook's pass; a glass door with warning stripes; a dish and an antenna on
 * the roof, little fins at its ends.
 */
function fastFood(buffer: PixelBuffer, x: number, width: number, ground: number, accent: string, frame: number): void {
  const floor = ground - 8
  const roof = ground - 112
  const glassTop = roof + 14, wallTop = floor - 12
  const chrome = '#c9ccd8', chromeDark = '#8a8ea4', chromeLight = '#f2f4fa'
  // the slab it stands on
  buffer.rect(x - 18, floor, width + 36, 8, '#8e8e9c'); buffer.rect(x - 18, floor, width + 36, 1, '#c4c4d0'); buffer.rect(x - 18, ground - 2, width + 36, 2, '#5a5a68')
  // inside, lit warm: the back wall, the menu, the pass to the kitchen, lamps, the counter and its stools, two people
  for (let y = glassTop; y < wallTop; y += 1) for (let xx = x; xx < x + width; xx += 1) buffer.set(xx, y, ramp(['#fff0c8', '#ffe2a8', '#ffd08a', '#f6b874'], (y - glassTop) / (wallTop - glassTop), xx, y))
  buffer.rect(x + 18, glassTop + 8, Math.round(width * 0.34), 16, '#3a2a2a')
  for (let i = 0; i < 4; i += 1) buffer.rect(x + 22, glassTop + 11 + i * 3, Math.round(width * 0.34) - 8 - (i % 2) * 14, 1, i === 0 ? '#ffcc33' : '#f8f5e6')
  buffer.rect(x + Math.round(width * 0.58), glassTop + 10, Math.round(width * 0.26), 14, '#c8a070'); buffer.rect(x + Math.round(width * 0.58), glassTop + 22, Math.round(width * 0.26), 2, chromeDark)
  const counterTop = wallTop - 26
  buffer.rect(x + 6, counterTop, width - 12, 3, '#f8f5e6'); buffer.rect(x + 6, counterTop + 3, width - 12, 14, '#e0301e')
  for (let cx = x + 10; cx < x + width - 10; cx += 12) buffer.rect(cx, counterTop + 5, 6, 10, '#f8f5e6')
  // someone at the pass in a cap like the chef's, someone on a stool
  const cookX = x + Math.round(width * 0.68)
  buffer.disc(cookX, counterTop - 9, 4, '#5a3a2a'); buffer.rect(cookX - 6, counterTop - 5, 12, 5, '#e8e4dc'); buffer.rect(cookX - 4, counterTop - 14, 8, 2, '#f8f5e6')
  const guestX = x + Math.round(width * 0.3)
  buffer.disc(guestX, counterTop - 4, 3.5, '#3a2a3a'); buffer.rect(guestX - 4, counterTop, 8, 9, accent)
  for (let sx = x + 18; sx < x + width - 14; sx += 26) { buffer.rect(sx, wallTop - 9, 2, 9, chromeDark); buffer.rect(sx - 4, wallTop - 11, 10, 3, accent); buffer.rect(sx - 4, wallTop - 11, 10, 1, mix(accent, '#ffffff', 0.4)) }
  for (let lx = x + 30; lx < x + width - 20; lx += Math.round(width / 5)) {
    buffer.rect(lx, glassTop, 1, 6, '#5a4a40')
    buffer.disc(lx, glassTop + 10, 4.5, '#fffaf0'); buffer.set(lx - 2, glassTop + 9, '#e8dcc0'); buffer.set(lx + 1, glassTop + 12, '#e8dcc0'); buffer.set(lx + 2, glassTop + 8, '#e8dcc0')
  }
  // the glass: a cool sheen across it, mullions leaning out a little
  for (let y = glassTop; y < wallTop; y += 1) for (let xx = x; xx < x + width; xx += 1) if (((xx + y * 2) % 46) < 6 && dither(xx, y, 0.35)) buffer.tint(xx, y, '#cfe8ff', 0.35)
  for (let mx = x; mx <= x + width; mx += Math.round(width / 6)) { buffer.line(mx, wallTop, mx + 3, glassTop, chrome); buffer.line(mx + 1, wallTop, mx + 4, glassTop, chromeDark) }
  // the beams across the glass, in the colour
  const beam = (x0: number, x1: number) => {
    for (let o = 0; o < 6; o += 1) buffer.line(x0 + o, floor, x1 + o, glassTop - 2, o === 0 ? mix(accent, '#ffffff', 0.45) : o === 5 ? dim(accent, 0.6) : accent)
  }
  beam(x + 12, x + Math.round(width * 0.3)); beam(x + width - 18, x + Math.round(width * 0.7) - 6)
  // the wall under the glass: cream, diamonds in the colour
  buffer.rect(x, wallTop, width, floor - wallTop, '#f2ece0'); buffer.rect(x, wallTop, width, 1, chrome)
  for (let dx = x + 10; dx < x + width - 6; dx += 16) buffer.poly([[dx, wallTop + 6], [dx + 3, wallTop + 2], [dx + 6, wallTop + 6], [dx + 3, wallTop + 10]], accent)
  // the door in the middle: glass, a chrome frame, push bars, warning stripes at its foot
  const doorW = 30, doorX = x + Math.round(width / 2 - doorW / 2)
  buffer.rect(doorX - 3, glassTop + 22, doorW + 6, floor - glassTop - 22, chromeDark)
  buffer.rect(doorX, glassTop + 25, doorW, floor - glassTop - 25, '#bfe0f0'); buffer.rect(doorX + doorW / 2 - 1, glassTop + 25, 2, floor - glassTop - 25, chromeDark)
  for (let yy = glassTop + 26; yy < floor - 6; yy += 1) if ((yy + doorX) % 9 < 2) buffer.rect(doorX + 2, yy, 4, 1, '#e8f6ff')
  buffer.rect(doorX + 4, glassTop + 50, doorW - 8, 2, chromeLight)
  for (let sx = doorX - 3; sx < doorX + doorW + 3; sx += 1) for (let sy = floor - 5; sy < floor; sy += 1) buffer.set(sx, sy, Math.floor((sx + sy) / 3) % 2 ? '#ffcc33' : '#16141c')
  // the folded roof: a zigzag fascia, cream, diamonds in the colour, the neon under it
  const left = x - 26, right = x + width + 26, fold = Math.round((right - left) / 6)
  const peak = (xx: number) => { const t = ((xx - left) % fold) / fold; return roof - 4 - Math.round(16 * (1 - Math.abs(2 * t - 1))) }
  for (let xx = left; xx < right; xx += 1) {
    const top = peak(xx)
    buffer.rect(xx, top, 1, roof + 2 - top, '#3a2e4a')
    buffer.rect(xx, top, 1, 9, '#f6f0e4'); buffer.set(xx, top, '#ffffff'); buffer.set(xx, top + 8, '#cfc6b4')
  }
  for (let k = 0; k < 6; k += 1) {
    const mx = left + k * fold + fold / 2, my = peak(Math.round(mx)) + 4
    buffer.poly([[mx - 3, my], [mx, my - 3], [mx + 3, my], [mx, my + 3]], accent)
    for (const off of [-fold / 4, fold / 4]) { const qx = mx + off, qy = peak(Math.round(qx)) + 4; buffer.poly([[qx - 2, qy], [qx, qy - 2], [qx + 2, qy], [qx, qy + 2]], accent) }
  }
  for (let xx = x - 8; xx < x + width + 8; xx += 1) {
    buffer.set(xx, roof + 3, accent); buffer.set(xx, roof + 4, mix(accent, '#ffffff', 0.6)); buffer.set(xx, roof + 5, accent)
    for (let g = 6; g < 11; g += 1) if (dither(xx, roof + g, 0.45 - g * 0.035)) buffer.tint(xx, roof + g, accent, 0.3)
  }
  // fins at the roof's ends, a dish and an antenna on its peaks
  for (const [fx, dir] of [[left, -1], [right, 1]] as const) buffer.poly([[fx, peak(fx === right ? right - 1 : left) + 2], [fx + dir * 10, roof - 18], [fx + dir * 4, roof + 2]], dim(accent, 0.8))
  const dishX = left + fold * 3 + fold / 2, dishY = peak(Math.round(dishX))
  buffer.rect(dishX - 1, dishY - 7, 3, 7, chromeDark)
  for (let yy = -9; yy <= 0; yy += 1) for (let xx = -11; xx <= 11; xx += 1) if ((xx / 11) ** 2 + ((yy + 5) / 5) ** 2 <= 1 && yy <= -4 + xx * 0.3) buffer.set(dishX + xx, dishY - 9 + yy, xx < -3 ? chromeLight : chrome)
  buffer.disc(dishX + 3, dishY - 19, 1.6, '#ff5a3c')
  const antX = left + fold * 5 + fold / 2, antY = peak(Math.round(antX))
  buffer.rect(antX, antY - 22, 2, 22, chromeDark); buffer.rect(antX - 4, antY - 15, 10, 1, chromeDark); buffer.rect(antX - 3, antY - 9, 8, 1, chromeDark)
  buffer.disc(antX + 1, antY - 24, 2.3, frame % 2 ? '#ff3a3a' : '#7a1a1a')
}

/**
 * RANDOM BURGER on its pylon: a starry disc ringed in cream and the colour,
 * a red rocket in volume tilted across it — shaded round, a white band, a
 * porthole, yellow fins, its flame — and a ribbon with the name.
 */
function rocketSign(buffer: PixelBuffer, x: number, ground: number, top: number, accent: string, frame: number): void {
  const R = 44, cy = top + R
  const chrome = '#c9ccd8', chromeDark = '#8a8ea4'
  // the pylon: two posts from the ribbon to the ground
  for (const px of [x - 26, x + 22]) { buffer.rect(px, cy + 30, 5, ground - cy - 30, chromeDark); buffer.rect(px, cy + 30, 2, ground - cy - 30, chrome) }
  buffer.rect(x - 34, ground - 5, 68, 5, chromeDark); buffer.rect(x - 34, ground - 5, 68, 1, chrome)
  // the disc and its rings, its glow, stars in it
  for (let y = cy - R - 6; y <= cy + R + 6; y += 1) for (let xx = x - R - 6; xx <= x + R + 6; xx += 1) {
    const d = Math.hypot(xx + 0.5 - x, y + 0.5 - cy)
    if (d <= R - 5) buffer.set(xx, y, ramp(['#0e3a44', '#14505a', '#1c6670'], (y - (cy - R)) / (2 * R), xx, y))
    else if (d <= R - 2) buffer.set(xx, y, CREAM)
    else if (d <= R + 1) buffer.set(xx, y, accent)
    else if (d <= R + 6 && dither(xx, y, 0.45 * (1 - (d - R - 1) / 5))) buffer.tint(xx, y, accent, 0.35)
  }
  for (const [sx, sy, big] of [[-24, -22, 1], [20, -28, 0], [28, 6, 1], [-30, 10, 0], [6, -34, 0]] as const) {
    const X = x + sx, Y = cy + sy, len = big ? 3 : 2
    for (let d = 1; d <= len; d += 1) { buffer.set(X + d, Y, '#ffcc33'); buffer.set(X - d, Y, '#ffcc33'); buffer.set(X, Y + d, '#ffcc33'); buffer.set(X, Y - d, '#ffcc33') }
    buffer.set(X, Y, '#fff4c0')
  }
  // the rocket, tilted, in its own picture with an ink outline
  const L = 96, rr = 13, angle = (36 * Math.PI) / 180
  const ax = Math.cos(angle), ay = -Math.sin(angle), nx = Math.sin(angle), ny = Math.cos(angle)
  const size = 150, c = size / 2
  const flame = frame % 2 ? 26 : 18
  figure(buffer, x - 4, cy + size / 2 + 4, size, size, (f) => {
    const radius = (u: number) => {
      if (u < -L / 2 || u > L / 2) return -1
      if (u <= L * 0.14) return rr
      const t = (u - L * 0.14) / (L * 0.36)
      return rr * Math.sqrt(Math.max(0, 1 - t * t))
    }
    // the flame behind, the fins, then the body over them
    for (let Y = 0; Y < size; Y += 1) for (let X = 0; X < size; X += 1) {
      const dx = X + 0.5 - c, dy = Y + 0.5 - c
      const u = dx * ax + dy * ay, v = dx * nx + dy * ny
      const back = -L / 2 - u
      if (back > 2 && back < flame + 4) {
        const w = (rr * 0.8) * (1 - back / (flame + 4))
        if (Math.abs(v) <= w) f.set(X, Y, Math.abs(v) < w * 0.35 ? '#fff4b0' : Math.abs(v) < w * 0.7 ? '#ffcc33' : '#ff7a2a')
      }
      for (const side of [-1, 1]) {
        const fu = u + L / 2, fv = (v * side) - rr + 2
        if (fu > -6 && fu < 24 && fv > 0 && fv < 15 && fv < (24 - fu) * 0.62 && fv < fu + 9) f.set(X, Y, fv > 11 || fu > 20 ? '#c8901a' : '#ffcc33')
      }
    }
    for (let Y = 0; Y < size; Y += 1) for (let X = 0; X < size; X += 1) {
      const dx = X + 0.5 - c, dy = Y + 0.5 - c
      const u = dx * ax + dy * ay, v = dx * nx + dy * ny
      const rad = radius(u)
      if (rad <= 0 || Math.abs(v) > rad) continue
      const s = v / rad
      const band = u > L * 0.1 && u < L * 0.2
      const tones = band ? ['#ffffff', '#f6f0e4', '#d8d2c4', '#a8a090'] : ['#ff9a80', '#f04a3a', '#d02a24', '#8a1418']
      f.set(X, Y, s < -0.55 ? tones[0] : s < -0.15 ? tones[1] : s < 0.5 ? tones[2] : tones[3])
      if (u < -L / 2 + 4) f.set(X, Y, s < 0 ? '#9a9aa8' : '#5a5a68')
    }
    // the porthole: a chrome ring, glass with a glint
    const px = c + ax * L * -0.08, py = c + ay * L * -0.08
    f.disc(px, py, 9, '#8a8ea4'); f.disc(px - 0.5, py - 0.5, 8, '#d8dce6'); f.disc(px, py, 6, '#2a6a8a'); f.disc(px - 1, py - 1, 4.5, '#5ab8e0'); f.disc(px - 2.5, py - 2.5, 1.6, '#e8f8ff')
  })
  // the ribbon across the disc's foot, its folded ends, the name in cream on a yellow edge
  const rw = 150, rh = 24, ry = cy + 22
  buffer.poly([[x - rw / 2 - 12, ry + 6], [x - rw / 2, ry + 2], [x - rw / 2, ry + rh + 2], [x - rw / 2 - 12, ry + rh + 6], [x - rw / 2 - 6, ry + rh / 2 + 4]], dim(accent, 0.55))
  buffer.poly([[x + rw / 2 + 12, ry - 2], [x + rw / 2, ry - 6], [x + rw / 2, ry + rh - 6], [x + rw / 2 + 12, ry + rh - 2], [x + rw / 2 + 6, ry + rh / 2 - 4]], dim(accent, 0.55))
  buffer.poly([[x - rw / 2, ry + 2], [x + rw / 2, ry - 6], [x + rw / 2, ry + rh - 6], [x - rw / 2, ry + rh + 2]], '#ffcc33')
  buffer.poly([[x - rw / 2 + 2, ry + 4], [x + rw / 2 - 2, ry - 4], [x + rw / 2 - 2, ry + rh - 8], [x - rw / 2 + 2, ry + rh]], dim(accent, 0.75))
  const text = 'RANDOM BURGER', tw = text7Width(text, 1, true)
  // the letters follow the ribbon's slope a column of letters at a time
  let lx = Math.round(x - tw / 2)
  for (const ch of text) {
    if (ch === ' ') { lx += 5; continue }
    const rise = Math.round(((lx - (x - rw / 2)) / rw) * 8)
    drawText7(buffer, ch, lx + 1, ry + 9 - rise + 1, '#7a4a10', 1, true)
    lx += drawText7(buffer, ch, lx, ry + 9 - rise, CREAM, 1, true) + 1
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

// ---------------------------------------------------------------- the title

type Place = {
  randomY: number; markY: number; markWidth: number; stretch: number
  sky: number; far: [number, number, number]; haze: [number, number]; mid: [number, number, number]; plain: number
  rocks: Array<[number, number, number]>
  planet: [number, number, number]; moon: [number, number, number]
  building: [number, number, number]; sign: [number, number]; chef: number; rover: [number, number]
  boulders: Array<[number, number, number, number]>; craters: Array<[number, number, number, number]>
  swarm: { from: [number, number]; to: [number, number]; count: number; spread: number; big: boolean }
  press: number; info: 'top' | 'bottom'
}

const PLACES: Record<Layout, Place> = {
  landscape: {
    randomY: 16, markY: 64, markWidth: 600, stretch: 1.35,
    sky: 300, far: [292, 70, 90], haze: [262, 300], mid: [318, 56, 70], plain: 316,
    rocks: [[-20, 120, 140], [690, 800, 120]],
    planet: [690, 132, 64], moon: [64, 132, 13],
    building: [282, 340, 368], sign: [158, 226], chef: 672, rover: [88, 424],
    boulders: [[520, 414, 34, 16], [12, 372, 26, 12], [612, 386, 22, 10]], craters: [[380, 404, 44, 9], [720, 418, 30, 6]],
    swarm: { from: [690, 120], to: [560, 204], count: 46, spread: 60, big: false },
    press: 412, info: 'top',
  },
  portrait: {
    randomY: 196, markY: 244, markWidth: 412, stretch: 1.8,
    sky: 520, far: [516, 74, 80], haze: [486, 520], mid: [546, 64, 66], plain: 544,
    rocks: [[-20, 70, 150], [380, 460, 120]],
    planet: [318, 104, 78], moon: [58, 150, 13],
    building: [84, 262, 612], sign: [92, 386], chef: 386, rover: [334, 700],
    boulders: [[30, 690, 34, 16], [240, 740, 30, 14], [180, 636, 18, 8]], craters: [[120, 730, 50, 10]],
    swarm: { from: [300, 150], to: [262, 396], count: 50, spread: 70, big: true },
    press: 724, info: 'bottom',
  },
}

/** The night of a layout, made once: the sky, the worlds, the ranges, the haze, the plain; and where the sky still shows, for the stars. */
const backdrops = new Map<Layout, { buffer: PixelBuffer; sky: Uint8Array }>()
function backdrop(layout: Layout): { buffer: PixelBuffer; sky: Uint8Array } {
  const ready = backdrops.get(layout)
  if (ready) return ready
  const W = layout === 'landscape' ? 768 : 432, H = layout === 'landscape' ? 432 : 768
  const p = PLACES[layout]
  const buffer = new PixelBuffer(W, H, INK)
  const sky = new Uint8Array(W * H).fill(1)
  nightSky(buffer, p.sky)
  const disc = (cx: number, cy: number, r: number) => { for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) sky[y * W + x] = 0 }
  planet(buffer, ...p.planet, 7, PLANET, '#ff9a5a'); disc(...p.planet)
  planet(buffer, ...p.moon, 13, MOON, '#d0b496'); disc(...p.moon)
  range(buffer, sky, p.far[0], p.far[1], p.far[2], 21, FAR)
  for (let y = p.haze[0]; y < p.haze[1]; y += 1) for (let x = 0; x < W; x += 1) {
    const t = (y - p.haze[0]) / (p.haze[1] - p.haze[0])
    if (dither(x, y, Math.min(1, t * 1.6))) { buffer.set(x, y, ramp(HAZE, t, x, y)); sky[y * W + x] = 0 }
  }
  range(buffer, sky, p.mid[0], p.mid[1], p.mid[2], 33, MID)
  plain(buffer, sky, p.plain, H, layout === 'landscape' ? 5 : 9)
  for (const [from, to, h] of p.rocks) range(buffer, sky, p.plain + 26, h, 26, from < 0 ? 41 : 43, NEAR, from, to, 0.55)
  for (const [cx, cy, rx, ry] of p.craters) crater(buffer, cx, cy, rx, ry)
  for (const [bx, by, bw, bh] of p.boulders) boulder(buffer, bx, by, bw, bh, bx)
  const made = { buffer, sky }
  backdrops.set(layout, made)
  return made
}

export type AttacksTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean }

/** RANDOM ATTACKS' title, wide (768 × 432) or tall (432 × 768), in one of the two letterings. */
export function renderAttacksTitle(layout: Layout, accent: string, lettering: AttacksLettering, options: AttacksTitleOptions = {}): PixelBuffer {
  const p = PLACES[layout]
  const frame = options.frame ?? 0
  const night = backdrop(layout)
  const W = night.buffer.width, H = night.buffer.height
  const buffer = new PixelBuffer(W, H, INK)
  buffer.data.set(night.buffer.data)
  starfield(buffer, night.sky, 23, layout === 'landscape' ? 190 : 230, frame)
  // the swarm far off, behind the title
  swarm(buffer, p.swarm.from, p.swarm.to, p.swarm.count, p.swarm.spread, frame, 5, p.swarm.big)
  // RANDOM where it stands on every title, ATTACKS under it
  const rx = Math.round(W / 2 - LOGO_WIDTH)
  drawLogo(buffer, rx + 3, p.randomY + 4, INK, 2)
  drawLogo(buffer, rx, p.randomY, mix(accent, CREAM, 0.25), 2)
  drawAttacksLogo(buffer, W / 2, p.markY, p.markWidth, accent, lettering, { stretch: p.stretch })
  // the sign, the restaurant, the cook beside it, the rover
  rocketSign(buffer, p.sign[0], p.building[2], p.sign[1], accent, frame)
  fastFood(buffer, p.building[0], p.building[1], p.building[2], accent, frame)
  chef(buffer, p.chef, p.building[2] + 6, accent, frame)
  rover(buffer, p.rover[0], p.rover[1], frame)
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

// ---------------------------------------------------------------- the play

/** A stack of plates to hide behind, already bitten into by what fell on it: the plates are drawn, then the sky put back where bites were taken. */
function plates(buffer: PixelBuffer, cx: number, base: number, width: number, count: number, bites: Array<[number, number, number]>): void {
  const x0 = Math.round(cx - width / 2) - 2, y0 = base - count * 4 - 6, w = width + 4, h = count * 4 + 8
  const before = new PixelBuffer(w, h, INK)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const [r, g, b] = buffer.get(Math.min(buffer.width - 1, x0 + x), Math.min(buffer.height - 1, y0 + y)); const o = (y * w + x) * 4; before.data[o] = r; before.data[o + 1] = g; before.data[o + 2] = b }
  for (let i = 0; i < count; i += 1) {
    const y = base - i * 4 - 3
    for (let xx = -width / 2; xx <= width / 2; xx += 1) for (let yy = -3; yy <= 3; yy += 1) {
      const d = (xx / (width / 2)) ** 2 + (yy / 3) ** 2
      if (d > 1) continue
      buffer.set(Math.round(cx + xx), y + yy, d > 0.75 ? (yy < 0 ? '#9ab8e0' : '#5a78a8') : yy < 0 ? '#ffffff' : '#e2e0ea')
    }
  }
  for (const [bx, by, br] of bites) for (let y = Math.floor(by - br); y <= by + br; y += 1) for (let x = Math.floor(bx - br); x <= bx + br; x += 1) {
    if (Math.hypot(x + 0.5 - bx, y + 0.5 - by) > br) continue
    const lx = x - x0, ly = y - y0
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue
    const [r, g, b] = before.get(lx, ly)
    buffer.set(x, y, `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
  }
}

/** The bar on top: LEVEL, SCORE, and the lives as the cook's little heads. */
function attacksHud(buffer: PixelBuffer, accent: string, level: number, score: number, lives: number): void {
  const W = buffer.width
  buffer.rect(0, 0, W, HUD_HEIGHT, '#07070e')
  buffer.rect(0, HUD_HEIGHT - 1, W, 1, dim(accent, 0.55))
  drawText(buffer, 'LEVEL', 8, 3, GREY)
  drawText7(buffer, String(level).padStart(2, '0'), 8, 11, CREAM, 1, true)
  const scoreText = String(score).padStart(5, '0')
  drawText(buffer, 'SCORE', Math.round(W / 2 - textWidth('SCORE') / 2), 3, GREY)
  drawText7(buffer, scoreText, Math.round(W / 2 - text7Width(scoreText, 1, true) / 2), 11, CREAM, 1, true)
  drawText(buffer, 'LIVES', W - 8 - textWidth('LIVES'), 3, GREY)
  for (let i = 0; i < lives; i += 1) {
    const hx = W - 14 - i * 12
    buffer.disc(hx, 15, 3.5, SKIN); buffer.poly([[hx - 4, 12], [hx, 9], [hx + 4, 12]], WHITE); buffer.rect(hx - 4, 12, 9, 1, accent)
    buffer.set(hx - 1, 15, INK); buffer.set(hx + 1, 15, INK); buffer.set(hx, 17, '#8a2a2a')
  }
}

export type AttacksPlayOptions = { frame?: number }

/** A moment of play, wide (448 × 344) or tall (320 × 472): the burgers in rows, plates, the cook, what flies both ways, the golden burger, a bonus. */
export function renderAttacksPlay(layout: Layout, accent: string, options: AttacksPlayOptions = {}): PixelBuffer {
  const frame = options.frame ?? 0
  const wide = layout === 'landscape'
  const W = wide ? 448 : 320, H = wide ? 344 : 472
  const buffer = new PixelBuffer(W, H, INK)
  const sky = new Uint8Array(W * H).fill(1)
  // a quieter night behind the play: the sky, a small world, low ranges, a strip of ground
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) buffer.set(x, y, ramp(SKY.slice(0, 7), y / H, x, y))
  const [px, py, pr] = wide ? [404, 214, 22] : [262, 300, 24]
  planet(buffer, px, py, pr, 7, PLANET, '#ff9a5a')
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= pr) sky[y * W + x] = 0
  range(buffer, sky, H - 22, 20, 50, 21, { edge: '#3e3a66', lit: '#322e56', mid: '#282446', shade: '#1e1a38', deep: '#18142e' })
  plain(buffer, sky, H - 22, H, 11)
  starfield(buffer, sky, 31, wide ? 90 : 110, frame)
  // the burgers in rows, marching: a row of sliders, two of cheeseburgers, two of doubles
  const cols = wide ? 9 : 6, kinds = [0, 1, 1, 2, 2]
  const gapX = wide ? 34 : 38, gapY = 24
  const x0 = Math.round(W / 2 - ((cols - 1) * gapX) / 2) + ((frame % 4) - 1.5) * 3, y0 = HUD_HEIGHT + 44
  kinds.forEach((kind, row) => {
    for (let col = 0; col < cols; col += 1) {
      if (row === 4 && (col === 1 || col === cols - 2)) continue
      const x = x0 + col * gapX, feet = y0 + row * gapY + 14
      if (row === 3 && col === Math.floor(cols / 2)) {
        // one just hit: a splat of ketchup and crumbs
        for (const [dx, dy, r, c] of [[0, -6, 5, '#e0301e'], [-6, -9, 2, '#d88a3a'], [7, -4, 2, '#d88a3a'], [4, -11, 1.5, '#ffcc33'], [-5, -2, 1.5, '#e0301e']] as const) buffer.disc(x + dx, feet + dy, r, c)
        continue
      }
      alienSmall(buffer, x, feet, frame + col, kind)
    }
  })
  // the golden burger across the top
  const gx = ((frame * 18 + Math.round(W * 0.62)) % (W + 60)) - 30, gy = HUD_HEIGHT + 16
  for (let d = 0; d < 6; d += 1) buffer.tint(gx - 14 - d * 3, gy, '#ffcc33', 0.3)
  buffer.disc(gx, gy - 2, 7, '#ffcc33'); buffer.rect(gx - 8, gy, 17, 2, '#c87a1a'); buffer.rect(gx - 7, gy + 2, 15, 2, '#ffd75a'); buffer.disc(gx - 2, gy - 4, 2, '#fff4b0')
  // the plates, bitten
  const ground = H - 22, plateBase = ground - 34
  const stacks = wide ? [80, 180, 280, 380] : [52, 124, 196, 268]
  const half = (wide ? 34 : 30) / 2
  stacks.forEach((sx, i) => plates(buffer, sx, plateBase, wide ? 34 : 30, 5, i === 1 ? [[sx - half + 2, plateBase - 22, 6], [sx + half - 1, plateBase - 8, 4]] : i === 2 ? [[sx + half - 3, plateBase - 23, 5], [sx - 3, plateBase - 25, 3]] : i === 3 ? [[sx - half, plateBase - 12, 4]] : []))
  // the cook, his ketchup going up
  const cookX = wide ? 214 : 150
  chefSmall(buffer, cookX, ground + 2, accent)
  for (let y = ground - 40; y > ground - 120; y -= 1) if (((y + frame * 4) % 14) < 9) buffer.rect(cookX - 8, y, 2, 1, '#e0301e')
  buffer.disc(cookX - 7, ground - 122, 2, '#ff5a3c')
  // what the burgers throw
  const throws: Array<[number, number, number]> = wide
    ? [[x0 + gapX * 2, y0 + 128, 0], [x0 + gapX * 6, y0 + 150, 1], [x0 + gapX * 4, y0 + 176, 2], [x0 + gapX * 8, y0 + 120, 3]]
    : [[x0 + gapX, y0 + 140, 1], [x0 + gapX * 4, y0 + 190, 0], [x0 + gapX * 5, y0 + 150, 3]]
  for (const [tx, ty, kind] of throws) droplet(buffer, Math.round(tx), ty + (frame % 2) * 3, kind)
  // a bonus falling: the mustard, sparkling
  const bx = wide ? 330 : 236, by = ground - 70 + (frame % 4) * 3
  buffer.rect(bx - 3, by - 6, 7, 12, '#ffcc33'); buffer.rect(bx + 2, by - 5, 2, 10, '#c89a10'); buffer.rect(bx - 2, by - 9, 5, 3, WHITE); buffer.rect(bx - 1, by - 12, 3, 3, '#ffcc33')
  for (const [sx, sy] of [[-7, -8], [7, -4], [-6, 6]] as const) if ((frame + sx) % 2 === 0) { buffer.set(bx + sx, by + sy, '#ffffff'); buffer.set(bx + sx + 1, by + sy, '#fff4b0'); buffer.set(bx + sx - 1, by + sy, '#fff4b0'); buffer.set(bx + sx, by + sy + 1, '#fff4b0'); buffer.set(bx + sx, by + sy - 1, '#fff4b0') }
  attacksHud(buffer, accent, 3, 1250, 3)
  return buffer
}
