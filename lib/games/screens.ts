/**
 * The screens of both games, drawn still or frame by frame: the title with
 * its scene, a moment of play, the end. RANDOM CATCHER opens on the front
 * of a little convenience store and plays in its aisles; RANDOM EATER opens
 * on a diner at night, its neon sign the game's own mark, and plays on the
 * diner's floor. Everything takes the theme's accent.
 */

import { BASE_CREAM } from '@/lib/theme'

import { drawLogoCentered, LOGO_HEIGHT } from './logo'
import { CATCHER_LOGO_HEIGHT, CATCHER_LOGO_WIDTH, dim, drawCatcherLogo, drawEaterLogo, EATER_LOGO_HEIGHT, EATER_LOGO_WIDTH } from './logos'
import { cellsOf, MAZE, MAZE_HEIGHT, MAZE_WIDTH } from './maze'
import { drawText, drawTextCentered, PixelBuffer, textWidth } from './pixels'
import {
  BURGER, BURGER_PALETTE, CELL, CRAWL_HEAD, CRAWL_LEGS, CRAWL_SHOULDERS, eaterPalette, facing, HUMAN, HUMAN_COLORS, humanPalette,
  ITEM_PALETTE, MINI_BURGER, MINI_BURGER_PALETTE, ONION, PELLET, PICKLE, SAUCE, SAUCE_PALETTE, TOMATO, torsoLook, type Direction,
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
const GREY = '#8a8a82'
const CHROME = '#c8c8c0'
const CHROME_DARK = '#8a8a82'
const WARM = '#8a6a2a'
const WARM_LIGHT = '#c9a04a'
const LAMP = '#f2c33c'
const LOGO_TOP = 12
/** Where CATCHER's own mark starts, under the RANDOM logo drawn at scale two. */
const MARK_TOP = LOGO_TOP + LOGO_HEIGHT * 2 + 10
/** Colours the products on the shelves come in. */
const GOODS = ['#d92d2d', '#f2c33c', '#3d42cc', '#0fc55d', '#af3bf2', '#f8f5e6', '#e39a3b', '#7fd4ff']

/** A small deterministic sequence, so a scene is the same every time it is drawn. */
function rng(seed: number): () => number {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

function stars(buffer: PixelBuffer, frame: number, seed: number, count: number, below: number): void {
  const next = rng(seed)
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(next() * buffer.width), y = Math.floor(next() * below)
    if ((i + frame) % 5 !== 0) buffer.set(x, y, CREAM)
  }
}

/** A car seen from the side, `dir` +1 going right, −1 going left: body, roof with windows, wheels, lights. */
function car(buffer: PixelBuffer, x: number, y: number, color: string, dir: 1 | -1): void {
  buffer.rect(x, y + 4, 28, 7, color)
  buffer.rect(x + 6, y, 14, 5, color)
  buffer.rect(x + 8, y + 1, 4, 3, '#1a2030'); buffer.rect(x + 14, y + 1, 4, 3, '#1a2030')
  buffer.rect(x + 4, y + 10, 5, 3, '#121210'); buffer.rect(x + 19, y + 10, 5, 3, '#121210')
  const front = dir === 1 ? x + 27 : x, back = dir === 1 ? x : x + 27
  buffer.rect(front, y + 5, 1, 2, CREAM); buffer.rect(back, y + 5, 1, 2, '#e0301e')
}

// ---------------------------------------------------------------- the eater

/** The eater crawling, head first along `dir`, from the head cell: shoulders, `torso` pieces each with its own look, the legs. */
export function drawEater(buffer: PixelBuffer, x: number, y: number, dir: Direction, accent: string, frame: number, torso: number, scale = 1): void {
  const palette = eaterPalette(accent)
  const back: Record<Direction, [number, number]> = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] }
  const step = CELL * scale
  const at = (i: number): [number, number] => [x + back[dir][0] * i * step, y + back[dir][1] * i * step]
  let [px, py] = at(0); buffer.blit(facing(CRAWL_HEAD, dir), px, py, palette, { scale })
  ;[px, py] = at(1); buffer.blit(facing(CRAWL_SHOULDERS[frame % 2], dir), px, py, palette, { scale })
  for (let i = 0; i < torso; i += 1) {
    const look = torsoLook(i, accent)
    ;[px, py] = at(2 + i); buffer.blit(facing(look.sprite, dir), px, py, { ...palette, ...look.palette }, { scale })
  }
  ;[px, py] = at(2 + torso); buffer.blit(facing(CRAWL_LEGS[frame % 2], dir), px, py, palette, { scale })
}

