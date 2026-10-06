/**
 * Tools for bringing an owner's reference picture onto a game's pixel grid:
 * a picture of float colours, traced from any part of the reference at any
 * size (each cell the average of the reference's pixels well inside it), a
 * palette found in it, its colours reduced to that palette, holes drawn
 * again from their neighbours, masks grown, figures cut out with their
 * outline. RANDOM RACING's tracing uses them (`racing-trace.ts`);
 * ATTACKS' tracing has its own copy of the same steps.
 */

import { readFileSync } from 'node:fs'

import { decodePng } from './png'

export type RGB = [number, number, number]
/** A picture being worked on: colours as floats, and which pixels are known. */
export type Pic = { w: number; h: number; rgb: Float32Array; known: Uint8Array }
export type Ref = { width: number; height: number; rgba: Uint8ClampedArray }

export const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b

export function blank(w: number, h: number): Pic { return { w, h, rgb: new Float32Array(w * h * 3), known: new Uint8Array(w * h) } }
export function get(p: Pic, x: number, y: number): RGB { const o = (y * p.w + x) * 3; return [p.rgb[o], p.rgb[o + 1], p.rgb[o + 2]] }
export function put(p: Pic, x: number, y: number, c: RGB): void { if (x < 0 || y < 0 || x >= p.w || y >= p.h) return; const o = (y * p.w + x) * 3; p.rgb[o] = c[0]; p.rgb[o + 1] = c[1]; p.rgb[o + 2] = c[2]; p.known[y * p.w + x] = 1 }
export function copy(p: Pic): Pic { return { w: p.w, h: p.h, rgb: new Float32Array(p.rgb), known: new Uint8Array(p.known) } }

export const readRef = (file: string): Ref => decodePng(readFileSync(file))

/**
 * A part of the reference (`area`, in its own pixels; all of it if left
 * out) brought onto a grid of `w` × `h`: each cell the average of the
 * reference's pixels inside it.
 */
export function trace(ref: Ref, w: number, h: number, area: [number, number, number, number] = [0, 0, ref.width, ref.height]): Pic {
  const [ax, ay, aw, ah] = area
  const pic = blank(w, h)
  const sx = aw / w, sy = ah / h
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const x0 = Math.floor(ax + x * sx), x1 = Math.max(x0 + 1, Math.floor(ax + (x + 1) * sx)), y0 = Math.floor(ay + y * sy), y1 = Math.max(y0 + 1, Math.floor(ay + (y + 1) * sy))
    let r = 0, g = 0, b = 0, n = 0
    for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) { const o = (Math.min(ref.height - 1, yy) * ref.width + Math.min(ref.width - 1, xx)) * 4; r += ref.rgba[o]; g += ref.rgba[o + 1]; b += ref.rgba[o + 2]; n += 1 }
    put(pic, x, y, [r / n, g / n, b / n])
  }
  return pic
}

/** The same as `trace`, from a picture being worked on (one already cleaned, say) rather than from the reference itself. */
export function tracePic(pic: Pic, w: number, h: number, area: [number, number, number, number] = [0, 0, pic.w, pic.h]): Pic {
  const [ax, ay, aw, ah] = area
  const out = blank(w, h)
  const sx = aw / w, sy = ah / h
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const x0 = Math.floor(ax + x * sx), x1 = Math.max(x0 + 1, Math.floor(ax + (x + 1) * sx)), y0 = Math.floor(ay + y * sy), y1 = Math.max(y0 + 1, Math.floor(ay + (y + 1) * sy))
    let r = 0, g = 0, b = 0, n = 0
    for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) { const o = (Math.min(pic.h - 1, yy) * pic.w + Math.min(pic.w - 1, xx)) * 3; r += pic.rgb[o]; g += pic.rgb[o + 1]; b += pic.rgb[o + 2]; n += 1 }
    put(out, x, y, [r / n, g / n, b / n])
  }
  return out
}

/** A palette of `k` colours for the picture (k-means, started evenly along the picture; `where` limits it to some pixels). */
export function paletteOf(p: Pic, k: number, where?: Uint8Array): RGB[] {
  const idx: number[] = []
  for (let i = 0; i < p.w * p.h; i += 1) if (!where || where[i]) idx.push(i)
  const at = (i: number): RGB => [p.rgb[i * 3], p.rgb[i * 3 + 1], p.rgb[i * 3 + 2]]
  let centres: RGB[] = Array.from({ length: k }, (_, j) => at(idx[Math.floor(((j + 0.5) / k) * idx.length)]))
  for (let iter = 0; iter < 14; iter += 1) {
    const sums = centres.map(() => [0, 0, 0, 0])
    for (const i of idx) {
      const c = at(i)
      let best = 0, bd = Infinity
      for (let j = 0; j < k; j += 1) { const d = (c[0] - centres[j][0]) ** 2 + (c[1] - centres[j][1]) ** 2 + (c[2] - centres[j][2]) ** 2; if (d < bd) { bd = d; best = j } }
      const s = sums[best]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3] += 1
    }
    centres = centres.map((c, j) => (sums[j][3] ? [sums[j][0] / sums[j][3], sums[j][1] / sums[j][3], sums[j][2] / sums[j][3]] : c))
  }
  return centres.map((c) => c.map((v) => Math.round(v)) as RGB)
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
/** Each pixel to the nearest colour of the palette; where the picture was drawn again (`smooth`), dithered between the two nearest, for the grain. */
export function quantize(p: Pic, palette: RGB[], smooth?: Uint8Array): Uint8Array {
  const out = new Uint8Array(p.w * p.h)
  for (let y = 0; y < p.h; y += 1) for (let x = 0; x < p.w; x += 1) {
    const c = get(p, x, y)
    let a = 0, ad = Infinity, b = 0, bd = Infinity
    for (let j = 0; j < palette.length; j += 1) { const q = palette[j]; const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (d < ad) { b = a; bd = ad; a = j; ad = d } else if (d < bd) { b = j; bd = d } }
    if (smooth && smooth[y * p.w + x]) {
      const t = Math.sqrt(ad) / Math.max(1, Math.sqrt(ad) + Math.sqrt(bd))
      out[y * p.w + x] = t * 16 > BAYER[y % 4][x % 4] + 0.5 ? b : a
    } else out[y * p.w + x] = a
  }
  return out
}

