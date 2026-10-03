/**
 * ATTACKS — RANDOM ATTACKS' title — in two free fonts, to choose from:
 * Zen Dots (The Dots Project Authors) with its strokes made twice as thick,
 * and Climate Crisis (The Climate Crisis Project Authors) as drawn, both
 * under the SIL Open Font License 1.1, files and licences in
 * `scripts/games/fonts/`. Each is written flat and large into a pixel mask
 * in `lib/games/attacks-lettering-data.ts`; the perspective, the depth, the
 * bands and the outline are drawn by the game (`lib/games/attacks.ts`), in
 * the theme's colour. Only the masks reach the site.
 *
 * Climate Crisis is a 3.6 MB variable font, kept out of the repository
 * while the owner chooses: to draw again, put
 * https://raw.githubusercontent.com/google/fonts/main/ofl/climatecrisis/ClimateCrisis%5BYEAR%5D.ttf
 * in `scripts/games/fonts/` as `ClimateCrisis-Variable.ttf` (its default,
 * 1979, is the solid one).
 *
 *   node --import tsx scripts/games/attacks-lettering.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillNonZero, Font, type Contour } from './ttf'

const SS = 2
const FONTS = join(__dirname, 'fonts')
/** The mask's width: about twice the widest title, so the perspective has fine pixels to read from. */
const WIDTH = 1200

type Variant = { name: string; file: string; bold: number }
const VARIANTS: Variant[] = [
  { name: 'zen', file: 'ZenDots-Regular.ttf', bold: 2 },
  { name: 'crisis', file: 'ClimateCrisis-Variable.ttf', bold: 1 },
]
const TEXT = 'ATTACKS'

type Mask = { w: number; h: number; data: Uint8Array }

/** Squared distance to the nearest set pixel (two passes of the lower-envelope method). */
function distance(mask: Mask): Float64Array {
  const { w, h, data } = mask
  const INF = 1e12, n = Math.max(w, h)
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  const pass = (len: number) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF
    for (let q = 1; q < len; q += 1) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) { k -= 1; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
      k += 1; v[k] = q; z[k] = s; z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < len; q += 1) { while (z[k + 1] < q) k += 1; d[q] = (q - v[k]) ** 2 + f[v[k]] }
  }
  const out = new Float64Array(w * h)
  for (let x = 0; x < w; x += 1) { for (let y = 0; y < h; y += 1) f[y] = data[y * w + x] ? 0 : INF; pass(h); for (let y = 0; y < h; y += 1) out[y * w + x] = d[y] }
  for (let y = 0; y < h; y += 1) { for (let x = 0; x < w; x += 1) f[x] = out[y * w + x]; pass(w); for (let x = 0; x < w; x += 1) out[y * w + x] = d[x] }
  return out
}

const dilate = (mask: Mask, r: number): Mask => (r <= 0 ? mask : { ...mask, data: Uint8Array.from(distance(mask), (d) => (d <= r * r ? 1 : 0)) })

/** A stroke's width, from the area and the length of the outline. */
function strokeWidth(mask: Mask): number {
  let area = 0, edge = 0
  const { w, h, data } = mask
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    if (!data[y * w + x]) continue
    area += 1
    if (!data[y * w + x - 1] || !data[y * w + x + 1] || !data[(y - 1) * w + x] || !data[(y + 1) * w + x]) edge += 1
  }
  return (2 * area) / Math.max(1, edge)
}

function build(v: Variant): { width: number; height: number; rows: string[] } {
  const font = new Font(join(FONTS, v.file))
  const glyphs = TEXT.split('').map((c) => font.glyph(c))
  const units = glyphs.reduce((sum, g) => sum + g.advance, 0)
  // first plain, to measure the stroke; then spaced by what the thickening adds, so letters never run into each other
  const layout = (scale: number, track: number) => {
    const pad = 40 * SS, baseline = font.unitsPerEm * scale + pad
    const contours: Contour[] = []
    let pen = 0
    for (const g of glyphs) { contours.push(...g.contours.map((c) => c.map(([x, y]) => [pad + pen + x * scale, baseline - y * scale] as [number, number]))); pen += g.advance * scale + track }
    return { contours, w: Math.ceil(pen + pad * 2), h: Math.ceil(font.unitsPerEm * scale * 1.5 + pad * 2) }
  }
  let scale = (WIDTH * SS) / units
  const plain = layout(scale, 0)
  const grow = ((v.bold - 1) / 2) * strokeWidth({ w: plain.w, h: plain.h, data: fillNonZero(plain.contours, plain.w, plain.h) })
  const track = grow * 2.2
  // the whole word kept at the same width once spaced
  scale = (WIDTH * SS - track * (glyphs.length - 1)) / units
  const placed = layout(scale, track)
  const big = dilate({ w: placed.w, h: placed.h, data: fillNonZero(placed.contours, placed.w, placed.h) }, grow)
  let x0 = big.w, y0 = big.h, x1 = 0, y1 = 0
  for (let y = 0; y < big.h; y += 1) for (let x = 0; x < big.w; x += 1) if (big.data[y * big.w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const width = Math.ceil((x1 - x0 + 1) / SS), height = Math.ceil((y1 - y0 + 1) / SS)
  const rows: string[] = []
  for (let py = 0; py < height; py += 1) {
    let row = ''
    for (let px = 0; px < width; px += 1) {
      let n = 0
      for (let sy = 0; sy < SS; sy += 1) for (let sx = 0; sx < SS; sx += 1) { const X = x0 + px * SS + sx, Y = y0 + py * SS + sy; if (X < big.w && Y < big.h && big.data[Y * big.w + X]) n += 1 }
      row += n * 2 >= SS * SS ? '1' : '0'
    }
    rows.push(row)
  }
  return { width, height, rows }
}

/** A row as the lengths of its alternating runs, off first, in base 36. */
const runs = (row: string): string => {
  const out: number[] = []
  let cur = '0', n = 0
  for (const c of row) { if (c === cur) n += 1; else { out.push(n); cur = c; n = 1 } }
  out.push(n)
  return out.map((k) => k.toString(36)).join('.')
}

const parts = VARIANTS.map((v) => {
  const { width, height, rows } = build(v)
  console.log(`${v.name}: ${width} × ${height}`)
  return `  ${v.name}: { width: ${width}, height: ${height}, runs: ${JSON.stringify(rows.map(runs).join(' '))} },`
})

writeFileSync(join(__dirname, '../../lib/games/attacks-lettering-data.ts'), `/**
 * ATTACKS as flat pixel masks, written by \`scripts/games/attacks-lettering.ts\`
 * from Zen Dots (The Dots Project Authors; strokes twice as thick) and
 * Climate Crisis (The Climate Crisis Project Authors), both SIL Open Font
 * License 1.1. Each row is the lengths of its alternating runs of pixels,
 * off first, in base 36. Generated — do not edit by hand.
 */

export const ATTACKS_LETTERING = {
${parts.join('\n')}
} as const

export type AttacksLettering = keyof typeof ATTACKS_LETTERING
`)
