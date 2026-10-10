/**
 * The cars' flanks, so a car is a box and not a picture: its back as drawn
 * (`racing-art.ts`, `racing-traffic.ts`) and, along it, its side, laid in
 * perspective from its back to its front as the car is passed. One side
 * picture for each car, painted here in the same hand as the traffic: the
 * body and its colour, the windows, the wheels, what the car carries — the
 * red one's wedge and its strakes, the yellow one's long bonnet, the
 * burger's bun, cheese, lettuce and patty.
 *
 * A picture's first column is the car's back, its last its nose; it is
 * drawn `SIDE_LENGTH` long, `SIDE_HIGH` tall, cut down to its top (the roof,
 * the bun, the cone) or its shoulder, and stretched to the car's length and
 * its share of the car's height on the screen.
 */

import type { RacingCarKind } from './racing-art'
import { INK_LINE, Painter, tone } from './racing-paint'
import { PixelBuffer } from './pixels'
import { TRAFFIC_COLOURS, type TrafficModel } from './racing-traffic'

export const SIDE_LENGTH = 120
export const SIDE_HIGH = 48
/** How long a car is on the road, in stretches. */
export const CAR_SPAN = 12

/** How much darker a side is than the car's back. */
const FLANK_SHADE = 0.8
const TYRE = '#1a1a24', RIM = '#9a9aa8', GLASS = '#2a3a5c', GLINT = '#6a84bc', DARK = '#2a2a34'

/** A wheel at `x`, its foot on the picture's ground. */
function wheel(p: Painter, x: number, r = 8): void {
  p.disc(x, SIDE_HIGH - r - 1, r, TYRE)
  p.disc(x, SIDE_HIGH - r - 1, r * 0.45, RIM)
}
/** A window between `x0` and `x1`, from `top` down to `foot`, its front leaning in by `lean`. */
function glass(p: Painter, x0: number, x1: number, top: number, foot: number, leanBack = 6, leanFront = 8): void {
  p.poly([[x0, foot], [x0 + leanBack, top], [x1 - leanFront, top], [x1, foot]], GLASS)
  p.line(x0 + leanBack + 3, top + 2, x0 + leanBack + 8, foot - 2, 1, GLINT)
}

/**
 * A side as it shows, its cabin set in from it: the body below the windows
 * only (the row of the picture it starts at); a box (the camper, the ice
 * cream van, the pickup's cab, the burger) whole, as tall as its back.
 */
const SHOULDER: Partial<Record<RacingCarKind | TrafficModel, number>> = { rosso: 25, giallo: 25, hatch: 25, saloon: 25, estate: 25, beetle: 24 }

export type CarSide = { pic: PixelBuffer; share: number }
const made = new Map<string, CarSide>()

