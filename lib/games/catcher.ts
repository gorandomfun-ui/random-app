/**
 * The rules of RANDOM CATCHER, apart from any screen: the burger runs the
 * aisles of the store to fill its shopping list — tomatoes, pickles,
 * onions, cheese — while shoppers come in by the door and hunt it. Two
 * chase (one straight at it, one heading it off), one walks the aisles,
 * one wanders. They rush for a while, then calm down and go back to their
 * corners, so the player can breathe. A bottle of sauce now and then:
 * picked up, the burger spills a trail of it for a few seconds, and a
 * shopper who steps in it slips and sits dizzy. Money lies about now and
 * then, for points. Three lives; the list filled, the level is won; from
 * level 9 a fifth shopper comes to take the burger in a pincer; level 16
 * cleared, the game is won.
 *
 * Everything moves sixty steps a second through `stepCatcher`; the same
 * seed and the same inputs play the same game.
 */

import { DELTA, DIRS, REVERSE, seeded } from './engine'
import { BLOCKING, mazeFor } from './maze'
import type { Direction } from './sprites'

export type Layout = 'landscape' | 'portrait'
export const INGREDIENT_NAMES = ['tomato', 'pickle', 'onion', 'cheese'] as const

type Cell = { x: number; y: number }
type Mover = { x: number; y: number; dir: Direction | null; progress: number; speed: number }
export type Role = 'chase' | 'ambush' | 'patrol' | 'wander' | 'pincer'
export type Shopper = Mover & { role: Role; look: number; stunned: number; waypoint: number; inside: boolean }

export type CatcherState = {
  layout: Layout
  maze: readonly string[]
  level: number
  score: number
  lives: number
  phase: 'play' | 'caught' | 'clear' | 'over' | 'won'
  phaseTimer: number
  burger: Mover & { want: Direction | null; face: 'left' | 'right'; start: Cell }
  shoppers: Shopper[]
  entrances: Cell[]
  enterTimer: number
  items: Array<Cell & { kind: number }>
  need: number[]
  have: number[]
  sauce: (Cell & { timer: number }) | null
  sauceTimer: number
  spilling: number
  puddles: Map<string, number>
  cash: (Cell & { kind: CatcherCash; timer: number; life: number }) | null
  cashTimer: number
  rush: boolean
  modeTimer: number
  steps: number
  random: () => number
}

const SECOND = 60
const key = (x: number, y: number) => `${x},${y}`

/** The last level: cleared, the game is won. */
export const CATCHER_LAST_LEVEL = 16

/** The shopping list of each level: tomatoes, pickles, onions, cheese. */
const LISTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [2, 2, 1, 1], [3, 2, 2, 1], [3, 3, 2, 1], [4, 3, 3, 2], [4, 4, 3, 2], [5, 4, 4, 2], [5, 5, 4, 3], [6, 5, 5, 3],
  [6, 6, 5, 3], [6, 6, 5, 4], [7, 6, 5, 4], [7, 6, 6, 4], [7, 7, 6, 4], [7, 7, 6, 5], [8, 7, 6, 5], [8, 7, 7, 5],
]

/**
 * What a level asks for: how many shoppers, the list, the speeds, how long
 * they rush and calm down, how often the sauce comes and how long it stays.
 * The shoppers never run as fast as the burger.
 */
export function levelParams(level: number) {
  const l = Math.max(1, Math.min(level, CATCHER_LAST_LEVEL))
  return {
    shoppers: l >= 9 ? 5 : Math.min(4, 1 + Math.ceil(l / 2)),
    need: [...LISTS[l - 1]],
    shopperSpeed: 3 + 0.18 * Math.min(l, 8) + 0.08 * Math.max(0, l - 8),
    burgerSpeed: 4.4 + 0.1 * l,
    rush: (18 + l * 1.5) * SECOND,
    calm: Math.max(2.5, 7 - l * 0.4) * SECOND,
    sauceEvery: (14 + Math.max(0, l - 8)) * SECOND,
    sauceLife: (10 - 0.25 * Math.max(0, l - 8)) * SECOND,
  }
}

