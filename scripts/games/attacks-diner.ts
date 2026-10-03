/**
 * RANDOM ATTACKS' fast food drawn again over the traced picture, on its
 * very shapes but calmer, the way the other games' buildings are drawn: flat
 * colours, two or three tones a surface, a few lights. The wing roof cream
 * with its red line, its red underside with four lights; the low canopy on
 * the left; the leaning turquoise pillars and their portholes; the glass
 * lit warm from inside — pendant lamps, the booths, the counter and its
 * stools, the menu with three burgers — the round airlock door; the base;
 * the spire rising from behind the roof, and its ring.
 *
 * Drawn at a `scale` of its shapes on the picture (measured on the 768 × 432
 * title), standing on the same ground line: each pixel of the screen asks
 * what the building is at that point of its shapes, so it is drawn sharp at
 * any size.
 */

export type RGB = [number, number, number]
type Paint = (x: number, y: number, c: RGB) => void

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
const dither = (x: number, y: number, t: number) => t * 16 > BAYER[y & 3][x & 3] + 0.5
/** A ramp of colours at `t`, dithered between neighbours. */
const ramp = (colors: readonly RGB[], t: number, x: number, y: number): RGB => {
  const f = Math.max(0, Math.min(colors.length - 1.001, t * (colors.length - 1))), i = Math.floor(f)
  return dither(x, y, f - i) ? colors[i + 1] : colors[i]
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** A line through points, as y for an x (held flat beyond its ends). */
const through = (points: ReadonlyArray<readonly [number, number]>) => (x: number): number => {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i += 1) if (x <= points[i][0]) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) }
  return points[points.length - 1][1]
}
function inPolygon(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const C = {
  creamTop: [255, 247, 228], cream: [246, 228, 196], creamShade: [224, 202, 176], face: [196, 172, 180], stripe: [222, 40, 36],
  underLight: [242, 104, 50], under: [210, 52, 34], underDark: [150, 34, 34],
  tealLight: [112, 218, 198], teal: [40, 174, 158], tealDark: [22, 116, 110], port: [96, 24, 36], portRim: [172, 52, 60],
  mullion: [138, 124, 150], mullionLight: [196, 186, 206],
  booth: [198, 44, 40], boothLight: [242, 100, 72], boothDark: [120, 26, 32], table: [214, 206, 214],
  counterTop: [252, 242, 222], counter: [212, 204, 212], counterShade: [168, 158, 176], stool: [226, 48, 48], pole: [104, 94, 120],
  menu: [44, 32, 50], menuFrame: [226, 214, 196],
  doorFrame: [244, 232, 208], doorFrameShade: [200, 184, 172], door: [146, 172, 196], doorShade: [104, 128, 158], porthole: [26, 32, 56], portLight: [206, 224, 238], plaque: [240, 132, 42],
  baseTop: [246, 236, 222], base: [196, 186, 204], baseDark: [128, 114, 142],
  spireLight: [255, 172, 92], spire: [232, 86, 36], spireDark: [160, 44, 30],
  ring: [253, 228, 178], ringShade: [228, 150, 80],
  lampCore: [255, 251, 232], lamp: [255, 222, 132], lampHalo: [255, 226, 150],
} satisfies Record<string, RGB>
/** The ceiling seen through the glass, amber and its strips of light; the room under it, warm to the booths. */
const CEILING: RGB[] = [[240, 164, 76], [255, 222, 140]]
const ROOM: RGB[] = [[236, 150, 66], [222, 118, 54], [190, 84, 44], [150, 58, 40]]

/** The shapes, as measured on the picture. */
const ROOF_TOP = through([[163, 177], [178, 173], [298, 203], [400, 231], [502, 259], [606, 288]])
const SLAB = 14
const CANOPY_TOP = through([[141, 281], [250, 264]])
const CANOPY_BOTTOM = through([[141, 296], [250, 288]])
const RIGHT_BOTTOM = through([[415, 284], [452, 288], [606, 299]])
const GLASS_TOP_MID = 258
const BASE_TOP = 356, BASE_BOTTOM = 368
const UNDERSIDE: Array<[number, number]> = [[172, 189], [415, 251], [415, 262], [282, GLASS_TOP_MID], [238, GLASS_TOP_MID], [180, 201]]
type Pillar = { top: [number, number, number]; bottom: [number, number, number]; ports: Array<[number, number, number, number]> }
const PILLARS: Pillar[] = [
  { top: [208, 215, 236], bottom: [362, 276, 285], ports: [[246.5, 236, 5, 7], [254, 265, 4, 6], [262, 289, 3.5, 5]] },
  { top: [266, 415, 452], bottom: [362, 432, 440], ports: [[439, 287.5, 5, 6.5], [437, 311, 3, 6]] },
  { top: [294, 555, 577], bottom: [360, 561, 567], ports: [[562, 307, 3, 6]] },
  { top: [290, 160, 175], bottom: [360, 167, 174], ports: [] },
]
const LAMPS: Array<[number, number]> = [[192, 312], [228, 315], [296, 300], [459, 315], [506, 310], [534, 315]]
const MULLIONS = [190, 212, 244, 300, 332, 466, 490, 520, 548, 584]
const UNDER_LIGHTS: Array<[number, number]> = [[202, 216], [222, 237], [305, 241], [345, 251]]
const SPIRE: Array<[number, number]> = [[339, 159], [347, 222], [331, 222]]
const RING = { cx: 338.3, cy: 199.3, rx: 32.5, ry: 7.2 }
/** Where the building stands: the middle of its base, on the ground line. */
export const DINER_FOOT = { x: 380, y: BASE_BOTTOM }
/** Its extent on the picture, at full size. */
export const DINER_BOX = { x0: 138, y0: 156, x1: 610, y1: BASE_BOTTOM }
/** Where its glass runs along the ground, at full size: the warm light falls on the ground in front of it. */
export const DINER_GLASS = { x0: 160, x1: 596 }

/**
 * What the building is at a point of its shapes (`x`, `y` on the picture),
 * `X`, `Y` the screen's pixel (for the grain), `px` one screen pixel in the
 * shapes' units; null where it is not.
 */
function dinerAt(x: number, y: number, X: number, Y: number, px: number): RGB | null {
  // the pillars, in front of everything
  for (const p of PILLARS) {
    const [ty, tl, tr] = p.top, [by, bl, br] = p.bottom
    if (y < ty || y >= by) continue
    const t = (y - ty) / (by - ty), l = tl + (bl - tl) * t, r = tr + (br - tr) * t
    if (x < l || x >= r) continue
    for (const [cx, cy, rx, ry] of p.ports) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
      if (d <= 1) return d > 0.72 ? C.tealDark : x < cx && y < cy ? C.portRim : C.port
    }
    const u = (x - l) / Math.max(1, r - l)
    return u < 0.18 ? C.tealLight : u > 0.78 ? C.tealDark : C.teal
  }
  // the wing's slab: the cream top lit along its edge, the red line, the front face
  const top = ROOF_TOP(x)
  if (x >= 163 && x < 607 && y >= top && y < top + SLAB) {
    const k = y - top
    if ((x < 166 || x > 604) && (k < px || k >= SLAB - px)) return null
    return k < px ? C.creamTop : k < 8 ? C.cream : k < 10 ? C.stripe : k < 10 + px ? C.creamShade : C.face
  }
  // the ring's near half, the spire rising from behind the roof, the ring's far half
  const ringD = Math.hypot((x - RING.cx) / RING.rx, (y - RING.cy) / RING.ry)
  const onRing = ringD <= 1 && ringD >= 0.68
  if (onRing && y > RING.cy) return y > RING.cy + 1.7 ? C.ringShade : C.ring
  if (y < top && inPolygon(x, y, SPIRE)) return x < 337 ? C.spireLight : x > 341 ? C.spireDark : C.spire
  if (onRing) return C.ring
  // the roof on the right, under the slab: a red band and the canopy's cream lip
  if (x >= 415 && x < 606 && y >= top + SLAB && y < RIGHT_BOTTOM(x) + 1) {
    const b = RIGHT_BOTTOM(x) + 1 - y
    return b < 4 ? (b > 4 - px ? C.creamTop : b < px ? C.creamShade : C.cream) : y - top - SLAB < 2 ? C.underDark : C.under
  }
  // the low canopy on the left: cream on top, a red band under it
  if (x >= 141 && x < 252) {
    const ct = CANOPY_TOP(x), cb = CANOPY_BOTTOM(x) + 1
    if (y >= ct && y < cb && !(x < 145 && (y < ct + px || y >= cb - px))) {
      const mid = ct + (cb - ct) * 0.6
      return y < ct + px ? C.creamTop : y < mid ? C.cream : y < mid + px ? C.creamShade : y >= cb - 2 ? C.underDark : C.stripe
    }
  }
  // the red underside of the wing, lit along the roof, its four lights
  if (inPolygon(x, y, UNDERSIDE)) {
    for (const [lx, ly] of UNDER_LIGHTS) {
      const d = Math.hypot(x - lx, (y - ly) * 1.6)
      if (d < 1.4) return [255, 250, 226]
      if (d < 2.6) return [255, 214, 140]
    }
    const below = y - (top + SLAB)
    return below < 3 ? C.underLight : ramp([C.under, C.under, C.underDark], Math.min(1, below / 46), X, Y)
  }
  // the base all along
  if (x >= 158 && x < 598 && y >= BASE_TOP && y < BASE_BOTTOM) return y < BASE_TOP + px ? C.baseTop : y >= BASE_BOTTOM - 2 ? C.baseDark : C.base
  // the door: a cream frame, two leaves with a porthole each, the plaque
  if (x >= 374 && x < 427 && y >= 304 && y < BASE_TOP) {
    for (const [cx, cy] of [[390.5, 328.5], [411.5, 328.5]]) {
      const d = Math.hypot(x - cx, y - cy) / 5.5
      if (d <= 1) return d > 0.78 ? C.portLight : x < cx - 1 && y < cy - 1 && d < 0.5 ? [64, 80, 112] : C.porthole
    }
    if (x >= 388 && x < 413 && y >= 352 && y < 355) return C.plaque
    if (x >= 379 && x < 422 && y >= 312) return (x >= 400 && x < 402) || x >= 418 || y >= 352 ? C.doorShade : C.door
    return x < 377 || y < 307 ? C.doorFrame : C.doorFrameShade
  }
  // the glass, and the room behind it
  const glassTop = x < 250 ? CANOPY_BOTTOM(x) + 1 : x < 415 ? GLASS_TOP_MID : RIGHT_BOTTOM(x) + 1
  if (x < DINER_GLASS.x0 || x >= DINER_GLASS.x1 || y < glassTop || y >= BASE_TOP) return null
  if (y < glassTop + px) return C.mullion
  // the mullions
  for (const mx of MULLIONS) if (x >= mx && x < mx + 2) return x < mx + 1 ? C.mullion : C.mullionLight
  // the lamps on their wires
  for (const [lx, ly] of LAMPS) {
    const d = Math.hypot(x - (lx + 0.5), y - (ly + 0.5)) / 6
    if (d <= 1) { if (d <= 0.7) return d > 0.45 ? C.lamp : C.lampCore; if (dither(X, Y, 0.5)) return C.lampHalo }
    if (Math.abs(x - lx - 0.5) < 0.5 * px + 0.01 && y < ly - 3) return C.pole
  }
  // the menu over the counter, three burgers on it
  if (x >= 316 && x < 370 && y >= 290 && y < 305) {
    for (const mx of [324, 339, 354]) {
      const u = x - mx, v = y - 294
      if (u >= 0 && u < 6 && v >= 0 && v < 5) return v < 2 ? [242, 168, 72] : v < 3 ? [76, 184, 64] : v < 4 ? [104, 44, 28] : [214, 124, 58]
    }
    return x < 317 || x >= 369 || y < 291 || y >= 304 ? C.menuFrame : C.menu
  }
  // the counter and its stools, in the middle
  if (x >= 290 && x < 373 && y >= 336 && y < 350) return y < 338 ? C.counterTop : y >= 349 || Math.floor(x) % 12 === 0 ? C.counterShade : C.counter
  for (const sx of [296, 310, 324, 338, 352, 366]) {
    if (y >= 350 && y < 352 && Math.abs(x - sx - 0.5) < 2.5) return y >= 351 && x > sx + 1.5 ? C.boothDark : C.stool
    if (y >= 352 && Math.abs(x - sx - 0.5) < 0.5 * px + 0.01) return C.pole
  }
  // the booths along the glass, left and right, a table between each pair
  for (const [b0, b1] of [[178, 284], [432, 594]]) {
    if (x < b0 || x >= b1 || y < 338) continue
    const k = (x - b0) % 26
    if (k >= 20) { if (y >= 341 && y < 342) return C.table; if (y > 341 && k >= 23 && k < 23 + px) return C.pole; break }
    return y < 338 + px ? C.boothLight : y < 346 ? C.booth : y < 346 + px ? C.boothLight : y < 352 ? C.booth : C.boothDark
  }
  // the ceiling with its strips of light, the room warming toward the booths, two streaks of reflection on each pane
  let c: RGB = y < 300 ? ((((y - 262) % 7) + 7) % 7 < 2 && y - glassTop > 2 ? CEILING[1] : CEILING[0]) : ramp(ROOM, (y - 300) / (BASE_TOP - 300), X, Y)
  if (y < glassTop + 2) c = CEILING[1]
  const streak = (((x - (y - glassTop) * 0.6 + 400) % 64) + 64) % 64
  if (streak < 3 || (streak > 7 && streak < 9)) c = mix(c, [255, 250, 236], 0.35)
  return c
}

