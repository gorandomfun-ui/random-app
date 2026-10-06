/**
 * RANDOM RACING's three cars, seen from behind and a little above, as the
 * player follows his own down the road — built from shapes (`figure.ts`),
 * lit from the upper left like the games' other characters. No maker's
 * name, no badge: only their look.
 *
 * - The red one: an Italian-style sports car, low and wide, its tail lamps
 *   behind a grille of black slats across its whole back, four exhausts.
 * - The yellow one: an American muscle car, two black stripes over roof and
 *   boot, a ducktail, split tail lamps, a chrome bumper, two exhausts.
 * - The burger: its bun the cabin with sesame on it and its rear window cut
 *   in, a pickle for a spoiler, lettuce for a skirt, cheese running, the
 *   patty for a bumper with tomato slices for tail lamps, the bottom bun for
 *   its floor; ketchup and mustard for exhausts.
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
const STRIPE: Ramp = ['#4a4a56', '#22222a', '#16161c', '#0a0a0e']
const LAMP: Ramp = ['#ffb4a4', '#ff3a2a', '#c01a12', '#7a0a08']
const BUN: Ramp = ['#ffd890', '#eaa040', '#bb6a1e', '#7a3e10']
const BUN_LOW: Ramp = ['#f0b860', '#d68a34', '#a85a1a', '#6a3410']
const PATTY: Ramp = ['#a8663a', '#7a4320', '#512a12', '#331a0a']
const LETTUCE: Ramp = ['#b4f078', '#7ad04a', '#3f9a2c', '#246018']
const CHEESE: Ramp = ['#fff28a', '#ffd23f', '#e0a020', '#a86a08']
const TOMATO: Ramp = ['#ff9a7a', '#e8341e', '#a81c14', '#6a0e0a']
const PICKLE: Ramp = ['#c8e87a', '#7aa83a', '#4a7a24', '#2a4a14']
const MUSTARD: Ramp = ['#fff3a0', '#ffd02a', '#c89a10', '#7a5a04']

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
    const striped = (ramp: Ramp) => (x: number, _y: number, tone: number) => ((x >= 66 && x <= 75) || (x >= 85 && x <= 94) ? STRIPE[tone] : ramp[tone])
    return {
      parts: [
        ...tyres(26, 134, 58),
        poly([[18, 72], [142, 72], [138, 84], [22, 84]], BLACK),
        poly([[10, 36], [150, 36], [152, 70], [8, 70]], YELLOW, { round: { cx: 80, half: 72 }, paint: striped(YELLOW) }),
        poly([[22, 27], [138, 27], [150, 36], [10, 36]], YELLOW, { paint: striped(YELLOW) }),
        // the ducktail's lip, the pillars, the window between them, the roof
        poly([[9, 26], [151, 26], [153, 29], [7, 29]], YELLOW, { paint: striped(YELLOW) }),
        poly([[52, 8], [108, 8], [113, 26], [47, 26]], GLASS),
        poly([[33, 27], [47, 6], [55, 6], [47, 27]], YELLOW), poly([[127, 27], [113, 6], [105, 6], [113, 27]], YELLOW),
        cap([48, 5], [112, 5], 2.6, YELLOW, { paint: striped(YELLOW) }),
        oval([27, 30], 4.5, 2.8, YELLOW), oval([133, 30], 4.5, 2.8, YELLOW),
        // split lamps, a chrome rim round each
        poly([[15, 42], [39, 42], [39, 54], [15, 54]], CHROME), poly([[17, 44], [37, 44], [37, 52], [17, 52]], LAMP),
        poly([[41, 42], [61, 42], [61, 54], [41, 54]], CHROME), poly([[43, 44], [59, 44], [59, 52], [43, 52]], LAMP),
        poly([[99, 42], [119, 42], [119, 54], [99, 54]], CHROME), poly([[101, 44], [117, 44], [117, 52], [101, 52]], LAMP),
        poly([[121, 42], [145, 42], [145, 54], [121, 54]], CHROME), poly([[123, 44], [143, 44], [143, 52], [123, 52]], LAMP),
        poly([[68, 56], [92, 56], [92, 63], [68, 63]], PLATE),
        cap([12, 67], [148, 67], 3.6, CHROME),
        ...pipe(36, 79, 3.6), ...pipe(124, 79, 3.6),
      ],
      marks: [
        { color: '#9ab0e0', points: [[58, 10], [59, 10], [57, 11], [58, 11], [56, 12], [57, 12], [55, 13], [56, 13], [54, 14], [55, 14], [66, 10], [65, 11], [64, 12]] },
        { color: '#4a4030', points: [[72, 59], [73, 59], [75, 59], [76, 59], [79, 59], [80, 59], [83, 59], [84, 59], [87, 59], [88, 59]] },
      ],
    }
  }
  // the burger
  const grill: Mark = { color: '#2a1408', points: Array.from({ length: 16 }, (_, i) => [[20 + i * 8, 58], [21 + i * 8, 59], [22 + i * 8, 60]] as Pt[]).flat() }
  const lettuce = (): Part => {
    const pts: Pt[] = [[8, 49], [152, 49]]
    for (let x = 152; x >= 8; x -= 3) pts.push([x, 52.5 + (Math.round(x / 3) % 3 === 0 ? 2.2 : Math.round(x / 3) % 3 === 1 ? 0 : 1)])
    return poly(pts, LETTUCE)
  }
  const drips = [26, 44, 63, 97, 118, 134].map((x, i): Part => cap([x, 54], [x + (i % 2 ? 0.4 : -0.4), 57 + (i % 3) * 1.5], 1.9, CHEESE))
  return {
    parts: [
      ...tyres(26, 134, 62),
      oval([80, 72], 66, 12, BUN_LOW),
      // the pickle spoiler on two posts, behind the bun's top
      cap([46, 18], [46, 10], 1.6, BLACK), cap([114, 18], [114, 10], 1.6, BLACK),
      oval([80, 8], 46, 4.2, PICKLE),
      oval([80, 36], 62, 28, BUN),
      poly([[52, 16], [108, 16], [120, 36], [40, 36]], GLASS),
      lettuce(),
      cap([12, 52], [148, 52], 2.2, CHEESE),
      ...drips,
      cap([14, 61], [146, 61], 6.5, PATTY),
      oval([28, 61], 8.5, 5.5, TOMATO), oval([132, 61], 8.5, 5.5, TOMATO),
      poly([[70, 64], [90, 64], [90, 70], [70, 70]], PLATE),
      cap([58, 80], [58, 86], 2.6, RED), cap([102, 80], [102, 86], 2.6, MUSTARD),
    ],
    marks: [
      { color: '#fff6dc', points: [[30, 22], [31, 22], [40, 14], [41, 14], [120, 14], [121, 14], [130, 22], [131, 22], [25, 32], [26, 32], [135, 32], [136, 32]] },
      { color: '#b8742c', points: [[31, 23], [41, 15], [121, 15], [131, 23], [26, 33], [136, 33]] },
      { color: '#9ab0e0', points: [[60, 19], [61, 19], [59, 20], [60, 20], [58, 21], [59, 21], [57, 22], [58, 22], [68, 19], [67, 20], [66, 21]] },
      // the pickle's seeds, the tomatoes' seeds lit when the lamps are on
      { color: '#e8f4b0', points: [[66, 7], [74, 9], [86, 7], [94, 9]] },
      { color: frame % 2 ? '#ffd8a8' : '#ffb488', points: [[25, 60], [28, 63], [31, 60], [129, 60], [132, 63], [135, 60]] },
      grill,
      { color: '#4a4030', points: [[74, 67], [75, 67], [77, 67], [78, 67], [81, 67], [82, 67], [85, 67], [86, 67]] },
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
