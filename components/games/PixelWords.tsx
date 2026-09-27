/**
 * Words in the games' own 5×7 pixel letters, a line each, as squares in an
 * SVG: HIGH SCORE under the game, in the theme's colour. `px` screen pixels
 * to a letter's pixel.
 */

import { glyph7 } from '@/lib/games/pixels'

export default function PixelWords({ lines, color, px = 3 }: { lines: string[]; color: string; px?: number }) {
  const width = Math.max(...lines.map((l) => l.length * 6 - 1)), height = lines.length * 9 - 2
  const cells: Array<[number, number]> = []
  lines.forEach((line, row) => line.split('').forEach((c, i) => glyph7(c).forEach((r, y) => r.split('').forEach((dot, x) => { if (dot === '#') cells.push([i * 6 + x, row * 9 + y]) }))))
  return (
    <svg width={width * px} height={height * px} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden="true">
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />)}
    </svg>
  )
}
