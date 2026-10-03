/**
 * Characters built from shapes, for the titles: each part — a limb as a
 * capsule, a head as an ellipse, a garment as a polygon — drawn in its own
 * four tones under a light from the upper left (round parts by their
 * roundness, flat ones by a lit edge and a shaded one), the parts in front
 * edged in their darkest tone where they meet another stuff, the whole
 * outlined in ink; then the details on top (eyes, a mouth, folds, buttons);
 * mirrored if asked, to face the other way.
 * Proportions and poses are numbers, so a character can walk, blink, eat.
 */

import { PixelBuffer } from './pixels'

/** A stuff's four tones: lit, itself, in shade, in deep shade. */
export type Ramp = readonly [string, string, string, string]

export type Shape =
  | { kind: 'capsule'; a: readonly [number, number]; b: readonly [number, number]; ra: number; rb: number }
  | { kind: 'ellipse'; c: readonly [number, number]; rx: number; ry: number; turn?: number }
  | { kind: 'poly'; points: ReadonlyArray<readonly [number, number]> }

/**
 * A part: its shape, its stuff (`ramp`), or its own colouring (`paint`, given
 * the pixel and the tone the light gives it — stripes, a label); `line`
 * false leaves out the dark edge where it lies over another part; `erase`
 * takes away what is under it instead (a bite out of a burger).
 */
export type Part = { shape: Shape; ramp: Ramp; paint?: (x: number, y: number, tone: number) => string; line?: boolean; erase?: boolean }

/** A detail drawn over the parts: single pixels in one colour. */
export type Mark = { color: string; points: ReadonlyArray<readonly [number, number]> }

const INK = '#1a0c0a'
/** The light: from the upper left and in front. */
const L = (() => { const v = [-0.5, -0.72, 0.62]; const n = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / n) })()

function inPolygon(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Where a point lies on a shape: inside or not, and the surface's slope there (for the light). */
function probe(shape: Shape, x: number, y: number): { inside: boolean; nx: number; ny: number } {
  if (shape.kind === 'capsule') {
    const [ax, ay] = shape.a, [bx, by] = shape.b
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2))
    const cx = ax + dx * t, cy = ay + dy * t, r = shape.ra + (shape.rb - shape.ra) * t
    const ox = (x - cx) / r, oy = (y - cy) / r
    return { inside: ox * ox + oy * oy <= 1, nx: ox, ny: oy }
  }
  if (shape.kind === 'ellipse') {
    const turn = shape.turn ?? 0, c = Math.cos(turn), s = Math.sin(turn)
    const px = x - shape.c[0], py = y - shape.c[1]
    const ux = (px * c + py * s) / shape.rx, uy = (-px * s + py * c) / shape.ry
    // the slope back in the screen's directions
    return { inside: ux * ux + uy * uy <= 1, nx: ux * c - uy * s, ny: ux * s + uy * c }
  }
  return { inside: inPolygon(x, y, shape.points), nx: 0, ny: 0 }
}

function bounds(shape: Shape): [number, number, number, number] {
  if (shape.kind === 'capsule') { const r = Math.max(shape.ra, shape.rb); return [Math.min(shape.a[0], shape.b[0]) - r, Math.min(shape.a[1], shape.b[1]) - r, Math.max(shape.a[0], shape.b[0]) + r, Math.max(shape.a[1], shape.b[1]) + r] }
  if (shape.kind === 'ellipse') { const r = Math.max(shape.rx, shape.ry); return [shape.c[0] - r, shape.c[1] - r, shape.c[0] + r, shape.c[1] + r] }
  const xs = shape.points.map(([x]) => x), ys = shape.points.map(([, y]) => y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * A character drawn on `buffer` with its top left at `x`, `y`, inside a box
 * `w` × `h`: the parts from back to front, then the marks, the ink around
 * it; `flip` mirrors it.
 */
export function drawFigure(buffer: PixelBuffer, x: number, y: number, w: number, h: number, parts: readonly Part[], marks: readonly Mark[] = [], flip = false): void {
  const id = new Int16Array(w * h).fill(-1)
  const color: string[] = new Array(w * h)
  parts.forEach((part, index) => {
    const [x0, y0, x1, y1] = bounds(part.shape)
    for (let py = Math.max(0, Math.floor(y0)); py <= Math.min(h - 1, Math.ceil(y1)); py += 1) for (let px = Math.max(0, Math.floor(x0)); px <= Math.min(w - 1, Math.ceil(x1)); px += 1) {
      const p = probe(part.shape, px + 0.5, py + 0.5)
      if (!p.inside) continue
      if (part.erase) { id[py * w + px] = -1; continue }
      let tone: number
      if (part.shape.kind === 'poly') {
        // a flat part: lit along its edge toward the light, shaded along the edge away from it
        const shape = part.shape
        const lit = !inPolygon(px - 1, py - 1.5, shape.points)
        const shade = !inPolygon(px + 2.5, py + 2, shape.points)
        const deep = !inPolygon(px + 1.2, py + 1, shape.points)
        tone = lit ? 0 : deep ? 3 : shade ? 2 : 1
      } else {
        const nz = Math.sqrt(Math.max(0, 1 - p.nx * p.nx - p.ny * p.ny))
        const light = p.nx * L[0] + p.ny * L[1] + nz * L[2]
        tone = light > 0.78 ? 0 : light > 0.42 ? 1 : light > 0.1 ? 2 : 3
      }
      const i = py * w + px
      id[i] = index
      color[i] = part.paint ? part.paint(px, py, tone) : part.ramp[tone]
    }
  })
  // where a part lies over another of a different stuff, its edge in its own darkest tone
  const edged: number[] = []
  for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) {
    const i = py * w + px, k = id[i]
    if (k < 0 || parts[k].line === false) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = px + dx, Y = py + dy
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue
      const j = Y * w + X, other = id[j]
      if (other >= 0 && other < k && parts[other].ramp !== parts[k].ramp) { edged.push(i); break }
    }
  }
  for (const i of edged) color[i] = parts[id[i]].ramp[3]
  for (const mark of marks) for (const [mx, my] of mark.points) {
    const px = Math.round(mx), py = Math.round(my)
    if (px < 0 || py < 0 || px >= w || py >= h) continue
    const i = py * w + px
    if (id[i] < 0) id[i] = parts.length
    color[i] = mark.color
  }
  // the ink round it all
  for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) {
    const i = py * w + px
    const tx = x + (flip ? w - 1 - px : px)
    if (id[i] >= 0) { buffer.set(tx, y + py, color[i]); continue }
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = px + dx, Y = py + dy; return X >= 0 && Y >= 0 && X < w && Y < h && id[Y * w + X] >= 0 })
    if (touches) buffer.set(tx, y + py, INK)
  }
}

/** Points along a line, for a mark: a fold, a seam, a stripe. */
export function along(a: readonly [number, number], b: readonly [number, number], step = 0.5): Array<[number, number]> {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as [number, number])
}
