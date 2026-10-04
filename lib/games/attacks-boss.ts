/**
 * RANDOM ATTACKS' four bosses, built from shapes (`figure.ts`) at the play
 * screen's fineness, lit from the upper left like the cook: burgers grown
 * into flying saucers, a chrome ring round their middle with portholes that
 * blink, a hatch underneath.
 *
 * - BIG BUN: a cheeseburger, plain and big.
 * - DOUBLE DECKER: two storeys, a club bun between them, the ring at its
 *   middle.
 * - CHEESE QUAKE: wide and flat, its cheese melting down over the ring in
 *   long drips that sway.
 * - MEGA BURGER: three patties, bacon, tomato, a toothpick through its top
 *   with an olive for an antenna; its portholes turn red when it is angry.
 *
 * Bitten where it has been hit: at half its strength a bite out of its top,
 * at a quarter a second one and cracks. Drawn once for each look and kept;
 * the screen stamps them leaving out the key colour.
 */

import type { AttacksBossKind } from './attacks-rules'
import { drawFigure, type Mark, type Part, type Ramp } from './figure'
import { mix, PixelBuffer } from './pixels'

/** The colour a boss's picture leaves out around it. */
export const BOSS_KEY = '#ff00ff'

const BUN: Ramp = ['#ffd890', '#eaa040', '#bb6a1e', '#7a3e10']
const BUN_LOW: Ramp = ['#f0b860', '#d68a34', '#a85a1a', '#6a3410']
const PATTY: Ramp = ['#a8663a', '#7a4320', '#512a12', '#331a0a']
const LETTUCE: Ramp = ['#b4f078', '#7ad04a', '#3f9a2c', '#246018']
const CHEESE: Ramp = ['#fff28a', '#ffd23f', '#e0a020', '#a86a08']
const TOMATO: Ramp = ['#ff9a7a', '#e8341e', '#a81c14', '#6a0e0a']
const BACON: Ramp = ['#ff9a8a', '#c8323a', '#8a1a22', '#5a0e14']
const CHROME: Ramp = ['#f4f8ff', '#b4c0d4', '#717e98', '#3a4258']
const WOOD: Ramp = ['#f8e2b0', '#d8b47a', '#a8844a', '#6a5028']
const OLIVE: Ramp = ['#9ad86a', '#5a9a3a', '#3a6a24', '#20401a']
const SESAME = '#fff6dc', SESAME_SHADE = '#b8742c'

/** Each boss's picture: its size, and where its middle is (the point the rules move). */
export const BOSS_SIZE: Record<AttacksBossKind, { w: number; h: number; cx: number; cy: number }> = {
  1: { w: 78, h: 46, cx: 39, cy: 24 },
  2: { w: 78, h: 60, cx: 39, cy: 31 },
  3: { w: 92, h: 50, cx: 46, cy: 24 },
  4: { w: 114, h: 74, cx: 57, cy: 40 },
}

type Pt = readonly [number, number]
const oval = (c: Pt, rx: number, ry: number, ramp: Ramp, more: Partial<Part> = {}): Part => ({ shape: { kind: 'ellipse', c, rx, ry }, ramp, ...more })
const cap = (a: Pt, b: Pt, r: number, ramp: Ramp, more: Partial<Part> = {}): Part => ({ shape: { kind: 'capsule', a, b, ra: r, rb: r }, ramp, ...more })
const poly = (points: Pt[], ramp: Ramp, more: Partial<Part> = {}): Part => ({ shape: { kind: 'poly', points }, ramp, ...more })

