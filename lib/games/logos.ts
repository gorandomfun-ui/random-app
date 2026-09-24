/**
 * Each game's own mark, drawn here, under the shared RANDOM logo.
 * RANDOM CATCHER: fat block letters standing out in volume, a bite taken
 * out of them, hot sauce dripping. RANDOM EATER: a neon script in the
 * manner of a diner sign, a tube of light with its halo, the underline a
 * swash that runs back under the word. Both take the theme's accent.
 */

import { PixelBuffer, rgbOf } from './pixels'

/** A colour dimmed to a fraction of itself. */
export function dim(color: string, factor: number): string {
  return `#${rgbOf(color).map((c) => Math.round(c * factor).toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------- CATCHER

/** Plump letters, 10×12, a three-pixel stroke, the corners rounded off. */
const PLUMP: Record<string, readonly string[]> = {
  C: ['.########.', '##########', '###....###', '###.......', '###.......', '###.......', '###.......', '###.......', '###.......', '###....###', '##########', '.########.'],
  A: ['...####...', '..######..', '.###..###.', '###....###', '###....###', '##########', '##########', '###....###', '###....###', '###....###', '###....###', '###....###'],
  T: ['##########', '##########', '##########', '...####...', '...####...', '...####...', '...####...', '...####...', '...####...', '...####...', '...####...', '...####...'],
  H: ['###....###', '###....###', '###....###', '###....###', '###....###', '##########', '##########', '###....###', '###....###', '###....###', '###....###', '###....###'],
  E: ['##########', '##########', '##########', '###.......', '###.......', '########..', '########..', '###.......', '###.......', '##########', '##########', '##########'],
  R: ['#########.', '##########', '###....###', '###....###', '##########', '#########.', '###.###...', '###..###..', '###...###.', '###....###', '###....###', '###....###'],
}
const SCALE = 3
const GAP = 2 * SCALE
const LETTER_W = 10 * SCALE, LETTER_H = 12 * SCALE
const WORD = 'CATCHER'
/** How far the letters come forward: the extrusion, down and to the right. */
const DEPTH = 6

export const CATCHER_LOGO_WIDTH = WORD.length * LETTER_W + (WORD.length - 1) * GAP + DEPTH
/** The letters, their depth, and the room the sauce takes underneath. */
export const CATCHER_LOGO_HEIGHT = LETTER_H + DEPTH + 22

/** The word as a mask, a bite taken out of the top of the C and another out of the last R. */
function catcherMask(): boolean[][] {
  const width = CATCHER_LOGO_WIDTH - DEPTH
  const mask = Array.from({ length: LETTER_H }, () => Array.from({ length: width }, () => false))
  let x = 0
  for (const letter of WORD) {
    PLUMP[letter].forEach((row, y) => {
      for (let i = 0; i < row.length; i += 1) {
        if (row[i] !== '#') continue
        for (let dy = 0; dy < SCALE; dy += 1) for (let dx = 0; dx < SCALE; dx += 1) mask[y * SCALE + dy][x + i * SCALE + dx] = true
      }
    })
    x += LETTER_W + GAP
  }
  const clear = (ox: number, oy: number, radius: number) => {
    for (let y = 0; y < LETTER_H; y += 1) for (let xx = 0; xx < width; xx += 1) if ((xx - ox) ** 2 + (y - oy) ** 2 <= radius * radius) mask[y][xx] = false
  }
  // two clean round bites: the top of the C, the shoulder of the last R
  clear(LETTER_W + 3, -5, 16)
  clear(width + 4, 2, 15)
  return mask
}

const AROUND: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]

/** The CATCHER mark: letters in volume — a dark outline, the extruded sides, the lit face with a highlight along its top — and the sauce. */
export function drawCatcherLogo(buffer: PixelBuffer, x: number, y: number, accent: string, frame = 0): void {
  const mask = catcherMask()
  const side = dim(accent, 0.42), edge = dim(accent, 0.25), face = accent, light = '#f8f5e6', outline = '#000000'
  const sauce = '#e0301e', shine = '#ff9a8a'
  const each = (fn: (mx: number, my: number) => void) => mask.forEach((row, my) => row.forEach((on, mx) => { if (on) fn(mx, my) }))
  // the outline around everything, the sides layer by layer, the face on top
  for (let k = 0; k <= DEPTH; k += 1) each((mx, my) => { for (const [dx, dy] of AROUND) buffer.set(x + mx + k + dx, y + my + k + dy, outline) })
  for (let k = DEPTH; k >= 1; k -= 1) each((mx, my) => buffer.set(x + mx + k, y + my + k, k === DEPTH ? edge : side))
  each((mx, my) => buffer.set(x + mx, y + my, face))
  each((mx, my) => { if (my === 0 || !mask[my - 1][mx]) buffer.set(x + mx, y + my, light); if (mx === 0 || !mask[my][mx - 1]) buffer.set(x + mx, y + my, light) })
  // the sauce: fat drips hanging from the A, the second C and the E, a blob at the letter's foot, swelling with the frame
  const bottom = y + LETTER_H + DEPTH
  const drips: Array<[number, number]> = [[1 * (LETTER_W + GAP) + 6, 6], [3 * (LETTER_W + GAP) + 14, 12], [5 * (LETTER_W + GAP) + 18, 4]]
  drips.forEach(([dx, length], index) => {
    const len = length + ((frame + index) % 3) * 2
    buffer.rect(x + dx - 2, bottom - 5, 12, 5, sauce)
    buffer.rect(x + dx - 1, bottom, 10, 2, sauce)
    buffer.rect(x + dx, bottom + 2, 8, len, sauce)
    buffer.rect(x + dx + 1, bottom + 2 + len, 6, 2, sauce)
    buffer.rect(x + dx + 2, bottom + 4 + len, 4, 2, sauce)
    buffer.rect(x + dx + 3, bottom + 6 + len, 2, 1, sauce)
    buffer.rect(x + dx + 1, bottom - 3, 2, len + 3, shine)
  })
}

// ---------------------------------------------------------------- EATER

type Point = readonly [number, number]

/** A filled disc: the round brush a neon tube is drawn with. */
function disc(buffer: PixelBuffer, cx: number, cy: number, r: number, color: string): void {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r)
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) buffer.set(x, y, color)
}

/** An arc of an ellipse as points, from angle `from` to `to` (radians, y downwards). */
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 16): Point[] =>
  Array.from({ length: n + 1 }, (_, i) => { const t = from + ((to - from) * i) / n; return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] })

const ZOOM = 2.2
const SHEAR = 0.22
const BASELINE = 20
export const EATER_LOGO_WIDTH = 170
export const EATER_LOGO_HEIGHT = 60

/**
 * The script, in a 70×26 box before zoom and slant: a capital E in two
 * bowls, then a-t-e-r joined on the baseline; from the r the line swings
 * back under the whole word in a wave. Leaning to the right, like a sign.
 */
const EATER_PATHS: ReadonlyArray<ReadonlyArray<Point>> = [
  [...arc(10.5, 7.5, 6.5, 5.5, -0.35, -Math.PI - 0.8, 14), [10, 13]],
  [[10, 13], ...arc(10.5, 16, 8, 4.8, Math.PI + 0.55, 0.15, 16), [20.5, 19.5], [23, 20.5]],
  [...arc(26, 15.5, 4.5, 4.5, -0.3, -Math.PI * 2 + 0.5, 18)],
  [[30.5, 10.5], [30.5, 19], [32.5, 20.7], [35, 19]],
  [[37.5, 4], [37.5, 18], [39.5, 20.5], [42.5, 19]],
  [[34.5, 10], [41.5, 10]],
  [[44.5, 15.5], [51.5, 15.5], ...arc(48, 16, 3.8, 4.4, -0.1, -Math.PI * 2 + 1.1, 16), [52, 20.5], [54, 19]],
  [[55.5, 20.5], [56.5, 12.5], [57, 17], [59.5, 12], [62.5, 11], [64.5, 13]],
  [[64.5, 13], [67.5, 18], [65, 23.5], [55, 25.5], [44, 24], [33, 25.5], [22, 24], [12, 25.5], [5, 24]],
]

/** Where a point of the script lands on the picture: slanted, zoomed, placed. */
function place([px, py]: Point, x: number, y: number): [number, number] {
  return [x + (px - 2 + SHEAR * (BASELINE - py)) * ZOOM, y + (py - 1) * ZOOM]
}

function tube(buffer: PixelBuffer, x: number, y: number, radius: number, color: string): void {
  for (const path of EATER_PATHS) {
    for (let i = 1; i < path.length; i += 1) {
      const [ax, ay] = place(path[i - 1], x, y), [bx, by] = place(path[i], x, y)
      const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.7))
      for (let s = 0; s <= steps; s += 1) disc(buffer, ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps, radius, color)
    }
  }
}

/** The EATER neon: a wide dim halo, the tube in the accent, a bright core; when `lit` is false the tube is off, grey. */
export function drawEaterLogo(buffer: PixelBuffer, x: number, y: number, accent: string, options: { lit?: boolean } = {}): void {
  if (options.lit === false) { tube(buffer, x, y, 2.6, '#3a3a36'); return }
  tube(buffer, x, y, 5, dim(accent, 0.35))
  tube(buffer, x, y, 3.4, accent)
  tube(buffer, x, y, 1.5, '#f8f5e6')
}
