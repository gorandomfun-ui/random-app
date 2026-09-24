/**
 * Draws every still screen of both games into PNG files, enlarged, for the
 * phase-1 report — the same drawing the demo page shows on a canvas.
 *
 *   node --import tsx scripts/games/render-mock.ts <out dir> [accent]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderAll, type Game } from '@/lib/games/screens'
import { TEXT_COLORS } from '@/lib/theme'
import { encodePng } from './png'

const out = process.argv[2] ?? 'docs/reports/jeux-v1'
const accent = process.argv[3] ?? TEXT_COLORS[0]
mkdirSync(out, { recursive: true })
for (const game of ['catcher', 'eater'] as Game[]) {
  for (const { name, buffer } of renderAll(game, accent)) {
    const file = join(out, `${game}-${name}.png`)
    writeFileSync(file, encodePng(buffer.width, buffer.height, buffer.data, 4))
    console.log(`${file}  ${buffer.width * 4}×${buffer.height * 4}`)
  }
}
