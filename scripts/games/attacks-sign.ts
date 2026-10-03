/**
 * The top of RANDOM BURGER's sign drawn again, sharp: on the traced title its
 * thin gold antenna, its ring, its stars and the rocket's gleam had melted
 * into the night when the picture was brought down to the title's size. The
 * rocket (its body lit along the top, two pale bands, the porthole, the gold
 * fins, three lines of speed behind it), the antenna (mast, ball, bar, ring)
 * and the two big stars, in pixels, where the picture has them on the
 * 768 × 432 title. The ovals and the lettering stay as traced.
 */

export type RGB = [number, number, number]
type Paint = (x: number, y: number, c: RGB) => void

const GOLD = { light: [255, 226, 138], mid: [242, 196, 62], dark: [184, 134, 26] } satisfies Record<string, RGB>
const INK: RGB = [42, 12, 14]

function inPolygon(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A four-pointed star: a white heart, gold arms thinning out. */
function star(paint: Paint, cx: number, cy: number, tall: number, wide: number): void {
  for (let d = -tall; d <= tall; d += 1) paint(cx, cy + d, Math.abs(d) < 2 ? [255, 252, 230] : Math.abs(d) < tall * 0.5 ? GOLD.light : GOLD.mid)
  for (let d = -wide; d <= wide; d += 1) paint(cx + d, cy, Math.abs(d) < 2 ? [255, 252, 230] : Math.abs(d) < wide * 0.5 ? GOLD.light : GOLD.mid)
  for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) paint(cx + dx, cy + dy, GOLD.light)
  for (const [dx, dy] of [[0, 2], [0, -2], [2, 0], [-2, 0]]) { paint(cx + dx + (dx ? 0 : 1), cy + dy + (dy ? 0 : 1), GOLD.mid); paint(cx + dx - (dx ? 0 : 1), cy + dy - (dy ? 0 : 1), GOLD.mid) }
}

/**
 * The sign's top, painted with `paint`; `sky(y)` the night's colour on a row,
 * to clear the haze the rocket's gleam had left around its nose.
 */
export function drawSignTop(paint: Paint, sky: (y: number) => RGB): void {
  // the haze over the rocket's nose, back to night, down to the oval's rim
  const rim = (x: number) => 165 + (x - 90) * 0.23
  for (let y = 150; y < 182; y += 1) for (let x = 104; x < 156; x += 1) if (y < rim(x) - 1) paint(x, y, sky(y))

  // the antenna: the ring's far half, the mast and its bar and ball, the ring's near half
  const ring = (front: boolean) => {
    for (let y = 140; y <= 156; y += 1) for (let x = 38; x <= 93; x += 1) {
      const d = Math.hypot((x + 0.5 - 65.3) / 23.5, (y + 0.5 - 148.4) / 6)
      if (d > 1.08 || d < 0.62 || (y + 0.5 > 148.4) !== front) continue
      paint(x, y, d > 1 ? INK : y + 0.5 < 147 ? GOLD.light : y + 0.5 > 150 ? GOLD.dark : GOLD.mid)
    }
  }
  ring(false)
  for (let y = 128; y < 190; y += 1) { paint(63, y, INK); paint(64, y, GOLD.light); paint(65, y, GOLD.mid); paint(66, y, GOLD.dark); paint(67, y, INK) }
  for (let x = 60; x <= 70; x += 1) { paint(x, 139, INK); paint(x, 140, GOLD.light); paint(x, 141, GOLD.dark); paint(x, 142, INK) }
  for (let y = 121; y <= 129; y += 1) for (let x = 61; x <= 69; x += 1) {
    const d = Math.hypot(x + 0.5 - 65.3, y + 0.5 - 125.2)
    if (d <= 3.4) paint(x, y, d > 2.5 ? INK : x < 65 && y < 125 ? [255, 250, 220] : GOLD.mid)
  }
  ring(true)

  // the rocket, nose up to the right: its axis from the tail to the tip
  const tail: [number, number] = [57, 213], nose: [number, number] = [143.5, 166.5]
  const ax = nose[0] - tail[0], ay = nose[1] - tail[1], len = Math.hypot(ax, ay), ux = ax / len, uy = ay / len
  // a torpedo: the tail a little narrower, the body full, the nose drawn out to a point just past the old blunt one
  const halfWidth = (u: number) => (u < 0 || u > 1.07 ? -1 : 9.6 * (u < 0.15 ? 0.62 + 2.5 * u : u < 0.6 ? 1 : ((1.07 - u) / 0.47) ** 0.8))
  // the fins first, behind the body
  const fins: Array<Array<[number, number]>> = [[[52, 188], [76, 195], [70, 202], [58, 200]], [[74, 207], [92, 213], [86, 225], [76, 222]]]
  for (const fin of fins) for (let y = 184; y < 228; y += 1) for (let x = 48; x < 96; x += 1) if (inPolygon(x + 0.5, y + 0.5, fin)) paint(x, y, x + y > fin[0][0] + fin[0][1] + 18 ? GOLD.dark : GOLD.mid)
  // three lines of speed trailing behind, breaking up
  for (const [x0, y0] of [[57, 207], [52, 214], [60, 219]] as const) for (let i = 0; i < 40; i += 1) {
    if (i > 24 && i % 2) continue
    paint(Math.round(x0 - i * 0.88), Math.round(y0 + i * 0.47), i < 12 ? GOLD.light : GOLD.mid)
  }
  const body = (x: number, y: number) => { const dx = x - tail[0], dy = y - tail[1], u = (dx * ux + dy * uy) / len, v = -dx * uy + dy * ux; return { u, v, w: halfWidth(u) } }
  for (let y = 150; y < 232; y += 1) for (let x = 46; x < 156; x += 1) {
    const { u, v, w } = body(x + 0.5, y + 0.5)
    if (w <= 0 || Math.abs(v) > w + 1) continue
    if (Math.abs(v) > w) { paint(x, y, INK); continue }
    // lit along its upper side, in shade below; the pale bands near the nose, the tip darker
    let c: RGB = v < -w * 0.45 ? [255, 122, 92] : v > w * 0.42 ? [168, 32, 26] : [232, 56, 42]
    if (u > 0.64 && u < 0.71) c = v > w * 0.42 ? [214, 200, 198] : [251, 238, 219]
    if (u > 0.75 && u < 0.79) c = v > w * 0.42 ? [190, 176, 178] : [228, 220, 222]
    if (u > 0.84 && u < 0.92 && v < -w * 0.2 && v > -w * 0.7) c = [255, 236, 220]
    if (u > 0.97) c = [196, 44, 32]
    if (u < 0.06) c = v < 0 ? [120, 116, 130] : [74, 70, 84]
    paint(x, y, c)
  }
  // the porthole: a cream ring, blue glass, a gleam
  for (let y = 181; y <= 199; y += 1) for (let x = 92; x <= 110; x += 1) {
    const d = Math.hypot(x + 0.5 - 100.8, y + 0.5 - 190)
    if (d > 7.8) continue
    paint(x, y, d > 7 ? INK : d > 5.6 ? (x + y > 291 ? [200, 192, 184] : [246, 239, 224]) : x + y < 288 ? [106, 184, 240] : [42, 124, 200])
  }
  paint(98, 187, [255, 255, 255]); paint(99, 187, [255, 255, 255]); paint(98, 188, [255, 255, 255])

  // the two big stars by the sign
  star(paint, 80, 168, 10, 8)
  star(paint, 143, 200, 13, 11)
}
