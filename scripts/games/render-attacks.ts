/**
 * RANDOM ATTACKS sketched — the title in its two letterings, and a moment
 * of play — wide and tall, into PNG files for the report.
 *
 *   node --import tsx scripts/games/render-attacks.ts <out dir> [accent] [frame]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderAttacksPlay, renderAttacksTitle } from '@/lib/games/attacks'
import { TEXT_COLORS } from '@/lib/theme'
import { encodePng } from './png'

const out = process.argv[2] ?? 'docs/reports/jeux-v1/attacks'
const accent = process.argv[3] ?? TEXT_COLORS[0]
const frame = Number(process.argv[4] ?? 0)
mkdirSync(out, { recursive: true })
for (const lettering of ['zen', 'crisis'] as const) for (const layout of ['landscape', 'portrait'] as const) {
  const buffer = renderAttacksTitle(layout, accent, lettering, { frame })
  const file = join(out, `attacks-${lettering}-${layout === 'landscape' ? 'paysage' : 'portrait'}.png`)
  writeFileSync(file, encodePng(buffer.width, buffer.height, buffer.data, 2))
  console.log(file)
}
for (const layout of ['landscape', 'portrait'] as const) {
  const buffer = renderAttacksPlay(layout, accent, { frame })
  const file = join(out, `attacks-jeu-${layout === 'landscape' ? 'paysage' : 'portrait'}.png`)
  writeFileSync(file, encodePng(buffer.width, buffer.height, buffer.data, 3))
  console.log(file)
}
