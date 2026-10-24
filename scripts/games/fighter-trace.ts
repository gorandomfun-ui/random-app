/**
 * RANDOM FIGHTER's title pictures, traced from the owner's reference picture
 * (`docs/reports/jeux-v1/refs/fighter-reference-kick.png`, kept out of the
 * repository, made with ChatGPT): the ninja's flying kick at the burger
 * samurai before the temple at night, a burger ninja on its steps, the moon,
 * the cherry blossom, the volcano far off.
 *
 * The picture is first cleaned at its own size: its words (RANDOM, FIGHTER
 * with its red streaks, PRESS START, 1 PLAYER 2 PLAYERS) are taken out and
 * the sky or the paving drawn again under them — the game draws its own
 * RANDOM, FIGHTER in the theme's colour after the owner's other picture, and
 * PRESS START. Then, brought onto the games' grid and made simpler, as
 * RACING's were — the scenery painted flat in few colours, the fighters
 * lightly, each with their own colours:
 *
 * - `title-wide`: the whole picture, 768 × 432.
 * - `title-tall`: 432 × 768 for a phone held upright — the fight a little
 *   smaller at the foot, the night sky carried up above it for the title,
 *   with the moon and the cherry branch moved up into it.
 *
 * Written to `public/games/fighter/` as indexed PNG files.
 *
 *   node --import tsx scripts/games/fighter-trace.ts [preview dir]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { encodeIndexedPng, encodePng } from './png'
import { blank, copy, flatten, get, grow, inpaint, inPolygon, lum, paletteOf, pickIn, put, quantize, quantizeAreas, readRef, tidy, trace, tracePic, type Pic, type RGB } from './trace-kit'

const ROOT = process.cwd()
const REF = path.join(ROOT, 'docs/reports/jeux-v1/refs/fighter-reference-kick.png')
const OUT = path.join(ROOT, 'public/games/fighter')
const PREVIEW = process.argv[2]

const ref = readRef(REF)
const src = trace(ref, ref.width, ref.height)
type Rect = readonly [number, number, number, number]

// ---------------------------------------------------------------- the words taken out, at the picture's own size

/** The letters' colours: their greens, their creams, their dark outlines and depth (not the night's navy). */
const lettering = ([r, g, b]: RGB) => g > r + 40 || (r > 200 && g > 200 && b > 140 && b < 240) || (lum(r, g, b) < 42 && b < g + 25) || (g > b + 10 && g > r && lum(r, g, b) < 100)
const words = pickIn(src, [[590, 6, 1070, 100], [385, 95, 1300, 318]], lettering)
/** The red streak behind FIGHTER and past it on both sides (reds and their dark orange edges, never the night's blues). */
const streaks = pickIn(src, [[280, 110, 1390, 300]], ([r, g, b]) => r > 110 && r > b + 30 && r > g + 30)
/** PRESS START, its arrow, 1 PLAYER 2 PLAYERS: light letters and the green arrow on the paving. */
const press = pickIn(src, [[640, 845, 1020, 935]], ([r, g, b]) => lum(r, g, b) > 140 || g > r + 50)
const holes = new Uint8Array(src.w * src.h)
for (const [mask, by] of [[words, 4], [streaks, 4], [press, 3]] as const) { const g = grow(mask, src.w, src.h, by); for (let i = 0; i < holes.length; i += 1) if (g[i]) holes[i] = 1 }
inpaint(src, holes, 220)
const clean = src

// ---------------------------------------------------------------- out

/** The fighters' boxes at the picture's size: the ninja in his kick, the burger samurai, the burger ninja on the steps. */
const NINJA: Rect = [140, 320, 1040, 770], SAMURAI: Rect = [1000, 480, 1500, 870], LITTLE: Rect = [1405, 530, 1515, 640]
const inRect = (X: number, Y: number, [x0, y0, x1, y1]: Rect) => X >= x0 && X < x1 && Y >= y0 && Y < y1
const areaAt = (sx: number, sy: number) => (inRect(sx, sy, LITTLE) ? 3 : inRect(sx, sy, SAMURAI) ? 2 : inRect(sx, sy, NINJA) ? 1 : 0)

