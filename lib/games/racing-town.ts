/**
 * The shops along the roads, each one telling what it is by how it looks
 * rather than by a name. The coast's: the ice-cream parlour with its giant
 * cone on the roof, the surf shop with its boards against the front and one
 * on the roof, the burger stand under its giant burger, the diner in chrome
 * with its coffee cup sign, the motel and its arrow of bulbs, the art deco
 * hotel and its fin, the tiki bar under its straw, the filling station and
 * its pumps, the pizzeria and its slice, the arcade and its joystick, the
 * record shop and its disc. The mountains': the chalet with its balcony of
 * flowers and its snowy roof, the grand hotel and its flags, the ski shop
 * under its crossed skis, the cable car's station with its pylon and its
 * cabin, the cheese shop under its giant wedge, the chapel and its bell
 * tower. The desert's: the adobe house with its beams and its ladder, the
 * saloon's false front under its horseshoe, the trading post under its giant
 * hat. The city's: the cinema with its neon blade and its marquee of bulbs
 * under its film reels, the glass tower and its blinking antenna, the club
 * under its mirror ball, the boutique and its mannequins under a giant
 * shopping bag, the café and its terrace under a giant croissant. After dark
 * their windows are lit and their signs glow.
 *
 * Each is drawn once as its front, clear round it, at one scale for all
 * (`TOWN_UNIT` half widths of the road a pixel, a floor about the height of
 * three metres beside the cars), then cut in two: the front itself, laid
 * along the road (it goes by in perspective), and what stands on its roof —
 * the cone, the burger, the signs — standing up there facing the road.
 */

import { INK_LINE, Painter, tone } from './racing-paint'
import { PixelBuffer } from './pixels'

export type ShopKind = 'icecream' | 'surf' | 'burger' | 'diner' | 'motel' | 'hotel' | 'tiki' | 'station' | 'pizza' | 'arcade' | 'records'
  | 'chalet' | 'alphotel' | 'skishop' | 'cablecar' | 'cheese' | 'chapel' | 'adobe' | 'saloon' | 'tradingpost' | 'cinema' | 'tower' | 'club' | 'boutique' | 'cafe'
export const SHOPS: readonly ShopKind[] = [
  'icecream', 'surf', 'burger', 'diner', 'motel', 'hotel', 'tiki', 'station', 'pizza', 'arcade', 'records',
  'chalet', 'alphotel', 'skishop', 'cablecar', 'cheese', 'chapel', 'adobe', 'saloon', 'tradingpost', 'cinema', 'tower', 'club', 'boutique', 'cafe',
]
/** How tall a pixel of a shop's picture stands, in half widths of the road. */
export const TOWN_UNIT = 0.028
/** Each shop's front's width in pixels, the same order as `SHOPS` (its length along the road follows). */
export const SHOP_WIDTHS: readonly number[] = [84, 92, 72, 110, 124, 92, 104, 112, 80, 88, 84, 90, 110, 80, 96, 80, 72, 86, 96, 100, 104, 90, 92, 80, 96]

type Glow = { x: number; y: number; r: number; colour: string }
/**
 * A shop: its whole front as drawn (`pic`) and where its lights glow after
 * dark; the row its walls end at (`roof`), the walls' colour and how many
 * floors (for its side); then cut: the front below the roof, and what stands
 * on the roof, cropped (`top`, its left at `x0` in the front's columns).
 */
export type Shop = {
  pic: PixelBuffer; glows: Glow[]; roof: number; wall: string; floors: number
  front: PixelBuffer; frontGlows: Glow[]
  top: { pic: PixelBuffer; x0: number; glows: Glow[] } | null
}
/** Where each shop's walls end, from the top of its picture; their colour; how many floors. */
const BUILT: Record<ShopKind, { roof: number; wall: string; floors: number }> = {
  icecream: { roof: 53, wall: '#f6a8c0', floors: 1 }, surf: { roof: 35, wall: '#2ab0b0', floors: 1 }, burger: { roof: 49, wall: '#f6f2e8', floors: 1 },
  diner: { roof: 49, wall: '#d8d8e4', floors: 1 }, motel: { roof: 43, wall: '#f4e2b8', floors: 2 }, hotel: { roof: 31, wall: '#f6f2e8', floors: 3 },
  tiki: { roof: 11, wall: '#c8a050', floors: 0 }, station: { roof: 35, wall: '#c8d8e8', floors: 1 }, pizza: { roof: 43, wall: '#b85a3a', floors: 1 },
  arcade: { roof: 41, wall: '#3a2a5a', floors: 1 }, records: { roof: 45, wall: '#c8b0e8', floors: 1 },
  chalet: { roof: 15, wall: '#9a6038', floors: 2 }, alphotel: { roof: 17, wall: '#f2e6c8', floors: 3 }, skishop: { roof: 27, wall: '#b07a48', floors: 1 },
  cablecar: { roof: 69, wall: '#c8c4bc', floors: 1 }, cheese: { roof: 35, wall: '#c89858', floors: 1 }, chapel: { roof: 57, wall: '#f4f0e8', floors: 1 },
  adobe: { roof: 19, wall: '#d4945c', floors: 1 }, saloon: { roof: 25, wall: '#a86a3a', floors: 2 }, tradingpost: { roof: 41, wall: '#9a7048', floors: 1 },
  cinema: { roof: 39, wall: '#e8d8f0', floors: 3 }, tower: { roof: 11, wall: '#3a4a7a', floors: 8 }, club: { roof: 33, wall: '#2a1a3a', floors: 2 },
  boutique: { roof: 33, wall: '#f6c8d8', floors: 2 }, cafe: { roof: 31, wall: '#2a6a4a', floors: 2 },
}

const GLASS = '#2a3a62', GLASS_LIT = '#ffd690', GLINT = '#6a84bc', WHITE = '#f6f2e8', DARK = '#3a2a40'

/** A window: dark glass with a glint by day, warm light after dark. */
function pane(p: Painter, x: number, y: number, w: number, h: number, lit: boolean): void {
  p.rect(x, y, w, h, lit ? GLASS_LIT : GLASS)
  if (!lit) for (let k = 0; k < Math.min(w, h); k += 1) p.dot(x + 1 + k, y + h - 2 - k, GLINT)
  else p.rect(x, y + h - 2, w, 2, '#e8a050')
}
/** An awning in stripes, its edge scalloped. */
function awning(p: Painter, x: number, y: number, w: number, h: number, a: string, b: string): void {
  p.stripes(x, y, w, h, 4, a, b)
  for (let k = 0; k < w; k += 1) if (k % 4 === 1 || k % 4 === 2) p.dot(x + k, y + h, Math.floor(k / 4) % 2 ? b : a)
  p.rect(x, y, w, 1, tone(a, 0.75))
}

