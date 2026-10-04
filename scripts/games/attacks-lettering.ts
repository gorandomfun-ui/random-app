/**
 * RANDOM ATTACKS' words — ATTACKS on the title, GAME OVER and WINNER at the
 * end — in Zen Dots (The Dots Project Authors, SIL Open Font License 1.1,
 * file and licence in `scripts/games/fonts/`), the font the owner chose, its
 * strokes made one and a half times as thick — grown square, so its corners
 * stay sharp. Each is written flat and large into a pixel mask in
 * `lib/games/attacks-lettering-data.ts`; the perspective, the depth, the
 * bands and the outline are drawn by the game (`lib/games/attacks.ts`), in
 * the theme's colour. Only the masks reach the site.
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

type Variant = { name: string; file: string; bold: number; text: string }
const ZEN = 'ZenDots-Regular.ttf'
const VARIANTS: Variant[] = [
  { name: 'zen', file: ZEN, bold: 1.5, text: 'ATTACKS' },
  { name: 'gameOver', file: ZEN, bold: 1.5, text: 'GAME OVER' },
  { name: 'game', file: ZEN, bold: 1.5, text: 'GAME' },
  { name: 'over', file: ZEN, bold: 1.5, text: 'OVER' },
  { name: 'winner', file: ZEN, bold: 1.5, text: 'WINNER' },
]

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

function build(v: Variant): { width: number; height: number; rows: string[] } {
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
 * RANDOM ATTACKS' words as flat pixel masks — ATTACKS (\`zen\`), GAME OVER,
 * GAME, OVER, WINNER — written by \`scripts/games/attacks-lettering.ts\` from
 * Zen Dots (The Dots Project Authors, SIL Open Font License 1.1; strokes one
 * and a half times as thick, grown square). Each row is the lengths of its
 * alternating runs of pixels, off first, in base 36. Generated — do not edit
 * by hand.
 */

export const ATTACKS_LETTERING = {
${parts.join('\n')}
} as const

export type AttacksLettering = keyof typeof ATTACKS_LETTERING
`)
