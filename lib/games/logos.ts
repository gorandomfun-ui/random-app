/**
 * Each game's own mark for the title screens, drawn here in fine pixels,
 * under the shared RANDOM logo. RANDOM CATCHER: fat block letters with cut
 * corners, a lit face, their depth opening out downward so the word comes
 * at us, a dark outline, a drop of sauce on the R. RANDOM EATER: a slanted
 * neon script in the manner of a diner sign — letters drawn as curves, a
 * cream tube in a rim of the accent, its shadow, and a wavy underline in a
 * second neon. Both take the theme's accent.
 */

import { LETTERING, type LetteringName } from './lettering-data'
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
 * The CATCHER mark: the depth first, closing in toward a point far below
 * the word so every letter's sides and underside show — the sides in the
 * accent's shade, the undersides darker, the back edge darkest — then a
 * dark outline round it all, then the face, pale in the accent, a cream
 * bevel along its top and left edges. A drop of sauce on the R.
 */
const KEY = '#ff00fe'
const catcherCache = new Map<string, PixelBuffer>()

export function drawCatcherLogo(buffer: PixelBuffer, x: number, y: number, accent: string, scale: number, frame = 0): void {
  // drawn once per accent, size and drip, then stamped: the letters' depth is the costly part
  const key = `${accent}|${scale}|${frame % 2}`
  let layer = catcherCache.get(key)
  if (!layer) {
    const { width, height } = catcherLogoSize(scale)
    const pad = Math.round(height * 0.5)
    layer = new PixelBuffer(width + pad * 2, height + pad, KEY)
    paintCatcherLogo(layer, pad, 6, accent, scale, frame)
    catcherCache.set(key, layer)
  }
  const pad = Math.round(catcherLogoSize(scale).height * 0.5)
  buffer.stamp(layer, x - pad, y - 6, KEY)
}

function paintCatcherLogo(buffer: PixelBuffer, x: number, y: number, accent: string, scale: number, frame: number): void {
  const mask = catcherMask(scale)
  const { width, face, height } = catcherLogoSize(scale)
  const depth = height - face
  const on = (mx: number, my: number) => my >= 0 && my < face && mx >= 0 && mx < width && mask[my][mx]
  // the depth runs back toward a point far below the middle of the word: the sides close in, the letters come at us
  const vx = x + width / 2, vy = y + face + depth * 6
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
    const t = k / (vy - py)
    return [Math.floor(px + (vx - px) * t), Math.floor(py + (vy - py) * t)]
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
  for (let k = depth; k >= 0.25; k -= 0.25) for (const [mx, my, kind] of cells) {
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

/** A lettering mask decoded from its runs. */
type Mask = { w: number; h: number; on: Uint8Array }
const decoded = new Map<LetteringName, Mask>()
function lettering(name: LetteringName): Mask {
  let mask = decoded.get(name)
  if (mask) return mask
  const { width, height, runs } = LETTERING[name]
  const on = new Uint8Array(width * height)
  runs.split(' ').forEach((row, y) => { let x = 0, set = false; for (const r of row.split('.')) { const n = parseInt(r, 36); if (set) on.fill(1, y * width + x, y * width + x + n); x += n; set = !set } })
  mask = { w: width, h: height, on }
  decoded.set(name, mask)
  return mask
}

/** A mask shrunk by `r` pixels all round: a pixel stays when every pixel within `r` of it is set. */
function shrunk(mask: Mask, r: number): Mask {
  const { w, h } = mask
  const on = new Uint8Array(w * h)
  const disc: Array<[number, number]> = []
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y += 1) for (let x = -Math.ceil(r); x <= Math.ceil(r); x += 1) if (x * x + y * y <= r * r + 0.5) disc.push([x, y])
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!mask.on[y * w + x]) continue
    on[y * w + x] = disc.every(([ox, oy]) => { const X = x + ox, Y = y + oy; return X >= 0 && Y >= 0 && X < w && Y < h && mask.on[Y * w + X] === 1 }) ? 1 : 0
  }
  return { w, h, on }
}

/** A mask grown by `r` pixels all round, on a canvas widened by `pad`. */
function grown(mask: Mask, pad: number, r: number, dx = 0, dy = 0): Mask {
  const w = mask.w + pad * 2, h = mask.h + pad * 2
  const on = new Uint8Array(w * h)
  const disc: Array<[number, number]> = []
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y += 1) for (let x = -Math.ceil(r); x <= Math.ceil(r); x += 1) if (x * x + y * y <= r * r + 0.5) disc.push([x, y])
  for (let y = 0; y < mask.h; y += 1) for (let x = 0; x < mask.w; x += 1) {
    if (!mask.on[y * mask.w + x]) continue
    // only the edge pixels need to spread; the inside is covered by its neighbours
    const edge = x === 0 || y === 0 || x === mask.w - 1 || y === mask.h - 1 || !mask.on[y * mask.w + x - 1] || !mask.on[y * mask.w + x + 1] || !mask.on[(y - 1) * mask.w + x] || !mask.on[(y + 1) * mask.w + x]
    const cx = x + pad + dx, cy = y + pad + dy
    if (!edge) { if (cx >= 0 && cy >= 0 && cx < w && cy < h) on[cy * w + cx] = 1; continue }
    for (const [ox, oy] of disc) { const X = cx + ox, Y = cy + oy; if (X >= 0 && Y >= 0 && X < w && Y < h) on[Y * w + X] = 1 }
  }
  return { w, h, on }
}

