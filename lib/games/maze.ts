/**
 * The maze of RANDOM CATCHER, drawn here and nowhere else: a wall `#`, a
 * pellet `.`, an empty cell ` `, the burger's start `B`, the humans' pen
 * `H`, the sauce `S`. Twenty-eight cells by twenty, one screen, no
 * scrolling. Change a character to change the maze.
 */

export const MAZE: readonly string[] = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#S####.#####.##.#####.####S#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.#####.##.#####.######',
  '     #.##          ##.#     ',
  '######.## ###HH### ##.######',
  '      .   #HHHHHH#   .      ',
  '######.## ######## ##.######',
  '     #.##          ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#S...#.......B........#...S#',
  '####.#.##.########.##.#.####',
  '#......##....##....##......#',
  '############################',
]

export const MAZE_WIDTH = 28
export const MAZE_HEIGHT = 20

export type Cell = { x: number; y: number }

export function cellsOf(char: string): Cell[] {
  const cells: Cell[] = []
  MAZE.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) if (row[x] === char) cells.push({ x, y }) })
  return cells
}

export const isWall = (x: number, y: number): boolean => (MAZE[y]?.[x] ?? '#') === '#'

/** Every cell a walker can reach from `start`; the tunnels on row 10 wrap round. */
export function reachable(start: Cell): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y}`])
  const queue: Cell[] = [start]
  while (queue.length) {
    const { x, y } = queue.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = (x + dx + MAZE_WIDTH) % MAZE_WIDTH, ny = y + dy
      if (ny < 0 || ny >= MAZE_HEIGHT || isWall(nx, ny)) continue
      const key = `${nx},${ny}`
      if (!seen.has(key)) { seen.add(key); queue.push({ x: nx, y: ny }) }
    }
  }
  return seen
}
