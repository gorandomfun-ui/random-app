/**
 * RANDOM ATTACKS' fast food drawn again over the traced picture, on its
 * very shapes but calmer, the way the other games' buildings are drawn: flat
 * colours, two or three tones a surface, a few lights. The wing roof cream
 * with its red line, its red underside with four lights; the low canopy on
 * the left; the leaning turquoise pillars and their portholes; the glass
 * lit warm from inside — pendant lamps, the booths, the counter and its
 * stools, the menu with three burgers — the round airlock door; the base;
 * the spire and its ring. Coordinates on the 768 × 432 title.
 */

export type RGB = [number, number, number]
type Paint = (x: number, y: number, c: RGB) => void
type Point = readonly [number, number]

function inPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Every pixel whose centre lies in the polygon, coloured by `color(x, y)`. */
function fill(paint: Paint, poly: readonly Point[], color: (x: number, y: number) => RGB | null): void {
  const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y)
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
    if (!inPolygon(x + 0.5, y + 0.5, poly)) continue
    const c = color(x, y)
    if (c) paint(x, y, c)
  }
}

function ellipse(paint: Paint, cx: number, cy: number, rx: number, ry: number, color: (x: number, y: number, d: number) => RGB | null): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
    if (d > 1) continue
    const c = color(x, y, d)
    if (c) paint(x, y, c)
  }
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
const dither = (x: number, y: number, t: number) => t * 16 > BAYER[y & 3][x & 3] + 0.5
/** A ramp of colours at `t`, dithered between neighbours. */
const ramp = (colors: readonly RGB[], t: number, x: number, y: number): RGB => {
  const f = Math.max(0, Math.min(colors.length - 1.001, t * (colors.length - 1))), i = Math.floor(f)
  return dither(x, y, f - i) ? colors[i + 1] : colors[i]
}

/** A line through points, as y for an x (between the first and last point; held flat beyond). */
const through = (points: readonly Point[]) => (x: number): number => {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i += 1) if (x <= points[i][0]) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) }
  return points[points.length - 1][1]
}

const C = {
  creamTop: [255, 247, 228], cream: [246, 228, 196], creamShade: [224, 202, 176], face: [204, 180, 182], stripe: [222, 40, 36],
  underLight: [242, 104, 50], under: [214, 52, 32], underDark: [158, 34, 30],
  tealLight: [112, 218, 198], teal: [40, 174, 158], tealDark: [20, 118, 108], port: [96, 24, 36], portRim: [172, 52, 60],
  mullion: [146, 132, 158], mullionLight: [200, 190, 208],
  booth: [198, 44, 40], boothLight: [242, 100, 72], boothDark: [126, 26, 30], table: [214, 206, 214],
  counterTop: [252, 242, 222], counter: [212, 204, 212], counterShade: [168, 158, 176], stool: [226, 48, 48], pole: [110, 100, 124],
  menu: [44, 32, 50], menuFrame: [226, 214, 196],
  doorFrame: [244, 232, 208], doorFrameShade: [204, 188, 172], door: [150, 176, 198], doorShade: [108, 132, 160], porthole: [26, 32, 56], portLight: [206, 224, 238], plaque: [240, 132, 42],
  baseTop: [248, 238, 222], base: [200, 190, 206], baseDark: [136, 124, 150],
  spireLight: [255, 172, 92], spire: [232, 86, 36], spireDark: [168, 46, 28],
  ring: [253, 228, 178], ringShade: [228, 150, 80],
  outline: [44, 16, 30],
} satisfies Record<string, RGB>
/** The ceiling seen through the glass, amber and its strips of light; the room under it, warm to the booths. */
const CEILING: RGB[] = [[240, 164, 76], [255, 222, 140]]
const ROOM: RGB[] = [[236, 150, 66], [222, 118, 54], [190, 84, 44], [150, 58, 40]]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** The roof's upper edge, and the edges under it, as measured on the picture. */
const ROOF_TOP = through([[163, 177], [178, 173], [298, 203], [400, 231], [502, 259], [606, 288]])
const SLAB = 14
const CANOPY_TOP = through([[141, 281], [250, 264]])
const CANOPY_BOTTOM = through([[141, 296], [250, 288]])
const RIGHT_BOTTOM = through([[415, 284], [452, 288], [606, 299]])
/** Where the glass begins under the underside, between the main pillar and the right one. */
const GLASS_TOP_MID = 258
const BASE_TOP = 356, BASE_BOTTOM = 368

