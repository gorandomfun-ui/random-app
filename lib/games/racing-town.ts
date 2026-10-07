/**
 * The promenade's shops, each one telling what it is by how it looks rather
 * than by a name: the ice-cream parlour with its giant cone on the roof, the
 * surf shop with its boards against the front and one on the roof, the
 * burger stand under its giant burger, the diner in chrome with its coffee
 * cup sign, the motel and its arrow of bulbs, the art deco hotel and its
 * fin, the tiki bar under its straw, the filling station and its pumps, the
 * pizzeria and its slice, the arcade and its joystick, the record shop and
 * its disc. After dark their windows are lit and their signs glow.
 *
 * Each is drawn once into a picture, clear round it, at one scale for all
 * (`TOWN_UNIT` half widths of the road a pixel), and stands by the road
 * like the palms.
 */

import { INK_LINE, Painter, tone } from './racing-paint'
import type { PixelBuffer } from './pixels'

export type ShopKind = 'icecream' | 'surf' | 'burger' | 'diner' | 'motel' | 'hotel' | 'tiki' | 'station' | 'pizza' | 'arcade' | 'records'
export const SHOPS: readonly ShopKind[] = ['icecream', 'surf', 'burger', 'diner', 'motel', 'hotel', 'tiki', 'station', 'pizza', 'arcade', 'records']
/** How tall a pixel of a shop's picture stands, in half widths of the road. */
export const TOWN_UNIT = 0.034

/** A shop's picture and where its lights glow after dark (in its pixels). */
export type Shop = { pic: PixelBuffer; glows: Array<{ x: number; y: number; r: number; colour: string }> }

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

const draw: Record<ShopKind, (lit: boolean) => Shop> = {
  icecream: (lit) => {
    const p = new Painter(84, 96), B = 95, glows: Shop['glows'] = []
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
    const p = new Painter(92, 86), B = 85, glows: Shop['glows'] = []
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
    const p = new Painter(72, 84), B = 83, glows: Shop['glows'] = []
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
    const p = new Painter(110, 92), B = 91, glows: Shop['glows'] = []
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
    const p = new Painter(124, 100), B = 99, glows: Shop['glows'] = []
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
    const p = new Painter(92, 112), B = 111, glows: Shop['glows'] = []
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
    const p = new Painter(104, 86), B = 85, glows: Shop['glows'] = []
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
    const p = new Painter(112, 96), B = 95, glows: Shop['glows'] = []
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
    const p = new Painter(80, 88), B = 87, glows: Shop['glows'] = []
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
    const p = new Painter(88, 92), B = 91, glows: Shop['glows'] = []
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
    const p = new Painter(84, 96), B = 95, glows: Shop['glows'] = []
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
}

const made = new Map<string, Shop>()
/** A shop, by day or lit after dark: made once, then kept. */
export function shop(kind: ShopKind, lit: boolean): Shop {
  const key = `${kind}|${lit}`
  let s = made.get(key)
  if (!s) { s = draw[kind](lit); made.set(key, s) }
  return s
}
