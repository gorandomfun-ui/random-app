/**
 * Words in the games' own 5×7 pixel letters, a line each, as squares in an
 * SVG: HIGH SCORE under the game, in the theme's colour. Every line is as
 * wide as the first: a longer one is drawn in narrower letters, four dots
 * wide, closer together — so SCORE sits exactly under HIGH. `px` screen
 * pixels to a letter's dot.
 */

import { glyph7 } from '@/lib/games/pixels'

/** The same letters four dots wide, for a line that has to fit. */
const NARROW: Record<string, string[]> = {
  S: ['.###', '#...', '#...', '.##.', '...#', '...#', '###.'],
  C: ['.###', '#...', '#...', '#...', '#...', '#...', '.###'],
  O: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  R: ['###.', '#..#', '#..#', '###.', '#.#.', '#..#', '#..#'],
  E: ['####', '#...', '#...', '###.', '#...', '#...', '####'],
}
/** Any other letter narrowed by leaving its middle column out. */
const narrow = (c: string) => NARROW[c.toUpperCase()] ?? glyph7(c).map((row) => row.slice(0, 2) + row.slice(3))

export default function PixelWords({ lines, color, px = 1.5 }: { lines: string[]; color: string; px?: number }) {
  const width = lines[0].length * 6 - 1, height = lines.length * 9 - 2
  const cells: Array<[number, number, number]> = []
  lines.forEach((line, row) => {
    const letters = line.split('')
    const fits = letters.length * 6 - 1 <= width
    const glyphs = letters.map((c) => (fits ? glyph7(c) : narrow(c)))
    const w = fits ? 5 : 4
    // the gap between letters that makes the line exactly as wide as the first
    const gap = letters.length > 1 ? (width - letters.length * w) / (letters.length - 1) : 0
    glyphs.forEach((glyph, i) => glyph.forEach((r, y) => r.split('').forEach((dot, x) => { if (dot === '#') cells.push([i * (w + gap) + x, row * 9 + y, 1]) })))
  })
  return (
    <svg width={width * px} height={height * px} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden="true">
      {cells.map(([x, y, s]) => <rect key={`${x}-${y}`} x={x} y={y} width={s} height={s} fill={color} />)}
    </svg>
  )
}