// ---------------------------------------------------------------- the diner (EATER)

/**
 * A diner at night, seen from the street: the city behind, the neon sign
 * on the roof, chrome and glass, the door in the middle; the sidewalk, the
 * street with cars passing; the eater crawling to the door, eating.
 */
function drawDinerScene(buffer: PixelBuffer, accent: string, frame: number, options: { hero?: boolean } = {}): void {
  const { width } = buffer
  buffer.clear(NIGHT)
  stars(buffer, frame, 3, 26, 120)
  // the skyline: towers of two tones, windows lit or not, a few blinking
  const next = rng(9)
  let bx = -8
  while (bx < width) {
    const w = 32 + Math.floor(next() * 40), top = 90 + Math.floor(next() * 90)
    buffer.rect(bx, top, w, 240 - top, next() < 0.5 ? '#141428' : '#1a1a32')
    for (let wy = top + 6; wy < 232; wy += 10) for (let wx = bx + 5; wx < bx + w - 6; wx += 9) {
      const lit = next() < 0.55, blink = next() < 0.12
      if (lit && !(blink && (frame + wx) % 4 === 0)) buffer.rect(wx, wy, 3, 4, LAMP)
    }
    bx += w + 6
  }
  // the diner: a box of chrome and glass in the middle
  const dx = 72, dw = 240, roof = 176, sill = 252, base = 300
  // the sign on the roof, and the neon on it
  buffer.rect(dx + 30, 112, dw - 60, roof - 112, '#0c0c14')
  buffer.rect(dx + 30, 112, dw - 60, 2, CHROME_DARK); buffer.rect(dx + 30, 112, 2, roof - 112, CHROME_DARK); buffer.rect(dx + dw - 32, 112, 2, roof - 112, CHROME_DARK)
  drawEaterLogo(buffer, Math.floor((width - EATER_LOGO_WIDTH) / 2), 114, accent, { lit: frame % 8 !== 7 })
  // the roof band, chrome
  buffer.rect(dx, roof, dw, 8, CHROME); buffer.rect(dx, roof + 6, dw, 2, CHROME_DARK)
  buffer.rect(dx, roof + 8, dw, 10, accent); buffer.rect(dx, roof + 12, dw, 1, CREAM)
  // the facade: warm windows on both sides of the door, chrome posts between
  buffer.rect(dx, roof + 18, dw, sill - roof - 18, '#1e1e2e')
  const panes: Array<[number, number]> = [[dx + 8, dx + 60], [dx + 66, dx + 104], [dx + 136, dx + 174], [dx + 180, dx + dw - 8]]
  for (const [x0, x1] of panes) {
    buffer.rect(x0, roof + 22, x1 - x0, sill - roof - 26, WARM)
    buffer.rect(x0, sill - 20, x1 - x0, 3, WARM_LIGHT)
    for (let sx = x0 + 8; sx < x1 - 6; sx += 14) { buffer.rect(sx, sill - 16, 6, 3, '#3a2a10'); buffer.rect(sx + 2, sill - 13, 2, 6, '#3a2a10') }
    for (let lx = x0 + 10; lx < x1 - 6; lx += 20) { buffer.rect(lx, roof + 24, 1, 6, CHROME_DARK); buffer.rect(lx - 2, roof + 30, 5, 3, LAMP) }
  }
  drawText(buffer, 'OPEN', dx + 18, roof + 40, frame % 6 === 5 ? '#3a3a36' : accent, 1)
  for (const px of [dx + 4, dx + 62, dx + 106, dx + 132, dx + 176, dx + dw - 8]) buffer.rect(px, roof + 18, 4, sill - roof - 18, CHROME)
  // the door: glass in a frame of the accent, a chrome handle
  buffer.rect(dx + 110, roof + 20, 22, sill - roof - 20, accent)
  buffer.rect(dx + 113, roof + 23, 16, sill - roof - 26, WARM)
  buffer.rect(dx + 124, roof + 52, 2, 10, CHROME)
  // the lower band in the accent with chrome trim, the base
  buffer.rect(dx, sill, dw, base - sill, accent)
  buffer.rect(dx, sill + 4, dw, 2, CHROME); buffer.rect(dx, base - 8, dw, 2, CHROME)
  buffer.rect(dx, base - 4, dw, 4, '#3a3a36')
  // the sidewalk, the street with its centre line, the dark band below
  buffer.rect(0, base, width, 24, '#3a3a36')
  for (let tx = 0; tx < width; tx += 24) buffer.rect(tx, base, 1, 24, '#2a2a26')
  buffer.rect(0, base + 24, width, 48, '#16161a')
  for (let lx = 0; lx < width; lx += 16) buffer.rect(lx, base + 47, 8, 2, '#3a3a36')
  buffer.rect(0, base + 72, width, buffer.height - base - 72, '#050510')
  // cars: one each way, at their own speeds
  car(buffer, ((frame * 14) % (width + 80)) - 40, base + 28, '#d92d2d', 1)
  car(buffer, width + 20 - ((frame * 9 + 120) % (width + 80)), base + 52, '#f2c33c', -1)
  if (options.hero !== false) {
    // the eater on the sidewalk, crawling to the door over a trail of little burgers
    const head = 96 + ((frame * 5) % 100)
    for (const bx2 of [150, 185, 220]) if (bx2 > head + 6) buffer.blit(MINI_BURGER, bx2, base + 12, MINI_BURGER_PALETTE)
    drawEater(buffer, head, base + 6, 'right', accent, frame, 2)
  }
}