export type CatcherCash = 'coin' | 'note' | 'bundle' | 'card'
/** The money lying about: what each is worth, how long it stays, how often it comes (out of the weights of those allowed), from which level. */
export const CATCHER_CASH: Record<CatcherCash, { points: number; life: number; weight: number; from: number }> = {
  coin: { points: 10, life: 7 * SECOND, weight: 45, from: 1 },
  note: { points: 30, life: 6 * SECOND, weight: 30, from: 1 },
  bundle: { points: 60, life: 5 * SECOND, weight: 18, from: 1 },
  card: { points: 100, life: 4 * SECOND, weight: 7, from: 5 },
}
const nextCashIn = (s: CatcherState) => (9 + Math.floor(s.random() * 7)) * SECOND

export const walkable = (maze: readonly string[], x: number, y: number): boolean => y >= 0 && y < maze.length && x >= 0 && x < maze[0].length && !BLOCKING.has(maze[y][x])

/** Steps from every cell to `target` along the aisles. */
function distances(maze: readonly string[], target: Cell): Map<string, number> {
  const out = new Map<string, number>([[key(target.x, target.y), 0]])
  const queue: Cell[] = [target]
  while (queue.length) {
    const c = queue.shift()!
    const d = out.get(key(c.x, c.y))!
    for (const dir of DIRS) {
      const nx = c.x + DELTA[dir][0], ny = c.y + DELTA[dir][1]
      if (!walkable(maze, nx, ny) || out.has(key(nx, ny))) continue
      out.set(key(nx, ny), d + 1)
      queue.push({ x: nx, y: ny })
    }
  }
  return out
}

/** The floor cell nearest to a point, walking cells being the only ones that count. */
function nearestFloor(maze: readonly string[], x: number, y: number): Cell {
  let best: Cell = { x: 1, y: 1 }, bestD = Infinity
  maze.forEach((row, cy) => { for (let cx = 0; cx < row.length; cx += 1) if (walkable(maze, cx, cy)) { const d = (cx - x) ** 2 + (cy - y) ** 2; if (d < bestD) { bestD = d; best = { x: cx, y: cy } } } })
  return best
}

/** The cells just inside the doors, where shoppers come in. */
function entrancesOf(maze: readonly string[]): Cell[] {
  const out: Cell[] = []
  maze.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) if (row[x] === 'D') for (const dir of DIRS) { const nx = x + DELTA[dir][0], ny = y + DELTA[dir][1]; if (walkable(maze, nx, ny)) out.push({ x: nx, y: ny }) } })
  return out
}

function startOf(maze: readonly string[]): Cell {
  for (let y = 0; y < maze.length; y += 1) { const x = maze[y].indexOf('B'); if (x >= 0) return { x, y } }
  return nearestFloor(maze, maze[0].length / 2, maze.length / 2)
}

