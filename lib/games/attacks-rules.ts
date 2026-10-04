/**
 * The rules of RANDOM ATTACKS, apart from any screen. Burgers from space
 * come down on Mars in formation — sliders on top, cheeseburgers, doubles
 * below — sweeping from side to side, a step lower at each wall, quicker as
 * their numbers fall, and throw what they hold: onion rings, tomato slices,
 * bacon, pickles. The cook at the bottom slides left and right and squirts
 * ketchup up when the player fires: one squirt in the air at a time. Four
 * stacks of plates shelter him and chip where they are hit. Now and then
 * the golden burger crosses the top: shot down, it drops a bonus to catch —
 * mustard, two squirts at a time, or the blowtorch, a flame that burns
 * through everything in its column. Hits in a row, without a squirt lost,
 * raise a multiplier up to ×4. Three lives; a burger that reaches the
 * cook's height ends the game.
 *
 * Each level brings something (`ATTACKS_PLAN`): a new shape of formation,
 * pickles that zigzag, divers that leave the formation and swoop on the
 * cook, burgers wrapped in foil (two hits), chilies that fall fast,
 * splitters that burst into two sliders, and every fourth level a boss —
 * BIG BUN, DOUBLE DECKER, CHEESE QUAKE, and the MEGA BURGER at the
 * sixteenth. Level 16 cleared, the game is won.
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

/** What falls: an onion ring, a tomato slice, bacon, a pickle (the four the burgers throw); a chili (fast); a drop of cheese (CHEESE QUAKE's rain). */
export type AttacksThrow = 0 | 1 | 2 | 3 | 4 | 5
export const CHILI: AttacksThrow = 4
export const CHEESE: AttacksThrow = 5
export type AttacksBonus = 'mustard' | 'torch'
/** What can be heard: a squirt, a burger down, a plate chipped, the golden one down, a bonus caught, the cook hit, a level, the end; foil torn, divers leaving, a boss hit, a boss down. */
export type AttacksSound = 'squirt' | 'pop' | 'clink' | 'gold' | 'power' | 'hurt' | 'level' | 'crash' | 'rip' | 'whoosh' | 'thud' | 'boom'

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

export type AttacksBossKind = 1 | 2 | 3 | 4
/** The four bosses: their names, the half width and half height they are hit in, how many hits they take, their points. */
export const ATTACKS_BOSSES: Record<AttacksBossKind, { name: string; hw: number; hh: number; hp: number; points: number }> = {
  1: { name: 'BIG BUN', hw: 33, hh: 17, hp: 24, points: 500 },
  2: { name: 'DOUBLE DECKER', hw: 33, hh: 25, hp: 32, points: 1000 },
  3: { name: 'CHEESE QUAKE', hw: 40, hh: 18, hp: 40, points: 1500 },
  4: { name: 'MEGA BURGER', hw: 52, hh: 27, hp: 60, points: 3000 },
}

/**
 * A level: its formation row by row, wide (eight columns) and tall (six) —
 * '#' a burger, '.' none; the rows wrapped in foil; how often divers leave
 * (seconds) and how many together; whether pickles zigzag; the share of
 * chilies among the throws; the rows that split in two; its boss; and what
 * it brings, said as it begins.
 */
export type AttacksLevelPlan = {
  wide: readonly string[]
  tall: readonly string[]
  foil: readonly number[]
  divers: { every: number; group: number } | null
  zigzag: boolean
  chili: number
  split: readonly number[]
  boss: AttacksBossKind | null
  news: string | null
}

const BLOCK = { wide: ['########', '########', '########', '########', '########'], tall: ['######', '######', '######', '######', '######'] }
const WEDGE = { wide: ['########', '########', '.######.', '..####..', '...##...'], tall: ['######', '######', '.####.', '.####.', '..##..'] }
const CHECKER = { wide: ['#.#.#.#.', '.#.#.#.#', '#.#.#.#.', '.#.#.#.#', '#.#.#.#.'], tall: ['#.#.#.', '.#.#.#', '#.#.#.', '.#.#.#', '#.#.#.'] }
const DIAMOND = { wide: ['..####..', '.######.', '########', '.######.', '..####..'], tall: ['..##..', '.####.', '######', '.####.', '..##..'] }
const TWINS = { wide: ['###..###', '###..###', '###..###', '###..###', '###..###'], tall: ['##..##', '##..##', '##..##', '##..##', '##..##'] }
const CHEVRON = { wide: ['...##...', '..####..', '.######.', '###..###', '##....##'], tall: ['..##..', '.####.', '######', '##..##', '#....#'] }
const CROSS = { wide: ['##....##', '.##..##.', '..####..', '.##..##.', '##....##'], tall: ['#....#', '##..##', '.####.', '##..##', '#....#'] }
const BRICKS = { wide: ['#.##.##.', '########', '.##.##.#', '########', '#.##.##.'], tall: ['#.##.#', '######', '.####.', '######', '#.##.#'] }
const WINDOWS = { wide: ['########', '#.#..#.#', '########', '#.#..#.#', '########'], tall: ['######', '#.##.#', '######', '#.##.#', '######'] }
const FORT = { wide: ['########', '########', '##.##.##', '########', '########'], tall: ['######', '######', '#.##.#', '######', '######'] }
const NONE = { wide: [], tall: [] }