/** Boards across a box (or upright), a line of `c` every `step`. */
function planks(p: Painter, x: number, y: number, w: number, h: number, c: string, step: number, upright = false): void {
  if (upright) for (let xx = x + step; xx < x + w; xx += step) p.rect(xx, y, 1, h, c)
  else for (let yy = y + step; yy < y + h; yy += step) p.rect(x, yy, w, 1, c)
}
/** A window with its two shutters. */
function shuttered(p: Painter, x: number, y: number, w: number, h: number, lit: boolean, shutter: string): void {
  pane(p, x, y, w, h, lit)
  p.rect(x - 3, y, 3, h, shutter); p.rect(x + w, y, 3, h, shutter)
  for (let k = 1; k < h; k += 2) { p.dot(x - 2, y + k, tone(shutter, 0.7)); p.dot(x + w + 1, y + k, tone(shutter, 0.7)) }
}
/** A roof seen from the front: a band of shingles from the eaves (`y0`, `x0` to `x1`) back up to the ridge (`y1`, set in by `inset`), a line of snow on top if asked. */
function roofBand(p: Painter, x0: number, x1: number, y0: number, y1: number, inset: number, c: string, snow: boolean): void {
  p.poly([[x0, y0], [x1, y0], [x1 - inset, y1], [x0 + inset, y1]], c)
  for (let y = y1 + 3; y < y0; y += 3) p.rect(x0 + inset * ((y0 - y) / (y0 - y1)), y, x1 - x0 - 2 * inset * ((y0 - y) / (y0 - y1)), 1, tone(c, 0.78))
  p.rect(x0, y0 - 1, x1 - x0, 2, tone(c, 0.6))
  if (snow) { p.rect(x0 + inset, y1 - 4, x1 - x0 - 2 * inset, 5, WHITE); for (let x = x0 + inset + 2; x < x1 - inset - 2; x += 5) p.rect(x, y1 + 1, 2, 1 + (x % 3), WHITE) }
}

