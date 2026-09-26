/**
 * The rules of RANDOM EATER, apart from any screen: the eater crawls on
 * across the diner's floor, head first, and grows a piece longer with
 * every burger. Walls, furniture or his own body stop him for good. Each
 * level wants a few more burgers; reached, LEVEL UP shows over the play
 * and it goes on, a little faster, the eater digesting back to the length
 * the next level starts at — longer each level — while the diner fills up
 * with its next islands of furniture. Level 16 cleared, he has won.
 * Now and then a bonus comes for a few seconds, for points: fries, a
 * milkshake, a donut, and rarely a burger all in gold.
 *
 * New furniture never lands on the eater: an island waits, shown faint,
 * until its cells are clear of the body and away from the head. The same
 * seed and the same inputs play the same game.
 */

import { EATER_LEVELS, type Furniture, type Island, type Layout } from './diner'
import { DELTA, REVERSE, seeded } from './engine'
import type { Direction } from './sprites'

type Cell = { x: number; y: number }
const SECOND = 60
const key = (x: number, y: number) => `${x},${y}`

/** The last level: cleared, the game is won. */
export const EATER_LAST_LEVEL = 16

export type EaterBonus = 'fries' | 'shake' | 'donut' | 'gold'
/** What each bonus is worth, how long it stays, how often it comes (out of the weights of those allowed), from which level. */
export const EATER_BONUSES: Record<EaterBonus, { points: number; life: number; weight: number; from: number }> = {
  fries: { points: 15, life: 8 * SECOND, weight: 45, from: 1 },
  shake: { points: 25, life: 6 * SECOND, weight: 35, from: 1 },
  donut: { points: 40, life: 5 * SECOND, weight: 20, from: 1 },
  gold: { points: 100, life: 4 * SECOND, weight: 8, from: 3 },
}

export type EaterState = {
  layout: Layout
  cols: number
  rows: number
  level: number
  score: number
  phase: 'play' | 'over' | 'won'
  body: Cell[]
  dir: Direction
  queue: Direction[]
  grow: number
  /** Pieces still to digest after a LEVEL UP: one comes off the tail at each move. */
  shrink: number
  eaten: number
  target: number
  food: Cell | null
  bonus: (Cell & { kind: EaterBonus; timer: number; life: number }) | null
  bonusTimer: number
  /** Steps until the next move; the interval between moves need not be a whole number of steps. */
  tick: number
  interval: number
  levelUp: number
  islands: Array<{ island: Island; solid: boolean }>
  solid: Set<string>
  moves: number
  steps: number
  passed: number
  random: () => number
}

/** How fast a level goes, how many burgers it wants, how long the eater is when it starts. */
export function eaterParams(level: number) {
  const l = Math.min(level, EATER_LAST_LEVEL)
  const movesPerSecond = 3.5 + 0.3 * (l - 1)
  return { interval: SECOND / movesPerSecond, target: 5 + Math.floor((l - 1) / 2), length: 3 + 2 * (l - 1) }
}

/** The furniture of a level, in the board's own grid: turned over on a tall board. */
function islandsFor(layout: Layout, level: number): Island[] {
  const islands = EATER_LEVELS[(Math.min(level, EATER_LEVELS.length) - 1)].islands
  if (layout === 'landscape') return [...islands]
  return islands.map((island) => island.map((f): Furniture => ({ ...f, x: f.y, y: f.x, w: f.h, h: f.w })))
}

const cellsOf = (island: Island): Cell[] => island.flatMap((f) => Array.from({ length: f.w * f.h }, (_, k) => ({ x: f.x + (k % f.w), y: f.y + Math.floor(k / f.w) })))

