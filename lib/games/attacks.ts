/**
 * RANDOM ATTACKS' screens, sketched after the owner's picture: the title and
 * a moment of play.
 *
 * The title: night on Mars — a purple sky with pink clouds of stars, stars
 * in colours, a grey moon full of craters, a big striped blue planet — red
 * spires of rock, a plain; burgers flying on their jets in a stream that
 * goes off into the distance. A fast food of the fifties and sixties: a roof
 * like a wing, teal pillars leaning and pierced with portholes, an orange
 * spire with its ring, big glass with the counter, the stools, the booths and
 * the lights inside, a round airlock of a door. RANDOM BURGER on an oval sign
 * with a rocket across it, on two pylons. The cook in front, a hero's
 * stance: paper cap, teal jacket, apron, spatula up, ketchup and mustard in
 * a holster on his belt. ATTACKS over it all in Zen Dots, laid back like a
 * film's title, deep, its face in bands, a cream contour and an ink outline,
 * in the theme's colour. RANDOM, LEVEL and BEST stand where they do on the
 * other games.
 *
 * The play: the cook at the bottom with his ketchup, flying burgers in rows,
 * stacks of plates to hide behind, what each side throws, the golden burger
 * across the top, a bonus falling.
 */

import { ATTACKS_LETTERING, type AttacksLettering } from './attacks-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { dim, dither, drawText, drawText7, mix, PixelBuffer, text7Width, textWidth } from './pixels'
import { rng } from './scenes'
import { GREY as GREY_TEXT, HUD_HEIGHT, infoLine, pressStart } from './ui'

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

const SKY = ['#0a0718', '#0f0a22', '#150d2c', '#1c1036', '#241440', '#2c1848', '#371c50', '#452254', '#552a56', '#663254']
const NEBULA = ['#2e1648', '#45205a', '#5e2a68', '#7a3472']
const BLUE = ['#0c1430', '#13224e', '#1a326c', '#244688', '#305ca2', '#4274b8', '#5a8ec8', '#78aad6', '#9cc4e2', '#c4dcec']
const GREY = ['#26242c', '#383640', '#4c4a54', '#62606a', '#7a7882', '#94929a', '#aeacb2', '#c8c6ca']
type Rock = { cap: string; lit: string; mid: string; shade: string; deep: string }
const FAR_ROCK: Rock = { cap: '#8a3e4c', lit: '#6e3044', mid: '#5a283e', shade: '#4a2238', deep: '#3a1c32' }
const MID_ROCK: Rock = { cap: '#ec8a54', lit: '#cc6040', mid: '#a44634', shade: '#76302e', deep: '#52222a' }
const NEAR_ROCK: Rock = { cap: '#f49a60', lit: '#d86a44', mid: '#b04c36', shade: '#7e322e', deep: '#4e1e24' }
const GROUND = ['#6e2a26', '#80322a', '#92402e', '#a44c34', '#b6583a', '#c46642']

/** The sky deepening upward, and the pink clouds of stars across it. */
function nightSky(buffer: PixelBuffer, horizon: number, seed: number): void {
  const W = buffer.width
  for (let y = 0; y < buffer.height; y += 1) {
    const t = Math.min(1, y / horizon)
    for (let x = 0; x < W; x += 1) {
      let color = ramp(SKY, t, x, y)
      // a band of nebula across the sky, from the upper left down to the right
      const along = (x / W) * 0.9 + (y / horizon) * 0.6
      const n = fbm(x / 70, y / 40, seed, 4) - Math.abs(along - 0.75) * 0.9
      if (n > 0.18) color = ramp(NEBULA, Math.min(1, (n - 0.18) * 2.2), x, y)
      else if (n > 0.1 && dither(x, y, (n - 0.1) / 0.08)) color = NEBULA[0]
      buffer.set(x, y, color)
    }
  }
}

/** A world in the sky, lit from the upper left: stripes if `stripes`, craters otherwise; a soft halo. */
function world(buffer: PixelBuffer, cx: number, cy: number, r: number, colors: readonly string[], stripes: number, seed: number): void {
  for (let y = Math.floor(cy - r * 1.25); y <= cy + r * 1.25; y += 1) for (let x = Math.floor(cx - r * 1.25); x <= cx + r * 1.25; x += 1) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if (d > r && d < r * 1.25 && dither(x, y, 0.28 * (1 - (d - r) / (r * 0.25)))) buffer.tint(x, y, colors[colors.length - 2], 0.2)
  }
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
    const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r
    const d2 = nx * nx + ny * ny
    if (d2 > 1) continue
    const nz = Math.sqrt(1 - d2)
    const light = Math.max(0, Math.min(1, -nx * 0.6 - ny * 0.35 + nz * 0.72))
    let t = 0.1 + light * 0.78
    if (stripes) {
      const lat = ny + 0.08 * (fbm(nx * 3, ny * 4, seed) - 0.5)
      t += 0.14 * Math.sin(lat * stripes) + 0.06 * Math.sin(lat * stripes * 2.3 + 1)
    } else t += (fbm(nx * 4, ny * 4, seed, 3) - 0.5) * 0.18
    buffer.set(x, y, ramp(colors, t, x, y))
  }
  if (!stripes) {
    for (const [ox, oy, rr] of [[-0.3, -0.3, 0.2], [0.25, 0.1, 0.16], [-0.1, 0.45, 0.12], [0.45, -0.4, 0.1], [-0.55, 0.15, 0.09]] as const) {
      const ccx = cx + ox * r, ccy = cy + oy * r, cr = rr * r
      for (let y = Math.floor(ccy - cr); y <= ccy + cr; y += 1) for (let x = Math.floor(ccx - cr); x <= ccx + cr; x += 1) {
        const d = Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy)
        if (d > cr || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue
        buffer.set(x, y, d > cr - 1.3 ? (x + y < ccx + ccy ? colors[2] : colors[6]) : mix(buffer.hex(x, y), colors[1], 0.3))
      }
    }
  }
}

/** Stars in colours: dots, small crosses, four-pointed sparkles that pulse; only where the sky still shows. */
function starfield(buffer: PixelBuffer, sky: Uint8Array, seed: number, count: number, frame: number): void {
  const next = rng(seed)
  const W = buffer.width
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < buffer.height && sky[y * W + x] === 1
  const colors = ['#fff6e0', '#ffd27a', '#ff9a5a', '#a8c4ff', '#fff6e0', '#ffb0d0']
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(next() * W), y = Math.floor(next() * buffer.height)
    const kind = next(), color = colors[Math.floor(next() * colors.length)]
    if (!free(x, y)) continue
    const on = (i + frame) % 5 !== 0
    if (kind < 0.07) {
      const len = on ? 5 : 3
      for (let d = 1; d <= len; d += 1) {
        const c = d === 1 ? color : d < len - 1 ? mix(color, SKY[4], 0.35) : mix(color, SKY[4], 0.7)
        for (const [px, py] of [[x + d, y], [x - d, y], [x, y + d], [x, y - d]]) if (free(px, py)) buffer.set(px, py, c)
      }
      for (const [px, py] of [[x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]]) if (free(px, py)) buffer.tint(px, py, color, 0.4)
      buffer.set(x, y, '#ffffff')
    } else if (kind < 0.22) {
      buffer.set(x, y, on ? color : mix(color, SKY[4], 0.5))
      if (on) for (const [px, py] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (free(px, py)) buffer.tint(px, py, color, 0.45)
    } else if (on || kind > 0.6) buffer.set(x, y, kind > 0.6 ? mix(color, SKY[5], 0.5) : color)
  }
}

