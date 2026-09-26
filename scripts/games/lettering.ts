/**
 * Draws the word EATER's title lettering from two free fonts (SIL Open
 * Font License, files and licences in `scripts/games/fonts/`) into pixel
 * masks, once, and writes them to `lib/games/lettering-data.ts`. The font
 * files never reach the site: only the masks do, as runs of pixels.
 *
 *   Meow Script (The Meow Script Project Authors): the E pushed along until
 *   it touches the a, every stroke thickened to three times its width.
 *   Yesteryear (Astigmatic): as drawn, the E touching the a, the whole word
 *   turned twenty degrees to rise to the right.
 *
 *   node --import tsx scripts/games/lettering.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillNonZero, Font, type Contour } from './ttf'

const SS = 4 // supersampling: the letters are drawn four times finer, then read back pixel by pixel
const FONTS = join(__dirname, 'fonts')

type Variant = { name: string; file: string; width: number; bold: number; turn: number }
const VARIANTS: Variant[] = [
  { name: 'meow', file: 'MeowScript-Regular.ttf', width: 330, bold: 3, turn: 0 },
  { name: 'yesteryear', file: 'Yesteryear-Regular.ttf', width: 290, bold: 1, turn: 20 },
]

type Mask = { w: number; h: number; data: Uint8Array }

/** Squared Euclidean distance to the nearest set pixel, for every pixel (two passes of the lower-envelope method). */
function distance(mask: Mask): Float64Array {
  const { w, h, data } = mask
  const INF = 1e12
  const f = new Float64Array(Math.max(w, h)), d = new Float64Array(Math.max(w, h)), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1)
  const pass = (n: number) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF
    for (let q = 1; q < n; q += 1) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) { k -= 1; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
      k += 1; v[k] = q; z[k] = s; z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < n; q += 1) { while (z[k + 1] < q) k += 1; d[q] = (q - v[k]) ** 2 + f[v[k]] }
  }
  const out = new Float64Array(w * h)
  for (let x = 0; x < w; x += 1) { for (let y = 0; y < h; y += 1) f[y] = data[y * w + x] ? 0 : INF; pass(h); for (let y = 0; y < h; y += 1) out[y * w + x] = d[y] }
  for (let y = 0; y < h; y += 1) { for (let x = 0; x < w; x += 1) f[x] = out[y * w + x]; pass(w); for (let x = 0; x < w; x += 1) out[y * w + x] = d[x] }
  return out
}

function dilate(mask: Mask, r: number): Mask {
  if (r <= 0) return mask
  const dist = distance(mask)
  return { w: mask.w, h: mask.h, data: Uint8Array.from(dist, (d) => (d <= r * r ? 1 : 0)) }
}