const plan = (shape: { wide: readonly string[]; tall: readonly string[] }, more: Partial<AttacksLevelPlan> = {}): AttacksLevelPlan => ({
  ...shape, foil: [], divers: null, zigzag: false, chili: 0, split: [], boss: null, news: null, ...more,
})

/** The sixteen levels, from the first (index 0) to the last. */
export const ATTACKS_PLAN: readonly AttacksLevelPlan[] = [
  plan(BLOCK),
  plan(WEDGE, { zigzag: true, news: 'ZIGZAG PICKLES' }),
  plan(CHECKER, { zigzag: true, divers: { every: 7, group: 1 }, news: 'DIVERS!' }),
  plan(NONE, { boss: 1, news: 'BIG BUN' }),
  plan(DIAMOND, { zigzag: true, foil: [0], divers: { every: 7, group: 1 }, news: 'FOIL BURGERS: 2 HITS' }),
  plan(TWINS, { zigzag: true, foil: [0], divers: { every: 8, group: 2 }, news: 'DIVERS IN PAIRS' }),
  plan(CHEVRON, { zigzag: true, foil: [0], divers: { every: 7, group: 1 }, chili: 0.25, news: 'CHILI RAIN' }),
  plan(NONE, { boss: 2, news: 'DOUBLE DECKER' }),
  plan(CROSS, { zigzag: true, foil: [0], divers: { every: 7, group: 2 }, chili: 0.25, split: [3, 4], news: 'SPLITTERS' }),
  plan(BRICKS, { zigzag: true, foil: [0, 1], divers: { every: 7, group: 2 }, chili: 0.3, split: [4], news: 'DOUBLE FOIL' }),
  plan(WINDOWS, { zigzag: true, foil: [0], divers: { every: 8, group: 3 }, chili: 0.3, split: [3, 4], news: 'DIVERS IN THREES' }),
  plan(NONE, { boss: 3, news: 'CHEESE QUAKE' }),
  plan(BLOCK, { zigzag: true, foil: [0, 1], divers: { every: 7, group: 3 }, chili: 0.3, split: [3, 4], news: 'MARS STORM' }),
  plan(FORT, { zigzag: true, foil: [0, 1, 2], divers: { every: 7, group: 3 }, chili: 0.35, split: [3, 4], news: 'THE FORT' }),
  plan(BLOCK, { zigzag: true, foil: [0, 1, 2], divers: { every: 7, group: 3 }, chili: 0.35, split: [3, 4], news: 'LAST WAVE' }),
  plan(NONE, { boss: 4, news: 'MEGA BURGER' }),
]
export const levelPlan = (level: number): AttacksLevelPlan => ATTACKS_PLAN[Math.max(1, Math.min(ATTACKS_LAST_LEVEL, level)) - 1]

/** A burger off on its own: diving at the cook, then flying back to its place from the top (`back`). */
export type AttacksDive = { x: number; y: number; vx: number; vy: number; aim: number; back: boolean; threw: boolean }
export type AttacksBurger = { col: number; row: number; alive: boolean; foil: number; dive: AttacksDive | null }
export type AttacksBoss = {
  kind: AttacksBossKind; x: number; y: number; hp: number; t: number
  /** Steps of the white flash of a hit; steps to its next attack; which attack comes next; steps left of its fall once beaten (0 while it fights). */
  flash: number; next: number; turn: number; dying: number
  /** The bonuses it has let fall, one at each quarter of its strength lost. */
  drops: number
}

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
  /** Hits in a row without a squirt lost; the multiplier comes from it. Steps left of the multiplier's flourish when it rises. */
  chain: number
  chainUp: number
  /** The formation: column 0's middle, the top row's middle, which way it goes, steps to its next move, its sprites' frame. */
  formation: { x: number; y: number; dir: 1 | -1; wait: number; frame: 0 | 1 }
  burgers: AttacksBurger[]
  /** Steps to the next divers. */
  diveWait: number
  /** Sliders loose: born of a splitter, bursting out to both sides, or of a boss's hatch, drifting toward the cook (`home`); they fall and are gone. */
  loose: Array<{ x: number; y: number; vx: number; vy: number; home: number }>
  throws: Array<{ x: number; y: number; kind: AttacksThrow; vy: number; vx: number; zig: number; t: number }>
  throwWait: number
  plates: Array<{ x: number; top: number; bites: Bite[] }>
  gold: { x: number; dir: 1 | -1 } | null
  goldWait: number
  boss: AttacksBoss | null
  drop: { x: number; y: number; kind: AttacksBonus } | null
  power: { kind: AttacksBonus; left: number } | null
  /** What was just hit, for the screen to show: a burger, the golden one, a plate, foil torn, a boss hit or blowing up. */
  splats: Array<{ x: number; y: number; t: number; kind: 'burger' | 'gold' | 'plate' | 'foil' | 'boss' | 'boom' }>
  /** Steps left of the level's announcement (LEVEL, what it brings); for its first half, the burgers hold still. */
  banner: number
  heard: AttacksSound[]
  steps: number
  passed: number
  random: () => number
}

