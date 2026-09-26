/**
 * Just enough of a TrueType reader to draw a word: the character map, the
 * advance widths and the glyph outlines (simple and composite), each
 * contour flattened into a polygon, and a fill by the non-zero rule. Used
 * only offline, by the lettering script: no font file ever reaches the site.
 */

import { readFileSync } from 'node:fs'

export type Contour = Array<[number, number]>
export type Glyph = { advance: number; contours: Contour[] }

export class Font {
  private view: DataView
  private tables = new Map<string, number>()
  readonly unitsPerEm: number
  private locaLong: boolean
  private numHMetrics: number
  private cmap = new Map<number, number>()

  constructor(path: string) {
    const buf = readFileSync(path)
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const count = this.view.getUint16(4)
    for (let i = 0; i < count; i += 1) {
      const o = 12 + i * 16
      const tag = String.fromCharCode(...[0, 1, 2, 3].map((k) => this.view.getUint8(o + k)))
      this.tables.set(tag, this.view.getUint32(o + 8))
    }
    const head = this.table('head')
    this.unitsPerEm = this.view.getUint16(head + 18)
    this.locaLong = this.view.getInt16(head + 50) === 1
    this.numHMetrics = this.view.getUint16(this.table('hhea') + 34)
    this.readCmap()
  }

  private table(tag: string): number {
    const at = this.tables.get(tag)
    if (at === undefined) throw new Error(`table ${tag} missing`)
    return at
  }

  private readCmap(): void {
    const base = this.table('cmap')
    const n = this.view.getUint16(base + 2)
    for (let i = 0; i < n; i += 1) {
      const platform = this.view.getUint16(base + 4 + i * 8), encoding = this.view.getUint16(base + 6 + i * 8)
      const sub = base + this.view.getUint32(base + 8 + i * 8)
      if (this.view.getUint16(sub) !== 4 || !((platform === 3 && encoding === 1) || platform === 0)) continue
      const segX2 = this.view.getUint16(sub + 6)
      const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, offsets = deltas + segX2
      for (let s = 0; s < segX2 / 2; s += 1) {
        const end = this.view.getUint16(ends + s * 2), start = this.view.getUint16(starts + s * 2)
        const delta = this.view.getInt16(deltas + s * 2), rangeOffset = this.view.getUint16(offsets + s * 2)
        for (let c = start; c <= end && c !== 0xffff; c += 1) {
          let g: number
          if (rangeOffset === 0) g = (c + delta) & 0xffff
          else {
            const at = offsets + s * 2 + rangeOffset + (c - start) * 2
            g = this.view.getUint16(at)
            if (g !== 0) g = (g + delta) & 0xffff
          }
          if (g) this.cmap.set(c, g)
        }
      }
      return
    }
    throw new Error('no usable cmap')
  }

  private advance(g: number): number {
    const hmtx = this.table('hmtx')
    return this.view.getUint16(hmtx + Math.min(g, this.numHMetrics - 1) * 4)
  }

  private glyfOffset(g: number): [number, number] {
    const loca = this.table('loca'), glyf = this.table('glyf')
    const at = (i: number) => (this.locaLong ? this.view.getUint32(loca + i * 4) : this.view.getUint16(loca + i * 2) * 2)
    return [glyf + at(g), at(g + 1) - at(g)]
  }

