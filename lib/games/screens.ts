/**
 * The screens of both games, wide or tall: the title on its night street,
 * a moment of play, GAME OVER. RANDOM CATCHER opens on the front of a
 * little convenience store and plays in its aisles seen from above;
 * RANDOM EATER opens on a diner, its neon sign the game's own mark, and
 * plays on the diner's floor. The characters on the titles are the very
 * sprites of play. Everything takes the theme's accent.
 */

import { drawLogo, LOGO_WIDTH } from './logo'
import { catcherLogoSize, drawCatcherLogo, drawEaterLogo, eaterLogoSize } from './logos'
import { mazeFor, MAZE_HEIGHT, MAZE_WIDTH, type Cell } from './maze'
import { dim, mix, PixelBuffer } from './pixels'
import {
  bin, car, city, cloud, drawDiner, drawStore, hedge, lamp, moon, NIGHTS, palm, railing, signBoard, sky, stars, street, tree, vending, type Night,
} from './scenes'
import {
  BURGER, BURGER_PALETTE, CELL, CRAWL_ARMS, CRAWL_HEAD, CRAWL_LEGS, eaterPalette, facing, HUMAN, humanPalette, ITEM_PALETTE,
  MINI_BURGER, MINI_BURGER_PALETTE, ONION, PELLET, PELLET_PALETTE, PICKLE, SAUCE, SAUCE_PALETTE, TOMATO, torsoLook, tubePiece, type Direction,
} from './sprites'
import { arcadeText, button, CREAM, dpad, hud, HUD_HEIGHT, infoLine, INK, pressStart } from './ui'

export type Game = 'catcher' | 'eater'
export type Layout = 'landscape' | 'portrait'
export type Floor = 'plain' | 'tiles'
export const GAME_NAMES: Record<Game, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER' }
export const LAYOUTS: readonly Layout[] = ['landscape', 'portrait']

/** The title and GAME OVER are a scene the size of a screen, sixteen by nine or nine by sixteen. */
export const SCENE_SIZE: Record<Layout, { width: number; height: number }> = { landscape: { width: 384, height: 216 }, portrait: { width: 216, height: 384 } }
/** Under the board on a tall screen, the room for the cross of arrows. */
export const DPAD_HEIGHT = 96

/** The board in cells: wider than high on a wide screen, the other way round on a tall one. */
export function boardSize(layout: Layout): { cols: number; rows: number } {
  return layout === 'landscape' ? { cols: MAZE_WIDTH, rows: MAZE_HEIGHT } : { cols: MAZE_HEIGHT, rows: MAZE_WIDTH }
}

export function playSize(layout: Layout): { width: number; height: number } {
  const { cols, rows } = boardSize(layout)
  return { width: cols * CELL, height: HUD_HEIGHT + rows * CELL + (layout === 'portrait' ? DPAD_HEIGHT : 0) }
}

// ---------------------------------------------------------------- the street, composed

/** Where things stand on a street scene, for a game and a layout. */
type Stage = {
  ground: number; building: [number, number]; horizon: number; skyline: number
  randomY: number; markY: number; markSize: number
  road: { bottom: number; line: number; lanes: number[] }
  press: number; info: 'top' | 'bottom'
  moon: [number, number, number]; clouds: Array<[number, number, number]>
  lamps: number[]; greens: number[]
}

function stage(game: Game, layout: Layout): Stage {
  if (layout === 'landscape') {
    return game === 'catcher'
      ? { ground: 162, building: [96, 192], horizon: 150, skyline: 90, randomY: 7, markY: 36, markSize: 4, road: { bottom: 216, line: 199, lanes: [178] }, press: 205, info: 'top', moon: [350, 38, 8], clouds: [[6, 40, 64], [310, 58, 64], [258, 14, 34]], lamps: [44, 340], greens: [16, 368] }
      : { ground: 162, building: [80, 224], horizon: 150, skyline: 96, randomY: 7, markY: 38, markSize: 2.1, road: { bottom: 216, line: 199, lanes: [178] }, press: 205, info: 'top', moon: [346, 42, 8], clouds: [[4, 46, 72], [302, 66, 76], [262, 16, 34]], lamps: [58, 326], greens: [22, 362] }
  }
  return game === 'catcher'
    ? { ground: 244, building: [28, 160], horizon: 230, skyline: 110, randomY: 78, markY: 108, markSize: 4, road: { bottom: 324, line: 289, lanes: [262, 297] }, press: 342, info: 'bottom', moon: [184, 30, 9], clouds: [[6, 36, 56], [104, 50, 64]], lamps: [12, 204], greens: [] }
    : { ground: 244, building: [12, 192], horizon: 230, skyline: 120, randomY: 80, markY: 116, markSize: 2.1, road: { bottom: 324, line: 289, lanes: [262, 297] }, press: 342, info: 'bottom', moon: [182, 30, 9], clouds: [[4, 38, 60], [118, 50, 70]], lamps: [], greens: [10, 206] }
}

