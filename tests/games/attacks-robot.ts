/**
 * A careful player for RANDOM ATTACKS, used by the tests to show the
 * levels can be won: it steps out of the way of what falls toward it —
 * throws, divers, loose sliders —, goes for a bonus it can catch, and
 * otherwise puts its ketchup under the nearest target and fires only when
 * the squirt will meet it (so it keeps its multiplier). Not a perfect
 * player, not a cheat: it sees only what a player sees on the screen.
 */

import { ATTACKS_BOARD, ATTACKS_BOSSES, ATTACKS_KINDS, attacksCookTop, attacksParams, burgerSpot, createAttacks, stepAttacks, throwX, type AttacksLayout, type AttacksState } from '@/lib/games/attacks-rules'

export type RobotControl = { move: -1 | 0 | 1; fire: boolean }

/** Something coming down: where it is along the cook's height from `from` to `to` steps from now (`x(t)`), how near is too near. */
type Threat = { x: (t: number) => number; from: number; to: number; reach: number }

const NOZZLE = 11
const SPEED = 2.4

function threats(s: AttacksState): Threat[] {
  const top = attacksCookTop(s) + 2, ground = s.height - 2
  const out: Threat[] = []
  for (const t of s.throws) {
    if (t.y > s.height) continue
    const x0 = throwX(t), vx = t.vx
    out.push({ x: (k) => x0 + vx * k, from: (top - t.y) / t.vy, to: (ground - t.y) / t.vy, reach: 13 + (t.zig ? 7 : 0) })
  }
  for (const b of s.burgers) {
    const d = b.dive
    if (!b.alive || !d || d.back) continue
    const vy = Math.max(d.vy, 0.6), y = d.y + 6, x0 = d.x, vx = d.vx
    out.push({ x: (k) => x0 + vx * Math.min(k, 40), from: (top - y) / vy, to: (ground - y) / vy, reach: 22 })
  }
  for (const l of s.loose) {
    const vy = Math.max(l.vy, 0.6), y = l.y + 5, x0 = l.x, vx = l.vx
    out.push({ x: (k) => x0 + vx * Math.min(k, 30), from: (top - y) / vy, to: (ground - y) / vy, reach: 19 })
  }
  return out
}

/** Going from the cook to `goal`, the least room left between him and what comes down over the next `horizon` steps, in pixels (negative: hit). */
function room(s: AttacksState, list: Threat[], goal: number, horizon = 140): number {
  const x0 = s.cook.x, dir = Math.sign(goal - x0), dist = Math.abs(goal - x0)
  const at = (k: number) => x0 + dir * Math.min(dist, SPEED * k)
  let least = 999
  for (const t of list) {
    const a = Math.max(0, t.from), b = Math.min(horizon, t.to)
    if (b < a) continue
    for (const k of [a, (a + b) / 2, b]) least = Math.min(least, Math.abs(t.x(k) - at(k)) - t.reach)
  }
  return least
}

/** Is there china over the nozzle at `x`? A squirt from there would only chip it. */
function underPlate(s: AttacksState, x: number): boolean {
  const half = ATTACKS_BOARD[s.layout].plate / 2 + 2
  return s.plates.some((p) => Math.abs(x - p.x) < half && p.bites.length < 12)
}

/** What can be shot, and where it will be when a squirt from the cook's height gets there. */
function targets(s: AttacksState): Array<{ x: number; hw: number; weight: number }> {
  const top = attacksCookTop(s) - 4
  const out: Array<{ x: number; hw: number; weight: number }> = []
  const boss = s.boss
  if (boss && boss.dying === 0 && boss.y > 0) out.push({ x: boss.x, hw: ATTACKS_BOSSES[boss.kind].hw * 0.6, weight: 0 })
  // the lowest of each column in the formation, and those diving or coming back
  const lowest = new Map<number, (typeof s.burgers)[number]>()
  for (const b of s.burgers) {
    if (!b.alive) continue
    if (b.dive) {
      const d = b.dive, steps = Math.max(0, (top - d.y) / (9 + Math.max(0, d.vy)))
      if (d.y > 0) out.push({ x: d.x + d.vx * steps, hw: ATTACKS_KINDS[b.row].hw - 3, weight: 0 })
      continue
    }
    const was = lowest.get(b.col)
    if (!was || b.row > was.row) lowest.set(b.col, b)
  }
  // the formation's pace, as a player sees it: four pixels a move, a move every few steps, quicker as they fall
  const left = s.burgers.filter((b) => b.alive).length
  const pace = (4 / Math.max(3, Math.round(attacksParams(s.level).wait * (left / Math.max(1, s.burgers.length)) ** 0.8))) * s.formation.dir
  for (const b of lowest.values()) { const c = burgerSpot(s, b), steps = Math.max(0, (top - c.y) / 9); out.push({ x: c.x + pace * steps, hw: ATTACKS_KINDS[b.row].hw - 3, weight: 0 }) }
  for (const l of s.loose) if (l.y > 0 && l.y < s.height) { const steps = Math.max(0, (top - l.y) / 10); out.push({ x: l.x + l.vx * steps, hw: 6, weight: 0 }) }
  return out
}

