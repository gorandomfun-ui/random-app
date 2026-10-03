/**
 * RANDOM ATTACKS' pictures, traced from the owner's reference picture
 * (`docs/reports/jeux-v1/refs/attacks-reference.png`, kept out of the
 * repository): brought down onto the games' title grid, 768 × 432 — the
 * picture is already pixel art at about that size — and its colours reduced
 * to one palette. Its words (the title, PRESS START) are taken out and the
 * sky or the ground drawn again under them: the game draws its own RANDOM,
 * ATTACKS in the theme's colour, LEVEL, BEST and PRESS START. The tall title
 * is put together from the same pieces — the sky with the planet and the
 * burgers, the moon, the restaurant, the sign on its roof, the cook, the
 * rover — and the play's backgrounds from it too: its sky as far down as
 * it is clear, its colours row by row below, its far ranges, spires and
 * ground. The play's sprites are drawn by hand (`lib/games/attacks-sprites.ts`).
 *
 * Written to `public/games/attacks/` as indexed PNG files, and the few
 * numbers the game needs (where the stars twinkle, the jets flicker) to
 * `lib/games/attacks-art-data.ts`.
 *
 *   node --import tsx scripts/games/attacks-trace.ts [preview dir]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { drawDiner } from './attacks-diner'
import { decodePng, encodeIndexedPng, encodePng } from './png'

const ROOT = process.cwd()
const REF = path.join(ROOT, 'docs/reports/jeux-v1/refs/attacks-reference.png')
const OUT = path.join(ROOT, 'public/games/attacks')
const DATA = path.join(ROOT, 'lib/games/attacks-art-data.ts')
const PREVIEW = process.argv[2]

type RGB = [number, number, number]
/** A picture being worked on: colours as floats, and which pixels are known. */
type Pic = { w: number; h: number; rgb: Float32Array; known: Uint8Array }

const W = 768, H = 432
const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b

function blank(w: number, h: number): Pic { return { w, h, rgb: new Float32Array(w * h * 3), known: new Uint8Array(w * h) } }
function get(p: Pic, x: number, y: number): RGB { const o = (y * p.w + x) * 3; return [p.rgb[o], p.rgb[o + 1], p.rgb[o + 2]] }
function put(p: Pic, x: number, y: number, c: RGB): void { if (x < 0 || y < 0 || x >= p.w || y >= p.h) return; const o = (y * p.w + x) * 3; p.rgb[o] = c[0]; p.rgb[o + 1] = c[1]; p.rgb[o + 2] = c[2]; p.known[y * p.w + x] = 1 }

/** The reference on the grid: each cell the average of the reference's pixels well inside it. */
function trace(): Pic {
  const ref = decodePng(readFileSync(REF))
  const pic = blank(W, H)
  const sx = ref.width / W, sy = ref.height / H
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const x0 = Math.ceil(x * sx), x1 = Math.max(x0, Math.floor((x + 1) * sx) - 1), y0 = Math.ceil(y * sy), y1 = Math.max(y0, Math.floor((y + 1) * sy) - 1)
    let r = 0, g = 0, b = 0, n = 0
    for (let yy = y0; yy <= y1; yy += 1) for (let xx = x0; xx <= x1; xx += 1) { const o = (Math.min(ref.height - 1, yy) * ref.width + Math.min(ref.width - 1, xx)) * 4; r += ref.rgba[o]; g += ref.rgba[o + 1]; b += ref.rgba[o + 2]; n += 1 }
    put(pic, x, y, [r / n, g / n, b / n])
  }
  return pic
}

/** A palette of `k` colours for the picture (k-means, started evenly along the picture). */
function paletteOf(p: Pic, k: number): RGB[] {
  const n = p.w * p.h
  let centres: RGB[] = Array.from({ length: k }, (_, i) => get(p, Math.floor(((i + 0.5) / k) * n) % p.w, Math.floor((((i + 0.5) / k) * n) / p.w)))
  for (let iter = 0; iter < 14; iter += 1) {
    const sums = centres.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i += 1) {
      const c = [p.rgb[i * 3], p.rgb[i * 3 + 1], p.rgb[i * 3 + 2]]
      let best = 0, bd = Infinity
      for (let j = 0; j < k; j += 1) { const d = (c[0] - centres[j][0]) ** 2 + (c[1] - centres[j][1]) ** 2 + (c[2] - centres[j][2]) ** 2; if (d < bd) { bd = d; best = j } }
      const s = sums[best]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3] += 1
    }
    centres = centres.map((c, j) => (sums[j][3] ? [sums[j][0] / sums[j][3], sums[j][1] / sums[j][3], sums[j][2] / sums[j][3]] : c))
  }
  return centres.map((c) => c.map((v) => Math.round(v)) as RGB)
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
/**
 * Each pixel to the nearest colour; where the picture was drawn again
 * (smooth), dithered between the two nearest, for the grain — and, if
 * `only` is given, the two nearest among those colours only.
 */
