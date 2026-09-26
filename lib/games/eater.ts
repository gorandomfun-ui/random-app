/**
 * The rules of RANDOM EATER, apart from any screen: the eater crawls on
 * across the diner's floor, head first, and grows a piece longer with
 * every burger. Walls, furniture or his own body stop him for good. Each
 * level wants a few more burgers; reached, LEVEL UP shows over the play
 * and it goes on, faster, the diner filling up with its next islands of
 * furniture. Now and then a milkshake comes for a few seconds, for points.
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

export type EaterState = {
  layout: Layout
  cols: number
  rows: number
  level: number
  score: number
  phase: 'play' | 'over'
  body: Cell[]
  dir: Direction
  queue: Direction[]
  grow: number
  eaten: number
  target: number
  food: Cell | null
  shake: (Cell & { timer: number }) | null
  shakeTimer: number
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

/** How fast a level goes and how many burgers it wants. */
export function eaterParams(level: number) {
  const loop = Math.floor((level - 1) / 8), l = ((level - 1) % 8) + 1
  const movesPerSecond = 5 + 0.8 * (l - 1) + 1.5 * loop
  return { interval: Math.max(3, Math.round(SECOND / movesPerSecond)), target: 4 + l }
}

/** The furniture of a level, in the board's own grid: turned over on a tall board. */
function islandsFor(layout: Layout, level: number): Island[] {
  const islands = EATER_LEVELS[(level - 1) % EATER_LEVELS.length].islands
  if (layout === 'landscape') return [...islands]
  return islands.map((island) => island.map((f): Furniture => ({ ...f, x: f.y, y: f.x, w: f.h, h: f.w })))
}

const cellsOf = (island: Island): Cell[] => island.flatMap((f) => Array.from({ length: f.w * f.h }, (_, k) => ({ x: f.x + (k % f.w), y: f.y + Math.floor(k / f.w) })))

export function createEater(layout: Layout, level = 1, seed = 1): EaterState {
  const cols = layout === 'landscape' ? 28 : 20, rows = layout === 'landscape' ? 20 : 28
  const random = seeded(seed * 104729 + level)
  // head, shoulders and legs on the starting row, heading into the room
  const body = layout === 'landscape' ? [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }] : [{ x: 10, y: 5 }, { x: 10, y: 4 }, { x: 10, y: 3 }]
  const params = eaterParams(level)
  const s: EaterState = {
    layout, cols, rows, level, score: 0, phase: 'play',
    body, dir: layout === 'landscape' ? 'right' : 'down', queue: [], grow: 0,
    eaten: 0, target: params.target, food: null, shake: null, shakeTimer: 20 * SECOND,
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

/** A cell out in the open: inside the counter, off the body, away from the head, nothing of the furniture round it. */
function openSpot(s: EaterState): Cell | null {
  const bodyCells = new Set(s.body.map((c) => key(c.x, c.y)))
  const furniture = new Set(s.islands.flatMap((e) => cellsOf(e.island).map((c) => key(c.x, c.y))))
  const head = s.body[0]
  const spots: Cell[] = []
  for (let y = 1; y < s.rows - 1; y += 1) for (let x = 1; x < s.cols - 1; x += 1) {
    if (bodyCells.has(key(x, y)) || Math.abs(x - head.x) + Math.abs(y - head.y) < 3) continue
    let clear = true
    for (let dy = -1; dy <= 1 && clear; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (furniture.has(key(x + dx, y + dy))) { clear = false; break }
    if (clear) spots.push({ x, y })
  }
  return spots.length ? spots[Math.floor(s.random() * spots.length)] : null
}

const placeFood = (s: EaterState): Cell | null => openSpot(s)

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
  // the milkshake comes and goes
  if (s.shake) { s.shake.timer -= 1; if (s.shake.timer <= 0) { s.shake = null; s.shakeTimer = (18 + Math.floor(s.random() * 10)) * SECOND } }
  else if (--s.shakeTimer <= 0) { const spot = openSpot(s); if (spot && !(s.food && spot.x === s.food.x && spot.y === s.food.y)) s.shake = { ...spot, timer: 6 * SECOND }; else s.shakeTimer = SECOND }
  if (--s.tick > 0) return
  s.tick = s.interval
  if (s.queue.length) s.dir = s.queue.shift()!
  const head = s.body[0]
  const next = { x: head.x + DELTA[s.dir][0], y: head.y + DELTA[s.dir][1] }
  // the tail moves off its cell this very tick unless the eater is growing: that cell is free to enter
  const tailLeaves = s.grow === 0
  const bodyHit = s.body.some((c, i) => c.x === next.x && c.y === next.y && !(tailLeaves && i === s.body.length - 1))
  if (!inside(s, next.x, next.y) || s.solid.has(key(next.x, next.y)) || bodyHit) { s.phase = 'over'; return }
  s.body.unshift(next)
  if (s.grow > 0) s.grow -= 1
  else s.body.pop()
  s.moves += 1
  if (s.food && next.x === s.food.x && next.y === s.food.y) {
    s.grow += 1
    s.eaten += 1
    s.score += 5
    if (s.eaten >= s.target) levelUp(s)
    s.food = placeFood(s)
  }
  if (s.shake && next.x === s.shake.x && next.y === s.shake.y) { s.score += 25; s.shake = null; s.shakeTimer = (18 + Math.floor(s.random() * 10)) * SECOND }
  settleIslands(s)
}

/** LEVEL UP: shown over the play, the pace rises, the next level's furniture comes in as soon as there is room. */
function levelUp(s: EaterState): void {
  s.score += 50 * s.level
  s.passed += 1
  s.level += 1
  const params = eaterParams(s.level)
  s.eaten = 0
  s.target = params.target
  s.interval = params.interval
  s.levelUp = Math.round(1.4 * SECOND)
  const fresh = islandsFor(s.layout, s.level)
  const same = (a: Island, b: Island) => JSON.stringify(a) === JSON.stringify(b)
  // islands already standing stay; new ones wait for room; a new round of levels clears the room first
  const kept = s.islands.filter((e) => fresh.some((f) => same(f, e.island)))
  s.islands = [...kept, ...fresh.filter((f) => !kept.some((e) => same(e.island, f))).map((island) => ({ island, solid: false }))]
  s.solid = new Set(s.islands.filter((e) => e.solid).flatMap((e) => cellsOf(e.island).map((c) => key(c.x, c.y))))
}
