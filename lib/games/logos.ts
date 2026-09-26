/**
 * Each game's own mark for the title screens, drawn here in fine pixels,
 * under the shared RANDOM logo. RANDOM CATCHER: fat block letters with cut
 * corners, a lit face, their depth opening out downward so the word comes
 * at us, a dark outline, a drop of sauce on the R. RANDOM EATER: a slanted
 * neon script in the manner of a diner sign — letters drawn as curves, a
 * cream tube in a rim of the accent, its shadow, and a wavy underline in a
 * second neon. Both take the theme's accent.
 */

import { dim, dither, mix, PixelBuffer, rgbOf } from './pixels'

export { dim }

const CREAM = '#f8f5e6'
const OUTLINE = '#0a0a18'

type Point = readonly [number, number]
type Poly = ReadonlyArray<Point>

// ---------------------------------------------------------------- CATCHER

/** A rectangle as a polygon, its corners cut by `c` where asked (tl, tr, br, bl). */
function box(x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number] = [0, 0, 0, 0]): Poly {
  const [tl, tr, br, bl] = c
  return [[x0 + tl, y0], [x1 - tr, y0], [x1, y0 + tr], [x1, y1 - br], [x1 - br, y1], [x0 + bl, y1], [x0, y1 - bl], [x0, y0 + tl]]
}

/** Each letter in a 60 × 70 box: the shapes that fill it, and the shapes cut out of it. */
const LETTERS: Record<string, { fill: Poly[]; cut: Poly[] }> = {
  C: { fill: [box(0, 0, 60, 70, [14, 10, 10, 14])], cut: [box(21, 20, 61, 50, [6, 0, 0, 6])] },
  A: { fill: [box(0, 0, 60, 70, [16, 16, 0, 0])], cut: [box(21, 19, 39, 36, [4, 4, 0, 0]), box(21, 52, 39, 71)] },
  T: { fill: [box(0, 0, 60, 21, [4, 4, 0, 0]), box(20, 20, 40, 70)], cut: [] },
  H: { fill: [box(0, 0, 21, 70), box(39, 0, 60, 70), box(20, 26, 40, 45)], cut: [] },
  E: { fill: [box(0, 0, 21, 70, [8, 0, 0, 8]), box(20, 0, 60, 19), box(20, 26, 53, 44), box(20, 51, 60, 70)], cut: [] },
  R: { fill: [box(0, 0, 60, 45, [0, 16, 10, 0]), box(0, 44, 21, 70), [[28, 42], [50, 42], [62, 70], [40, 70]]], cut: [box(21, 17, 39, 29, [0, 3, 3, 0])] },
}
const WORD = 'CATCHER'
const LETTER_W = 60, LETTER_H = 70, GAP = 9

/** The size of the CATCHER mark at a scale: the face, and the room the depth takes under it. */
export function catcherLogoSize(scale: number): { width: number; face: number; height: number } {
  const width = Math.round((WORD.length * LETTER_W + (WORD.length - 1) * GAP) * scale)
  const face = Math.round(LETTER_H * scale)
  return { width, face, height: face + Math.round(face * 0.48) }
}

/** The word's face as a mask of pixels. */
function catcherMask(scale: number): boolean[][] {
  const { width, face } = catcherLogoSize(scale)
  const layer = new PixelBuffer(width, face, '#000000')
  WORD.split('').forEach((letter, i) => {
    const ox = i * (LETTER_W + GAP)
    const place = (poly: Poly) => poly.map(([x, y]) => [(ox + x) * scale, y * scale] as const)
    for (const p of LETTERS[letter].fill) layer.poly(place(p), '#ffffff')
    for (const p of LETTERS[letter].cut) layer.poly(place(p), '#000000')
  })
  return Array.from({ length: face }, (_, y) => Array.from({ length: width }, (_, x) => layer.get(x, y)[0] > 128))
}

/**
 * The CATCHER mark: the depth first, opening out from a point high above
 * the word so every letter's sides and underside show — the sides in the
 * accent's shade, the undersides darker, the back edge darkest — then a
 * dark outline round it all, then the face, pale in the accent, a cream
 * bevel along its top and left edges. A drop of sauce on the R.
 */
