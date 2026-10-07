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
 * - `car-<kind>-<width>`, `car-<kind>-<width>-turn`: each car cut out along
 *   its outline, at the sizes the screens draw it, its pixels outside it
 *   clear; straight from behind, and turning right (the game mirrors it to
 *   turn left).
 * - `play-back`: the far view for the play — the sea, the sun, the
 *   mountains, the city — without the near palms, 448 wide.
 * - `palm`: what stands by the road in the play, cut out, fine enough to come close.
 *
 * The owner found the picture as traced too far from the other games'
 * visuals: everything is then made simpler, nearer their level of detail —
 * painted flat (the grain of the picture's textures goes, the edges stay),
 * its colours fewer — three or four tones a thing, as the other games' — its
 * lone pixels taken in: the scenery strongly, the cars and the diner
 * lightly, each with its own few colours, so they stay sharp. The diner's
 * neon and the sun's path on the sea are drawn again by the game, sharp, so
 * they can move.
 *
 * Written to `public/games/racing/` as indexed PNG files, and the few numbers
 * the game needs to `lib/games/racing-art-data.ts`.
 *
 *   node --import tsx scripts/games/racing-trace.ts [preview dir]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { encodeIndexedPng, encodePng } from './png'
import { biggest, blank, copy, cutByFlood, evened, flatten, get, grow, inpaint, inPolygon, leaning, lum, mirrored, paletteOf, pickIn, put, quantize, quantizeAreas, readRef, tidy, trace, tracePic, type Pic, type RGB } from './trace-kit'

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
// the sun's path on the sea, light under the sun: the game draws its own, sharp and shimmering
const sunlit = ([r, g, b]: RGB) => r > 190 && g > 130 && b < 210 && r - b > 30
const glare = pickIn(src, [big([176, 246, 336, 267])], ([r, g, b]) => lum(r, g, b) > 150 || (r > 200 && g > 140))
// the far red chevrons by the sea, their panels and posts: neither the sea's blue nor the sun's light round them; left whole, and kept sharp
const signs = pickIn(src, [big([251, 267, 269, 286]), big([310, 265, 325, 280])], (c) => c[2] <= c[0] && !sunlit(c))
const signsNear = grow(signs, src.w, src.h, 2)
// the sun's gold: too little of the tall title to win a colour of its own among the sky's, so given its own
const gold = pickIn(src, [big([186, 172, 304, 254])], ([r, g, b]) => r > 220 && g > 170 && b < 150)
// down to the shore, round the signs and the rail: only the sun's warm light
{ const low = pickIn(src, [big([196, 267, 272, 278])], sunlit); for (let i = 0; i < low.length; i += 1) if (low[i] && !signsNear[i]) glare[i] = 1 }
const holes = new Uint8Array(src.w * src.h)
for (const [mask, by] of [[words, 4], [streaks, 4], [press, 3], [horse, 2], [flags, 2], [glare, 3]] as const) { const g = grow(mask, src.w, src.h, by); for (let i = 0; i < holes.length; i += 1) if (g[i] && !signs[i]) holes[i] = 1 }
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
  // lone pixels taken in (not on a cut-out, whose edge would darken)
  if (!alpha) index = tidy(index, pic.w, pic.h, 6, 2)
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

/** The diner's box on the grid, at the reference's size. */
const DINER: Rect = big([636, 156, 768, 262])
const inRect = (X: number, Y: number, [x0, y0, x1, y1]: Rect) => X >= x0 && X < x1 && Y >= y0 && Y < y1
/** Which area of a title a pixel belongs to, at the reference's point under it: 1–3 a car, 4 the diner, 5 the far signs, 6 the sun, 0 the scenery. */
const areaAt = (sx: number, sy: number) => {
  const X = Math.min(src.w - 1, Math.max(0, Math.floor(sx))), Y = Math.min(src.h - 1, Math.max(0, Math.floor(sy))), i = Y * src.w + X
  return carMasks.rosso[i] ? 1 : carMasks.burger[i] ? 2 : carMasks.giallo[i] ? 3 : inRect(X, Y, DINER) ? 4 : signs[i] ? 5 : gold[i] ? 6 : 0
}
/** A title made simpler and reduced: the scenery and the sun flat and in few colours, each car, the diner and the far signs lightly; each its own colours. */
function writeTitle(name: string, pic: Pic, areaOf: (x: number, y: number) => number): void {
  const flat = flatten(pic, 3), light = flatten(pic, 1)
  const masks = [1, 2, 3, 4, 5, 6].map(() => new Uint8Array(pic.w * pic.h))
  for (let y = 0; y < pic.h; y += 1) for (let x = 0; x < pic.w; x += 1) { const a = areaOf(x, y); if (a) { masks[a - 1][y * pic.w + x] = 1; if (a !== 6) put(flat, x, y, get(light, x, y)) } }
  const { palette, index } = quantizeAreas(flat, [{ mask: masks[0], k: 16 }, { mask: masks[1], k: 16 }, { mask: masks[2], k: 16 }, { mask: masks[3], k: 14 }, { mask: masks[4], k: 6 }, { mask: masks[5], k: 3 }, { mask: null, k: 28 }])
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, `${name}.png`), encodeIndexedPng(pic.w, pic.h, index, palette))
  files.push(name)
  if (PREVIEW) {
    const rgba = new Uint8ClampedArray(pic.w * pic.h * 4)
    for (let i = 0; i < pic.w * pic.h; i += 1) { const c = palette[index[i]]; rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255 }
    mkdirSync(PREVIEW, { recursive: true })
    writeFileSync(path.join(PREVIEW, `${name}.png`), encodePng(pic.w, pic.h, rgba, 2))
  }
  console.log(`${name}: ${pic.w} × ${pic.h}, ${palette.length} colours`)
}