/** Lettuce: a band from `x0` to `x1` at `y`, its edges curled, frilled below and a little out at both ends. */
function lettuce(x0: number, x1: number, y: number, deep: number): Part {
  const pts: Pt[] = [[x0 - 1, y + 1], [x0 + 2, y - 0.5]]
  for (let x = x0 + 5; x < x1 - 2; x += 5) pts.push([x, y - (Math.round(x / 5) % 2 ? 0.4 : -0.2)])
  pts.push([x1 - 2, y - 0.5], [x1 + 1, y + 1])
  for (let x = x1; x >= x0; x -= 2.5) { const k = Math.round(x / 2.5) % 3; pts.push([x, y + deep + (k === 0 ? 2.4 : k === 1 ? 0.2 : 1.2)]) }
  return poly(pts, LETTUCE)
}
/** Cheese: a slice from `x0` to `x1` at `y`, its corners out, and drops running down from it, `long` the longer. */
function cheese(x0: number, x1: number, y: number, drips: number[], long = 0): Part[] {
  const slab = poly([[x0 - 3, y + 0.5], [x0, y], [x1, y], [x1 + 3, y + 0.5], [x1 + 2, y + 2.5], [x0 - 2, y + 2.5]], CHEESE)
  return [slab, ...drips.map((dx, i): Part => {
    const len = 2.5 + long + ((i * 7 + Math.round(dx)) % 4)
    return { shape: { kind: 'capsule', a: [dx, y + 1.5], b: [dx + (i % 2 ? 0.4 : -0.4), y + 1.5 + len], ra: 1.9, rb: 1.5 + (i % 3) * 0.25 }, ramp: CHEESE }
  })]
}
/** The front of the chrome ring, passing before the burger: the lower half of its ellipse, a band `thick` deep at the front. */
function ringFront(cx: number, cy: number, rx: number, ry: number, thick: number): Part {
  const pts: Pt[] = []
  for (let a = 0; a <= Math.PI + 1e-6; a += Math.PI / 24) pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  for (let a = Math.PI; a >= -1e-6; a -= Math.PI / 24) pts.push([cx + rx * Math.cos(a), cy + (ry - thick) * Math.sin(a)])
  return poly(pts, CHROME)
}
/** Grill marks across a patty from `x0` to `x1`, its middle at `y`. */
const grill = (x0: number, x1: number, y: number): Mark => ({ color: '#2a1408', points: Array.from({ length: Math.floor((x1 - x0) / 7) }, (_, i) => [[x0 + 4 + i * 7, y - 1], [x0 + 5 + i * 7, y], [x0 + 6 + i * 7, y + 1]] as Pt[]).flat() })
/** Portholes along the ring's front band, at `y` from its middle `cx`: `n` of them each side of the middle, `gap` apart. */
const holes = (cx: number, y: number, rx: number, ry: number, n: number, gap: number): Pt[] => {
  const out: Pt[] = []
  for (let i = -n; i <= n; i += 1) { const x = cx + i * gap; const u = (x - cx) / rx; if (Math.abs(u) < 0.92) out.push([Math.round(x), Math.round(y + ry * Math.sqrt(1 - u * u) - 1.5)]) }
  return out
}
/** Sesame seeds over a dome: a light seed with its shadow under it. */
function sesame(points: Pt[]): Mark[] {
  return [{ color: SESAME, points: points.flatMap(([x, y]) => [[x, y], [x + 1, y]] as Pt[]) }, { color: SESAME_SHADE, points: points.map(([x, y]) => [x + 1, y + 1] as Pt) }]
}
/** Portholes along the ring's front: lit in turn, red when angry. */
function portholes(points: Pt[], frame: number, angry: boolean): Mark[] {
  const core = angry ? '#ffd0c0' : '#fff6c0', on = angry ? '#ff3a2a' : '#ffb43a', off = angry ? '#7a1a1a' : '#5a4a6a'
  const lit = points.filter((_, i) => (i + frame) % 2 === 0), dark = points.filter((_, i) => (i + frame) % 2 === 1)
  const square = (list: Pt[]) => list.flatMap(([x, y]) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] as Pt[])
  return [{ color: on, points: square(lit) }, { color: core, points: lit }, { color: off, points: square(dark) }]
}
/** Bites taken out of its top where it was hit: erased ellipses. */
const bites = (list: Array<[number, number, number]>): Part[] => list.map(([x, y, r]) => ({ shape: { kind: 'ellipse', c: [x, y], rx: r, ry: r * 0.85 }, ramp: BUN, erase: true }))