type SceneOptions = { frame: number; lit: boolean; hero: boolean; marks: boolean; building: boolean }

/** The night street of a game, its building, its traffic, and its hero on the sidewalk. */
function drawStreetScene(buffer: PixelBuffer, game: Game, layout: Layout, accent: string, options: SceneOptions): Stage {
  const s = stage(game, layout)
  const night: Night = NIGHTS[game === 'catcher' ? 'blue' : 'violet']
  const { width: W, height: H } = buffer
  const { frame, lit } = options
  sky(buffer, night, s.horizon)
  stars(buffer, game === 'catcher' ? 7 : 11, layout === 'landscape' ? 46 : 60, s.horizon - 40, frame)
  moon(buffer, ...s.moon)
  s.clouds.forEach(([x, y, w], i) => cloud(buffer, x, y, w, night, 5 + i))
  city(buffer, night, s.ground - 8, s.skyline, game === 'catcher' ? 17 : 23, frame)
  const [bx, bw] = s.building
  if (game === 'eater') s.greens.forEach((x, i) => palm(buffer, x, s.ground - 6, layout === 'landscape' ? 64 : 150, (i === 0 ? 1 : -1) * (layout === 'landscape' ? 1 : 0.3), night))
  railing(buffer, s.ground - 12, game === 'catcher' ? '#3a4274' : '#40346e')
  if (!options.building) {
    if (game === 'catcher') s.greens.forEach((x, i) => tree(buffer, x, s.ground, 14, night, 3 + i))
  } else if (game === 'catcher') {
    drawStore(buffer, bx, bw, s.ground, accent, frame, lit)
    if (layout === 'landscape') { vending(buffer, bx - 22, s.ground, accent, lit); bin(buffer, bx + bw + 8, s.ground, dim(accent, 0.55)) }
    s.greens.forEach((x, i) => tree(buffer, x, s.ground, 14, night, 3 + i))
  } else {
    const logo = eaterLogoSize(s.markSize)
    const boardW = logo.width + 22, boardH = logo.height + 6
    const roof = s.ground - 64
    signBoard(buffer, Math.round(W / 2 - boardW / 2), s.markY - 4, boardW, boardH, roof)
    drawEaterLogo(buffer, Math.round(W / 2 - logo.width / 2) - 2, s.markY - 1, accent, s.markSize, { lit: options.marks && lit && frame % 9 !== 8, swashLit: options.marks && lit && frame % 5 !== 4 })
    drawDiner(buffer, bx, bw, s.ground, accent, frame, lit)
    hedge(buffer, bx - 24, s.ground, 22, night); hedge(buffer, bx + bw + 2, s.ground, 22, night)
  }
  s.lamps.forEach((x, i) => lamp(buffer, x, s.ground, layout === 'landscape' ? 46 : 58, i === 1))
  street(buffer, night, s.ground, 12, s.road.bottom, s.road.line)
  if (s.road.bottom < H) {
    // the near sidewalk under the road on a tall screen
    buffer.rect(0, s.road.bottom, W, H - s.road.bottom, dim(night.sidewalk, 0.55))
    buffer.rect(0, s.road.bottom, W, 2, night.sidewalkLight)
    for (let x = 10; x < W; x += 20) buffer.rect(x, s.road.bottom + 2, 1, H - s.road.bottom - 2, dim(night.sidewalk, 0.45))
  }
  // traffic: a car in each lane, each at its own speed and way
  const colors = game === 'catcher' ? ['#eeeae0', '#e0304a'] : ['#eeeae0', '#e8563a']
  s.road.lanes.forEach((y, i) => {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1
    const span = W + 120
    const pos = ((frame * (i === 0 ? 11 : 8) + (i === 0 ? 40 : 200)) % span) - 60
    car(buffer, dir === 1 ? pos : W - pos - 52, y, colors[i % colors.length], dir)
  })
  if (options.hero) {
    if (game === 'catcher') {
      // the burger at the door, chomping; one of the humans looking in at the window
      const door = bx + Math.round(bw / 2)
      buffer.blit(BURGER[frame % 2], door - 8, s.ground - 13, BURGER_PALETTE)
      const shopper = layout === 'landscape' ? bx + bw - 44 : bx + bw - 34
      buffer.blit(HUMAN[frame % 2], shopper, s.ground - 13, humanPalette(1))
    } else {
      // the eater crawling to the door, burgers on his way
      const door = bx + Math.round(bw / 2)
      const head = door - 26 + (frame % 4) * 2
      drawCrawler(buffer, head, s.ground - 2, accent, frame, layout === 'landscape' ? 2 : 1)
      buffer.blit(MINI_BURGER, head + 22, s.ground + 3, MINI_BURGER_PALETTE)
      if (layout === 'landscape') buffer.blit(MINI_BURGER, head + 46, s.ground + 3, MINI_BURGER_PALETTE)
    }
  }
  return s
}