/**
 * The building at `scale`, standing on its ground line, painted with
 * `paint`; `skip(x, y)` keeps what stands in front of it (the sign). Gives
 * back where it was drawn.
 */
export function drawDiner(paint: Paint, skip: (x: number, y: number) => boolean, scale = 1): Uint8Array {
  const W = 768, H = 432
  const mask = new Uint8Array(W * H)
  const f = DINER_FOOT
  const X0 = Math.floor(f.x + (DINER_BOX.x0 - f.x) * scale), X1 = Math.ceil(f.x + (DINER_BOX.x1 - f.x) * scale)
  const Y0 = Math.floor(f.y + (DINER_BOX.y0 - f.y) * scale), Y1 = Math.ceil(f.y + (DINER_BOX.y1 - f.y) * scale)
  for (let Y = Math.max(0, Y0); Y < Math.min(H, Y1); Y += 1) for (let X = Math.max(0, X0); X < Math.min(W, X1); X += 1) {
    if (skip(X, Y)) continue
    // the screen pixel's middle, back on the shapes
    const x = f.x + (X + 0.5 - f.x) / scale, y = f.y + (Y + 0.5 - f.y) / scale
    const c = dinerAt(x, y, X, Y, 1 / scale)
    if (!c) continue
    paint(X, Y, c)
    mask[Y * W + X] = 1
  }
  return mask
}