// the wide title
const titleWide = tracePic(clean, 768, 432)
writeTitle('title-wide', titleWide, (x, y) => areaAt((x + 0.5) * S, (y + 0.5) * S))

// the cars at the sizes the screens draw them: the tall title's, the play's own car, the rivals'
const CAR_WIDTHS = [130, 104, 60]
/**
 * Where a car's back is centred in its cut-out: the middle of its number
 * plate (light, hardly coloured, low in the middle). The picture shows the
 * red car a little from its right and the yellow one a little from its left
 * — where they stand on the road — so the plate is off the cut-out's middle.
 */
function plateMiddle(pic: Pic, alpha: Uint8Array): number {
  let sx = 0, n = 0
  for (let y = Math.round(pic.h * 0.45); y < Math.round(pic.h * 0.9); y += 1) for (let x = Math.round(pic.w * 0.15); x < Math.round(pic.w * 0.85); x += 1) {
    const c = get(pic, x, y)
    if (alpha[y * pic.w + x] && lum(c[0], c[1], c[2]) > 165 && sat(c) < 75) { sx += x + 0.5; n += 1 }
  }
  return n ? sx / n : pic.w / 2
}
/**
 * Each car three ways, so it drives straight and turns: straight from behind
 * — for the red and the yellow, the half of the back away from the flank the
 * picture shows, and its mirror; the burger as it is — and turning right:
 * the red one as the picture has it (its right flank showing), the yellow
 * one mirrored, the burger leaning into the turn. Turning left is the same
 * mirrored, by the game. Each turning picture has the straight one's back on
 * its left, the flank or the lean past it.
 */