/** A butte or a spire of red rock: a flat, uneven top lit orange, the left face lit, the right in shadow, strata, the foot darker. */
function butte(buffer: PixelBuffer, sky: Uint8Array, x0: number, base: number, w: number, h: number, tones: Rock, seed: number): void {
  const W = buffer.width
  for (let c = 0; c < w; c += 1) {
    const x = x0 + c
    if (x < 0 || x >= W) continue
    const t = (c + 0.5) / w
    const slope = Math.min(1, t / 0.14, (1 - t) / 0.14)
    const jag = Math.round((hash(Math.floor(c / 3), seed, 7) - 0.5) * 4)
    const top = Math.round(base - h * (0.55 + 0.45 * slope)) + (slope >= 1 ? jag : 0)
    for (let y = Math.max(0, top); y < base; y += 1) {
      const depth = (y - top) / Math.max(1, base - top)
      let color = t < 0.4 ? tones.lit : t < 0.5 ? (dither(x, y, (t - 0.4) * 10) ? tones.mid : tones.lit) : t < 0.62 ? tones.mid : tones.shade
      if (y - top < 2 && slope >= 1) color = tones.cap
      else if ((y - top) % 9 === 5) color = color === tones.lit ? tones.mid : tones.deep
      if (depth > 0.7 && dither(x, y, (depth - 0.7) * 3)) color = tones.deep
      buffer.set(x, y, color)
      if (y < buffer.height) sky[y * W + x] = 0
    }
  }
}

/** The plain: bands of red getting lighter toward us, soft dune shadows, pebbles. */
function plain(buffer: PixelBuffer, sky: Uint8Array, top: number, bottom: number, seed: number): void {
  const W = buffer.width
  for (let y = top; y < bottom; y += 1) {
    const t = (y - top) / Math.max(1, bottom - top)
    for (let x = 0; x < W; x += 1) {
      let v = 0.15 + t * 0.7
      const dune = Math.sin(x / 38 + y / 9 + fbm(x / 60, y / 20, seed) * 4)
      if (dune > 0.86) v -= 0.18
      buffer.set(x, y, ramp(GROUND, v, x, y))
      sky[y * W + x] = 0
    }
  }
  const next = rng(seed + 3)
  for (let i = 0; i < 70; i += 1) {
    const t = next(), x = Math.floor(next() * W), y = Math.round(top + 3 + t * t * (bottom - top - 6))
    const size = 1 + Math.round(t * t * 3)
    buffer.rect(x, y, size + 1, size, GROUND[0]); buffer.rect(x, y, size, 1, GROUND[5])
  }
}

/** A heap of rocks in the foreground: lumps lit on top, dark below. */
function rocks(buffer: PixelBuffer, x: number, ground: number, w: number, h: number, seed: number): void {
  const next = rng(seed)
  for (let i = 0; i < 5; i += 1) {
    const rw = w * (0.3 + next() * 0.4), rh = h * (0.4 + next() * 0.6)
    const rx = x + next() * (w - rw), ry = ground
    buffer.poly([[rx, ry], [rx + rw * 0.15, ry - rh * 0.8], [rx + rw * 0.45, ry - rh], [rx + rw * 0.8, ry - rh * 0.7], [rx + rw, ry]], NEAR_ROCK.shade)
    buffer.poly([[rx + rw * 0.15, ry - rh * 0.8], [rx + rw * 0.45, ry - rh], [rx + rw * 0.55, ry - rh * 0.75], [rx + rw * 0.25, ry - rh * 0.55]], NEAR_ROCK.lit)
    buffer.line(rx + rw * 0.15, ry - rh * 0.8, rx + rw * 0.45, ry - rh, NEAR_ROCK.cap)
    buffer.rect(Math.round(rx), Math.round(ry) - 2, Math.round(rw), 2, NEAR_ROCK.deep)
  }
}

function crater(buffer: PixelBuffer, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
    if (d > 1) continue
    buffer.set(x, y, d > 0.68 ? (y < cy ? '#4a1c1e' : GROUND[5]) : '#3a161a')
  }
}

// ---------------------------------------------------------------- the burgers from space

/**
 * A burger flying on its jets, `size` pixels wide: a sesame bun lit from the
 * upper left, lettuce, cheese dripping, a patty, the bottom bun, and its
 * flames trailing behind. Small, it is a few dots; big, it has its outline.
 */
function flyingBurger(buffer: PixelBuffer, cx: number, cy: number, size: number, frame: number, gold = false): void {
  const s = size
  const bun = gold ? '#ffcc33' : '#d9893a', bunLight = gold ? '#fff2a0' : '#f4b860', bunDark = gold ? '#c8901a' : '#a85a24'
  if (s < 9) {
    buffer.rect(Math.round(cx - s / 2), Math.round(cy - 1), Math.max(2, Math.round(s)), 1, bun)
    buffer.rect(Math.round(cx - s / 2), Math.round(cy), Math.max(2, Math.round(s)), 1, '#5a2a14')
    buffer.set(Math.round(cx + s / 2), Math.round(cy + 1), frame % 2 ? '#ffcc33' : '#ff7a2a')
    return
  }
  const w = Math.round(s), h = Math.round(s * 0.72) + Math.round(s * 0.35)
  const draw = (f: PixelBuffer) => {
    const c = w / 2
    const topH = s * 0.36
    // jets under it, trailing back and down
    const flame = frame % 2 ? 1 : 0.8
    for (const jx of [w * 0.3, w * 0.62]) {
      const len = s * 0.36 * flame
      f.poly([[jx - s * 0.07, topH + s * 0.34], [jx + s * 0.07, topH + s * 0.34], [jx + s * 0.16, topH + s * 0.34 + len]], '#ff7a2a')
      f.poly([[jx - s * 0.035, topH + s * 0.34], [jx + s * 0.035, topH + s * 0.34], [jx + s * 0.1, topH + s * 0.34 + len * 0.7]], '#ffcc33')
    }
    // the top bun: a dome, its light, sesame
    for (let y = 0; y < topH + 1; y += 1) for (let x = 0; x < w; x += 1) {
      const nx = (x + 0.5 - c) / (w / 2), ny = (y + 0.5 - topH) / topH
      if (nx * nx + ny * ny > 1) continue
      f.set(x, y, nx < -0.15 && ny < -0.35 ? bunLight : nx > 0.55 || ny > -0.15 ? bunDark : bun)
    }
    if (!gold) for (let k = 0; k < Math.round(s / 6); k += 1) f.set(Math.round(c + (hash(k, 3, 1) - 0.5) * w * 0.7), Math.round(topH * (0.3 + hash(k, 4, 1) * 0.45)), '#fff4d8')
    let y = Math.round(topH)
    const layer = (height: number, color: string, wave = false) => {
      const hh = Math.max(1, Math.round(height))
      for (let x = 1; x < w - 1; x += 1) for (let k = 0; k < hh + (wave && (x >> 1) % 2 ? 1 : 0); k += 1) f.set(x, y + k, color)
      y += hh
    }
    layer(s * 0.07, gold ? '#ffe680' : '#4cae3c', true)
    layer(s * 0.06, gold ? '#ffcc33' : '#ffc83a')
    if (!gold) { f.rect(Math.round(w * 0.2), y, Math.max(1, Math.round(s * 0.05)), Math.max(1, Math.round(s * 0.08)), '#ffc83a'); f.rect(Math.round(w * 0.66), y, Math.max(1, Math.round(s * 0.05)), Math.max(1, Math.round(s * 0.06)), '#ffc83a') }
    layer(s * 0.13, gold ? '#e0a020' : '#5a2a14')
    for (let x = 2; x < w - 2; x += 3) f.set(x, y - Math.max(1, Math.round(s * 0.07)), gold ? '#fff2a0' : '#7a3e1e')
    const bottom = Math.max(2, Math.round(s * 0.12))
    for (let k = 0; k < bottom; k += 1) for (let x = 1 + (k === bottom - 1 ? 1 : 0); x < w - 1 - (k === bottom - 1 ? 1 : 0); x += 1) f.set(x, y + k, k === 0 ? bun : bunDark)
  }
  if (s < 16) {
    const f = new PixelBuffer(w, h, KEY)
    draw(f)
    buffer.stamp(f, Math.round(cx - w / 2), Math.round(cy - h / 2), KEY)
  } else figure(buffer, cx, cy + h / 2 + 1, w + 2, h + 2, (f) => { const g = new PixelBuffer(w, h, KEY); draw(g); f.stamp(g, 1, 1, KEY) })
}

