/**
 * RANDOM ATTACKS sketched — the title and a moment of play — wide and tall,
 * into PNG files for the report.
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
for (const layout of ['landscape', 'portrait'] as const) {
  const name = layout === 'landscape' ? 'paysage' : 'portrait'
  const title = renderAttacksTitle(layout, accent, 'zen', { frame })
  writeFileSync(join(out, `attacks-titre-${name}.png`), encodePng(title.width, title.height, title.data, 2))
  const play = renderAttacksPlay(layout, accent, { frame })
  writeFileSync(join(out, `attacks-jeu-${name}.png`), encodePng(play.width, play.height, play.data, 3))
  console.log(name)
}
