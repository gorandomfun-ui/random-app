/**
 * RANDOM RACING's three cars, seen from behind and a little above, as the
 * player follows his own down the road — built from shapes (`figure.ts`),
 * lit from the upper left like the games' other characters. No maker's
 * name, no badge: only their look.
 *
 * - The red one: an Italian-style sports car, low and wide, its tail lamps
 *   behind a grille of black slats across its whole back, four exhausts.
 * - The yellow one: an American sports car, rounded all over, a bubble of
 *   glass, four round tail lamps, its exhausts in two pairs.
 * - The burger: a big burger on four wheels — bun, lettuce, tomato, cheese
 *   running, the patty, the bottom bun — simple, as the owner wanted it.
 *
 * Drawn at any size: every part is in a box of 160 × 92 and scaled.
 */

import { drawFigure, type Mark, type Part, type Ramp } from './figure'
import type { PixelBuffer } from './pixels'

export type CarKind = 'rosso' | 'burger' | 'giallo'
export const CARS: readonly CarKind[] = ['rosso', 'burger', 'giallo']
/** The box every car is drawn in, at scale 1. */
export const CAR_BOX = { w: 160, h: 92 }

const TYRE: Ramp = ['#5a5a66', '#34343e', '#22222a', '#121218']
const BLACK: Ramp = ['#4a4a56', '#2a2a34', '#1a1a22', '#0c0c12']
const CHROME: Ramp = ['#ffffff', '#c8d0dc', '#8a94a8', '#4a5266']
const GLASS: Ramp = ['#6a84c0', '#2c3c6c', '#1c2648', '#0e1428']
const PLATE: Ramp = ['#fffbea', '#f0e8cc', '#c8bc9c', '#8a7e64']
const RED: Ramp = ['#ff6a5a', '#e0241c', '#a81410', '#6a0808']
const YELLOW: Ramp = ['#fff27a', '#ffcc1a', '#d89a08', '#8a5a04']
const LAMP: Ramp = ['#ffb4a4', '#ff3a2a', '#c01a12', '#7a0a08']
const BUN: Ramp = ['#ffd890', '#eaa040', '#bb6a1e', '#7a3e10']
const BUN_LOW: Ramp = ['#f0b860', '#d68a34', '#a85a1a', '#6a3410']
const PATTY: Ramp = ['#a8663a', '#7a4320', '#512a12', '#331a0a']
const LETTUCE: Ramp = ['#b4f078', '#7ad04a', '#3f9a2c', '#246018']
const CHEESE: Ramp = ['#fff28a', '#ffd23f', '#e0a020', '#a86a08']
const TOMATO: Ramp = ['#ff9a7a', '#e8341e', '#a81c14', '#6a0e0a']

type Pt = readonly [number, number]