function quantize(p: Pic, palette: RGB[], smooth?: Uint8Array, only?: number[]): Uint8Array {
  const out = new Uint8Array(p.w * p.h)
  const all = palette.map((_, j) => j)
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) {
    const c = get(p, x, y)
    const drawn = !!smooth && smooth[y * p.w + x] === 1
    let a = 0, ad = Infinity, b = 0, bd = Infinity
    for (const j of drawn && only ? only : all) { const q = palette[j]; const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (d < ad) { b = a; bd = ad; a = j; ad = d } else if (d < bd) { b = j; bd = d } }
    if (drawn) {
      const t = Math.sqrt(ad) / Math.max(1, Math.sqrt(ad) + Math.sqrt(bd))
      out[y * p.w + x] = t * 16 > BAYER[y % 4][x % 4] + 0.5 ? b : a
    } else out[y * p.w + x] = a
  }
  return out
}

/** Pixels marked in `hole` drawn again from their neighbours: interpolated along the row (down the column where the whole row is missing), then let settle. */
function inpaint(p: Pic, hole: Uint8Array, rounds = 260): void {
  for (let y = 0; y < p.h; y += 1) {
    for (let x = 0; x < p.w; x += 1) {
      if (!hole[y * p.w + x]) continue
      let l = x - 1, r = x + 1
      while (l >= 0 && hole[y * p.w + l]) l -= 1
      while (r < p.w && hole[y * p.w + r]) r += 1
      const cl = l >= 0 ? get(p, l, y) : null, cr = r < p.w ? get(p, r, y) : null
      let c: RGB
      if (cl && cr) { const t = (x - l) / (r - l); c = [cl[0] + (cr[0] - cl[0]) * t, cl[1] + (cr[1] - cl[1]) * t, cl[2] + (cr[2] - cl[2]) * t] }
      else if (cl || cr) c = (cl ?? cr) as RGB
      else {
        // a whole row missing: down the column instead, from the row just drawn above toward what is known below
        let d = y + 1
        while (d < p.h && hole[d * p.w + x]) d += 1
        const cu = y > 0 ? get(p, x, y - 1) : null, cd = d < p.h ? get(p, x, d) : null
        if (cu && cd) { const t = 1 / (d - y + 1); c = [cu[0] + (cd[0] - cu[0]) * t, cu[1] + (cd[1] - cu[1]) * t, cu[2] + (cd[2] - cu[2]) * t] }
        else c = cu ?? cd ?? [20, 16, 40]
      }
      const o = (y * p.w + x) * 3; p.rgb[o] = c[0]; p.rgb[o + 1] = c[1]; p.rgb[o + 2] = c[2]
    }
  }
  for (let k = 0; k < rounds; k += 1) {
    for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) {
      if (!hole[y * p.w + x]) continue
      let r = 0, g = 0, b = 0, n = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= p.w || Y >= p.h) continue; const c = get(p, X, Y); r += c[0]; g += c[1]; b += c[2]; n += 1 }
      const o = (y * p.w + x) * 3; p.rgb[o] = r / n; p.rgb[o + 1] = g / n; p.rgb[o + 2] = b / n
    }
  }
  for (let i = 0; i < hole.length; i += 1) if (hole[i]) p.known[i] = 1
}

/** A small generator, so the stars drawn again fall in the same places every time. */
function seeded(seed: number): () => number { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff } }

/** Stars sprinkled over sky drawn again: dots, a few crosses, in the reference's colours; each marked in `stars`, if given. */
function sprinkle(p: Pic, where: Uint8Array, seed: number, density = 1 / 260, stars?: Uint8Array): void {
  const next = seeded(seed)
  const colors: RGB[] = [[255, 246, 224], [255, 214, 140], [255, 170, 110], [190, 210, 255]]
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) {
    if (!where[y * p.w + x] || next() > density) continue
    const c = colors[Math.floor(next() * colors.length)]
    put(p, x, y, c)
    if (stars) stars[y * p.w + x] = 1
    if (next() < 0.12) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < p.w && Y < p.h && where[Y * p.w + X]) { const q = get(p, X, Y); put(p, X, Y, [(q[0] + c[0]) / 2, (q[1] + c[1]) / 2, (q[2] + c[2]) / 2]); if (stars) stars[Y * p.w + X] = 1 } }
  }
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}
const fbm2 = (x: number, y: number, seed: number) => (noise2(x, y, seed) * 0.5 + noise2(x * 2, y * 2, seed + 1) * 0.25 + noise2(x * 4, y * 4, seed + 2) * 0.125) / 0.875

/** Wisps of nebula over sky drawn again: the reference's pink-purple, in a band across, never solid. */
function nebula(p: Pic, where: Uint8Array, seed: number, slope: number, offset: number): void {
  const tint: RGB = [118, 44, 96], deep: RGB = [70, 30, 82]
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) {
    if (!where[y * p.w + x]) continue
    const band = 1 - Math.min(1, Math.abs(y - (offset + x * slope)) / 70)
    const n = fbm2(x / 46, y / 22, seed) * band
    if (n < 0.34) continue
    const t = Math.min(0.75, (n - 0.34) * 2.4)
    const c = get(p, x, y), to = n > 0.5 ? tint : deep
    put(p, x, y, [c[0] + (to[0] - c[0]) * t, c[1] + (to[1] - c[1]) * t, c[2] + (to[2] - c[2]) * t])
  }
}

function grow(mask: Uint8Array, w: number, h: number, times: number): Uint8Array {
  let cur = mask
  for (let t = 0; t < times; t += 1) {
    const next = new Uint8Array(cur)
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (!cur[y * w + x]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && cur[Y * w + X]) { next[y * w + x] = 1; break } }
    cur = next
  }
  return cur
}