// ---------------------------------------------------------------- the store (CATCHER)

/** A shelf of goods behind glass: boards, and boxes of colour on them. */
function shelves(buffer: PixelBuffer, x0: number, y0: number, w: number, h: number, seed: number): void {
  const next = rng(seed)
  buffer.rect(x0, y0, w, h, '#141c2c')
  for (let sy = y0 + 18; sy < y0 + h; sy += 22) {
    buffer.rect(x0, sy, w, 2, CHROME_DARK)
    for (let gx = x0 + 3; gx < x0 + w - 6; gx += 8) buffer.rect(gx, sy - 9 + Math.floor(next() * 3), 5, 9 - Math.floor(next() * 3), GOODS[Math.floor(next() * GOODS.length)])
  }
}

/**
 * A little convenience store at night, seen from the sidewalk: the sign
 * and the striped awning in the accent, two windows full of shelves, a
 * drinks fridge, the door with its OPEN neon, a vending machine outside;
 * the burger waiting at the door, a customer coming.
 */
function drawStoreScene(buffer: PixelBuffer, accent: string, frame: number, options: { hero?: boolean } = {}): void {
  const { width, height } = buffer
  buffer.clear(NIGHT)
  stars(buffer, frame, 5, 30, 130)
  const sx = 32, sw = 384, signTop = 142, awningTop = 162, wallTop = 181, sill = 262, base = 292
  // the sign
  buffer.rect(sx, signTop, sw, awningTop - signTop, accent)
  buffer.rect(sx, signTop, sw, 2, dim(accent, 0.6))
  drawTextCentered(buffer, 'MINI MART', signTop + 5, CREAM, 2)
  drawText(buffer, '24H', sx + sw - 30, signTop + 7, CREAM, 1)
  // the awning: stripes, a scalloped edge
  for (let x = sx; x < sx + sw; x += 16) buffer.rect(x, awningTop, 16, 16, Math.floor((x - sx) / 16) % 2 === 0 ? accent : CREAM)
  for (let x = sx; x < sx + sw; x += 8) buffer.rect(x + 2, awningTop + 16, 4, 3, Math.floor((x - sx) / 16) % 2 === 0 ? accent : CREAM)
  // the wall and the glass
  buffer.rect(sx, wallTop, sw, sill - wallTop, '#1e1e2a')
  shelves(buffer, sx + 8, wallTop + 4, 156, sill - wallTop - 10, 21)
  shelves(buffer, sx + 300, wallTop + 4, 76, sill - wallTop - 10, 33)
  // the drinks fridge: a chrome box, its light on, rows of cans
  buffer.rect(sx + 222, wallTop + 4, 72, sill - wallTop - 10, CHROME)
  buffer.rect(sx + 226, wallTop + 8, 64, sill - wallTop - 18, frame % 7 === 6 ? '#2a3a4a' : '#3a5a6a')
  const cans = rng(44)
  for (let ry = wallTop + 14; ry < sill - 16; ry += 14) for (let cx = sx + 230; cx < sx + 286; cx += 8) buffer.rect(cx, ry, 5, 9, GOODS[Math.floor(cans() * GOODS.length)])
  // the door: the frame in the accent, glass, the push bar, the neon
  buffer.rect(sx + 168, wallTop, 50, sill - wallTop, accent)
  buffer.rect(sx + 172, wallTop + 4, 42, sill - wallTop - 4, '#141c2c')
  buffer.rect(sx + 176, wallTop + 44, 34, 3, CHROME)
  drawText(buffer, 'OPEN', sx + 193 - Math.floor(textWidth('OPEN', 1) / 2), wallTop + 14, frame % 6 === 5 ? '#3a3a36' : accent, 1)
  // the low wall in brick, the tiles of the sidewalk
  const brick = dim(accent, 0.28)
  buffer.rect(sx, sill, sw, base - sill, brick)
  for (let by = sill; by < base; by += 8) { buffer.rect(sx, by, sw, 1, NIGHT); for (let bx = sx + ((by / 8) % 2 ? 0 : 12); bx < sx + sw; bx += 24) buffer.rect(bx, by, 1, 8, NIGHT) }
  buffer.rect(0, base, width, height - base, '#2a2a26')
  for (let tx = 0; tx < width; tx += 32) buffer.rect(tx, base, 1, height - base, '#1e1e1a')
  buffer.rect(0, base, width, 1, '#4a4a44')
  // the vending machine at the left, the bin at the right
  buffer.rect(2, 214, 26, base - 214, accent)
  buffer.rect(5, 218, 20, 40, frame % 9 === 8 ? '#2a3a4a' : '#7fd4ff')
  for (let ry = 222; ry < 254; ry += 10) for (let cx = 8; cx < 22; cx += 6) buffer.rect(cx, ry, 4, 7, GOODS[(ry + cx) % GOODS.length])
  buffer.rect(8, 262, 14, 3, CREAM); buffer.rect(8, 270, 14, 12, '#121210')
  buffer.rect(width - 26, 270, 18, base - 270, GREY); buffer.rect(width - 28, 268, 22, 3, '#5a5a52')
  if (options.hero !== false) {
    // the burger at the door, sweating, and a customer coming down the sidewalk
    const bounce = frame % 2 === 0 ? 0 : 3
    buffer.blit(BURGER[frame % 2], sx + 178, base - 32 - bounce, BURGER_PALETTE, { scale: 2 })
    buffer.rect(sx + 212, base - 26 - bounce, 2, 4, '#7fd4ff')
    const walker = width - 40 - ((frame * 6) % 200)
    buffer.blit(HUMAN[frame % 2], walker, base - 32, humanPalette(HUMAN_COLORS[1]), { scale: 2, flipX: true })
    buffer.blit(HUMAN[(frame + 1) % 2], 40 + ((frame * 4) % 120), base - 32, humanPalette(HUMAN_COLORS[3]), { scale: 2 })
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

/**
 * The maze as the aisles of the store: every wall cell inside is a shelf
 * unit with goods on its boards; the outer ring is the store's wall in the
 * accent's shade. Corridors stay black, so the way reads at a glance.
 */
function drawAisles(buffer: PixelBuffer, top: number, accent: string): void {
  const wall = dim(accent, 0.3), wallEdge = dim(accent, 0.55)
  const isWall = (x: number, y: number) => y >= 0 && y < MAZE_HEIGHT && x >= 0 && x < MAZE_WIDTH && MAZE[y][x] === '#'
  const next = rng(77)
  MAZE.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== '#') continue
      const px = x * CELL, py = top + y * CELL
      const outer = x === 0 || y === 0 || x === MAZE_WIDTH - 1 || y === MAZE_HEIGHT - 1
      if (outer) {
        buffer.rect(px, py, CELL, CELL, wall)
        if (!isWall(x, y - 1)) buffer.rect(px, py, CELL, 2, wallEdge)
        if (!isWall(x, y + 1)) buffer.rect(px, py + CELL - 2, CELL, 2, wallEdge)
        if (!isWall(x - 1, y)) buffer.rect(px, py, 2, CELL, wallEdge)
        if (!isWall(x + 1, y)) buffer.rect(px + CELL - 2, py, 2, CELL, wallEdge)
        continue
      }
      // a shelf unit: the boards run on into the next unit, two boxes of goods on each board
      const joinLeft = isWall(x - 1, y) && x - 1 > 0, joinRight = isWall(x + 1, y) && x + 1 < MAZE_WIDTH - 1
      buffer.rect(px + (joinLeft ? 0 : 1), py + 1, CELL - (joinLeft ? 0 : 1) - (joinRight ? 0 : 1), CELL - 2, '#15151c')
      for (const sy of [py + 7, py + 14]) {
        buffer.rect(px + (joinLeft ? 0 : 1), sy, CELL - (joinLeft ? 0 : 1) - (joinRight ? 0 : 1), 1, CHROME_DARK)
        for (const gx of [px + 3, px + 9]) buffer.rect(gx, sy - 5, 4, 5, GOODS[Math.floor(next() * GOODS.length)])
      }
    }
  })
}

