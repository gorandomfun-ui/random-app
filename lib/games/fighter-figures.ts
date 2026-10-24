/**
 * RANDOM FIGHTER's people, built from shapes (`figure.ts`) at any size: the
 * fighter — barefoot in a white gi, a black belt, a headband in the site's
 * colour — on guard, punching, kicking, stepping, knocked back; and the
 * burgers he fights: the burger ninja (a black mask across his bun, a
 * sesame-seed star in his hand), the burger samurai (bigger, a helmet with
 * its golden horns, a sword), the little burger that rolls along the floor.
 * Each faces right; `flip` turns it round. A first proposal, to be looked at.
 */

import { along, drawFigure, type Mark, type Part, type Ramp } from './figure'
import { mix, PixelBuffer } from './pixels'

type Pt = readonly [number, number]

const SKIN: Ramp = ['#ffe0c4', '#f6c39b', '#d8946c', '#a85c3c']
const GI: Ramp = ['#ffffff', '#f1ece2', '#c9c0b6', '#968aa4']
const BELT: Ramp = ['#4a4a58', '#26262f', '#16161c', '#0a0a0f']
const HAIR: Ramp = ['#4a3a34', '#2a1e1a', '#1a1210', '#0c0806']
const BUN: Ramp = ['#ffd08a', '#e8a24a', '#b8742a', '#7a4a18']
const PATTY: Ramp = ['#a8653f', '#6e3a22', '#4a2414', '#2a1208']
const CHEESE: Ramp = ['#fff2a0', '#ffd23a', '#d8a018', '#8a6410']
const LETTUCE: Ramp = ['#a8f06a', '#5ac83a', '#2e8a26', '#1a5a18']
const TOMATO: Ramp = ['#ff8a78', '#e2402e', '#a8261a', '#64140c']
const MASK: Ramp = ['#5a5a6a', '#33333f', '#1e1e28', '#101016']
const WHITE: Ramp = ['#ffffff', '#f4f2ee', '#d2ccc6', '#a8a0a8']
const ARMOUR: Ramp = ['#ff7a6a', '#c8283a', '#8a1626', '#520c16']
const GOLD: Ramp = ['#fff2a8', '#f2c43e', '#c49218', '#7a5a10']
const STEEL: Ramp = ['#ffffff', '#dfe6ee', '#a8b4c4', '#6a7486']
const HAKAMA: Ramp = ['#6a78c8', '#3a4686', '#26305e', '#141a34']
const SHOE: Ramp = ['#6a5a54', '#3a2a26', '#24181a', '#140c0e']
const INKY = '#1a0c0a'

/** A colour's four tones under the light: lit, itself, in shade, in deep shade. */
const rampOf = (c: string): Ramp => [mix(c, '#ffffff', 0.45), c, mix(c, '#000000', 0.3), mix(c, '#000000', 0.55)]

/** Parts and marks laid out in units, drawn `s` pixels a unit. */
function builder(s: number) {
  const P = ([x, y]: Pt): Pt => [x * s, y * s]
  return {
    cap: (a: Pt, b: Pt, ra: number, rb: number, ramp: Ramp, line?: boolean): Part => ({ shape: { kind: 'capsule', a: P(a), b: P(b), ra: ra * s, rb: rb * s }, ramp, line }),
    oval: (c: Pt, rx: number, ry: number, ramp: Ramp, turn = 0): Part => ({ shape: { kind: 'ellipse', c: P(c), rx: rx * s, ry: ry * s, turn }, ramp }),
    poly: (points: Pt[], ramp: Ramp, line?: boolean): Part => ({ shape: { kind: 'poly', points: points.map(P) }, ramp, line }),
    body: (points: Pt[], ramp: Ramp, cx: number, half: number): Part => ({ shape: { kind: 'poly', points: points.map(P) }, ramp, round: { cx: cx * s, half: half * s } }),
    mark: (color: string, points: Pt[]): Mark => ({ color, points: points.map(P) }),
    line: (color: string, a: Pt, b: Pt): Mark => ({ color, points: along(P(a), P(b), 0.5) }),
  }
}

// ---------------------------------------------------------------- the fighter

export type FighterPose = 'guard' | 'punch' | 'kick' | 'step' | 'hit'
/** The fighter's box, in units: his feet on its bottom row. */
export const FIGHTER_BOX = { width: 80, height: 100 }

/**
 * The fighter at `x`, `y` (his box's top left), `s` pixels a unit, in a
 * pose; his headband in `accent`, its ends flying; he breathes on guard.
 */