/** A fresh level: the burger at its start, the shoppers waiting at the door, the list's ingredients on the floor. */
export function createCatcher(layout: Layout, level = 1, seed = 1, carry?: { score: number; lives: number }): CatcherState {
  const maze = mazeFor(layout)
  const params = levelParams(level)
  const random = seeded(seed * 7919 + level)
  const start = startOf(maze)
  const roles: Role[] = ['chase', 'ambush', 'patrol', 'wander', 'pincer']
  const entrances = entrancesOf(maze)
  const shoppers: Shopper[] = roles.slice(0, params.shoppers).map((role, i) => ({ ...entrances[i % entrances.length], dir: null, progress: 0, speed: params.shopperSpeed * (role === 'wander' ? 0.85 : 1), role, look: i, stunned: 0, waypoint: 0, inside: false }))
  // the ingredients: on floor cells away from the start and the door, not two side by side
  const fromStart = distances(maze, start)
  const cells: Cell[] = []
  maze.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) if (walkable(maze, x, y) && (fromStart.get(key(x, y)) ?? 0) > 3 && !entrances.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) < 3)) cells.push({ x, y }) })
  const items: CatcherState['items'] = []
  params.need.forEach((count, kind) => {
    for (let n = 0; n < count; n += 1) {
      for (let tries = 0; tries < 200; tries += 1) {
        const c = cells[Math.floor(random() * cells.length)]
        if (items.some((it) => Math.abs(it.x - c.x) + Math.abs(it.y - c.y) < 3)) continue
        items.push({ ...c, kind })
        break
      }
    }
  })
  return {
    layout, maze, level, score: carry?.score ?? 0, lives: carry?.lives ?? 3,
    phase: 'play', phaseTimer: 0,
    burger: { ...start, dir: null, progress: 0, speed: params.burgerSpeed, want: null, face: 'right', start },
    shoppers, entrances, enterTimer: 2 * SECOND,
    items, need: [...params.need], have: [0, 0, 0, 0],
    sauce: null, sauceTimer: 8 * SECOND, spilling: 0, puddles: new Map(), cash: null, cashTimer: 6 * SECOND,
    rush: false, modeTimer: params.calm, steps: 0, random,
  }
}

/** Where a mover is, in cells, between the cell it left and the next. */
export function positionOf(m: Mover): { x: number; y: number } {
  if (!m.dir) return { x: m.x, y: m.y }
  return { x: m.x + DELTA[m.dir][0] * m.progress, y: m.y + DELTA[m.dir][1] * m.progress }
}

const open = (s: CatcherState, x: number, y: number, dir: Direction) => walkable(s.maze, x + DELTA[dir][0], y + DELTA[dir][1])

/** The burger: turns when asked at the middle of a cell, turns back at once, stops against a shelf. */
function stepBurger(s: CatcherState): void {
  const b = s.burger
  if (b.dir && b.want === REVERSE[b.dir] && b.progress > 0) {
    // turning back mid-cell: the next cell becomes the one it is leaving
    b.x += DELTA[b.dir][0]; b.y += DELTA[b.dir][1]
    b.progress = 1 - b.progress
    b.dir = b.want
  }
  if (b.progress === 0) {
    if (b.want && open(s, b.x, b.y, b.want)) b.dir = b.want
    else if (b.dir && !open(s, b.x, b.y, b.dir)) b.dir = null
  }
  if (!b.dir) return
  if (b.dir === 'left') b.face = 'left'
  if (b.dir === 'right') b.face = 'right'
  b.progress += b.speed / SECOND
  if (b.progress >= 1) {
    b.x += DELTA[b.dir][0]; b.y += DELTA[b.dir][1]
    b.progress = 0
    arrive(s)
  }
}

/** The burger has reached a cell: an ingredient, the sauce, a puddle to leave behind. */
function arrive(s: CatcherState): void {
  const b = s.burger
  const found = s.items.findIndex((it) => it.x === b.x && it.y === b.y)
  if (found >= 0) {
    const [it] = s.items.splice(found, 1)
    if (s.have[it.kind] < s.need[it.kind]) s.have[it.kind] += 1
    s.score += 10
    if (s.items.length === 0) { s.phase = 'clear'; s.phaseTimer = 2 * SECOND; s.score += 50 * s.level }
  }
  if (s.sauce && s.sauce.x === b.x && s.sauce.y === b.y) { s.sauce = null; s.spilling = 5 * SECOND; s.score += 5 }
  if (s.cash && s.cash.x === b.x && s.cash.y === b.y) { s.score += CATCHER_CASH[s.cash.kind].points; s.cash = null; s.cashTimer = nextCashIn(s) }
  if (s.spilling > 0) s.puddles.set(key(b.x, b.y), 8 * SECOND)
}