function inPolygon(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * A figure with an outline of its own (the cook, the rover, a burger): the
 * background is flooded in from the edges of a rough polygon around it,
 * through every pixel that is not part of its outline (`stop`); what the
 * flood does not reach is the figure.
 */
function cutByFlood(p: Pic, poly: ReadonlyArray<readonly [number, number]>, stop: (c: RGB) => boolean): Uint8Array {
  const inside = new Uint8Array(p.w * p.h)
  const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y)
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(p.w - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(p.h - 1, Math.ceil(Math.max(...ys)))
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (inPolygon(x + 0.5, y + 0.5, poly)) inside[y * p.w + x] = 1
  const outside = new Uint8Array(p.w * p.h)
  const queue: number[] = []
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const i = y * p.w + x
    if (!inside[i]) continue
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside[(y + dy) * p.w + (x + dx)])
    if (edge && !stop(get(p, x, y))) { outside[i] = 1; queue.push(i) }
  }
  while (queue.length) {
    const i = queue.pop()!, x = i % p.w, y = Math.floor(i / p.w)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy, j = Y * p.w + X
      if (X < x0 || Y < y0 || X > x1 || Y > y1 || !inside[j] || outside[j]) continue
      if (stop(get(p, X, Y))) continue
      outside[j] = 1; queue.push(j)
    }
  }
  const figure = new Uint8Array(p.w * p.h)
  for (let i = 0; i < figure.length; i += 1) figure[i] = inside[i] && !outside[i] ? 1 : 0
  return figure
}

/**
 * A figure outlined by hand (a polygon traced on the enlarged reference),
 * refined at its edge by the flood: inside the polygon, a pixel the flood
 * reaches from outside without crossing the figure's dark outline is
 * background — except well inside, where everything is the figure.
 */
function cutByHand(p: Pic, poly: ReadonlyArray<readonly [number, number]>, stop: (c: RGB) => boolean): Uint8Array {
  const flooded = cutByFlood(p, poly, stop)
  const inside = new Uint8Array(p.w * p.h)
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) if (inPolygon(x + 0.5, y + 0.5, poly)) inside[y * p.w + x] = 1
  // well inside: three pixels from the polygon's edge
  const outer = new Uint8Array(p.w * p.h)
  for (let i = 0; i < outer.length; i += 1) outer[i] = inside[i] ? 0 : 1
  const near = grow(outer, p.w, p.h, 3)
  const out = new Uint8Array(p.w * p.h)
  for (let i = 0; i < out.length; i += 1) out[i] = inside[i] && (flooded[i] || !near[i]) ? 1 : 0
  return out
}

/** Points traced on an enlarged crop (each pixel `scale` times, the crop at `x0`, `y0`), back on the grid. */
const traced = (x0: number, y0: number, scale: number, points: ReadonlyArray<readonly [number, number]>): Array<[number, number]> => points.map(([x, y]) => [x0 + x / scale, y0 + y / scale])

/** Copies the pixels of `mask` (or a whole rectangle) from one picture into another, moved by `dx`, `dy`. */
function paste(to: Pic, from: Pic, rect: [number, number, number, number], dx: number, dy: number, mask?: Uint8Array): void {
  const [x0, y0, x1, y1] = rect
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    if (x < 0 || y < 0 || x >= from.w || y >= from.h) continue
    if (mask && !mask[y * from.w + x]) continue
    put(to, x + dx, y + dy, get(from, x, y))
  }
}

/** A cut-out made smaller: each new pixel the average of the old ones it covers that belong to the figure. */
function shrink(from: Pic, mask: Uint8Array, rect: [number, number, number, number], scale: number): { pic: Pic; mask: Uint8Array } {
  const [x0, y0, x1, y1] = rect
  const w = Math.round((x1 - x0) * scale), h = Math.round((y1 - y0) * scale)
  const pic = blank(w, h), m = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let r = 0, g = 0, b = 0, n = 0, all = 0
    for (let yy = Math.floor(y0 + y / scale); yy < Math.ceil(y0 + (y + 1) / scale); yy += 1) for (let xx = Math.floor(x0 + x / scale); xx < Math.ceil(x0 + (x + 1) / scale); xx += 1) {
      all += 1
      if (!mask[yy * from.w + xx]) continue
      const c = get(from, xx, yy); r += c[0]; g += c[1]; b += c[2]; n += 1
    }
    if (n * 2 >= all && n) { put(pic, x, y, [r / n, g / n, b / n]); m[y * w + x] = 1 }
  }
  return { pic, mask: m }
}

// ---------------------------------------------------------------- the pieces of the reference, on the grid

const base = trace()
const palette = paletteOf(base, 128)