export function drawFighter(buffer: PixelBuffer, x: number, y: number, s: number, pose: FighterPose, frame: number, accent: string, flip = false): void {
  const b = builder(s), band = rampOf(accent)
  const breathe = pose === 'guard' ? ((frame >> 1) % 2) * 0.6 : 0
  const lean = pose === 'hit' ? -5 : pose === 'kick' ? -3 : pose === 'punch' ? 2 : 0
  const T = (p: Pt): Pt => [p[0] + lean * (1 - p[1] / 100), p[1] + (p[1] < 62 ? breathe : 0)]
  const flutter = Math.sin(frame * 1.3) * 2
  const parts: Part[] = []
  const marks: Mark[] = []
  // the far arm: on guard by the face, pulled back to the hip when the near one punches
  if (pose === 'punch') parts.push(b.cap(T([33, 31]), T([31, 45]), 4.6, 4, GI), b.cap(T([31, 45]), T([36, 50]), 4, 3.6, GI), b.oval(T([39, 50]), 3.6, 3.4, SKIN))
  else if (pose === 'hit') parts.push(b.cap(T([33, 31]), T([24, 38]), 4.6, 4, GI), b.cap(T([24, 38]), T([19, 30]), 3.6, 3.2, SKIN), b.oval(T([18, 28]), 3.4, 3.2, SKIN))
  else parts.push(b.cap(T([33, 31]), T([39, 45]), 4.6, 4, GI), b.cap(T([39, 45]), T([44, 41]), 4, 3.6, GI), b.cap(T([44, 41]), T([49, 35]), 3.4, 3, SKIN), b.oval(T([51, 33]), 3.6, 3.4, SKIN))
  // the legs in the gi's trousers, barefoot: the far one behind
  const step = pose === 'step' ? ((frame >> 1) % 2 ? 4 : -4) : 0
  if (pose === 'kick') {
    parts.push(b.cap(T([36, 60]), [31, 78], 7, 6, GI), b.cap([31, 78], [29, 94], 6, 5, GI), b.oval([26, 97], 6, 2.8, SKIN))
    parts.push(b.cap(T([44, 58]), T([57, 52]), 7.5, 6.4, GI), b.cap(T([57, 52]), T([71, 50]), 6.2, 5.2, GI), b.oval(T([75, 50]), 3, 5.4, SKIN))
  } else {
    parts.push(b.cap(T([34, 60]), [24 + step, 77], 7, 6, GI), b.cap([24 + step, 77], [17 + step, 94], 6, 5, GI), b.oval([14 + step, 97], 6, 2.8, SKIN))
    parts.push(b.cap(T([44, 60]), [55 - step, 76], 7.5, 6.2, GI), b.cap([55 - step, 76], [59 - step, 94], 6.2, 5.2, GI), b.oval([64 - step, 97], 6.5, 3, SKIN))
  }
  // the jacket, its skirt below the belt, the belt and its knot
  parts.push(b.body([T([30, 27]), T([49, 26]), T([52, 44]), T([51, 60]), T([29, 60]), T([28, 44])], GI, 40 + lean * 0.5, 13))
  parts.push(b.poly([T([29, 59]), T([51, 59]), T([53, 67]), T([27, 67])], GI))
  parts.push(b.poly([T([28, 56]), T([52, 56]), T([52, 61]), T([28, 61])], BELT), b.oval(T([38, 58.5]), 3, 2.6, BELT), b.cap(T([38, 60]), T([35, 68]), 1.6, 1.4, BELT), b.cap(T([39, 60]), T([42, 68]), 1.6, 1.4, BELT))
  // the head: the neck, the face, the hair, the ear, the headband and its ends
  parts.push(b.cap(T([40, 22]), T([40, 27]), 3.6, 3.6, SKIN))
  parts.push(b.oval(T([42, 15]), 8, 9, SKIN))
  parts.push(b.oval(T([41, 8.6]), 8.8, 4.6, HAIR), b.oval(T([35.5, 13.5]), 3.8, 5.6, HAIR))
  parts.push(b.oval(T([37.5, 16]), 1.8, 2.4, SKIN), b.oval(T([49.6, 17]), 1.7, 2, SKIN))
  parts.push(b.poly([T([32.5, 10.5]), T([49.5, 10.5]), T([49.5, 13.8]), T([32.5, 13.8])], band))
  parts.push(b.cap(T([33, 12]), T([23, 16 + flutter]), 1.8, 1.4, band), b.cap(T([33, 12.5]), T([24, 21 + flutter * 0.6]), 1.5, 1.2, band))
  // the near arm: on guard before the chin, out in a punch, up before the face when hit
  if (pose === 'punch') parts.push(b.cap(T([47, 30]), T([58, 31]), 5, 4.4, GI), b.cap(T([58, 31]), T([63, 31]), 4.2, 4, GI), b.cap(T([63, 31]), T([68, 31]), 3.3, 3.2, SKIN), b.oval(T([71.5, 31]), 4, 3.8, SKIN))
  else if (pose === 'hit') parts.push(b.cap(T([47, 30]), T([52, 41]), 5, 4.4, GI), b.cap(T([52, 41]), T([50, 30]), 3.6, 3.2, SKIN), b.oval(T([50, 27]), 3.6, 3.4, SKIN))
  else parts.push(b.cap(T([47, 30]), T([54, 42]), 5, 4.4, GI), b.cap(T([54, 42]), T([57, 37]), 4.2, 4, GI), b.cap(T([57, 37]), T([60, 30]), 3.4, 3.2, SKIN), b.oval(T([61.5, 28]), 3.8, 3.6, SKIN))
  // the face: an eye, a brow, the mouth (open when hit); the gi's lapels and a fold
  const eye = pose === 'hit' ? [T([44.5, 15]), T([46, 15.6]), T([46, 14.4]), T([45.2, 15.3])] : [T([45, 15]), T([46, 15]), T([45, 16]), T([46, 16]), T([45.5, 15.5])]
  marks.push(b.mark(INKY, eye))
  marks.push(b.line(INKY, T([42.8, 14.2]), T([47.4, 14.6])), b.line(INKY, T([43, 14.7]), T([47, 15])))
  marks.push(pose === 'hit' ? b.mark('#7a2a1a', [T([46, 19.5]), T([46.6, 19.5]), T([46, 20.3]), T([46.6, 20.3])]) : b.line('#a85c3c', T([44.5, 20]), T([47, 19.6])))
  marks.push(b.line('#bdb3a8', T([46, 27]), T([40, 45])), b.line('#bdb3a8', T([34, 27]), T([40, 45])), b.line('#d8d0c4', T([33, 47]), T([36, 54])))
  drawFigure(buffer, Math.round(x), Math.round(y), Math.ceil(FIGHTER_BOX.width * s), Math.ceil(FIGHTER_BOX.height * s), parts, marks, flip)
}

