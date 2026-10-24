/**
 * RANDOM FIGHTER's small things built from shapes (`figure.ts`): the sesame
 * star a burger ninja throws. The fighters themselves are cut out of the
 * owner's pictures (`fighter-art.ts`).
 */

import { drawFigure, type Part, type Ramp } from './figure'
import type { PixelBuffer } from './pixels'

type Pt = readonly [number, number]

const BUN: Ramp = ['#ffd08a', '#e8a24a', '#b8742a', '#7a4a18']
const STEEL: Ramp = ['#ffffff', '#dfe6ee', '#a8b4c4', '#6a7486']

/** A sesame-seed star flying, spinning: a small four-pointed steel star with a seed at its heart. */
export function drawStar(buffer: PixelBuffer, cx: number, cy: number, r: number, frame: number): void {
  const turn = frame * 0.7, c = r + 1
  const star: Pt[] = Array.from({ length: 8 }, (_, k) => { const a = turn + (k * Math.PI) / 4, rr = k % 2 ? r * 0.35 : r; return [c + Math.cos(a) * rr, c + Math.sin(a) * rr] as Pt })
  const parts: Part[] = [{ shape: { kind: 'poly', points: star }, ramp: STEEL }, { shape: { kind: 'ellipse', c: [c, c], rx: r * 0.28, ry: r * 0.2 }, ramp: BUN }]
  drawFigure(buffer, Math.round(cx - c), Math.round(cy - c), Math.ceil(r * 2 + 3), Math.ceil(r * 2 + 3), parts)
}