/** What the burgers throw down: an onion ring, a tomato slice, a strip of bacon, a pickle. */
function droplet(buffer: PixelBuffer, x: number, y: number, kind: number): void {
  if (kind === 0) { for (let yy = -4; yy <= 4; yy += 1) for (let xx = -4; xx <= 4; xx += 1) { const d = Math.hypot(xx, yy); if (d <= 3.6 && d >= 1.8) buffer.set(x + xx, y + yy, d > 3 ? '#d8c8a0' : '#f4ecd0') } }
  else if (kind === 1) { buffer.disc(x, y, 3.5, '#e0301e'); buffer.disc(x, y, 2.2, '#f05a3c'); buffer.set(x - 1, y - 1, '#ffd0a0'); buffer.set(x + 1, y + 1, '#ffd0a0') }
  else if (kind === 2) { for (let d = 0; d < 9; d += 1) buffer.rect(x - 1 + ((d >> 1) % 2), y - 4 + d, 3, 1, d % 3 ? '#d8505a' : '#f4a0a0') }
  else { buffer.disc(x, y, 3, '#3f8a3a'); buffer.disc(x, y, 1.5, '#9ad070') }
}

// ---------------------------------------------------------------- the cook

const SKIN = '#f6c49c', SKIN_DARK = '#d8946c', HAIR = '#6a3a1e', HAIR_LIGHT = '#8e5230'
const WHITE = '#f6f2ea', WHITE_SHADE = '#d6d0c4'
const TEAL = '#2aa89a', TEAL_LIGHT = '#5cd0bc', TEAL_DARK = '#167468'
const DENIM = '#2a3456', DENIM_LIGHT = '#3e4a74', DENIM_DARK = '#1c2440'

/**
 * The cook in a hero's stance, 120 × 172: legs apart in jeans and sneakers,
 * a white apron, a red belt with a holster of ketchup and mustard, a teal
 * jacket open on a white shirt, a star on his chest; a hand on his hip, the
 * other up with a spatula; brown hair under a paper cap with a red stripe,
 * a sure smile.
 */
function cook(buffer: PixelBuffer, x: number, feet: number): void {
  figure(buffer, x, feet, 122, 174, (f) => {
    // sneakers
    for (const [sx, dir] of [[30, -1], [78, 1]] as const) {
      f.poly([[sx, 158], [sx + 16, 158], [sx + 16 + dir * 4, 168], [sx - 2 + (dir < 0 ? -4 : 0), 168]], WHITE)
      f.rect(sx - (dir < 0 ? 5 : 1), 166, 22, 3, '#b0b0b8'); f.rect(sx + 2, 161, 10, 2, '#e03040')
    }
    // jeans: legs apart
    f.poly([[42, 104], [58, 104], [48, 160], [32, 160]], DENIM); f.poly([[44, 106], [50, 106], [38, 158], [34, 158]], DENIM_LIGHT)
    f.poly([[62, 104], [78, 104], [92, 160], [76, 160]], DENIM); f.poly([[74, 106], [78, 106], [92, 158], [88, 158]], DENIM_DARK)
    // the apron, its red trim
    f.poly([[40, 98], [80, 98], [86, 140], [34, 140]], WHITE); f.poly([[66, 100], [80, 100], [86, 140], [72, 140]], WHITE_SHADE)
    f.rect(34, 138, 53, 3, '#e03040')
    // the jacket: teal, open on a white shirt, ribbed collar and cuffs, a star
    f.poly([[38, 58], [82, 58], [86, 100], [34, 100]], TEAL)
    f.poly([[70, 60], [82, 58], [86, 100], [74, 100]], TEAL_DARK)
    f.poly([[38, 58], [44, 58], [40, 100], [34, 100]], TEAL_LIGHT)
    f.poly([[52, 58], [68, 58], [66, 98], [54, 98]], WHITE)
    f.rect(50, 54, 20, 6, '#e03040'); f.rect(50, 56, 20, 1, WHITE)
    f.poly([[44, 68], [46, 64], [48, 68], [45, 70]], '#ffcc33'); f.set(46, 66, '#fff2a0')
    // the belt and its holster: ketchup and mustard ready
    f.rect(38, 96, 46, 5, '#d03030'); f.rect(57, 96, 7, 5, '#c8ccd6'); f.rect(59, 97, 3, 3, '#8a8ea4')
    f.rect(80, 98, 14, 18, '#7a4a2a'); f.rect(80, 98, 14, 2, '#9a6038')
    f.rect(81, 84, 5, 16, '#e0301e'); f.rect(81, 81, 5, 3, WHITE); f.rect(82, 77, 3, 4, '#e0301e')
    f.rect(88, 86, 5, 14, '#ffcc33'); f.rect(88, 83, 5, 3, WHITE); f.rect(89, 79, 3, 4, '#ffcc33')
    // the left arm: elbow out, the hand on the hip
    stroke(f, 40, 64, 22, 86, 6.5, TEAL); stroke(f, 22, 86, 36, 98, 6, TEAL)
    f.rect(30, 92, 9, 4, '#e03040')
    f.disc(38, 99, 5, SKIN)
    // the right arm up, the spatula
    stroke(f, 80, 64, 96, 56, 6.5, TEAL); stroke(f, 96, 56, 102, 40, 6, TEAL)
    f.rect(97, 42, 10, 4, '#e03040')
    f.disc(102, 36, 5.2, SKIN)
    stroke(f, 103, 34, 108, 18, 1.8, '#2a2a30')
    f.poly([[102, 2], [116, 4], [114, 20], [100, 18]], '#c8ccd6'); f.poly([[102, 2], [108, 3], [104, 19], [100, 18]], '#eef0f6')
    for (const k of [0, 1, 2]) f.line(104 + k * 3, 6, 103 + k * 3, 15, '#8a8ea4')
    // neck and head: a face lit from the left, the jaw, an ear
    f.rect(52, 48, 16, 8, SKIN_DARK)
    f.disc(60, 36, 14.5, SKIN)
    f.poly([[47, 40], [73, 40], [66, 52], [54, 52]], SKIN)
    f.disc(46, 38, 3.2, SKIN); f.set(46, 38, SKIN_DARK)
    f.poly([[66, 30], [74, 32], [72, 48], [66, 52]], mix(SKIN, SKIN_DARK, 0.5))
    // hair under the cap, spiky at the front and the sides
    f.poly([[44, 34], [48, 22], [56, 18], [70, 20], [76, 28], [75, 36], [70, 28], [62, 30], [56, 26], [50, 32], [47, 40]], HAIR)
    f.poly([[50, 24], [56, 20], [62, 22], [54, 28]], HAIR_LIGHT)
    // the face: brows, eyes with a glint, a sure grin
    f.rect(50, 32, 6, 2, HAIR); f.rect(62, 31, 7, 2, HAIR)
    f.rect(51, 35, 4, 5, INK); f.rect(63, 35, 4, 5, INK); f.set(52, 35, '#ffffff'); f.set(64, 35, '#ffffff')
    f.rect(58, 39, 2, 4, SKIN_DARK)
    f.poly([[52, 45], [66, 44], [63, 48], [55, 48]], '#8a2a2a'); f.rect(54, 45, 11, 1, '#ffffff')
    f.disc(50, 42, 1.6, '#f49a8a')
    // the paper cap: a long boat, a red stripe, a little badge
    f.poly([[42, 22], [58, 9], [78, 18], [76, 24], [44, 26]], WHITE)
    f.poly([[58, 9], [78, 18], [68, 18]], WHITE_SHADE)
    f.poly([[44, 22], [76, 20], [76, 24], [44, 26]], '#e03040')
    f.disc(52, 16, 2, '#e03040')
  })
}