export function drawCatcherLogo(buffer: PixelBuffer, x: number, y: number, accent: string, scale: number, frame = 0): void {
  const mask = catcherMask(scale)
  const { width, face, height } = catcherLogoSize(scale)
  const depth = height - face
  const on = (mx: number, my: number) => my >= 0 && my < face && mx >= 0 && mx < width && mask[my][mx]
  const vx = x + width / 2, vy = y - face * 5
  const faceC = mix(accent, CREAM, 0.42), bevel = mix(accent, CREAM, 0.85), faceShade = mix(accent, CREAM, 0.22)
  const side = dim(accent, 0.62), under = dim(accent, 0.42), back = dim(accent, 0.28)
  const cells: Array<[number, number, 0 | 1 | 2]> = []
  mask.forEach((row, my) => row.forEach((set, mx) => {
    if (!set) return
    const kind = !on(mx, my + 1) ? 2 : !on(mx - 1, my) || !on(mx + 1, my) ? 1 : 0
    cells.push([mx, my, kind])
  }))
  const project = (mx: number, my: number, k: number): [number, number] => {
    const px = x + mx + 0.5, py = y + my + 0.5
    const t = k / (py - vy)
    return [Math.floor(px + (px - vx) * t), Math.floor(py + (py - vy) * t)]
  }
  // the outline: round the back silhouette and every step of the depth
  for (let k = depth + 1; k >= 0; k -= 1) for (const [mx, my, kind] of cells) {
    if (kind === 0 && k > 0) continue
    const [qx, qy] = project(mx, my, k)
    buffer.rect(qx - 2, qy - 2, 5, 5, OUTLINE)
  }
  // under everything, the depth filled solid in the underside's tone
  for (let k = depth; k >= 1; k -= 1) for (const [mx, my] of cells) { const [qx, qy] = project(mx, my, k); buffer.set(qx, qy, under) }
  // the depth, far to near: the undersides dark, the sides lighter, the back edge darkest
  for (let k = depth; k >= 0.5; k -= 0.5) for (const [mx, my, kind] of cells) {
    if (kind === 0 && k < depth - 1) continue
    const [qx, qy] = project(mx, my, k)
    buffer.set(qx, qy, k >= depth - 1 ? back : kind === 2 ? under : side)
  }
  // the face, its bevel of light on the top and left, a shade on the bottom and right
  for (const [mx, my] of cells) {
    const top = !on(mx, my - 1) || !on(mx, my - 2) || !on(mx, my - 3)
    const left = !on(mx - 1, my) || !on(mx - 2, my) || !on(mx - 3, my)
    const bottom = !on(mx, my + 1) || !on(mx, my + 2)
    const right = !on(mx + 1, my) || !on(mx + 2, my)
    let c = faceC
    if (bottom || right) c = faceShade
    if (top || left) c = bevel
    buffer.set(x + mx, y + my, c)
  }
  // the sauce: a small drip over the R's top right corner, longer every other frame;
  // mustard rather than ketchup when the accent is red, so it still shows
  const [ar, ag, ab] = rgbOf(accent)
  const reddish = ar > ag * 1.5 && ar > ab * 1.1
  const sauce = reddish ? '#ffcc33' : '#e0301e', dark = reddish ? '#9a7010' : '#8a140a', shine = reddish ? '#fff0a0' : '#ff9a8a'
  // a pool along the top of the R's bowl, rounded at its ends, two drips hanging from it, each ending in a drop
  const u = scale
  const px0 = x + Math.round((6 * (LETTER_W + GAP) + 18) * u), px1 = x + Math.round((6 * (LETTER_W + GAP) + 40) * u)
  const py0 = y + Math.round(1 * u), thick = Math.max(3, Math.round(4 * u))
  const drips: Array<[number, number, number]> = [[px0 + Math.round(5 * u), Math.round(14 * u) + (frame % 2) * Math.round(4 * u), 2.4 * u], [px0 + Math.round(15 * u), Math.round(6 * u), 1.8 * u]]
  const shape = (grow: number, color: string) => {
    buffer.rect(px0, py0 - grow, px1 - px0, thick + 2 * grow, color)
    buffer.disc(px0, py0 + thick / 2, thick / 2 + grow + 0.5, color); buffer.disc(px1, py0 + thick / 2, thick / 2 + grow + 0.5, color)
    for (const [dx, len, r] of drips) {
      buffer.rect(Math.round(dx - r * 0.6) - grow, py0, Math.round(r * 1.2) + 2 * grow, len, color)
      buffer.disc(dx, py0 + len, r + grow, color)
    }
  }
  shape(1, dark)
  shape(0, sauce)
  buffer.rect(px0 + 1, py0, Math.round((px1 - px0) * 0.4), 1, shine)
  for (const [dx, len, r] of drips) { buffer.rect(Math.round(dx - r * 0.4), py0 + 2, 1, len - 2, shine); buffer.set(Math.round(dx - r * 0.5), py0 + len - 1, shine) }
}

