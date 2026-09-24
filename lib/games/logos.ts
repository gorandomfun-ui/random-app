/**
 * Each game's own mark, drawn here, under the shared RANDOM logo.
 * RANDOM CATCHER: heavy, plump letters with a bite taken out of them and
 * hot sauce dripping underneath. RANDOM EATER: a script that flows like a
 * diner sign, its underline snaking back under the word to end in a little
 * head. Both take the theme's accent.
 */

import { PixelBuffer, rgbOf } from './pixels'
import { MINI_BURGER, MINI_BURGER_PALETTE } from './sprites'

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

export const CATCHER_LOGO_WIDTH = WORD.length * LETTER_W + (WORD.length - 1) * GAP
/** The letters plus the room the sauce drips take underneath. */
export const CATCHER_LOGO_HEIGHT = LETTER_H + 26

/** The word as a mask, two bites taken out: the top of the C and the shoulder of the last R. */
function catcherMask(): boolean[][] {
  const mask = Array.from({ length: LETTER_H }, () => Array.from({ length: CATCHER_LOGO_WIDTH }, () => false))
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
  // a bite: a round mouthful out of the letters, its edge scalloped by the teeth
  const bite = (cx: number, cy: number, r: number) => {
    const clear = (ox: number, oy: number, radius: number) => {
      for (let y = 0; y < LETTER_H; y += 1) for (let xx = 0; xx < CATCHER_LOGO_WIDTH; xx += 1) if ((xx - ox) ** 2 + (y - oy) ** 2 <= radius * radius) mask[y][xx] = false
    }
    clear(cx, cy, r)
    for (let i = 0; i < 12; i += 1) { const t = (i / 12) * Math.PI * 2; clear(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 3) }
  }
  bite(LETTER_W + 2, -4, 15)
  bite(CATCHER_LOGO_WIDTH + 3, 3, 14)
  return mask
}

const NEIGHBOURS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]

/** The CATCHER mark: a black drop shadow, a cream outline, the accent fill, the sauce. */
export function drawCatcherLogo(buffer: PixelBuffer, x: number, y: number, accent: string, frame = 0): void {
  const mask = catcherMask()
  const outline = '#f8f5e6', shadow = '#000000', sauce = '#e0301e', shine = '#ff9a8a'
  const each = (fn: (mx: number, my: number) => void) => mask.forEach((row, my) => row.forEach((on, mx) => { if (on) fn(mx, my) }))
  each((mx, my) => { for (const [dx, dy] of NEIGHBOURS) buffer.set(x + mx + dx + 3, y + my + dy + 3, shadow) })
  each((mx, my) => { for (const [dx, dy] of NEIGHBOURS) buffer.set(x + mx + dx, y + my + dy, outline) })
  each((mx, my) => buffer.set(x + mx, y + my, accent))
  // the sauce: fat drips hanging from the A, the second C and the E, a blob at the letter's foot, swelling with the frame
  const bottom = y + LETTER_H
  const drips: Array<[number, number]> = [[1 * (LETTER_W + GAP) + 4, 8], [3 * (LETTER_W + GAP) + 12, 14], [5 * (LETTER_W + GAP) + 16, 6]]
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

/** A stroke along points, a square brush of `size` pixels, the points scaled by `zoom`. */
function stroke(buffer: PixelBuffer, points: ReadonlyArray<readonly [number, number]>, color: string, size: number, x0: number, y0: number, zoom: number): void {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i]
    const steps = Math.max(Math.ceil(Math.abs(bx - ax) * zoom), Math.ceil(Math.abs(by - ay) * zoom), 1)
    for (let s = 0; s <= steps; s += 1) {
      const px = Math.round((ax + ((bx - ax) * s) / steps) * zoom), py = Math.round((ay + ((by - ay) * s) / steps) * zoom)
      buffer.rect(x0 + px - Math.floor(size / 2), y0 + py - Math.floor(size / 2), size, size, color)
    }
  }
}

/** An arc of an ellipse as points, from angle `from` to `to` (radians, y downwards). */
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 12): Array<[number, number]> =>
  Array.from({ length: n + 1 }, (_, i) => { const t = from + ((to - from) * i) / n; return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] })