const PAD = 16
const RIM = 4
/** How far the rim eats into the letters, so it is thick without swelling them further. */
const INSET = 2

/** The EATER mark's size for a lettering: the letters and the room their rim, shadow and glow take. */
export function eaterLogoSize(name: LetteringName): { width: number; height: number } {
  const { width, height } = LETTERING[name]
  return { width: width + PAD * 2, height: height + PAD * 2 }
}

/** A secondary neon colour that stands apart from the accent: cyan beside warm accents, pink beside green, yellow beside blue and violet. */
export function secondNeon(accent: string): string {
  const [r, g, b] = rgbOf(accent)
  if (g > r && g > b) return '#ff6fae'
  if (b > r && b > g) return '#ffd23f'
  if (b > g && r > g && b > 0.8 * r) return '#ffd23f'
  return '#5fe3ff'
}

const eaterCache = new Map<string, PixelBuffer>()
const KEY_EATER = '#ff00fd'

/**
 * The EATER neon, as the reference sign draws it: the letters filled cream,
 * a thick rim in the accent round them, a dark edge, a band of the second
 * neon showing under the letters, their shadow on the board behind and a
 * soft glow. Drawn once per accent and state, then stamped. Unlit, the
 * glass goes grey; `swashLit` false puts the second neon out.
 */
export function drawEaterLogo(buffer: PixelBuffer, x: number, y: number, accent: string, name: LetteringName, options: { lit?: boolean; swashLit?: boolean } = {}): void {
  const lit = options.lit !== false, swashLit = lit && options.swashLit !== false
  const key = `${name}|${accent}|${lit}|${swashLit}`
  let layer = eaterCache.get(key)
  if (!layer) {
    const mask = lettering(name)
    const { width, height } = eaterLogoSize(name)
    layer = new PixelBuffer(width, height, KEY_EATER)
    const second = secondNeon(accent)
    const paint = (m: Mask, color: string) => { for (let i = 0; i < m.on.length; i += 1) if (m.on[i]) layer!.set(i % m.w, Math.floor(i / m.w), color) }
    const outer = grown(mask, PAD, RIM + 1)
    if (lit) {
      const glow = grown(mask, PAD, RIM + 7)
      for (let i = 0; i < glow.on.length; i += 1) if (glow.on[i] && !outer.on[i]) { const gx = i % glow.w, gy = Math.floor(i / glow.w); if (dither(gx, gy, 0.22)) layer.set(gx, gy, mix('#140e28', accent, 0.4)) }
    }
    // the shadow on the board, the band of second neon under the letters with its dark edge, then the letters
    paint(grown(mask, PAD, RIM + 1, 4, 7), mix(OUTLINE, accent, 0.12))
    paint(grown(mask, PAD, RIM + 1, 1, 6), OUTLINE)
    paint(grown(mask, PAD, RIM, 1, 6), swashLit ? second : '#3e3a4c')
    paint(outer, OUTLINE)
    paint(grown(mask, PAD, RIM), lit ? accent : '#4a4658')
    const core = grown(shrunk(mask, INSET), PAD, 0)
    paint(core, lit ? mix(accent, '#fff4dc', 0.93) : '#6a6678')
    // a glint along the top edge of the core
    if (lit) for (let i = core.w; i < core.on.length; i += 1) if (core.on[i] && !core.on[i - core.w]) layer.set(i % core.w, Math.floor(i / core.w), '#ffffff')
    // the holes inside the letters (the eye of the e, the bowl of the a) stay open: only a thin rim round them, the board behind shows
    const letters = grown(mask, PAD, 0)
    const outside = new Uint8Array(letters.on.length)
    const queue: number[] = []
    for (let i = 0; i < letters.w; i += 1) { queue.push(i, letters.on.length - 1 - i) }
    for (let yy = 0; yy < letters.h; yy += 1) { queue.push(yy * letters.w, yy * letters.w + letters.w - 1) }
    while (queue.length) {
      const i = queue.pop()!
      if (i < 0 || i >= letters.on.length || outside[i] || letters.on[i]) continue
      outside[i] = 1
      const xx = i % letters.w
      if (xx > 0) queue.push(i - 1)
      if (xx < letters.w - 1) queue.push(i + 1)
      queue.push(i - letters.w, i + letters.w)
    }
    for (let i = 0; i < letters.on.length; i += 1) {
      if (letters.on[i] || outside[i]) continue
      const xx = i % letters.w, yy = Math.floor(i / letters.w)
      const touching = letters.on[i - 1] || letters.on[i + 1] || letters.on[i - letters.w] || letters.on[i + letters.w]
      layer.set(xx, yy, touching ? (lit ? accent : '#4a4658') : KEY_EATER)
    }
    eaterCache.set(key, layer)
  }
  buffer.stamp(layer, x, y, KEY_EATER)
}