/** The cook small, for the play: cap, hair, teal jacket, apron, jeans, the ketchup up. */
function cookSmall(buffer: PixelBuffer, x: number, feet: number): void {
  figure(buffer, x, feet, 24, 32, (f) => {
    f.rect(6, 28, 5, 3, WHITE); f.rect(13, 28, 5, 3, WHITE)
    f.rect(7, 22, 4, 6, DENIM); f.rect(13, 22, 4, 6, DENIM)
    f.rect(6, 15, 12, 8, TEAL); f.rect(10, 15, 4, 8, WHITE); f.rect(7, 19, 10, 5, WHITE); f.rect(7, 23, 10, 1, '#e03040')
    f.disc(12, 9, 4.5, SKIN); f.rect(8, 5, 8, 3, HAIR); f.set(10, 9, INK); f.set(14, 9, INK); f.rect(10, 11, 4, 1, '#8a2a2a')
    f.poly([[6, 5], [12, 1], [19, 4], [18, 6], [7, 6]], WHITE); f.rect(7, 5, 11, 1, '#e03040')
    stroke(f, 6, 16, 3, 10, 1.6, TEAL)
    f.rect(2, 1, 3, 9, '#e0301e'); f.rect(2, 4, 3, 2, WHITE); f.set(3, 0, '#e0301e')
  })
}

// ---------------------------------------------------------------- the restaurant and its sign

/**
 * The fast food: `x` to `x + width`, on `ground`. A roof like a wing, high on
 * the left and coming down to the right, cream with a red stripe, orange
 * underneath with its lights; teal pillars leaning, pierced with portholes;
 * an orange spire with its ring; big glass on the warm inside — booths,
 * the counter and its stools, menus, a soda machine, round lamps; a round
 * airlock of a door with two portholes; red neon along the edges.
 */
