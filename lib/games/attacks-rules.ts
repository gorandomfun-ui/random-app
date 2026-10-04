/**
 * The rules of RANDOM ATTACKS, apart from any screen. Burgers from space
 * come down on Mars in rows — sliders on top, cheeseburgers, doubles below —
 * sweeping from side to side, a step lower at each wall, quicker as their
 * numbers fall, and throw what they hold: onion rings, tomato slices, bacon,
 * pickles. The cook at the bottom slides left and right and squirts ketchup
 * up by himself, one squirt at a time; four stacks of plates shelter him and
 * chip where they are hit. Now and then the golden burger crosses the top:
 * shot down, it drops a bonus to catch — mustard, two squirts at a time, or
 * the blowtorch, a flame that burns through everything in its column. Three
 * lives; a burger that reaches the cook's height ends the game. Every burger
 * down, the level is cleared, and the next comes lower and faster; level 16
 * cleared, the game is won.
 *
 * The board is the play screen under its bar: 448 × 320 wide, 320 × 448
 * tall. Everything moves sixty times a second; the same seed and the same
 * moves play the same game.
 */

import { seeded } from './engine'
import type { Bite } from './attacks-sprites'

export type AttacksLayout = 'landscape' | 'portrait'
const SECOND = 60

/** The last level: cleared, the game is won. */
export const ATTACKS_LAST_LEVEL = 16
export const ATTACKS_MAX_LIVES = 5

export type AttacksThrow = 0 | 1 | 2 | 3
export type AttacksBonus = 'mustard' | 'torch'
/** What can be heard: a squirt, a burger down, a plate chipped, the golden one down, a bonus caught, the cook hit, a level, the end. */
export type AttacksSound = 'squirt' | 'pop' | 'clink' | 'gold' | 'power' | 'hurt' | 'level' | 'crash'

/** Each row's burger: its points, the half width and half height it is hit in, from the middle of its cell. */
export const ATTACKS_KINDS = [
  { points: 30, hw: 8, hh: 6, dy: 7 },
  { points: 20, hw: 11, hh: 7, dy: 8 },
  { points: 20, hw: 11, hh: 7, dy: 8 },
  { points: 10, hw: 13, hh: 9, dy: 9 },
  { points: 10, hw: 13, hh: 9, dy: 9 },
] as const

/** Where things are on each board: the formation's grid, the plates, the cook. */
export const ATTACKS_BOARD: Record<AttacksLayout, { width: number; height: number; cols: number; gapX: number; gapY: number; top: number; stacks: number[]; plate: number; drop: number }> = {
  landscape: { width: 448, height: 320, cols: 8, gapX: 46, gapY: 28, top: 16, stacks: [86, 178, 270, 362], plate: 34, drop: 10 },
  portrait: { width: 320, height: 448, cols: 6, gapX: 44, gapY: 32, top: 40, stacks: [50, 123, 197, 270], plate: 30, drop: 10 },
}
/** A stack of plates: 5 plates, 29 pixels high (`platesHeight(5)`), standing 2 pixels under the board's horizon. */
const PLATES_HIGH = 29
const COOK_HALF = 9, COOK_HIGH = 34
/** The golden burger's height: the middle of its sprite, drawn four pixels under the bar. */
export const GOLD_Y = 17

export type AttacksState = {
  layout: AttacksLayout
  width: number
  height: number
  level: number
  score: number
  lives: number
  phase: 'play' | 'over' | 'won'
  /** One level only, as in the Random flow: cleared, the round ends there. */
  single: boolean
  cook: { x: number; hurt: number }
  /** The direction held: -1 left, 1 right, 0 none. */
  move: -1 | 0 | 1
  shots: Array<{ x: number; y: number; torch: boolean }>
  fireWait: number
  /** The formation: column 0's middle, the top row's middle, which way it goes, steps to its next move, its sprites' frame. */
  formation: { x: number; y: number; dir: 1 | -1; wait: number; frame: 0 | 1 }
  burgers: Array<{ col: number; row: number; alive: boolean }>
  throws: Array<{ x: number; y: number; kind: AttacksThrow; vy: number }>
  throwWait: number
  plates: Array<{ x: number; top: number; bites: Bite[] }>
  gold: { x: number; dir: 1 | -1 } | null
  goldWait: number
  drop: { x: number; y: number; kind: AttacksBonus } | null
  power: { kind: AttacksBonus; left: number } | null
  /** What was just hit, for the screen to show: a burger, the golden one, a plate. */
  splats: Array<{ x: number; y: number; t: number; kind: 'burger' | 'gold' | 'plate' }>
  levelUp: number
  heard: AttacksSound[]
  steps: number
  passed: number
  random: () => number
}