/** A title made simpler and reduced: the scenery flat and in few colours, each fighter lightly; each its own colours. */
function writeTitle(name: string, pic: Pic, areaOf: (x: number, y: number) => number): void {
  const flat = flatten(pic, 3), light = flatten(pic, 1)
  const masks = [1, 2, 3, 4].map(() => new Uint8Array(pic.w * pic.h))
  for (let y = 0; y < pic.h; y += 1) for (let x = 0; x < pic.w; x += 1) { const a = areaOf(x, y); if (a) { masks[a - 1][y * pic.w + x] = 1; put(flat, x, y, get(a === 4 ? pic : light, x, y)) } }
  const { palette, index } = quantizeAreas(flat, [{ mask: masks[0], k: 20 }, { mask: masks[1], k: 20 }, { mask: masks[2], k: 10 }, { mask: masks[3], k: 8 }, { mask: null, k: 30 }])
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, `${name}.png`), encodeIndexedPng(pic.w, pic.h, index, palette))
  if (PREVIEW) {
    const rgba = new Uint8ClampedArray(pic.w * pic.h * 4)
    for (let i = 0; i < pic.w * pic.h; i += 1) { const c = palette[index[i]]; rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255 }
    mkdirSync(PREVIEW, { recursive: true })
    writeFileSync(path.join(PREVIEW, `${name}.png`), encodePng(pic.w, pic.h, rgba, 2))
  }
  console.log(`${name}: ${pic.w} × ${pic.h}, ${palette.length} colours`)
}

// the wide title: the whole picture
const S = ref.width / 768
writeTitle('title-wide', tracePic(clean, 768, 432), (x, y) => areaAt((x + 0.5) * S, (y + 0.5) * S))

// the tall title: the fight from the lantern on the left to the steps on the right, at the foot; the night carried up above it, nothing stretched:
// the picture's own sky above the fight at the same size, darker and darker night above that, the moon and the cherry branch cut out and set in it
const CROP: Rect = [140, 290, 1500, 941]
const cw = CROP[2] - CROP[0], ch = CROP[3] - CROP[1], k = cw / 432, footH = Math.round(ch / k), bandH = Math.round(CROP[1] / k), topH = 768 - footH - bandH
const tall = blank(432, 768)
const foot = tracePic(clean, 432, footH, [CROP[0], CROP[1], cw, ch])
for (let y = 0; y < footH; y += 1) for (let x = 0; x < 432; x += 1) put(tall, x, 768 - footH + y, get(foot, x, y))
// the picture's sky without its moon and its branch, which are set in higher up
const MOON: Rect = [180, 55, 330, 200], BRANCH: Rect = [0, 0, 390, 310]
const moonish = ([r, g, b]: RGB) => lum(r, g, b) > 150 && b < g
const branchish = ([r, g, b]: RGB) => (r > g + 30 && r > 140) || (lum(r, g, b) < 45 && r + 8 >= b)
const skyOnly = copy(clean)
{ const out = new Uint8Array(src.w * src.h); for (const [area, pick] of [[MOON, moonish], [BRANCH, branchish]] as const) { const m = pickIn(skyOnly, [area], pick); for (let i = 0; i < out.length; i += 1) if (m[i]) out[i] = 1 } inpaint(skyOnly, grow(out, src.w, src.h, 3), 160) }
const band = tracePic(skyOnly, 432, bandH, [CROP[0], 0, cw, CROP[1]])
for (let y = 0; y < bandH; y += 1) for (let x = 0; x < 432; x += 1) put(tall, x, topH + y, get(band, x, y))
const NIGHT: RGB = [2, 20, 58]
// the band's top row, all across, the colour the night above comes down to
const joinAt: RGB = [0, 0, 0]
for (let x = 0; x < 432; x += 1) { const c = get(band, x, 0); joinAt[0] += c[0] / 432; joinAt[1] += c[1] / 432; joinAt[2] += c[2] / 432 }
for (let y = 0; y < topH; y += 1) for (let x = 0; x < 432; x += 1) {
  const t = Math.pow(y / topH, 1.4)
  put(tall, x, y, [NIGHT[0] + (joinAt[0] - NIGHT[0]) * t, NIGHT[1] + (joinAt[1] - NIGHT[1]) * t, NIGHT[2] + (joinAt[2] - NIGHT[2]) * t])
}
// and the band's top rows faded into that night
for (let y = 0; y < 14; y += 1) for (let x = 0; x < 432; x += 1) { const c = get(tall, x, topH + y), t = y / 14; put(tall, x, topH + y, [joinAt[0] + (c[0] - joinAt[0]) * t, joinAt[1] + (c[1] - joinAt[1]) * t, joinAt[2] + (c[2] - joinAt[2]) * t]) }
/**
 * A part of the picture cut out by its colours at the picture's own size,
 * then set down on the tall title at `x`, `y`, `scale` reference pixels to
 * one: each pixel the average of the part's own pixels in its cell, where
 * they cover enough of it — so a thin branch keeps its wood.
 */
