/**
 * RANDOM RACING's words — RACING, and GAME OVER and WINNER for its end
 * screens — in Racing Sans One (Pablo Impallari, Rodrigo Fuenzalida; SIL
 * Open Font License 1.1), the lettering the owner chose — file and licence
 * in `scripts/games/fonts/`. Written flat into pixel masks in
 * `lib/games/racing-lettering-data.ts`; the slant, the chrome, the depth and
 * the speed lines are drawn by the game (`lib/games/racing.ts`). Only the
 * masks reach the site.
 *
 *   node --import tsx scripts/games/racing-lettering.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { letteringModule, type Variant } from './mask-lettering'

const FONT = 'RacingSansOne-Regular.ttf'
const VARIANTS: Variant[] = [
  { name: 'sans', file: FONT, bold: 1.15, text: 'RACING' },
  { name: 'gameOver', file: FONT, bold: 1.15, text: 'GAME OVER' },
  { name: 'game', file: FONT, bold: 1.15, text: 'GAME' },
  { name: 'over', file: FONT, bold: 1.15, text: 'OVER' },
  { name: 'winner', file: FONT, bold: 1.15, text: 'WINNER' },
]

writeFileSync(join(__dirname, '../../lib/games/racing-lettering-data.ts'), letteringModule(`/**
 * RANDOM RACING's words as flat pixel masks, in Racing Sans One (SIL Open
 * Font License 1.1): RACING (\`sans\`), GAME OVER, GAME, OVER, WINNER — written by
 * \`scripts/games/racing-lettering.ts\`. Each row is the lengths of its
 * alternating runs of pixels, off first, in base 36. Generated — do not edit
 * by hand.
 */
`, 'RACING_LETTERING', 'RacingLettering', VARIANTS, 1000))