/** The stroke's width, from the area and the outline's length: a long stroke of width w has area ≈ w × length/2. */
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
  const letters = ['E', 'a', 't', 'e', 'r'].map((c) => font.glyph(c))
  const wordUnits = letters.reduce((sum, g) => sum + g.advance, 0)
  const scale = (v.width * SS) / wordUnits
  // the letters placed on a baseline, in supersampled pixels, y downward
  const pad = 60 * SS, baseline = font.unitsPerEm * scale + pad
  const place = (contours: Contour[], pen: number, dx = 0): Contour[] => contours.map((c) => c.map(([x, y]) => [pad + (pen + x) * scale + dx, baseline - y * scale] as [number, number]))
  let pen = letters[0].advance
  const rest: Contour[] = []
  for (const g of letters.slice(1)) { rest.push(...place(g.contours, pen)); pen += g.advance }
  const W = Math.ceil(v.width * SS * 1.3 + pad * 2), H = Math.ceil(font.unitsPerEm * scale * 1.6 + pad * 2)
  const raster = (contours: Contour[]): Mask => ({ w: W, h: H, data: fillNonZero(contours, W, H) })
  // the stroke width of the plain letters, and how much to add either side to make it `bold` times as thick
  const plain = raster([...place(letters[0].contours, 0), ...rest])
  const grow = ((v.bold - 1) / 2) * strokeWidth(plain)
  const restMask = dilate(raster(rest), grow)
  // push the E along until it touches the a with a joint as wide as a stroke, so the tube runs on
  const joint = Math.max(4, (strokeWidth(plain) + 2 * grow) ** 2 * 0.6)
  const eMask = dilate(raster(place(letters[0].contours, 0)), grow)
  const ePixels: Array<[number, number]> = []
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (eMask.data[y * W + x]) ePixels.push([x, y])
  const touching = (dx: number) => { let n = 0; for (const [x, y] of ePixels) { const X = x + dx; if (X >= 0 && X < W && restMask.data[y * W + X]) n += 1 } return n }
  let shift = 0
  if (touching(0) < joint) { while (shift < letters[0].advance * scale && touching(shift) < joint) shift += SS / 2 }
  else { while (shift > -letters[0].advance * scale && touching(shift - SS / 2) >= joint) shift -= SS / 2 }
  // the whole word, turned if asked (rising to the right), thickened, read back at the real size
  const all = [...place(letters[0].contours, 0, shift), ...rest]
  const cx = W / 2, cy = H / 2, a = (-v.turn * Math.PI) / 180
  const turned = v.turn ? all.map((c) => c.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)] as [number, number])) : all
  const thin = raster(turned)
  const big = dilate(thin, grow)
  // the holes inside the letters (the eye of the e, the bowl of the a) would close up at three times the weight:
  // they are carved back a little wider than drawn — the strokes thicken outward only — so the word still reads
  const outside = new Uint8Array(W * H)
  const stack: number[] = []
  for (let x = 0; x < W; x += 1) stack.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y += 1) stack.push(y * W, y * W + W - 1)
  while (stack.length) {
    const i = stack.pop()!
    if (i < 0 || i >= W * H || outside[i] || thin.data[i]) continue
    outside[i] = 1
    const x = i % W
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    stack.push(i - W, i + W)
  }
  const notHole: Mask = { w: W, h: H, data: Uint8Array.from(thin.data, (on, i) => (on || outside[i] ? 1 : 0)) }
  // each hole on its own: only the small ones (an eye, a bowl) are widened; a big loop keeps its drawn size
  const label = new Int32Array(W * H).fill(-1)
  const small: number[] = []
  let count = 0
  for (let i = 0; i < W * H; i += 1) {
    if (notHole.data[i] || label[i] >= 0) continue
    const members: number[] = []
    const todo = [i]
    label[i] = count
    while (todo.length) {
      const j = todo.pop()!
      members.push(j)
      for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && !notHole.data[k] && label[k] < 0) { label[k] = count; todo.push(k) }
    }
    if (members.length > 16 && members.length < (grow * 3) ** 2) small.push(count)
    count += 1
  }
  const smallHoles: Mask = { w: W, h: H, data: Uint8Array.from(label, (l) => (l >= 0 && small.includes(l) ? 1 : 0)) }
  const bigHoles = Uint8Array.from(label, (l) => (l >= 0 && !small.includes(l) ? 1 : 0))
  const toHole = distance(smallHoles)
  const widen = (grow * 0.7) ** 2
  for (let i = 0; i < W * H; i += 1) if (toHole[i] <= widen || bigHoles[i]) big.data[i] = 0
  // and no crumbs: bits of letter left standing alone are cleared
  const seen = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i += 1) {
    if (!big.data[i] || seen[i]) continue
    const members: number[] = []
    const todo = [i]
    seen[i] = 1
    while (todo.length) {
      const j = todo.pop()!
      members.push(j)
      for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && big.data[k] && !seen[k]) { seen[k] = 1; todo.push(k) }
    }
    if (members.length < (grow * 4) ** 2) for (const j of members) big.data[j] = 0
  }
  // crop to the letters, then one pixel for every SS × SS block at least half covered
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (big.data[y * W + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const width = Math.ceil((x1 - x0 + 1) / SS), height = Math.ceil((y1 - y0 + 1) / SS)
  const rows: string[] = []
  for (let py = 0; py < height; py += 1) {
    let row = ''
    for (let px = 0; px < width; px += 1) {
      let n = 0
      for (let sy = 0; sy < SS; sy += 1) for (let sx = 0; sx < SS; sx += 1) { const X = x0 + px * SS + sx, Y = y0 + py * SS + sy; if (X < W && Y < H && big.data[Y * W + X]) n += 1 }
      row += n * 2 >= SS * SS ? '1' : '0'
    }
    rows.push(row)
  }
  return { width, height, rows }
}

/** A row of pixels as the lengths of its alternating runs, off first, in base 36. */
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

writeFileSync(join(__dirname, '../../lib/games/lettering-data.ts'), `/**
 * The EATER title lettering as pixel masks, written by
 * \`scripts/games/lettering.ts\` from two fonts under the SIL Open Font
 * License 1.1: Meow Script (The Meow Script Project Authors) and
 * Yesteryear (Astigmatic). Each row is the lengths of its alternating runs
 * of pixels, off first, in base 36. Generated — do not edit by hand.
 */

export const LETTERING = {
${parts.join('\n')}
} as const

export type LetteringName = keyof typeof LETTERING
`)
