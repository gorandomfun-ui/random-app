/**
 * RANDOM EATER's eater walking on his street, for the title: seen from the
 * side, built from shapes (`figure.ts`) in the game eater's colours — brown
 * hair, his shirt in the theme's colour on top, under it the striped piece
 * of his body (his two parts, one over the other), jeans, cream sneakers
 * with red. He walks in four steps, his far arm swinging, his near hand
 * holding a burger to his mouth; he bites every other step.
 */

import { drawFigure, type Mark, type Part, type Ramp } from './figure'
import { dim, mix, PixelBuffer } from './pixels'

const HAIR: Ramp = ['#7a4a2a', '#4a2814', '#32190c', '#1e0e06']
const SKIN: Ramp = ['#ffdcb8', '#f2c29a', '#d49a70', '#a86a48']
const JEANS: Ramp = ['#6a8ae0', '#3f63c8', '#2c4796', '#1c2e66']
const SHOE: Ramp = ['#ffffff', '#f8f5e6', '#cfc8b8', '#8a8a82']
const SOLE: Ramp = ['#b8b8b0', '#8a8a82', '#5e5e58', '#3a3a36']
const CLOTH: Ramp = ['#ff6a7a', '#e0304a', '#a81c34', '#6a0e20']
const PRINT: Ramp = ['#fff2a0', '#ffd23f', '#c89a18', '#7a5a08']
const BUN: Ramp = ['#ffd27a', '#e89a3a', '#b8661c', '#7a3e10']
const PATTY: Ramp = ['#9a5a30', '#7a4320', '#512a12', '#331a0a']
const LETTUCE: Ramp = ['#a8e870', '#7ad04a', '#3f9a2c', '#246018']
/** The far side, a step into the shade. */
const far = (r: Ramp): Ramp => [r[1], r[2], r[3], r[3]]

export const WALKER_SIZE = { width: 78, height: 114 }

type Pt = readonly [number, number]
/** Each step: the near leg's knee and ankle and its foot's tilt, the far leg's, the far hand, how high the body rides. */
const STEPS: ReadonlyArray<{ near: [Pt, Pt, number]; far: [Pt, Pt, number]; elbow: Pt; hand: Pt; lift: number }> = [
  { near: [[44, 89], [48, 104], -0.12], far: [[31, 89], [25, 101], 0.4], elbow: [41, 52], hand: [46, 63], lift: 0 },
  { near: [[37, 90], [36, 106], 0], far: [[42, 86], [37, 98], 0.25], elbow: [36, 54], hand: [37, 66], lift: -1 },
  { near: [[31, 89], [25, 101], 0.4], far: [[44, 89], [48, 104], -0.12], elbow: [30, 52], hand: [26, 62], lift: 0 },
  { near: [[42, 86], [37, 98], 0.25], far: [[37, 90], [36, 106], 0], elbow: [36, 54], hand: [37, 66], lift: -1 },
]