// ---------------------------------------------------------------- the burgers

export type FoeKind = 'ninja' | 'samurai' | 'mini'
/** Each burger's box, in units: its feet on its bottom row. */
export const FOE_BOX: Record<FoeKind, { width: number; height: number }> = { ninja: { width: 70, height: 76 }, samurai: { width: 92, height: 96 }, mini: { width: 34, height: 30 } }

/** A burger from the bottom bun up, `cx` across, `top` the top of its bun, `w` its half width: the bun, the patty, the cheese dripping, the lettuce, the top bun. */
function burger(b: ReturnType<typeof builder>, cx: number, top: number, w: number, tomato = false): Part[] {
  const h = w * 0.62, base = top + h * 2.1
  const parts: Part[] = []
  parts.push(b.oval([cx, base], w * 0.95, h * 0.34, BUN))
  parts.push(b.oval([cx, base - h * 0.26], w * 1.02, h * 0.27, PATTY))
  if (tomato) parts.push(b.oval([cx, base - h * 0.48], w * 0.98, h * 0.12, TOMATO))
  const cheese: Pt[] = [[cx - w * 0.95, base - h * 0.5], [cx + w * 0.95, base - h * 0.5]]
  for (let k = 0; k <= 8; k += 1) cheese.push([cx + w * 0.86 - (k * w * 1.72) / 8, base - h * (k % 2 ? 0.2 : 0.42)])
  parts.push(b.poly(cheese, CHEESE))
  const leaf: Pt[] = [[cx - w * 1.08, base - h * 0.58], [cx + w * 1.08, base - h * 0.58]]
  for (let k = 0; k <= 10; k += 1) leaf.push([cx + w * 1.08 - (k * w * 2.16) / 10, base - h * (k % 2 ? 0.44 : 0.52)])
  parts.push(b.poly(leaf, LETTUCE))
  parts.push(b.oval([cx, top + h * 0.98], w, h * 0.98, BUN))
  return parts
}
/** Seeds on a top bun. */
const seeds = (b: ReturnType<typeof builder>, cx: number, top: number, w: number): Mark => b.mark('#fff4d8', ([[-0.5, 0.35], [-0.12, 0.2], [0.3, 0.28], [0.58, 0.5], [-0.72, 0.62], [0.05, 0.5]] as const).map(([u, v]) => [cx + u * w, top + v * w * 0.62] as Pt))