// the title's words: greens, creams and their dark edge, inside their boxes; PRESS START on the ground
const words = new Uint8Array(W * H)
const isGreen = ([r, g, b]: RGB) => g > r + 22 && g > b + 6
const isCream = ([r, g, b]: RGB) => r > 196 && g > 184 && b > 140
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const c = get(base, x, y)
  const inTitle = (x >= 266 && x < 494 && y >= 6 && y < 62) || (x >= 98 && x < 646 && y >= 54 && y < 172)
  const inPress = x >= 264 && x < 506 && y >= 394 && y < 430
  // the letters' shadow too: darker than the night's darkest blue
  if (inTitle && (isGreen(c) || isCream(c) || (lum(...c) < 58 && c[1] >= c[2] - 4) || lum(...c) < 10)) words[y * W + x] = 1
  if (inPress && (isGreen(c) || isCream(c) || lum(...c) < 56)) words[y * W + x] = 1
}
// the spire's tip is the restaurant's, not the title's
for (let y = 150; y < 172; y += 1) for (let x = 352; x < 374; x += 1) { const c = get(base, x, y); if (c[0] > 180 && c[1] < 150) words[y * W + x] = 0 }
const holes = grow(words, W, H, 2)
inpaint(base, holes)
/** 0, 1 … n − 1, then back n − 1 … 0: a texture laid side by side, mirrored every other time, meets itself without a seam. */
const pingpong = (i: number, n: number) => { const k = ((i % (2 * n)) + 2 * n) % (2 * n); return k < n ? k : 2 * n - 1 - k }
// PRESS START and its shadow, on the ground: settled colour would be a smear, so the whole box takes the ground's own
// texture, from the band just under the restaurant — left of the crater, so the crater is not seen twice
// — each row then brought to the colour of the ground just beside the box, which darkens towards the foot of the picture
const groundTexture = (x: number, y: number): RGB => get(base, 258 + pingpong(x + Math.floor((y - 388) / 24) * 61, 172), 371 + ((y - 388) % 24))
const groundShift: RGB[] = []
for (let y = 388; y < H; y += 1) {
  const side: RGB = [0, 0, 0], fill: RGB = [0, 0, 0]
  for (let k = 0; k < 30; k += 1) for (const x of [226 + k, 514 + k]) { const c = get(base, x, y); side[0] += c[0] / 60; side[1] += c[1] / 60; side[2] += c[2] / 60 }
  for (let x = 0; x < 344; x += 1) { const c = groundTexture(x, y); fill[0] += c[0] / 344; fill[1] += c[1] / 344; fill[2] += c[2] / 344 }
  groundShift.push([side[0] - fill[0], side[1] - fill[1], side[2] - fill[2]])
}
/** The open ground at any `x` on the reference's row `y` (388 or lower): the texture from under the restaurant, at that row's colour. */
const groundAt = (x: number, y: number): RGB => { const c = groundTexture(x, y), d = groundShift[y - 388]; return [0, 1, 2].map((i) => Math.max(0, Math.min(255, c[i] + d[i]))) as RGB }
for (let y = 388; y < H; y += 1) for (let x = 256; x < 514; x += 1) put(base, x, y, groundAt(x - 256, y))
for (let y = 386; y < H; y += 1) for (let x = 250; x < 520; x += 1) holes[y * W + x] = 0
const skyHoles = new Uint8Array(W * H)
for (let i = 0; i < holes.length; i += 1) skyHoles[i] = holes[i] && Math.floor(i / W) < 200 ? 1 : 0
nebula(base, skyHoles, 3, 0.18, 30)
sprinkle(base, skyHoles, 7)

// the pieces
const isDark = ([r, g, b]: RGB) => lum(r, g, b) < 46
const cookMask = cutByHand(base, traced(570, 210, 5, [
  [306, 300], [338, 266], [472, 268], [492, 300], [496, 352], [482, 402], [474, 432], [520, 462], [556, 452], [574, 428], [588, 398],
  [560, 330], [574, 276], [694, 288], [672, 404], [618, 412], [612, 446], [600, 482], [562, 522], [524, 562], [522, 600], [508, 604],
  [508, 692], [472, 692], [472, 742], [522, 800], [572, 858], [644, 898], [648, 968], [496, 968], [492, 920], [452, 862], [400, 762],
  [370, 748], [340, 762], [272, 862], [232, 902], [232, 968], [96, 968], [102, 918], [148, 868], [198, 798], [258, 740], [258, 700],
  [298, 642], [248, 622], [212, 592], [202, 544], [232, 498], [258, 468], [298, 448], [318, 438], [298, 410], [298, 350],
]), isDark)
const roverMask = cutByHand(base, traced(60, 340, 5, [
  [88, 242], [142, 200], [148, 160], [186, 150], [186, 122], [208, 122], [208, 150], [338, 150], [366, 130], [372, 102], [342, 96],
  [342, 52], [438, 48], [442, 98], [402, 102], [398, 150], [432, 160], [438, 230], [492, 248], [492, 302], [88, 302],
]), isDark)
const sign = new Uint8Array(W * H)
const signShapes = (x: number, y: number) =>
  ((x - 105.5) / 84) ** 2 + ((y - 241) / 32) ** 2 <= 1 ||
  inPolygon(x, y, [[46, 222], [128, 160], [146, 166], [150, 178], [70, 230], [50, 232]]) ||
  (x >= 58 && x < 72 && y >= 122 && y < 214) || ((x - 65) / 25) ** 2 + ((y - 150) / 8) ** 2 <= 1 ||
  ((x - 81) / 10) ** 2 + ((y - 168) / 10) ** 2 <= 1 || ((x - 144) / 10) ** 2 + ((y - 202) / 12) ** 2 <= 1 ||
  inPolygon(x, y, [[64, 268], [92, 268], [90, 360], [66, 360]]) || inPolygon(x, y, [[100, 268], [128, 268], [126, 360], [102, 360]]) ||
  (x >= 58 && x < 128 && y >= 355 && y < 364)