/** The parts of a car in its 160 × 92 box, and the details over them. */
function carParts(kind: CarKind, frame: number): { parts: Part[]; marks: Mark[] } {
  const oval = (c: Pt, rx: number, ry: number, ramp: Ramp, more: Partial<Part> = {}): Part => ({ shape: { kind: 'ellipse', c, rx, ry }, ramp, ...more })
  const cap = (a: Pt, b: Pt, r: number, ramp: Ramp, more: Partial<Part> = {}): Part => ({ shape: { kind: 'capsule', a, b, ra: r, rb: r }, ramp, ...more })
  const poly = (points: Pt[], ramp: Ramp, more: Partial<Part> = {}): Part => ({ shape: { kind: 'poly', points }, ramp, ...more })
  const tyres = (x0: number, x1: number, top: number): Part[] => [cap([x0, top], [x0, 86], 9, TYRE), cap([x1, top], [x1, 86], 9, TYRE)]
  const pipe = (x: number, y: number, r: number, ramp = CHROME): Part[] => [oval([x, y], r, r * 0.8, ramp), oval([x + 0.4, y + 0.3], r * 0.5, r * 0.4, BLACK, { line: false })]
  if (kind === 'rosso') {
    // the grille of slats over the whole back, the lamps glowing red behind it
    const slats = (x: number, y: number, tone: number) => {
      if ((Math.round(y) - 44) % 3 === 0) return RED[Math.min(3, tone + 1)]
      const lamp = (x > 18 && x < 54) || (x > 106 && x < 142)
      return lamp ? (tone <= 1 ? '#ff5a3a' : '#c01a12') : BLACK[Math.min(3, tone + 1)]
    }
    return {
      parts: [
        ...tyres(24, 136, 60),
        poly([[18, 70], [142, 70], [136, 84], [24, 84]], BLACK),
        // wide hips over the wheels, the deck, the two sails from the roof down to it, the window sunk between them
        poly([[6, 50], [14, 40], [146, 40], [154, 50], [156, 62], [152, 74], [8, 74], [4, 62]], RED, { round: { cx: 80, half: 78 } }),
        poly([[24, 30], [136, 30], [146, 40], [14, 40]], RED),
        poly([[56, 16], [104, 16], [108, 30], [52, 30]], GLASS),
        poly([[34, 30], [50, 13], [58, 13], [50, 30]], RED), poly([[126, 30], [110, 13], [102, 13], [110, 30]], RED),
        cap([52, 12], [108, 12], 2.6, RED),
        oval([22, 37], 5, 3, RED), oval([138, 37], 5, 3, RED),
        poly([[14, 45], [146, 45], [145, 63], [15, 63]], BLACK, { paint: slats }),
        poly([[68, 65], [92, 65], [92, 72], [68, 72]], PLATE),
        ...pipe(48, 79, 3.2), ...pipe(57, 79, 3.2), ...pipe(103, 79, 3.2), ...pipe(112, 79, 3.2),
      ],
      marks: [
        { color: '#9ab0e0', points: [[62, 18], [63, 18], [61, 19], [62, 19], [60, 20], [61, 20], [59, 21], [60, 21], [58, 22], [59, 22], [70, 18], [69, 19], [68, 20]] },
        { color: '#4a4030', points: [[72, 68], [73, 68], [75, 68], [76, 68], [79, 68], [80, 68], [83, 68], [84, 68], [87, 68], [88, 68]] },
      ],
    }
  }
  if (kind === 'giallo') {
    // rounded all over: the hips, the deck sloping to them, a bubble of glass, four round lamps, the exhausts in two pairs
    return {
      parts: [
        ...tyres(24, 136, 58),
        poly([[16, 70], [144, 70], [138, 84], [22, 84]], BLACK),
        poly([[6, 62], [8, 49], [16, 42], [30, 38], [130, 38], [144, 42], [152, 49], [154, 62], [150, 72], [10, 72]], YELLOW, { round: { cx: 80, half: 76 } }),
        poly([[28, 29], [132, 29], [146, 38], [14, 38]], YELLOW),
        poly([[46, 12], [114, 12], [126, 29], [34, 29]], GLASS),
        cap([48, 10], [112, 10], 3, YELLOW),
        oval([22, 35], 4.5, 2.8, YELLOW), oval([138, 35], 4.5, 2.8, YELLOW),
        oval([28, 52], 7.5, 6, LAMP), oval([47, 52], 7.5, 6, LAMP), oval([113, 52], 7.5, 6, LAMP), oval([132, 52], 7.5, 6, LAMP),
        poly([[68, 57], [92, 57], [92, 65], [68, 65]], PLATE),
        ...pipe(42, 79, 3.2), ...pipe(51, 79, 3.2), ...pipe(109, 79, 3.2), ...pipe(118, 79, 3.2),
      ],
      marks: [
        { color: '#9ab0e0', points: [[54, 15], [55, 15], [53, 16], [54, 16], [52, 17], [53, 17], [51, 18], [52, 18], [50, 19], [51, 19], [63, 15], [62, 16], [61, 17]] },
        { color: '#ffd8c8', points: [[25, 49], [26, 49], [44, 49], [45, 49], [110, 49], [111, 49], [129, 49], [130, 49]] },
        { color: '#4a4030', points: [[72, 61], [73, 61], [75, 61], [76, 61], [79, 61], [80, 61], [83, 61], [84, 61], [87, 61], [88, 61]] },
      ],
    }
  }
  // the burger: a big one on four wheels, simple
  const wheel = (x: number, top: number, r: number, ramp: Ramp): Part[] => [cap([x, top], [x, 86], r, ramp), cap([x, top + 2], [x, 84], r * 0.35, ramp === TYRE ? BLACK : BLACK, { line: false })]
  const far = (r: Ramp): Ramp => [r[1], r[2], r[3], r[3]]
  // the lettuce in frills all round, wider than the bun
  const lettuce = (): Part => {
    const pts: Pt[] = [[10, 45], [150, 45]]
    for (let x = 153; x >= 7; x -= 3.5) { const k = Math.round(x / 3.5) % 3; pts.push([x, 50 + (k === 0 ? 4 : k === 1 ? 1 : 2.6)]) }
    return poly(pts, LETTUCE)
  }
  const drips = [34, 58, 80, 102, 124].map((x, i): Part => cap([x, 57], [x + (i % 2 ? 0.4 : -0.4), 60 + (i % 3) * 2], 2.4, CHEESE))
  return {
    parts: [
      // the far wheels, a little higher and further in, then the near ones
      ...wheel(34, 66, 7.5, far(TYRE)), ...wheel(126, 66, 7.5, far(TYRE)),
      ...wheel(18, 64, 10, TYRE), ...wheel(142, 64, 10, TYRE),
      oval([80, 34], 64, 30, BUN),
      oval([80, 74], 60, 10, BUN_LOW),
      cap([20, 62], [140, 62], 8.5, PATTY),
      // the cheese, its square corners hanging over each side
      poly([[12, 52], [148, 52], [150, 63], [143, 57], [17, 57], [10, 63]], CHEESE),
      ...drips,
      cap([20, 50], [140, 50], 2.6, TOMATO),
      lettuce(),
    ],
    marks: [
      { color: '#fff6dc', points: [[44, 14], [45, 14], [58, 9], [59, 9], [72, 7], [73, 7], [88, 7], [89, 7], [102, 9], [103, 9], [116, 14], [117, 14], [36, 24], [37, 24], [52, 19], [53, 19], [66, 16], [67, 16], [80, 15], [81, 15], [94, 16], [95, 16], [108, 19], [109, 19], [124, 24], [125, 24], [30, 33], [31, 33], [130, 33], [131, 33]] },
      { color: '#b8742c', points: [[45, 15], [59, 10], [73, 8], [89, 8], [103, 10], [117, 15], [37, 25], [53, 20], [67, 17], [81, 16], [95, 17], [109, 20], [125, 25], [31, 34], [131, 34]] },
      { color: '#2a1408', points: Array.from({ length: 15 }, (_, i) => [[24 + i * 8, 60], [25 + i * 8, 61], [26 + i * 8, 62]] as Pt[]).flat() },
      { color: '#ffd8a8', points: frame % 2 ? [[40, 50], [70, 50], [100, 50], [128, 50]] : [[34, 50], [62, 50], [92, 50], [122, 50]] },
    ],
  }
}