function drawPanel(buffer: PixelBuffer, x: number, y: number, width: number, height: number, accent: string): void {
  buffer.rect(x, y, width, height, '#0a0a0a')
  buffer.rect(x, y, width, 2, accent); buffer.rect(x, y + height - 2, width, 2, accent)
  buffer.rect(x, y, 2, height, accent); buffer.rect(x + width - 2, y, 2, height, accent)
}

// ---------------------------------------------------------------- screens

export function renderTitle(game: Game, accent: string, options: { level?: number; best?: number; frame?: number; blink?: boolean } = {}): PixelBuffer {
  const { width, height } = canvasSize(game)
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  if (game === 'catcher') {
    drawStoreScene(buffer, accent, frame)
    drawCatcherLogo(buffer, Math.floor((width - CATCHER_LOGO_WIDTH) / 2), MARK_TOP, accent, frame)
  } else {
    drawDinerScene(buffer, accent, frame)
  }
  drawLogoCentered(buffer, LOGO_TOP, accent, 2)
  if (options.blink !== false) drawTextCentered(buffer, 'PRESS PLAY', height - 40, CREAM, 2)
  drawTextCentered(buffer, `LEVEL ${options.level ?? 1}   BEST ${String(options.best ?? 0).padStart(5, '0')}`, height - 18, GREY, 1)
  return buffer
}

