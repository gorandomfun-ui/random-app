/**
 * RANDOM RACING's word, RACING, in the two lettering proposals: Racing Sans
 * One (Pablo Impallari, Rodrigo Fuenzalida; SIL Open Font License 1.1) and
 * Faster One (The Faster Project Authors; SIL Open Font License 1.1, its
 * speed lines in the letters) — files and licences in
 * `scripts/games/fonts/`. Written flat into pixel masks in
 * `lib/games/racing-lettering-data.ts`; the slant, the chrome, the depth and
 * the speed lines are drawn by the game (`lib/games/racing.ts`). Only the
 * masks reach the site.
 *
 *   node --import tsx scripts/games/racing-lettering.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { letteringModule, type Variant } from './mask-lettering'

const VARIANTS: Variant[] = [
  { name: 'sans', file: 'RacingSansOne-Regular.ttf', bold: 1.15, text: 'RACING' },
  { name: 'faster', file: 'FasterOne-Regular.ttf', bold: 1, text: 'RACING' },
]

writeFileSync(join(__dirname, '../../lib/games/racing-lettering-data.ts'), letteringModule(`/**
 * RANDOM RACING's word as flat pixel masks, in the two proposals: Racing Sans
 * One (\`sans\`) and Faster One (\`faster\`), both SIL Open Font License 1.1 —
 * written by \`scripts/games/racing-lettering.ts\`. Each row is the lengths of
 * its alternating runs of pixels, off first, in base 36. Generated — do not
 * edit by hand.
 */
`, 'RACING_LETTERING', 'RacingLettering', VARIANTS, 1000))