// ---------------------------------------------------------------- EATER

type Cubic = readonly [Point, Point, Point, Point]

/**
 * The script, drawn here as curves in a 180 × 80 box before slant: a
 * capital E in two bowls with a little loop at its waist, then a, t, e, r
 * joined on the baseline, the r ending in a flourish. Each stroke is a
 * chain of cubic curves; the letters are ours, in the manner of a diner's
 * neon sign.
 */
const EATER_STROKES: ReadonlyArray<ReadonlyArray<Cubic>> = [
  // E: over the top from the right, down the left, a loop at the waist, the big lower bowl, on to the a
  [
    [[50, 18], [50, 7], [27, 3], [18, 13]],
    [[18, 13], [11, 21], [17, 33], [31, 34]],
    [[31, 34], [39, 34], [40, 27], [34, 27]],
    [[34, 27], [20, 28], [7, 42], [10, 56]],
    [[10, 56], [13, 70], [37, 73], [50, 64]],
    [[50, 64], [55, 60], [57, 57], [59, 55]],
  ],
  // a: the bowl, then its stem with a foot running on to the t
  [
    [[75, 47], [69, 39], [53, 42], [53, 56]],
    [[53, 56], [53, 69], [67, 70], [74, 58]],
  ],
  [
    [[76, 43], [75, 52], [72, 61], [75, 67]],
    [[75, 67], [77, 71], [83, 69], [86, 64]],
  ],
  // t: a tall stem curling out at its foot, its crossbar
  [
    [[97, 14], [95, 32], [89, 55], [90, 63]],
    [[90, 63], [91, 71], [99, 71], [103, 64]],
  ],
  [[[82, 37], [89, 36], [100, 35], [108, 34]]],
  // e: up into its loop and round
  [
    [[103, 64], [109, 60], [119, 56], [120, 48]],
    [[120, 48], [121, 40], [108, 40], [106, 51]],
    [[106, 51], [104, 62], [110, 70], [119, 68]],
    [[119, 68], [123, 67], [126, 64], [128, 61]],
  ],
  // r: up, a little notch, the shoulder, and a flourish swinging out and back
  [
    [[128, 61], [130, 55], [131, 48], [132, 43]],
    [[132, 43], [134, 48], [137, 47], [140, 43]],
    [[140, 43], [145, 38], [153, 39], [155, 45]],
    [[155, 45], [157, 51], [163, 52], [167, 47]],
  ],
]

/** The underline, a long curve under the word; its small waves are added when it is drawn. */
const SWASH: ReadonlyArray<Cubic> = [
  [[8, 79], [40, 75], [70, 81], [100, 77]],
  [[100, 77], [130, 73], [155, 79], [170, 72]],
]

const SLANT = 0.2
const BASELINE = 68
const BOX_W = 186, BOX_H = 84

/** The EATER mark's size at a zoom. */
export function eaterLogoSize(zoom: number): { width: number; height: number } {
  return { width: Math.round((BOX_W + SLANT * BASELINE) * zoom), height: Math.round(BOX_H * zoom) }
}

function bezier([a, b, c, d]: Cubic, t: number): [number, number] {
  const u = 1 - t
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]
}