function bigBun(frame: number, damage: number, angry: boolean): { parts: Part[]; marks: Mark[] } {
  const parts: Part[] = [
    oval([39, 30], 38, 7, CHROME),
    oval([39, 21], 30, 18, BUN),
    oval([39, 36], 27, 7.5, BUN_LOW),
    cap([14, 29], [64, 29], 5, PATTY),
    ...cheese(11, 67, 24, [19, 33, 49, 60]),
    lettuce(9, 69, 20, 3),
    ringFront(39, 30, 38, 7, 4),
  ]
  if (damage >= 1) parts.push(...bites([[61, 8, 5]]))
  if (damage >= 2) parts.push(...bites([[15, 10, 4.5], [44, 3, 3.5]]))
  const marks: Mark[] = [
    ...sesame([[26, 8], [36, 5], [46, 7], [31, 13], [42, 12], [53, 12], [21, 14]]),
    grill(14, 64, 30),
    ...portholes(holes(39, 30, 38, 7, 3, 11), frame, angry),
  ]
  if (damage >= 2) marks.push({ color: '#7a3e10', points: [[30, 9], [31, 10], [31, 11], [32, 12], [50, 6], [51, 7], [50, 8]] })
  return { parts, marks }
}

function doubleDecker(frame: number, damage: number, angry: boolean): { parts: Part[]; marks: Mark[] } {
  const parts: Part[] = [
    oval([39, 34], 38, 7, CHROME),
    oval([39, 17], 29, 16, BUN),
    oval([39, 51], 27, 7, BUN_LOW),
    cap([14, 26], [64, 26], 4.5, PATTY),
    ...cheese(12, 66, 21.5, [20, 40, 58]),
    lettuce(10, 68, 17, 3),
    cap([13, 34], [65, 34], 4, BUN_LOW),
    cap([14, 44], [64, 44], 4.5, PATTY),
    ...cheese(12, 66, 39, [24, 46, 56], 1),
    ringFront(39, 34, 38, 7, 4),
  ]
  if (damage >= 1) parts.push(...bites([[16, 6, 5]]))
  if (damage >= 2) parts.push(...bites([[60, 8, 4.5], [40, 2, 3.5]]))
  const marks: Mark[] = [
    ...sesame([[27, 6], [37, 3], [48, 5], [32, 10], [44, 10], [54, 11], [22, 12]]),
    grill(14, 64, 27), grill(14, 64, 45),
    ...portholes(holes(39, 34, 38, 7, 3, 11), frame, angry),
    // the hatch the sliders come out of
    { color: '#1a1020', points: [[33, 57], [34, 57], [35, 57], [36, 57], [37, 57], [38, 57], [39, 57], [40, 57], [41, 57], [42, 57], [43, 57], [44, 57], [45, 57]] },
    { color: frame % 2 ? '#ffb040' : '#ff7a2a', points: [[35, 58], [36, 58], [37, 58], [38, 58], [39, 58], [40, 58], [41, 58], [42, 58], [43, 58]] },
  ]
  if (damage >= 2) marks.push({ color: '#7a3e10', points: [[45, 4], [46, 5], [46, 6], [47, 7], [26, 9], [27, 10]] })
  return { parts, marks }
}

function cheeseQuake(frame: number, damage: number, angry: boolean): { parts: Part[]; marks: Mark[] } {
  const sway = frame % 2
  const parts: Part[] = [
    oval([46, 28], 45, 7, CHROME),
    oval([46, 20], 37, 16, BUN),
    oval([46, 35], 33, 7, BUN_LOW),
    cap([15, 27], [77, 27], 5, PATTY),
    lettuce(10, 82, 18, 3),
    ringFront(46, 28, 45, 7, 4),
    // the cheese melting over everything, the ring too: a slab, drops, long runs that sway
    ...cheese(9, 83, 22, [14, 24, 37, 52, 66, 78], 2),
    ...[17, 31, 45, 61, 75].map((x, i): Part => ({ shape: { kind: 'capsule', a: [x, 25], b: [x + ((i + sway) % 2 ? 1.2 : -1.2), 38 + (i % 3) * 3], ra: 2.2, rb: 1.7 }, ramp: CHEESE })),
  ]
  if (damage >= 1) parts.push(...bites([[73, 9, 5.5]]))
  if (damage >= 2) parts.push(...bites([[20, 9, 5], [50, 4, 4]]))
  const marks: Mark[] = [
    ...sesame([[30, 8], [40, 5], [52, 5], [62, 8], [35, 12], [47, 11], [58, 12], [25, 13], [68, 13]]),
    ...portholes(holes(46, 28, 45, 7, 3, 14).filter(([x]) => ![17, 31, 45, 61, 75].some((d) => Math.abs(d - x) < 4)), frame, angry),
    { color: '#fff7b0', points: [[17, 23], [18, 23], [31, 23], [47, 23], [48, 23], [61, 23], [75, 23]] },
  ]
  if (damage >= 2) marks.push({ color: '#7a3e10', points: [[36, 7], [37, 8], [37, 9], [38, 10], [64, 5], [65, 6]] })
  return { parts, marks }
}