/** The eater on a street, crawling right: legs, `torso` pieces, shoulders with their arms, the head at `x`. */
function drawCrawler(buffer: PixelBuffer, x: number, y: number, accent: string, frame: number, torso: number): void {
  const palette = eaterPalette(accent)
  const shirt = tubePiece('right', 'left', { pattern: 'plain', cloth: accent, print: accent })
  let cx = x - (torso + 2) * CELL
  buffer.blit(CRAWL_LEGS[frame % 2], cx, y, palette); cx += CELL
  for (let i = 0; i < torso; i += 1) { const t = tubePiece('right', 'left', torsoLook(i)); buffer.blit(t.sprite, cx, y, t.palette); cx += CELL }
  buffer.blit(shirt.sprite, cx, y, shirt.palette); buffer.blit(CRAWL_ARMS[frame % 2], cx, y, palette); cx += CELL
  buffer.blit(CRAWL_HEAD, cx, y, palette)
}

/** The marks: RANDOM at the top, then CATCHER's letters in volume (EATER's neon hangs on its diner). */
function drawMarks(buffer: PixelBuffer, game: Game, s: Stage, accent: string, frame: number): void {
  const W = buffer.width
  drawLogo(buffer, Math.round(W / 2 - LOGO_WIDTH / 2) + 1, s.randomY + 1, INK)
  drawLogo(buffer, Math.round(W / 2 - LOGO_WIDTH / 2), s.randomY, game === 'catcher' ? mix(accent, CREAM, 0.15) : mix(accent, CREAM, 0.15))
  if (game === 'catcher') {
    const size = catcherLogoSize(s.markSize)
    drawCatcherLogo(buffer, Math.round(W / 2 - size.width / 2), s.markY, accent, s.markSize, frame)
  }
}

// ---------------------------------------------------------------- screens

export type TitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean }

export function renderTitle(game: Game, layout: Layout, accent: string, options: TitleOptions = {}): PixelBuffer {
  const { width, height } = SCENE_SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const s = drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: true, marks: true, building: true })
  drawMarks(buffer, game, s, accent, frame)
  pressStart(buffer, width / 2, s.press, accent, options.blink !== false)
  const level = String(options.level ?? 1), best = String(options.best ?? 0).padStart(5, '0')
  if (s.info === 'top') {
    infoLine(buffer, 8, 8, 'LEVEL', level, 'left')
    infoLine(buffer, width - 8, 8, 'BEST', best, 'right')
  } else {
    infoLine(buffer, width / 2 - 8, s.press + 18, 'LEVEL', level, 'right')
    infoLine(buffer, width / 2 + 8, s.press + 18, 'BEST', best, 'left')
  }
  return buffer
}

export type OverOptions = { score?: number; best?: number; frame?: number; blink?: boolean }

