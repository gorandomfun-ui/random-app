/**
 * The diner RANDOM EATER plays in, as data: its furniture in islands and
 * its sixteen levels, the cells they take, and where food may appear. Used
 * by the rules and by the screens alike.
 */

import type { Direction } from './sprites'

export type Floor = 'plain' | 'checker'
export type Layout = 'landscape' | 'portrait'

/** A piece of the diner's furniture seen from above: where it stands, the cells it covers, which way a chair's back faces. */
export type Furniture = { kind: 'chair' | 'table' | 'stool' | 'booth' | 'counter'; x: number; y: number; w: number; h: number; back?: Direction }

const chair = (x: number, y: number, back: Direction): Furniture => ({ kind: 'chair', x, y, w: 1, h: 1, back })
const stool = (x: number, y: number): Furniture => ({ kind: 'stool', x, y, w: 1, h: 1 })

/** An island of furniture: pieces packed together, never a one-cell gap between them. */
export type Island = readonly Furniture[]
/** Two chairs back to back, side by side or one above the other. */
const pairAcross = (x: number, y: number): Island => [chair(x, y, 'right'), chair(x + 1, y, 'left')]
const pairDown = (x: number, y: number): Island => [chair(x, y, 'down'), chair(x, y + 1, 'up')]
/** A round table with two chairs either side, four cells by two. */
const tableSet = (x: number, y: number): Island => [chair(x, y, 'left'), chair(x, y + 1, 'left'), { kind: 'table', x: x + 1, y, w: 2, h: 2 }, chair(x + 3, y, 'right'), chair(x + 3, y + 1, 'right')]
/** The counter, standing free, its stools along one side, five cells by two. */
const counterIsland = (x: number, y: number): Island => [{ kind: 'counter', x, y, w: 5, h: 1 }, stool(x, y + 1), stool(x + 1, y + 1), stool(x + 2, y + 1), stool(x + 3, y + 1), stool(x + 4, y + 1)]
const booth = (x: number, y: number): Island => [{ kind: 'booth', x, y, w: 3, h: 3 }]

const CHAIRS_A = [pairAcross(4, 4), pairDown(22, 4), pairAcross(20, 15)]
const CHAIRS_B = [pairDown(4, 14), pairAcross(16, 3), pairAcross(14, 16)]
const LEVEL_8: readonly Island[] = [...CHAIRS_A, ...CHAIRS_B, tableSet(19, 9), tableSet(3, 7), counterIsland(8, 3), booth(8, 14)]

/**
 * From level 9 the dinner rush: the room set out in a grid of sixteen
 * places, four by four, two clear cells between them every way. A table
 * takes a place, or two pairs of chairs do; the room fills place by place,
 * and the places still empty are where the burgers can land in the middle.
 */
const PLACE_X = [3, 9, 15, 21], PLACE_Y = [3, 7, 11, 15]
const tableAt = (c: number, r: number): Island => tableSet(PLACE_X[c], PLACE_Y[r])
const chairsAt = (c: number, r: number): Island[] => [pairDown(PLACE_X[c], PLACE_Y[r]), pairDown(PLACE_X[c] + 3, PLACE_Y[r])]
const RUSH: readonly Island[] = [[0, 0], [2, 0], [1, 1], [3, 1], [0, 2], [2, 2], [1, 3], [3, 3]].map(([c, r]) => tableAt(c, r))
const rush = (tables: Array<[number, number]>, chairs: Array<[number, number]> = []): readonly Island[] => [...RUSH, ...tables.map(([c, r]) => tableAt(c, r)), ...chairs.flatMap(([c, r]) => chairsAt(c, r))]
const FULL: Array<[number, number]> = [[3, 0], [0, 3], [2, 1], [1, 2]]

/**
 * The sixteen levels of RANDOM EATER: the floor black to begin with, then a
 * light checker of black and dark grey; the diner filling up in islands —
 * chairs in pairs, tables with their chairs, the counter with its stools, a
 * booth — then from level 9 the dinner rush, a grid of tables filling up.
 * Each island stays two clear cells from the next and from the walls, so
 * there is always room to pass and to turn round: harder, never impossible.
 * Cells in the wide board's grid; the tall board turns them over.
 */
export const EATER_LEVELS: ReadonlyArray<{ floor: Floor; islands: readonly Island[] }> = [
  { floor: 'plain', islands: [] },
  { floor: 'plain', islands: [] },
  { floor: 'checker', islands: CHAIRS_A },
  { floor: 'checker', islands: [...CHAIRS_A, ...CHAIRS_B] },
  { floor: 'checker', islands: [...CHAIRS_A, ...CHAIRS_B, tableSet(19, 9)] },
  { floor: 'checker', islands: [...CHAIRS_A, ...CHAIRS_B, tableSet(19, 9), tableSet(3, 7)] },
  { floor: 'checker', islands: [...CHAIRS_A, ...CHAIRS_B, tableSet(19, 9), tableSet(3, 7), counterIsland(8, 3)] },
  { floor: 'checker', islands: LEVEL_8 },
  { floor: 'checker', islands: rush([]) },
  { floor: 'checker', islands: rush(FULL.slice(0, 1)) },
  { floor: 'checker', islands: rush(FULL.slice(0, 2)) },
  { floor: 'checker', islands: rush(FULL.slice(0, 3)) },
  { floor: 'checker', islands: rush(FULL) },
  { floor: 'checker', islands: rush(FULL, [[1, 0]]) },
  { floor: 'checker', islands: rush(FULL, [[1, 0], [2, 3]]) },
  { floor: 'checker', islands: rush(FULL, [[1, 0], [2, 3], [0, 1]]) },
]

/** Every cell the furniture of a level takes, for a layout. */
export function obstacleCells(layout: Layout, level: number): Set<string> {
  const out = new Set<string>()
  for (const island of EATER_LEVELS[(level - 1) % EATER_LEVELS.length].islands) for (const f of island) for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) out.add(layout === 'portrait' ? `${y},${x}` : `${x},${y}`)
  return out
}

/** Where a burger or the milkshake may appear: a free cell with nothing of the furniture round it. */
export function openCell(layout: Layout, level: number, x: number, y: number): boolean {
  const blocked = obstacleCells(layout, level)
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (blocked.has(`${x + dx},${y + dy}`)) return false
  return true
}