/** A burger at `x`, `y` (its box's top left), `s` pixels a unit; walking (`frame`), throwing, struck. */
export function drawFoe(buffer: PixelBuffer, x: number, y: number, s: number, kind: FoeKind, frame: number, flip = false, pose: 'walk' | 'strike' | 'hit' = 'walk'): void {
  const b = builder(s)
  const parts: Part[] = [], marks: Mark[] = []
  const stride = pose === 'walk' ? ((frame >> 1) % 2 ? 2.4 : -2.4) : 0
  if (kind === 'mini') {
    // the little one: no arms, two short legs, rolling along with a hop
    const hop = (frame >> 1) % 2 ? -1.5 : 0
    parts.push(b.cap([12, 22 + hop], [11 - stride * 0.5, 27], 1.8, 1.8, SHOE), b.cap([22, 22 + hop], [23 + stride * 0.5, 27], 1.8, 1.8, SHOE))
    parts.push(...burger(b, 17, 4 + hop, 13))
    marks.push(seeds(b, 17, 4 + hop, 13))
    parts.push(b.oval([20, 11 + hop], 2.2, 2.4, WHITE), b.oval([26, 11 + hop], 2.2, 2.4, WHITE))
    marks.push(b.mark(INKY, [[21, 11.5 + hop], [27, 11.5 + hop]]), b.line(INKY, [18.5, 8.4 + hop], [22, 9.4 + hop]), b.line(INKY, [24.5, 9.4 + hop], [28, 8.4 + hop]))
    drawFigure(buffer, Math.round(x), Math.round(y), Math.ceil(FOE_BOX.mini.width * s), Math.ceil(FOE_BOX.mini.height * s), parts, marks, flip)
    return
  }
  const big = kind === 'samurai'
  const box = FOE_BOX[kind]
  const cx = big ? 42 : 32, w = big ? 28 : 22, top = big ? 22 : 18
  const base = top + w * 0.62 * 2.1
  const sleeve = big ? ARMOUR : MASK
  const recoil = pose === 'hit' ? -3 : 0
  // the far arm, the legs (a samurai's in his wide trousers), the shoes
  parts.push(b.cap([cx - w * 0.75, base - 14], [cx - w - 6, base - 6], 2.8, 2.6, sleeve), b.oval([cx - w - 7, base - 5], 3.2, 3, WHITE))
  if (big) parts.push(b.poly([[cx - 16, base + 1], [cx + 16, base + 1], [cx + 20, box.height - 6], [cx - 20, box.height - 6]], HAKAMA))
  else parts.push(b.cap([cx - 7, base + 2], [cx - 9 - stride, box.height - 6], 3, 3, MASK), b.cap([cx + 7, base + 2], [cx + 9 + stride, box.height - 6], 3, 3, MASK))
  parts.push(b.oval([cx - (big ? 14 : 11) - stride, box.height - 3.5], 5, 2.6, SHOE), b.oval([cx + (big ? 16 : 13) + stride, box.height - 3.5], 5, 2.6, SHOE))
  // the burger itself
  parts.push(...burger(b, cx + recoil, top, w, big))
  marks.push(seeds(b, cx + recoil, top, w))
  const eyeY = top + w * 0.62 * 1.05
  if (big) {
    // the samurai's helmet over his bun: the bowl, its brim flaring, the golden horns; a thick moustache
    parts.push(b.oval([cx + recoil, top + 6], w * 0.86, 10, ARMOUR))
    parts.push(b.poly([[cx - w - 4 + recoil, top + 13], [cx + w + 4 + recoil, top + 13], [cx + w * 0.8 + recoil, top + 8], [cx - w * 0.8 + recoil, top + 8]], ARMOUR))
    parts.push(b.cap([cx - 2 + recoil, top - 2], [cx - 12 + recoil, top - 18], 2, 1.2, GOLD), b.cap([cx + 2 + recoil, top - 2], [cx + 12 + recoil, top - 18], 2, 1.2, GOLD), b.oval([cx + recoil, top - 1], 3.4, 3, GOLD))
    parts.push(b.oval([cx + 7 + recoil, eyeY], 3.6, 2.8, WHITE), b.oval([cx + 17 + recoil, eyeY], 3.6, 2.8, WHITE))
    marks.push(b.mark(INKY, [[cx + 8 + recoil, eyeY + 0.6], [cx + 18 + recoil, eyeY + 0.6], [cx + 9 + recoil, eyeY + 0.6], [cx + 19 + recoil, eyeY + 0.6]]))
    marks.push(b.line(INKY, [cx + 3 + recoil, eyeY - 4.6], [cx + 10 + recoil, eyeY - 2.4]), b.line(INKY, [cx + 14 + recoil, eyeY - 2.4], [cx + 21 + recoil, eyeY - 4.6]))
    parts.push(b.cap([cx + 6 + recoil, eyeY + 6], [cx + 12 + recoil, eyeY + 5], 1.8, 1.4, HAIR), b.cap([cx + 13 + recoil, eyeY + 5], [cx + 19 + recoil, eyeY + 6], 1.4, 1.8, HAIR))
  } else {
    // the ninja's mask across his bun, its knot's ends flying, his eyes in it
    const fly = Math.sin(frame * 1.4) * 2
    parts.push(b.poly([[cx - w * 0.97 + recoil, eyeY - 4], [cx + w * 0.97 + recoil, eyeY - 4], [cx + w * 0.98 + recoil, eyeY + 4], [cx - w * 0.98 + recoil, eyeY + 4]], MASK))
    parts.push(b.cap([cx - w + 1 + recoil, eyeY - 1], [cx - w - 8 + recoil, eyeY + 2 + fly], 1.8, 1.3, MASK), b.cap([cx - w + 1 + recoil, eyeY], [cx - w - 7 + recoil, eyeY + 7 + fly * 0.6], 1.5, 1.1, MASK))
    parts.push(b.oval([cx + 5 + recoil, eyeY], 3, 2.4, WHITE), b.oval([cx + 14 + recoil, eyeY], 3, 2.4, WHITE))
    marks.push(b.mark(INKY, [[cx + 6 + recoil, eyeY + 0.5], [cx + 15 + recoil, eyeY + 0.5]]))
    marks.push(b.line(INKY, [cx + 2 + recoil, eyeY - 3.2], [cx + 7.5 + recoil, eyeY - 1.8]), b.line(INKY, [cx + 11.5 + recoil, eyeY - 1.8], [cx + 17 + recoil, eyeY - 3.2]))
  }
  // the near arm: a sesame star in the ninja's glove, the samurai's sword up or striking
  const reach = pose === 'strike' ? 6 : 0
  parts.push(b.cap([cx + w * 0.75, base - 14], [cx + w + 5 + reach, base - 18 - reach * 0.5], 2.8, 2.6, sleeve), b.oval([cx + w + 7 + reach, base - 19 - reach * 0.5], 3.2, 3, WHITE))
  if (big) {
    const hx = cx + w + 8 + reach, hy = base - 20 - reach * 0.5
    const tip: Pt = pose === 'strike' ? [hx + 24, hy + 8] : [hx + 10, hy - 30]
    parts.push(b.cap([hx - 3, hy + 3], [hx + 2, hy - 2], 1.6, 1.6, MASK), b.oval([hx + 2.5, hy - 2.5], 2.6, 1.2, GOLD, pose === 'strike' ? 0.3 : -0.9))
    parts.push(b.poly([[hx + 3, hy - 3], [tip[0] - 1, tip[1] - 1], tip, [hx + 4.4, hy - 1.6]], STEEL))
  } else if (pose !== 'hit') {
    const sx = cx + w + 9 + reach, sy = base - 23 - reach * 0.5, turn = (frame % 4) * 0.4
    const star: Pt[] = Array.from({ length: 8 }, (_, k) => { const a = turn + (k * Math.PI) / 4, r = k % 2 ? 1.4 : 4; return [sx + Math.cos(a) * r, sy + Math.sin(a) * r] as Pt })
    parts.push(b.poly(star, STEEL))
  }
  drawFigure(buffer, Math.round(x), Math.round(y), Math.ceil(box.width * s), Math.ceil(box.height * s), parts, marks, flip)
}

/** A sesame-seed star flying, spinning: a small four-pointed steel star with a seed at its heart. */
export function drawStar(buffer: PixelBuffer, cx: number, cy: number, r: number, frame: number): void {
  const b = builder(1), turn = frame * 0.7
  const star: Pt[] = Array.from({ length: 8 }, (_, k) => { const a = turn + (k * Math.PI) / 4, rr = k % 2 ? r * 0.35 : r; return [r + 1 + Math.cos(a) * rr, r + 1 + Math.sin(a) * rr] as Pt })
  drawFigure(buffer, Math.round(cx - r - 1), Math.round(cy - r - 1), Math.ceil(r * 2 + 3), Math.ceil(r * 2 + 3), [b.poly(star, STEEL), b.oval([r + 1, r + 1], r * 0.28, r * 0.2, BUN)])
}