function diner(buffer: PixelBuffer, x: number, width: number, ground: number, rise: number, frame: number): void {
  const floor = ground - 14
  const right = x + width
  const edgeL = ground - rise, edgeR = ground - 74
  const edge = (xx: number) => edgeL + ((xx - (x - 8)) / (width + 20)) * (edgeR - edgeL)
  const glassTop = ground - 106
  // the slab at the foot, a red neon line under the glass
  buffer.rect(x - 6, floor, width + 12, 14, '#e8e2d6'); buffer.rect(x - 6, floor, width + 12, 2, '#ffffff'); buffer.rect(x - 6, ground - 3, width + 12, 3, '#9a948a')
  // inside: the warm room
  for (let xx = x; xx < right; xx += 1) {
    const top = Math.max(glassTop, Math.ceil(edge(xx)) + 2)
    for (let y = top; y < floor; y += 1) buffer.set(xx, y, ramp(['#ffeec4', '#ffd890', '#ffc26a', '#f4a454'], (y - glassTop) / (floor - glassTop), xx, y))
  }
  const room = floor - glassTop
  // the menus and the soda machine at the back, round lamps hanging
  const mid = x + width / 2
  for (let k = -1; k <= 1; k += 1) {
    const mx = Math.round(mid + k * 30 - 12)
    buffer.rect(mx, glassTop + 10, 24, 15, '#2a2236'); buffer.rect(mx, glassTop + 10, 24, 1, '#8a8ea4')
    flyingBurger(buffer, mx + 12, glassTop + 17, 9, 0)
  }
  buffer.rect(Math.round(mid - 70), glassTop + 26, 14, 22, '#c8ccd6'); buffer.rect(Math.round(mid - 68), glassTop + 30, 10, 6, '#e03040'); buffer.rect(Math.round(mid - 68), glassTop + 38, 10, 2, '#2a2236')
  for (let lx = x + 22; lx < right - 12; lx += Math.round(width / 7)) {
    const top = Math.max(glassTop, Math.ceil(edge(lx)) + 2)
    buffer.rect(lx, top, 1, 6, '#6a5a4a'); buffer.disc(lx, top + 10, 4, '#fff8dc'); buffer.disc(lx - 1, top + 9, 1.5, '#ffffff')
    for (let d = 0; d < 6; d += 1) for (let e = -4 - d; e <= 4 + d; e += 1) if (dither(lx + e, top + 15 + d, 0.3 * (1 - d / 6))) buffer.tint(lx + e, top + 15 + d, '#fff4c0', 0.3)
  }
  // the counter and its stools in the middle, booths at both ends
  const counterY = floor - 30
  buffer.rect(Math.round(mid - 80), counterY, 160, 3, '#fff8ee'); buffer.rect(Math.round(mid - 80), counterY + 3, 160, 13, '#e03040'); buffer.rect(Math.round(mid - 80), counterY + 8, 160, 2, '#fff8ee')
  for (let sx = Math.round(mid - 72); sx <= mid + 72; sx += 18) { buffer.rect(sx, floor - 10, 2, 10, '#8a8ea4'); buffer.rect(sx - 4, floor - 13, 10, 3, '#d02838'); buffer.rect(sx - 4, floor - 13, 10, 1, '#ff6070') }
  for (const [bx, bw] of [[x + 6, Math.round(width * 0.2)], [right - 6 - Math.round(width * 0.2), Math.round(width * 0.2)]] as const) {
    buffer.rect(bx, floor - 22, bw, 22, '#c02030'); buffer.rect(bx, floor - 22, bw, 3, '#ff5a6a'); buffer.rect(bx + 4, floor - 10, bw - 8, 3, '#fff8ee')
    for (let k = 0; k < 3; k += 1) buffer.rect(bx + 3 + k * Math.round(bw / 3), floor - 19, 1, 9, '#901828')
  }
  // the glass: a cool sheen, thin mullions
  for (let xx = x; xx < right; xx += 1) {
    const top = Math.max(glassTop, Math.ceil(edge(xx)) + 2)
    for (let y = top; y < floor; y += 1) if (((xx + y * 2) % 58) < 7 && dither(xx, y, 0.4)) buffer.tint(xx, y, '#d8f0ff', 0.4)
  }
  for (let mx = x; mx <= right; mx += Math.round(width / 9)) buffer.rect(mx, Math.max(glassTop, Math.ceil(edge(mx)) + 2), 1, floor - Math.max(glassTop, Math.ceil(edge(mx)) + 2), '#9ad8d0')
  // the door: a round airlock, two portholes, a seam
  const dy = floor - 26, dr = Math.round(room * 0.28)
  buffer.disc(mid, dy, dr + 3, '#8a8ea4'); buffer.disc(mid, dy, dr, '#c8ccd6'); buffer.disc(mid - dr * 0.3, dy - dr * 0.3, dr * 0.5, '#e4e8f0')
  for (const ox of [-dr * 0.38, dr * 0.38]) { buffer.disc(mid + ox, dy - dr * 0.2, dr * 0.26, '#5a6070'); buffer.disc(mid + ox, dy - dr * 0.2, dr * 0.2, '#2a4a6a'); buffer.set(Math.round(mid + ox - 1), Math.round(dy - dr * 0.3), '#cfeaff') }
  buffer.rect(Math.round(mid), Math.round(dy - dr * 0.05), 1, Math.round(dr * 0.9), '#8a8ea4')
  buffer.rect(Math.round(mid - dr - 3), floor - 2, dr * 2 + 7, 2, '#8a8ea4')
  // the wing: orange underneath with its lights, cream on top with a red stripe, red neon along its edge
  for (let xx = x - 8; xx < right + 12; xx += 1) {
    const e = Math.round(edge(xx))
    for (let y = e; y < glassTop; y += 1) buffer.set(xx, y, ramp(['#f07a3a', '#d8582a', '#b8441e'], (y - e) / Math.max(1, glassTop - e), xx, y))
  }
  for (let lx = x + 4; lx < x + width * 0.62; lx += 22) {
    const e = edge(lx), y = Math.round(e + (glassTop - e) * 0.45)
    if (y < glassTop - 3) { buffer.disc(lx, y, 2.2, '#fff4c8'); buffer.tint(lx - 3, y, '#ffd890', 0.4); buffer.tint(lx + 3, y, '#ffd890', 0.4) }
  }
  for (let xx = x - 14; xx < right + 16; xx += 1) {
    const e = Math.round(edge(xx))
    buffer.rect(xx, e - 12, 1, 9, '#f6eedc'); buffer.set(xx, e - 12, '#ffffff'); buffer.set(xx, e - 11, '#ffffff')
    buffer.set(xx, e - 7, '#e03040'); buffer.set(xx, e - 6, '#e03040')
    buffer.rect(xx, e - 3, 1, 3, '#d8ccb4')
    buffer.set(xx, e, '#ff3a5a'); for (let g = 1; g < 4; g += 1) if (dither(xx, e + g, 0.5 - g * 0.12)) buffer.tint(xx, e + g, '#ff6a80', 0.35)
  }
  // pillars: teal, leaning, portholes in them
  const pillar = (bx: number, tx: number, top: number, w0: number) => {
    const by = ground - 1
    buffer.poly([[bx - w0 / 2, by], [bx + w0 / 2, by], [tx + w0 * 0.3, top], [tx - w0 * 0.3, top]], TEAL)
    buffer.poly([[bx - w0 / 2, by], [bx - w0 / 2 + 3, by], [tx - w0 * 0.3 + 2, top], [tx - w0 * 0.3, top]], TEAL_LIGHT)
    buffer.poly([[bx + w0 / 2 - 3, by], [bx + w0 / 2, by], [tx + w0 * 0.3, top], [tx + w0 * 0.3 - 2, top]], TEAL_DARK)
    for (let k = 1; k <= 3; k += 1) { const t = k / 4.2; buffer.disc(bx + (tx - bx) * t, by + (top - by) * t, w0 * 0.17, '#0e3a36') }
  }
  pillar(x + width * 0.14, x + width * 0.2, edge(x + width * 0.2) + 1, 16)
  pillar(x + width * 0.56, x + width * 0.53, edge(x + width * 0.53) + 1, 14)
  pillar(right - 8, right - 10, edge(right - 10) + 1, 12)
  // the spire and its ring
  const sx = x + width * 0.38, sb = Math.round(edge(sx) - 12), st = sb - Math.round(rise * 0.42)
  const ring = (front: boolean) => {
    for (let a = 0; a < 200; a += 1) {
      const ang = (a / 200) * Math.PI * 2, rx = 34 * (width / 440), ry = 7
      const px = sx + Math.cos(ang) * rx, py = sb - (sb - st) * 0.3 + Math.sin(ang) * ry
      if ((Math.sin(ang) > 0) !== front) continue
      buffer.set(Math.round(px), Math.round(py), '#f6eedc'); buffer.set(Math.round(px), Math.round(py) + 1, '#c8bca4')
    }
  }
  ring(false)
  buffer.poly([[sx - 10, sb], [sx + 10, sb], [sx, st]], '#f07a30'); buffer.poly([[sx - 10, sb], [sx - 3, sb], [sx, st]], '#ffa060'); buffer.poly([[sx + 4, sb], [sx + 10, sb], [sx, st]], '#c05020')
  buffer.disc(sx, st, 1.6, frame % 2 ? '#ffffff' : '#ffcc33')
  ring(true)
}

/**
 * RANDOM BURGER: an oval sign in teal ringed in cream and red, a red rocket
 * across it, yellow sparkles, an antenna with its ring on top; the name in
 * fat cream letters edged in red; two cream pylons pierced with portholes.
 */
