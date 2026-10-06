/**
 * RANDOM RACING's pictures, traced from the owner's reference picture
 * (`docs/reports/jeux-v1/refs/racing-reference.png`, kept out of the
 * repository, made with ChatGPT): a coast road at sunset, the three cars
 * from behind.
 *
 * The picture is first cleaned at its own size: its words (RANDOM, RACING
 * with its speed lines and its chequered strip, PRESS START, 1 PLAYER 2
 * PLAYERS) are taken out and the sky or the road drawn again under them —
 * the game draws its own RANDOM, RACING in the theme's colour, LEVEL, BEST
 * and PRESS START — and so are the makers' badges on the red car and the
 * yellow one: only their look stays. Then, each brought onto the games'
 * grid with its colours reduced to a palette:
 *
 * - `title-wide`: the whole picture, 768 × 432.
 * - `title-tall`: 432 × 768 for a phone held upright — the picture a little
 *   smaller at the foot, the sky carried up above it for the title (the big
 *   palms' crowns grown on into it), the road carried down under it.
 * - `car-<kind>-<width>`: each car cut out along its outline, at the sizes
 *   the screens draw it, its pixels outside it clear.
 * - `play-back`: the far view for the play — the sea, the sun, the
 *   mountains, the city — without the near palms, 448 wide.
 * - `palm`, `chevron`: what stands by the road in the play, cut out.
 *
 * Written to `public/games/racing/` as indexed PNG files, and the few numbers
 * the game needs to `lib/games/racing-art-data.ts`.
 *
 *   node --import tsx scripts/games/racing-trace.ts [preview dir]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { encodeIndexedPng, encodePng } from './png'
import { blank, cutByFlood, get, grow, inpaint, inPolygon, lum, paletteOf, pickIn, put, quantize, readRef, trace, tracePic, type Pic, type RGB } from './trace-kit'

const ROOT = process.cwd()
const REF = path.join(ROOT, 'docs/reports/jeux-v1/refs/racing-reference.png')
const OUT = path.join(ROOT, 'public/games/racing')
const DATA = path.join(ROOT, 'lib/games/racing-art-data.ts')
const PREVIEW = process.argv[2]

const ref = readRef(REF)
const src = trace(ref, ref.width, ref.height)
/** The reference's pixels per pixel of the 768 × 432 grid, where the places below were measured. */
const S = ref.width / 768
type Rect = readonly [number, number, number, number]
const big = (r: Rect): Rect => [Math.floor(r[0] * S), Math.floor(r[1] * S), Math.ceil(r[2] * S), Math.ceil(r[3] * S)]
const bigPoly = (p: ReadonlyArray<readonly [number, number]>) => p.map(([x, y]) => [x * S, y * S] as [number, number])
const sat = ([r, g, b]: RGB) => Math.max(r, g, b) - Math.min(r, g, b)

// ---------------------------------------------------------------- the picture cleaned, at its own size

/** The words' colours: their greens and creams, their dark outlines; the sky round them is pink, orange and purple. */
const wordish = ([r, g, b]: RGB) => (g >= r - 12 && g >= b - 30) || lum(r, g, b) < 45
const words = pickIn(src, ([[283, 22, 492, 74], [150, 70, 626, 172], [150, 168, 560, 190]] as Rect[]).map(big), wordish)
// the speed lines past the letters on both sides, light over the sky (the palms' greens left alone)
const streaks = pickIn(src, [big([118, 60, 190, 172]), big([596, 76, 660, 165])], ([r, g, b]) => lum(r, g, b) > 150 && g > 150 && b > 110)
// PRESS START and 1 PLAYER 2 PLAYERS: light letters and the green arrow on the road
const press = pickIn(src, [big([284, 382, 478, 421])], ([r, g, b]) => lum(r, g, b) > 105 || g > r + 20)
// the badges: the horse on the red car's grille (light on dark), the crossed flags on the yellow one (anything not yellow)
const horse = pickIn(src, [big([151, 319, 167, 340])], ([r, g, b]) => lum(r, g, b) > 95 && Math.abs(r - b) < 70)
const flags = pickIn(src, [big([611, 314, 637, 330])], ([r, g, b]) => !(r > 150 && g > 110 && b < 110))
const holes = new Uint8Array(src.w * src.h)
for (const [mask, by] of [[words, 4], [streaks, 4], [press, 3], [horse, 2], [flags, 2]] as const) { const g = grow(mask, src.w, src.h, by); for (let i = 0; i < holes.length; i += 1) if (g[i]) holes[i] = 1 }
inpaint(src, holes, 200)
const clean = src

