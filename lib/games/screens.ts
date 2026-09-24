/**
 * The screens of both games, drawn still or frame by frame: the title with
 * its world, a moment of play, the end. Each game has its own world —
 * CATCHER a street-food stand at night, EATER a city block seen from above —
 * and its own mark under the shared RANDOM logo. The boards stay plain.
 */

import { BASE_CREAM } from '@/lib/theme'

import { drawLogoCentered, LOGO_HEIGHT } from './logo'
import { CATCHER_LOGO_HEIGHT, CATCHER_LOGO_WIDTH, drawCatcherLogo, drawEaterLogo, EATER_LOGO_HEIGHT, EATER_LOGO_WIDTH } from './logos'
import { cellsOf, MAZE, MAZE_HEIGHT, MAZE_WIDTH } from './maze'
import { drawText, drawTextCentered, PixelBuffer, rgbOf, textWidth } from './pixels'
import {
  BURGER, BURGER_PALETTE, CELL, EATER_HEAD, EATER_LEGS, EATER_SHOULDERS, EATER_TORSO, EATER_TURN, eaterPalette, HUMAN, HUMAN_COLORS, humanPalette,
  ITEM_PALETTE, MINI_BURGER, MINI_BURGER_PALETTE, ONION, PELLET, PICKLE, SAUCE, SAUCE_PALETTE, TOMATO,
} from './sprites'

export type Game = 'catcher' | 'eater'
export const GAME_NAMES: Record<Game, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER' }
export const HUD_ROWS = 2
export const BOARD: Record<Game, { cols: number; rows: number }> = { catcher: { cols: MAZE_WIDTH, rows: MAZE_HEIGHT }, eater: { cols: 24, rows: 24 } }
export function canvasSize(game: Game): { width: number; height: number } {
  return { width: BOARD[game].cols * CELL, height: (BOARD[game].rows + HUD_ROWS) * CELL }
}

const BG = '#000000'
const CREAM = BASE_CREAM
const NIGHT = '#0b0b1c'
const NIGHT_DEEP = '#050510'
const GREY = '#8a8a82'
const LOGO_TOP = 12
/** Where the game's own mark starts, under the RANDOM logo drawn at scale two. */
const MARK_TOP = LOGO_TOP + LOGO_HEIGHT * 2 + 12