/** A car's side, and what share of the car's height it is: a racing car (its own colours) or an everyday car of the traffic (in its colour); `whole` with its cabin, as a car turned sideways shows it. */
export function carSide(kind: RacingCarKind | TrafficModel, look = 0, whole = false): CarSide {
  const key = `${kind}|${look}|${whole}`
  const known = made.get(key)
  if (known) return known
  const p = new Painter(SIDE_LENGTH, SIDE_HIGH), B = SIDE_HIGH - 9
  const c = kind === 'rosso' ? '#d8261e' : kind === 'giallo' ? '#f2c418' : TRAFFIC_COLOURS[((look % TRAFFIC_COLOURS.length) + TRAFFIC_COLOURS.length) % TRAFFIC_COLOURS.length]
  const shade = tone(c, 0.72), lit = tone(c, 1.25)
  switch (kind) {
    case 'rosso':
      // a low wedge, the strakes along its flank
      p.poly([[2, B + 4], [2, B - 12], [40, B - 15], [56, B - 24], [84, B - 24], [100, B - 14], [118, B - 10], [118, B + 4]], c)
      glass(p, 58, 96, B - 22, B - 14, 4, 10)
      for (let k = 0; k < 4; k += 1) p.rect(10, B - 8 + k * 3, 38, 1, shade)
      p.rect(2, B - 1, 116, 4, shade); p.rect(60, B - 14, 40, 1, lit)
      wheel(p, 22); wheel(p, 96)
      break
    case 'giallo':
      // the long bonnet, the cabin set back, rounded
      p.round(2, B - 14, 116, 18, 7, c)
      p.poly([[22, B - 14], [32, B - 25], [62, B - 25], [72, B - 14]], c)
      glass(p, 30, 70, B - 23, B - 14, 4, 8)
      p.rect(2, B - 1, 116, 4, shade); p.rect(76, B - 12, 40, 1, lit)
      wheel(p, 24); wheel(p, 94)
      break
    case 'burger':
      // the bun, the cheese, the lettuce, the patty, the bun, on its wheels
      p.round(4, B - 6, 112, 9, 4, '#e8a050')
      p.round(6, B - 12, 108, 7, 3, '#6a3418')
      p.rect(8, B - 14, 104, 3, '#ffd23f')
      for (let x = 8; x < 112; x += 6) p.disc(x, B - 15, 3, '#5ac048')
      p.ellipse(60, B - 18, 56, 18, '#e89040'); p.rect(4, B - 18, 112, 4, '#e89040')
      for (const [x, y] of [[30, -28], [50, -32], [70, -31], [88, -27], [40, -24], [76, -24]] as const) p.rect(x, B + y, 3, 1, '#fff2c8')
      wheel(p, 22, 7); wheel(p, 98, 7)
      break
    case 'camper':
      p.round(2, B - 34, 116, 37, 5, c)
      p.rect(2, B - 10, 116, 4, CREAMY(c)); for (let k = 0; k < 4; k += 1) glass(p, 12 + k * 22, 30 + k * 22, B - 28, B - 16, 0, 0)
      glass(p, 98, 116, B - 28, B - 14, 0, 6); p.disc(6, B - 20, 7, DARK)
      wheel(p, 24); wheel(p, 94)
      break
    case 'icecream':
      p.round(2, B - 32, 116, 35, 4, c)
      p.rect(24, B - 26, 44, 14, '#f6f2e8'); p.rect(24, B - 28, 44, 3, '#ff6aa0')
      for (let k = 0; k < 4; k += 1) p.rect(26 + k * 11, B - 22, 8, 6, ['#ff94bc', '#a6f0d2', '#fff0c8', '#ffd23f'][k])
      glass(p, 96, 116, B - 26, B - 14, 0, 6)
      p.poly([[52, B - 33], [64, B - 33], [58, B - 46]], '#e0a050'); p.disc(58, B - 44, 4, '#ff94bc')
      wheel(p, 24); wheel(p, 94)
      break
    case 'pickup':
      // the bed behind, its boards sticking up; the cab
      p.rect(2, B - 14, 70, 17, c); p.rect(2, B - 14, 70, 2, lit)
      p.round(68, B - 30, 50, 33, 4, c)
      glass(p, 76, 112, B - 27, B - 16, 2, 8)
      for (const [x, col] of [[10, '#ffd23f'], [26, '#3a7ae0'], [44, '#ff6aa0']] as const) p.round(x, B - 26, 12, 14, 4, col)
      wheel(p, 22); wheel(p, 96)
      break
    case 'estate':
      p.round(2, B - 14, 116, 17, 5, c)
      p.poly([[10, B - 14], [16, B - 26], [90, B - 26], [102, B - 14]], c)
      glass(p, 16, 98, B - 24, B - 15, 2, 10); p.rect(56, B - 24, 2, 9, c)
      p.round(6, B - 31, 96, 4, 2, '#ffd23f')
      wheel(p, 22); wheel(p, 96)
      break
    case 'beetle':
      p.ellipse(60, B - 6, 56, 14, c); p.rect(4, B - 6, 112, 9, c)
      p.ellipse(56, B - 16, 30, 14, c)
      glass(p, 34, 78, B - 26, B - 15, 6, 10)
      wheel(p, 24, 9); wheel(p, 94, 9)
      break
    default:
      // the hatch and the saloon
      p.round(2, B - 14, 116, 17, 5, c)
      if (kind === 'hatch') p.poly([[18, B - 14], [26, B - 27], [80, B - 27], [96, B - 14]], c)
      else p.poly([[30, B - 14], [42, B - 26], [78, B - 26], [92, B - 14]], c)
      glass(p, kind === 'hatch' ? 24 : 38, kind === 'hatch' ? 92 : 88, B - 25, B - 15, 2, 10)
      wheel(p, 22); wheel(p, 96)
  }
  p.outline(INK_LINE)
  // a side is in the shade of the car's back, as the turning pictures' flanks are
  const d = p.pic.data
  for (let o = 0; o < d.length; o += 4) { d[o] *= FLANK_SHADE; d[o + 1] *= FLANK_SHADE; d[o + 2] *= FLANK_SHADE * 1.04 }
  // from the car's highest point, or from its shoulder, its top edge inked
  const top = topOf(p.pic), from = whole ? top : Math.max(top, SHOULDER[kind] ?? 0)
  const pic = new PixelBuffer(SIDE_LENGTH, SIDE_HIGH - from, '#000000')
  pic.data.set(p.pic.data.subarray(from * SIDE_LENGTH * 4))
  if (from > top) for (let x = 0; x < SIDE_LENGTH; x += 1) { const o = x * 4; if (pic.data[o + 3] > 0) pic.set(x, 0, INK_LINE) }
  const side = { pic, share: (SIDE_HIGH - from) / (SIDE_HIGH - top) }
  made.set(key, side)
  return side
}

/** A picture's first row with something painted in it. */
function topOf(pic: PixelBuffer): number {
  let top = 0
  while (top < pic.height - 1 && !Array.from({ length: pic.width }, (_, x) => pic.data[(top * pic.width + x) * 4 + 3]).some((a) => a > 0)) top += 1
  return top
}

/** A pale band along a camper's flank, from its colour. */
const CREAMY = (c: string) => tone(c, 1.45)