/** Where a shopper heads: the burger, a few cells ahead of it, a round of the aisles, or its corner when calm. */
function targetOf(s: CatcherState, sh: Shopper, corners: Cell[], index: number): Cell | null {
  if (!s.rush) return corners[index % corners.length]
  const b = s.burger
  if (sh.role === 'chase') return { x: b.x, y: b.y }
  if (sh.role === 'ambush') {
    const d = b.dir ? DELTA[b.dir] : [0, 0]
    return nearestFloor(s.maze, b.x + d[0] * 4, b.y + d[1] * 4)
  }
  if (sh.role === 'pincer') {
    // the other side of the burger from the first chaser, so the two close in on it from both ends
    const chaser = s.shoppers.find((o) => o.role === 'chase' && o.inside)
    if (!chaser) return { x: b.x, y: b.y }
    return nearestFloor(s.maze, 2 * b.x - chaser.x, 2 * b.y - chaser.y)
  }
  if (sh.role === 'patrol') {
    const w = corners[sh.waypoint % corners.length]
    if (w.x === sh.x && w.y === sh.y) sh.waypoint += 1
    return corners[sh.waypoint % corners.length]
  }
  return null
}

function stepShopper(s: CatcherState, sh: Shopper, corners: Cell[], index: number): void {
  if (!sh.inside) return
  if (sh.stunned > 0) { sh.stunned -= 1; return }
  if (sh.progress === 0) {
    // choose the way at the middle of a cell: never straight back unless there is no other
    const choices = DIRS.filter((d) => open(s, sh.x, sh.y, d) && d !== (sh.dir ? REVERSE[sh.dir] : null))
    const options = choices.length ? choices : DIRS.filter((d) => open(s, sh.x, sh.y, d))
    const target = targetOf(s, sh, corners, index)
    if (!options.length) return
    if (target) {
      const map = distances(s.maze, target)
      options.sort((a, c) => (map.get(key(sh.x + DELTA[a][0], sh.y + DELTA[a][1])) ?? 999) - (map.get(key(sh.x + DELTA[c][0], sh.y + DELTA[c][1])) ?? 999))
      sh.dir = options[0]
    } else sh.dir = options[Math.floor(s.random() * options.length)]
  }
  if (!sh.dir) return
  sh.progress += sh.speed / SECOND
  if (sh.progress >= 1) {
    sh.x += DELTA[sh.dir][0]; sh.y += DELTA[sh.dir][1]
    sh.progress = 0
    const puddle = key(sh.x, sh.y)
    if (s.puddles.has(puddle)) { s.puddles.delete(puddle); sh.stunned = 3 * SECOND; s.score += 20 }
  }
}

/** The four floor cells nearest the store's corners: where calm shoppers go, and the round the patroller walks. */
function cornersOf(maze: readonly string[]): Cell[] {
  const w = maze[0].length, h = maze.length
  return [nearestFloor(maze, 1, 1), nearestFloor(maze, w - 2, 1), nearestFloor(maze, w - 2, h - 2), nearestFloor(maze, 1, h - 2)]
}

/** Where the money may lie: a floor cell well away from the burger, not on an ingredient, the sauce or at the door. */
function cashSpot(s: CatcherState): Cell | null {
  const far = distances(s.maze, { x: s.burger.x, y: s.burger.y })
  const spots = [...far.entries()].filter(([k, d]) => {
    if (d < 5) return false
    const [x, y] = k.split(',').map(Number)
    return !s.items.some((it) => it.x === x && it.y === y) && !(s.sauce && s.sauce.x === x && s.sauce.y === y) && !s.entrances.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) < 2)
  })
  if (!spots.length) return null
  const [x, y] = spots[Math.floor(s.random() * spots.length)][0].split(',').map(Number)
  return { x, y }
}

function drawCash(s: CatcherState): CatcherCash {
  const allowed = (Object.keys(CATCHER_CASH) as CatcherCash[]).filter((k) => s.level >= CATCHER_CASH[k].from)
  let roll = s.random() * allowed.reduce((sum, k) => sum + CATCHER_CASH[k].weight, 0)
  for (const k of allowed) { roll -= CATCHER_CASH[k].weight; if (roll < 0) return k }
  return allowed[0]
}