/** Every point along a chain of curves, finely spaced, with an optional wave across it. */
function sample(chain: ReadonlyArray<Cubic>, wave = 0): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const curve of chain) {
    const steps = 80
    for (let i = 0; i <= steps; i += 1) {
      const [px, py] = bezier(curve, i / steps)
      out.push([px, py + (wave ? Math.sin(px / 3.2) * wave : 0)])
    }
  }
  return out
}

/** A secondary neon colour that stands apart from the accent: cyan beside warm accents, pink beside green, yellow beside blue and violet. */
export function secondNeon(accent: string): string {
  const [r, g, b] = rgbOf(accent)
  if (g > r && g > b) return '#ff6fae'
  if (b > r && b > g) return '#ffd23f'
  if (b > g && r > g && b > 0.8 * r) return '#ffd23f'
  return '#5fe3ff'
}

/**
 * The EATER neon: a soft glow round the tubes, their shadow on the sign
 * behind, the rim of each tube in the accent, a cream core; the swash in
 * the second neon. `dark` strokes (by index) are tubes gone out — the
 * flicker of an old sign. Unlit, the tubes are grey glass.
 */
export function drawEaterLogo(buffer: PixelBuffer, x: number, y: number, accent: string, zoom: number, options: { lit?: boolean; dark?: readonly number[]; swashLit?: boolean } = {}): void {
  const place = ([px, py]: readonly [number, number]): [number, number] => [x + (px + SLANT * (BASELINE - py)) * zoom, y + py * zoom]
  const rim = 2.9 * zoom, core = 1.3 * zoom
  const strokes = EATER_STROKES.map((chain) => sample(chain).map(place))
  const swash = sample(SWASH, 0.9).map(place)
  const lit = options.lit !== false
  const dark = new Set(options.dark ?? [])
  const second = secondNeon(accent)
  const swashLit = lit && options.swashLit !== false
  const paint = (points: Array<[number, number]>, r: number, color: string, dx = 0, dy = 0) => {
    let last: [number, number] | null = null
    for (const [px, py] of points) {
      if (last && Math.hypot(px - last[0], py - last[1]) < 0.6) continue
      buffer.disc(px + dx, py + dy, r, color)
      last = [px, py]
    }
  }
  const glow = (points: Array<[number, number]>, r: number, color: string) => {
    const seen = new Set<number>()
    for (const [px, py] of points) for (let yy = Math.floor(py - r); yy <= py + r; yy += 1) for (let xx = Math.floor(px - r); xx <= px + r; xx += 1) {
      const key = yy * 4096 + xx
      if (seen.has(key)) continue
      const d = Math.hypot(xx + 0.5 - px, yy + 0.5 - py)
      if (d > r) continue
      seen.add(key)
      if (dither(xx, yy, 0.55 * (1 - d / r))) buffer.tint(xx, yy, color, 0.35)
    }
  }
  // the shadow the tubes throw on the sign behind
  const shadow = mix(OUTLINE, accent, 0.18)
  for (const s of strokes) paint(s, rim, shadow, zoom * 1.6, zoom * 1.8)
  paint(swash, rim * 0.85, shadow, zoom * 1.6, zoom * 1.8)
  if (lit) {
    strokes.forEach((s, i) => { if (!dark.has(i)) glow(s, rim + 3.5 * zoom, accent) })
    if (swashLit) glow(swash, rim + 3 * zoom, second)
  }
  // a thin dark edge round every tube, then the rim, then the core
  for (const s of strokes) paint(s, rim + 0.9, OUTLINE)
  paint(swash, rim * 0.85 + 0.9, OUTLINE)
  strokes.forEach((s, i) => {
    const on = lit && !dark.has(i)
    paint(s, rim, on ? accent : '#4a4658')
    paint(s, core, on ? mix(accent, CREAM, 0.88) : '#6a6678')
  })
  paint(swash, rim * 0.85, swashLit ? second : '#3e3a4c')
  paint(swash, core * 0.8, swashLit ? mix(second, '#ffffff', 0.75) : '#56526a')
}