function burgerSign(buffer: PixelBuffer, cx: number, cy: number, scale: number, ground: number, frame: number): void {
  const rx = Math.round(86 * scale), ry = Math.round(44 * scale)
  // the pylons
  for (const px of [cx - rx * 0.4, cx + rx * 0.3]) {
    const w = Math.round(12 * scale)
    buffer.poly([[px - w / 2, cy + ry - 4], [px + w / 2, cy + ry - 4], [px + w / 2 + 2, ground], [px - w / 2 - 2, ground]], '#f2ead8')
    buffer.poly([[px + w / 2 - 3, cy + ry - 4], [px + w / 2, cy + ry - 4], [px + w / 2 + 2, ground], [px + w / 2 - 1, ground]], '#c8bca4')
    for (let k = 1; k <= 2; k += 1) buffer.disc(px, cy + ry + ((ground - cy - ry) * k) / 3, Math.max(2, 3 * scale), '#4a3a40')
  }
  // the antenna and its ring
  const ax = cx - rx * 0.45
  buffer.rect(Math.round(ax), Math.round(cy - ry - 52 * scale), 2, Math.round(52 * scale), '#c8bca4')
  for (let a = 0; a < 120; a += 1) { const ang = (a / 120) * Math.PI * 2; buffer.set(Math.round(ax + 1 + Math.cos(ang) * 14 * scale), Math.round(cy - ry - 36 * scale + Math.sin(ang) * 3 * scale), '#ffd27a') }
  buffer.disc(ax + 1, cy - ry - 54 * scale, 2.5 * scale, frame % 2 ? '#ffcc33' : '#fff4c0')
  // the oval: teal, a lighter ring inside, cream and red around, an ink edge
  for (let y = Math.floor(cy - ry - 6); y <= cy + ry + 6; y += 1) for (let x = Math.floor(cx - rx - 6); x <= cx + rx + 6; x += 1) {
    const d = Math.sqrt(((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2)
    if (d <= 0.84) buffer.set(x, y, y < cy - ry * 0.2 ? '#126a66' : '#0e5652')
    else if (d <= 0.9) buffer.set(x, y, '#2a9a8a')
    else if (d <= 0.97) buffer.set(x, y, '#f2ead8')
    else if (d <= 1.02) buffer.set(x, y, '#e03040')
    else if (d <= 1.06) buffer.set(x, y, INK)
  }
  for (const [sx, sy, big] of [[0.55, -0.5, 1], [0.75, -0.05, 0], [0.38, 0.55, 0]] as const) {
    const X = Math.round(cx + sx * rx), Y = Math.round(cy + sy * ry), len = big ? Math.round(5 * scale) : Math.round(3 * scale)
    for (let d = 1; d <= len; d += 1) for (const [px, py] of [[X + d, Y], [X - d, Y], [X, Y + d], [X, Y - d]]) buffer.set(px, py, d < len ? '#ffcc33' : '#c89a10')
    buffer.set(X, Y, '#fff8d0')
  }
  // the rocket, tilted across the top left of the oval
  rocket(buffer, cx - rx * 0.32, cy - ry * 0.62, Math.round(96 * scale), frame)
  // the name: RANDOM big, BURGER under it, cream edged in red, a shadow
  const words: Array<[string, number, number]> = [['RANDOM', Math.max(2, Math.round(3 * scale)), Math.round(cy - ry * 0.32)], ['BURGER', Math.max(1, Math.round(2 * scale)), Math.round(cy + ry * 0.28)]]
  for (const [word, sc, y] of words) {
    const tw = text7Width(word, sc, true), x = Math.round(cx - tw / 2 + rx * 0.06)
    drawText7(buffer, word, x + sc, y + sc, INK, sc, true)
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) drawText7(buffer, word, x + ox, y + oy, '#e03040', sc, true)
    drawText7(buffer, word, x, y, '#fff4dc', sc, true)
  }
}

/** A red rocket in volume, tilted up to the right: shaded round, a white band, a porthole, yellow fins, its flame; with an ink outline. */
function rocket(buffer: PixelBuffer, cx: number, cy: number, length: number, frame: number): void {
  const L = length, rr = Math.round(L * 0.135), angle = (30 * Math.PI) / 180
  const ax = Math.cos(angle), ay = -Math.sin(angle), nx = Math.sin(angle), ny = Math.cos(angle)
  const size = Math.round(L * 1.5), c = size / 2
  const flame = (frame % 2 ? 0.3 : 0.2) * L
  figure(buffer, cx, cy + size / 2, size, size, (f) => {
    const radius = (u: number) => {
      if (u < -L / 2 || u > L / 2) return -1
      if (u <= L * 0.12) return rr
      const t = (u - L * 0.12) / (L * 0.38)
      return rr * Math.sqrt(Math.max(0, 1 - t * t))
    }
    for (let Y = 0; Y < size; Y += 1) for (let X = 0; X < size; X += 1) {
      const dx = X + 0.5 - c, dy = Y + 0.5 - c
      const u = dx * ax + dy * ay, v = dx * nx + dy * ny
      const back = -L / 2 - u
      if (back > 1 && back < flame + 3) {
        const w = rr * 0.75 * (1 - back / (flame + 3))
        if (Math.abs(v) <= w) f.set(X, Y, Math.abs(v) < w * 0.4 ? '#fff4b0' : Math.abs(v) < w * 0.75 ? '#ffcc33' : '#ff7a2a')
      }
      for (const side of [-1, 1]) {
        const fu = u + L / 2, fv = v * side - rr + 1
        if (fu > -L * 0.06 && fu < L * 0.24 && fv > 0 && fv < L * 0.15 && fv < (L * 0.24 - fu) * 0.62 && fv < fu + L * 0.09) f.set(X, Y, fv > L * 0.11 || fu > L * 0.2 ? '#c8901a' : '#ffcc33')
      }
    }
    for (let Y = 0; Y < size; Y += 1) for (let X = 0; X < size; X += 1) {
      const dx = X + 0.5 - c, dy = Y + 0.5 - c
      const u = dx * ax + dy * ay, v = dx * nx + dy * ny
      const rad = radius(u)
      if (rad <= 0 || Math.abs(v) > rad) continue
      const s = v / rad
      const band = u > L * 0.08 && u < L * 0.18
      const tones = band ? ['#ffffff', '#f6f0e4', '#d8d2c4', '#a8a090'] : ['#ff9a80', '#f04a3a', '#d02a24', '#8a1418']
      f.set(X, Y, s < -0.55 ? tones[0] : s < -0.15 ? tones[1] : s < 0.5 ? tones[2] : tones[3])
      if (u < -L / 2 + L * 0.04) f.set(X, Y, s < 0 ? '#9a9aa8' : '#5a5a68')
    }
    const px = c + ax * L * -0.1, py = c + ay * L * -0.1, pr = L * 0.09
    f.disc(px, py, pr, '#8a8ea4'); f.disc(px - 0.5, py - 0.5, pr * 0.85, '#d8dce6'); f.disc(px, py, pr * 0.62, '#2a6a8a'); f.disc(px - 1, py - 1, pr * 0.45, '#5ab8e0'); f.disc(px - pr * 0.3, py - pr * 0.3, Math.max(1, pr * 0.18), '#e8f8ff')
  })
}

/** A little rover parked on the plain: six wheels, a panel, a mast with its eye. */
function rover(buffer: PixelBuffer, x: number, ground: number, frame: number): void {
  figure(buffer, x, ground, 78, 50, (f) => {
    f.rect(8, 24, 60, 12, '#e4e4ea'); f.rect(8, 24, 60, 2, '#ffffff'); f.rect(8, 34, 60, 2, '#9a9aaa')
    f.rect(12, 20, 52, 4, '#2a3a8a'); for (let px = 14; px < 62; px += 6) f.rect(px, 21, 4, 2, '#4a6ad0')
    f.rect(54, 8, 3, 12, '#9a9aaa'); f.rect(50, 4, 11, 6, '#e4e4ea'); f.rect(57, 6, 3, 2, frame % 2 ? '#ff5a3c' : '#5aa8ff')
    f.rect(20, 27, 10, 6, '#e03040'); f.rect(36, 27, 4, 4, '#2a2a34')
    for (const wx of [14, 30, 46, 62]) { f.disc(wx, 41, 6, '#2a2a34'); f.disc(wx, 41, 2.5, '#8a8a9a') }
    f.rect(10, 36, 56, 2, '#5a5a6a')
  })
}

// ---------------------------------------------------------------- the title

type Place = {
  randomY: number; markY: number; markWidth: number; stretch: number
  horizon: number; plain: number
  far: Array<[number, number, number]>; mid: Array<[number, number, number]>; near: Array<[number, number, number, number]>
  moon: [number, number, number]; planet: [number, number, number]
  burgers: Array<[number, number, number]>
  diner: [number, number, number, number]; sign: [number, number, number]; cook: [number, number]; rover: [number, number]
  crater: [number, number, number, number]
  press: number; info: 'top' | 'bottom'
}

const PLACES: Record<Layout, Place> = {
  landscape: {
    randomY: 16, markY: 62, markWidth: 560, stretch: 1.15,
    horizon: 300, plain: 300,
    far: [[150, 64, 46], [222, 44, 32], [300, 90, 26], [420, 70, 40], [512, 56, 58], [590, 90, 38], [690, 80, 50]],
    mid: [[-10, 64, 176], [40, 52, 124], [96, 40, 84], [250, 60, 36], [470, 64, 48], [602, 60, 108], [652, 44, 150], [700, 72, 118], [752, 40, 88]],
    near: [[0, 432, 120, 30], [660, 432, 108, 26]],
    moon: [96, 76, 27], planet: [700, 66, 66],
    burgers: [[728, 98, 56], [688, 162, 40], [746, 200, 24], [640, 206, 26], [700, 226, 18], [598, 220, 16], [728, 244, 13], [640, 242, 12], [570, 232, 10], [672, 254, 9], [604, 252, 8], [548, 244, 7], [636, 262, 6], [580, 260, 5], [522, 254, 5], [612, 270, 4], [556, 268, 4]],
    diner: [198, 398, 372, 150], sign: [100, 262, 0.94], cook: [670, 404], rover: [92, 420],
    crater: [520, 404, 46, 9],
    press: 412, info: 'top',
  },
  portrait: {
    randomY: 196, markY: 244, markWidth: 412, stretch: 1.5,
    horizon: 490, plain: 488,
    far: [[40, 70, 40], [150, 60, 30], [260, 70, 44], [350, 60, 36]],
    mid: [[-10, 50, 150], [30, 44, 100], [330, 50, 120], [380, 50, 160], [170, 50, 40]],
    near: [[0, 768, 110, 30], [330, 768, 102, 26]],
    moon: [74, 92, 30], planet: [392, 112, 74],
    burgers: [[356, 158, 52], [290, 108, 34], [330, 62, 22], [232, 128, 22], [262, 52, 16], [190, 92, 14], [214, 30, 10], [150, 66, 9], [174, 22, 7], [118, 44, 6], [128, 16, 5], [96, 30, 4]],
    diner: [34, 272, 604, 128], sign: [84, 418, 0.62], cook: [374, 664], rover: [92, 704],
    crater: [210, 724, 54, 10],
    press: 724, info: 'bottom',
  },
}

/** The night of a layout, made once: the sky and its clouds, the moon, the planet, the rocks, the plain; and where the sky still shows, for the stars. */
const backdrops = new Map<Layout, { buffer: PixelBuffer; sky: Uint8Array }>()
function backdrop(layout: Layout): { buffer: PixelBuffer; sky: Uint8Array } {
  const ready = backdrops.get(layout)
  if (ready) return ready
  const W = layout === 'landscape' ? 768 : 432, H = layout === 'landscape' ? 432 : 768
  const p = PLACES[layout]
  const buffer = new PixelBuffer(W, H, INK)
  const sky = new Uint8Array(W * H).fill(1)
  nightSky(buffer, p.horizon, layout === 'landscape' ? 3 : 4)
  const hide = (cx: number, cy: number, r: number) => { for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) sky[y * W + x] = 0 }
  world(buffer, ...p.moon, GREY, 0, 11); hide(...p.moon)
  world(buffer, ...p.planet, BLUE, 26, 12); hide(...p.planet)
  for (const [x, w, h] of p.far) butte(buffer, sky, x, p.horizon, w, h, FAR_ROCK, x)
  plain(buffer, sky, p.plain, H, layout === 'landscape' ? 5 : 9)
  for (const [x, w, h] of p.mid) butte(buffer, sky, x, p.plain + 14, w, h, MID_ROCK, x + 1)
  crater(buffer, ...p.crater)
  for (const [x, ground, w, h] of p.near) rocks(buffer, x, ground, w, h, x + 3)
  const made = { buffer, sky }
  backdrops.set(layout, made)
  return made
}