/** How a level plays: how often the formation moves at the start (steps), how fast and how often it throws, how many throws at once, how low it starts, how fast a diver comes down. */
export function attacksParams(level: number) {
  const l = Math.min(level, ATTACKS_LAST_LEVEL)
  return {
    wait: Math.max(14, 30 - l),
    throwSpeed: 1.15 + l * 0.055,
    throwEvery: Math.max(30, 80 - l * 3),
    throwsAtOnce: Math.min(5, 2 + Math.floor(l / 5)),
    lower: Math.min(l - 1, 6) * 0.5,
    dive: 2 + l * 0.04,
  }
}

/** The multiplier the hits in a row give: ×1, ×2 from 6, ×3 from 14, ×4 from 24. */
export const multiplier = (chain: number): number => (chain >= 24 ? 4 : chain >= 14 ? 3 : chain >= 6 ? 2 : 1)

/** Where the cook's head is: what falls lower than this, by his side, hits him. */
export const attacksCookTop = (s: { height: number }): number => s.height - 4 - COOK_HIGH
const cookTop = attacksCookTop
// as `drawPlates` lays a stack down: its foot on the ground band's top row plus four, its china 29 pixels high
const plateTop = (s: AttacksState) => s.height - 42 - PLATES_HIGH
const alive = (s: AttacksState) => s.burgers.filter((b) => b.alive)
/** A burger's middle in its formation, where it is hit. */
export function burgerAt(s: AttacksState, b: { col: number; row: number }): { x: number; y: number } {
  const k = ATTACKS_KINDS[b.row]
  return { x: s.formation.x + b.col * ATTACKS_BOARD[s.layout].gapX, y: s.formation.y + b.row * ATTACKS_BOARD[s.layout].gapY + k.dy }
}
/** Where a burger is: in its formation, or off diving. */
export const burgerSpot = (s: AttacksState, b: AttacksBurger): { x: number; y: number } => (b.dive ? { x: b.dive.x, y: b.dive.y } : burgerAt(s, b))
/** The boss's middle at rest: high on the board, a little lower on a tall one. */
const bossHome = (s: AttacksState) => (s.layout === 'landscape' ? 70 : 104)

function freshLevel(s: AttacksState): void {
  const board = ATTACKS_BOARD[s.layout], p = attacksParams(s.level), lp = levelPlan(s.level)
  const rows = s.layout === 'landscape' ? lp.wide : lp.tall
  s.formation = { x: Math.round((s.width - (board.cols - 1) * board.gapX) / 2), y: Math.round(board.top + p.lower * board.drop), dir: 1, wait: p.wait, frame: 0 }
  s.burgers = []
  rows.forEach((line, row) => { for (let col = 0; col < board.cols; col += 1) if (line[col] === '#') s.burgers.push({ col, row, alive: true, foil: lp.foil.includes(row) ? 1 : 0, dive: null }) })
  s.boss = lp.boss ? { kind: lp.boss, x: s.width / 2, y: -40, hp: ATTACKS_BOSSES[lp.boss].hp, t: 0, flash: 0, next: 2 * SECOND, turn: 0, dying: 0, drops: 0 } : null
  s.plates = board.stacks.map((x) => ({ x, top: plateTop(s), bites: [] }))
  s.shots = []
  s.throws = []
  s.loose = []
  s.drop = null
  s.gold = null
  s.goldWait = (14 + Math.floor(s.random() * 8)) * SECOND
  s.throwWait = 90
  s.diveWait = (lp.divers?.every ?? 0) * SECOND
  s.banner = Math.round(2.4 * SECOND)
}

