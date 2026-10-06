/**
 * RANDOM ATTACKS' words — ATTACKS on the title, GAME OVER and WINNER at the
 * end — in Zen Dots (The Dots Project Authors, SIL Open Font License 1.1,
 * file and licence in `scripts/games/fonts/`), the font the owner chose, its
 * strokes made one and a half times as thick — grown square, so its corners
 * stay sharp. Each is written flat and large into a pixel mask in
 * `lib/games/attacks-lettering-data.ts`; the perspective, the depth, the
 * bands and the outline are drawn by the game (`lib/games/attacks.ts`), in
 * the theme's colour. Only the masks reach the site.
 *
 *   node --import tsx scripts/games/attacks-lettering.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { letteringModule, type Variant } from './mask-lettering'

const ZEN = 'ZenDots-Regular.ttf'
const VARIANTS: Variant[] = [
  { name: 'zen', file: ZEN, bold: 1.5, text: 'ATTACKS' },
  { name: 'gameOver', file: ZEN, bold: 1.5, text: 'GAME OVER' },
  { name: 'game', file: ZEN, bold: 1.5, text: 'GAME' },
  { name: 'over', file: ZEN, bold: 1.5, text: 'OVER' },
  { name: 'winner', file: ZEN, bold: 1.5, text: 'WINNER' },
]

writeFileSync(join(__dirname, '../../lib/games/attacks-lettering-data.ts'), letteringModule(`/**
 * RANDOM ATTACKS' words as flat pixel masks — ATTACKS (\`zen\`), GAME OVER,
 * GAME, OVER, WINNER — written by \`scripts/games/attacks-lettering.ts\` from
 * Zen Dots (The Dots Project Authors, SIL Open Font License 1.1; strokes one
 * and a half times as thick, grown square). Each row is the lengths of its
 * alternating runs of pixels, off first, in base 36. Generated — do not edit
 * by hand.
 */
`, 'ATTACKS_LETTERING', 'AttacksLettering', VARIANTS))
