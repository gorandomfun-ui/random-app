/**
 * RANDOM ATTACKS' cook for the title: the game's cook, in his pose — the
 * ketchup up in his right hand, the left on his hip, feet apart — built from
 * shapes at the landscape's fineness (`figure.ts`). The paper cap with its
 * red band, brown hair, a friendly face; the teal jacket open on the white
 * apron, the red scarf; the red belt with its gold buckle and the holster
 * with ketchup and mustard; jeans, white sneakers with red and teal. Round
 * shoulders and arms that run on to real hands; the garments rounded with
 * the body, the shadows the cap, the head, the jacket and the belt cast; his
 * shadow on the ground, the diner's warm light on his left. He blinks now
 * and then.
 */

import { along, drawFigure, type Mark, type Part, type Ramp } from './figure'
import { PixelBuffer } from './pixels'

const SKIN: Ramp = ['#ffe0c4', '#f6c39b', '#d8946c', '#a85c3c']
const HAIR: Ramp = ['#c07a3e', '#8a4a20', '#5e2e12', '#3a1a08']
const WHITE: Ramp = ['#ffffff', '#f4efe4', '#cfc5b8', '#a397ae']
const RED: Ramp = ['#ff7a68', '#e2303a', '#a01c26', '#64101a']
const TEAL: Ramp = ['#7ee0cc', '#2aaa9a', '#167268', '#0c4a44']
const JEANS: Ramp = ['#6278b8', '#3a4c86', '#26325e', '#141a34']
const GOLD: Ramp = ['#fff2a8', '#f2c43e', '#c49218', '#7a5a10']
const SOLE: Ramp = ['#f0f0f6', '#c8c8d4', '#8a8a9a', '#5a5a6a']
const KETCHUP: Ramp = ['#ff8a78', '#e2281e', '#a01810', '#5a0c08']
const MUSTARD: Ramp = ['#fff3a0', '#ffd02a', '#c89a10', '#7a5a08']
const LEATHER: Ramp = ['#a86a3a', '#7a4620', '#56300f', '#381e08']

/** The box he stands in, his feet on its bottom row. */
export const COOK_SIZE = { width: 124, height: 174 }
const DY = 12
type Pt = readonly [number, number]
const p = (x: number, y: number): Pt => [x, y + DY]
const cap = (a: Pt, b: Pt, ra: number, rb: number, ramp: Ramp, line?: boolean): Part => ({ shape: { kind: 'capsule', a, b, ra, rb }, ramp, line })
const oval = (c: Pt, rx: number, ry: number, ramp: Ramp, turn = 0): Part => ({ shape: { kind: 'ellipse', c, rx, ry, turn }, ramp })
const poly = (points: Pt[], ramp: Ramp, line?: boolean): Part => ({ shape: { kind: 'poly', points }, ramp, line })

/** The body's middle and half its width, for the garments' roundness. */
const BODY = { cx: 58, half: 25 }
const round = (points: Pt[], ramp: Ramp, line?: boolean): Part => ({ shape: { kind: 'poly', points }, ramp, line, round: BODY })
const shade = (points: Pt[]): Part => ({ shape: { kind: 'poly', points }, ramp: WHITE, shadow: true })