/**
 * GAME OVER: the game's night street with nothing in front — no building,
 * no hero — a shade darker, and in the sky the verdict in arcade letters,
 * the score, PLAY AGAIN? and the two framed answers.
 */
export function renderGameOver(game: Game, layout: Layout, accent: string, options: OverOptions = {}): PixelBuffer {
  const { width, height } = SCENE_SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: false, marks: false, building: false })
  buffer.shade(0, 0, width, height, 0.6)
  const c = width / 2
  const score = String(options.score ?? 0).padStart(5, '0'), best = String(options.best ?? 0).padStart(5, '0')
  const chosen = options.blink !== false
  if (layout === 'landscape') {
    arcadeText(buffer, 'GAME OVER', c, 34, 4, accent)
    infoLine(buffer, c - 10, 76, 'SCORE', score, 'right')
    infoLine(buffer, c + 10, 76, 'BEST', best, 'left')
    arcadeText(buffer, 'PLAY AGAIN?', c, 98, 2, accent)
    button(buffer, 'YES', c - 30, 122, accent, chosen)
    button(buffer, 'NO', c + 30, 122, accent, false)
  } else {
    arcadeText(buffer, 'GAME', c, 56, 5, accent)
    arcadeText(buffer, 'OVER', c, 100, 5, accent)
    infoLine(buffer, c, 150, 'SCORE', score, 'centre')
    infoLine(buffer, c, 164, 'BEST', best, 'centre')
    arcadeText(buffer, 'PLAY AGAIN?', c, 188, 2, accent)
    button(buffer, 'YES', c - 30, 212, accent, chosen)
    button(buffer, 'NO', c + 30, 212, accent, false)
  }
  return buffer
}

// ---------------------------------------------------------------- play

export type PlayOptions = { level?: number; score?: number; lives?: number; frame?: number; floor?: Floor }

const FLOOR = '#141829'
const SHELF = { top: '#8c92ab', light: '#b8bdd0', shadow: '#555b76', line: '#6c728c' }

/** Cells of the maze that are outside the store: spaces no one can reach. */
function outsideCells(maze: readonly string[]): Set<string> {
  const [start] = cellsOnGrid(maze, 'B')
  const reach = reachableOn(maze, start)
  const out = new Set<string>()
  maze.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) if (row[x] !== '#' && !reach.has(`${x},${y}`)) out.add(`${x},${y}`) })
  return out
}

function cellsOnGrid(maze: readonly string[], char: string): Cell[] {
  const cells: Cell[] = []
  maze.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) if (row[x] === char) cells.push({ x, y }) })
  return cells
}

/** Every walkable cell from `start`; the tunnels wrap round on the axis they run along. */
function reachableOn(maze: readonly string[], start: Cell): Set<string> {
  const h = maze.length, w = maze[0].length
  const seen = new Set<string>([`${start.x},${start.y}`])
  const queue: Cell[] = [start]
  while (queue.length) {
    const { x, y } = queue.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = (x + dx + w) % w, ny = (y + dy + h) % h
      if (maze[ny][nx] === '#') continue
      const key = `${nx},${ny}`
      if (!seen.has(key)) { seen.add(key); queue.push({ x: nx, y: ny }) }
    }
  }
  return seen
}

/**
 * The store seen from above: a plain floor, the store's wall round the
 * edge, and every wall inside a shelf unit — a grey block with a lit
 * edge, a shadowed edge and the line of its back panel down the middle,
 * its ends capped in the accent. No goods on them: nothing round the
 * characters but the way.
 */