/** One sixtieth of a second of the game. `want` is the direction the player asks for, if any. */
export function stepCatcher(s: CatcherState, want?: Direction | null): void {
  s.steps += 1
  if (want) s.burger.want = want
  if (s.phase !== 'play') {
    if (s.phaseTimer > 0) s.phaseTimer -= 1
    // the last level's list filled: once LEVEL CLEAR has shown, the game is won
    if (s.phase === 'clear' && s.phaseTimer === 0 && s.level >= CATCHER_LAST_LEVEL) { s.phase = 'won'; return }
    if (s.phase === 'caught' && s.phaseTimer === 0) {
      if (s.lives <= 0) { s.phase = 'over'; return }
      // back to the start, the shoppers out through the door again
      const b = s.burger
      Object.assign(b, { ...b.start, dir: null, progress: 0, want: null })
      s.shoppers.forEach((sh, i) => Object.assign(sh, { ...s.entrances[i % s.entrances.length], dir: null, progress: 0, inside: false, stunned: 0 }))
      s.enterTimer = 2 * SECOND
      s.phase = 'play'
    }
    return
  }
  const params = levelParams(s.level)
  const corners = cornersOf(s.maze)
  // rush and calm, turn about
  s.modeTimer -= 1
  if (s.modeTimer <= 0) { s.rush = !s.rush; s.modeTimer = s.rush ? params.rush : params.calm; s.shoppers.forEach((sh) => { if (sh.dir && sh.progress === 0) sh.dir = REVERSE[sh.dir] }) }
  // shoppers come in one by one
  s.enterTimer -= 1
  if (s.enterTimer <= 0) { const next = s.shoppers.find((sh) => !sh.inside); if (next) next.inside = true; s.enterTimer = 3 * SECOND }
  // the sauce comes and goes; the trail dries
  if (s.sauce) { s.sauce.timer -= 1; if (s.sauce.timer <= 0) s.sauce = null }
  else if (--s.sauceTimer <= 0) {
    const far = distances(s.maze, { x: s.burger.x, y: s.burger.y })
    const spots = [...far.entries()].filter(([, d]) => d >= 6).map(([k]) => k.split(',').map(Number))
    const spot = spots[Math.floor(s.random() * spots.length)]
    if (spot && !s.items.some((it) => it.x === spot[0] && it.y === spot[1])) s.sauce = { x: spot[0], y: spot[1], timer: params.sauceLife }
    s.sauceTimer = params.sauceEvery
  }
  // money comes and goes
  if (s.cash) { s.cash.timer -= 1; if (s.cash.timer <= 0) { s.cash = null; s.cashTimer = nextCashIn(s) } }
  else if (--s.cashTimer <= 0) {
    const spot = cashSpot(s)
    if (spot) { const kind = drawCash(s); s.cash = { ...spot, kind, timer: CATCHER_CASH[kind].life, life: CATCHER_CASH[kind].life } }
    else s.cashTimer = SECOND
  }
  if (s.spilling > 0) s.spilling -= 1
  for (const [k, t] of s.puddles) { if (t <= 1) s.puddles.delete(k); else s.puddles.set(k, t - 1) }
  stepBurger(s)
  if (s.phase !== 'play') return
  s.shoppers.forEach((sh, i) => stepShopper(s, sh, corners, i))
  // caught: a shopper on its feet within reach of the burger
  const bp = positionOf(s.burger)
  if (s.shoppers.some((sh) => sh.inside && sh.stunned === 0 && Math.hypot(positionOf(sh).x - bp.x, positionOf(sh).y - bp.y) < 0.7)) {
    s.lives -= 1
    s.phase = 'caught'
    s.phaseTimer = Math.round(1.5 * SECOND)
  }
}

/** The next level, carrying the score and the lives (the last one cleared, the game is won instead: see `stepCatcher`). */
export function nextLevel(s: CatcherState, seed: number): CatcherState {
  return createCatcher(s.layout, s.level + 1, seed, { score: s.score, lives: s.lives })
}
