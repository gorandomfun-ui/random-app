/**
 * RANDOM FIGHTER's fighters for its screens of play, cut out of the owner's
 * two reference pictures (`docs/reports/jeux-v1/refs/fighter-reference-
 * guard.png` and `-kick.png`, kept out of the repository, made with
 * ChatGPT): the ninja on guard and in his flying kick, the burger samurai on
 * guard and crouched with his sword, two burger ninjas. Each is cut along its
 * own ink outline (the background flooded in from a rough outline drawn round
 * it, up to the ink), brought down to the size the play draws it — all at
 * the same scale, measured on their heads — made simpler as the titles are,
 * in their own few colours, their pixels outside them clear.
 *
 * Written to `public/games/fighter/` as indexed PNG files with a clear
 * colour, and their sizes to `lib/games/fighter-art-data.ts`.
 *
 *   node --import tsx scripts/games/fighter-sprites.ts [preview dir]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { encodeIndexedPng, encodePng } from './png'
import { biggest, cutOut, flatten, get, grow, inPolygon, lum, paletteOf, quantize, readRef, trace, type Pic, type RGB } from './trace-kit'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'public/games/fighter')
const DATA = path.join(ROOT, 'lib/games/fighter-art-data.ts')
const PREVIEW = process.argv[2]

const pictures = {
  guard: trace(readRef(path.join(ROOT, 'docs/reports/jeux-v1/refs/fighter-reference-guard.png')), 1672, 941),
  kick: trace(readRef(path.join(ROOT, 'docs/reports/jeux-v1/refs/fighter-reference-kick.png')), 1672, 941),
}
type Poly = ReadonlyArray<readonly [number, number]>

/**
 * A figure cut along its ink: the ink's little gaps closed first (the ink
 * grown by `close` pixels), the background flooded in from the edges of the
 * rough outline up to it; then the fringe of background the closing left
 * round the outside taken off again, a pixel at a time, as far as it was
 * grown — never the ink itself, nor anything the ink shuts in.
 */
function cutAlongInk(p: Pic, poly: Poly, isInk: (c: RGB) => boolean, close: number): Uint8Array {
  const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y)
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(p.w - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(p.h - 1, Math.ceil(Math.max(...ys)))
  const inside = new Uint8Array(p.w * p.h), ink = new Uint8Array(p.w * p.h)
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { const i = y * p.w + x; if (inPolygon(x + 0.5, y + 0.5, poly)) inside[i] = 1; if (isInk(get(p, x, y))) ink[i] = 1 }
  const wall = grow(ink, p.w, p.h, close)
  const out = new Uint8Array(p.w * p.h), queue: number[] = []
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const i = y * p.w + x
    if (!inside[i] || wall[i]) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside[(y + dy) * p.w + x + dx])) { out[i] = 1; queue.push(i) }
  }
  const spread = (from: number[], pass: (j: number) => boolean) => {
    while (from.length) {
      const i = from.pop()!, x = i % p.w, y = Math.floor(i / p.w)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy, j = Y * p.w + X; if (X < x0 || Y < y0 || X > x1 || Y > y1 || !inside[j] || out[j] || !pass(j)) continue; out[j] = 1; from.push(j) }
    }
  }
  spread(queue, (j) => !wall[j])
  // the fringe: what the closing walled off outside the ink, given back to the background
  for (let k = 0; k < close; k += 1) {
    const next: number[] = []
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { const i = y * p.w + x; if (out[i] || ink[i] || !wall[i] || !inside[i]) continue; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => out[(y + dy) * p.w + x + dx])) next.push(i) }
    for (const i of next) out[i] = 1
  }
  const figure = new Uint8Array(p.w * p.h)
  for (let i = 0; i < figure.length; i += 1) figure[i] = inside[i] && !out[i] ? 1 : 0
  return figure
}

/**
 * Each figure: the picture it is cut from, a rough outline round it (in the
 * picture's pixels), how dark its ink is (what the background's flood stops
 * at: the night picture's sky is nearly as dark as the ink), and how many of
 * the picture's pixels make one of the play's — the guard picture's figures
 * are drawn smaller than the kick picture's, so each has its own.
 */
