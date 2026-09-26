/**
 * Draws every base screen of both games into PNG files, enlarged, for the
 * report — the same drawing the demo page shows on a canvas.
 *
 *   node --import tsx scripts/games/render-mock.ts <out dir> [accent] [frame]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderAll } from '@/lib/games/screens'
import { TEXT_COLORS } from '@/lib/theme'
import { encodePng } from './png'

const out = process.argv[2] ?? 'docs/reports/jeux-v1/v4'
const accent = process.argv[3] ?? TEXT_COLORS[0]
const frame = Number(process.argv[4] ?? 0)
mkdirSync(out, { recursive: true })
for (const { game, layout, name, buffer } of renderAll(accent, frame)) {
  const scale = buffer.width >= 400 || buffer.height >= 500 ? 3 : 4
  const file = join(out, `${game}-${name}-${layout === 'landscape' ? 'paysage' : 'portrait'}.png`)
  writeFileSync(file, encodePng(buffer.width, buffer.height, buffer.data, scale))
  console.log(`${file}  ${buffer.width}×${buffer.height} ×${scale}`)
}