/** The way to go this step, and whether to fire; `aimError` pixels off in judging where its targets are. */
export function robotMove(s: AttacksState, aimError = 0): RobotControl {
  const x = s.cook.x, nozzle = x + NOZZLE
  const list = threats(s)
  const aims = targets(s).map((t) => ({ ...t, x: t.x + aimError }))
  const lined = aims.some((t) => Math.abs(t.x - nozzle) < t.hw) && !underPlate(s, nozzle)
  const fire = lined || (s.power?.kind === 'torch' && aims.length > 0)
  // something about to land here: off to the nearest place it will not
  if (s.cook.hurt <= 6 && room(s, list, x) < 0) {
    let best = x, bestScore = -Infinity
    for (let d = -160; d <= 160; d += 6) {
      const goal = Math.max(16, Math.min(s.width - 16, x + d))
      const r = room(s, list, goal)
      const score = (r >= 0 ? 1000 : r * 10) - Math.abs(d)
      if (score > bestScore) { bestScore = score; best = goal }
    }
    return { move: Math.abs(best - x) < 1.5 ? 0 : best > x ? 1 : -1, fire }
  }
  // a bonus falling within reach, if the way is clear
  if (s.drop && !s.power && s.drop.y > s.height * 0.35 && room(s, list, s.drop.x) >= 0) return { move: Math.abs(s.drop.x - x) < 3 ? 0 : s.drop.x > x ? 1 : -1, fire }
  // the nearest target with no china over the place to shoot it from, the way there clear
  const goals = aims.map((t) => Math.max(16, Math.min(s.width - 16, t.x - NOZZLE))).filter((g) => !underPlate(s, g + NOZZLE))
  const pool = goals.length ? goals : aims.map((t) => t.x - NOZZLE)
  if (!pool.length) return { move: 0, fire }
  const safe = pool.filter((g) => room(s, list, g) >= 0)
  const from = safe.length ? safe : pool
  const goal = from.reduce((best, g) => (Math.abs(g - x) < Math.abs(best - x) ? g : best), from[0])
  if (Math.abs(goal - x) < 2) return { move: 0, fire }
  const dir: -1 | 1 = goal > x ? 1 : -1
  // never step under something about to land
  if (room(s, list, x + dir * 14) < 0 && room(s, list, x) >= 0) return { move: 0, fire }
  return { move: dir, fire }
}

/**
 * A player more like a person, for measuring how hard the levels are: it
 * looks again only every `every` steps (its reactions), holds what it chose
 * in between, and aims a few pixels off (`miss`).
 */
export function humanPlayer(every = 8, miss = 5, seed = 1): (s: AttacksState) => RobotControl {
  let last: RobotControl = { move: 0, fire: false }, wait = 0, r = seed * 9301 + 49297
  const noise = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 - 0.5 }
  let off = 0
  return (s) => {
    if (--wait > 0) return last
    wait = every
    off = noise() * 2 * miss
    last = robotMove(s, off)
    return last
  }
}

/** A level played by the robot, alone (as a round of the flow): won or not, the score, the steps it took, the lives left. */
export function robotLevel(layout: AttacksLayout, level: number, seed: number, limit = 60 * 60 * 5, player: (s: AttacksState) => RobotControl = robotMove): { won: boolean; score: number; steps: number; lives: number } {
  const s = createAttacks(layout, level, seed, { single: true, lives: 3 })
  while (s.phase === 'play' && s.steps < limit) { const c = player(s); stepAttacks(s, c.move, c.fire) }
  return { won: s.phase === 'won', score: s.score, steps: s.steps, lives: s.lives }
}

/** A whole game played by the robot from level 1. */
export function robotGame(layout: AttacksLayout, seed: number, limit = 60 * 60 * 50): { won: boolean; level: number; score: number } {
  const s = createAttacks(layout, 1, seed)
  while (s.phase === 'play' && s.steps < limit) { const c = robotMove(s); stepAttacks(s, c.move, c.fire) }
  return { won: s.phase === 'won', level: s.level, score: s.score }
}