function parts(): Part[] {
  const fingers = (from: Pt, to: Pt, count: number, step: Pt, r: number): Part[] => Array.from({ length: count }, (_, k) => cap(p(from[0] + step[0] * k, from[1] + step[1] * k), p(to[0] + step[0] * k, to[1] + step[1] * k), r, r, SKIN))
  return [
    // the bottle behind the raised fist
    cap(p(101, 23), p(101, -4), 5.4, 5, KETCHUP),
    { shape: { kind: 'poly', points: [p(96.6, 1), p(105.4, 1), p(105.4, 6), p(96.6, 6)] }, ramp: WHITE },
    oval(p(101, -6), 4.4, 2.8, WHITE),
    cap(p(101, -8.5), p(101, -11.5), 1.4, 0.8, RED),
    // the legs: thighs, shins; the sneakers, the nearer one a little bigger, their soles
    cap(p(52, 100), p(43, 126), 8.4, 7.2, JEANS),
    cap(p(43, 126), p(38, 148), 7.2, 5.6, JEANS),
    cap(p(68, 100), p(79, 126), 8.6, 7.4, JEANS),
    cap(p(79, 126), p(86, 148), 7.4, 6, JEANS),
    oval(p(32, 152.5), 11, 5.8, WHITE, -0.08),
    cap(p(22, 157), p(42, 157), 2.4, 2.4, SOLE),
    oval(p(92, 153.5), 12.6, 6.8, WHITE, 0.08),
    cap(p(80, 158.5), p(104, 158.5), 2.8, 2.8, SOLE),
    // the hips in their jeans
    round([p(45, 92), p(75, 92), p(77, 106), p(66, 108), p(60, 102), p(54, 108), p(43, 106)], JEANS),
    // the shirt, the apron's bib on it, the jacket open over both, its shadow on the bib
    round([p(50, 44), p(70, 44), p(69, 90), p(51, 90)], WHITE),
    round([p(51, 52), p(69, 52), p(71, 88), p(49, 88)], WHITE),
    shade([p(54.5, 46), p(57, 46), p(57, 88), p(54.5, 88)]),
    shade([p(66, 46), p(67.5, 46), p(67.5, 88), p(66, 88)]),
    round([p(37, 49), p(49, 42), p(55.5, 46), p(55, 91), p(42, 93), p(39, 72)], TEAL),
    round([p(65.5, 46), p(71, 42), p(83, 49), p(82, 72), p(79, 93), p(66, 91)], TEAL),
    // the apron's skirt, its red hem, the belt's shadow on it; the belt and its buckle
    round([p(43, 86), p(77, 86), p(81, 112), p(39, 112)], WHITE),
    round([p(39, 107), p(81, 107), p(81, 112), p(39, 112)], RED),
    shade([p(42, 88), p(78, 88), p(78.5, 90.5), p(41.5, 90.5)]),
    round([p(42, 83), p(78, 83), p(78, 88), p(42, 88)], RED),
    { shape: { kind: 'poly', points: [p(56.5, 82), p(63.5, 82), p(63.5, 89), p(56.5, 89)] }, ramp: GOLD },
    // the hem's shadow on the thighs
    shade([p(42, 112), p(78, 112), p(77, 115), p(43, 115)]),
    // the holster with ketchup and mustard
    cap(p(79.5, 83), p(79.5, 91), 2.6, 2.6, KETCHUP),
    cap(p(85.5, 83), p(85.5, 91), 2.6, 2.6, MUSTARD),
    poly([p(76, 88), p(89, 88), p(88, 102), p(77, 102)], LEATHER),
    // the raised arm, from a round shoulder: upper arm, sleeve, the rolled cuff, the wrist, the fist round the bottle
    oval(p(80.5, 49.5), 7.2, 6.6, TEAL),
    cap(p(81, 49), p(96, 37), 6.4, 5.4, TEAL),
    cap(p(96, 37), p(99.4, 28.8), 5.4, 4.8, TEAL),
    cap(p(99.2, 29.6), p(100.1, 26.8), 5.6, 5.4, WHITE),
    cap(p(100.1, 27), p(100.6, 24.2), 3.4, 3.4, SKIN),
    oval(p(103.4, 21.5), 3.4, 5, SKIN),
    ...fingers([96.6, 16.6], [104.6, 16.6], 4, [0, 2.7], 1.3),
    cap(p(97, 25), p(98.8, 16.2), 1.8, 1.6, SKIN),
    // the left arm, from its round shoulder, down to the hand on the hip, its fingers over the belt
    oval(p(39.5, 50.5), 7.2, 6.6, TEAL),
    cap(p(39, 50), p(26, 68), 6.4, 5.6, TEAL),
    cap(p(26, 68), p(35.2, 80), 5.6, 4.8, TEAL),
    cap(p(34.4, 79), p(36.6, 81.8), 5.4, 5.4, WHITE),
    cap(p(36.4, 81.6), p(38.4, 83.6), 3.4, 3.4, SKIN),
    oval(p(40.6, 85.6), 4.2, 3.6, SKIN, 0.5),
    ...fingers([41.4, 83.8], [46.4, 86.4], 4, [0.35, 2], 1.25),
    // the neck, the scarf with its knot and point, the head's shadow over them
    cap(p(60, 34), p(60, 44), 5.2, 5.2, SKIN),
    poly([p(51, 42), p(69, 42), p(66, 49), p(60, 52), p(54, 49)], RED),
    poly([p(58, 50), p(63, 50), p(61.5, 59)], RED),
    oval(p(60, 49), 3.2, 2.6, RED),
    { shape: { kind: 'ellipse', c: p(62, 39), rx: 8.5, ry: 3.6 }, ramp: SKIN, shadow: true },
    // the head: ears, face; the hair; the cap's shadow on the brow; the paper cap and its band
    oval(p(48.2, 25), 2.4, 4, SKIN),
    oval(p(72.6, 25), 3.4, 4.6, SKIN),
    oval(p(60, 24), 12.4, 13.6, SKIN),
    poly([p(45, 26), p(45, 15), p(49, 15), p(49, 24)], HAIR),
    poly([p(75, 26), p(75, 15), p(71, 15), p(71, 24)], HAIR),
    poly([p(46, 24), p(46, 13), p(52, 8), p(68, 8), p(74, 13), p(74, 24), p(71, 16), p(66, 18), p(62, 14), p(57, 18), p(52, 15), p(49, 20)], HAIR),
    shade([p(46, 15), p(74, 15), p(73, 18), p(47, 18)]),
    round([p(46, 14), p(48, 5), p(55, 1), p(65, 1), p(72, 5), p(74, 14)], WHITE),
    round([p(45.5, 11), p(74.5, 11), p(74.5, 15), p(45.5, 15)], RED),
    // a badge on the jacket
    oval(p(73.5, 60), 3, 3, RED),
  ]
}

