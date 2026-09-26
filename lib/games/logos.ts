/**
 * Each game's own mark, drawn here, under the shared RANDOM logo.
 * RANDOM CATCHER: fat block letters in volume, their sides running back to
 * a point below the word so the letters come at us, a bite out of the last
 * one and a drop of sauce. RANDOM EATER: a slanted neon script in the
 * manner of a diner sign, a tube of light with its halo and a swash under
 * the word in a second neon. Both take the theme's accent.
 */

import { dim, mix, PixelBuffer, rgbOf } from './pixels'

export { dim }

const CREAM = '#f8f5e6'
const OUTLINE = '#0a0a14'

// ---------------------------------------------------------------- CATCHER

/** Block letters on a six-by-seven grid, strokes two blocks thick. */
const BLOCK: Record<string, readonly string[]> = {
  C: ['.#####', '######', '##....', '##....', '##....', '######', '.#####'],
  A: ['.####.', '######', '##..##', '######', '######', '##..##', '##..##'],
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..'],
  H: ['##..##', '##..##', '######', '######', '##..##', '##..##', '##..##'],
  E: ['######', '######', '##....', '#####.', '##....', '######', '######'],
  R: ['#####.', '######', '##..##', '#####.', '####..', '##.##.', '##..##'],
}
const WORD = 'CATCHER'

/** How big the mark is for a block size: the face, and the room the letters' depth takes below. */
export function catcherLogoSize(block: number): { width: number; face: number; height: number } {
  const width = WORD.length * 6 * block + (WORD.length - 1) * block
  const face = 7 * block
  return { width, face, height: face + Math.round(face * 0.45) }
}

/** Where the bite is taken: a circle over the top corner of the last letter. */
function biteOf(block: number, width: number): { cx: number; cy: number; r: number } {
  return { cx: width + block * 0.2, cy: -block * 0.2, r: block * 1.9 }
}

/** The word as a mask, block by block, a round bite out of the top of the last letter. */
function catcherMask(block: number): boolean[][] {
  const { width, face } = catcherLogoSize(block)
  const mask = Array.from({ length: face }, () => Array.from({ length: width }, () => false))
  let x = 0
  for (const letter of WORD) {
    BLOCK[letter].forEach((row, by) => {
      for (let bx = 0; bx < row.length; bx += 1) {
        if (row[bx] !== '#') continue
        for (let dy = 0; dy < block; dy += 1) for (let dx = 0; dx < block; dx += 1) mask[by * block + dy][x + bx * block + dx] = true
      }
    })
    x += 7 * block
  }
  // the bite: a round mouthful off the top corner of the R, its edge scalloped by the teeth
  const { cx, cy, r } = biteOf(block, width)
  const teeth = [0.6, 0.85].map((f) => [cx + Math.cos(Math.PI * f) * r, cy + Math.sin(Math.PI * f) * r] as const)
  for (let y = 0; y < face; y += 1) for (let xx = width - block * 6; xx < width; xx += 1) {
    const px = xx + 0.5, py = y + 0.5
    if (Math.hypot(px - cx, py - cy) < r || teeth.some(([tx, ty]) => Math.hypot(px - tx, py - ty) < block * 0.7)) mask[y][xx] = false
  }
  return mask
}

/**
 * The CATCHER mark: a dark outline round everything, the letters' sides
 * running back toward a point below the middle of the word, the face lit
 * in three bands — light at the top, the accent, a darker foot — like an
 * arcade title. Sauce drips from the bite, longer on odd frames.
 */
