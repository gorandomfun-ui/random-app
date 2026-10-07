/**
 * RANDOM RACING's three other worlds, after the owner's pictures (the
 * mountains, the desert, the city at night — `docs/reports/jeux-v1/refs/`,
 * kept out of the repository): what the game needs of each, traced onto the
 * games' grid and written to `public/games/racing/`.
 *
 * - `far-<world>`: the far view, 448 wide — the band of landscape under the
 *   picture's title (the snowy range and its lake, the mesas and the plain,
 *   the towers lit up), its own sky made clear, set over a sky drawn in the
 *   picture's colours (the title hid it), with the picture's clouds.
 * - `pine`, `rock` (the mountains), `saguaro` (the desert): what stands by
 *   the road, cut out along hand outlines.
 *
 * Made simpler as the coast was: painted flat, few colours.
 *
 *   node --import tsx scripts/games/racing-worlds.ts [preview dir]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { encodeIndexedPng, encodePng } from './png'
import { blank, cutOut, evened, flatten, get, inPolygon, lum, paletteOf, put, quantize, readRef, tidy, trace, tracePic, type Pic, type RGB } from './trace-kit'

const ROOT = path.join(__dirname, '../..')
const REFS = path.join(ROOT, 'docs/reports/jeux-v1/refs')
const OUT = path.join(ROOT, 'public/games/racing')
const PREVIEW = process.argv[2]
type Rect = [number, number, number, number]

function write(name: string, pic: Pic, colours: number, alpha?: Uint8Array): void {
  const palette = paletteOf(pic, colours, alpha)
  let index = quantize(pic, palette)
  if (!alpha) index = tidy(index, pic.w, pic.h, 6, 2)
  const out = alpha ? [[0, 0, 0] as RGB, ...palette] : palette
  if (alpha) index = index.map((v, i) => (alpha[i] ? v + 1 : 0))
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, `${name}.png`), encodeIndexedPng(pic.w, pic.h, index, out, !!alpha))
  if (PREVIEW) {
    const rgba = new Uint8ClampedArray(pic.w * pic.h * 4)
    for (let i = 0; i < pic.w * pic.h; i += 1) { const c = alpha && !alpha[i] ? [255, 0, 255] : out[index[i]]; rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255 }
    mkdirSync(PREVIEW, { recursive: true })
    writeFileSync(path.join(PREVIEW, `${name}.png`), encodePng(pic.w, pic.h, rgba, 2))
  }
  console.log(`${name}: ${pic.w} × ${pic.h}, ${palette.length} colours`)
}

const sat = ([r, g, b]: RGB) => Math.max(r, g, b) - Math.min(r, g, b)
const mean = (cs: RGB[]): RGB => (cs.length ? [0, 1, 2].map((k) => cs.reduce((a, c) => a + c[k], 0) / cs.length) as unknown as RGB : [0, 0, 0])
const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Each world: its picture, the band of its far view (on the 768-wide grid), where its sky shows above the title, its clouds, what its sky looks like. */
const WORLDS: Record<'mountain' | 'desert' | 'city', { file: string; band: Rect; top: Rect; clouds: Rect[]; skyish: (c: RGB) => boolean }> = {
  mountain: { file: 'racing-mountain.png', band: [226, 189, 606, 261], top: [250, 2, 520, 12], clouds: [[20, 18, 215, 78], [600, 8, 760, 72]], skyish: ([r, g, b]) => b > r + 25 && b > g - 8 && lum(r, g, b) > 105 },
  desert: { file: 'racing-desert.png', band: [236, 189, 640, 258], top: [250, 2, 520, 12], clouds: [[40, 32, 270, 92], [520, 52, 720, 108]], skyish: ([r, g, b]) => b > r + 30 && g > r + 10 },
  city: { file: 'racing-city.png', band: [378, 186, 542, 240], top: [250, 2, 520, 12], clouds: [], skyish: ([r, g, b]) => b > r + 8 && b > g + 20 && lum(r, g, b) < 95 },
}
const W = 448, FH = 150

