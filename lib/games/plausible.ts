/**
 * The most a game can score by a level, worked out from the rules, so the
 * world's table turns away numbers no one could have played. Generous on
 * purpose: every ingredient or burger, every level bonus, and a wide
 * allowance a level for what comes and goes (sauce, money, bonuses).
 */

import { levelParams } from './catcher'
import { eaterParams } from './eater'
import type { GameName } from './scores'

/** For what comes and goes in a level — sauce, stuns and money in CATCHER, bonuses in EATER — at most this much. */
const EXTRAS: Record<GameName, number> = { catcher: 900, eater: 600 }
export const LAST_LEVEL = 16

/** The fixed points of level `l`: everything on the list or every burger, and the level's own bonus. */
function levelPoints(game: GameName, l: number): number {
  if (game === 'catcher') return levelParams(l).need.reduce((a, b) => a + b, 0) * 10 + 50 * l
  return eaterParams(l).target * 5 + 50 * l
}

/** The highest score possible with `level` reached (its levels before it cleared, itself under way or cleared). */
export function maxScore(game: GameName, level: number): number {
  let total = 0
  for (let l = 1; l <= Math.min(LAST_LEVEL, Math.max(1, level)); l += 1) total += levelPoints(game, l) + EXTRAS[game]
  return total
}

/** The least time, in milliseconds, to have cleared the levels before `level`: nobody clears a level in under eight seconds. */
export const minPlayMs = (level: number): number => Math.max(0, level - 1) * 8000

export function plausible(game: GameName, score: number, level: number, won: boolean, elapsedMs: number): boolean {
  if (!Number.isInteger(score) || score < 0 || !Number.isInteger(level) || level < 1 || level > LAST_LEVEL) return false
  if (won && level !== LAST_LEVEL) return false
  if (score > maxScore(game, level)) return false
  return elapsedMs >= minPlayMs(won ? LAST_LEVEL + 1 : level)
}