/** How a level plays: how often the formation moves at the start (steps), how fast and how often it throws, how many throws at once, how low it starts. */
export function attacksParams(level: number) {
  const l = Math.min(level, ATTACKS_LAST_LEVEL)
  return {
    wait: Math.max(14, 30 - l),
    throwSpeed: 1.15 + l * 0.06,
    throwEvery: Math.max(26, 80 - l * 3.2),
    throwsAtOnce: Math.min(5, 2 + Math.floor(l / 4)),
    lower: Math.min(l - 1, 6) * 0.5,
  }
}

const cookTop = (s: AttacksState) => s.height - 4 - COOK_HIGH
// as `drawPlates` lays a stack down: its foot on the ground band's top row plus four, its china 29 pixels high
const plateTop = (s: AttacksState) => s.height - 42 - PLATES_HIGH
const alive = (s: AttacksState) => s.burgers.filter((b) => b.alive)
/** A burger's middle, where it is hit. */
export function burgerAt(s: AttacksState, b: { col: number; row: number }): { x: number; y: number } {
  const k = ATTACKS_KINDS[b.row]
  return { x: s.formation.x + b.col * ATTACKS_BOARD[s.layout].gapX, y: s.formation.y + b.row * ATTACKS_BOARD[s.layout].gapY + k.dy }
}

function freshFormation(s: AttacksState): void {
  const board = ATTACKS_BOARD[s.layout], p = attacksParams(s.level)
  s.formation = { x: Math.round((s.width - (board.cols - 1) * board.gapX) / 2), y: Math.round(board.top + p.lower * board.drop), dir: 1, wait: p.wait, frame: 0 }
  s.burgers = []
  for (let row = 0; row < 5; row += 1) for (let col = 0; col < board.cols; col += 1) s.burgers.push({ col, row, alive: true })
  s.plates = board.stacks.map((x) => ({ x, top: plateTop(s), bites: [] }))
  s.shots = []
  s.throws = []
  s.drop = null
  s.gold = null
  s.goldWait = (14 + Math.floor(s.random() * 8)) * SECOND
  s.throwWait = 90
}

export function createAttacks(layout: AttacksLayout, level = 1, seed = 1, options: { single?: boolean; score?: number; lives?: number } = {}): AttacksState {
  const board = ATTACKS_BOARD[layout]
  const s: AttacksState = {
    layout, width: board.width, height: board.height, level, score: options.score ?? 0, lives: options.lives ?? 3, phase: 'play', single: options.single === true,
    cook: { x: board.width / 2, hurt: 0 }, move: 0, shots: [], fireWait: 30,
    formation: { x: 0, y: 0, dir: 1, wait: 0, frame: 0 }, burgers: [], throws: [], throwWait: 90, plates: [],
    gold: null, goldWait: 0, drop: null, power: null, splats: [], levelUp: 0, heard: [], steps: 0, passed: 0,
    random: seeded(seed * 7919 + level),
  }
  freshFormation(s)
  return s
}

/** Does a point fall on a stack of plates — on the china, not in a bite already taken? */
function onPlates(s: AttacksState, x: number, y: number): AttacksState['plates'][number] | null {
  const half = ATTACKS_BOARD[s.layout].plate / 2
  for (const p of s.plates) {
    if (x < p.x - half || x >= p.x + half || y < p.top || y >= p.top + PLATES_HIGH) continue
    const lx = x - (p.x - half), ly = y - p.top
    if (p.bites.some(([bx, by, br]) => (lx - bx) ** 2 + (ly - by) ** 2 <= br * br)) continue
    return p
  }
  return null
}
function bite(s: AttacksState, p: AttacksState['plates'][number], x: number, y: number, r: number): void {
  const half = ATTACKS_BOARD[s.layout].plate / 2
  p.bites.push([x - (p.x - half), y - p.top, r])
  // a stack bitten too often is past saving: the oldest small bites merge into the picture anyway
  if (p.bites.length > 60) p.bites.splice(0, p.bites.length - 60)
  s.splats.push({ x, y, t: 18, kind: 'plate' })
  s.heard.push('clink')
}