/** A moment of RANDOM CATCHER: the aisles, the pellets, the burger, the humans, the sauces. */
export function renderCatcherPlay(accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize('catcher')
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  drawHud(buffer, accent, options.level ?? 1, options.score ?? 120, options.lives ?? 3)
  const top = HUD_ROWS * CELL
  drawAisles(buffer, top, accent)
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

/** A moment of RANDOM EATER: the diner's checkered floor in a frame, the eater stretched with a bend, mini burgers to eat. */
export function renderEaterPlay(accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize('eater')
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  drawHud(buffer, accent, options.level ?? 1, options.score ?? 70, options.lives ?? 1)
  const top = HUD_ROWS * CELL
  for (let y = top; y < height; y += CELL) for (let x = 0; x < width; x += CELL) buffer.rect(x, y, CELL, CELL, ((x + y - top) / CELL) % 2 === 0 ? '#0c0c0c' : '#000000')
  buffer.rect(0, top, width, 2, accent); buffer.rect(0, height - 2, width, 2, accent); buffer.rect(0, top, 2, height - top, accent); buffer.rect(width - 2, top, 2, height - top, accent)
  // the body: the head going up at column 9, the shoulders, two pieces up, then the bend and four pieces along row 12, the legs at the end
  const palette = eaterPalette(accent)
  const at = (cx: number, cy: number): [number, number] => [cx * CELL, top + cy * CELL]
  let [x, y] = at(9, 8); buffer.blit(facing(CRAWL_HEAD, 'up'), x, y, palette)
  ;[x, y] = at(9, 9); buffer.blit(facing(CRAWL_SHOULDERS[frame % 2], 'up'), x, y, palette)
  const trail: Array<[number, number, Direction]> = [[9, 10, 'up'], [9, 11, 'up'], [9, 12, 'up'], [8, 12, 'right'], [7, 12, 'right'], [6, 12, 'right']]
  trail.forEach(([cx, cy, dir], index) => { const look = torsoLook(index, accent); [x, y] = at(cx, cy); buffer.blit(facing(look.sprite, dir), x, y, { ...palette, ...look.palette }) })
  ;[x, y] = at(5, 12); buffer.blit(facing(CRAWL_LEGS[frame % 2], 'right'), x, y, palette)
  for (const [cx, cy] of [[9, 4], [17, 15], [3, 19], [20, 4]] as const) { [x, y] = at(cx, cy); buffer.blit(MINI_BURGER, x + 2, y + 4, MINI_BURGER_PALETTE) }
  return buffer
}

export function renderPlay(game: Game, accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  return game === 'catcher' ? renderCatcherPlay(accent, options) : renderEaterPlay(accent, options)
}

export type Outcome = 'won' | 'lost'
/** The end: the game's scene behind, the marks, a panel with the verdict, the score and the two choices. */
export function renderEnd(game: Game, accent: string, outcome: Outcome, options: { score?: number; level?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize(game)
  const buffer = new PixelBuffer(width, height, BG)
  const frame = options.frame ?? 0
  let py: number
  if (game === 'catcher') {
    drawStoreScene(buffer, accent, frame, { hero: false })
    drawCatcherLogo(buffer, Math.floor((width - CATCHER_LOGO_WIDTH) / 2), MARK_TOP, accent, frame)
    py = MARK_TOP + CATCHER_LOGO_HEIGHT + 4
  } else {
    drawDinerScene(buffer, accent, frame, { hero: false })
    py = 114 + EATER_LOGO_HEIGHT + 20
  }
  drawLogoCentered(buffer, LOGO_TOP, accent, 2)
  const panelW = Math.min(width - 32, 300), panelH = 112
  const px = Math.floor((width - panelW) / 2)
  py = Math.min(py, height - panelH - 16)
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