/** The body a game starts with: head on the starting row heading in, the rest trailing back to the wall, then winding along the rows below. */
function startBody(layout: Layout, length: number, cols: number): Cell[] {
  const wide: Cell[] = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }, { x: 2, y: 10 }, { x: 1, y: 10 }]
  for (let row = 11; wide.length < length; row += 1) {
    const leftward = (row - 11) % 2 === 1
    for (let i = 0; i < cols - 2 && wide.length < length; i += 1) wide.push({ x: leftward ? cols - 2 - i : 1 + i, y: row })
  }
  const body = wide.slice(0, Math.max(3, length))
  return layout === 'landscape' ? body : body.map(({ x, y }) => ({ x: y, y: x }))
}

export function createEater(layout: Layout, level = 1, seed = 1): EaterState {
  const cols = layout === 'landscape' ? 28 : 20, rows = layout === 'landscape' ? 20 : 28
  const random = seeded(seed * 104729 + level)
  const params = eaterParams(level)
  const s: EaterState = {
    layout, cols, rows, level, score: 0, phase: 'play',
    body: startBody(layout, params.length, layout === 'landscape' ? cols : rows), dir: layout === 'landscape' ? 'right' : 'down', queue: [], grow: 0, shrink: 0,
    eaten: 0, target: params.target, food: null, bonus: null, bonusTimer: 12 * SECOND,
    tick: params.interval, interval: params.interval, levelUp: 0,
    islands: islandsFor(layout, level).map((island) => ({ island, solid: false })), solid: new Set(),
    moves: 0, steps: 0, passed: 0, random,
  }
  settleIslands(s)
  s.food = placeFood(s)
  return s
}

/** Islands waiting become solid once none of their cells is under the body or near the head. */
function settleIslands(s: EaterState): void {
  const bodyCells = new Set(s.body.map((c) => key(c.x, c.y)))
  const head = s.body[0]
  for (const entry of s.islands) {
    if (entry.solid) continue
    const cells = cellsOf(entry.island)
    if (cells.some((c) => bodyCells.has(key(c.x, c.y)) || Math.max(Math.abs(c.x - head.x), Math.abs(c.y - head.y)) < 3)) continue
    entry.solid = true
    for (const c of cells) s.solid.add(key(c.x, c.y))
  }
}

const inside = (s: EaterState, x: number, y: number) => x >= 1 && y >= 1 && x < s.cols - 1 && y < s.rows - 1