for (const kind of Object.keys(CARS) as Array<keyof typeof CARS>) {
  // the plate found once, on the largest picture, and the same share of the width on the smaller ones
  let share = 0.5
  for (const width of CAR_WIDTHS) {
    const cut = cutOut(clean, carMasks[kind], boxOf(CARS[kind]), Math.round(width * (kind === 'burger' ? 0.78 : 1)))
    if (width === CAR_WIDTHS[0]) share = plateMiddle(cut.pic, cut.alpha) / cut.pic.w
    const axis = share * cut.pic.w
    const straight = kind === 'burger' ? cut : evened(cut.pic, cut.alpha, axis, kind === 'rosso' ? 'left' : 'right')
    const turn = kind === 'burger' ? leaning(cut.pic, cut.alpha, cut.pic.w * 0.13, Math.round(cut.pic.h * 0.74)) : kind === 'rosso' ? cut : mirrored(cut.pic, cut.alpha)
    console.log(`${kind} ${width}: back's middle at ${share.toFixed(3)} of its width; straight ${straight.pic.w}, turning ${turn.pic.w}`)
    write(`car-${kind}-${width}`, width >= 100 ? flatten(straight.pic, 1) : straight.pic, 24, undefined, straight.alpha)
    write(`car-${kind}-${width}-turn`, width >= 100 ? flatten(turn.pic, 1) : turn.pic, 24, undefined, turn.alpha)
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
writeTitle('title-tall', tall, (x, y) => (y >= bandTop && y < bandTop + bandH ? areaAt(WIN[0] + (x + 0.5) * F, (y - bandTop + 0.5) * F) : 0))

// ---------------------------------------------------------------- the play's far view and roadside things

/** The far view: the sky low down, the sun on the sea, the mountains, the city — between the big palms — to the sea's horizon. */
const FAR: Rect = [300, 250, 1220, 548]
const PW = 448, PH = Math.round(((FAR[3] - FAR[1]) * PW) / (FAR[2] - FAR[0]))
// the bit of a near palm's crown at its left edge left out, on a copy (the titles keep it): the game slides the view as the road bends, its edges mirrored
const far = copy(clean)
inpaint(far, grow(pickIn(far, [[FAR[0] - 90, FAR[1], FAR[0] + 46, FAR[1] + 290]], (c) => palmish(c) || lum(c[0], c[1], c[2]) < 70), src.w, src.h, 3), 200)
const farPic = tracePic(far, PW, PH, [FAR[0], FAR[1], FAR[2] - FAR[0], FAR[3] - FAR[1]])
write('play-back', flatten(farPic, 3), 28)

// a palm for the roadside: the one on the left in the picture, its crown and trunk, without the sky and the sea behind
const PALM: ReadonlyArray<readonly [number, number]> = [[31, 156], [60, 148], [116, 158], [120, 198], [96, 212], [66, 214], [58, 260], [54, 300], [44, 300], [48, 250], [56, 212], [31, 206]]
const palmMask = new Uint8Array(src.w * src.h)
{
  const poly = bigPoly(PALM), [bx0, by0, bx1, by1] = boxOf(PALM)
  for (let y = by0; y < by1; y += 1) for (let x = bx0; x < bx1; x += 1) { const c = get(clean, x, y); if (inPolygon(x + 0.5, y + 0.5, poly) && (palmish(c) || lum(c[0], c[1], c[2]) < 60)) palmMask[y * src.w + x] = 1 }
}
const palm = cutOut(clean, palmMask, boxOf(PALM), 160, 0.3)
// the palm alone, the bits of its neighbours caught in the cut dropped
write('palm', flatten(palm.pic, 1), 16, undefined, biggest(palm.alpha, palm.pic.w, palm.pic.h))
// ---------------------------------------------------------------- what the game needs to know

/** Where the sea glitters on a picture (its brightest pixels in a rectangle). */
const glitter = (pic: Pic, x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const [r, g, b] = get(pic, x, y); if (lum(r, g, b) > 205 && b > 150) out.push([x, y]) }
  // a hundred at most, spread over all of them
  return out.filter((_, i) => i % Math.max(1, Math.ceil(out.length / 100)) === 0)
}
const toTall = (x: number, y: number): [number, number] => [Math.round((x * S - WIN[0]) / F), Math.round(bandTop + (y * S) / F)]
/** A box moved left as far as it needs to stand whole on a picture `w` wide (the diner's sign, cut by the tall title's edge). */
const inside = ([x0, y0, x1, y1]: number[], w: number): number[] => { const by = Math.max(0, x1 - (w - 2)); return [x0 - by, y0, x1 - by, y1] }
/** The sun's path on the sea, as the game draws it: under the sun's middle, from the sea's horizon to the shore, wide at the horizon, narrowing to the shore, clear of the signs by it. */
const SUN = { x: 240, top: 252, bottom: 276, half: 26 }
/** Each car's box on a title (`at` from the wide grid to the title's): where a finger chooses it, where the choice is marked. */
const carBoxes = (at: (x: number, y: number) => [number, number]) => Object.fromEntries((Object.keys(CARS) as Array<keyof typeof CARS>).map((kind) => {
  const xs = CARS[kind].map(([x]) => x), ys = CARS[kind].map(([, y]) => y)
  return [kind, [...at(Math.min(...xs), Math.min(...ys)), ...at(Math.max(...xs), Math.max(...ys))]]
})) as Record<keyof typeof CARS, number[]>
const data = {
  wide: { sea: glitter(titleWide, 0, 246, 480, 290), neon: [654, 176, 742, 206], exhausts: [[110, 354], [200, 354], [574, 358], [664, 358]], sun: [SUN.x, SUN.top, SUN.bottom, SUN.half], cars: carBoxes((x, y) => [x, y]) },
  tall: { sea: glitter(tall, 0, toTall(0, 246)[1], TW, toTall(0, 290)[1]), neon: inside([...toTall(654, 176), ...toTall(742, 206)], TW), exhausts: [toTall(110, 354), toTall(200, 354), toTall(574, 358), toTall(664, 358)], sun: [toTall(SUN.x, 0)[0], toTall(0, SUN.top)[1], toTall(0, SUN.bottom)[1], Math.round((SUN.half * S) / F)], cars: carBoxes(toTall) },
  play: { horizon: PH },
}
writeFileSync(DATA, `/**
 * What moves on RANDOM RACING's traced pictures, found by
 * \`scripts/games/racing-trace.ts\`: where the sea glitters, where the diner's
 * neon is, where the cars' exhausts are and their boxes, on each title; the
 * play's far view's height. Generated — do not edit by hand.
 */

export const RACING_MOTION = ${JSON.stringify(data)} as const
`)
console.log('files', files.join(', '))