/** Which pixels of the tall title are the moon and the branch, given their own colours. */
const setInto = new Uint8Array(432 * 768)
const setIn = (area: Rect, pick: (c: RGB) => boolean, x0: number, y0: number, scale: number) => {
  const w = Math.round((area[2] - area[0]) / scale), h = Math.round((area[3] - area[1]) / scale)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let r = 0, g = 0, b = 0, n = 0, all = 0
    for (let yy = Math.floor(area[1] + y * scale); yy < Math.floor(area[1] + (y + 1) * scale); yy += 1) for (let xx = Math.floor(area[0] + x * scale); xx < Math.floor(area[0] + (x + 1) * scale); xx += 1) {
      all += 1
      const c = get(clean, xx, yy)
      if (pick(c)) { r += c[0]; g += c[1]; b += c[2]; n += 1 }
    }
    if (n > all * 0.3 && x0 + x < 432 && y0 + y < 768) { put(tall, x0 + x, y0 + y, [r / n, g / n, b / n]); setInto[(y0 + y) * 432 + x0 + x] = 1 }
  }
}
setIn(MOON, moonish, 300, topH - 40, k / 1.3)
setIn(BRANCH, branchish, 0, 0, k / 1.15)
writeTitle('title-tall', tall, (x, y) => { if (setInto[y * 432 + x]) return 4; if (y < 768 - footH) return 0; return areaAt(CROP[0] + (x + 0.5) * k, CROP[1] + (y - (768 - footH) + 0.5) * k) })

// ---------------------------------------------------------------- the play's backdrops, the fighters taken out

/**
 * A place for the play out of a reference picture: its fighters (inside
 * their rough outlines, a little wider) and its words taken out and drawn
 * again from what lies beside them on the same row — mirrored from each
 * side, so the railing, the paving's lines, the lake's ripples run on —
 * then brought to the stage's size, painted flat and reduced like the titles.
 */
type Poly = ReadonlyArray<readonly [number, number]>
function fillRows(p: Pic, hole: Uint8Array): void {
  const done = new Uint8Array(hole)
  for (let y = 0; y < p.h; y += 1) {
    let x = 0
    while (x < p.w) {
      if (!hole[y * p.w + x]) { x += 1; continue }
      let e = x
      while (e < p.w && hole[y * p.w + e]) e += 1
      const xl = x - 1, xr = e
      for (let X = x; X < e; X += 1) {
        const fromLeft = xl >= 0 && (xr >= p.w || X - xl <= xr - X)
        let sx = fromLeft ? xl - (X - xl) + 1 : xr + (xr - X) - 1
        sx = Math.max(0, Math.min(p.w - 1, sx))
        if (hole[y * p.w + sx]) sx = fromLeft ? Math.max(0, xl) : Math.min(p.w - 1, xr)
        put(p, X, y, get(p, sx, y))
        done[y * p.w + X] = 0
      }
      x = e
    }
  }
}
function backdrop(file: string, holes: { polys: Poly[]; rects: Array<[number, number, number, number]>; sky: number }, words: (pic: Pic) => Uint8Array): Pic {
  const r = readRef(path.join(ROOT, file))
  const pic = trace(r, r.width, r.height)
  const hole = words(pic)
  for (const poly of holes.polys) {
    const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y)
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y += 1) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x += 1) if (inPolygon(x + 0.5, y + 0.5, poly)) hole[y * pic.w + x] = 1
  }
  for (const [x0, y0, x1, y1] of holes.rects) for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) hole[y * pic.w + x] = 1
  // in the sky (above `sky`), where the words were, drawn again smoothly from round them; below it, along the rows
  const grown = grow(hole, pic.w, pic.h, 4), low = new Uint8Array(grown), high = new Uint8Array(grown)
  for (let i = 0; i < grown.length; i += 1) { if (Math.floor(i / pic.w) < holes.sky) low[i] = 0; else high[i] = 0 }
  fillRows(pic, low)
  inpaint(pic, high, 260)
  return pic
}
function writeBackdrop(name: string, pic: Pic, w: number, h: number, area: [number, number, number, number]): void {
  const small = flatten(tracePic(pic, w, h, area), 3)
  const palette = paletteOf(small, 32)
  const index = tidy(quantize(small, palette), w, h, 6, 2)
  writeFileSync(path.join(OUT, `${name}.png`), encodeIndexedPng(w, h, index, palette))
  if (PREVIEW) {
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i += 1) { const c = palette[index[i]]; rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255 }
    writeFileSync(path.join(PREVIEW, `${name}.png`), encodePng(w, h, rgba, 2))
  }
  console.log(`${name}: ${w} × ${h}, ${palette.length} colours`)
}