function walker(accent: string, frame: number): { parts: Part[]; marks: Mark[] } {
  const step = STEPS[frame % 4]
  const lift = step.lift
  const P = (x: number, y: number): Pt => [x, y + lift]
  const SHIRT: Ramp = [mix(accent, '#ffffff', 0.35), accent, dim(accent, 0.72), dim(accent, 0.5)]
  const cap = (a: Pt, b: Pt, ra: number, rb: number, ramp: Ramp): Part => ({ shape: { kind: 'capsule', a, b, ra, rb }, ramp })
  const oval = (c: Pt, rx: number, ry: number, ramp: Ramp, turn = 0): Part => ({ shape: { kind: 'ellipse', c, rx, ry, turn }, ramp })
  const poly = (points: Pt[], ramp: Ramp, paint?: Part['paint']): Part => ({ shape: { kind: 'poly', points }, ramp, paint })
  const hip = P(37, 76)
  const leg = ([knee, ankle, tilt]: [Pt, Pt, number], ramp: (r: Ramp) => Ramp): Part[] => [
    cap(hip, P(knee[0], knee[1]), 6.4, 5.6, ramp(JEANS)),
    cap(P(knee[0], knee[1]), P(ankle[0], ankle[1]), 5.6, 4.6, ramp(JEANS)),
    oval(P(ankle[0] + 4, ankle[1] + 2.5), 8, 4.2, ramp(SHOE), tilt),
    cap(P(ankle[0] - 3 + Math.sin(tilt) * 2, ankle[1] + 5 - tilt * 3), P(ankle[0] + 11, ankle[1] + 5 + tilt * 4), 1.8, 1.8, ramp(SOLE)),
  ]
  const bite = frame % 2 === 1
  const parts: Part[] = [
    // the far leg and the far arm, behind
    ...leg(step.far, far),
    cap(P(35, 36), P(step.elbow[0], step.elbow[1]), 4.6, 4, far(SHIRT)),
    cap(P(step.elbow[0], step.elbow[1]), P(step.hand[0], step.hand[1]), 3.8, 3.2, far(SKIN)),
    oval(P(step.hand[0], step.hand[1] + 1), 3.6, 3.4, far(SKIN)),
    // his two parts: the striped piece under, the shirt over it, a seam between; the jeans at the hips
    poly([P(29, 72), P(46, 72), P(46, 80), P(29, 80)], JEANS),
    poly([P(28, 55), P(47, 55), P(46, 73), P(29, 73)], CLOTH, (x, _y, tone) => ((x - 28) % 5 >= 3 ? PRINT[tone] : CLOTH[tone])),
    poly([P(28, 30), P(45, 30), P(48, 37), P(47, 53), P(28, 53), P(27, 37)], SHIRT),
    // the near leg
    ...leg(step.near, (r) => r),
    // the neck, the head: ear, skull, the face's front, the nose; the hair
    cap(P(38, 25), P(37, 31), 3.8, 3.8, SKIN),
    oval(P(39, 16), 11.5, 12.5, SKIN),
    oval(P(45, 20), 8, 7.5, SKIN),
    oval(P(51.5, 15), 2.6, 2.8, SKIN),
    oval(P(35.5, 16.5), 2.6, 3.6, SKIN),
    poly([P(27, 20), P(28, 9), P(33, 4), P(42, 2), P(49, 5), P(52, 10), P(47, 8), P(44, 10), P(40, 7), P(37, 11), P(33, 13), P(32, 20)], HAIR),
    // the near arm up to his mouth: the sleeve, the forearm, the hand; the burger in it
    cap(P(39, 36), P(47, 48), 4.8, 4.2, SHIRT),
    cap(P(47, 48), P(53, 31), 4, 3.4, SKIN),
    oval(P(53.5, 29), 4, 3.6, SKIN),
    oval(P(60, 20.5), 7.4, 4.6, BUN),
    cap(P(53, 24.5), P(67, 24.5), 2.2, 2.2, LETTUCE),
    cap(P(53.5, 26.5), P(66.5, 26.5), 2.4, 2.4, PATTY),
    oval(P(60, 29), 6.6, 2.6, BUN),
  ]
  // a mouthful gone, on the side toward his mouth
  if (bite) parts.push({ shape: { kind: 'ellipse', c: P(53, 21), rx: 3.6, ry: 4.2 }, ramp: BUN, erase: true })
  const m = (color: string, points: Array<readonly [number, number]>): Mark => ({ color, points: points.map(([x, y]) => [x, y + lift] as const) })
  const marks: Mark[] = [
    // the eye with its glint, the brow; the mouth open on the burger (shut while chewing); the ear's curl
    m('#1a0c0a', [[46, 11], [47, 11], [46, 12], [47, 12], [46, 13], [47, 13]]),
    m('#ffffff', [[46, 11]]),
    m(HAIR[2], [[44, 8], [45, 8], [46, 8], [47, 9], [48, 9]]),
    m('#7a1a1a', bite ? [[47, 22], [48, 22], [49, 22], [50, 22]] : [[47, 20], [48, 20], [49, 20], [50, 20], [47, 21], [48, 21], [49, 21], [50, 21], [51, 21], [48, 22], [49, 22], [50, 22]]),
    m('#ff7a8a', bite ? [] : [[48, 22], [49, 22]]),
    m(SKIN[3], [[35, 15], [35, 16], [36, 17]]),
    // sesame on the bun, the shirt's collar and seam, the jeans' seam, the laces
    m('#fff6dc', [[57, 18], [60, 17], [63, 18]]),
    m(dim(accent, 0.5), [[36, 31], [37, 32], [38, 32], [39, 31]]),
    m(JEANS[3], [[37, 74], [37, 75], [37, 76], [37, 77], [37, 78]]),
    m('#e0301e', [[step.near[1][0] + 1, step.near[1][1] + 2 + lift], [step.near[1][0] + 2, step.near[1][1] + 2 + lift], [step.near[1][0] + 3, step.near[1][1] + 1 + lift]].map(([x, y]) => [x, y - lift] as const)),
  ]
  return { parts, marks }
}