function megaBurger(frame: number, damage: number, angry: boolean): { parts: Part[]; marks: Mark[] } {
  const stripes = (x: number, _y: number, tone: number) => ((x + 2) % 7 < 2 ? mix(BACON[tone], '#f6c8b0', 0.6) : BACON[tone])
  const parts: Part[] = [
    oval([57, 47], 55, 8, CHROME),
    // the toothpick and its olive
    cap([71, 3], [64, 22], 1.3, WOOD),
    oval([72, 5], 4.5, 4.2, OLIVE),
    oval([57, 27], 44, 20, BUN),
    oval([57, 63], 40, 9, BUN_LOW),
    cap([18, 55], [96, 55], 5, PATTY),
    cap([18, 46], [96, 46], 5, PATTY),
    ...cheese(15, 99, 49.5, [26, 44, 70, 88], 1),
    cap([18, 38], [96, 38], 5, PATTY),
    ...cheese(15, 99, 41.5, [32, 58, 80]),
    poly([[13, 32], [101, 32], [100, 36.5], [14, 36.5]], BACON, { paint: stripes }),
    cap([20, 29.5], [94, 29.5], 3, TOMATO),
    lettuce(12, 102, 25, 3),
    ringFront(57, 47, 55, 8, 4.5),
  ]
  if (damage >= 1) parts.push(...bites([[92, 15, 6]]))
  if (damage >= 2) parts.push(...bites([[22, 17, 5.5], [50, 8, 4.5]]))
  const marks: Mark[] = [
    { color: '#e0301e', points: [[71, 4], [72, 4], [71, 5], [72, 5]] },
    ...sesame([[36, 14], [46, 11], [58, 9], [80, 13], [41, 19], [53, 16], [65, 17], [76, 19], [30, 20], [86, 20]]),
    grill(18, 96, 39), grill(18, 96, 47), grill(18, 96, 56),
    ...portholes(holes(57, 47, 55, 8, 4, 12), frame, angry),
    { color: '#1a1020', points: Array.from({ length: 17 }, (_, i) => [49 + i, 71] as Pt) },
    { color: frame % 2 ? '#ffb040' : '#ff7a2a', points: Array.from({ length: 13 }, (_, i) => [51 + i, 72] as Pt) },
  ]
  if (damage >= 2) marks.push({ color: '#7a3e10', points: [[60, 12], [61, 13], [61, 14], [62, 15], [36, 18], [37, 19], [70, 20], [71, 21]] })
  return { parts, marks }
}

const BUILD: Record<AttacksBossKind, (frame: number, damage: number, angry: boolean) => { parts: Part[]; marks: Mark[] }> = { 1: bigBun, 2: doubleDecker, 3: cheeseQuake, 4: megaBurger }

const cache = new Map<string, PixelBuffer>()
/**
 * A boss's picture: `damage` 0, 1 or 2 (bitten at half its strength, at a
 * quarter), `frame` for its blinking portholes, `angry` its portholes red,
 * `flash` whitened by a hit. One pixel of room all round for the ink.
 */
export function bossPicture(kind: AttacksBossKind, damage: number, frame: number, angry = false, flash = false): PixelBuffer {
  const key = `${kind}|${damage}|${frame % 2}|${angry ? 1 : 0}|${flash ? 1 : 0}`
  let out = cache.get(key)
  if (out) return out
  const { w, h } = BOSS_SIZE[kind]
  out = new PixelBuffer(w + 2, h + 2, BOSS_KEY)
  const { parts, marks } = BUILD[kind](frame % 2, damage, angry)
  drawFigure(out, 1, 1, w, h, parts, marks)
  if (flash) {
    const d = out.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) continue
      d[i] = Math.round(d[i] + (255 - d[i]) * 0.65); d[i + 1] = Math.round(d[i + 1] + (255 - d[i + 1]) * 0.65); d[i + 2] = Math.round(d[i + 2] + (255 - d[i + 2]) * 0.65)
    }
  }
  cache.set(key, out)
  return out
}
