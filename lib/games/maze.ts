/**
 * The store RANDOM CATCHER plays in, drawn here and nowhere else, seen from
 * above: a real little supermarket, not a maze of corridors. Fridges `F`
 * along the back and the left wall, the store's wall `#`, long gondolas of
 * shelves `=` with aisles between them and a few gaps to cut through,
 * produce tables `T`, a row of checkout counters `K`, the entrance `D` the
 * shoppers come in by. `.` is floor, `B` where the burger starts. No pen in
 * the middle, no tunnel on the sides. Twenty-eight cells by twenty; change a
 * character to change the store.
 */

export const MAZE: readonly string[] = [
  '#FFFFFFFFFFFFFFFFFFFFFFFFFF#',
  'F..........................#',
  'F.==.==.==.==..==.==.==.==.#',
  'F.==.==.==.==..==.==.==.==.#',
  'F.==.==.==.==..==.==.==.==.#',
  'F.==....==.==..==.==.==.==.#',
  'F.==.==.==.==..==....==.==.#',
  'F.==.==.==.==..==.==.==.==.#',
  'F.==.==....==..==.==.==....#',
  'F.==.==.==.==..==.==.==.==.#',
  'F............B.............#',
  'F.TT..TT..======..======...#',
  'F.TT..TT..======..======...#',
  'F..........................#',
  '#..KK..KK..KK....KK..KK....#',
  '#..KK..KK..KK....KK..KK....#',
  '#..KK..KK..KK....KK..KK....#',
  '#..........................#',
  '#..........................#',
  '############DDDD############',
]

export const MAZE_WIDTH = 28
export const MAZE_HEIGHT = 20

/** Cells no one walks through. */
export const BLOCKING = new Set(['#', 'F', '=', 'K', 'T', 'D'])

export type Cell = { x: number; y: number }

/**
 * The same store for a tall screen: turned over its diagonal, rows become
 * columns, so it is twenty wide and twenty-eight high and plays the same.
 */
export const MAZE_TALL: readonly string[] = Array.from({ length: MAZE_WIDTH }, (_, x) => MAZE.map((row) => row[x]).join(''))

/** The store a layout plays in. */
export function mazeFor(layout: 'landscape' | 'portrait'): readonly string[] {
  return layout === 'portrait' ? MAZE_TALL : MAZE
}

export function cellsOf(char: string, maze: readonly string[] = MAZE): Cell[] {
  const cells: Cell[] = []
  maze.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) if (row[x] === char) cells.push({ x, y }) })
  return cells
}

export const isWall = (x: number, y: number, maze: readonly string[] = MAZE): boolean => BLOCKING.has(maze[y]?.[x] ?? '#')

/** Every floor cell a walker can reach from `start`. No wrapping: the store is closed but for its door. */
export function reachable(start: Cell, maze: readonly string[] = MAZE): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y}`])
  const queue: Cell[] = [start]
  while (queue.length) {
    const { x, y } = queue.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy
      if (isWall(nx, ny, maze)) continue
      const key = `${nx},${ny}`
      if (!seen.has(key)) { seen.add(key); queue.push({ x: nx, y: ny }) }
    }
  }
  return seen
}