export type AttacksTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean }

/** RANDOM ATTACKS' title, wide (768 × 432) or tall (432 × 768). */
export function renderAttacksTitle(layout: Layout, accent: string, lettering: AttacksLettering = 'zen', options: AttacksTitleOptions = {}): PixelBuffer {
  const p = PLACES[layout]
  const frame = options.frame ?? 0
  const night = backdrop(layout)
  const W = night.buffer.width, H = night.buffer.height
  const buffer = new PixelBuffer(W, H, INK)
  buffer.data.set(night.buffer.data)
  starfield(buffer, night.sky, 23, layout === 'landscape' ? 170 : 210, frame)
  // RANDOM where it stands on every title, ATTACKS under it
  const rx = Math.round(W / 2 - LOGO_WIDTH)
  drawLogo(buffer, rx + 3, p.randomY + 4, INK, 2)
  drawLogo(buffer, rx, p.randomY, mix(accent, CREAM, 0.25), 2)
  drawAttacksLogo(buffer, W / 2, p.markY, p.markWidth, accent, lettering, { stretch: p.stretch })
  // the burgers on their jets, far ones first
  const drift = (frame % 4) - 1.5
  for (const [x, y, s] of [...p.burgers].sort((a, b) => a[2] - b[2])) flyingBurger(buffer, x - drift * (s / 20), y + drift * (s / 30), s, frame + Math.round(x))
  // the sign behind, the restaurant, the rover, the cook in front
  burgerSign(buffer, p.sign[0], p.sign[1], p.sign[2], p.diner[2], frame)
  diner(buffer, p.diner[0], p.diner[1], p.diner[2], p.diner[3], frame)
  rover(buffer, p.rover[0], p.rover[1], frame)
  cook(buffer, p.cook[0], p.cook[1])
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

/** A stack of plates to hide behind, already bitten into: the plates are drawn, then the sky put back where bites were taken. */
function plates(buffer: PixelBuffer, cx: number, base: number, width: number, count: number, bites: Array<[number, number, number]>): void {
  const x0 = Math.round(cx - width / 2) - 2, y0 = base - count * 4 - 6, w = width + 4, h = count * 4 + 8
  const before = new PixelBuffer(w, h, INK)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const [r, g, b] = buffer.get(Math.min(buffer.width - 1, x0 + x), Math.min(buffer.height - 1, y0 + y)); const o = (y * w + x) * 4; before.data[o] = r; before.data[o + 1] = g; before.data[o + 2] = b }
  for (let i = 0; i < count; i += 1) {
    const y = base - i * 4 - 3
    for (let xx = -width / 2; xx <= width / 2; xx += 1) for (let yy = -3; yy <= 3; yy += 1) {
      const d = (xx / (width / 2)) ** 2 + (yy / 3) ** 2
      if (d > 1) continue
      buffer.set(Math.round(cx + xx), y + yy, d > 0.75 ? (yy < 0 ? '#9ad8d0' : '#2aa89a') : yy < 0 ? '#ffffff' : '#e8e4dc')
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
  drawText(buffer, 'LEVEL', 8, 3, GREY_TEXT)
  drawText7(buffer, String(level).padStart(2, '0'), 8, 11, CREAM, 1, true)
  const scoreText = String(score).padStart(5, '0')
  drawText(buffer, 'SCORE', Math.round(W / 2 - textWidth('SCORE') / 2), 3, GREY_TEXT)
  drawText7(buffer, scoreText, Math.round(W / 2 - text7Width(scoreText, 1, true) / 2), 11, CREAM, 1, true)
  drawText(buffer, 'LIVES', W - 8 - textWidth('LIVES'), 3, GREY_TEXT)
  for (let i = 0; i < lives; i += 1) {
    const hx = W - 14 - i * 12
    buffer.disc(hx, 16, 3.5, SKIN); buffer.rect(hx - 4, 12, 9, 2, HAIR); buffer.poly([[hx - 4, 12], [hx, 9], [hx + 4, 12]], WHITE); buffer.rect(hx - 4, 12, 9, 1, '#e03040')
    buffer.set(hx - 1, 16, INK); buffer.set(hx + 1, 16, INK); buffer.set(hx, 18, '#8a2a2a')
  }
}

export type AttacksPlayOptions = { frame?: number }

/** A moment of play, wide (448 × 344) or tall (320 × 472): flying burgers in rows, plates, the cook, what flies both ways, the golden burger, a bonus. */
export function renderAttacksPlay(layout: Layout, accent: string, options: AttacksPlayOptions = {}): PixelBuffer {
  const frame = options.frame ?? 0
  const wide = layout === 'landscape'
  const W = wide ? 448 : 320, H = wide ? 344 : 472
  const buffer = new PixelBuffer(W, H, INK)
  const sky = new Uint8Array(W * H).fill(1)
  // the same night, quieter: the sky and its clouds, the moon, the planet, low rocks, a strip of plain
  nightSky(buffer, H, 6)
  // the moon and the planet where the rows never go
  const moon: [number, number, number] = wide ? [34, 236, 12] : [40, 330, 12]
  const planet: [number, number, number] = wide ? [404, 206, 26] : [280, 290, 24]
  world(buffer, ...moon, GREY, 0, 11)
  world(buffer, ...planet, BLUE, 26, 12)
  for (const [cx, cy, r] of [moon, planet]) for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) sky[y * W + x] = 0
  const ground = H - 22
  for (let x = -10; x < W; x += 46) butte(buffer, sky, x, ground, 40 + (x % 3) * 8, 14 + ((x * 7) % 13), FAR_ROCK, x)
  plain(buffer, sky, ground, H, 11)
  starfield(buffer, sky, 31, wide ? 90 : 110, frame)
  // the burgers in rows, marching: little ones on top, bigger below
  const cols = wide ? 9 : 6, sizes = [14, 18, 18, 22, 22]
  const gapX = wide ? 36 : 40, gapY = 24
  const x0 = Math.round(W / 2 - ((cols - 1) * gapX) / 2) + ((frame % 4) - 1.5) * 3, y0 = HUD_HEIGHT + 52
  sizes.forEach((s, row) => {
    for (let col = 0; col < cols; col += 1) {
      if (row === 4 && (col === 1 || col === cols - 2)) continue
      const x = x0 + col * gapX, y = y0 + row * gapY
      if (row === 3 && col === Math.floor(cols / 2)) {
        // one just hit: a splat of ketchup and crumbs
        for (const [dx, dy, r, c] of [[0, 0, 5, '#e0301e'], [-6, -3, 2, '#d9893a'], [7, 2, 2, '#d9893a'], [4, -5, 1.5, '#ffcc33'], [-5, 4, 1.5, '#e0301e']] as const) buffer.disc(x + dx, y + dy, r, c)
        continue
      }
      flyingBurger(buffer, x, y, s, frame + col)
    }
  })
  // the golden burger across the top
  const gx = ((frame * 18 + Math.round(W * 0.62)) % (W + 60)) - 30
  flyingBurger(buffer, gx, HUD_HEIGHT + 16, 22, frame, true)
  // the plates, bitten at their edges
  const plateBase = ground - 34
  const stacks = wide ? [80, 180, 280, 380] : [52, 124, 196, 268]
  const half = (wide ? 34 : 30) / 2
  stacks.forEach((sx, i) => plates(buffer, sx, plateBase, wide ? 34 : 30, 5, i === 1 ? [[sx - half + 2, plateBase - 22, 6], [sx + half - 1, plateBase - 8, 4]] : i === 2 ? [[sx + half - 3, plateBase - 23, 5], [sx - 3, plateBase - 25, 3]] : i === 3 ? [[sx - half, plateBase - 12, 4]] : []))
  // the cook, his ketchup going up
  const cookX = wide ? 214 : 150
  cookSmall(buffer, cookX, ground + 2)
  for (let y = ground - 40; y > ground - 120; y -= 1) if (((y + frame * 4) % 14) < 9) buffer.rect(cookX - 9, y, 2, 1, '#e0301e')
  buffer.disc(cookX - 8, ground - 122, 2, '#ff5a3c')
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