for (let y = 110; y < 366; y += 1) for (let x = 0; x < 200; x += 1) if (signShapes(x + 0.5, y + 0.5)) sign[y * W + x] = 1
// burgers over the sky: the sky flooded in around them, through what looks like sky
const isSky = ([r, g, b]: RGB) => (b >= r * 0.72 && lum(r, g, b) < 150) || (lum(r, g, b) > 205 && Math.abs(r - b) < 70)
const burgerBoxes: Array<[number, number, number, number]> = [[642, 102, 708, 168], [608, 156, 650, 194], [716, 134, 760, 170], [696, 34, 768, 112]]
const burgerMasks = burgerBoxes.map(([x0, y0, x1, y1]) => cutByFlood(base, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], (c) => !isSky(c)))
const moon = new Uint8Array(W * H)
for (let y = 36; y < 104; y += 1) for (let x = 60; x < 132; x += 1) if (Math.hypot(x + 0.5 - 95.5, y + 0.5 - 69.5) <= 28) moon[y * W + x] = 1

// ---------------------------------------------------------------- what moves on the title, taken out of the picture

// the rover drives to and fro: kept as a sprite of its own (index 0 clear), the ground drawn again where it stood
const ROVER: [number, number, number, number] = [74, 346, 162, 404]
const nearestIn = (c: RGB) => { let best = 0, bd = Infinity; palette.forEach((q, j) => { const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (d < bd) { bd = d; best = j } }); return best }
const roverSprite = new Uint8Array((ROVER[2] - ROVER[0]) * (ROVER[3] - ROVER[1]))
for (let y = ROVER[1]; y < ROVER[3]; y += 1) for (let x = ROVER[0]; x < ROVER[2]; x += 1) if (roverMask[y * W + x]) roverSprite[(y - ROVER[1]) * (ROVER[2] - ROVER[0]) + x - ROVER[0]] = 1 + nearestIn(get(base, x, y))
/**
 * A figure taken out: the ground under it from `from` pixels aside (rows from `groundFrom` down); above, if `rocks`
 * is given, the rocks right of it laid back and forth across it (it is wider than they are); the rest drawn again
 * from around it.
 */
function takeOut(mask: Uint8Array, groundFrom: number, from: number, rocks?: { edge: number; width: number }): void {
  const hole = grow(mask, W, H, 2)
  const source = new Float32Array(base.rgb)
  const at = (x: number, y: number): RGB => { const o = (y * W + x) * 3; return [source[o], source[o + 1], source[o + 2]] }
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!hole[y * W + x]) continue
    if (y >= groundFrom) put(base, x, y, at(Math.max(0, Math.min(W - 1, x + from)), y))
    else if (rocks && x <= rocks.edge) put(base, x, y, at(rocks.edge + 1 + pingpong(rocks.edge - x, rocks.width), y))
    else continue
    hole[y * W + x] = 0
  }
  inpaint(base, hole, 220)
}
takeOut(roverMask, 366, 100)
// the cook: the game's own, drawn larger by the game, stands there now
takeOut(cookMask, 370, -140, { edge: 712, width: 55 })
// the burgers: the game's own fly there now. The three big ones, then every small one of the stream — a patch with
// lettuce or a jet in it, small, over the sky or the rocks
for (const m of burgerMasks) inpaint(base, grow(m, W, H, 2), 220)
const STREAM: [number, number, number, number] = [430, 150, 768, 272]
// the bun, the cheese, the jet; the lettuce; the bright orange of the ring
const burgerish = ([r, g, b]: RGB) => (r > 170 && g > 112 && b < 150) || (g > r + 8 && g > 70 && b < 110) || (r > 238 && g < 150 && b < 90)
const stream = new Uint8Array(W * H)
const seen = new Uint8Array(W * H)
let streamCount = 0
for (let y0 = STREAM[1]; y0 < STREAM[3]; y0 += 1) for (let x0 = STREAM[0]; x0 < STREAM[2]; x0 += 1) {
  if (seen[y0 * W + x0] || !burgerish(get(base, x0, y0))) continue
  const queue = [y0 * W + x0], cells: number[] = []
  seen[y0 * W + x0] = 1
  while (queue.length) {
    const i = queue.pop()!, x = i % W, y = Math.floor(i / W)
    cells.push(i)
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const X = x + dx, Y = y + dy, j = Y * W + X
      if (X < STREAM[0] || Y < STREAM[1] || X >= STREAM[2] || Y >= STREAM[3] || seen[j] || !burgerish(get(base, X, Y))) continue
      seen[j] = 1; queue.push(j)
    }
  }
  const xs = cells.map((i) => i % W), ys = cells.map((i) => Math.floor(i / W))
  const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1
  const green = cells.some((i) => { const c = get(base, i % W, Math.floor(i / W)); return c[1] > c[0] + 8 })
  const jet = cells.some((i) => { const c = get(base, i % W, Math.floor(i / W)); return c[0] > 240 && c[1] > 180 })
  if (cells.length < 5 || bw > 30 || bh > 22 || !(green || jet)) continue
  streamCount += 1
  for (let y = Math.min(...ys) - 3; y <= Math.max(...ys) + 3; y += 1) for (let x = Math.min(...xs) - 9; x <= Math.max(...xs) + 9; x += 1) if (x >= 0 && y >= 0 && x < W && y < H) stream[y * W + x] = 1
}
inpaint(base, stream, 220)
console.log('stream burgers taken out', streamCount)