function drawAisles(buffer: PixelBuffer, maze: readonly string[], top: number, accent: string): void {
  const h = maze.length, w = maze[0].length
  const outside = outsideCells(maze)
  const wallish = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || maze[y][x] === '#' || outside.has(`${x},${y}`)
  const outer = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true
    if (outside.has(`${x},${y}`)) return true
    if (maze[y][x] !== '#') return false
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || outside.has(`${nx},${ny}`)) return true
    }
    return false
  }
  const wallTone = '#0b0d18', wallEdge = dim(accent, 0.6)
  buffer.rect(0, top, w * CELL, h * CELL, FLOOR)
  // the store's wall, with a line of the accent where it meets the floor
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!outer(x, y)) continue
    const px = x * CELL, py = top + y * CELL
    buffer.rect(px, py, CELL, CELL, wallTone)
    if (!wallish(x, y - 1)) buffer.rect(px, py, CELL, 2, wallEdge)
    if (!wallish(x, y + 1)) buffer.rect(px, py + CELL - 2, CELL, 2, wallEdge)
    if (!wallish(x - 1, y)) buffer.rect(px, py, 2, CELL, wallEdge)
    if (!wallish(x + 1, y)) buffer.rect(px + CELL - 2, py, 2, CELL, wallEdge)
  }
  // the shelves: each cell's block runs on into a neighbour shelf, stands back three pixels from the floor
  const shelf = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && maze[y][x] === '#' && !outer(x, y)
  const inset = 3
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!shelf(x, y)) continue
    const px = x * CELL, py = top + y * CELL
    const l = wallish(x - 1, y) ? 0 : inset, r = wallish(x + 1, y) ? 0 : inset
    const t = wallish(x, y - 1) ? 0 : inset, b = wallish(x, y + 1) ? 0 : inset
    buffer.rect(px + l, py + t, CELL - l - r, CELL - t - b, SHELF.top)
    if (t) buffer.rect(px + l, py + t, CELL - l - r, 1, SHELF.light)
    if (l) buffer.rect(px + l, py + t, 1, CELL - t - b, SHELF.light)
    if (b) buffer.rect(px + l, py + CELL - b - 2, CELL - l - r, 2, SHELF.shadow)
    if (r) buffer.rect(px + CELL - r - 1, py + t, 1, CELL - t - b, SHELF.shadow)
    // the back panel down the middle, along the shelf's longer run
    const horizontal = shelf(x - 1, y) || shelf(x + 1, y)
    const vertical = shelf(x, y - 1) || shelf(x, y + 1)
    if (horizontal || !vertical) buffer.rect(px + l + (l ? 2 : 0), py + 7, CELL - l - r - (l ? 2 : 0) - (r ? 2 : 0), 1, SHELF.line)
    if (vertical && !horizontal) buffer.rect(px + 7, py + t + (t ? 2 : 0), 1, CELL - t - b - (t ? 2 : 0) - (b ? 3 : 0), SHELF.line)
    // an end of a run: capped in the accent
    if (horizontal && !shelf(x - 1, y) && l) buffer.rect(px + l, py + t + 1, 2, CELL - t - b - 3, accent)
    if (horizontal && !shelf(x + 1, y) && r) buffer.rect(px + CELL - r - 3, py + t + 1, 2, CELL - t - b - 3, accent)
    if (vertical && !horizontal && !shelf(x, y - 1) && t) buffer.rect(px + l + 1, py + t, CELL - l - r - 2, 2, accent)
    if (vertical && !horizontal && !shelf(x, y + 1) && b) buffer.rect(px + l + 1, py + CELL - b - 4, CELL - l - r - 2, 2, accent)
  }
  // the humans' back room: its door, a cream line across the opening
  const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && maze[y][x] !== '#' && maze[y][x] !== 'H' && !outside.has(`${x},${y}`)
  for (const { x, y } of cellsOnGrid(maze, 'H')) {
    const px = x * CELL, py = top + y * CELL
    const isH = (xx: number, yy: number) => maze[yy]?.[xx] === 'H'
    if ((isH(x, y + 1) && walkable(x, y - 1)) || (isH(x, y - 1) && walkable(x, y + 1))) buffer.rect(px, py + 7, CELL, 2, CREAM)
    else if ((isH(x + 1, y) && walkable(x - 1, y)) || (isH(x - 1, y) && walkable(x + 1, y))) buffer.rect(px + 7, py, 2, CELL, CREAM)
  }
}