const scaled = (parts: Part[], marks: Mark[], s: number): { parts: Part[]; marks: Mark[] } => {
  const p = (pt: Pt): Pt => [pt[0] * s, pt[1] * s]
  return {
    parts: parts.map((part) => {
      const sh = part.shape
      const shape = sh.kind === 'capsule' ? { ...sh, a: p(sh.a), b: p(sh.b), ra: sh.ra * s, rb: sh.rb * s }
        : sh.kind === 'ellipse' ? { ...sh, c: p(sh.c), rx: sh.rx * s, ry: sh.ry * s }
        : { ...sh, points: sh.points.map(p) }
      const paint = part.paint ? (x: number, y: number, tone: number) => part.paint!(x / s, y / s, tone) : undefined
      return { ...part, shape, paint, round: part.round ? { cx: part.round.cx * s, half: part.round.half * s } : undefined }
    }),
    // a detail grows with the car: each of its pixels a little square
    marks: marks.map((m) => ({ color: m.color, points: m.points.flatMap(([x, y]) => { const out: Pt[] = []; const k = Math.max(1, Math.round(s)); for (let dy = 0; dy < k; dy += 1) for (let dx = 0; dx < k; dx += 1) out.push([Math.round(x * s) + dx, Math.round(y * s) + dy]); return out }) })),
  }
}

/** A car seen from behind, its box's top left at `x`, `y`, `scale` times its 160 × 92; its shadow on the road under it. */
export function drawCarRear(buffer: PixelBuffer, kind: CarKind, x: number, y: number, scale: number, frame: number): void {
  const w = Math.ceil(CAR_BOX.w * scale), h = Math.ceil(CAR_BOX.h * scale)
  // the shadow first, under the tyres
  const cx = x + w / 2, cy = y + h - 2 * scale
  for (let dy = -4 * scale; dy <= 4 * scale; dy += 1) for (let dx = -76 * scale; dx <= 76 * scale; dx += 1) {
    const q = (dx / (76 * scale)) ** 2 + (dy / (4 * scale)) ** 2
    if (q <= 1) buffer.tint(Math.round(cx + dx), Math.round(cy + dy), '#000000', 0.45 * (1 - q * 0.6))
  }
  const { parts, marks } = carParts(kind, frame)
  const s = scaled(parts, marks, scale)
  drawFigure(buffer, x, y, w, h, s.parts, s.marks)
}

/** A car's colour, for what is drawn round it (its name, its glow when chosen). */
export const CAR_COLOR: Record<CarKind, string> = { rosso: '#e0241c', burger: '#eaa040', giallo: '#ffcc1a' }