const signWide = grow(sign, W, H, 3)
// the fast food drawn again, calmer, on its own shapes; the sign stays in front of it
drawDiner((x, y, c) => put(base, x, y, c), (x, y) => signWide[y * W + x] === 1)
const titleWide = quantize(base, palette, holes)

// ---------------------------------------------------------------- the tall title

const tall = blank(432, 768)
const skyPart = new Uint8Array(W * H)
for (let y = 0; y < 186; y += 1) for (let x = 336; x < W; x += 1) skyPart[y * W + x] = 1
// nothing the edge would cut in two: the burgers crossing it, the spire's tip
for (let y = 96; y < 186; y += 1) for (let x = 336; x < W; x += 1) if (y >= 146 || (x >= 590 && y >= 100)) skyPart[y * W + x] = 0
paste(tall, base, [336, 0, 768, 186], -336, 0, skyPart)
const scenePart = new Uint8Array(W * H)
for (let y = 140; y < H; y += 1) for (let x = 168; x < 600; x += 1) scenePart[y * W + x] = signWide[y * W + x] ? 0 : 1
// the scene a little higher than the picture's foot, so PRESS START, LEVEL and BEST fall on the ground under it
paste(tall, base, [168, 140, 600, 432], -168, 302, scenePart)
paste(tall, base, [168, 398, 600, 432], -168, 336)
paste(tall, base, [60, 36, 132, 104], -24, 26, moon)
const tallHoles = new Uint8Array(432 * 768)
for (let i = 0; i < tallHoles.length; i += 1) tallHoles[i] = tall.known[i] ? 0 : 1
inpaint(tall, tallHoles, 420)
// the long stretch drawn again between the sky and the scene, drawn toward the reference's night blue there: settled colour
// sits between two of the palette's, and the smallest drift would turn a whole stretch violet
for (let y = 146; y < 442; y += 1) for (let x = 0; x < 432; x += 1) {
  if (!tallHoles[y * 432 + x]) continue
  const t = Math.min(1, (y - 146) / 24) * 0.55, c = get(tall, x, y)
  put(tall, x, y, [c[0] + (21 - c[0]) * t, c[1] + (22 - c[1]) * t, c[2] + (71 - c[2]) * t])
}
nebula(tall, tallHoles, 5, -0.35, 330)
sprinkle(tall, tallHoles, 11, 1 / 220)
// the sign on the roof's left, smaller (the cook, the rover and the burgers are the game's, drawn over it)
const smallSign = shrink(base, sign, [24, 110, 190, 366], 0.62)
paste(tall, smallSign.pic, [0, 0, smallSign.pic.w, smallSign.pic.h], 6, 494 - smallSign.pic.h, smallSign.mask)
const titleTall = quantize(tall, palette, tallHoles)

// ---------------------------------------------------------------- the play

const isRock = (c: RGB) => !isSky(c)
/** A stamp of rock: the rock pixels of an area of the reference, the sky around them left out (and, if given, what lies below `floor`). */
function rockStamp(rect: [number, number, number, number], floor?: (x: number) => number): Uint8Array {
  const [x0, y0, x1, y1] = rect
  const mask = new Uint8Array(W * H)
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (isRock(get(base, x, y)) && (!floor || y < floor(x))) mask[y * W + x] = 1
  return mask
}
/** A stamp laid down at `x`, `y`, mirrored if asked. */
function stamp(to: Pic, rect: [number, number, number, number], mask: Uint8Array, x: number, y: number, flip = false): void {
  const [x0, y0, x1, y1] = rect
  for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) {
    if (!mask[yy * W + xx]) continue
    put(to, x + (flip ? x1 - 1 - xx : xx - x0), y + (yy - y0), get(base, xx, yy))
  }
}
const SPIRE: [number, number, number, number] = [714, 208, 768, 300]
const SPIRES: [number, number, number, number] = [386, 186, 512, 262]
/** The far ranges with the haze behind them, a band of the reference taken whole: its top row is the sky's own colour there. */
const FAR: [number, number, number, number] = [560, 228, 712, 262]
const spire = rockStamp(SPIRE)
const spires = rockStamp(SPIRES, (x) => 224 + 0.283 * (x - 380))

/** How far down the reference's sky is clear across the middle: above the restaurant's spire, under the sign's antenna. */
const CLEAR = 148
/**
 * The open sky's colour on each of the reference's rows, down to the far
 * ranges: the middle colour of its night pixels where nothing stands in front
 * (between the restaurant's spires and the burgers), smoothed over a few rows.
 */