/** The eater walking, his top left at `x`, `y`, facing right (or left, `dir` -1). */
export function drawWalkingEater(buffer: PixelBuffer, x: number, y: number, accent: string, frame: number, dir: 1 | -1 = 1): void {
  const { parts, marks } = walker(accent, frame)
  drawFigure(buffer, x, y, WALKER_SIZE.width, WALKER_SIZE.height, parts, marks, dir === -1)
}

const GOLD: Ramp = ['#fff3b0', '#ffd23f', '#d89a18', '#8a5a08']
export const CHEER_SIZE = { width: 84, height: 156 }

/**
 * The eater who won, for WINNER: on his feet, side on like the walker, both
 * arms up holding a golden cup over his head with a burger sitting in it;
 * he bobs with joy, mouth open, and a glint runs on the cup.
 */
function cheering(accent: string, frame: number): { parts: Part[]; marks: Mark[] } {
  const up = frame % 2 === 0 ? 0 : 2
  // the walker's coordinates, forty pixels lower to leave room for the cup; the arms and the cup bob
  const P = (x: number, y: number): Pt => [x, y + 40]
  const A = (x: number, y: number): Pt => [x, y + 40 + up]
  const SHIRT: Ramp = [mix(accent, '#ffffff', 0.35), accent, dim(accent, 0.72), dim(accent, 0.5)]
  const cap = (a: Pt, b: Pt, ra: number, rb: number, ramp: Ramp): Part => ({ shape: { kind: 'capsule', a, b, ra, rb }, ramp })
  const oval = (c: Pt, rx: number, ry: number, ramp: Ramp, turn = 0): Part => ({ shape: { kind: 'ellipse', c, rx, ry, turn }, ramp })
  const poly = (points: Pt[], ramp: Ramp, more: Partial<Part> = {}): Part => ({ shape: { kind: 'poly', points }, ramp, ...more })
  const hip = P(37, 76)
  const leg = (knee: Pt, ankle: Pt, tilt: number, ramp: (r: Ramp) => Ramp): Part[] => [
    cap(hip, knee, 6.4, 5.6, ramp(JEANS)),
    cap(knee, ankle, 5.6, 4.6, ramp(JEANS)),
    oval([ankle[0] + 4, ankle[1] + 2.5], 8, 4.2, ramp(SHOE), tilt),
    cap([ankle[0] - 3, ankle[1] + 5], [ankle[0] + 11, ankle[1] + 5], 1.8, 1.8, ramp(SOLE)),
  ]
  // the cup: its bowl round like a can under the light, two handles, the stem, the foot; the burger in its mouth
  const cx = 40, top = 2 + up
  const cupParts: Part[] = [
    cap([cx - 10, top + 6], [cx - 15, top + 9], 1.6, 1.6, GOLD), cap([cx - 15, top + 9], [cx - 9, top + 14], 1.6, 1.6, GOLD),
    cap([cx + 10, top + 6], [cx + 15, top + 9], 1.6, 1.6, GOLD), cap([cx + 15, top + 9], [cx + 9, top + 14], 1.6, 1.6, GOLD),
    poly([[cx - 12, top + 3], [cx + 12, top + 3], [cx + 9, top + 13], [cx + 4, top + 17], [cx - 4, top + 17], [cx - 9, top + 13]], GOLD, { round: { cx, half: 12 } }),
    cap([cx, top + 17], [cx, top + 23], 2.4, 2.2, GOLD),
    oval([cx, top + 25], 8, 2.8, GOLD),
    // the burger sitting in the cup
    oval([cx, top + 3], 9.5, 2.4, BUN),
    cap([cx - 9, top + 1], [cx + 9, top + 1], 1.8, 1.8, PATTY),
    cap([cx - 9.5, top - 0.8], [cx + 9.5, top - 0.8], 1.2, 1.2, LETTUCE),
    oval([cx, top - 4], 9, 4.6, BUN),
  ]
  const parts: Part[] = [
    // the far leg and the far arm, behind
    ...leg(P(33, 90), P(31, 104), 0.05, far),
    cap(P(34, 36), A(25, 20), 4.6, 4, far(SHIRT)),
    cap(A(25, 20), A(34, -11), 3.8, 3.2, far(SKIN)),
    // his two parts, the jeans at the hips
    poly([P(29, 72), P(46, 72), P(46, 80), P(29, 80)], JEANS),
    poly([P(28, 55), P(47, 55), P(46, 73), P(29, 73)], CLOTH, { paint: (x, _y, tone) => ((x - 28) % 5 >= 3 ? PRINT[tone] : CLOTH[tone]) }),
    poly([P(28, 30), P(45, 30), P(48, 37), P(47, 53), P(28, 53), P(27, 37)], SHIRT),
    ...leg(P(40, 90), P(41, 104), -0.05, (r) => r),
    // the near sleeve going up, behind his head; the head, looking up at his cup
    cap(P(40, 33), A(56, 17), 4.8, 4.2, SHIRT),
    cap(P(38, 25), P(37, 31), 3.8, 3.8, SKIN),
    oval(P(39, 16), 11.5, 12.5, SKIN),
    oval(P(45, 19), 8, 7.5, SKIN),
    oval(P(51.5, 14), 2.6, 2.8, SKIN),
    oval(P(35.5, 16.5), 2.6, 3.6, SKIN),
    poly([P(27, 20), P(28, 9), P(33, 4), P(42, 2), P(49, 5), P(52, 10), P(47, 8), P(44, 10), P(40, 7), P(37, 11), P(33, 13), P(32, 20)], HAIR),
    // the cup, then the near arm in front of it, its hand on the foot
    ...cupParts,
    cap(A(56, 17), A(45, -12), 4, 3.4, SKIN),
    oval(A(44, -14), 4, 3.6, SKIN),
    oval(A(35, -13), 3.6, 3.4, far(SKIN)),
  ]
  const m = (color: string, points: Array<readonly [number, number]>): Mark => ({ color, points: points.map(([x, y]) => [x, y + 40] as const) })
  const glint: Array<readonly [number, number]> = frame % 2 === 0 ? [[cx - 6, top + 6], [cx - 5, top + 6], [cx - 6, top + 7]] : [[cx + 3, top + 9], [cx + 4, top + 8], [cx + 3, top + 10]]
  const marks: Mark[] = [
    // the eye looking up, the brow raised; the mouth open with joy; the ear's curl
    m('#1a0c0a', [[46, 9], [47, 9], [46, 10], [47, 10], [47, 11]]),
    m('#ffffff', [[47, 9]]),
    m(HAIR[2], [[44, 6], [45, 5], [46, 5], [47, 6], [48, 6]]),
    m('#7a1a1a', [[47, 19], [48, 19], [49, 19], [50, 19], [47, 20], [48, 20], [49, 20], [50, 20], [51, 20], [48, 21], [49, 21], [50, 21]]),
    m('#ff7a8a', [[48, 21], [49, 21]]),
    m(SKIN[3], [[35, 15], [35, 16], [36, 17]]),
    // the shirt's collar and seam, the jeans' seam, the laces
    m(dim(accent, 0.5), [[36, 31], [37, 32], [38, 32], [39, 31]]),
    m(JEANS[3], [[37, 74], [37, 75], [37, 76], [37, 77], [37, 78]]),
    m('#e0301e', [[42, 106], [43, 106], [44, 105]]),
    // sesame on the bun, the glint on the gold
    { color: '#fff6dc', points: [[cx - 4, top - 6], [cx, top - 7], [cx + 4, top - 6]] },
    { color: '#ffffff', points: glint },
  ]
  return { parts, marks }
}

/** The eater who won, his top left at `x`, `y`, facing right. */
export function drawCheeringEater(buffer: PixelBuffer, x: number, y: number, accent: string, frame: number): void {
  const { parts, marks } = cheering(accent, frame)
  drawFigure(buffer, x, y, CHEER_SIZE.width, CHEER_SIZE.height, parts, marks)
}