export function drawCatcherLogo(buffer: PixelBuffer, x: number, y: number, accent: string, block: number, frame = 0): void {
  const mask = catcherMask(block)
  const { width, face, height } = catcherLogoSize(block)
  const depth = height - face
  // the vanishing point, far below the middle of the word; each point of the face runs back toward it by `depth`
  const vx = x + width / 2, vy = y + face + depth * 9
  const light = mix(accent, CREAM, 0.6), mid = accent, foot = dim(accent, 0.74)
  const side = dim(accent, 0.46), back = dim(accent, 0.3)
  const cells: Array<[number, number]> = []
  mask.forEach((row, my) => row.forEach((on, mx) => { if (on) cells.push([mx, my]) }))
  const project = (mx: number, my: number, k: number): [number, number] => {
    const px = x + mx + 0.5, py = y + my + 0.5
    const t = k / (vy - py)
    return [Math.floor(px + (vx - px) * t), Math.floor(py + (vy - py) * t)]
  }
  // the outline round the letters and their depth, then the depth from the back forward, then the face
  for (let k = depth; k >= 0; k -= 1) for (const [mx, my] of cells) {
    const [qx, qy] = project(mx, my, k)
    buffer.rect(qx - 1, qy - 1, 3, 3, OUTLINE)
  }
  for (let k = depth; k >= 1; k -= 1) for (const [mx, my] of cells) {
    const [qx, qy] = project(mx, my, k)
    buffer.set(qx, qy, k === depth ? back : side)
  }
  for (const [mx, my] of cells) {
    const band = my < face * 0.36 ? light : my < face * 0.72 ? mid : foot
    const rim = my < face * 0.36 && (my === 0 || !mask[my - 1][mx])
    buffer.set(x + mx, y + my, rim ? mix(light, '#ffffff', 0.5) : band)
  }
  // the sauce where the teeth went in, running down the R's right side, longer every other frame;
  // mustard rather than ketchup when the accent is red, so it still shows
  const [ar, ag, ab] = rgbOf(accent)
  const reddish = ar > ag * 1.5 && ar > ab * 1.1
  const sauce = reddish ? '#ffcc33' : '#e0301e', dark = reddish ? '#8a6a10' : '#7a1208', shine = reddish ? '#fff0a0' : '#ff9a8a'
  // a cap of sauce over the R's top edge, two drips hanging from it, each ending in a round drop
  const capX = x + width - block * 5, capW = block * 4, capY = y + Math.round(block * 0.2)
  buffer.rect(capX, capY, capW, 3, sauce)
  buffer.rect(capX + 1, capY - 1, capW - 3, 1, sauce)
  buffer.rect(capX + 1, capY + 3, capW - 2, 1, dark)
  buffer.rect(capX + 2, capY - 1, Math.round(capW / 3), 1, shine)
  const drips: Array<[number, number]> = [[capX + Math.round(capW * 0.2), Math.round(block * 0.8)], [capX + Math.round(capW * 0.62), Math.round(block * 1.8) + (frame % 2) * Math.max(1, Math.round(block / 2))]]
  for (const [px, len] of drips) {
    buffer.rect(px, capY + 3, 2, len, sauce)
    buffer.rect(px + 2, capY + 3, 1, len, dark)
    buffer.rect(px - 1, capY + 3 + len, 4, 3, sauce)
    buffer.rect(px, capY + 6 + len, 2, 1, sauce)
    buffer.rect(px + 2, capY + 4 + len, 1, 2, dark)
    buffer.set(px, capY + 4 + len, shine)
  }
}

// ---------------------------------------------------------------- EATER

type Point = readonly [number, number]

/** An arc of an ellipse as points, from angle `from` to `to` (radians, y downwards). */
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 16): Point[] =>
  Array.from({ length: n + 1 }, (_, i) => { const t = from + ((to - from) * i) / n; return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] })

const SHEAR = 0.24
const BASELINE = 20

/**
 * The script, in a 70×26 box before zoom and slant: a capital E in two
 * bowls with a flourish, then a-t-e-r joined on the baseline. The swash
 * under the word is its own path, lit in the second neon.
 */