/** Pixels marked in `hole` drawn again from their neighbours: interpolated along the row (down the column where the whole row is missing), then let settle. */
export function inpaint(p: Pic, hole: Uint8Array, rounds = 120): void {
  for (let y = 0; y < p.h; y += 1) {
    for (let x = 0; x < p.w; x += 1) {
      if (!hole[y * p.w + x]) continue
      let l = x - 1, r = x + 1
      while (l >= 0 && hole[y * p.w + l]) l -= 1
      while (r < p.w && hole[y * p.w + r]) r += 1
      const cl = l >= 0 ? get(p, l, y) : null, cr = r < p.w ? get(p, r, y) : null
      let c: RGB
      if (cl && cr) { const t = (x - l) / (r - l); c = [cl[0] + (cr[0] - cl[0]) * t, cl[1] + (cr[1] - cl[1]) * t, cl[2] + (cr[2] - cl[2]) * t] }
      else c = (cl ?? cr ?? (y > 0 ? get(p, x, y - 1) : [20, 16, 40])) as RGB
      const o = (y * p.w + x) * 3; p.rgb[o] = c[0]; p.rgb[o + 1] = c[1]; p.rgb[o + 2] = c[2]
    }
  }
  const list: number[] = []
  for (let i = 0; i < hole.length; i += 1) if (hole[i]) list.push(i)
  for (let k = 0; k < rounds; k += 1) {
    for (const i of list) {
      const x = i % p.w, y = (i - x) / p.w
      let r = 0, g = 0, b = 0, n = 0
      // the row counts twice as much as the column: the sky and the road run across
      for (const [dx, dy, wt] of [[1, 0, 2], [-1, 0, 2], [0, 1, 1], [0, -1, 1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= p.w || Y >= p.h) continue; const c = get(p, X, Y); r += c[0] * wt; g += c[1] * wt; b += c[2] * wt; n += wt }
      const o = (y * p.w + x) * 3; p.rgb[o] = r / n; p.rgb[o + 1] = g / n; p.rgb[o + 2] = b / n
    }
  }
  for (let i = 0; i < hole.length; i += 1) if (hole[i]) p.known[i] = 1
}

export function grow(mask: Uint8Array, w: number, h: number, times: number): Uint8Array {
  let cur = mask
  for (let t = 0; t < times; t += 1) {
    const next = new Uint8Array(cur)
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (!cur[y * w + x]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && cur[Y * w + X]) { next[y * w + x] = 1; break } }
    cur = next
  }
  return cur
}

export function inPolygon(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * A figure with an outline of its own (a car): the background is flooded
 * in from the edges of a rough polygon around it, through every pixel that
 * is not part of its outline (`stop`); what the flood does not reach is the
 * figure.
 */
export function cutByFlood(p: Pic, poly: ReadonlyArray<readonly [number, number]>, stop: (c: RGB) => boolean): Uint8Array {
  const inside = new Uint8Array(p.w * p.h)
  const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y)
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(p.w - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(p.h - 1, Math.ceil(Math.max(...ys)))
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (inPolygon(x + 0.5, y + 0.5, poly)) inside[y * p.w + x] = 1
  const outside = new Uint8Array(p.w * p.h)
  const queue: number[] = []
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const i = y * p.w + x
    if (!inside[i]) continue
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= p.w || Y >= p.h || !inside[Y * p.w + X] })
    if (edge && !stop(get(p, x, y))) { outside[i] = 1; queue.push(i) }
  }
  while (queue.length) {
    const i = queue.pop()!, x = i % p.w, y = Math.floor(i / p.w)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy, j = Y * p.w + X
      if (X < x0 || Y < y0 || X > x1 || Y > y1 || !inside[j] || outside[j]) continue
      if (stop(get(p, X, Y))) continue
      outside[j] = 1; queue.push(j)
    }
  }
  const figure = new Uint8Array(p.w * p.h)
  for (let i = 0; i < figure.length; i += 1) figure[i] = inside[i] && !outside[i] ? 1 : 0
  return figure
}

/** A mask of the pixels inside any of the rectangles [x0, y0, x1, y1) that `pick` chooses. */
export function pickIn(p: Pic, rects: ReadonlyArray<readonly [number, number, number, number]>, pick: (c: RGB) => boolean): Uint8Array {
  const out = new Uint8Array(p.w * p.h)
  for (const [x0, y0, x1, y1] of rects) for (let y = Math.max(0, y0); y < Math.min(p.h, y1); y += 1) for (let x = Math.max(0, x0); x < Math.min(p.w, x1); x += 1) if (pick(get(p, x, y))) out[y * p.w + x] = 1
  return out
}