// ---------------------------------------------------------------- the cars, cut out

/** Each car's outline drawn by hand on the grid. */
const CARS: Record<'rosso' | 'burger' | 'giallo', ReadonlyArray<readonly [number, number]>> = {
  rosso: [[134, 288], [216, 288], [233, 300], [258, 306], [268, 318], [271, 342], [268, 372], [262, 382], [80, 382], [74, 372], [72, 330], [76, 316], [96, 306], [118, 302]],
  burger: [[318, 296], [322, 282], [335, 270], [352, 264], [385, 259], [416, 263], [436, 273], [446, 288], [448, 300], [458, 306], [460, 318], [464, 336], [464, 372], [306, 372], [306, 336], [309, 318], [310, 306], [318, 300]],
  giallo: [[550, 287], [645, 287], [655, 296], [688, 301], [698, 310], [702, 340], [700, 382], [503, 382], [502, 345], [504, 313], [514, 304], [534, 296]],
}
/** What belongs to a car inside its outline: anything coloured but the sea's turquoise, or dark (its tyres, its outline, its shadow); the road's greys and the light kerbs round it do not. */
const carish = (c: RGB) => (sat(c) > 52 && !(c[1] > c[0] + 50 && c[2] > c[0] + 50)) || lum(c[0], c[1], c[2]) < 44
const carMasks = Object.fromEntries(Object.entries(CARS).map(([kind, poly]) => [kind, cutByFlood(src, bigPoly(poly), carish)])) as Record<keyof typeof CARS, Uint8Array>
const boxOf = (poly: ReadonlyArray<readonly [number, number]>): Rect => { const xs = poly.map(([x]) => x * S), ys = poly.map(([, y]) => y * S); return [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))] }

/** A cut-out traced at `width` pixels wide: each cell the average of the figure's pixels in it, clear where less than `share` of it is the figure (less for thin things, a palm's fronds). */
function cutOut(pic: Pic, mask: Uint8Array, box: Rect, width: number, share = 0.5): { pic: Pic; alpha: Uint8Array } {
  const [x0, y0, x1, y1] = box
  const f = (x1 - x0) / width, height = Math.round((y1 - y0) / f)
  const out = blank(width, height), alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx0 = Math.floor(x0 + x * f), sx1 = Math.max(sx0 + 1, Math.floor(x0 + (x + 1) * f)), sy0 = Math.floor(y0 + y * f), sy1 = Math.max(sy0 + 1, Math.floor(y0 + (y + 1) * f))
    let r = 0, g = 0, b = 0, n = 0, all = 0
    for (let yy = sy0; yy < sy1; yy += 1) for (let xx = sx0; xx < sx1; xx += 1) { all += 1; if (!mask[yy * pic.w + xx]) continue; const c = get(pic, xx, yy); r += c[0]; g += c[1]; b += c[2]; n += 1 }
    if (n >= all * share && n > 0) { put(out, x, y, [r / n, g / n, b / n]); alpha[y * width + x] = 1 }
  }
  return { pic: out, alpha }
}

// ---------------------------------------------------------------- out

const files: string[] = []
function write(name: string, pic: Pic, colours: number, smooth?: Uint8Array, alpha?: Uint8Array): void {
  const palette = paletteOf(pic, colours, alpha)
  let index = quantize(pic, palette, smooth)
  // a cut-out keeps index 0 for clear: its colours move up one
  const out = alpha ? [[0, 0, 0] as RGB, ...palette] : palette
  if (alpha) index = index.map((v, i) => (alpha[i] ? v + 1 : 0))
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, `${name}.png`), encodeIndexedPng(pic.w, pic.h, index, out, !!alpha))
  files.push(name)
  if (PREVIEW) {
    const rgba = new Uint8ClampedArray(pic.w * pic.h * 4)
    for (let i = 0; i < pic.w * pic.h; i += 1) { const c = alpha && !alpha[i] ? [255, 0, 255] : out[index[i]]; rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255 }
    mkdirSync(PREVIEW, { recursive: true })
    writeFileSync(path.join(PREVIEW, `${name}.png`), encodePng(pic.w, pic.h, rgba, 2))
  }
  console.log(`${name}: ${pic.w} × ${pic.h}, ${palette.length} colours`)
}