const EATER_PATHS: ReadonlyArray<ReadonlyArray<Point>> = [
  [...arc(10.5, 7.6, 6.2, 5, -0.4, -Math.PI - 0.85, 16), [9.5, 12.5]],
  [[9.5, 12.5], [12.5, 12.5]],
  [[9.5, 12.5], ...arc(10.5, 16.2, 7.6, 4.2, Math.PI + 0.9, 0.2, 16), [20.5, 19.5], [23, 20.5]],
  [...arc(26.5, 16, 4.2, 4.5, -0.25, -Math.PI * 2 + 0.45, 18), [30.8, 11.5], [30.8, 19.2], [33, 20.6], [35.5, 19]],
  [[38, 5.5], [38, 18.5], [40, 20.6], [43, 19]],
  [[34.5, 10.5], [42, 10.5]],
  [[44.8, 15.6], [52, 15.6], ...arc(48.4, 16, 3.8, 4.5, -0.05, -Math.PI * 2 + 1.05, 16), [52.5, 20.4], [54.5, 19.2]],
  [[55.5, 20.6], [56.8, 11.8], [57.2, 16], [59.6, 12.4], [62.5, 11.2], [64.8, 13]],
]
const SWASH: ReadonlyArray<Point> = [[64.8, 13], [67.5, 17.5], [65.5, 23], [56, 25], [45, 23.6], [34, 25.2], [23, 23.6], [12, 25.2], [4, 23.8]]

/** The mark's size at a zoom: the script's box once slanted, and the halo round it. */
export function eaterLogoSize(zoom: number): { width: number; height: number } {
  return { width: Math.round(72 * zoom), height: Math.round(28 * zoom) }
}

/** Where a point of the script lands on the picture: slanted, zoomed, placed. */
function place([px, py]: Point, x: number, y: number, zoom: number): [number, number] {
  return [x + (px - 1 + SHEAR * (BASELINE - py)) * zoom, y + (py - 1) * zoom]
}

function stroke(buffer: PixelBuffer, paths: ReadonlyArray<ReadonlyArray<Point>>, x: number, y: number, zoom: number, radius: number, color: string): void {
  for (const path of paths) {
    for (let i = 1; i < path.length; i += 1) {
      const [ax, ay] = place(path[i - 1], x, y, zoom), [bx, by] = place(path[i], x, y, zoom)
      const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5))
      for (let s = 0; s <= steps; s += 1) buffer.disc(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps, radius, color)
    }
  }
}

/** The second neon: a colour that stands apart from the accent — cyan beside warm accents, pink beside green, yellow beside blue and violet. */
export function secondNeon(accent: string): string {
  const [r, g, b] = rgbOf(accent)
  if (g > r && g > b) return '#ff6fae'
  if (b > r && b > g) return '#ffd23f'
  if (b > g && r > g && b > 0.8 * r) return '#ffd23f'
  return '#5fe3ff'
}

/** The EATER neon: a wide soft halo, the tube in the accent, a white-hot core; unlit, the tubes are grey glass. */
export function drawEaterLogo(buffer: PixelBuffer, x: number, y: number, accent: string, zoom: number, options: { lit?: boolean; swashLit?: boolean } = {}): void {
  const t = Math.max(1, zoom / 2.2)
  if (options.lit === false) {
    stroke(buffer, EATER_PATHS, x, y, zoom, 1.6 * t, '#4a4a58')
    stroke(buffer, [SWASH], x, y, zoom, 1.3 * t, '#3a3a48')
    return
  }
  const swash = secondNeon(accent)
  stroke(buffer, EATER_PATHS, x, y, zoom, 4.2 * t, dim(accent, 0.28))
  if (options.swashLit !== false) stroke(buffer, [SWASH], x, y, zoom, 3.4 * t, dim(swash, 0.28))
  stroke(buffer, EATER_PATHS, x, y, zoom, 2.1 * t, accent)
  if (options.swashLit !== false) {
    stroke(buffer, [SWASH], x, y, zoom, 1.7 * t, swash)
    stroke(buffer, [SWASH], x, y, zoom, 0.6 * t, '#ffffff')
  } else stroke(buffer, [SWASH], x, y, zoom, 1.3 * t, '#3a3a48')
  stroke(buffer, EATER_PATHS, x, y, zoom, 0.9 * t, mix(accent, '#ffffff', 0.75))
}