/** One sixtieth of a second of the game, the direction held given (-1 left, 1 right, 0 none). */
export function stepAttacks(s: AttacksState, move: -1 | 0 | 1 = s.move): void {
  s.heard.length = 0
  s.steps += 1
  s.splats = s.splats.filter((p) => --p.t > 0)
  if (s.phase !== 'play') return
  if (s.levelUp > 0) s.levelUp -= 1
  const board = ATTACKS_BOARD[s.layout]
  // the cook slides; while hurt he blinks and cannot be hit
  s.cook.x = Math.max(16, Math.min(s.width - 16, s.cook.x + move * 2.4))
  if (s.cook.hurt > 0) s.cook.hurt -= 1
  if (s.power && --s.power.left <= 0) s.power = null
  // he squirts by himself: one at a time, two with mustard, a flame with the torch
  if (s.fireWait > 0) s.fireWait -= 1
  const torch = s.power?.kind === 'torch', mustard = s.power?.kind === 'mustard'
  if (s.fireWait <= 0 && s.shots.length === 0) {
    const nozzle = s.cook.x + 11, y = cookTop(s) - 4
    if (mustard) s.shots.push({ x: nozzle - 4, y, torch: false }, { x: nozzle + 4, y, torch: false })
    else s.shots.push({ x: nozzle, y, torch })
    s.fireWait = torch ? 5 : mustard ? 7 : 8
    s.heard.push('squirt')
  }
  // the squirts go up: a burger stops one (not the flame), plates stop it and chip
  for (const shot of s.shots) {
    shot.y -= shot.torch ? 11 : 9
    if (!shot.torch) { const p = onPlates(s, Math.round(shot.x), Math.round(shot.y)); if (p) { bite(s, p, shot.x, shot.y, 2.5); shot.y = -100; continue } }
    for (const b of s.burgers) {
      if (!b.alive) continue
      const c = burgerAt(s, b), k = ATTACKS_KINDS[b.row]
      if (Math.abs(shot.x - c.x) > k.hw || Math.abs(shot.y - c.y) > k.hh + 4) continue
      b.alive = false
      s.score += k.points
      s.splats.push({ x: c.x, y: c.y, t: 16, kind: 'burger' })
      s.heard.push('pop')
      // now and then a burger lets a bonus fall
      if (!s.drop && !s.power && s.random() < 1 / 30) s.drop = { x: c.x, y: c.y, kind: s.random() < 0.6 ? 'mustard' : 'torch' }
      if (!shot.torch) { shot.y = -100; break }
    }
    if (s.gold && Math.abs(shot.x - s.gold.x) < 14 && shot.y > 2 && shot.y < GOLD_Y + 12) {
      const points = [100, 150, 200, 300][Math.floor(s.random() * 4)]
      s.score += points
      s.splats.push({ x: s.gold.x, y: GOLD_Y, t: 30, kind: 'gold' })
      s.heard.push('gold')
      if (!s.drop) s.drop = { x: s.gold.x, y: GOLD_Y, kind: s.random() < 0.6 ? 'mustard' : 'torch' }
      s.gold = null
      s.goldWait = (16 + Math.floor(s.random() * 10)) * SECOND
      if (!shot.torch) shot.y = -100
    }
  }
  s.shots = s.shots.filter((shot) => shot.y > -20)
  // the golden burger now and then across the top
  if (s.gold) { s.gold.x += s.gold.dir * 1.3; if (s.gold.x < -30 || s.gold.x > s.width + 30) { s.gold = null; s.goldWait = (16 + Math.floor(s.random() * 10)) * SECOND } }
  else if (--s.goldWait <= 0) { const dir = s.random() < 0.5 ? 1 : -1; s.gold = { x: dir === 1 ? -24 : s.width + 24, dir } }
  // the bonus falls; caught, its power lasts a few seconds
  if (s.drop) {
    s.drop.y += 1.3
    if (Math.abs(s.drop.x - s.cook.x) < COOK_HALF + 6 && s.drop.y > cookTop(s) && s.drop.y < s.height) {
      s.power = { kind: s.drop.kind, left: (s.drop.kind === 'mustard' ? 9 : 5) * SECOND }
      s.heard.push('power')
      s.drop = null
    } else if (s.drop.y > s.height + 10) s.drop = null
  }
  const left = alive(s)
  if (left.length === 0) { clearLevel(s); return }
  // the formation steps sideways, quicker as its numbers fall; at a wall it comes a step lower and turns
  if (--s.formation.wait <= 0) {
    const share = left.length / s.burgers.length
    s.formation.wait = Math.max(3, Math.round(attacksParams(s.level).wait * share ** 0.8))
    s.formation.frame = s.formation.frame === 0 ? 1 : 0
    const step = 4 * s.formation.dir
    const wall = left.some((b) => { const c = burgerAt(s, b), k = ATTACKS_KINDS[b.row]; return c.x + step - k.hw < 8 || c.x + step + k.hw > s.width - 8 })
    if (wall) { s.formation.y += board.drop; s.formation.dir = s.formation.dir === 1 ? -1 : 1 }
    else s.formation.x += step
  }
  // what they eat into: plates under them
  for (const b of left) {
    const c = burgerAt(s, b), k = ATTACKS_KINDS[b.row]
    if (c.y + k.hh >= plateTop(s)) for (const x of [c.x - k.hw, c.x, c.x + k.hw]) { const pl = onPlates(s, Math.round(x), Math.round(c.y + k.hh)); if (pl) pl.bites.push([x - (pl.x - board.plate / 2), c.y + k.hh - pl.top, 6]) }
    // a burger down at the cook's height: the game is lost
    if (c.y + k.hh >= cookTop(s) + 6) { s.lives = 0; s.phase = 'over'; s.heard.push('crash'); return }
  }
  // they throw: the lowest of a column, often the column over the cook
  const p = attacksParams(s.level)
  if (--s.throwWait <= 0) {
    s.throwWait = Math.round(p.throwEvery * (0.7 + s.random() * 0.6))
    if (s.throws.length < p.throwsAtOnce) {
      const cols = [...new Set(left.map((b) => b.col))]
      const near = cols.reduce((best, col) => (Math.abs(s.formation.x + col * board.gapX - s.cook.x) < Math.abs(s.formation.x + best * board.gapX - s.cook.x) ? col : best), cols[0])
      const col = s.random() < 0.45 ? near : cols[Math.floor(s.random() * cols.length)]
      const lowest = left.filter((b) => b.col === col).sort((a, b) => b.row - a.row)[0]
      const c = burgerAt(s, lowest), k = ATTACKS_KINDS[lowest.row]
      s.throws.push({ x: c.x, y: c.y + k.hh, kind: Math.floor(s.random() * 4) as AttacksThrow, vy: p.throwSpeed * (s.height / 320) ** 0.6 })
    }
  }
  // the throws fall: plates stop them and chip; the cook, unless just hurt, loses a life
  for (const t of s.throws) {
    t.y += t.vy
    const plate = onPlates(s, Math.round(t.x), Math.round(t.y))
    if (plate) { bite(s, plate, t.x, t.y, 3.5); t.y = s.height + 100; continue }
    if (s.cook.hurt <= 0 && Math.abs(t.x - s.cook.x) < COOK_HALF + 2 && t.y > cookTop(s) + 4 && t.y < s.height - 2) {
      t.y = s.height + 100
      s.lives -= 1
      s.cook.hurt = Math.round(1.5 * SECOND)
      s.heard.push('hurt')
      if (s.lives <= 0) { s.phase = 'over'; s.heard.push('crash'); return }
    }
  }
  s.throws = s.throws.filter((t) => t.y < s.height + 10)
}

/** Every burger down: points for the level, a life back (in a whole game), the next level lower and faster — or the game won. */
function clearLevel(s: AttacksState): void {
  s.score += 50 * s.level
  s.passed += 1
  if (s.level < ATTACKS_LAST_LEVEL) s.heard.push('level')
  if (s.level >= ATTACKS_LAST_LEVEL || s.single) { s.phase = 'won'; return }
  s.level += 1
  s.lives = Math.min(ATTACKS_MAX_LIVES, s.lives + 1)
  s.power = null
  s.levelUp = Math.round(1.6 * SECOND)
  freshFormation(s)
}
