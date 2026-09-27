/**
 * A careful player for RANDOM CATCHER, used by the tests to show the
 * sixteen levels can be won from the first: it heads for the nearest thing
 * on the list it can reach clearly before any shopper, and otherwise goes
 * where it has the most time to spare. Not a perfect player, not a cheat:
 * it sees only what a player sees on the screen.
 */

import { createCatcher, directionsOf, nextLevel, stepCatcher, walkable, type CatcherState } from '@/lib/games/catcher'
import { DELTA, REVERSE } from '@/lib/games/engine'
import type { Direction } from '@/lib/games/sprites'

/** Every walking distance in a store, worked out once: cell index by cell index. */
const tables = new Map<readonly string[], { index: Map<string, number>; cells: Array<[number, number]>; dist: Int16Array }>()
function distances(maze: readonly string[]) {
  let t = tables.get(maze)
  if (t) return t
  const cells: Array<[number, number]> = []
  const index = new Map<string, number>()
  // row by row in the wide store, column by column in the tall one, as the rules do
  const tall = maze.length > maze[0].length, w = maze[0].length, h = maze.length
  for (let a = 0; a < w * h; a += 1) { const x = tall ? Math.floor(a / h) : a % w, y = tall ? a % h : Math.floor(a / w); if (walkable(maze, x, y)) { index.set(`${x},${y}`, cells.length); cells.push([x, y]) } }
  const n = cells.length
  const dist = new Int16Array(n * n).fill(-1)
  for (let a = 0; a < n; a += 1) {
    const q = [a]; dist[a * n + a] = 0
    for (let h = 0; h < q.length; h += 1) {
      const c = q[h], [x, y] = cells[c], d = dist[a * n + c]
      for (const dir of directionsOf(maze)) { const j = index.get(`${x + DELTA[dir][0]},${y + DELTA[dir][1]}`); if (j !== undefined && dist[a * n + j] < 0) { dist[a * n + j] = d + 1; q.push(j) } }
    }
  }
  t = { index, cells, dist }
  tables.set(maze, t)
  return t
}

/**
 * A careful shopper-dodging player: the nearest thing on the list it can
 * reach clearly before any shopper — `margin` seconds before — else the way
 * with the most time to spare.
 */
export function catcherRobot(s: CatcherState, margin = 0.45): Direction | null {
  const { index, cells, dist } = distances(s.maze)
  const n = cells.length
  const at = (x: number, y: number) => index.get(`${x},${y}`)
  const b = s.burger, vb = b.speed
  // when the soonest shopper on its feet can be at each cell, in seconds
  const danger = new Float64Array(n).fill(Infinity)
  let waiting = 0
  for (const sh of s.shoppers) {
    let from: number | undefined, delay: number
    if (!sh.inside) { from = at(s.entrances[0].x, s.entrances[0].y); delay = s.enterTimer / 60 + 3 * waiting; waiting += 1 }
    else if (sh.dir) { from = at(sh.x + DELTA[sh.dir][0], sh.y + DELTA[sh.dir][1]); delay = (1 - sh.progress) / sh.speed }
    else { from = at(sh.x, sh.y); delay = 0 }
    if (from === undefined) continue
    delay += sh.stunned / 60
    for (let c = 0; c < n; c += 1) { const d = dist[from * n + c]; if (d >= 0) danger[c] = Math.min(danger[c], delay + d / sh.speed) }
    if (sh.inside && sh.stunned === 0) { const here = at(sh.x, sh.y); if (here !== undefined) danger[here] = 0 }
  }
  const moving = b.dir != null && b.progress > 0
  const ahead = moving ? at(b.x + DELTA[b.dir!][0], b.y + DELTA[b.dir!][1])! : at(b.x, b.y)!
  const t0 = moving ? (1 - b.progress) / vb : 0
  const safe = (c: number, t: number) => t + margin < danger[c]
  const wanted = new Set<number>(s.items.map((it) => at(it.x, it.y)!).filter((c) => c !== undefined))
  if (s.sauce) { const c = at(s.sauce.x, s.sauce.y); if (c !== undefined) wanted.add(c) }
  // a safe way, breadth first, from the cell ahead
  const first = new Map<number, Direction | null>([[ahead, null]])
  const depth = new Map<number, number>([[ahead, 0]])
  const q = [ahead]
  let goal = -1
  for (let h = 0; h < q.length && goal < 0; h += 1) {
    const c = q[h], [x, y] = cells[c]
    if (wanted.has(c) && first.get(c)) { goal = c; break }
    for (const dir of directionsOf(s.maze)) {
      const j = at(x + DELTA[dir][0], y + DELTA[dir][1])
      if (j === undefined || first.has(j) || !safe(j, t0 + (depth.get(c)! + 1) / vb)) continue
      first.set(j, first.get(c) ?? dir); depth.set(j, depth.get(c)! + 1); q.push(j)
    }
  }
  const aheadSafe = safe(ahead, t0)
  if (goal >= 0 && aheadSafe) return first.get(goal)!
  if (!aheadSafe && moving) return REVERSE[b.dir!]
  // nowhere safe to go for the list: toward the most time to spare within a few cells
  const [ax, ay] = cells[ahead]
  let best: Direction | null = null, bestSpare = -Infinity
  for (const dir of directionsOf(s.maze)) {
    const j = at(ax + DELTA[dir][0], ay + DELTA[dir][1])
    if (j === undefined) continue
    let spare = -Infinity
    for (let c = 0; c < n; c += 1) { const d = dist[j * n + c]; if (d >= 0 && d <= 6) spare = Math.max(spare, danger[c] - (d + 1) / vb) }
    if (spare > bestSpare) { bestSpare = spare; best = dir }
  }
  return best
}

/**
 * A whole game from level 1, as the player page plays it; returns how far it
 * went. `reaction`: steps between seeing and acting (15 is a player's quarter
 * of a second); `margin`: how much time to spare it keeps from the shoppers.
 */
export function catcherRun(seed: number, layout: 'landscape' | 'portrait', reaction = 0, margin = 0.45): { won: boolean; level: number; lost: number } {
  let s = createCatcher(layout, 1, seed)
  let lost = 0, wasCaught = false
  const pending: Array<Direction | null> = []
  for (let i = 0; i < 60 * 60 * 40 && s.phase !== 'won' && s.phase !== 'over'; i += 1) {
    pending.push(s.phase === 'play' ? catcherRobot(s, margin) : null)
    stepCatcher(s, pending.length > reaction ? pending.shift()! : null)
    if (s.phase === 'caught' && !wasCaught) lost += 1
    wasCaught = s.phase === 'caught'
    if (s.phase === 'clear' && s.phaseTimer === 0) { s = nextLevel(s, seed * 31 + s.level); pending.length = 0 }
  }
  return { won: s.phase === 'won', level: s.level, lost }
}