type Pillar = { top: [number, number, number]; bottom: [number, number, number]; ports: Array<[number, number, number, number]> }
/** Each pillar: its top (y, left x, right x), its bottom, its portholes (centre, radii). */
const PILLARS: Pillar[] = [
  { top: [208, 215, 236], bottom: [362, 276, 285], ports: [[246.5, 236, 5, 7], [254, 265, 4, 6], [262, 289, 3.5, 5]] },
  { top: [266, 415, 452], bottom: [362, 432, 440], ports: [[439, 287.5, 5, 6.5], [437, 311, 3, 6]] },
  { top: [294, 555, 577], bottom: [360, 561, 567], ports: [[562, 307, 3, 6]] },
  { top: [290, 160, 175], bottom: [360, 167, 174], ports: [] },
]
const LAMPS: Array<[number, number]> = [[192, 312], [228, 315], [296, 300], [459, 315], [506, 310], [534, 315]]
const MULLIONS = [190, 212, 244, 300, 332, 466, 490, 520, 548, 584]

/** The building, painted with `paint`; `skip(x, y)` keeps what stands in front of it (the sign). */
export function drawDiner(paint: Paint, skip: (x: number, y: number) => boolean): void {
  const W = 768, H = 432
  const mask = new Uint8Array(W * H)
  const put: Paint = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H || skip(x, y)) return; paint(x, y, c); mask[y * W + x] = 1 }

  // the glass and what is behind it: left of the main pillar under the canopy, the middle under the underside, the right under the right roof
  const glassTop = (x: number) => (x < 250 ? CANOPY_BOTTOM(x) : x < 415 ? GLASS_TOP_MID : RIGHT_BOTTOM(x))
  for (let x = 160; x < 596; x += 1) {
    const top = Math.round(glassTop(x))
    for (let y = top; y < BASE_TOP; y += 1) {
      // the ceiling: amber with strips of light; lower down the room warms and darkens toward the booths
      let c: RGB = y < 300 ? ((y - 262) % 7 < 2 && y - top > 2 ? CEILING[1] : CEILING[0]) : ramp(ROOM, (y - 300) / (BASE_TOP - 300), x, y)
      if (y - top < 2) c = CEILING[1]
      // two streaks of reflection across each pane, leaning
      const k = (x - (y - top) * 0.6 + 400) % 64
      if (k < 3 || (k > 7 && k < 9)) c = mix(c, [255, 250, 236], 0.35)
      put(x, y, c)
    }
    // the frame along the top of the glass
    put(x, top, C.mullion)
  }
  // the menu over the counter, three burgers on it
  fill(put, [[316, 290], [370, 290], [370, 305], [316, 305]], (x, y) => (x === 316 || x === 369 || y === 290 || y === 304 ? C.menuFrame : C.menu))
  for (const mx of [324, 339, 354]) {
    put(mx + 1, 294, [242, 168, 72]); put(mx + 2, 294, [242, 168, 72]); put(mx + 3, 294, [242, 168, 72]); put(mx + 4, 294, [242, 168, 72])
    for (let k = 0; k < 6; k += 1) { put(mx + k, 295, [242, 168, 72]); put(mx + k, 296, k % 2 ? [76, 184, 64] : [255, 206, 48]); put(mx + k, 297, [104, 44, 28]); put(mx + k, 298, [214, 124, 58]) }
  }
  // the counter and its stools, in the middle
  for (let x = 290; x < 373; x += 1) {
    put(x, 336, C.counterTop); put(x, 337, C.counterTop)
    for (let y = 338; y < 350; y += 1) put(x, y, y === 349 ? C.counterShade : x % 12 === 0 ? C.counterShade : C.counter)
  }
  for (const sx of [296, 310, 324, 338, 352, 366]) {
    for (let k = -2; k <= 2; k += 1) { put(sx + k, 350, C.stool); put(sx + k, 351, k === 2 ? C.boothDark : C.stool) }
    for (let y = 352; y < BASE_TOP; y += 1) put(sx, y, C.pole)
  }
  // the booths along the glass, left and right, a table between each pair
  const booths = (x0: number, x1: number) => {
    for (let x = x0; x < x1; x += 1) for (let y = 338; y < BASE_TOP; y += 1) {
      const seat = (x - x0) % 26 < 20
      if (!seat) { if (y === 341) put(x, y, C.table); else if (y > 341 && (x - x0) % 26 === 23) put(x, y, C.pole); continue }
      put(x, y, y === 338 ? C.boothLight : y < 346 ? C.booth : y < 352 ? (y === 346 ? C.boothLight : C.booth) : C.boothDark)
    }
  }
  booths(178, 284); booths(432, 594)
  // the mullions
  for (const mx of MULLIONS) for (let y = Math.round(glassTop(mx)); y < BASE_TOP; y += 1) { put(mx, y, C.mullion); put(mx + 1, y, C.mullionLight) }
  // the lamps hanging in the glass
  for (const [lx, ly] of LAMPS) {
    for (let y = Math.round(glassTop(lx)) + 1; y < ly - 3; y += 1) put(lx, y, C.pole)
    ellipse(put, lx + 0.5, ly + 0.5, 6, 6, (x, y, d) => (d > 0.7 ? (dither(x, y, 0.5) ? [255, 226, 150] : null) : d > 0.45 ? [255, 222, 132] : [255, 251, 232]))
  }

  // the door: a cream frame, two rounded leaves with a porthole each, the plaque
  fill(put, [[374, 304], [427, 304], [427, BASE_TOP], [374, BASE_TOP]], (x, y) => (x < 377 || y < 307 ? C.doorFrame : C.doorFrameShade))
  fill(put, [[379, 312], [422, 312], [422, BASE_TOP], [379, BASE_TOP]], (x, y) => (x === 400 || x === 401 ? C.doorShade : x > 417 || y > 351 ? C.doorShade : C.door))
  for (const [px, py] of [[390, 328], [411, 328]] as const) ellipse(put, px + 0.5, py + 0.5, 5.5, 5.5, (x, y, d) => (d > 0.78 ? C.portLight : x < px && y < py - 1 && d < 0.5 ? [64, 80, 112] : C.porthole))
  fill(put, [[388, 352], [413, 352], [413, 355], [388, 355]], () => C.plaque)
  put(398, 338, C.portLight); put(398, 339, C.portLight); put(403, 338, C.portLight); put(403, 339, C.portLight)

  // the base all along
  for (let x = 158; x < 598; x += 1) for (let y = BASE_TOP; y < BASE_BOTTOM; y += 1) put(x, y, y === BASE_TOP ? C.baseTop : y >= BASE_BOTTOM - 2 ? C.baseDark : C.base)

  // the red underside of the wing, from its tip down to the glass, lit along the roof
  fill(put, [[172, 189], [415, 251], [415, 262], [282, GLASS_TOP_MID], [238, GLASS_TOP_MID], [180, 201]], (x, y) => {
    const below = y - (ROOF_TOP(x) + SLAB)
    return below < 3 ? C.underLight : ramp([C.under, C.under, C.underDark], Math.min(1, below / 46), x, y)
  })
  for (const [lx, ly] of [[202, 216], [222, 237], [305, 241], [345, 251]] as const) {
    put(lx, ly, [255, 250, 226]); put(lx + 1, ly, [255, 250, 226]); put(lx - 1, ly, [255, 214, 140]); put(lx + 2, ly, [255, 214, 140]); put(lx, ly - 1, [255, 214, 140]); put(lx + 1, ly + 1, [255, 214, 140])
  }
  // the low canopy on the left: cream on top, a red band under it, its tip rounded
  for (let x = 141; x < 252; x += 1) {
    const top = Math.round(CANOPY_TOP(x)), bottom = Math.round(CANOPY_BOTTOM(x))
    const mid = top + Math.round((bottom - top) * 0.62)
    for (let y = top; y <= bottom; y += 1) {
      if (x < 145 && (y === top || y === bottom)) continue
      put(x, y, y === top ? C.creamTop : y < mid ? C.cream : y === mid ? C.creamShade : y >= bottom - 1 ? C.underDark : C.stripe)
    }
  }
  // the roof on the right, under the slab: a red band and the canopy's cream lip
  for (let x = 415; x < 606; x += 1) {
    const top = Math.round(ROOF_TOP(x) + SLAB), bottom = Math.round(RIGHT_BOTTOM(x))
    for (let y = top; y <= bottom; y += 1) put(x, y, bottom - y < 4 ? (bottom - y === 3 ? C.creamTop : bottom - y === 0 ? C.creamShade : C.cream) : y - top < 2 ? C.underDark : C.under)
  }
  // the wing's slab: the cream top lit along its edge, the red line, the front face
  for (let x = 163; x < 607; x += 1) {
    const top = Math.round(ROOF_TOP(x))
    for (let k = 0; k < SLAB; k += 1) {
      if ((x < 166 || x > 604) && (k === 0 || k === SLAB - 1)) continue
      put(x, top + k, k === 0 ? C.creamTop : k < 8 ? C.cream : k < 10 ? C.stripe : k === 10 ? C.creamShade : C.face)
    }
  }
  // the pillars, leaning, lit on the left, their portholes
  for (const p of PILLARS) {
    const [ty, tl, tr] = p.top, [by, bl, br] = p.bottom
    fill(put, [[tl, ty], [tr, ty], [br, by], [bl, by]], (x, y) => {
      const t = (y - ty) / (by - ty), l = tl + (bl - tl) * t, r = tr + (br - tr) * t
      const u = (x + 0.5 - l) / Math.max(1, r - l)
      return u < 0.18 ? C.tealLight : u > 0.78 ? C.tealDark : C.teal
    })
    for (const [px, py, rx, ry] of p.ports) ellipse(put, px, py, rx, ry, (x, y, d) => (d > 0.72 ? C.tealDark : x + 0.5 < px && y + 0.5 < py ? C.portRim : C.port))
  }
  // the spire and its ring: the ring's far half, the spire, the near half
  const ring = (front: boolean) => ellipse(put, 338.3, 199.3, 32.5, 7.2, (x, y, d) => {
    if (d < 0.68) return null
    if ((y + 0.5 > 199.3) !== front) return null
    return y + 0.5 > 201 ? C.ringShade : C.ring
  })
  ring(false)
  fill(put, [[339, 159], [347, 216], [331, 216]], (x) => (x < 337 ? C.spireLight : x > 341 ? C.spireDark : C.spire))
  ring(true)

  // an ink line round it all, where it meets the night or the rocks
  const edge: Array<[number, number]> = []
  for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) if (!mask[y * W + x] && !skip(x, y) && (mask[y * W + x - 1] || mask[y * W + x + 1] || mask[(y - 1) * W + x] || mask[(y + 1) * W + x])) edge.push([x, y])
  for (const [x, y] of edge) if (y < BASE_BOTTOM) paint(x, y, C.outline)
}