const ZOOM = 2
export const EATER_LOGO_WIDTH = 70 * ZOOM
export const EATER_LOGO_HEIGHT = 58

/** The eater's face from the side, facing left, the mouth open: hair `h`, skin `p`, dark `k`. */
const EATER_FACE: readonly string[] = ['..hhhhhh..', '.hhhhhhhh.', '.hhpppphh.', '.pkpppppp.', '.ppppppppp', '.kkkpppppp', '.kkkpppppp', '..pppppp..', '...pppp...']
const FACE_PALETTE: Record<string, string> = { h: '#5a3319', p: '#f2c9a0', k: '#121210' }

/**
 * The script, in a 70×29 box before zoom: a capital E shaped like a big
 * epsilon, then a-t-e-r joined on a slanted baseline; from the r the line
 * swings back under the whole word in a wave and ends, on the left, in a
 * little head with an eye that blinks. Cream tube, accent halo.
 */
const EATER_PATHS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // E: the upper bowl, the waist, the lower bowl running into the baseline
  [...arc(10, 6, 6, 4.5, -0.3, -Math.PI - 0.7, 10), [9, 10]],
  [[9, 10], ...arc(10, 15, 7, 5, Math.PI + 0.6, 0, 12), [19, 17.5], [21, 18.5]],
  // a: the bowl, the stem, the link
  [...arc(24.5, 14.5, 4.5, 4.5, 0.3, Math.PI * 2 + 0.3, 12)],
  [[29, 10], [29, 18], [31.5, 19.5], [33.5, 18]],
  // t: the stem with its foot, the crossbar
  [[36, 3], [36, 17], [38, 19.5], [41, 18.5]],
  [[32, 9], [40.5, 9]],
  // e: the bar, the loop, the link
  [[42.5, 14], [49.5, 14], ...arc(46, 15, 4, 4.5, -0.2, -Math.PI * 2 + 1.0, 10), [50.5, 18.5], [52.5, 17]],
  // r: the up-stroke and the shoulder
  [[54, 19.5], [55, 12.5], [55.5, 16.5], [58, 11.5], [61.5, 10.5], [63.5, 12.5]],
  // the swash: from the r, round and back under the word, in a wave, to the head on the left
  [[63.5, 12.5], [67, 17], [64.5, 23], [54, 25.5], [42, 23], [30, 25.5], [18, 23], [8, 25.5], [4, 24.5]],
]

export function drawEaterLogo(buffer: PixelBuffer, x: number, y: number, accent: string, frame = 0): void {
  const tube = '#f8f5e6'
  const [r, g, b] = rgbOf(accent)
  const halo = `#${[r, g, b].map((c) => Math.round(c * 0.55).toString(16).padStart(2, '0')).join('')}`
  for (const path of EATER_PATHS) stroke(buffer, path, halo, 7, x, y, ZOOM)
  for (const path of EATER_PATHS) stroke(buffer, path, accent, 5, x, y, ZOOM)
  for (const path of EATER_PATHS) stroke(buffer, path, tube, 3, x, y, ZOOM)
  // the head at the end of the swash: the eater himself, mouth open, a mini burger bobbing in front of it
  const hx = x - 6, hy = y + 40
  EATER_FACE.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx += 1) { if (row[rx] === '.') continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) buffer.rect(hx + (rx + dx) * ZOOM, hy + (ry + dy) * ZOOM, ZOOM, ZOOM, accent) } })
  EATER_FACE.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx += 1) { const color = FACE_PALETTE[row[rx]]; if (color) buffer.rect(hx + rx * ZOOM, hy + ry * ZOOM, ZOOM, ZOOM, color) } })
  buffer.rect(hx + 3 * ZOOM, hy + 3 * ZOOM, ZOOM, ZOOM, frame % 4 === 3 ? '#f2c9a0' : '#121210')
  buffer.blit(MINI_BURGER, hx - 16 + (frame % 2) * 2, hy + 8, MINI_BURGER_PALETTE)
}