/** A moment of RANDOM CATCHER: the aisles, the seeds, a few ingredients, the sauces, the burger, the humans. */
function renderCatcherPlay(layout: Layout, accent: string, options: PlayOptions): PixelBuffer {
  const { width, height } = playSize(layout)
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const maze = mazeFor(layout)
  const tall = layout === 'portrait'
  const at = (x: number, y: number): [number, number] => (tall ? [y, x] : [x, y])
  const top = HUD_HEIGHT
  drawAisles(buffer, maze, top, accent)
  // the way the burger came: along the top, down, then right along the long corridor
  const trail: Array<[number, number]> = [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4]]
  const eaten = new Set(trail.map(([x, y]) => at(x, y).join(',')))
  const items = new Map<string, readonly string[]>([[at(21, 4).join(','), TOMATO], [at(1, 14).join(','), PICKLE], [at(26, 18).join(','), ONION], [at(12, 14).join(','), TOMATO], [at(23, 18).join(','), PICKLE]])
  maze.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const px = x * CELL, py = top + y * CELL
      const key = `${x},${y}`
      if (row[x] === '.' && !eaten.has(key)) {
        const item = items.get(key)
        if (item) buffer.blit(item, px + 3, py + 3, ITEM_PALETTE)
        else buffer.blit(PELLET, px + 6, py + 6, PELLET_PALETTE)
      } else if (row[x] === 'S') buffer.blit(SAUCE, px + 2, py + 1, SAUCE_PALETTE)
    }
  })
  // the burger in the long corridor, two humans out in the aisles, two waiting in the back room
  const [bx, by] = at(9, 4)
  buffer.blit(BURGER[frame % 2], bx * CELL, top + by * CELL, BURGER_PALETTE)
  const humans: Array<[number, number]> = [[21, 6], [6, 14], [12, 10], [15, 10]]
  humans.forEach(([x, y], i) => { const [hx, hy] = at(x, y); buffer.blit(HUMAN[(frame + i) % 2], hx * CELL, top + hy * CELL, humanPalette(i)) })
  hud(buffer, accent, { level: options.level ?? 1, score: options.score ?? 0, lives: options.lives ?? 3 })
  if (tall) dpad(buffer, width / 2, HUD_HEIGHT + MAZE_WIDTH * CELL + DPAD_HEIGHT / 2, 26, accent)
  return buffer
}

/** The diner's floor under the eater: dark and plain, or tiles in two close darks with their grout and a glint. */
function drawDinerFloor(buffer: PixelBuffer, cols: number, rows: number, top: number, accent: string, floor: Floor): void {
  const W = cols * CELL, H = rows * CELL
  const chrome = '#c9ccd8', chromeDark = '#6a6e84'
  buffer.rect(0, top, W, H, '#16122a')
  if (floor === 'tiles') {
    for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) {
      const px = x * CELL, py = top + y * CELL
      const light = (x + y) % 2 === 0
      buffer.rect(px, py, CELL, CELL, light ? '#26213c' : '#141026')
      buffer.rect(px, py, CELL, 1, '#0e0b1c'); buffer.rect(px, py, 1, CELL, '#0e0b1c')
      if (light) { buffer.rect(px + 3, py + 3, 3, 1, '#34304c'); buffer.set(px + 3, py + 4, '#34304c') }
    }
  }
  // the counter round the edge: chrome, a neon line in the accent where it meets the floor
  const ring = CELL
  buffer.rect(0, top, W, ring, chromeDark); buffer.rect(0, top + H - ring, W, ring, chromeDark)
  buffer.rect(0, top, ring, H, chromeDark); buffer.rect(W - ring, top, ring, H, chromeDark)
  buffer.rect(2, top + 2, W - 4, 3, chrome); buffer.rect(2, top + H - 5, W - 4, 3, chrome)
  buffer.rect(2, top + 2, 3, H - 4, chrome); buffer.rect(W - 5, top + 2, 3, H - 4, chrome)
  buffer.rect(ring - 3, top + ring - 3, W - 2 * ring + 6, 2, accent); buffer.rect(ring - 3, top + H - ring + 1, W - 2 * ring + 6, 2, accent)
  buffer.rect(ring - 3, top + ring - 3, 2, H - 2 * ring + 6, accent); buffer.rect(W - ring + 1, top + ring - 3, 2, H - 2 * ring + 6, accent)
  buffer.rect(ring - 1, top + ring - 1, W - 2 * ring + 2, 1, mix(accent, '#000000', 0.5))
}