// the wide title
const titleWide = tracePic(clean, 768, 432)
const wideHoles = new Uint8Array(768 * 432)
for (let y = 0; y < 432; y += 1) for (let x = 0; x < 768; x += 1) if (holes[Math.floor((y + 0.5) * S) * src.w + Math.floor((x + 0.5) * S)]) wideHoles[y * 768 + x] = 1
write('title-wide', titleWide, 160, wideHoles)

// the cars at the sizes the screens draw them: the tall title's, the play's own car, the rivals'
const CAR_WIDTHS = [130, 104, 60]
for (const kind of Object.keys(CARS) as Array<keyof typeof CARS>) {
  for (const width of CAR_WIDTHS) {
    const { pic, alpha } = cutOut(clean, carMasks[kind], boxOf(CARS[kind]), Math.round(width * (kind === 'burger' ? 0.78 : 1)))
    write(`car-${kind}-${width}`, pic, 48, undefined, alpha)
  }
}

// ---------------------------------------------------------------- the tall title

const TW = 432, TH = 768
/** The picture's window on the tall title: wide enough for the three cars, at its foot. */
const WIN: Rect = [116, 0, 1556, ref.height]
const F = (WIN[2] - WIN[0]) / TW
const bandH = Math.round(ref.height / F), bandTop = TH - bandH - 92
const band = tracePic(clean, TW, bandH, [WIN[0], 0, WIN[2] - WIN[0], ref.height])
const tall = blank(TW, TH)
for (let y = 0; y < bandH; y += 1) for (let x = 0; x < TW; x += 1) put(tall, x, bandTop + y, get(band, x, y))
// the sky carried up: each column's sky at the band's top, darkening toward the top of the screen, stars
const palmish = ([r, g, b]: RGB) => (g > r - 6 && g > b - 10) || (r > b + 30 && g > b + 8 && lum(r, g, b) < 120)
const skyRow: RGB[] = []
for (let x = 0; x < TW; x += 1) {
  // the sky of the band's top rows (purple or pink, never the palms' greens and browns): the nearest in the row
  const isSky = ([r, g, b]: RGB) => r > g + 12 && b > g - 10
  let c: RGB | null = null
  for (let d = 0; d < TW && !c; d += 1) for (const X of [x - d, x + d]) { if (X < 0 || X >= TW || c) continue; for (let y = 0; y < 6; y += 1) { const q = get(band, X, y); if (isSky(q)) { c = q; break } } }
  skyRow.push(c ?? [40, 14, 70])
}
// smoothed along the row, so no column stands out
const smoothRow = skyRow.map((_, x) => { const c: RGB = [0, 0, 0]; let n = 0; for (let d = -10; d <= 10; d += 1) { const q = skyRow[Math.max(0, Math.min(TW - 1, x + d))]; c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; n += 1 } return [c[0] / n, c[1] / n, c[2] / n] as RGB })
const TOP: RGB = [22, 8, 46]
for (let y = 0; y < bandTop; y += 1) for (let x = 0; x < TW; x += 1) {
  const t = (1 - y / bandTop) ** 1.4, s = smoothRow[x]
  put(tall, x, y, [s[0] + (TOP[0] - s[0]) * t, s[1] + (TOP[1] - s[1]) * t, s[2] + (TOP[2] - s[2]) * t])
}
let seed = 7
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
for (let k = 0; k < 70; k += 1) { const x = Math.floor(rand() * TW), y = Math.floor(rand() * bandTop * 0.8); put(tall, x, y, rand() < 0.3 ? [255, 255, 255] : [200, 170, 230]) }
// the big palms' crowns, cut by the picture's top, grown on above it: their rows mirrored up, thinning out
const GROW = 46
for (let k = 1; k <= GROW; k += 1) for (let x = 0; x < TW; x += 1) {
  const q = get(band, x, Math.min(bandH - 1, k - 1))
  if (!palmish(q)) continue
  // the further up, the fewer: the fronds end in points
  const keep = 1 - k / GROW
  const h = ((x * 73856093) ^ (k * 19349663)) >>> 0
  if ((h % 1000) / 1000 > keep * 1.15) continue
  put(tall, x, bandTop - k, q)
}
// the road carried down under the picture: its last rows spread out toward the viewer, the lanes' dashes as they come
const VY = bandTop + Math.round(545 / F), CX = TW * 0.5
for (let y = bandTop + bandH; y < TH; y += 1) {
  const s = (y - VY) / (bandTop + bandH - 1 - VY)
  for (let x = 0; x < TW; x += 1) {
    const sx = Math.max(0, Math.min(TW - 1, Math.round(CX + (x - CX) / s)))
    let c = get(band, sx, bandH - 1)
    // a lane's white comes in dashes, longer nearer
    if (lum(c[0], c[1], c[2]) > 150 && Math.floor(40 / (y - VY)) % 2 === 1) c = get(band, Math.max(0, sx - 6), bandH - 1)
    put(tall, x, y, c)
  }
}
write('title-tall', tall, 160)

