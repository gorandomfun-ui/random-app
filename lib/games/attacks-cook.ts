/**
 * RANDOM ATTACKS' cook for the title: the game's cook, in his pose — the
 * ketchup up in his right hand, the left on his hip, feet apart — built from
 * shapes at the landscape's fineness (`figure.ts`). The paper cap with its
 * red band, brown hair, a friendly face; the teal jacket open on the white
 * apron, the red scarf; the red belt with its gold buckle and the holster
 * with ketchup and mustard; jeans, white sneakers with red and teal. He
 * blinks now and then.
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
export const COOK_SIZE = { width: 124, height: 168 }
const DY = 6
type Pt = readonly [number, number]
const p = (x: number, y: number): Pt => [x, y + DY]
const cap = (a: Pt, b: Pt, ra: number, rb: number, ramp: Ramp, line?: boolean): Part => ({ shape: { kind: 'capsule', a, b, ra, rb }, ramp, line })
const oval = (c: Pt, rx: number, ry: number, ramp: Ramp, turn = 0): Part => ({ shape: { kind: 'ellipse', c, rx, ry, turn }, ramp })
const poly = (points: Pt[], ramp: Ramp, line?: boolean): Part => ({ shape: { kind: 'poly', points }, ramp, line })

function parts(): Part[] {
  return [
    // the raised arm, behind the body: upper arm, forearm, cuff; the bottle, the fist round it
    cap(p(84, 50), p(97, 37), 6.2, 5.4, TEAL),
    cap(p(97, 37), p(101, 25), 5.4, 4.6, TEAL),
    oval(p(100.6, 26.5), 5.8, 3.2, WHITE, -0.25),
    cap(p(101, 20), p(101, 2), 5.6, 5.2, KETCHUP),
    { shape: { kind: 'poly', points: [p(96.4, 5), p(105.6, 5), p(104.4, 9), p(97.6, 9)] }, ramp: WHITE, paint: (x, y, tone) => (y - DY > 6 && y - DY < 8 ? '#f4efe4' : WHITE[tone]) },
    oval(p(101, 0.5), 4.6, 3, WHITE),
    cap(p(101, -1.5), p(101, -5), 1.4, 0.8, RED),
    oval(p(101, 21.5), 6, 5.2, SKIN),
    // the legs: thighs, shins; the sneakers, their soles
    cap(p(52, 100), p(43, 126), 8.4, 7.2, JEANS),
    cap(p(43, 126), p(37, 148), 7.2, 5.8, JEANS),
    cap(p(68, 100), p(79, 126), 8.4, 7.2, JEANS),
    cap(p(79, 126), p(86, 148), 7.2, 5.8, JEANS),
    oval(p(31, 153), 11.5, 6.2, WHITE),
    cap(p(20, 158), p(43, 158), 2.6, 2.6, SOLE),
    oval(p(92, 153), 11.5, 6.2, WHITE),
    cap(p(81, 158), p(104, 158), 2.6, 2.6, SOLE),
    // the hips in their jeans
    poly([p(45, 92), p(75, 92), p(77, 106), p(66, 108), p(60, 102), p(54, 108), p(43, 106)], JEANS),
    // the shirt, the jacket's two sides, the apron over them
    poly([p(50, 44), p(70, 44), p(69, 90), p(51, 90)], WHITE),
    poly([p(37, 49), p(49, 42), p(55, 46), p(54, 90), p(42, 92), p(39, 72)], TEAL),
    poly([p(65, 46), p(71, 42), p(83, 49), p(82, 72), p(79, 92), p(66, 90)], TEAL),
    poly([p(51, 52), p(69, 52), p(71, 86), p(49, 86)], WHITE),
    poly([p(43, 86), p(77, 86), p(81, 112), p(39, 112)], WHITE),
    poly([p(39, 107), p(81, 107), p(81, 112), p(39, 112)], RED),
    // the belt and its buckle; the holster with ketchup and mustard
    poly([p(42, 83), p(78, 83), p(78, 88), p(42, 88)], RED),
    poly([p(56.5, 82), p(63.5, 82), p(63.5, 89), p(56.5, 89)], GOLD),
    cap(p(79.5, 83), p(79.5, 91), 2.6, 2.6, KETCHUP),
    cap(p(85.5, 83), p(85.5, 91), 2.6, 2.6, MUSTARD),
    poly([p(76, 88), p(89, 88), p(88, 102), p(77, 102)], LEATHER),
    // the left arm, its hand on the hip
    cap(p(39, 51), p(27, 69), 6.2, 5.6, TEAL),
    cap(p(27, 69), p(37, 83), 5.4, 4.8, TEAL),
    oval(p(36, 81), 4.6, 5.6, WHITE, -0.6),
    oval(p(41.5, 86), 5.4, 4.6, SKIN),
    // the neck, the scarf with its knot and point
    cap(p(60, 34), p(60, 44), 5.2, 5.2, SKIN),
    poly([p(51, 42), p(69, 42), p(66, 49), p(60, 52), p(54, 49)], RED),
    poly([p(58, 50), p(63, 50), p(61.5, 59)], RED),
    oval(p(60, 49), 3.2, 2.6, RED),
    // a badge on the jacket
    oval(p(73.5, 60), 3, 3, RED),
    // the head: ears, face; the hair; the paper cap and its band
    oval(p(47.5, 25), 3.2, 4.4, SKIN),
    oval(p(72.5, 25), 3.2, 4.4, SKIN),
    oval(p(60, 24), 12.4, 13.6, SKIN),
    poly([p(46, 24), p(46, 13), p(52, 8), p(68, 8), p(74, 13), p(74, 24), p(71, 16), p(66, 18), p(62, 14), p(57, 18), p(52, 15), p(49, 20)], HAIR),
    // the hair over the ears
    poly([p(45, 26), p(45, 15), p(49, 15), p(49, 24)], HAIR),
    poly([p(75, 26), p(75, 15), p(71, 15), p(71, 24)], HAIR),
    poly([p(46, 14), p(48, 5), p(55, 1), p(65, 1), p(72, 5), p(74, 14)], WHITE),
    poly([p(45.5, 11), p(74.5, 11), p(74.5, 15), p(45.5, 15)], RED),
  ]
}

function marks(blink: boolean): Mark[] {
  const m = (color: string, points: Array<readonly [number, number]>): Mark => ({ color, points: points.map(([x, y]) => [x, y + DY] as const) })
  const eyes: Mark[] = blink
    ? [m('#3a1a14', [[52, 22], [53, 23], [54, 23], [55, 22], [65, 22], [66, 23], [67, 23], [68, 22]])]
    : [
        m('#2a1a14', [[53, 20], [54, 20], [52, 21], [53, 21], [54, 21], [55, 21], [52, 22], [53, 22], [54, 22], [55, 22], [53, 23], [54, 23], [66, 20], [67, 20], [65, 21], [66, 21], [67, 21], [68, 21], [65, 22], [66, 22], [67, 22], [68, 22], [66, 23], [67, 23]]),
        m('#ffffff', [[53, 21], [66, 21]]),
      ]
  return [
    // the brows, arched; the eyes; the nose; the cheeks; a wide smile with its teeth
    m(HAIR[3], [[51, 18], [52, 17], [53, 17], [54, 17], [55, 18], [64, 18], [65, 17], [66, 17], [67, 17], [68, 18]]),
    ...eyes,
    m(SKIN[2], [[60, 26], [60, 27], [61, 27]]),
    m('#ff9a88', [[50, 26], [51, 26], [69, 26], [70, 26]]),
    m('#6a1a1a', [[54, 29], [55, 30], [56, 31], [57, 31], [58, 31], [59, 31], [60, 31], [61, 31], [62, 31], [63, 31], [64, 30], [65, 29], [56, 32], [57, 33], [58, 33], [59, 33], [60, 33], [61, 33], [62, 33], [63, 32]]),
    m('#ffffff', [[57, 32], [58, 32], [59, 32], [60, 32], [61, 32], [62, 32]]),
    // the fist's fingers, the jacket's folds and seams, the apron's pocket, the cap's crease
    m(SKIN[3], [[96, 20], [96, 22], [96, 24], [97, 19]]),
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

/** The cook with his top left at `x`, `y`; blinking on some frames. */
export function drawCook(buffer: PixelBuffer, x: number, y: number, frame: number): void {
  drawFigure(buffer, x, y, COOK_SIZE.width, COOK_SIZE.height, parts(), marks(frame % 9 === 8))
}
