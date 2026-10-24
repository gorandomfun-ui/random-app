/**
 * RANDOM FIGHTER's words — FIGHTER, and GAME OVER and WINNER for its end
 * screens — in Shojumaru (Brian J. Bonislawsky, Astigmatic; SIL Open Font
 * License 1.1), a lettering with a brush's edges — file and licence in
 * `scripts/games/fonts/`. Written flat into pixel masks in
 * `lib/games/fighter-lettering-data.ts`; the colours, the depth and the ink
 * are drawn by the game (`lib/games/fighter.ts`). Only the masks reach the
 * site.
 *
 *   node --import tsx scripts/games/fighter-lettering.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { letteringModule, type Variant } from './mask-lettering'

const FONT = 'Shojumaru-Regular.ttf'
const VARIANTS: Variant[] = [
  { name: 'fighter', file: FONT, bold: 1, text: 'FIGHTER' },
  { name: 'game', file: FONT, bold: 1, text: 'GAME' },
  { name: 'over', file: FONT, bold: 1, text: 'OVER' },
  { name: 'winner', file: FONT, bold: 1, text: 'WINNER' },
]

writeFileSync(join(__dirname, '../../lib/games/fighter-lettering-data.ts'), letteringModule(`/**
 * RANDOM FIGHTER's words as flat pixel masks, in Shojumaru (SIL Open Font
 * License 1.1): FIGHTER, GAME, OVER, WINNER — written by
 * \`scripts/games/fighter-lettering.ts\`. Each row is the lengths of its
 * alternating runs of pixels, off first, in base 36. Generated — do not edit
 * by hand.
 */
`, 'FIGHTER_LETTERING', 'FighterLettering', VARIANTS, 1000))