export function createAttacks(layout: AttacksLayout, level = 1, seed = 1, options: { single?: boolean; score?: number; lives?: number } = {}): AttacksState {
  const board = ATTACKS_BOARD[layout]
  const s: AttacksState = {
    layout, width: board.width, height: board.height, level, score: options.score ?? 0, lives: options.lives ?? 3, phase: 'play', single: options.single === true,
    cook: { x: board.width / 2, hurt: 0 }, move: 0, shots: [], fireWait: 0, chain: 0, chainUp: 0,
    formation: { x: 0, y: 0, dir: 1, wait: 0, frame: 0 }, burgers: [], diveWait: 0, loose: [], throws: [], throwWait: 90, plates: [],
    gold: null, goldWait: 0, boss: null, drop: null, power: null, splats: [], banner: 0, heard: [], steps: 0, passed: 0,
    random: seeded(seed * 7919 + level),
  }
  freshLevel(s)
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
function bite(s: AttacksState, p: AttacksState['plates'][number], x: number, y: number, r: number, loud = true): void {
  const half = ATTACKS_BOARD[s.layout].plate / 2
  p.bites.push([x - (p.x - half), y - p.top, r])
  // a stack bitten too often is past saving: the oldest small bites merge into the picture anyway
  if (p.bites.length > 60) p.bites.splice(0, p.bites.length - 60)
  s.splats.push({ x, y, t: 18, kind: 'plate' })
  if (loud) s.heard.push('clink')
}

/** A hit that counts: the chain grows, the points come multiplied. */
function scored(s: AttacksState, points: number): void {
  const before = multiplier(s.chain)
  s.chain += 1
  if (multiplier(s.chain) > before) s.chainUp = 50
  s.score += points * multiplier(s.chain)
}
/** The cook hit: a life gone, the chain broken, a moment of blinking — or the game over. True when the game is over. */
function hurt(s: AttacksState): boolean {
  s.lives -= 1
  s.chain = 0
  s.cook.hurt = Math.round(1.5 * SECOND)
  s.heard.push('hurt')
  if (s.lives <= 0) { s.phase = 'over'; s.heard.push('crash'); return true }
  return false
}
/** Does something at (`x`, `y`) touch the cook — beside him, between his head and his feet — `reach` pixels wider than him? */
const touchesCook = (s: AttacksState, x: number, y: number, reach: number) => s.cook.hurt <= 0 && Math.abs(x - s.cook.x) < COOK_HALF + reach && y > cookTop(s) + 2 && y < s.height - 2
/** A bonus let fall, unless one is already falling or under way. */
function letFall(s: AttacksState, x: number, y: number): void {
  if (!s.drop && !s.power) s.drop = { x, y, kind: s.random() < 0.6 ? 'mustard' : 'torch' }
}
/** Two sliders loose, from where something burst: out to both sides, or from a boss's hatch, drifting toward the cook. */
function loosen(s: AttacksState, x: number, y: number, hatch = false): void {
  const vx = hatch ? 1.1 : 1.7, home = hatch ? 0.015 : 0
  s.loose.push({ x: x - 4, y, vx: -vx, vy: -0.9, home }, { x: x + 4, y, vx, vy: -0.9, home })
}

/** A throw from (`x`, `y`): `kind`, falling at `vy`, sideways at `vx`; pickles zigzag on the levels that say so. */
function throwFrom(s: AttacksState, x: number, y: number, kind: AttacksThrow, vy: number, vx = 0): void {
  s.throws.push({ x, y, kind, vy, vx, zig: kind === 3 && levelPlan(s.level).zigzag ? 7 : 0, t: 0 })
}
/** Where a throw is now, its zigzag counted. */
export const throwX = (t: AttacksState['throws'][number]): number => t.x + (t.zig ? Math.sin(t.t * 0.11) * t.zig : 0)

/**
 * One sixtieth of a second of the game: the direction held (-1 left, 1
 * right, 0 none) and whether fire is held.
 */
export function stepAttacks(s: AttacksState, move: -1 | 0 | 1 = s.move, fire = false): void {
  s.heard.length = 0
  s.steps += 1
  s.splats = s.splats.filter((p) => --p.t > 0)
  if (s.phase !== 'play') return
  if (s.banner > 0) s.banner -= 1
  if (s.chainUp > 0) s.chainUp -= 1
  const board = ATTACKS_BOARD[s.layout], p = attacksParams(s.level), lp = levelPlan(s.level)
  // the first moments of a level, the burgers hold still while it is announced
  const calm = s.banner > Math.round(1.2 * SECOND)
  // the cook slides; while hurt he blinks and cannot be hit
  s.cook.x = Math.max(16, Math.min(s.width - 16, s.cook.x + move * 2.4))
  if (s.cook.hurt > 0) s.cook.hurt -= 1
  if (s.power && --s.power.left <= 0) s.power = null
  // he squirts when fire is held: one squirt in the air at a time, two side by side with mustard, flames with the torch
  if (s.fireWait > 0) s.fireWait -= 1
  const torch = s.power?.kind === 'torch', mustard = s.power?.kind === 'mustard'
  if (fire && s.fireWait <= 0 && (torch ? s.shots.length < 3 : s.shots.length === 0)) {
    const nozzle = s.cook.x + 11, y = cookTop(s) - 4
    if (mustard) s.shots.push({ x: nozzle - 4, y, torch: false }, { x: nozzle + 4, y, torch: false })
    else s.shots.push({ x: nozzle, y, torch })
    s.fireWait = torch ? 7 : 6
    s.heard.push('squirt')
  }
  stepShots(s)
  if (s.phase !== 'play') return
  // the golden burger now and then across the top (not over a boss)
  if (!s.boss) {
    if (s.gold) { s.gold.x += s.gold.dir * 1.3; if (s.gold.x < -30 || s.gold.x > s.width + 30) { s.gold = null; s.goldWait = (16 + Math.floor(s.random() * 10)) * SECOND } }
    else if (--s.goldWait <= 0) { const dir = s.random() < 0.5 ? 1 : -1; s.gold = { x: dir === 1 ? -24 : s.width + 24, dir } }
  }
  // the bonus falls; caught, its power lasts a few seconds
  if (s.drop) {
    s.drop.y += 1.3
    if (Math.abs(s.drop.x - s.cook.x) < COOK_HALF + 6 && s.drop.y > cookTop(s) && s.drop.y < s.height) {
      s.power = { kind: s.drop.kind, left: (s.drop.kind === 'mustard' ? 9 : 5) * SECOND }
      s.heard.push('power')
      s.drop = null
    } else if (s.drop.y > s.height + 10) s.drop = null
  }
  if (s.boss) { if (stepBoss(s, calm)) return }
  else {
    const left = alive(s)
    if (left.length === 0 && s.loose.length === 0) { clearLevel(s); return }
    if (!calm && stepFormation(s, left)) return
    if (!calm && lp.divers && stepDivers(s, left, lp.divers)) return
    // they throw: the lowest of a column, often the column over the cook
    if (!calm && --s.throwWait <= 0) {
      s.throwWait = Math.round(p.throwEvery * (0.7 + s.random() * 0.6))
      const home = left.filter((b) => b.alive && !b.dive)
      if (s.throws.length < p.throwsAtOnce && home.length) {
        const cols = [...new Set(home.map((b) => b.col))]
        const near = cols.reduce((best, col) => (Math.abs(s.formation.x + col * board.gapX - s.cook.x) < Math.abs(s.formation.x + best * board.gapX - s.cook.x) ? col : best), cols[0])
        const col = s.random() < 0.45 ? near : cols[Math.floor(s.random() * cols.length)]
        const lowest = home.filter((b) => b.col === col).sort((a, b) => b.row - a.row)[0]
        const c = burgerAt(s, lowest), k = ATTACKS_KINDS[lowest.row]
        const chili = s.random() < lp.chili
        const vy = p.throwSpeed * (s.height / 320) ** 0.6
        throwFrom(s, c.x, c.y + k.hh, chili ? CHILI : (Math.floor(s.random() * 4) as AttacksThrow), chili ? vy * 1.6 : vy)
      }
    }
  }
  if (stepLoose(s)) return
  stepThrows(s)
}

/** The squirts go up: a burger stops one (not the flame), plates stop it and chip; one that leaves the board breaks the chain. */
function stepShots(s: AttacksState): void {
  for (const shot of s.shots) {
    shot.y -= shot.torch ? 11 : 9
    if (!shot.torch) { const pl = onPlates(s, Math.round(shot.x), Math.round(shot.y)); if (pl) { bite(s, pl, shot.x, shot.y, 2.5); s.chain = 0; shot.y = -100; continue } }
    if (shotHits(s, shot)) { if (!shot.torch) shot.y = -100; continue }
    if (shot.y < -14 && shot.y > -100 && !shot.torch) { s.chain = 0; shot.y = -100 }
  }
  s.shots = s.shots.filter((shot) => shot.y > -20)
}

/** What a squirt meets on its way up: a burger (in place or diving), a loose slider, the boss, the golden one. True when it stopped there. */
function shotHits(s: AttacksState, shot: AttacksState['shots'][number]): boolean {
  const lp = levelPlan(s.level)
  for (const b of s.burgers) {
    if (!b.alive) continue
    const c = burgerSpot(s, b), k = ATTACKS_KINDS[b.row]
    if (Math.abs(shot.x - c.x) > k.hw || Math.abs(shot.y - c.y) > k.hh + 4) continue
    // foil first: one hit tears it; the flame burns through
    if (b.foil > 0 && !shot.torch) {
      b.foil -= 1
      s.chain += 1
      s.splats.push({ x: c.x, y: c.y, t: 14, kind: 'foil' })
      s.heard.push('rip')
      return true
    }
    b.alive = false
    // a diver is worth twice its row
    scored(s, k.points * (b.dive ? 2 : 1))
    s.splats.push({ x: c.x, y: c.y, t: 16, kind: 'burger' })
    s.heard.push('pop')
    if (lp.split.includes(b.row)) loosen(s, c.x, c.y)
    // now and then a burger lets a bonus fall
    else if (s.random() < 1 / 30) letFall(s, c.x, c.y)
    if (!shot.torch) return true
  }
  for (const l of s.loose) {
    if (l.y > s.height || Math.abs(shot.x - l.x) > 9 || Math.abs(shot.y - l.y) > 9) continue
    s.splats.push({ x: l.x, y: l.y, t: 16, kind: 'burger' })
    l.y = s.height + 100
    scored(s, 10)
    s.heard.push('pop')
    if (!shot.torch) return true
  }
  const boss = s.boss
  if (boss && boss.dying === 0) {
    const kind = ATTACKS_BOSSES[boss.kind]
    if (Math.abs(shot.x - boss.x) < kind.hw && Math.abs(shot.y - boss.y) < kind.hh) {
      boss.hp -= shot.torch ? 2 : 1
      boss.flash = 4
      scored(s, 5)
      s.splats.push({ x: shot.x, y: boss.y + kind.hh - 4, t: 10, kind: 'boss' })
      s.heard.push('thud')
      // a bonus at each quarter of its strength lost
      const lost = Math.floor((4 * (kind.hp - boss.hp)) / kind.hp)
      if (lost > boss.drops && boss.hp > 0) { boss.drops = lost; letFall(s, boss.x, boss.y + kind.hh) }
      if (boss.hp <= 0) { boss.dying = 100; s.throws = []; s.loose = []; s.heard.push('boom') }
      // the flame burns into it and goes no further
      return true
    }
  }
  if (s.gold && Math.abs(shot.x - s.gold.x) < 14 && shot.y > 2 && shot.y < GOLD_Y + 12) {
    const points = [100, 150, 200, 300][Math.floor(s.random() * 4)]
    s.score += points
    s.chain += 1
    s.splats.push({ x: s.gold.x, y: GOLD_Y, t: 30, kind: 'gold' })
    s.heard.push('gold')
    letFall(s, s.gold.x, GOLD_Y)
    s.gold = null
    s.goldWait = (16 + Math.floor(s.random() * 10)) * SECOND
    return !shot.torch
  }
  return false
}

/** The formation steps sideways, quicker as its numbers fall; at a wall it comes a step lower and turns. True when it reached the cook. */
function stepFormation(s: AttacksState, left: AttacksBurger[]): boolean {
  const board = ATTACKS_BOARD[s.layout]
  const home = left.filter((b) => !b.dive)
  // all of them off diving: the formation waits for them
  if (home.length && --s.formation.wait <= 0) {
    const share = left.length / s.burgers.length
    s.formation.wait = Math.max(3, Math.round(attacksParams(s.level).wait * share ** 0.8))
    s.formation.frame = s.formation.frame === 0 ? 1 : 0
    const step = 4 * s.formation.dir
    // the walls count every place in the formation, the divers' too: they must find theirs on the board when they come back
    const wall = left.some((b) => { const c = burgerAt(s, b), k = ATTACKS_KINDS[b.row]; return c.x + step - k.hw < 8 || c.x + step + k.hw > s.width - 8 })
    if (wall) { s.formation.y += board.drop; s.formation.dir = s.formation.dir === 1 ? -1 : 1 }
    else s.formation.x += step
  }
  // what they eat into: plates under them
  for (const b of home) {
    const c = burgerAt(s, b), k = ATTACKS_KINDS[b.row]
    if (c.y + k.hh >= plateTop(s)) for (const x of [c.x - k.hw, c.x, c.x + k.hw]) { const pl = onPlates(s, Math.round(x), Math.round(c.y + k.hh)); if (pl) pl.bites.push([x - (pl.x - board.plate / 2), c.y + k.hh - pl.top, 6]) }
    // a burger down at the cook's height: the game is lost
    if (c.y + k.hh >= cookTop(s) + 6) { s.lives = 0; s.phase = 'over'; s.heard.push('crash'); return true }
  }
  return false
}

/**
 * Divers: every few seconds one, two or three burgers from the bottom of the
 * formation leave it, rise, curve and swoop on where the cook stood, throwing
 * once on the way from level 6; out at the bottom, they come back in from
 * the top and fly to their place. True when the game is over.
 */
function stepDivers(s: AttacksState, left: AttacksBurger[], divers: { every: number; group: number }): boolean {
  const p = attacksParams(s.level)
  if (--s.diveWait <= 0) {
    s.diveWait = Math.round(divers.every * SECOND * (0.8 + s.random() * 0.4))
    // the lowest of each column, from one side
    const home = left.filter((b) => !b.dive)
    const lows = [...new Set(home.map((b) => b.col))].map((col) => home.filter((b) => b.col === col).sort((a, b) => b.row - a.row)[0])
    if (lows.length > divers.group) {
      const fromLeft = s.random() < 0.5
      lows.sort((a, b) => (fromLeft ? a.col - b.col : b.col - a.col))
      const start = Math.floor(s.random() * Math.min(3, lows.length - divers.group + 1))
      lows.slice(start, start + divers.group).forEach((b, i) => {
        const c = burgerAt(s, b)
        b.dive = { x: c.x, y: c.y, vx: fromLeft ? -0.9 : 0.9, vy: -1.3 - i * 0.15, aim: s.cook.x + (i - (divers.group - 1) / 2) * 22, back: false, threw: false }
      })
      s.heard.push('whoosh')
    }
  }
  for (const b of left) {
    const d = b.dive
    if (!d || !b.alive) continue
    if (d.back) {
      // home again: toward its place in the formation, which keeps moving
      const c = burgerAt(s, b), dx = c.x - d.x, dy = c.y - d.y, dist = Math.hypot(dx, dy)
      if (dist < 3) { b.dive = null; continue }
      d.x += (dx / dist) * Math.min(dist, 2.6); d.y += (dy / dist) * Math.min(dist, 2.6)
      continue
    }
    d.vy = Math.min(p.dive, d.vy + 0.06)
    d.vx = Math.max(-1.8, Math.min(1.8, d.vx + Math.sign(d.aim - d.x) * 0.055))
    d.x += d.vx; d.y += d.vy
    if (!d.threw && s.level >= 6 && d.y > s.height * 0.38) { d.threw = true; throwFrom(s, d.x, d.y + 6, Math.floor(s.random() * 4) as AttacksThrow, p.throwSpeed * 1.2, d.vx * 0.4) }
    // through the plates, chipping them
    const pl = onPlates(s, Math.round(d.x), Math.round(d.y + 6))
    if (pl) bite(s, pl, d.x, d.y + 6, 5, false)
    if (touchesCook(s, d.x, d.y + 6, 8)) { b.alive = false; s.splats.push({ x: d.x, y: d.y, t: 16, kind: 'burger' }); if (hurt(s)) return true; continue }
    if (d.y > s.height + 16) { d.back = true; d.y = -24; d.x = burgerAt(s, b).x }
  }
  return false
}

/** The loose sliders fall, through the plates. True when the game is over. */
function stepLoose(s: AttacksState): boolean {
  for (const l of s.loose) {
    if (l.y > s.height + 12) continue
    l.vy = Math.min(2.2, l.vy + 0.05)
    if (l.home) l.vx = Math.max(-1.6, Math.min(1.6, l.vx + Math.sign(s.cook.x - l.x) * l.home))
    l.x += l.vx; l.y += l.vy
    if (l.x < 8 || l.x > s.width - 8) l.vx = -l.vx
    const pl = onPlates(s, Math.round(l.x), Math.round(l.y + 5))
    if (pl) bite(s, pl, l.x, l.y + 5, 4, false)
    if (touchesCook(s, l.x, l.y + 5, 6)) { s.splats.push({ x: l.x, y: cookTop(s), t: 16, kind: 'burger' }); l.y = s.height + 100; if (hurt(s)) return true }
  }
  s.loose = s.loose.filter((l) => l.y < s.height + 12)
  return false
}

/** The throws fall: plates stop them and chip; the cook, unless just hurt, loses a life. */
function stepThrows(s: AttacksState): void {
  for (const t of s.throws) {
    t.t += 1
    t.y += t.vy
    t.x += t.vx
    const x = throwX(t)
    const plate = onPlates(s, Math.round(x), Math.round(t.y))
    if (plate) { bite(s, plate, x, t.y, 3.5); t.y = s.height + 100; continue }
    if (touchesCook(s, x, t.y, 2)) {
      t.y = s.height + 100
      if (hurt(s)) return
    }
  }
  s.throws = s.throws.filter((t) => t.y < s.height + 10 && t.x > -20 && t.x < s.width + 20)
}

/**
 * The boss: it comes down from the sky, sways from side to side over the
 * board — the later ones swoop low now and then — and attacks in turn: a fan
 * of throws, a chili at the cook, sliders from its hatch (DOUBLE DECKER,
 * MEGA BURGER), a curtain of cheese with one gap (CHEESE QUAKE, MEGA
 * BURGER). Beaten, it blows up, and the level is cleared. True when the
 * level ended.
 */
function stepBoss(s: AttacksState, calm: boolean): boolean {
  const boss = s.boss!
  const kind = ATTACKS_BOSSES[boss.kind]
  if (boss.flash > 0) boss.flash -= 1
  if (boss.dying > 0) {
    boss.dying -= 1
    if (boss.dying % 8 === 0) { s.splats.push({ x: boss.x + (s.random() - 0.5) * kind.hw * 2, y: boss.y + (s.random() - 0.5) * kind.hh * 2, t: 22, kind: 'boom' }); s.heard.push('pop') }
    if (boss.dying === 0) { s.score += kind.points; s.boss = null; clearLevel(s); return true }
    return false
  }
  boss.t += 1
  const share = boss.hp / kind.hp
  const angry = boss.kind === 4 && share < 1 / 3
  const home = bossHome(s)
  // in from the top, then the sway
  if (boss.y < home - 1 && boss.t < 3 * SECOND) { boss.y += 1.2; return false }
  const range = s.width / 2 - kind.hw - 10
  const pace = [0, 0.011, 0.013, 0.015, angry ? 0.022 : 0.015][boss.kind]
  boss.x = s.width / 2 + Math.sin(boss.t * pace) * range
  let y = home + Math.sin(boss.t * 0.05) * 3
  // the later ones swoop low every nine seconds, for two and a half, holding their fire meanwhile
  const cycle = boss.t % (9 * SECOND), swoop = 2.5 * SECOND, swooping = boss.kind >= 2 && cycle < swoop
  if (swooping) y += Math.sin((cycle / swoop) * Math.PI) * s.height * 0.26
  boss.y = y
  if (calm || swooping || --boss.next > 0) return false
  const p = attacksParams(s.level)
  const speed = p.throwSpeed * (s.height / 320) ** 0.6
  const foot = boss.y + kind.hh
  const fan = (n: number) => { for (let i = 0; i < n; i += 1) throwFrom(s, boss.x + (i - (n - 1) / 2) * 10, foot, Math.floor(s.random() * 4) as AttacksThrow, speed, (i - (n - 1) / 2) * 0.5) }
  const aimed = () => { const vy = speed * 1.4, steps = Math.max(1, (cookTop(s) - foot) / vy); throwFrom(s, boss.x, foot, CHILI, vy, Math.max(-2.2, Math.min(2.2, (s.cook.x - boss.x) / steps))) }
  const hatch = () => { loosen(s, boss.x, foot, true); s.heard.push('whoosh') }
  const curtain = () => {
    // drops of cheese all across, but for a gap three drops wide
    const gap = 30 + s.random() * (s.width - 60), step = 26
    for (let x = 12; x < s.width - 6; x += step) if (Math.abs(x - gap) > step * 1.7) throwFrom(s, x, -6, CHEESE, speed * 0.75)
  }
  const turns: Record<AttacksBossKind, Array<() => void>> = {
    1: [() => fan(3), aimed, () => fan(3), aimed],
    2: [() => fan(3), hatch, aimed, () => fan(3)],
    3: [curtain, () => fan(3), aimed, () => fan(3)],
    4: share > 2 / 3 ? [() => fan(5), hatch, aimed] : share > 1 / 3 ? [curtain, () => fan(3), aimed, hatch] : [() => fan(5), curtain, hatch, aimed],
  }
  const list = turns[boss.kind]
  const attack = list[boss.turn % list.length]
  attack()
  boss.turn += 1
  // after a curtain, time to find the gap before anything else
  boss.next = Math.round([0, 96, 82, 80, angry ? 58 : 70][boss.kind] * (0.85 + s.random() * 0.3)) + (attack === curtain ? 90 : 0)
  return false
}

/** Every burger down (or the boss): points for the level, a life back (in a whole game), the next level — or the game won. */
function clearLevel(s: AttacksState): void {
  s.score += 50 * s.level
  s.passed += 1
  if (s.level < ATTACKS_LAST_LEVEL) s.heard.push('level')
  if (s.level >= ATTACKS_LAST_LEVEL || s.single) { s.phase = 'won'; return }
  s.level += 1
  s.lives = Math.min(ATTACKS_MAX_LIVES, s.lives + 1)
  s.power = null
  freshLevel(s)
}

/** The most a level can score, at a stretch: every burger at ×4 and diving, two sliders from each, the boss with its hits and its sliders, golden burgers, the level's bonus. */
export function attacksLevelMax(level: number): number {
  const lp = levelPlan(level)
  const burgers = (lp.wide.join('').match(/#/g) ?? []).length
  const boss = lp.boss ? ATTACKS_BOSSES[lp.boss] : null
  return burgers * 30 * 2 * 4 + burgers * 2 * 10 * 4 + (boss ? boss.points + boss.hp * 5 * 4 + 40 * 10 * 4 : 0) + 6 * 300 + 50 * level
}
