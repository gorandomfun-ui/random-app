/**
 * RANDOM ATTACKS' screens — the title, a moment of play, GAME OVER, WINNER —
 * wide and tall, into PNG files for the report.
 *
 *   node --import tsx scripts/games/render-attacks.ts <out dir> [accent] [frame]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderAttacksOver, renderAttacksPlay, renderAttacksTitle, renderAttacksWinner } from '@/lib/games/attacks'
import { provideAttacksArt } from '@/lib/games/attacks-art'
import { PixelBuffer } from '@/lib/games/pixels'
import { TEXT_COLORS } from '@/lib/theme'
import { decodePng, encodePng } from './png'

// the traced pictures, as the browser would have them
for (const [name, file] of [['titleWide', 'title-wide.png'], ['titleTall', 'title-tall.png'], ['playWide', 'play-wide.png'], ['playTall', 'play-tall.png'], ['rover', 'rover.png']] as const) {
  const png = decodePng(readFileSync(join(process.cwd(), 'public/games/attacks', file)))
  const buffer = new PixelBuffer(png.width, png.height)
  buffer.data.set(png.rgba)
  provideAttacksArt(name, buffer)
}

const out = process.argv[2] ?? 'docs/reports/jeux-v1/attacks'
const accent = process.argv[3] || TEXT_COLORS[0]
const frame = Number(process.argv[4] ?? 0)
mkdirSync(out, { recursive: true })
for (const layout of ['landscape', 'portrait'] as const) {
  const name = layout === 'landscape' ? 'paysage' : 'portrait'
  const title = renderAttacksTitle(layout, accent, 'zen', { frame })
  writeFileSync(join(out, `attacks-titre-${name}.png`), encodePng(title.width, title.height, title.data, 2))
  const play = renderAttacksPlay(layout, accent, { frame })
  writeFileSync(join(out, `attacks-jeu-${name}.png`), encodePng(play.width, play.height, play.data, 3))
  const over = renderAttacksOver(layout, accent, { score: 3420, best: 5100, frame })
  writeFileSync(join(out, `attacks-fin-perdu-${name}.png`), encodePng(over.width, over.height, over.data, 2))
  const winner = renderAttacksWinner(layout, accent, { score: 18240, best: 18240, frame })
  writeFileSync(join(out, `attacks-fin-gagne-${name}.png`), encodePng(winner.width, winner.height, winner.data, 2))
  console.log(name)
}