const skyRows: RGB[] = (() => {
  const raw: RGB[] = []
  for (let y = 0; y < FAR[1] + 1; y += 1) {
    const night: RGB[] = []
    for (let x = 440; x < 600; x += 1) { const c = get(base, x, y); if (c[2] >= c[0] * 0.72 && lum(...c) < 150) night.push(c) }
    night.sort((a, b) => lum(...a) - lum(...b))
    raw.push(night[Math.floor(night.length / 2)] ?? raw[raw.length - 1])
  }
  return raw.map((_, y) => {
    const s: RGB = [0, 0, 0]
    let n = 0
    for (let k = Math.max(0, y - 6); k <= Math.min(raw.length - 1, y + 6); k += 1) { s[0] += raw[k][0]; s[1] += raw[k][1]; s[2] += raw[k][2]; n += 1 }
    return [s[0] / n, s[1] / n, s[2] / n] as RGB
  })
})()
const skyAt = (r: number): RGB => {
  const k = Math.max(0, Math.min(skyRows.length - 1.001, r)), i = Math.floor(k), t = k - i
  const a = skyRows[i], b = skyRows[Math.min(skyRows.length - 1, i + 1)]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
/** The colours the reference's open night is painted in: a sky drawn again is dithered in those, never in the restaurant's greys and greens. */
const skyPalette = (() => {
  const count = new Map<number, number>()
  const nearest = (c: RGB) => { let best = 0, bd = Infinity; palette.forEach((q, j) => { const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (d < bd) { bd = d; best = j } }); return best }
  for (let y = 0; y < FAR[1] + 4; y += 1) for (let x = 150; x < 620; x += 1) {
    if (y >= 150 && (x < 470 || x >= 600)) continue
    const c = get(base, x, y)
    if (lum(...c) >= 150 || (c[0] > 170 && c[1] > 100)) continue
    const j = nearest(c)
    count.set(j, (count.get(j) ?? 0) + 1)
  }
  return [...count].filter(([, n]) => n >= 12).map(([j]) => j)
})()

/** Red streaks low in the sky, as the reference has them over the far ranges: long, thin, stronger towards the horizon. */
function streaks(p: Pic, where: Uint8Array, seed: number, from: number, to: number): void {
  const tints: RGB[] = [[128, 43, 47], [144, 52, 56]]
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) {
    if (!where[y * p.w + x]) continue
    const s = Math.max(0, Math.min(1, (y - from) / Math.max(1, to - from)))
    const n = fbm2(x / 64, y / 4.5, seed) * (0.45 + 0.55 * s)
    if (n < 0.5) continue
    const t = Math.min(0.7, (n - 0.5) * 3.2), to2 = tints[n > 0.62 ? 1 : 0], c = get(p, x, y)
    put(p, x, y, [c[0] + (to2[0] - c[0]) * t, c[1] + (to2[1] - c[1]) * t, c[2] + (to2[2] - c[2]) * t])
  }
}

/**
 * The play's night, from the reference: its own sky as far down as it is
 * clear (taken from `skyFrom` across), its moon at `moonAt`; under that, the
 * reference's sky colours row by row, stretched down to the far ranges, with
 * the nebula, the red streaks and stars; the far ranges and their haze, as a
 * band; the red spires at both sides; the ground from under the restaurant.
 * The ground is 46 rows; the far ranges' band stands on it.
 */
function playNight(w: number, h: number, skyFrom: number, moonAt: [number, number]): { pic: Pic; holes: Uint8Array; stars: Uint8Array; horizon: number } {
  const pic = blank(w, h)
  const ground = h - 46, horizon = ground - (FAR[3] - FAR[1])
  paste(pic, base, [skyFrom, 0, skyFrom + w, CLEAR], -skyFrom, 0)
  const holes = new Uint8Array(w * h)
  // the reference's sky melted into the drawn one over its last rows, then the drawn one down to the far ranges
  const melt = 20
  for (let y = CLEAR - melt; y < horizon; y += 1) {
    const r = y < CLEAR ? y : CLEAR + ((y - CLEAR) * (FAR[1] - CLEAR)) / (horizon - CLEAR)
    const c = skyAt(r), a = y < CLEAR ? (y - (CLEAR - melt)) / melt : 1
    for (let x = 0; x < w; x += 1) {
      const o = get(pic, x, y)
      put(pic, x, y, [o[0] + (c[0] - o[0]) * a, o[1] + (c[1] - o[1]) * a, o[2] + (c[2] - o[2]) * a])
      holes[y * w + x] = 1
    }
  }
  nebula(pic, holes, 9, 0.1, CLEAR + 20)
  streaks(pic, holes, 17, CLEAR + (horizon - CLEAR) * 0.45, horizon)
  const stars = new Uint8Array(w * h)
  sprinkle(pic, holes, 13, 1 / 300, stars)
  // the moon over everything in the sky
  paste(pic, base, [60, 36, 132, 104], moonAt[0] - 60, moonAt[1] - 36, moon)
  for (let y = 36; y < 104; y += 1) for (let x = 60; x < 132; x += 1) if (moon[y * W + x]) { const X = x - 60 + moonAt[0], Y = y - 36 + moonAt[1]; if (X >= 0 && X < w && Y >= 0 && Y < h) holes[Y * w + X] = 0 }
  // the far ranges side by side, every other one mirrored
  for (let x = 0; x < w; x += 1) for (let y = FAR[1]; y < FAR[3]; y += 1) put(pic, x, horizon + y - FAR[1], get(base, FAR[0] + pingpong(x, FAR[2] - FAR[0]), y))
  // the spires, each set so that where it was cut lies under the ground
  stamp(pic, SPIRES, spires, 54, ground - 40)
  stamp(pic, SPIRES, spires, w - 54 - (SPIRES[2] - SPIRES[0]), ground - 40, true)
  stamp(pic, SPIRE, spire, 0, ground - 92, true)
  stamp(pic, SPIRE, spire, w - (SPIRE[2] - SPIRE[0]), ground - 92)
  // the ground under the restaurant, clear of the sign's foot and the cook's shoes, turned back in the crater's middle;
  // lower down, the open ground across
  for (let y = 0; y < 46; y += 1) for (let x = 0; x < w; x += 1) put(pic, x, ground + y, 368 + y < 388 ? get(base, 180 + pingpong(x, 296), 368 + y) : groundAt(x, 368 + y))
  for (let i = 0; i < holes.length; i += 1) if (stars[i]) holes[i] = 0
  return { pic, holes, stars, horizon }
}
const playWide = playNight(448, 320, 150, [40, 30])
const playTall = playNight(320, 448, 200, [24, 40])

