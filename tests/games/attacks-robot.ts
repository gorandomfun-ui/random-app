/**
 * A careful player for RANDOM ATTACKS, used by the tests to show the
 * levels can be won: it steps out from under what falls toward it, goes
 * for a bonus it can catch, and otherwise puts its ketchup under the
 * nearest burger. Not a perfect player, not a cheat: it sees only what a
 * player sees on the screen.
 */

import { ATTACKS_BOARD, burgerAt, createAttacks, stepAttacks, type AttacksLayout, type AttacksState } from '@/lib/games/attacks-rules'

/** The way to go this step: -1, 0 or 1. */
export function robotMove(s: AttacksState): -1 | 0 | 1 {
  const x = s.cook.x
  /** Is a column clear of what is falling low over it? */
  const clear = (cx: number, reach: number) => !s.throws.some((t) => Math.abs(t.x - cx) < reach && t.y > s.height - 230 && t.y < s.height - 4)
  // what is about to land on it: step out to the clearer side
  if (s.cook.hurt <= 0 && !clear(x, 20)) {
    const room = (dir: -1 | 1) => { const nx = x + dir * 26; return nx < 16 || nx > s.width - 16 ? -9 : (clear(nx, 18) ? 2 : 0) + (clear(x + dir * 12, 14) ? 1 : 0) }
    const t = s.throws.filter((u) => Math.abs(u.x - x) < 20 && u.y > s.height - 230).sort((a, b) => b.y - a.y)[0]
    const away: -1 | 1 = t && t.x > x ? -1 : 1
    return room(away) >= room(away === 1 ? -1 : 1) ? away : (away === 1 ? -1 : 1)
  }
  // a bonus falling within reach, if the way is clear
  if (s.drop && !s.power && s.drop.y > s.height * 0.35 && clear(s.drop.x, 18)) return Math.abs(s.drop.x - x) < 3 ? 0 : s.drop.x > x ? 1 : -1
  // the nearest burger whose column is clear, the ketchup under it (the nozzle is 11 pixels right of the cook's middle)
  const targets = s.burgers.filter((b) => b.alive).map((b) => burgerAt(s, b).x - 11).filter((t) => t > 16 && t < s.width - 16)
  if (!targets.length) return 0
  const open = targets.filter((t) => clear(t, 24))
  const pool = open.length ? open : targets
  const goal = pool.reduce((best, t) => (Math.abs(t - x) < Math.abs(best - x) ? t : best), pool[0])
  // never walk under something falling on the way
  const dir: -1 | 1 = goal > x ? 1 : -1
  if (!clear(x + dir * 14, 18) && Math.abs(goal - x) > 2) return 0
  return Math.abs(goal - x) < 2 ? 0 : dir
}

/** A level played by the robot, alone (as a round of the flow): won or not, the score, the steps it took. */
export function robotLevel(layout: AttacksLayout, level: number, seed: number, limit = 60 * 60 * 4): { won: boolean; score: number; steps: number; lives: number } {
  const s = createAttacks(layout, level, seed, { single: true, lives: 3 })
  while (s.phase === 'play' && s.steps < limit) stepAttacks(s, robotMove(s))
  return { won: s.phase === 'won', score: s.score, steps: s.steps, lives: s.lives }
}

/** A whole game played by the robot from level 1. */
export function robotGame(layout: AttacksLayout, seed: number, limit = 60 * 60 * 40): { won: boolean; level: number; score: number } {
  const s = createAttacks(layout, 1, seed)
  while (s.phase === 'play' && s.steps < limit) stepAttacks(s, robotMove(s))
  return { won: s.phase === 'won', level: s.level, score: s.score }
}

export { ATTACKS_BOARD }
