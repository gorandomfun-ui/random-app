/**
 * The traffic on the coast road: everyday cars seen from behind, not racing
 * cars — the little hatchback, the saloon, the surfers' camper van with its
 * spare wheel and its luggage, the pickup with boards in its bed, the estate
 * with a board on its roof, the round old beetle, the ice-cream van with its
 * cone on the roof — each in everyday colours, straight, or turning with
 * its flank showing as it changes lanes.
 *
 * Drawn here at a few sizes, each from the same shapes (a car a hundred
 * steps wide), so it stays sharp near and far.
 */

import { INK_LINE, Painter, tone } from './racing-paint'
import type { PixelBuffer } from './pixels'

export type TrafficModel = 'hatch' | 'saloon' | 'camper' | 'pickup' | 'estate' | 'beetle' | 'icecream'
export const TRAFFIC_MODELS: readonly TrafficModel[] = ['hatch', 'saloon', 'camper', 'pickup', 'estate', 'beetle', 'icecream']
/** Everyday colours: white, silver, blue, red, beige, mint, navy, yellow, pink. */
export const TRAFFIC_COLOURS = ['#e8e4dc', '#b8bcc8', '#5a8ad8', '#d84a3a', '#e0c890', '#6ac0a0', '#2a3a6a', '#f0c040', '#e88ab0'] as const
/** How wide each car is against a racing car (as the road sees it). */
export const TRAFFIC_WIDTH: Record<TrafficModel, number> = { hatch: 0.9, saloon: 0.98, camper: 0.98, pickup: 1, estate: 0.98, beetle: 0.84, icecream: 1.02 }
/** How much lower than drawn the tall ones stand on the road, beside the low racing cars. */
export const TRAFFIC_SQUASH: Partial<Record<TrafficModel, number>> = { camper: 0.88, icecream: 0.86, pickup: 0.94 }
/** Each car's height in steps of its hundred across. */
const HEIGHT: Record<TrafficModel, number> = { hatch: 62, saloon: 56, camper: 98, pickup: 74, estate: 68, beetle: 60, icecream: 108 }
/** How tall each car stands on the road, as a share of its width (the tall ones lowered as drawn). */
export const trafficHigh = (model: TrafficModel): number => (HEIGHT[model] / 100) * (TRAFFIC_SQUASH[model] ?? 1)
/** Where its rear lights are, as shares of its width and height, to glow after dark. */
export const TRAFFIC_LIGHTS: Record<TrafficModel, Array<[number, number]>> = {
  hatch: [[0.13, 0.58], [0.87, 0.58]], saloon: [[0.18, 0.6], [0.82, 0.6]], camper: [[0.09, 0.79], [0.91, 0.79]], pickup: [[0.07, 0.65], [0.93, 0.65]],
  estate: [[0.12, 0.6], [0.88, 0.6]], beetle: [[0.12, 0.73], [0.88, 0.73]], icecream: [[0.08, 0.8], [0.92, 0.8]],
}

const TYRE = '#1a1a24', GLASS = '#2a3a5c', GLINT = '#6a84bc', BUMPER = '#8a8a96', PLATE = '#f2efe6', RED = '#d8302a', RED_LIT = '#ff8a78', CREAM = '#f4ecd8'

/**
 * A car from behind, a hundred steps wide (`s` pixels a step), its colour
 * `c`; turning (`turn`) with its right flank showing past its back.
 */
