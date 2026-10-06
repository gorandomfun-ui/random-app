/**
 * A game's words as flat pixel masks, from a font in `scripts/games/fonts/`:
 * written large, their strokes thickened as asked — grown square, so the
 * corners stay sharp — then brought down to pixels. The game draws them in
 * its own manner (perspective, depth, bands, outline). Shared by the
 * lettering scripts of ATTACKS and RACING.
 */

import { join } from 'node:path'

import { fillNonZero, Font, type Contour } from './ttf'

const SS = 2
const FONTS = join(__dirname, 'fonts')
/** The mask's width: about twice the widest title, so the game has fine pixels to read from. */
const WIDTH = 1200

export type Variant = { name: string; file: string; bold: number; text: string }

type Mask = { w: number; h: number; data: Uint8Array }

/**
 * A mask grown by `r` pixels as a square grows — every pixel within `r`
 * across and `r` up or down — so a corner stays a corner; growing by
 * distance (a disc) would round every one of them.
 */
function dilate(mask: Mask, r: number): Mask {
  const k = Math.round(r)
  if (k <= 0) return mask
  const { w, h, data } = mask
  const rows = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    let last = -Infinity
    // forward and back: within k of a set pixel along the row
    for (let x = 0; x < w; x += 1) { if (data[y * w + x]) last = x; if (x - last <= k) rows[y * w + x] = 1 }
    last = Infinity
    for (let x = w - 1; x >= 0; x -= 1) { if (data[y * w + x]) last = x; if (last - x <= k) rows[y * w + x] = 1 }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x += 1) {
    let last = -Infinity
    for (let y = 0; y < h; y += 1) { if (rows[y * w + x]) last = y; if (y - last <= k) out[y * w + x] = 1 }
    last = Infinity
    for (let y = h - 1; y >= 0; y -= 1) { if (rows[y * w + x]) last = y; if (last - y <= k) out[y * w + x] = 1 }
  }
  return { w, h, data: out }
}

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

/** A word in a font, its strokes `bold` times as thick, about `width` pixels wide: its rows of pixels, '1' on. */
export function build(v: Variant, width = WIDTH): { width: number; height: number; rows: string[] } {
  const font = new Font(join(FONTS, v.file))
  // a space is a glyph with no outline: its advance alone
  const glyphs = v.text.split('').map((c) => font.glyph(c))
  const units = glyphs.reduce((sum, g) => sum + g.advance, 0)
  // first plain, to measure the stroke; then spaced by what the thickening adds, so letters never run into each other
  const layout = (scale: number, track: number) => {
    const pad = 40 * SS, baseline = font.unitsPerEm * scale + pad
    const contours: Contour[] = []
    let pen = 0
    for (const g of glyphs) { contours.push(...g.contours.map((c) => c.map(([x, y]) => [pad + pen + x * scale, baseline - y * scale] as [number, number]))); pen += g.advance * scale + track }
    return { contours, w: Math.ceil(pen + pad * 2), h: Math.ceil(font.unitsPerEm * scale * 1.5 + pad * 2) }
  }
  let scale = (width * SS) / units
  const plain = layout(scale, 0)
  const grow = ((v.bold - 1) / 2) * strokeWidth({ w: plain.w, h: plain.h, data: fillNonZero(plain.contours, plain.w, plain.h) })
  const track = grow * 2.2
  // the whole word kept at the same width once spaced
  scale = (width * SS - track * (glyphs.length - 1)) / units
  const placed = layout(scale, track)
  const big = dilate({ w: placed.w, h: placed.h, data: fillNonZero(placed.contours, placed.w, placed.h) }, grow)
  let x0 = big.w, y0 = big.h, x1 = 0, y1 = 0
  for (let y = 0; y < big.h; y += 1) for (let x = 0; x < big.w; x += 1) if (big.data[y * big.w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const outW = Math.ceil((x1 - x0 + 1) / SS), height = Math.ceil((y1 - y0 + 1) / SS)
  const rows: string[] = []
  for (let py = 0; py < height; py += 1) {
    let row = ''
    for (let px = 0; px < outW; px += 1) {
      let n = 0
      for (let sy = 0; sy < SS; sy += 1) for (let sx = 0; sx < SS; sx += 1) { const X = x0 + px * SS + sx, Y = y0 + py * SS + sy; if (X < big.w && Y < big.h && big.data[Y * big.w + X]) n += 1 }
      row += n * 2 >= SS * SS ? '1' : '0'
    }
    rows.push(row)
  }
  return { width: outW, height, rows }
}

/** A row as the lengths of its alternating runs, off first, in base 36. */
export const runs = (row: string): string => {
  const out: number[] = []
  let cur = '0', n = 0
  for (const c of row) { if (c === cur) n += 1; else { out.push(n); cur = c; n = 1 } }
  out.push(n)
  return out.map((k) => k.toString(36)).join('.')
}

/** The masks of a game's words as a module: each row as its runs. */
export function letteringModule(header: string, constName: string, typeName: string, variants: Variant[], width = WIDTH): string {
  const parts = variants.map((v) => {
    const { width: w, height, rows } = build(v, width)
    console.log(`${v.name}: ${w} × ${height}`)
    return `  ${v.name}: { width: ${w}, height: ${height}, runs: ${JSON.stringify(rows.map(runs).join(' '))} },`
  })
  return `${header}
export const ${constName} = {
${parts.join('\n')}
} as const

export type ${typeName} = keyof typeof ${constName}
`
}