function marks(blink: boolean): Mark[] {
  const m = (color: string, points: Array<readonly [number, number]>): Mark => ({ color, points: points.map(([x, y]) => [x, y + DY] as const) })
  const eyes: Mark[] = blink
    ? [m('#3a1a14', [[50, 22], [51, 23], [52, 23], [53, 22], [63, 22], [64, 23], [65, 23], [66, 22]])]
    : [
        m('#2a1a14', [[51, 20], [52, 20], [50, 21], [51, 21], [52, 21], [53, 21], [50, 22], [51, 22], [52, 22], [53, 22], [51, 23], [52, 23], [64, 20], [65, 20], [63, 21], [64, 21], [65, 21], [66, 21], [63, 22], [64, 22], [65, 22], [66, 22], [64, 23], [65, 23]]),
        m('#ffffff', [[51, 21], [64, 21]]),
      ]
  return [
    // the brows, arched; the eyes; the nose; the cheeks; a wide smile with its teeth
    m(HAIR[3], [[49, 18], [50, 17], [51, 17], [52, 17], [53, 18], [62, 18], [63, 17], [64, 17], [65, 17], [66, 18]]),
    ...eyes,
    m(SKIN[2], [[58, 26], [58, 27], [59, 27]]),
    m('#ff9a88', [[48, 26], [49, 26], [67, 26], [68, 26]]),
    m('#6a1a1a', [[52, 29], [53, 30], [54, 31], [55, 31], [56, 31], [57, 31], [58, 31], [59, 31], [60, 31], [61, 31], [62, 30], [63, 29], [54, 32], [55, 33], [56, 33], [57, 33], [58, 33], [59, 33], [60, 33], [61, 32]]),
    m('#ffffff', [[55, 32], [56, 32], [57, 32], [58, 32], [59, 32], [60, 32]]),
    // the hair's strands of light, the jacket's folds and seams, the apron's pocket, the cap's crease
    m(HAIR[0], [...along([53, 10], [56, 14]), ...along([63, 10], [66, 13]), ...along([70, 13], [72, 17])]),
    m(TEAL[3], [...along([33, 61], [30, 66]), ...along([90, 43], [93, 40]), ...along([45, 60], [47, 78]), ...along([75, 60], [73, 78])]),
    m(WHITE[2], [...along([54, 94], [66, 94]), ...along([54, 94], [54, 102]), ...along([66, 94], [66, 102]), ...along([60, 52], [60, 80])]),
    m(WHITE[2], [...along([60, 2], [60, 9]), ...along([49, 9], [54, 4])]),
    // the badge's white heart, the lapels lit along their edge, the jeans' folds and knees
    m('#ffffff', [[73, 59], [74, 59], [73, 60], [74, 60]]),
    m(TEAL[0], [...along([55, 46], [54, 64]), ...along([65, 46], [66, 64])]),
    m(JEANS[2], [...along([46, 116], [48, 122]), ...along([76, 116], [74, 122]), ...along([40, 134], [42, 140]), ...along([82, 134], [80, 140])]),
    m(JEANS[0], [[44, 124], [45, 124], [45, 125], [79, 124], [80, 124], [79, 125]]),
    // the sneakers' red stripes and teal heels, the laces
    m(RED[1], [...along([26, 151], [34, 149]), ...along([88, 149], [96, 151])]),
    m(TEAL[1], [[21, 153], [22, 153], [21, 154], [102, 153], [103, 153], [103, 154]]),
    m(WHITE[3], [[33, 148], [35, 148], [89, 148], [91, 148]]),
  ]
}

/** The cook with his top left at `x`, `y`, his shadow under him, lit warm on his left by the diner; blinking on some frames. */
export function drawCook(buffer: PixelBuffer, x: number, y: number, frame: number): void {
  // his shadow on the ground, then him, the diner's warm light on his left
  for (let dy = -6; dy <= 6; dy += 1) for (let dx = -54; dx <= 54; dx += 1) {
    const d = (dx / 54) ** 2 + (dy / 6) ** 2
    if (d <= 1) buffer.tint(x + 62 + dx, y + COOK_SIZE.height - 4 + dy, '#140608', 0.38 * (1 - d * 0.6))
  }
  drawFigure(buffer, x, y, COOK_SIZE.width, COOK_SIZE.height, parts(), marks(frame % 9 === 8), false, { color: '#ffb070', from: 'left' })
}