/** A shop's front as drawn, and where its lights glow. */
type Drawn = { pic: PixelBuffer; glows: Glow[] }
const draw: Record<ShopKind, (lit: boolean) => Drawn> = {
  icecream: (lit) => {
    const p = new Painter(84, 96), B = 95, glows: Glow[] = []
    p.rect(4, B - 38, 76, 38, '#f6a8c0'); p.rect(4, B - 4, 76, 4, '#d8849e'); p.rect(2, B - 42, 80, 4, '#9fe0c8')
    pane(p, 16, B - 27, 52, 15, lit); p.rect(14, B - 12, 56, 3, WHITE)
    awning(p, 12, B - 34, 60, 6, '#ff6aa0', WHITE)
    // the giant cone: the wafer, three scoops, a cherry
    p.poly([[30, B - 66], [54, B - 66], [42, B - 42]], '#e0a050')
    for (let k = 0; k < 5; k += 1) { p.line(31 + k * 5, B - 66, 39 + k * 3, B - 46, 1, '#b8782e'); p.line(53 - k * 5, B - 66, 45 - k * 3, B - 46, 1, '#b8782e') }
    p.disc(36, B - 70, 9, '#ff94bc'); p.disc(49, B - 71, 9, '#a6f0d2'); p.disc(42, B - 80, 8, '#fff0c8')
    p.disc(39, B - 83, 2, '#ffffff'); p.disc(43, B - 90, 3, '#e2302a'); p.line(44, B - 92, 47, B - 95, 1, '#3a7a3a')
    if (lit) glows.push({ x: 42, y: B - 74, r: 26, colour: '#ffb0d8' }, { x: 42, y: B - 20, r: 30, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  surf: (lit) => {
    const p = new Painter(92, 86), B = 85, glows: Glow[] = []
    p.rect(4, B - 46, 84, 46, '#2ab0b0')
    for (let y = B - 44; y < B; y += 4) p.rect(4, y, 84, 1, '#1e8a8c')
    p.rect(0, B - 50, 92, 5, '#e8c890'); p.rect(0, B - 46, 92, 1, '#b89860')
    pane(p, 12, B - 32, 24, 18, lit); p.rect(42, B - 28, 13, 28, '#6a4028'); p.dot(52, B - 14, '#ffd23f')
    // the boards against the front
    const boards = [['#ffd23f', '#e2302a'], ['#f6f2e8', '#3a7ae0'], ['#ff6aa0', '#ffd23f'], ['#3ac070', '#f6f2e8']]
    boards.forEach(([a, b], k) => { const x = 60 + k * 7; p.round(x, B - 34, 6, 34, 3, a); p.rect(x + 2, B - 32, 2, 30, b) })
    // a big board on the roof
    p.line(14, B - 58, 78, B - 70, 9, '#ffd23f'); p.line(16, B - 58, 76, B - 70, 2, '#e2302a')
    if (lit) glows.push({ x: 46, y: B - 64, r: 24, colour: '#fff0a0' }, { x: 24, y: B - 22, r: 18, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  burger: (lit) => {
    const p = new Painter(72, 84), B = 83, glows: Glow[] = []
    p.rect(6, B - 34, 60, 34, WHITE)
    for (let y = B - 14; y < B; y += 4) for (let x = 6; x < 66; x += 4) if (((x - 6) / 4 + (y - B + 14) / 4) % 2 === 0) p.rect(x, y, 4, 4, '#e2302a')
    pane(p, 14, B - 28, 44, 12, lit); p.rect(12, B - 16, 48, 2, '#c0c0c8')
    awning(p, 10, B - 34, 52, 5, '#e2302a', WHITE)
    // the giant burger
    p.ellipse(36, B - 39, 24, 4, '#e8a050'); p.ellipse(36, B - 44, 24, 4, '#6a3418'); p.poly([[14, B - 47], [58, B - 47], [52, B - 42], [44, B - 45], [34, B - 41], [24, B - 45], [18, B - 42]], '#ffd23f')
    for (let k = 0; k < 12; k += 1) p.disc(14 + k * 4, B - 49 + (k % 2), 2.5, '#5ac048')
    p.ellipse(36, B - 51, 22, 2, '#e2302a')
    p.round(13, B - 66, 46, 15, 8, '#e89040'); p.rect(13, B - 56, 46, 4, '#e89040')
    for (const [x, y] of [[22, -61], [30, -63], [38, -60], [46, -63], [52, -59], [28, -57], [42, -56]] as const) p.rect(x, B + y, 2, 1, '#fff2c8')
    if (lit) glows.push({ x: 36, y: B - 52, r: 26, colour: '#ffc070' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  diner: (lit) => {
    const p = new Painter(110, 92), B = 91, glows: Glow[] = []
    p.round(4, B - 42, 90, 42, 10, '#d8d8e4')
    for (let y = B - 36; y < B; y += 6) p.rect(6, y, 86, 1, '#a8a8bc')
    p.rect(8, B - 40, 82, 4, '#e2405a'); p.rect(8, B - 36, 82, 1, '#1ab0b8')
    for (let k = 0; k < 6; k += 1) pane(p, 12 + k * 12, B - 30, 10, 14, lit)
    p.rect(80, B - 28, 10, 28, '#c0c0d0'); pane(p, 82, B - 26, 6, 12, lit)
    // the coffee cup sign on its pole
    p.rect(99, B - 72, 3, 72, '#a8a8bc')
    p.disc(100, B - 78, 11, '#ff6aa0'); p.disc(100, B - 78, 9, '#2a1a34')
    p.round(94, B - 80, 10, 8, 2, WHITE); p.round(103, B - 79, 3, 4, 1, WHITE); p.rect(92, B - 72, 14, 2, WHITE)
    for (const x of [96, 99, 102]) { p.dot(x, B - 83, WHITE); p.dot(x + 1, B - 85, WHITE); p.dot(x, B - 87, WHITE) }
    if (lit) glows.push({ x: 100, y: B - 78, r: 20, colour: '#ff6aa0' }, { x: 48, y: B - 38, r: 40, colour: '#ff6a8a' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  motel: (lit) => {
    const p = new Painter(124, 100), B = 99, glows: Glow[] = []
    p.rect(22, B - 52, 98, 52, '#f4e2b8'); p.rect(20, B - 56, 102, 4, '#f08a50'); p.rect(22, B - 27, 98, 2, '#e8c890')
    for (let f = 0; f < 2; f += 1) for (let k = 0; k < 5; k += 1) {
      const x = 28 + k * 19, y = B - 48 + f * 26
      p.rect(x, y, 7, 20, '#2ab0b0'); p.rect(x + 2, y + 3, 3, 2, '#ffd23f'); pane(p, x + 9, y + 4, 7, 8, lit && (k + f) % 2 === 0)
    }
    // the balcony's rail
    p.rect(22, B - 30, 98, 1, WHITE); for (let x = 22; x < 120; x += 5) p.rect(x, B - 30, 1, 4, WHITE)
    // the arrow of bulbs on its pole, a star on top
    p.rect(8, B - 70, 3, 70, '#8a8a9a')
    p.round(0, B - 92, 22, 16, 3, '#e2302a')
    p.poly([[6, B - 76], [16, B - 76], [16, B - 66], [22, B - 66], [11, B - 56], [0, B - 66], [6, B - 66]], '#ffd23f')
    for (let k = 0; k < 6; k += 1) p.dot(2 + k * 4, B - 90, lit && k % 2 ? '#ffffff' : '#ffe08a')
    p.poly([[11, B - 99], [13, B - 95], [17, B - 95], [14, B - 92], [15, B - 88], [11, B - 90], [7, B - 88], [8, B - 92], [5, B - 95], [9, B - 95]], '#ffd23f')
    if (lit) glows.push({ x: 11, y: B - 80, r: 20, colour: '#ffd040' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  hotel: (lit) => {
    const p = new Painter(92, 112), B = 111, glows: Glow[] = []
    p.round(4, B - 80, 84, 80, 6, WHITE)
    p.rect(4, B - 80, 10, 80, '#9cc8f0'); p.rect(78, B - 80, 10, 80, '#9cc8f0')
    for (let f = 0; f < 3; f += 1) {
      const y = B - 72 + f * 22
      p.rect(14, y - 2, 64, 2, '#c8c4bc')
      for (let k = 0; k < 4; k += 1) if (k !== 1 && k !== 2) pane(p, 18 + k * 15, y + 2, 10, 12, lit && (f + k) % 3 !== 0)
      p.disc(46, y + 8, 4, lit && f === 1 ? GLASS_LIT : GLASS); p.disc(46, y + 8, 2, lit && f === 1 ? '#fff0c0' : GLINT)
    }
    // the fin up the middle, its neon lines
    p.round(40, B - 104, 12, 30, 5, '#f4a6b8')
    for (let k = 0; k < 4; k += 1) p.rect(42, B - 98 + k * 6, 8, 2, lit ? '#ff4ab0' : '#c86a8a')
    p.rect(34, B - 16, 24, 16, '#c8a050'); pane(p, 38, B - 14, 16, 14, lit)
    if (lit) glows.push({ x: 46, y: B - 90, r: 22, colour: '#ff4ab0' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  tiki: (lit) => {
    const p = new Painter(104, 86), B = 85, glows: Glow[] = []
    // the bamboo posts, the bar, its stools
    for (const x of [12, 88]) { p.rect(x, B - 40, 4, 40, '#c8a050'); for (let y = B - 36; y < B; y += 8) p.rect(x, y, 4, 1, '#8a6a30') }
    p.rect(14, B - 24, 76, 8, '#8a5a30'); p.rect(14, B - 24, 76, 2, '#b07840'); p.rect(18, B - 16, 68, 16, '#5a3a20')
    for (let x = 24; x < 84; x += 14) { p.disc(x, B - 10, 3, '#e2302a'); p.rect(x, B - 7, 1, 7, '#3a2a20') }
    pane(p, 20, B - 38, 64, 12, lit)
    // the straw roof
    p.poly([[0, B - 40], [104, B - 40], [52, B - 74]], '#d8a858')
    for (let k = 0; k < 16; k += 1) p.line(4 + k * 6, B - 41, 52 + (k - 8) * 2, B - 70, 1, '#a87838')
    for (let x = 0; x < 104; x += 3) p.rect(x, B - 41, 2, 3 + (x % 2), '#c09040')
    // the string of bulbs under it, the two torches
    const bulbs = ['#ff4a4a', '#ffd23f', '#3af0ff', '#7aff6a', '#ff6aff']
    for (let k = 0; k < 14; k += 1) p.dot(10 + k * 6, B - 36 + Math.round(Math.sin(k * 0.8) * 1.5), bulbs[k % bulbs.length])
    for (const x of [2, 100]) { p.rect(x, B - 46, 2, 46, '#6a4a28'); p.ellipse(x + 1, B - 50, 3, 5, '#ff8a2a'); p.ellipse(x + 1, B - 49, 1.5, 3, '#ffe060') }
    glows.push({ x: 2, y: B - 50, r: 10, colour: '#ffa040' }, { x: 100, y: B - 50, r: 10, colour: '#ffa040' })
    if (lit) glows.push({ x: 52, y: B - 34, r: 36, colour: '#ffc070' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  station: (lit) => {
    const p = new Painter(112, 96), B = 95, glows: Glow[] = []
    // the shop at the back
    p.rect(66, B - 36, 42, 36, '#c8d8e8'); p.rect(64, B - 40, 46, 4, '#e2302a'); pane(p, 72, B - 30, 18, 14, lit); p.rect(94, B - 26, 9, 26, '#6a6a7a')
    // the canopy on its pillars, the pumps under it
    p.rect(14, B - 60, 64, 9, WHITE); p.rect(14, B - 56, 64, 3, '#e2302a')
    for (const x of [22, 66]) p.rect(x, B - 51, 4, 51, '#e8e4dc')
    for (const x of [32, 48]) { p.round(x, B - 22, 10, 22, 2, '#e2302a'); p.rect(x + 1, B - 20, 8, 5, '#2a2a3a'); p.rect(x + 2, B - 19, 6, 1, lit ? '#7aff6a' : '#3a8a4a'); p.rect(x + 10, B - 16, 2, 8, '#2a2a3a') }
    // the round sign on its pole, a star in it
    p.rect(11, B - 72, 3, 72, '#8a8a9a'); p.disc(12, B - 80, 10, '#ffd23f'); p.disc(12, B - 80, 8, '#e2302a')
    p.poly([[12, B - 87], [14, B - 82], [19, B - 82], [15, B - 79], [17, B - 74], [12, B - 77], [7, B - 74], [9, B - 79], [5, B - 82], [10, B - 82]], '#ffd23f')
    if (lit) glows.push({ x: 46, y: B - 50, r: 34, colour: '#e8f0ff' }, { x: 12, y: B - 80, r: 16, colour: '#ffd040' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  pizza: (lit) => {
    const p = new Painter(80, 88), B = 87, glows: Glow[] = []
    p.rect(4, B - 44, 72, 44, '#b85a3a')
    for (let y = B - 42; y < B; y += 5) for (let x = 4 + ((y / 5) % 2) * 5; x < 76; x += 10) { p.rect(x, y, 1, 5, '#8a3a24'); p.rect(4, y, 72, 1, '#8a3a24') }
    pane(p, 10, B - 30, 34, 16, lit); p.rect(50, B - 28, 14, 28, '#5a3a20')
    awning(p, 6, B - 38, 68, 6, '#e2302a', WHITE)
    // the slice on the roof: crust, cheese, pepperoni
    p.poly([[18, B - 70], [62, B - 70], [40, B - 46]], '#ffd23f'); p.rect(18, B - 74, 44, 5, '#e0a050'); p.rect(18, B - 74, 44, 1, '#f0c070')
    for (const [x, y] of [[30, -65], [44, -66], [38, -58], [50, -62]] as const) p.disc(x, B + y, 3, '#c8301e')
    if (lit) glows.push({ x: 40, y: B - 62, r: 24, colour: '#ffcf60' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  arcade: (lit) => {
    const p = new Painter(88, 92), B = 91, glows: Glow[] = []
    p.rect(4, B - 50, 80, 50, '#3a2a5a')
    const neon = lit ? ['#3af0ff', '#ff4ab0'] : ['#2a8a9a', '#9a3a7a']
    p.rect(4, B - 50, 80, 2, neon[0]); p.rect(4, B - 2, 80, 2, neon[1])
    for (let k = 0; k < 3; k += 1) { const c = ['#3af0ff', '#ff4ab0', '#ffd23f'][k]; p.rect(10 + k * 24, B - 42, 18, 14, lit ? c : tone(c, 0.45)); p.rect(12 + k * 24, B - 40, 14, 10, lit ? tone(c, 1.4) : tone(c, 0.3)) }
    p.rect(34, B - 24, 20, 24, '#1a1428'); p.rect(34, B - 25, 20, 1, neon[0])
    // the joystick on the roof
    p.round(28, B - 60, 32, 10, 3, '#2a2a3a'); p.rect(43, B - 76, 3, 18, '#1a1a22'); p.disc(44, B - 78, 6, '#e2302a'); p.disc(42, B - 80, 2, '#ff8a78')
    p.disc(34, B - 55, 2, '#ffd23f'); p.disc(54, B - 55, 2, '#3af0ff')
    if (lit) glows.push({ x: 44, y: B - 38, r: 36, colour: '#8a5aff' }, { x: 44, y: B - 76, r: 14, colour: '#ff4a4a' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  records: (lit) => {
    const p = new Painter(84, 96), B = 95, glows: Glow[] = []
    p.rect(4, B - 46, 76, 46, '#c8b0e8'); p.rect(2, B - 50, 80, 4, '#8a5ae0')
    pane(p, 10, B - 34, 28, 20, lit); pane(p, 46, B - 34, 28, 20, lit)
    for (let k = 0; k < 3; k += 1) p.rect(14 + k * 7, B - 22, 5, 8, ['#ff6aa0', '#ffd23f', '#3ac070'][k])
    p.rect(36, B - 12, 12, 12, '#5a3a6a')
    // the disc on the roof, its grooves and label, a note
    p.disc(42, B - 68, 18, '#1a1a22')
    for (const r of [15, 12, 9]) for (let a = 0; a < 40; a += 1) p.dot(42 + Math.cos(a * 0.157) * r, B - 68 + Math.sin(a * 0.157) * r, '#3a3a4a')
    p.disc(42, B - 68, 6, '#e2302a'); p.disc(42, B - 68, 1, '#1a1a22')
    p.rect(68, B - 86, 2, 12, lit ? '#3af0ff' : DARK); p.ellipse(66, B - 74, 3, 2, lit ? '#3af0ff' : DARK); p.rect(68, B - 86, 6, 2, lit ? '#3af0ff' : DARK)
    if (lit) glows.push({ x: 42, y: B - 68, r: 26, colour: '#c08aff' }, { x: 69, y: B - 80, r: 10, colour: '#3af0ff' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  chalet: (lit) => {
    const p = new Painter(90, 92), B = 91, glows: Glow[] = []
    // the stone floor, the wooden one over it, the balcony and its flowers
    p.rect(4, B - 22, 82, 22, '#9a9aa4')
    for (let y = B - 20; y < B; y += 5) for (let x = 6 + ((y / 5) % 2) * 4; x < 84; x += 8) p.rect(x, y, 6, 4, '#aeaeb8')
    p.rect(4, B - 56, 82, 34, '#9a6038'); planks(p, 4, B - 56, 82, 34, '#7a4a2a', 3)
    shuttered(p, 12, B - 17, 11, 10, lit, '#3a7a4a'); shuttered(p, 66, B - 17, 11, 10, lit, '#3a7a4a'); p.rect(39, B - 19, 12, 19, '#5a3420'); p.dot(48, B - 9, '#ffd23f')
    shuttered(p, 14, B - 50, 11, 12, lit, '#3a7a4a'); shuttered(p, 40, B - 50, 11, 12, lit, '#3a7a4a'); shuttered(p, 65, B - 50, 11, 12, lit, '#3a7a4a')
    p.rect(2, B - 26, 86, 3, '#6a3e22'); p.rect(2, B - 34, 86, 2, '#c08850')
    for (let x = 3; x < 88; x += 4) p.rect(x, B - 32, 2, 6, '#b07a44')
    for (let x = 6; x < 86; x += 5) p.disc(x, B - 36, 2, x % 10 ? '#e2302a' : '#ff6aa0')
    roofBand(p, 0, 90, B - 56, B - 72, 8, '#5a4a4a', true)
    // the chimney and its snow
    p.rect(64, B - 86, 8, 14, '#8a8a94'); p.rect(63, B - 88, 10, 3, WHITE)
    if (lit) glows.push({ x: 45, y: B - 44, r: 30, colour: '#ffc070' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  alphotel: (lit) => {
    const p = new Painter(110, 128), B = 127, glows: Glow[] = []
    p.rect(6, B - 90, 98, 90, '#f2e6c8'); p.rect(6, B - 12, 98, 12, '#a8a0a0')
    for (let f = 0; f < 3; f += 1) {
      const y = B - 84 + f * 25
      for (let k = 0; k < 5; k += 1) shuttered(p, 15 + k * 19, y, 9, 13, lit && (f * 5 + k) % 3 !== 1, '#8a5a30')
      p.rect(8, y + 15, 94, 2, '#8a5a30'); for (let x = 9; x < 101; x += 3) p.rect(x, y + 11, 1, 4, '#a87040')
    }
    p.rect(38, B - 26, 34, 4, '#c8302a'); pane(p, 45, B - 21, 20, 21, lit)
    roofBand(p, 2, 108, B - 90, B - 106, 10, '#5a3a3a', true)
    for (const x of [30, 51, 72]) { p.rect(x, B - 104, 10, 9, '#f2e6c8'); pane(p, x + 2, B - 102, 6, 6, lit) }
    // three flags on their poles
    for (const [x, c] of [[24, '#e2302a'], [54, '#f6f2e8'], [84, '#e2302a']] as const) { p.rect(x, B - 127, 2, 18, '#8a8a9a'); p.rect(x + 2, B - 127, 12, 7, c); p.rect(x + 2, B - 124, 12, 1, c === WHITE ? '#e2302a' : WHITE) }
    if (lit) glows.push({ x: 55, y: B - 16, r: 28, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  skishop: (lit) => {
    const p = new Painter(80, 88), B = 87, glows: Glow[] = []
    p.rect(4, B - 46, 72, 46, '#b07a48'); planks(p, 4, B - 46, 72, 46, '#8a5a32', 4)
    pane(p, 9, B - 36, 40, 24, lit)
    // skis standing in the window
    ;['#e2302a', '#3a7ae0', '#ffd23f', '#3ac070', '#ff6aa0', '#f6f2e8'].forEach((c, k) => { p.round(12 + k * 6, B - 34, 3, 20, 1, c) })
    p.rect(56, B - 32, 14, 32, '#5a3420'); pane(p, 59, B - 28, 8, 10, lit)
    roofBand(p, 0, 80, B - 46, B - 56, 6, '#4a5a6a', true)
    // the crossed skis and poles on the roof
    p.line(18, B - 62, 62, B - 86, 4, '#e2302a'); p.line(18, B - 86, 62, B - 62, 4, '#3a7ae0')
    p.line(30, B - 60, 30, B - 86, 1, '#c8c8d0'); p.line(50, B - 60, 50, B - 86, 1, '#c8c8d0'); p.disc(30, B - 66, 2, '#2a2a3a'); p.disc(50, B - 66, 2, '#2a2a3a')
    if (lit) glows.push({ x: 29, y: B - 24, r: 26, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  cablecar: (lit) => {
    const p = new Painter(96, 120), B = 119, glows: Glow[] = []
    // the station: its hall, a cabin waiting in it, its office
    p.rect(4, B - 40, 88, 40, '#c8c4bc'); p.rect(4, B - 46, 88, 6, '#8a5a30'); p.rect(0, B - 50, 96, 4, '#5a5a6a')
    p.rect(10, B - 34, 46, 26, lit ? '#4a4258' : '#3a3a4a'); p.rect(10, B - 8, 46, 2, '#8a8a94')
    p.round(23, B - 30, 20, 16, 3, '#e2302a'); pane(p, 26, B - 27, 14, 6, lit); p.rect(32, B - 34, 2, 4, '#2a2a3a')
    pane(p, 64, B - 32, 20, 12, lit); p.rect(66, B - 18, 14, 18, '#6a4028')
    // the pylon on its roof, in steel lattice, its wheel, the cable going up the mountain, a cabin on its way
    p.poly([[38, B - 50], [54, B - 50], [49, B - 104], [43, B - 104]], '#8a8a9a')
    for (let y = B - 54; y > B - 102; y -= 8) { const w = 16 - ((B - 50 - y) / 54) * 10, x = 46 - w / 2; p.line(x, y, x + w, y - 8, 1, '#5a5a6a'); p.line(x + w, y, x, y - 8, 1, '#5a5a6a') }
    p.rect(34, B - 107, 24, 3, '#5a5a6a'); p.disc(46, B - 110, 3, '#3a3a4a')
    p.line(46, B - 110, 95, B - 118, 1, '#2a2a3a'); p.line(4, B - 102, 46, B - 110, 1, '#2a2a3a')
    p.rect(78, B - 115, 1, 6, '#2a2a3a'); p.round(71, B - 110, 16, 13, 3, '#e2302a'); pane(p, 74, B - 107, 10, 5, lit)
    if (lit) glows.push({ x: 33, y: B - 22, r: 26, colour: '#ffd890' }, { x: 79, y: B - 104, r: 12, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  cheese: (lit) => {
    const p = new Painter(80, 86), B = 85, glows: Glow[] = []
    p.rect(4, B - 42, 72, 42, '#c89858'); planks(p, 4, B - 42, 72, 42, '#a87840', 4, true)
    pane(p, 9, B - 30, 34, 16, lit)
    for (let k = 0; k < 3; k += 1) { p.ellipse(16 + k * 10, B - 18, 5, 3, '#f2c838'); p.ellipse(16 + k * 10, B - 19, 5, 2, '#ffe070') }
    p.rect(50, B - 30, 16, 30, '#6a4028'); pane(p, 53, B - 27, 10, 9, lit)
    awning(p, 6, B - 36, 68, 5, '#ffd23f', WHITE)
    roofBand(p, 0, 80, B - 42, B - 50, 6, '#6a4a3a', false)
    // the giant wedge on the roof, its holes
    p.poly([[12, B - 52], [68, B - 52], [68, B - 66], [12, B - 58]], '#f2c838')
    p.poly([[12, B - 58], [68, B - 66], [54, B - 80]], '#ffe070')
    for (const [x, y, r] of [[22, -55, 2], [36, -57, 3], [52, -58, 2], [60, -56, 2], [44, -70, 2], [56, -72, 2]] as const) p.disc(x, B + y, r, '#d8a820')
    if (lit) glows.push({ x: 26, y: B - 22, r: 22, colour: '#ffd890' }, { x: 40, y: B - 64, r: 22, colour: '#ffe070' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  chapel: (lit) => {
    const p = new Painter(72, 120), B = 119, glows: Glow[] = []
    p.rect(10, B - 50, 52, 50, '#f4f0e8'); p.rect(10, B - 6, 52, 6, '#c8c0b4')
    p.rect(30, B - 20, 12, 20, '#6a4028'); p.disc(36, B - 20, 6, '#6a4028')
    p.disc(36, B - 36, 5, lit ? GLASS_LIT : '#3a5a9a'); p.disc(36, B - 36, 2, lit ? '#fff0c0' : '#e2302a')
    for (const x of [16, 50]) { pane(p, x, B - 34, 6, 14, lit); p.disc(x + 3, B - 34, 3, lit ? GLASS_LIT : GLASS) }
    roofBand(p, 6, 66, B - 50, B - 62, 8, '#7a3a2a', false)
    // the bell tower, its bell, its dome
    p.rect(27, B - 92, 18, 32, '#f4f0e8'); p.rect(30, B - 88, 12, 12, '#3a2a2a'); p.disc(36, B - 81, 4, '#e0b040'); p.rect(33, B - 78, 6, 2, '#e0b040')
    p.rect(26, B - 94, 20, 3, '#c8c0b4')
    p.ellipse(36, B - 102, 10, 9, '#3a6a4a'); p.ellipse(34, B - 104, 4, 4, '#5a8a5a'); p.rect(35, B - 116, 2, 8, '#e0b040'); p.disc(36, B - 117, 2, '#e0b040')
    if (lit) glows.push({ x: 36, y: B - 30, r: 24, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  adobe: (lit) => {
    const p = new Painter(86, 80), B = 79, glows: Glow[] = []
    // two rounded storeys of earth, the beams through them
    p.round(4, B - 40, 78, 40, 4, '#d4945c'); p.round(14, B - 60, 48, 24, 4, '#dca06a')
    for (let x = 8; x < 80; x += 9) p.rect(x, B - 38, 4, 3, '#6a4a2a')
    for (let x = 18; x < 60; x += 9) p.rect(x, B - 58, 4, 3, '#6a4a2a')
    pane(p, 12, B - 28, 10, 10, lit); p.rect(11, B - 29, 12, 1, '#2a9a9a'); pane(p, 32, B - 28, 10, 10, lit); p.rect(31, B - 29, 12, 1, '#2a9a9a')
    pane(p, 30, B - 52, 8, 8, lit); p.rect(56, B - 26, 13, 26, '#2a9a9a'); p.rect(58, B - 24, 9, 22, '#3ab0b0')
    // the strings of red chillies, the ladder up to the roof
    for (const x of [51, 74]) for (let k = 0; k < 6; k += 1) p.ellipse(x + (k % 2), B - 30 + k * 3, 2, 1.6, '#c8201a')
    p.line(68, B - 40, 65, B - 59, 1, '#7a5432'); p.line(74, B - 40, 71, B - 59, 1, '#7a5432')
    for (let k = 0; k < 5; k += 1) p.line(68 - k * 0.6, B - 43 - k * 4, 74 - k * 0.6, B - 43 - k * 4, 1, '#7a5432')
    if (lit) glows.push({ x: 30, y: B - 24, r: 22, colour: '#ffc070' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  saloon: (lit) => {
    const p = new Painter(96, 116), B = 115, glows: Glow[] = []
    // the false front, its steps on top
    p.rect(6, B - 76, 84, 76, '#a86a3a'); planks(p, 6, B - 76, 84, 76, '#8a5228', 4, true)
    p.rect(20, B - 84, 56, 8, '#a86a3a'); p.rect(36, B - 90, 24, 6, '#a86a3a'); p.rect(4, B - 77, 88, 2, '#6a4024'); p.rect(18, B - 85, 60, 2, '#6a4024')
    // the balcony, the windows over it
    pane(p, 14, B - 70, 14, 12, lit); pane(p, 41, B - 70, 14, 12, lit); pane(p, 68, B - 70, 14, 12, lit)
    p.rect(8, B - 56, 80, 2, '#6a4024'); for (let x = 9; x < 88; x += 4) p.rect(x, B - 54, 1, 5, '#6a4024'); p.rect(8, B - 49, 80, 2, '#6a4024')
    // the porch on its posts, the swinging doors
    p.rect(0, B - 40, 96, 5, '#6a4024'); for (const x of [3, 46, 90]) p.rect(x, B - 35, 3, 35, '#7a4a28')
    pane(p, 12, B - 28, 18, 14, lit); pane(p, 66, B - 28, 18, 14, lit)
    p.rect(39, B - 30, 18, 30, lit ? '#ffcf70' : '#2a1a14'); p.rect(40, B - 24, 7, 14, '#c88a4a'); p.rect(49, B - 24, 7, 14, '#c88a4a')
    // the lucky horseshoe on top, its nails
    for (let a = 0; a <= 40; a += 1) { const t = (a / 40) * Math.PI; p.disc(48 + Math.cos(t) * 9, B - 102 + Math.sin(t) * 9, 2.4, '#b8b8c4') }
    for (const t of [0.4, 1.1, 2.0, 2.7]) p.dot(48 + Math.cos(t) * 9, B - 102 + Math.sin(t) * 9, '#4a4a5a')
    if (lit) glows.push({ x: 48, y: B - 20, r: 30, colour: '#ffc070' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  tradingpost: (lit) => {
    const p = new Painter(100, 90), B = 89, glows: Glow[] = []
    p.rect(4, B - 44, 92, 44, '#9a7048'); planks(p, 4, B - 44, 92, 44, '#7a5432', 4)
    p.rect(2, B - 48, 96, 4, '#7a5432')
    pane(p, 10, B - 28, 18, 14, lit); p.rect(40, B - 30, 14, 30, '#5a3a20')
    // the blankets hanging under the porch, the barrels
    for (let k = 0; k < 3; k += 1) {
      const x = 60 + k * 11
      p.rect(x, B - 30, 9, 18, ['#c8301e', '#2a2a3a', '#e8d8b0'][k]); p.rect(x, B - 26, 9, 2, ['#f2e6c8', '#c8301e', '#2a2a3a'][k])
      for (let y = B - 22; y < B - 14; y += 3) p.rect(x + 2, y, 5, 1, ['#2a2a3a', '#e8d8b0', '#c8301e'][k])
    }
    for (const x of [6, 30]) { p.round(x, B - 12, 9, 12, 2, '#8a5a30'); p.rect(x, B - 9, 9, 1, '#4a4a54'); p.rect(x, B - 4, 9, 1, '#4a4a54') }
    p.rect(0, B - 34, 100, 4, '#6a4a2a'); for (const x of [2, 56, 96]) p.rect(x, B - 30, 2, 30, '#6a4a2a')
    // the giant hat on the roof
    p.ellipse(50, B - 52, 28, 4, '#8a5a2a'); p.round(36, B - 72, 28, 20, 7, '#9a6a34'); p.rect(36, B - 58, 28, 3, '#3a2a1a'); p.rect(46, B - 72, 8, 4, '#7a4a20')
    if (lit) glows.push({ x: 20, y: B - 22, r: 24, colour: '#ffc070' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  cinema: (lit) => {
    const p = new Painter(104, 150), B = 149, glows: Glow[] = []
    p.rect(4, B - 110, 96, 110, '#e8d8f0')
    for (const x of [26, 52, 78]) p.rect(x, B - 106, 3, 66, '#d0bce0')
    const neon = lit ? ['#3af0ff', '#ff4ab0'] : ['#7ab8c8', '#c87aa0']
    for (const y of [B - 104, B - 82, B - 60]) p.rect(28, y, 72, 2, neon[(y / 2) % 2 ? 0 : 1])
    for (let f = 0; f < 3; f += 1) for (let k = 0; k < 3; k += 1) pane(p, 34 + k * 22, B - 100 + f * 22, 14, 14, lit && (f + k) % 2 === 0)
    // the marquee and its bulbs, the posters, the doors
    p.rect(0, B - 44, 104, 12, '#2a1a3a'); for (let x = 2; x < 102; x += 4) { p.dot(x, B - 43, lit ? '#fff2a0' : '#c8a850'); p.dot(x, B - 34, lit ? '#fff2a0' : '#c8a850') }
    p.rect(8, B - 40, 88, 4, lit ? '#ff4ab0' : '#8a3a6a')
    for (const x of [8, 82]) { p.rect(x, B - 28, 14, 20, '#2a2a3a'); p.rect(x + 2, B - 26, 10, 16, x < 50 ? '#e2307a' : '#3a7ae0'); p.disc(x + 7, B - 21, 3, '#ffd23f') }
    pane(p, 30, B - 28, 44, 28, lit); for (let x = 41; x < 74; x += 11) p.rect(x, B - 28, 1, 28, '#c8b8d8')
    // the neon blade up the front, stars down it
    p.rect(6, B - 108, 16, 58, '#e2307a'); p.rect(8, B - 106, 12, 54, lit ? '#ff7ac0' : '#a83a6a')
    for (let k = 0; k < 6; k += 1) p.poly([[14, B - 103 + k * 9], [16, B - 99 + k * 9], [14, B - 95 + k * 9], [12, B - 99 + k * 9]], lit ? '#ffffff' : '#ffd23f')
    // the film reels on the roof
    for (const [x, y, r] of [[50, -124, 13], [76, -120, 10]] as const) { p.disc(x, B + y, r, '#3a3a4a'); for (let k = 0; k < 5; k += 1) p.disc(x + Math.cos(k * 1.257) * r * 0.55, B + y + Math.sin(k * 1.257) * r * 0.55, r * 0.2, '#e8d8f0'); p.disc(x, B + y, 2, '#e8d8f0') }
    p.line(40, B - 113, 88, B - 113, 2, '#3a3a4a')
    if (lit) glows.push({ x: 14, y: B - 80, r: 26, colour: '#ff4ab0' }, { x: 52, y: B - 38, r: 40, colour: '#ffd890' }, { x: 64, y: B - 82, r: 30, colour: '#3af0ff' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  tower: (lit) => {
    const p = new Painter(90, 230), B = 229, glows: Glow[] = []
    p.rect(6, B - 200, 78, 200, '#3a4a7a'); p.rect(6, B - 200, 4, 200, '#4a5a8a'); p.rect(80, B - 200, 4, 200, '#2a3a62')
    // its floors of windows, lit here and there after dark
    for (let y = B - 194, f = 0; y < B - 24; y += 12, f += 1) for (let x = 13, k = 0; x < 78; x += 11, k += 1) {
      const on = lit && ((f * 7 + k * 13) % 10) < 6
      p.rect(x, y, 8, 8, on ? GLASS_LIT : '#2a3a62'); if (!on) p.dot(x + 1, y + 1, GLINT)
    }
    p.rect(6, B - 24, 78, 3, '#c8c8d8'); pane(p, 20, B - 20, 50, 20, lit); for (let x = 32; x < 70; x += 12) p.rect(x, B - 20, 1, 20, '#c8c8d8')
    // its crown in steps, the antenna and its light
    p.rect(14, B - 208, 62, 8, '#4a5a8a'); p.rect(28, B - 218, 34, 10, '#5a6a9a')
    p.rect(44, B - 229, 2, 11, '#c8c8d8'); p.disc(45, B - 228, 2, '#ff3a2a')
    glows.push({ x: 45, y: B - 228, r: 8, colour: '#ff3a2a' })
    if (lit) glows.push({ x: 45, y: B - 12, r: 30, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  club: (lit) => {
    const p = new Painter(92, 104), B = 103, glows: Glow[] = []
    p.rect(4, B - 70, 84, 70, '#2a1a3a')
    const a = lit ? '#ff4ab0' : '#8a3a6a', b = lit ? '#3af0ff' : '#2a7a8a'
    for (let x = 6; x < 86; x += 8) { p.line(x, B - 58, x + 4, B - 64, 2, a); p.line(x + 4, B - 64, x + 8, B - 58, 2, a); p.line(x, B - 46, x + 4, B - 52, 2, b); p.line(x + 4, B - 52, x + 8, B - 46, 2, b) }
    for (let x = 12; x < 84; x += 12) p.disc(x, B - 36, 3, lit ? ['#ffd23f', '#ff4ab0', '#3af0ff', '#7aff6a'][(x / 12) % 4] : '#4a3a5a')
    // the door in its neon frame, the red rope on its posts
    p.rect(36, B - 30, 20, 30, a); p.rect(38, B - 28, 16, 28, '#140c20')
    for (const x of [22, 70]) { p.rect(x, B - 12, 2, 12, '#e0b040'); p.disc(x + 1, B - 13, 2, '#e0b040') }
    for (let x = 23; x < 36; x += 1) p.dot(x, B - 11 + Math.round(Math.sin(((x - 23) / 13) * Math.PI) * 3), '#c8201a')
    for (let x = 56; x < 71; x += 1) p.dot(x, B - 11 + Math.round(Math.sin(((x - 56) / 15) * Math.PI) * 3), '#c8201a')
    // the mirror ball on the roof
    p.rect(44, B - 100, 4, 6, '#8a8a9a'); p.disc(46, B - 83, 13, '#a8a8c0')
    for (let y = -12; y <= 12; y += 3) for (let x = -12; x <= 12; x += 3) if (x * x + y * y < 140 && ((x + y) / 3) % 2 === 0) p.rect(46 + x, B - 83 + y, 2, 2, '#e8e8f8')
    for (const [x, y] of [[28, -94], [66, -90], [62, -74]] as const) { p.rect(x - 2, B + y, 5, 1, WHITE); p.rect(x, B + y - 2, 1, 5, WHITE) }
    glows.push({ x: 46, y: B - 83, r: 22, colour: lit ? '#c8a8ff' : '#8a8aa8' })
    if (lit) glows.push({ x: 46, y: B - 55, r: 36, colour: '#ff4ab0' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  boutique: (lit) => {
    const p = new Painter(80, 100), B = 99, glows: Glow[] = []
    p.rect(4, B - 64, 72, 64, '#f6c8d8'); p.rect(2, B - 66, 76, 3, WHITE)
    for (let k = 0; k < 3; k += 1) { pane(p, 12 + k * 22, B - 60, 12, 10, lit); p.rect(10 + k * 22, B - 50, 16, 2, WHITE) }
    awning(p, 6, B - 46, 68, 5, '#2a2a2a', WHITE)
    // the window and its mannequins in their dresses, the door
    pane(p, 8, B - 38, 46, 26, lit)
    for (const [x, c] of [[16, '#e2302a'], [30, '#3a7ae0'], [44, '#ffd23f']] as const) { p.disc(x, B - 33, 2, '#f2d8c8'); p.poly([[x - 1, B - 31], [x + 1, B - 31], [x + 5, B - 16], [x - 5, B - 16]], c) }
    p.rect(60, B - 34, 12, 34, '#2a2a2a'); pane(p, 62, B - 32, 8, 20, lit)
    // the giant shopping bag on the roof, its handles, its bow
    p.rect(26, B - 90, 28, 22, '#ff4ab0'); p.rect(26, B - 90, 28, 3, '#e2307a')
    for (const x of [32, 48]) for (let a = 0; a <= 12; a += 1) p.dot(x + Math.cos((a / 12) * Math.PI) * 4, B - 91 - Math.sin((a / 12) * Math.PI) * 5, '#2a2a2a')
    p.poly([[40, B - 80], [34, B - 84], [34, B - 76]], WHITE); p.poly([[40, B - 80], [46, B - 84], [46, B - 76]], WHITE)
    if (lit) glows.push({ x: 31, y: B - 26, r: 30, colour: '#ffd0e0' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
  cafe: (lit) => {
    const p = new Painter(96, 92), B = 91, glows: Glow[] = []
    p.rect(4, B - 58, 88, 58, '#2a6a4a'); p.rect(2, B - 60, 92, 3, '#e0b040')
    for (let k = 0; k < 4; k += 1) { pane(p, 12 + k * 20, B - 54, 12, 10, lit); for (let x = 0; x < 12; x += 3) p.disc(12 + k * 20 + x + 1, B - 44, 1.5, '#ff6aa0') }
    awning(p, 6, B - 40, 84, 6, '#2a8a5a', WHITE)
    pane(p, 10, B - 32, 52, 22, lit); p.rect(68, B - 32, 16, 32, '#1a3a2a'); pane(p, 71, B - 29, 10, 14, lit)
    // the terrace: little round tables, their chairs
    for (const x of [20, 46]) { p.ellipse(x, B - 9, 7, 2, '#e8e4dc'); p.rect(x, B - 8, 1, 8, '#6a6a7a'); p.rect(x - 11, B - 10, 2, 10, '#c8301e'); p.rect(x + 9, B - 10, 2, 10, '#c8301e') }
    // the giant croissant on the roof
    for (let k = 0; k < 7; k += 1) { const t = Math.PI * (0.12 + (k / 6) * 0.76), r = k === 0 || k === 6 ? 4 : k === 3 ? 8 : 6.5; p.disc(48 - Math.cos(t) * 22, B - 66 - Math.sin(t) * 10, r, k % 2 ? '#e8a850' : '#d89040') }
    for (let k = 1; k < 6; k += 1) { const t = Math.PI * (0.12 + ((k + 0.5) / 6) * 0.76); p.line(48 - Math.cos(t) * 22, B - 72 - Math.sin(t) * 10, 48 - Math.cos(t) * 22, B - 62 - Math.sin(t) * 10, 1, '#a86a2a') }
    if (lit) glows.push({ x: 36, y: B - 22, r: 34, colour: '#ffd890' })
    p.outline(INK_LINE)
    return { pic: p.pic, glows }
  },
}

/** Rows `from` to `to` of a picture, and of those its columns `x0` to `x1`, as a picture of their own. */
function cut(pic: PixelBuffer, from: number, to: number, x0 = 0, x1 = pic.width): PixelBuffer {
  const out = new PixelBuffer(x1 - x0, to - from, '#000000')
  out.data.fill(0)
  for (let y = from; y < to; y += 1) out.data.set(pic.data.subarray((y * pic.width + x0) * 4, (y * pic.width + x1) * 4), (y - from) * (x1 - x0) * 4)
  return out
}

const made = new Map<string, Shop>()
/** A shop, by day or lit after dark: made once, cut into its front and its roof's things, then kept. */
export function shop(kind: ShopKind, lit: boolean): Shop {
  const key = `${kind}|${lit}`
  let s = made.get(key)
  if (s) return s
  const { pic, glows } = draw[kind](lit), built = BUILT[kind]
  const front = cut(pic, built.roof, pic.height)
  // what stands on the roof: the columns where anything is drawn above it
  let x0 = pic.width, x1 = -1
  for (let y = 0; y < built.roof; y += 1) for (let x = 0; x < pic.width; x += 1) if (pic.data[(y * pic.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
  const top = x1 >= x0 ? { pic: cut(pic, 0, built.roof, x0, x1 + 1), x0, glows: glows.filter((g) => g.y < built.roof).map((g) => ({ ...g, x: g.x - x0 })) } : null
  s = { pic, glows, ...built, front, frontGlows: glows.filter((g) => g.y >= built.roof).map((g) => ({ ...g, y: g.y - built.roof })), top }
  made.set(key, s)
  return s
}