for (const [world, spec] of Object.entries(WORLDS)) {
  const ref = readRef(path.join(REFS, spec.file))
  const S = ref.width / 768
  const big = (r: Rect): Rect => [Math.floor(r[0] * S), Math.floor(r[1] * S), Math.ceil(r[2] * S), Math.ceil(r[3] * S)]
  const src = trace(ref, ref.width, ref.height)
  const [bx0, by0, bx1, by1] = big(spec.band)
  const PH = Math.round(((by1 - by0) * W) / (bx1 - bx0))
  const band = tracePic(src, W, PH, [bx0, by0, bx1 - bx0, by1 - by0])
  // the band's sky: from its top row down, as far as it stays sky and changes gently
  const clear = new Uint8Array(W * PH)
  const queue: number[] = []
  for (let x = 0; x < W; x += 1) if (spec.skyish(get(band, x, 0))) { clear[x] = 1; queue.push(x) }
  while (queue.length) {
    const i = queue.pop()!, x = i % W, y = (i - x) / W, c = get(band, x, y)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]] as const) {
      const X = x + dx, Y = y + dy
      if (X < 0 || X >= W || Y >= PH || clear[Y * W + X]) continue
      const n = get(band, X, Y)
      if (spec.skyish(n) && Math.abs(n[0] - c[0]) + Math.abs(n[1] - c[1]) + Math.abs(n[2] - c[2]) < 34) { clear[Y * W + X] = 1; queue.push(Y * W + X) }
    }
  }
  // the sky, drawn: from the picture's top to the band's sky just over its landscape, and on down behind it to the horizon's sky
  const [tx0, ty0, tx1, ty1] = big(spec.top)
  const topSky: RGB[] = [], low: RGB[] = [], under: RGB[] = []
  for (let y = ty0; y < ty1; y += 2) for (let x = tx0; x < tx1; x += 4) topSky.push(get(src, x, y))
  for (let x = 0; x < W; x += 1) if (clear[x]) low.push(get(band, x, 0))
  for (let y = Math.floor(PH * 0.5); y < PH; y += 1) for (let x = 0; x < W; x += 3) if (clear[y * W + x]) under.push(get(band, x, y))
  const skyTop = mean(topSky), skyLow = low.length ? mean(low) : skyTop, skyUnder = under.length ? mean(under) : skyLow
  const far = blank(W, FH), above = FH - PH
  for (let y = 0; y < FH; y += 1) {
    const c = y < above ? lerp(skyTop, skyLow, (y / Math.max(1, above)) ** 0.9) : lerp(skyLow, skyUnder, (y - above) / PH)
    for (let x = 0; x < W; x += 1) put(far, x, y, c)
  }
  // the picture's clouds, cut out and set in the sky
  const scale = W / (bx1 - bx0)
  spec.clouds.forEach((rect, k) => {
    const [cx0, cy0, cx1, cy1] = big(rect)
    const cw = Math.max(1, Math.round((cx1 - cx0) * scale)), chh = Math.max(1, Math.round((cy1 - cy0) * scale))
    const cloud = tracePic(src, cw, chh, [cx0, cy0, cx1 - cx0, cy1 - cy0])
    const ox = k === 0 ? 8 : W - cw - 12, oy = Math.max(2, Math.round(above * (k === 0 ? 0.18 : 0.42)))
    for (let y = 0; y < chh; y += 1) for (let x = 0; x < cw; x += 1) { const c = get(cloud, x, y); if (lum(c[0], c[1], c[2]) > 168 && sat(c) < 95 && !(c[2] > c[0] + 30) && oy + y < above + 6) put(far, ox + x, oy + y, c) }
  })
  // the landscape over it
  for (let y = 0; y < PH; y += 1) for (let x = 0; x < W; x += 1) if (!clear[y * W + x]) put(far, x, above + y, get(band, x, y))
  write(`far-${world}`, flatten(far, 2), 32)

  // what stands by the road
  const cut = (name: string, outline: Array<[number, number]>, keep: (c: RGB) => boolean, width: number, share = 0.35, even = false) => {
    // inside the outline, only what looks like the thing (not the sky, the snow, the rock or the trees behind it)
    const poly = outline.map(([x, y]) => [x * S, y * S] as [number, number])
    const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y)
    const box: Rect = [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))]
    const mask = new Uint8Array(src.w * src.h)
    for (let y = box[1]; y < box[3]; y += 1) for (let x = box[0]; x < box[2]; x += 1) if (inPolygon(x + 0.5, y + 0.5, poly) && keep(get(src, x, y))) mask[y * src.w + x] = 1
    let piece = cutOut(src, mask, box, width, share)
    // a tree cut against its neighbour: its left side, and the same mirrored about its tip
    if (even) { let tip = 0; for (let i = 0; i < piece.alpha.length; i += 1) if (piece.alpha[i]) { tip = (i % piece.pic.w) + 0.5; break } piece = evened(piece.pic, piece.alpha, tip, 'left') }
    write(name, flatten(piece.pic, 1), 20, piece.alpha)
  }
  if (world === 'mountain') {
    cut('pine', [[716.5, 60], [721, 74], [725, 92], [726, 112], [726, 140], [726, 168], [722, 180], [710, 182], [698, 180], [688, 174], [691, 156], [695, 138], [699, 120], [703, 102], [708, 84], [712, 70]], ([r, g, b]) => g >= r - 6 && b < g + 26 && lum(r, g, b) < 128, 90, 0.35, true)
    cut('rock', [[675, 185], [690, 178], [712, 178], [728, 200], [732, 230], [730, 268], [700, 272], [670, 270], [665, 240], [668, 205]], ([r, g, b]) => !(g > r + 5 && lum(r, g, b) < 95) && !(b > r + 25 && lum(r, g, b) > 110), 110, 0.5)
  }
  if (world === 'desert') {
    cut('saguaro', [[686, 163], [700, 158], [713, 186], [718, 88], [731, 84], [743, 92], [743, 152], [752, 148], [766, 154], [766, 212], [750, 224], [743, 236], [743, 286], [717, 286], [717, 252], [700, 242], [686, 216]], ([r, g, b]) => (g >= r - 8 && g > b + 8) || lum(r, g, b) < 55, 100)
  }
}