// ---------------------------------------------------------------- the play's far view and roadside things

/** The far view: the sky low down, the sun on the sea, the mountains, the city — between the big palms — to the sea's horizon. */
const FAR: Rect = [300, 250, 1220, 548]
const PW = 448, PH = Math.round(((FAR[3] - FAR[1]) * PW) / (FAR[2] - FAR[0]))
const farPic = tracePic(clean, PW, PH, [FAR[0], FAR[1], FAR[2] - FAR[0], FAR[3] - FAR[1]])
write('play-back', farPic, 96)

// a palm for the roadside: the one on the left in the picture, its crown and trunk, without the sky and the sea behind
const PALM: ReadonlyArray<readonly [number, number]> = [[31, 156], [60, 148], [116, 158], [120, 198], [96, 212], [66, 214], [58, 260], [54, 300], [44, 300], [48, 250], [56, 212], [31, 206]]
const palmMask = new Uint8Array(src.w * src.h)
{
  const poly = bigPoly(PALM), [bx0, by0, bx1, by1] = boxOf(PALM)
  for (let y = by0; y < by1; y += 1) for (let x = bx0; x < bx1; x += 1) { const c = get(clean, x, y); if (inPolygon(x + 0.5, y + 0.5, poly) && (palmish(c) || lum(c[0], c[1], c[2]) < 60)) palmMask[y * src.w + x] = 1 }
}
const palm = cutOut(clean, palmMask, boxOf(PALM), 80, 0.3)
write('palm', palm.pic, 32, undefined, palm.alpha)
// a chevron sign, red and white on its post
const CHEVRON: ReadonlyArray<readonly [number, number]> = [[76, 268], [104, 268], [104, 294], [93, 294], [93, 302], [86, 302], [86, 294], [76, 294]]
const chevronMask = new Uint8Array(src.w * src.h)
{
  const poly = bigPoly(CHEVRON), [bx0, by0, bx1, by1] = boxOf(CHEVRON)
  for (let y = by0; y < by1; y += 1) for (let x = bx0; x < bx1; x += 1) { const c = get(clean, x, y); if (inPolygon(x + 0.5, y + 0.5, poly) && ((c[0] > 150 && c[1] < 110) || (lum(c[0], c[1], c[2]) > 190 && sat(c) < 60) || lum(c[0], c[1], c[2]) < 60)) chevronMask[y * src.w + x] = 1 }
}
const chevron = cutOut(clean, chevronMask, boxOf(CHEVRON), 26)
write('chevron', chevron.pic, 16, undefined, chevron.alpha)

// ---------------------------------------------------------------- what the game needs to know

/** Where the sea glitters on a picture (its brightest pixels in a rectangle). */
const glitter = (pic: Pic, x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const [r, g, b] = get(pic, x, y); if (lum(r, g, b) > 205 && b > 150) out.push([x, y]) }
  // a hundred at most, spread over all of them
  return out.filter((_, i) => i % Math.max(1, Math.ceil(out.length / 100)) === 0)
}
const toTall = (x: number, y: number): [number, number] => [Math.round((x * S - WIN[0]) / F), Math.round(bandTop + (y * S) / F)]
const data = {
  wide: { sea: glitter(titleWide, 0, 246, 480, 290), neon: [652, 166, 742, 204], exhausts: [[110, 354], [200, 354], [574, 358], [664, 358]] },
  tall: { sea: glitter(tall, 0, toTall(0, 246)[1], TW, toTall(0, 290)[1]), neon: [...toTall(652, 166), ...toTall(742, 204)], exhausts: [toTall(110, 354), toTall(200, 354), toTall(574, 358), toTall(664, 358)] },
  play: { horizon: PH },
}
writeFileSync(DATA, `/**
 * What moves on RANDOM RACING's traced pictures, found by
 * \`scripts/games/racing-trace.ts\`: where the sea glitters, where the diner's
 * neon is, where the cars' exhausts are, on each title; the play's far view's
 * height. Generated — do not edit by hand.
 */

export const RACING_MOTION = ${JSON.stringify(data)} as const
`)
console.log('files', files.join(', '))