  /** The outline of glyph `g` as polygons in font units (y up), curves flattened. */
  private outline(g: number, depth = 0): Contour[] {
    const [o, length] = this.glyfOffset(g)
    if (length === 0) return []
    const v = this.view
    const nContours = v.getInt16(o)
    if (nContours < 0) {
      // composite: glyphs placed with an offset (and an optional scale)
      const out: Contour[] = []
      let p = o + 10, more = true
      while (more && depth < 4) {
        const flags = v.getUint16(p), sub = v.getUint16(p + 2); p += 4
        let dx: number, dy: number
        if (flags & 1) { dx = v.getInt16(p); dy = v.getInt16(p + 2); p += 4 } else { dx = v.getInt8(p); dy = v.getInt8(p + 1); p += 2 }
        let a = 1, b = 0, c = 0, d = 1
        if (flags & 8) { a = d = v.getInt16(p) / 16384; p += 2 } else if (flags & 0x40) { a = v.getInt16(p) / 16384; d = v.getInt16(p + 2) / 16384; p += 4 } else if (flags & 0x80) { a = v.getInt16(p) / 16384; b = v.getInt16(p + 2) / 16384; c = v.getInt16(p + 4) / 16384; d = v.getInt16(p + 6) / 16384; p += 8 }
        for (const contour of this.outline(sub, depth + 1)) out.push(contour.map(([x, y]) => [a * x + c * y + dx, b * x + d * y + dy]))
        more = (flags & 0x20) !== 0
      }
      return out
    }
    const endPts: number[] = []
    for (let i = 0; i < nContours; i += 1) endPts.push(v.getUint16(o + 10 + i * 2))
    const nPts = endPts[nContours - 1] + 1
    let p = o + 10 + nContours * 2
    p += 2 + v.getUint16(p)
    const flags: number[] = []
    while (flags.length < nPts) {
      const f = v.getUint8(p++); flags.push(f)
      if (f & 8) { const r = v.getUint8(p++); for (let k = 0; k < r; k += 1) flags.push(f) }
    }
    const xs: number[] = [], ys: number[] = []
    let x = 0
    for (const f of flags) { if (f & 2) { const d = v.getUint8(p++); x += f & 16 ? d : -d } else if (!(f & 16)) { x += v.getInt16(p); p += 2 } xs.push(x) }
    let y = 0
    for (const f of flags) { if (f & 4) { const d = v.getUint8(p++); y += f & 32 ? d : -d } else if (!(f & 32)) { y += v.getInt16(p); p += 2 } ys.push(y) }
    const contours: Contour[] = []
    let start = 0
    for (const end of endPts) {
      const pts = Array.from({ length: end - start + 1 }, (_, k) => ({ x: xs[start + k], y: ys[start + k], on: (flags[start + k] & 1) === 1 }))
      contours.push(flatten(pts))
      start = end + 1
    }
    return contours
  }

  glyph(char: string): Glyph {
    const g = this.cmap.get(char.codePointAt(0)!) ?? 0
    return { advance: this.advance(g), contours: this.outline(g) }
  }
}

/** A TrueType contour — on-curve points and quadratic control points — as a polygon. */
function flatten(pts: Array<{ x: number; y: number; on: boolean }>): Contour {
  const n = pts.length
  if (!n) return []
  // start on an on-curve point, or the midpoint of the first two off-curve ones
  let first = pts.findIndex((p) => p.on)
  const seq = first >= 0 ? [...pts.slice(first), ...pts.slice(0, first)] : pts
  if (first < 0) { first = 0; seq.unshift({ x: (pts[0].x + pts[n - 1].x) / 2, y: (pts[0].y + pts[n - 1].y) / 2, on: true }) }
  const out: Contour = [[seq[0].x, seq[0].y]]
  let cur = seq[0]
  for (let i = 1; i <= seq.length; i += 1) {
    const p = seq[i % seq.length]
    if (p.on) { out.push([p.x, p.y]); cur = p; continue }
    const next = seq[(i + 1) % seq.length]
    const end = next.on ? next : { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2, on: true }
    for (let t = 1; t <= 8; t += 1) {
      const s = t / 8, u = 1 - s
      out.push([u * u * cur.x + 2 * u * s * p.x + s * s * end.x, u * u * cur.y + 2 * u * s * p.y + s * s * end.y])
    }
    cur = end
    if (next.on) i += 1
  }
  return out
}

/** Fills polygons into a mask of `width` × `height` by the non-zero winding rule, sampling each pixel's centre. */
export function fillNonZero(contours: Contour[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  const edges: Array<[number, number, number, number]> = []
  for (const c of contours) for (let i = 0; i < c.length; i += 1) { const a = c[i], b = c[(i + 1) % c.length]; if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]]) }
  for (let y = 0; y < height; y += 1) {
    const cy = y + 0.5
    const hits: Array<[number, number]> = []
    for (const [x0, y0, x1, y1] of edges) {
      if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) hits.push([x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1])
    }
    hits.sort((a, b) => a[0] - b[0])
    let wind = 0
    for (let i = 0; i < hits.length - 1; i += 1) {
      wind += hits[i][1]
      if (wind === 0) continue
      for (let x = Math.max(0, Math.ceil(hits[i][0] - 0.5)); x < Math.min(width, Math.ceil(hits[i + 1][0] - 0.5)); x += 1) mask[y * width + x] = 1
    }
  }
  return mask
}