/** A colour dimmed to a fraction of itself. */
function dim(color: string, factor: number): string {
  return `#${rgbOf(color).map((c) => Math.round(c * factor).toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------- worlds

/** CATCHER's world: a street-food stand at night — stars, awning, neon, grill and steam, two customers, a checkered floor. */
function drawCatcherWorld(buffer: PixelBuffer, accent: string, frame: number, options: { crowd?: boolean } = {}): void {
  const { width, height } = buffer
  buffer.clear(NIGHT)
  const stars: Array<[number, number]> = [[20, 14], [61, 30], [110, 9], [170, 22], [231, 12], [300, 26], [352, 8], [401, 19], [431, 34], [140, 40], [260, 44], [380, 46], [90, 70], [330, 66]]
  stars.forEach(([sx, sy], index) => { if ((index + frame) % 5 !== 0) buffer.set(sx, sy, CREAM) })
  // the awning: stripes in the accent and cream, a scalloped edge
  const awningTop = 134, awningHeight = 14
  for (let x = 0; x < width; x += 16) buffer.rect(x, awningTop, 16, awningHeight, Math.floor(x / 16) % 2 === 0 ? accent : CREAM)
  for (let x = 0; x < width; x += 8) buffer.rect(x + 2, awningTop + awningHeight, 4, 3, Math.floor(x / 16) % 2 === 0 ? accent : CREAM)
  // the neon OPEN sign hanging under the awning, blinking
  const on = frame % 4 !== 3
  drawText(buffer, 'OPEN', width - 12 - textWidth('OPEN', 2), awningTop + 24, on ? accent : '#3a3a36', 2)
  // the counter, the grill on it, the steam rising
  const counterTop = height - 96
  buffer.rect(0, counterTop, width, 6, '#3a3a36')
  buffer.rect(0, counterTop + 6, width, 26, '#25251f')
  buffer.rect(width / 2 - 40, counterTop - 8, 80, 8, '#3a3a36')
  for (let i = 0; i < 5; i += 1) buffer.rect(width / 2 - 36 + i * 16, counterTop - 6, 8, 4, '#5a3319')
  const puffs: Array<[number, number]> = [[width / 2 - 28, counterTop - 62], [width / 2 + 24, counterTop - 70]]
  puffs.forEach(([px, py], index) => { const lift = ((frame + index) % 3) * 4; buffer.rect(px, py - lift, 6, 3, GREY); buffer.rect(px + 2, py - lift - 5, 4, 3, GREY) })
  // the checkered floor
  for (let y = height - 64; y < height; y += 16) for (let x = 0; x < width; x += 16) buffer.rect(x, y, 16, 16, ((x + y) / 16) % 2 === 0 ? '#1e1e18' : '#141410')
  // the ingredients on the counter
  buffer.blit(TOMATO, 40 + (frame % 2), counterTop + 10, ITEM_PALETTE)
  buffer.blit(PICKLE, width - 60, counterTop + 12 - (frame % 2), ITEM_PALETTE)
  buffer.blit(ONION, 84, counterTop + 14, ITEM_PALETTE)
  if (options.crowd !== false) {
    // two customers at the counter, and the burger on the grill, sweating
    buffer.blit(HUMAN[frame % 2], 56, counterTop - 32, humanPalette(HUMAN_COLORS[1]), { scale: 2 })
    buffer.blit(HUMAN[(frame + 1) % 2], width - 56 - 32, counterTop - 32, humanPalette(HUMAN_COLORS[3]), { scale: 2, flipX: true })
    const bounce = frame % 2 === 0 ? 0 : 3
    buffer.blit(BURGER[frame % 2], Math.floor(width / 2) - 24, counterTop - 8 - 48 - bounce, BURGER_PALETTE, { scale: 3 })
    buffer.rect(Math.floor(width / 2) + 26, counterTop - 44 - bounce, 3, 5, '#7fd4ff')
  }
}

/** EATER's world: a city block from above at night — streets with dashed lines, roofs, lit windows, a car, the eater walking. */
function drawEaterWorld(buffer: PixelBuffer, accent: string, frame: number, options: { walker?: boolean } = {}): void {
  const { width, height } = buffer
  buffer.clear(NIGHT_DEEP)
  const street = '#16161a', dash = '#3a3a36', roofA = '#1f1f26', roofB = '#25252c', edge = '#31313a'
  const verticals = [48, 160, 272], horizontals = [60, 164, 268, 372], road = 20
  // the roofs first: every block between two streets
  const xs = [0, ...verticals.map((x) => x + road)], xe = [...verticals, width]
  const ys = [0, ...horizontals.map((y) => y + road)], ye = [...horizontals, height]
  let seed = 11
  const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  xs.forEach((x0, i) => ys.forEach((y0, j) => {
    const w = xe[i] - x0, h = ye[j] - y0
    if (w <= 0 || h <= 0) return
    buffer.rect(x0, y0, w, h, next() < 0.5 ? roofA : roofB)
    buffer.rect(x0, y0, w, 1, edge); buffer.rect(x0, y0, 1, h, edge)
    const windows = 2 + Math.floor(next() * 3)
    for (let k = 0; k < windows; k += 1) {
      const wx = x0 + 5 + Math.floor(next() * Math.max(1, w - 10)), wy = y0 + 5 + Math.floor(next() * Math.max(1, h - 10))
      const lit = (k + frame + i + j) % 4 !== 0
      buffer.rect(wx, wy, 3, 3, lit ? '#f2c33c' : '#3a3a36')
    }
  }))
  // the streets over them, with their dashed centre lines
  verticals.forEach((x) => buffer.rect(x, 0, road, height, street))
  horizontals.forEach((y) => buffer.rect(0, y, width, road, street))
  verticals.forEach((x) => { for (let y = 4; y < height; y += 12) buffer.rect(x + 9, y, 2, 6, dash) })
  horizontals.forEach((y) => { for (let x = 4; x < width; x += 12) buffer.rect(x, y + 9, 6, 2, dash) })
  // a car on the top street, headlights in the accent
  const carX = ((frame * 12) % (width + 60)) - 30
  buffer.rect(carX, horizontals[0] + 6, 14, 8, CREAM)
  buffer.rect(carX + 3, horizontals[0] + 7, 6, 6, '#3a3a36')
  buffer.rect(carX + 14, horizontals[0] + 7, 3, 6, accent)
  buffer.rect(carX - 2, horizontals[0] + 7, 2, 6, '#e0301e')
  if (options.walker !== false) {
    // the eater walking the third street, a trail of mini burgers ahead of him
    const walkX = ((120 + frame * 8) % (width + 120)) - 100
    const y = horizontals[2] + 2
    drawEaterFigure(buffer, walkX, y, accent, frame, 1, 2)
    for (let k = 1; k <= 3; k += 1) buffer.blit(MINI_BURGER, walkX + 5 * CELL + 8 + k * 40, y + 4, MINI_BURGER_PALETTE)
  }
}

// ---------------------------------------------------------------- pieces

function drawHud(buffer: PixelBuffer, accent: string, level: number, score: number, lives: number): void {
  buffer.rect(0, 0, buffer.width, HUD_ROWS * CELL, BG)
  drawText(buffer, `LV ${level}`, 8, 10, accent, 2)
  drawTextCentered(buffer, String(score).padStart(5, '0'), 10, CREAM, 2)
  const hearts = '♥'.repeat(lives)
  drawText(buffer, hearts, buffer.width - 40 - textWidth(hearts, 2), 10, '#d90845', 2)
  buffer.rect(buffer.width - 26, 8, 4, 14, accent)
  buffer.rect(buffer.width - 18, 8, 4, 14, accent)
}

/** The eater walking right, head first: legs, torso pieces, shoulders with the arms, head. */
function drawEaterFigure(buffer: PixelBuffer, x: number, y: number, accent: string, frame: number, scale: number, torsoPieces = 2): void {
  const palette = eaterPalette(accent)
  const step = CELL * scale
  let cursor = x
  buffer.blit(EATER_LEGS.right[frame % 2], cursor, y, palette, { scale }); cursor += step
  for (let i = 0; i < torsoPieces; i += 1) { buffer.blit(EATER_TORSO.horizontal, cursor, y, palette, { scale }); cursor += step }
  buffer.blit(EATER_SHOULDERS.right, cursor, y, palette, { scale }); cursor += step
  buffer.blit(EATER_HEAD.right, cursor, y, palette, { scale })
}

/**
 * The maze walls, drawn edge by edge: a wall cell is a dim block, and the
 * accent line runs only along the sides that face a corridor, so the walls
 * read as clean shapes instead of a grid of boxes.
 */
function drawMazeWalls(buffer: PixelBuffer, top: number, accent: string): void {
  const fill = dim(accent, 0.16)
  const isWall = (x: number, y: number) => y >= 0 && y < MAZE_HEIGHT && x >= 0 && x < MAZE_WIDTH && MAZE[y][x] === '#'
  const open = (x: number, y: number) => !isWall(x, y) && y >= 0 && y < MAZE_HEIGHT && x >= 0 && x < MAZE_WIDTH
  MAZE.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== '#') continue
      const px = x * CELL, py = top + y * CELL
      buffer.rect(px, py, CELL, CELL, fill)
      if (open(x, y - 1)) buffer.rect(px, py + 2, CELL, 2, accent)
      if (open(x, y + 1)) buffer.rect(px, py + CELL - 4, CELL, 2, accent)
      if (open(x - 1, y)) buffer.rect(px + 2, py, 2, CELL, accent)
      if (open(x + 1, y)) buffer.rect(px + CELL - 4, py, 2, CELL, accent)
      // the inner corners: a diagonal corridor between two walls closes the line
      if (isWall(x - 1, y) && isWall(x, y - 1) && open(x - 1, y - 1)) buffer.rect(px, py, 4, 4, accent)
      if (isWall(x + 1, y) && isWall(x, y - 1) && open(x + 1, y - 1)) buffer.rect(px + CELL - 4, py, 4, 4, accent)
      if (isWall(x - 1, y) && isWall(x, y + 1) && open(x - 1, y + 1)) buffer.rect(px, py + CELL - 4, 4, 4, accent)
      if (isWall(x + 1, y) && isWall(x, y + 1) && open(x + 1, y + 1)) buffer.rect(px + CELL - 4, py + CELL - 4, 4, 4, accent)
      // the outer corners, where two lines meet, are squared off
      if (open(x, y - 1) && open(x - 1, y)) buffer.rect(px + 2, py + 2, 2, 2, accent)
      if (open(x, y - 1) && open(x + 1, y)) buffer.rect(px + CELL - 4, py + 2, 2, 2, accent)
      if (open(x, y + 1) && open(x - 1, y)) buffer.rect(px + 2, py + CELL - 4, 2, 2, accent)
      if (open(x, y + 1) && open(x + 1, y)) buffer.rect(px + CELL - 4, py + CELL - 4, 2, 2, accent)
    }
  })
}

function drawPanel(buffer: PixelBuffer, x: number, y: number, width: number, height: number, accent: string): void {
  buffer.rect(x, y, width, height, '#0a0a0a')
  buffer.rect(x, y, width, 2, accent); buffer.rect(x, y + height - 2, width, 2, accent)
  buffer.rect(x, y, 2, height, accent); buffer.rect(x + width - 2, y, 2, height, accent)
}

function drawMarks(buffer: PixelBuffer, game: Game, accent: string, frame: number): void {
  drawLogoCentered(buffer, LOGO_TOP, accent, 2)
  if (game === 'catcher') drawCatcherLogo(buffer, Math.floor((buffer.width - CATCHER_LOGO_WIDTH) / 2), MARK_TOP, accent, frame)
  else drawEaterLogo(buffer, Math.floor((buffer.width - EATER_LOGO_WIDTH) / 2), MARK_TOP, accent, frame)
}

// ---------------------------------------------------------------- screens

export function renderTitle(game: Game, accent: string, options: { level?: number; best?: number; frame?: number; blink?: boolean } = {}): PixelBuffer {
  const { width, height } = canvasSize(game)
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  if (game === 'catcher') drawCatcherWorld(buffer, accent, frame)
  else drawEaterWorld(buffer, accent, frame)
  drawMarks(buffer, game, accent, frame)
  if (options.blink !== false) drawTextCentered(buffer, 'PRESS PLAY', height - 40, CREAM, 2)
  drawTextCentered(buffer, `LEVEL ${options.level ?? 1}   BEST ${String(options.best ?? 0).padStart(5, '0')}`, height - 18, GREY, 1)
  return buffer
}

/** A moment of RANDOM CATCHER: the maze, the pellets, the burger, the humans, the sauces. */
export function renderCatcherPlay(accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize('catcher')
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  drawHud(buffer, accent, options.level ?? 1, options.score ?? 120, options.lives ?? 3)
  const top = HUD_ROWS * CELL
  drawMazeWalls(buffer, top, accent)
  MAZE.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const char = row[x], px = x * CELL, py = top + y * CELL
      if (char === '.') buffer.blit(PELLET, px + 6, py + 6, { w: CREAM })
      else if (char === 'S') buffer.blit(SAUCE, px + 2, py + 2, SAUCE_PALETTE)
    }
  })
  const spots = [[2, 1], [6, 4], [13, 6], [21, 4], [25, 1], [9, 14], [18, 18]] as const
  spots.forEach(([x, y], index) => { buffer.rect(x * CELL, top + y * CELL, CELL, CELL, BG); buffer.blit([TOMATO, PICKLE, ONION][index % 3], x * CELL + 2, top + y * CELL + 3, ITEM_PALETTE) })
  const [start] = cellsOf('B')
  buffer.rect(start.x * CELL, top + start.y * CELL, CELL, CELL, BG)
  buffer.blit(BURGER[frame % 2], start.x * CELL, top + start.y * CELL, BURGER_PALETTE)
  cellsOf('H').slice(0, 4).forEach((cell, index) => buffer.blit(HUMAN[(index + frame) % 2], cell.x * CELL, top + cell.y * CELL, humanPalette(HUMAN_COLORS[index])))
  buffer.blit(HUMAN[frame % 2], 6 * CELL, top + 6 * CELL, humanPalette(HUMAN_COLORS[1]))
  return buffer
}

/** A moment of RANDOM EATER: the border, a faint grid, the human stretched with a bend, mini burgers to eat. */
export function renderEaterPlay(accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize('eater')
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  drawHud(buffer, accent, options.level ?? 1, options.score ?? 70, options.lives ?? 1)
  const top = HUD_ROWS * CELL
  for (let y = top + CELL; y < height; y += CELL) for (let x = CELL; x < width; x += CELL) buffer.set(x, y, '#1c1c1c')
  buffer.rect(0, top, width, 2, accent); buffer.rect(0, height - 2, width, 2, accent); buffer.rect(0, top, 2, height - top, accent); buffer.rect(width - 2, top, 2, height - top, accent)
  const palette = eaterPalette(accent)
  const at = (cx: number, cy: number): [number, number] => [cx * CELL, top + cy * CELL]
  let [x, y] = at(4, 12); buffer.blit(EATER_LEGS.right[frame % 2], x, y, palette)
  for (const cx of [5, 6, 7, 8]) { [x, y] = at(cx, 12); buffer.blit(EATER_TORSO.horizontal, x, y, palette) }
  ;[x, y] = at(9, 12); buffer.blit(EATER_TURN['left-up'], x, y, palette)
  ;[x, y] = at(9, 11); buffer.blit(EATER_TORSO.vertical, x, y, palette)
  ;[x, y] = at(9, 10); buffer.blit(EATER_SHOULDERS.up, x, y, palette)
  ;[x, y] = at(9, 9); buffer.blit(EATER_HEAD.up, x, y, palette)
  for (const [cx, cy] of [[9, 5], [17, 15], [3, 19], [20, 4]] as const) { [x, y] = at(cx, cy); buffer.blit(MINI_BURGER, x + 2, y + 4, MINI_BURGER_PALETTE) }
  return buffer
}

export function renderPlay(game: Game, accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  return game === 'catcher' ? renderCatcherPlay(accent, options) : renderEaterPlay(accent, options)
}

export type Outcome = 'won' | 'lost'
/** The end: the game's world behind, both marks, a panel with the verdict, the score and the two choices. */
export function renderEnd(game: Game, accent: string, outcome: Outcome, options: { score?: number; level?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize(game)
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  if (game === 'catcher') drawCatcherWorld(buffer, accent, frame, { crowd: false })
  else drawEaterWorld(buffer, accent, frame, { walker: false })
  drawMarks(buffer, game, accent, frame)
  const panelW = Math.min(width - 32, 300), panelH = 112
  const px = Math.floor((width - panelW) / 2), py = MARK_TOP + (game === 'catcher' ? CATCHER_LOGO_HEIGHT : EATER_LOGO_HEIGHT) + 12
  drawPanel(buffer, px, py, panelW, panelH, accent)
  const title = outcome === 'won' ? (game === 'eater' ? 'LEVEL UP' : 'LEVEL CLEAR') : 'GAME OVER'
  drawTextCentered(buffer, title, py + 14, outcome === 'won' ? accent : '#d90845', 3)
  drawTextCentered(buffer, `SCORE ${String(options.score ?? 0).padStart(5, '0')}`, py + 44, CREAM, 2)
  drawTextCentered(buffer, `LEVEL ${options.level ?? 1}`, py + 62, GREY, 1)
  const left = outcome === 'won' ? 'CONTINUER' : 'REJOUER', right = outcome === 'won' ? 'QUITTER' : 'CONTINUER'
  const half = Math.floor(width / 2)
  drawText(buffer, `> ${left}`, half - textWidth(`> ${left}`, 2) - 10, py + 84, accent, 2)
  drawText(buffer, right, half + 10, py + 84, GREY, 2)
  return buffer
}

export function renderAll(game: Game, accent: string, frame = 0): Array<{ name: string; buffer: PixelBuffer }> {
  return [
    { name: 'titre', buffer: renderTitle(game, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0 }) },
    { name: 'jeu', buffer: renderPlay(game, accent, { level: 3, score: 1280, lives: game === 'catcher' ? 2 : 1, frame }) },
    { name: 'fin-gagne', buffer: renderEnd(game, accent, 'won', { score: 1280, level: 3, frame }) },
    { name: 'fin-perdu', buffer: renderEnd(game, accent, 'lost', { score: 640, level: 3, frame }) },
  ]
}
