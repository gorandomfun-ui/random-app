/**
 * The controls under the games, in flat design: plain round keys, no relief
 * and no shine, smooth at their edges, in the colours of the site's theme —
 * the arrows in the theme's colour with a cream arrow, the actions (the gas,
 * FIRE) cream with their letters in the theme's colour, the others in a
 * darker shade of it. Only what is drawn: where a finger counts is each
 * game's own zones.
 */

import { drawText7, mix, PixelBuffer, rgbOf, text7Width } from './pixels'

/** The site's cream (the same as the games' own). */
const CREAM = '#f8f5e6'

/** How much of a pixel at (`x`, `y`) a shape covers, by its edge's distance (positive inside), smoothed over a pixel. */
const cover = (inside: number) => Math.max(0, Math.min(1, inside + 0.5))

/** A colour laid over a pixel, as much as `k` of it. */
function lay(buffer: PixelBuffer, x: number, y: number, rgb: readonly [number, number, number], k: number): void {
  if (k <= 0 || x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return
  const d = buffer.data, o = (y * buffer.width + x) * 4
  d[o] += (rgb[0] - d[o]) * k; d[o + 1] += (rgb[1] - d[o + 1]) * k; d[o + 2] += (rgb[2] - d[o + 2]) * k; d[o + 3] = 255
}

/** A disc, smooth at its edge. */
export function flatDisc(buffer: PixelBuffer, cx: number, cy: number, r: number, colour: string): void {
  const rgb = rgbOf(colour)
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y += 1) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x += 1) lay(buffer, x, y, rgb, cover(r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
}

/** A ring `width` thick, or the part of it from the top clockwise to `share` of the way round. */
export function flatRing(buffer: PixelBuffer, cx: number, cy: number, r: number, width: number, colour: string, share = 1): void {
  if (share <= 0) return
  const rgb = rgbOf(colour), inner = r - width
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y += 1) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x += 1) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dist = Math.hypot(dx, dy)
    if (share < 1) { const turn = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1; if (turn > share) continue }
    lay(buffer, x, y, rgb, Math.min(cover(r - dist), cover(dist - inner)))
  }
}

/** A triangle, smooth at its edges (four by four samples a pixel along them). */
export function flatTriangle(buffer: PixelBuffer, pts: ReadonlyArray<readonly [number, number]>, colour: string): void {
  const rgb = rgbOf(colour), [a, b, c] = pts
  const side = (p: readonly [number, number], q: readonly [number, number], x: number, y: number) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
  const turn = Math.sign(side(a, b, c[0], c[1])) || 1
  const inside = (x: number, y: number) => side(a, b, x, y) * turn >= 0 && side(b, c, x, y) * turn >= 0 && side(c, a, x, y) * turn >= 0
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
    let n = 0
    for (let sy = 0; sy < 4; sy += 1) for (let sx = 0; sx < 4; sx += 1) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n += 1
    lay(buffer, x, y, rgb, n / 16)
  }
}

export type Way = 'up' | 'down' | 'left' | 'right'

/** An arrow key: a disc in the theme's colour (lighter while held), a cream arrow in it. */
export function arrowKey(buffer: PixelBuffer, cx: number, cy: number, r: number, way: Way, accent: string, pressed = false): void {
  flatDisc(buffer, cx, cy, r, pressed ? mix(accent, '#ffffff', 0.3) : accent)
  const s = r * 0.5, tip = s * 0.95, back = s * 0.6, half = s * 0.85
  const pts: Array<[number, number]> = way === 'left' ? [[cx - tip, cy], [cx + back, cy - half], [cx + back, cy + half]]
    : way === 'right' ? [[cx + tip, cy], [cx - back, cy - half], [cx - back, cy + half]]
      : way === 'up' ? [[cx, cy - tip], [cx - half, cy + back], [cx + half, cy + back]]
        : [[cx, cy + tip], [cx - half, cy - back], [cx + half, cy - back]]
  flatTriangle(buffer, pts, CREAM)
}

/**
 * An action key: a disc and its word or letter. `look` 'main' cream with
 * the word in the theme's colour (the gas, FIRE), 'other' a darker shade of
 * the theme's colour with a cream word (the brake), 'off' dull (the turbo
 * not yet ready). Lighter while held.
 */
export function actionKey(buffer: PixelBuffer, cx: number, cy: number, r: number, label: string, accent: string, look: 'main' | 'other' | 'off', pressed = false): void {
  const fill = look === 'main' ? CREAM : look === 'other' ? mix(accent, '#191916', 0.5) : '#34343c'
  const ink = look === 'main' ? accent : look === 'other' ? CREAM : '#8a8a94'
  flatDisc(buffer, cx, cy, r, pressed ? mix(fill, '#ffffff', 0.3) : fill)
  const scale = r >= 26 ? 2 : 1, w = text7Width(label, scale, true)
  drawText7(buffer, label, Math.round(cx - w / 2), Math.round(cy - 3.5 * scale), ink, scale, true)
}

/** The cross of arrows of EATER and CATCHER: four round keys, up, down, left, right, `arm` apart from the middle. */
export function arrowCross(buffer: PixelBuffer, cx: number, cy: number, arm: number, accent: string): void {
  const r = arm * 0.62
  arrowKey(buffer, cx, cy - arm, r, 'up', accent)
  arrowKey(buffer, cx, cy + arm, r, 'down', accent)
  arrowKey(buffer, cx - arm, cy, r, 'left', accent)
  arrowKey(buffer, cx + arm, cy, r, 'right', accent)
}
