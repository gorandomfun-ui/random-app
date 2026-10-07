/**
 * A small set of brushes for RANDOM RACING's drawn things — the shops of
 * the promenade, the everyday cars of the traffic: a picture clear all
 * round, filled with rectangles, rounded boxes, polygons, discs, ellipses,
 * thick lines, stripes; at the end an ink outline round whatever was drawn,
 * as in the owner's picture, so a thing reads at any size.
 */

import { PixelBuffer, rgbOf } from './pixels'

export const INK_LINE = '#2a1a30'

export class Painter {
  readonly pic: PixelBuffer
  constructor(readonly w: number, readonly h: number) {
    this.pic = new PixelBuffer(w, h, '#000000')
    this.pic.data.fill(0)
  }
  dot(x: number, y: number, c: string): void {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const [r, g, b] = rgbOf(c), o = (y * this.w + x) * 4
    const d = this.pic.data
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy += 1) for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) this.dot(xx, yy, c)
  }
  /** A box with its corners rounded by `r`. */
  round(x: number, y: number, w: number, h: number, r: number, c: string): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy += 1) for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) {
      const dx = Math.max(x + r - (xx + 0.5), xx + 0.5 - (x + w - r), 0), dy = Math.max(y + r - (yy + 0.5), yy + 0.5 - (y + h - r), 0)
      if (dx * dx + dy * dy <= r * r) this.dot(xx, yy, c)
    }
  }
  poly(points: ReadonlyArray<readonly [number, number]>, c: string): void {
    const ys = points.map(([, y]) => y)
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
      const cy = y + 0.5, xs: number[] = []
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length]
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
      }
      xs.sort((a, b) => a - b)
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x < Math.ceil(xs[i + 1] - 0.5); x += 1) this.dot(x, y, c)
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.dot(x, y, c)
  }
  disc(cx: number, cy: number, r: number, c: string): void { this.ellipse(cx, cy, r, r, c) }
  /** A line `t` thick with round ends. */
  line(x0: number, y0: number, x1: number, y1: number, t: number, c: string): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
    for (let i = 0; i <= n; i += 1) this.disc(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, t / 2, c)
  }
  /** Stripes across a box, `step` wide, alternating two colours; upright if `upright`. */
  stripes(x: number, y: number, w: number, h: number, step: number, a: string, b: string, upright = true): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy += 1) for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) this.dot(xx, yy, Math.floor(((upright ? xx - x : yy - y)) / step) % 2 ? b : a)
  }
  /** Whether a pixel is drawn. */
  on(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.pic.data[(y * this.w + x) * 4 + 3] > 0 }
  /** An ink line round everything drawn, outside it. */
  outline(c = INK_LINE): void {
    const add: Array<[number, number]> = []
    for (let y = 0; y < this.h; y += 1) for (let x = 0; x < this.w; x += 1) if (!this.on(x, y) && (this.on(x - 1, y) || this.on(x + 1, y) || this.on(x, y - 1) || this.on(x, y + 1))) add.push([x, y])
    for (const [x, y] of add) this.dot(x, y, c)
  }
}

/** A colour lighter (k > 1) or darker (k < 1). */
export function tone(c: string, k: number): string {
  const [r, g, b] = rgbOf(c)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k))).toString(16).padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}