/** A cell out in the open: inside the counter, off the body, away from the head, nothing of the furniture round it, not where something already lies. */
function openSpot(s: EaterState): Cell | null {
  const bodyCells = new Set(s.body.map((c) => key(c.x, c.y)))
  const furniture = new Set(s.islands.flatMap((e) => cellsOf(e.island).map((c) => key(c.x, c.y))))
  const head = s.body[0]
  const spots: Cell[] = []
  for (let y = 1; y < s.rows - 1; y += 1) for (let x = 1; x < s.cols - 1; x += 1) {
    if (bodyCells.has(key(x, y)) || Math.abs(x - head.x) + Math.abs(y - head.y) < 3) continue
    if ((s.food && s.food.x === x && s.food.y === y) || (s.bonus && s.bonus.x === x && s.bonus.y === y)) continue
    let clear = true
    for (let dy = -1; dy <= 1 && clear; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (furniture.has(key(x + dx, y + dy))) { clear = false; break }
    if (clear) spots.push({ x, y })
  }
  return spots.length ? spots[Math.floor(s.random() * spots.length)] : null
}

const placeFood = (s: EaterState): Cell | null => openSpot(s)

/** Which bonus comes: drawn by weight among those the level allows. */
function drawBonus(s: EaterState): EaterBonus {
  const allowed = (Object.keys(EATER_BONUSES) as EaterBonus[]).filter((k) => s.level >= EATER_BONUSES[k].from)
  let roll = s.random() * allowed.reduce((sum, k) => sum + EATER_BONUSES[k].weight, 0)
  for (const k of allowed) { roll -= EATER_BONUSES[k].weight; if (roll < 0) return k }
  return allowed[0]
}
const nextBonusIn = (s: EaterState) => (10 + Math.floor(s.random() * 7)) * SECOND

/** The player asks for a turn: kept in a short queue so two quick turns both happen, never straight back. */
export function turnEater(s: EaterState, dir: Direction): void {
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir
  if (dir === last || dir === REVERSE[last] || s.queue.length >= 2) return
  s.queue.push(dir)
}

/** One sixtieth of a second of the game. */
export function stepEater(s: EaterState, want?: Direction | null): void {
  s.steps += 1
  if (s.phase !== 'play') return
  if (want) turnEater(s, want)
  if (s.levelUp > 0) s.levelUp -= 1
  // a bonus comes, stays a few seconds, goes
  if (s.bonus) { s.bonus.timer -= 1; if (s.bonus.timer <= 0) { s.bonus = null; s.bonusTimer = nextBonusIn(s) } }
  else if (--s.bonusTimer <= 0) {
    const spot = openSpot(s)
    if (spot) { const kind = drawBonus(s); s.bonus = { ...spot, kind, timer: EATER_BONUSES[kind].life, life: EATER_BONUSES[kind].life } }
    else s.bonusTimer = SECOND
  }
  s.tick -= 1
  if (s.tick > 0) return
  s.tick += s.interval
  if (s.queue.length) s.dir = s.queue.shift()!
  const head = s.body[0]
  const next = { x: head.x + DELTA[s.dir][0], y: head.y + DELTA[s.dir][1] }
  // the tail moves off its cell this very move unless the eater is growing, and one more piece while he digests: those cells are free to enter
  const leaving = (s.grow === 0 ? 1 : 0) + (s.shrink > 0 && s.body.length > 3 ? 1 : 0)
  const bodyHit = s.body.some((c, i) => c.x === next.x && c.y === next.y && i < s.body.length - leaving)
  if (!inside(s, next.x, next.y) || s.solid.has(key(next.x, next.y)) || bodyHit) { s.phase = 'over'; return }
  s.body.unshift(next)
  if (s.grow > 0) s.grow -= 1
  else s.body.pop()
  // digesting after a LEVEL UP: one more piece off the tail
  if (s.shrink > 0 && s.body.length > 3) { s.body.pop(); s.shrink -= 1 }
  s.moves += 1
  if (s.food && next.x === s.food.x && next.y === s.food.y) {
    s.grow += 1
    s.eaten += 1
    s.score += 5
    if (s.eaten >= s.target) levelUp(s)
    if (s.phase !== 'play') return
    s.food = placeFood(s)
  }
  if (s.bonus && next.x === s.bonus.x && next.y === s.bonus.y) { s.score += EATER_BONUSES[s.bonus.kind].points; s.bonus = null; s.bonusTimer = nextBonusIn(s) }
  settleIslands(s)
}

/** LEVEL UP: shown over the play, the pace rises, he digests back to the next level's length, its furniture comes in as soon as there is room. The last level won, the game is. */
function levelUp(s: EaterState): void {
  s.score += 50 * s.level
  s.passed += 1
  if (s.level >= EATER_LAST_LEVEL) { s.phase = 'won'; return }
  s.level += 1
  const params = eaterParams(s.level)
  s.eaten = 0
  s.target = params.target
  s.interval = params.interval
  s.levelUp = Math.round(1.4 * SECOND)
  s.grow = 0
  s.shrink = Math.max(0, s.body.length - params.length)
  const fresh = islandsFor(s.layout, s.level)
  const same = (a: Island, b: Island) => JSON.stringify(a) === JSON.stringify(b)
  // islands already standing stay; new ones wait for room
  const kept = s.islands.filter((e) => fresh.some((f) => same(f, e.island)))
  s.islands = [...kept, ...fresh.filter((f) => !kept.some((e) => same(e.island, f))).map((island) => ({ island, solid: false }))]
  s.solid = new Set(s.islands.filter((e) => e.solid).flatMap((e) => cellsOf(e.island).map((c) => key(c.x, c.y))))
}