const FIGURES: Record<string, { from: keyof typeof pictures; poly: Poly; ink: number; scale: number; colours: number; close?: number; drop?: { rect: readonly [number, number, number, number]; pick: (c: RGB) => boolean } }> = {
  'ninja-guard': {
    from: 'guard', ink: 30, scale: 3.1, colours: 18,
    poly: [[195, 545], [390, 512], [462, 512], [472, 560], [612, 598], [612, 662], [522, 692], [592, 800], [588, 852], [498, 852], [468, 790], [380, 772], [300, 782], [222, 852], [143, 852], [148, 818], [228, 738], [278, 700], [283, 650], [188, 616]],
  },
  'ninja-kick': {
    from: 'kick', ink: 24, scale: 5.6, colours: 18, close: 3,
    poly: [[145, 328], [480, 333], [622, 338], [702, 428], [872, 428], [872, 506], [802, 520], [852, 553], [1032, 558], [1032, 657], [950, 662], [870, 642], [722, 642], [722, 772], [628, 772], [558, 702], [448, 692], [368, 622], [358, 562], [258, 522], [248, 492], [145, 472]],
  },
  'samurai-guard': {
    from: 'guard', ink: 30, scale: 3.1, colours: 20, close: 3,
    // the trees seen through his helmet's crescent: dark greens, which neither the helmet's red nor its gold have
    drop: { rect: [1140, 470, 1300, 565], pick: ([r, g]) => g > r + 8 },
    // (close along the sword, the dark trees behind it left out)
    poly: [[962, 526], [992, 518], [1100, 640], [1125, 600], [1140, 560], [1150, 476], [1297, 476], [1337, 553], [1397, 563], [1428, 638], [1432, 760], [1432, 870], [1333, 872], [1288, 837], [1182, 837], [1157, 872], [1063, 872], [1073, 800], [1098, 755], [1070, 712], [962, 540]],
  },
  'samurai-crouch': {
    from: 'kick', ink: 24, scale: 4.9, colours: 20,
    poly: [[1008, 493], [1238, 478], [1372, 478], [1402, 558], [1442, 608], [1452, 700], [1432, 760], [1492, 798], [1502, 862], [1378, 864], [1328, 822], [1150, 832], [1010, 832], [993, 862], [903, 862], [928, 800], [998, 758], [1038, 700], [1088, 640], [1008, 522]],
  },
  'burger-ninja-a': {
    from: 'guard', ink: 30, scale: 3.1, colours: 14,
    poly: [[903, 698], [960, 688], [1052, 688], [1082, 718], [1087, 792], [1062, 827], [928, 827], [903, 792]],
  },
  'burger-ninja-b': {
    from: 'guard', ink: 30, scale: 3.1, colours: 14,
    poly: [[1408, 688], [1520, 688], [1617, 698], [1617, 762], [1592, 772], [1592, 832], [1562, 847], [1438, 847], [1408, 802]],
  },
}

const sizes: Record<string, { width: number; height: number }> = {}
for (const [name, f] of Object.entries(FIGURES)) {
  const pic = pictures[f.from]
  // (only the figure itself: the dark specks of the background the ink test kept, apart from it, left out)
  const mask = biggest(cutAlongInk(pic, f.poly, ([r, g, b]: RGB) => lum(r, g, b) < f.ink, f.close ?? 2), pic.w, pic.h)
  if (f.drop) { const [dx0, dy0, dx1, dy1] = f.drop.rect; for (let y = dy0; y < dy1; y += 1) for (let x = dx0; x < dx1; x += 1) if (f.drop.pick(get(pic, x, y))) mask[y * pic.w + x] = 0 }
  const xs = f.poly.map(([x]) => x), ys = f.poly.map(([, y]) => y)
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const
  const width = Math.round((box[2] - box[0]) / f.scale)
  const cut = cutOut(flatten(pic, 1), mask, box, width, 0.45)
  const palette = paletteOf(cut.pic, f.colours, cut.alpha)
  const index = quantize(cut.pic, palette, undefined).map((v, i) => (cut.alpha[i] ? v + 1 : 0))
  const out = [[0, 0, 0] as RGB, ...palette]
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, `${name}.png`), encodeIndexedPng(cut.pic.w, cut.pic.h, index, out, true))
  sizes[name] = { width: cut.pic.w, height: cut.pic.h }
  if (PREVIEW) {
    const rgba = new Uint8ClampedArray(cut.pic.w * cut.pic.h * 4)
    for (let i = 0; i < cut.pic.w * cut.pic.h; i += 1) { const c = index[i] ? out[index[i]] : [255, 0, 255]; rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255 }
    mkdirSync(PREVIEW, { recursive: true })
    writeFileSync(path.join(PREVIEW, `${name}.png`), encodePng(cut.pic.w, cut.pic.h, rgba, 3))
  }
  console.log(`${name}: ${cut.pic.w} × ${cut.pic.h}, ${palette.length} colours`)
}

writeFileSync(DATA, `/**
 * RANDOM FIGHTER's cut-out fighters and their sizes on the play's grid —
 * written by \`scripts/games/fighter-sprites.ts\` (the pictures themselves in
 * \`public/games/fighter/\`). Generated — do not edit by hand.
 */

export const FIGHTER_SPRITES = ${JSON.stringify(sizes, null, 2).replace(/"([a-z-]+)":/g, "'$1':")} as const
export type FighterSprite = keyof typeof FIGHTER_SPRITES
`)