// ---------------------------------------------------------------- what moves

/** Stars to twinkle: bright, lone pixels in the sky (above `horizon`), outside the areas given; at most `limit`, spread over the picture. */
function starsOf(idx: Uint8Array, w: number, horizon: number, avoid: Array<[number, number, number, number]>, limit: number): Array<[number, number]> {
  const c = (x: number, y: number) => palette[idx[y * w + x]]
  const found: Array<[number, number]> = []
  for (let y = 2; y < horizon; y += 1) for (let x = 2; x < w - 2; x += 1) {
    if (avoid.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1)) continue
    if (lum(...c(x, y)) < 190) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => lum(...c(x + dx, y + dy)) < 150)) found.push([x, y])
  }
  const step = Math.max(1, Math.floor(found.length / limit))
  return found.filter((_, i) => i % step === 0).slice(0, limit)
}
// ---------------------------------------------------------------- out

const playWideIdx = quantize(playWide.pic, palette, playWide.holes, skyPalette), playTallIdx = quantize(playTall.pic, palette, playTall.holes, skyPalette)
const motion = {
  wide: { stars: starsOf(titleWide, W, 236, [[60, 36, 132, 104], [620, 0, 768, 236], [0, 110, 200, 300]], 80) },
  tall: { stars: starsOf(titleTall, 432, 486, [[36, 62, 108, 130], [250, 0, 432, 200], [0, 330, 140, 500]], 90) },
  playWide: { stars: starsOf(playWideIdx, 448, playWide.horizon, [[40, 30, 112, 98]], 50) },
  playTall: { stars: starsOf(playTallIdx, 320, playTall.horizon, [[24, 40, 96, 108]], 60) },
  rover: { x: ROVER[0], y: ROVER[1], w: ROVER[2] - ROVER[0], h: ROVER[3] - ROVER[1] },
}
writeFileSync(DATA, `/**
 * What moves on RANDOM ATTACKS' traced pictures, found by
 * \`scripts/games/attacks-trace.ts\`: the stars that twinkle, as [x, y] on
 * each picture, and where the rover stood on the wide title (its sprite is
 * \`public/games/attacks/rover.png\`).
 * Generated — do not edit by hand.
 */

export const ATTACKS_MOTION = ${JSON.stringify(motion)} as const
`)
console.log('stars', motion.wide.stars.length, motion.tall.stars.length)

mkdirSync(OUT, { recursive: true })
writeFileSync(path.join(OUT, 'title-wide.png'), encodeIndexedPng(W, H, titleWide, palette))
writeFileSync(path.join(OUT, 'title-tall.png'), encodeIndexedPng(432, 768, titleTall, palette))
writeFileSync(path.join(OUT, 'rover.png'), encodeIndexedPng(ROVER[2] - ROVER[0], ROVER[3] - ROVER[1], roverSprite, [[0, 0, 0], ...palette], true))
writeFileSync(path.join(OUT, 'play-wide.png'), encodeIndexedPng(448, 320, playWideIdx, palette))
writeFileSync(path.join(OUT, 'play-tall.png'), encodeIndexedPng(320, 448, playTallIdx, palette))

if (PREVIEW) {
  mkdirSync(PREVIEW, { recursive: true })
  const show = (name: string, w: number, h: number, idx: Uint8Array, scale: number) => {
    const rgba = new Uint8ClampedArray(w * h * 4)
    idx.forEach((k, i) => { rgba[i * 4] = palette[k][0]; rgba[i * 4 + 1] = palette[k][1]; rgba[i * 4 + 2] = palette[k][2]; rgba[i * 4 + 3] = 255 })
    writeFileSync(path.join(PREVIEW, name), encodePng(w, h, rgba, scale))
  }
  show('trace-title-wide.png', W, H, titleWide, 2)
  show('trace-title-tall.png', 432, 768, titleTall, 2)
  show('trace-play-wide.png', 448, 320, playWideIdx, 3)
  show('trace-play-tall.png', 320, 448, playTallIdx, 3)
  const pal0: RGB[] = [[255, 0, 255], ...palette]
  const rgba = new Uint8ClampedArray(roverSprite.length * 4)
  roverSprite.forEach((k, i) => { rgba[i * 4] = pal0[k][0]; rgba[i * 4 + 1] = pal0[k][1]; rgba[i * 4 + 2] = pal0[k][2]; rgba[i * 4 + 3] = 255 })
  writeFileSync(path.join(PREVIEW, 'trace-rover.png'), encodePng(ROVER[2] - ROVER[0], ROVER[3] - ROVER[1], rgba, 4))
}
console.log('palette', palette.length, 'colours')