function paint(model: TrafficModel, c: string, s: number, turn: boolean): PixelBuffer {
  const flank = turn ? 12 : 0
  const p = new Painter(Math.ceil((100 + flank + 2) * s), Math.ceil((HEIGHT[model] + 2) * s))
  const P = (x: number) => x * s, rect = (x: number, y: number, w: number, h: number, col: string) => p.rect(P(x), P(y), P(w), P(h), col)
  const round = (x: number, y: number, w: number, h: number, r: number, col: string) => p.round(P(x), P(y), P(w), P(h), P(r), col)
  const poly = (pts: Array<[number, number]>, col: string) => p.poly(pts.map(([x, y]) => [P(x), P(y)] as [number, number]), col)
  const ellipse = (x: number, y: number, rx: number, ry: number, col: string) => p.ellipse(P(x), P(y), P(rx), P(ry), col)
  const lit = tone(c, 1.18), dark = tone(c, 0.78), side = tone(c, 0.62)
  const glass = (pts: Array<[number, number]>) => { poly(pts, GLASS); const [a, b] = [pts[pts.length - 1], pts[1]]; p.line(P(a[0] + 4), P(a[1] - 2), P(a[0] + 10), P(b[1] + 2), Math.max(1, P(2)), GLINT) }
  const wheels = (y: number, h: number) => { round(6, y, 16, h, 2, TYRE); round(78, y, 16, h, 2, TYRE) }
  const plate = (y: number) => { rect(40, y, 20, 7, PLATE); rect(40, y + 6, 20, 1, tone(PLATE, 0.7)) }
  /**
   * The flank past the back's right edge `x`, from row `top` to row `foot`,
   * going away a little; the cabin's side glass along the cabin's right edge
   * (from `cabin`'s foot to its top), going away with it.
   */
  const sideOf = (x: number, top: number, foot: number, cabin?: { foot: number; top: number; y: number }) => {
    if (!turn) return
    poly([[x, top], [x + flank, top - 2], [x + flank, foot - 4], [x, foot]], side)
    rect(x, top, 1, foot - top, dark)
    if (cabin) poly([[cabin.foot, top], [cabin.top, cabin.y], [cabin.top + flank * 0.55, cabin.y + 1], [cabin.foot + flank * 0.8, top - 1]], tone(GLASS, 0.8))
    ellipse(x + flank * 0.55, foot - 3, flank * 0.32, 5, TYRE)
  }
  const H = HEIGHT[model]
  if (model === 'hatch') {
    wheels(H - 14, 13)
    sideOf(96, 26, H - 6, { foot: 84, top: 77, y: 5 })
    poly([[16, 27], [84, 27], [77, 5], [23, 5]], c); rect(23, 5, 54, 2, lit)
    glass([[22, 25], [78, 25], [72, 10], [28, 10]])
    round(4, 24, 92, H - 30, 7, c); rect(6, 25, 88, 3, lit); rect(4, H - 20, 92, 6, dark)
    round(7, 28, 10, 16, 3, RED); round(83, 28, 10, 16, 3, RED); rect(9, 30, 3, 6, RED_LIT); rect(85, 30, 3, 6, RED_LIT)
    plate(39); round(6, H - 13, 88, 7, 3, BUMPER)
  } else if (model === 'saloon') {
    wheels(H - 12, 11)
    sideOf(97, 24, H - 6, { foot: 80, top: 72, y: 7 })
    poly([[20, 25], [80, 25], [72, 7], [28, 7]], c); rect(28, 7, 44, 2, lit)
    glass([[25, 23], [75, 23], [69, 11], [31, 11]])
    round(2, 22, 96, H - 28, 6, c); rect(4, 23, 92, 4, lit); rect(2, H - 18, 96, 6, dark)
    round(5, 30, 24, 8, 3, RED); round(71, 30, 24, 8, 3, RED); rect(7, 31, 8, 2, RED_LIT); rect(73, 31, 8, 2, RED_LIT)
    plate(37); round(4, H - 12, 92, 6, 3, BUMPER)
  } else if (model === 'camper') {
    wheels(H - 12, 11)
    sideOf(96, 48, H - 8, { foot: 95, top: 92, y: 8 })
    rect(10, 4, 80, 3, '#5a5a6a'); round(18, 0, 30, 5, 2, '#e0a050'); round(52, 0, 24, 5, 2, '#5a8ad8')
    round(5, 6, 90, 46, 12, CREAM); round(4, 46, 92, H - 56, 6, c); rect(4, 46, 92, 3, lit)
    glass([[14, 14], [86, 14], [86, 38], [14, 38]]); rect(49, 14, 2, 24, CREAM)
    p.disc(P(50), P(66), P(12), CREAM); p.disc(P(50), P(66), P(9), dark); p.disc(P(50), P(66), P(4), CREAM)
    round(6, 70, 6, 14, 2, RED); round(88, 70, 6, 14, 2, RED)
    plate(80); round(4, H - 12, 92, 5, 2, BUMPER)
  } else if (model === 'pickup') {
    wheels(H - 13, 12)
    sideOf(96, 34, H - 7, { foot: 80, top: 79, y: 16 })
    // the cab's back, two boards standing in the bed in front of it, well above it
    round(20, 16, 60, 22, 5, c); glass([[30, 19], [70, 19], [70, 31], [30, 31]])
    round(27, 0, 8, 40, 4, '#ffd23f'); rect(30, 2, 2, 36, '#e2302a'); round(65, 4, 8, 36, 4, '#3ac070'); rect(68, 6, 2, 32, PLATE)
    rect(4, 34, 92, 4, dark); round(4, 37, 92, H - 45, 4, c); rect(4, 37, 92, 3, lit); rect(10, 48, 80, 1, dark)
    round(4, 40, 6, 16, 2, RED); round(90, 40, 6, 16, 2, RED)
    plate(54); round(4, H - 13, 92, 6, 2, BUMPER)
  } else if (model === 'estate') {
    wheels(H - 13, 12)
    sideOf(96, 28, H - 6, { foot: 86, top: 82, y: 7 })
    rect(14, 3, 72, 3, '#5a5a6a'); round(8, 0, 84, 4, 2, '#ff6aa0'); rect(10, 1, 80, 1, PLATE)
    poly([[14, 29], [86, 29], [82, 7], [18, 7]], c); rect(18, 7, 64, 2, lit)
    glass([[19, 27], [81, 27], [78, 11], [22, 11]])
    round(4, 26, 92, H - 32, 6, c); rect(6, 27, 88, 3, lit); rect(4, H - 20, 92, 6, dark)
    round(6, 32, 12, 14, 3, RED); round(82, 32, 12, 14, 3, RED); rect(8, 34, 4, 4, RED_LIT); rect(84, 34, 4, 4, RED_LIT)
    plate(42); round(6, H - 13, 88, 7, 3, BUMPER)
  } else if (model === 'beetle') {
    sideOf(94, 30, H - 6)
    ellipse(14, H - 14, 12, 12, c); ellipse(86, H - 14, 12, 12, c)
    round(6, H - 10, 14, 10, 3, TYRE); round(80, H - 10, 14, 10, 3, TYRE)
    ellipse(50, 34, 40, 30, c); rect(10, 34, 80, 18, c)
    ellipse(50, 14, 30, 10, lit); ellipse(50, 18, 18, 7, GLASS); p.line(P(40), P(19), P(46), P(14), Math.max(1, P(2)), GLINT)
    for (let k = 0; k < 4; k += 1) rect(38, 30 + k * 3, 24, 1, dark)
    p.disc(P(12), P(H - 16), P(4), RED); p.disc(P(88), P(H - 16), P(4), RED)
    plate(H - 22); rect(4, H - 9, 92, 3, BUMPER)
  } else {
    // the ice-cream van: its cone on the roof, stripes, small windows, two doors
    wheels(H - 12, 11)
    sideOf(96, 24, H - 8)
    ellipse(50, 9, 8, 8, '#ff94bc'); ellipse(46, 6, 3, 2, '#ffd0e4'); poly([[42, 13], [58, 13], [50, 26]], '#e0a050')
    round(4, 22, 92, H - 34, 6, PLATE); rect(4, 66, 92, 6, '#ff94bc'); rect(4, 72, 92, 6, '#a6f0d2')
    glass([[18, 30], [44, 30], [44, 48], [18, 48]]); glass([[56, 30], [82, 30], [82, 48], [56, 48]]); rect(49, 26, 2, 58, tone(PLATE, 0.7))
    round(6, 78, 6, 12, 2, RED); round(88, 78, 6, 12, 2, RED)
    plate(84); round(4, H - 12, 92, 5, 2, BUMPER)
  }
  p.outline(INK_LINE)
  return p.pic
}

const SIZES = [24, 40, 64, 104] as const
const made = new Map<string, PixelBuffer>()
/**
 * A car's picture for a width on the screen: drawn at the size just above
 * it, its back `width`-ish wide (a turning one wider by its flank), made
 * once and kept.
 */
export function trafficPicture(model: TrafficModel, colour: number, turn: boolean, width: number): { pic: PixelBuffer; back: number } {
  const size = SIZES.find((k) => k >= width) ?? SIZES[SIZES.length - 1]
  const key = `${model}|${colour}|${turn}|${size}`
  let pic = made.get(key)
  if (!pic) { pic = paint(model, TRAFFIC_COLOURS[colour % TRAFFIC_COLOURS.length], size / 100, turn); made.set(key, pic) }
  // the back's own width in the picture: its hundred steps
  return { pic, back: size * (100 / 102) }
}