// the night: the temple, the lantern, the volcano far off; the ninja, the samurai, the burger ninja on the steps taken out, and the words
const night = backdrop('docs/reports/jeux-v1/refs/fighter-reference-kick.png', {
  polys: [
    [[145, 328], [480, 333], [622, 338], [702, 428], [872, 428], [872, 506], [802, 520], [852, 553], [1032, 558], [1032, 657], [950, 662], [870, 642], [722, 642], [722, 772], [628, 772], [558, 702], [448, 692], [368, 622], [358, 562], [258, 522], [248, 492], [145, 472]],
    [[1008, 493], [1238, 478], [1372, 478], [1402, 558], [1442, 608], [1452, 700], [1432, 760], [1492, 798], [1502, 862], [1378, 864], [1328, 822], [1150, 832], [1010, 832], [993, 862], [903, 862], [928, 800], [998, 758], [1038, 700], [1088, 640], [1008, 522]],
  ],
  rects: [[1400, 525, 1520, 645]], sky: 610,
}, (pic) => { const w = pickIn(pic, [[590, 6, 1070, 100], [385, 95, 1300, 318]], lettering); const st = pickIn(pic, [[280, 110, 1390, 300]], ([r, g, b]) => r > 110 && r > b + 30 && r > g + 30); const pr = pickIn(pic, [[640, 845, 1020, 935]], ([r, g, b]) => lum(r, g, b) > 140 || g > r + 50); for (let i = 0; i < w.length; i += 1) if (st[i] || pr[i]) w[i] = 1; return w })
writeBackdrop('play-night-wide', night, 448, 320, [180, 0, 1317, 941])
writeBackdrop('play-night-tall', night, 320, 380, [420, 0, 781, 927])

// the dusk: the gate, the stone lanterns, the lake under the sunset, the volcano, the temple; the ninja, the samurai, the two burger ninjas taken out, and the words
const dusk = backdrop('docs/reports/jeux-v1/refs/fighter-reference-guard.png', {
  polys: [
    [[195, 545], [390, 512], [462, 512], [472, 560], [612, 598], [612, 662], [522, 692], [592, 800], [588, 852], [498, 852], [468, 790], [380, 772], [300, 782], [222, 852], [143, 852], [148, 818], [228, 738], [278, 700], [283, 650], [188, 616]],
    [[962, 526], [992, 518], [1100, 640], [1125, 600], [1140, 560], [1150, 476], [1297, 476], [1337, 553], [1397, 563], [1428, 638], [1432, 760], [1432, 870], [1333, 872], [1288, 837], [1182, 837], [1157, 872], [1063, 872], [1073, 800], [1098, 755], [1070, 712], [962, 540]],
    [[903, 698], [960, 688], [1052, 688], [1082, 718], [1087, 792], [1062, 827], [928, 827], [903, 792]],
    [[1408, 688], [1520, 688], [1617, 698], [1617, 762], [1592, 772], [1592, 832], [1562, 847], [1438, 847], [1408, 802]],
  ],
  rects: [], sky: 420,
}, (pic) => { const w = pickIn(pic, [[560, 10, 1090, 105], [330, 90, 1400, 400]], lettering); const st = pickIn(pic, [[150, 80, 1520, 410]], ([r, g, b]) => r > 170 && g < 110 && b < 110 && r > b + 60); const pr = pickIn(pic, [[640, 840, 1030, 935]], ([r, g, b]) => lum(r, g, b) > 140 || g > r + 50); for (let i = 0; i < w.length; i += 1) if (st[i] || pr[i]) w[i] = 1; return w })
writeBackdrop('play-dusk-wide', dusk, 448, 320, [180, 0, 1317, 941])
writeBackdrop('play-dusk-tall', dusk, 320, 380, [420, 0, 781, 927])