/** The eater's body on the board, from the head back: every cell knows the way to the head and the way to the legs. */
const EATER_PATH: ReadonlyArray<[number, number]> = [
  [18, 6], [17, 6], [16, 6], [15, 6], [14, 6], [13, 6], [13, 7], [13, 8], [13, 9], [13, 10], [12, 10], [11, 10], [10, 10], [9, 10], [9, 11], [9, 12], [9, 13], [10, 13], [11, 13], [11, 14],
]

function toward([ax, ay]: readonly [number, number], [bx, by]: readonly [number, number]): Direction {
  if (bx > ax) return 'right'
  if (bx < ax) return 'left'
  return by > ay ? 'down' : 'up'
}

/** A moment of RANDOM EATER: the diner's floor inside its counter, the eater bending round, a burger ahead. */
function renderEaterPlay(layout: Layout, accent: string, options: PlayOptions): PixelBuffer {
  const { width, height } = playSize(layout)
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const tall = layout === 'portrait'
  const { cols, rows } = boardSize(layout)
  const top = HUD_HEIGHT
  drawDinerFloor(buffer, cols, rows, top, accent, options.floor ?? 'plain')
  const path = EATER_PATH.map(([x, y]) => (tall ? [y, x] : [x, y]) as [number, number])
  const place = ([x, y]: readonly [number, number]): [number, number] => [x * CELL, top + y * CELL]
  const palette = eaterPalette(accent)
  const n = path.length
  // legs first, then the tube from the back to the front, then the head over its neck
  const legsDir = toward(path[n - 1], path[n - 2])
  buffer.blit(facing(CRAWL_LEGS[frame % 2], legsDir), ...place(path[n - 1]), palette)
  for (let i = n - 2; i >= 1; i -= 1) {
    const front = toward(path[i], path[i - 1]), back = toward(path[i], path[i + 1])
    const look = i === 1 ? { pattern: 'plain' as const, cloth: accent, print: accent } : torsoLook(i - 2)
    const piece = tubePiece(front, back, look)
    buffer.blit(piece.sprite, ...place(path[i]), piece.palette)
    if (i === 1) buffer.blit(facing(CRAWL_ARMS[frame % 2], front), ...place(path[i]), palette)
  }
  buffer.blit(facing(CRAWL_HEAD, toward(path[1], path[0])), ...place(path[0]), palette)
  const food = tall ? [6, 22] : [22, 6]
  buffer.blit(MINI_BURGER, food[0] * CELL + 2, top + food[1] * CELL + 3, MINI_BURGER_PALETTE)
  hud(buffer, accent, { level: options.level ?? 1, score: options.score ?? 0, progress: [7, 12] })
  if (tall) dpad(buffer, width / 2, HUD_HEIGHT + rows * CELL + DPAD_HEIGHT / 2, 26, accent)
  return buffer
}

export function renderPlay(game: Game, layout: Layout, accent: string, options: PlayOptions = {}): PixelBuffer {
  return game === 'catcher' ? renderCatcherPlay(layout, accent, options) : renderEaterPlay(layout, accent, options)
}

// ---------------------------------------------------------------- all of them

export type Shot = { game: Game; layout: Layout; name: string; buffer: PixelBuffer }

/** Every base screen: title, play, GAME OVER, each wide and tall; EATER's play twice, on each floor. */
export function renderAll(accent: string, frame = 0): Shot[] {
  const shots: Shot[] = []
  for (const game of ['catcher', 'eater'] as Game[]) {
    for (const layout of LAYOUTS) {
      shots.push({ game, layout, name: 'titre', buffer: renderTitle(game, layout, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0 }) })
      if (game === 'catcher') shots.push({ game, layout, name: 'jeu', buffer: renderPlay(game, layout, accent, { level: 3, score: 1280, lives: 2, frame }) })
      else for (const floor of ['plain', 'tiles'] as Floor[]) shots.push({ game, layout, name: floor === 'plain' ? 'jeu-sol-uni' : 'jeu-sol-dalles', buffer: renderPlay(game, layout, accent, { level: 3, score: 1280, frame, floor }) })
      shots.push({ game, layout, name: 'game-over', buffer: renderGameOver(game, layout, accent, { score: 640, best: 4210, frame, blink: frame % 2 === 0 }) })
    }
  }
  return shots
}

