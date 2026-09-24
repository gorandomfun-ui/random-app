/**
 * The screens of both games, drawn still: the title, a moment of play, the
 * end. The mock shows them, the report pictures them, and the games will
 * draw the same screens in motion. Black background, the site's accent,
 * cream for the words.
 */

import { BASE_CREAM } from '@/lib/theme'

import { drawLogoCentered, LOGO_HEIGHT } from './logo'
import { cellsOf, MAZE, MAZE_HEIGHT, MAZE_WIDTH } from './maze'
import { drawText, drawTextCentered, PixelBuffer, textWidth } from './pixels'
import {
  BURGER, BURGER_PALETTE, CELL, EATER_HEAD, EATER_LEGS, EATER_TORSO, EATER_TURN, eaterPalette, FOOD_IMAGE, FOOD_TEXT, FOOD_VIDEO, foodPalette,
  HUMAN, HUMAN_COLORS, humanPalette, ITEM_PALETTE, ONION, PELLET, PICKLE, SAUCE, SAUCE_PALETTE, TOMATO, WALL, wallPalette,
} from './sprites'

export type Game = 'catcher' | 'eater'
export const GAME_NAMES: Record<Game, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER' }
/** The HUD takes two cells at the top of every board. */
export const HUD_ROWS = 2
export const BOARD: Record<Game, { cols: number; rows: number }> = { catcher: { cols: MAZE_WIDTH, rows: MAZE_HEIGHT }, eater: { cols: 24, rows: 24 } }
export function canvasSize(game: Game): { width: number; height: number } {
  return { width: BOARD[game].cols * CELL, height: (BOARD[game].rows + HUD_ROWS) * CELL }
}

const BG = '#000000'
const CREAM = BASE_CREAM

function drawHud(buffer: PixelBuffer, accent: string, level: number, score: number, lives: number): void {
  buffer.rect(0, 0, buffer.width, HUD_ROWS * CELL, BG)
  drawText(buffer, `LV ${level}`, 4, 5, accent)
  drawTextCentered(buffer, String(score).padStart(5, '0'), 5, CREAM)
  const hearts = '♥'.repeat(lives)
  drawText(buffer, hearts, buffer.width - 4 - textWidth(hearts), 5, '#d90845')
  // the pause button, top right of the board, always there
  drawText(buffer, 'II', buffer.width - 12, 13, accent)
}

/** The burger's character card for the title screen: the burger, big. */
function drawCatcherHero(buffer: PixelBuffer, y: number, frame: number): void {
  buffer.blit(BURGER[frame % 2], Math.floor(buffer.width / 2) - 12, y, BURGER_PALETTE, { scale: 3 })
}

function drawEaterHero(buffer: PixelBuffer, y: number, accent: string, frame: number): void {
  const x = Math.floor(buffer.width / 2) - 12
  const palette = eaterPalette(accent)
  buffer.blit(EATER_LEGS.right[frame % 2], x - 24, y, palette, { scale: 3 })
  buffer.blit(EATER_TORSO.horizontal, x, y, palette, { scale: 3 })
  buffer.blit(EATER_HEAD.right, x + 24, y, palette, { scale: 3 })
}

export function renderTitle(game: Game, accent: string, options: { level?: number; best?: number; frame?: number; blink?: boolean } = {}): PixelBuffer {
  const { width, height } = canvasSize(game)
  const buffer = new PixelBuffer(width, height, BG)
  drawLogoCentered(buffer, 10, accent)
  drawTextCentered(buffer, GAME_NAMES[game], 10 + LOGO_HEIGHT + 10, CREAM, 2)
  const heroY = 10 + LOGO_HEIGHT + 10 + 16 + 12
  if (game === 'catcher') drawCatcherHero(buffer, heroY, options.frame ?? 0)
  else drawEaterHero(buffer, heroY, accent, options.frame ?? 0)
  if (options.blink !== false) drawTextCentered(buffer, 'PRESS PLAY', heroY + 24 + 14, accent)
  drawTextCentered(buffer, `LEVEL ${options.level ?? 1}   BEST ${String(options.best ?? 0).padStart(5, '0')}`, height - 12, '#8a8a82')
  return buffer
}

/** A moment of RANDOM CATCHER: the maze, the pellets, the burger, four humans, a sauce. */
export function renderCatcherPlay(accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize('catcher')
  const buffer = new PixelBuffer(width, height, BG)
  drawHud(buffer, accent, options.level ?? 1, options.score ?? 120, options.lives ?? 3)
  const top = HUD_ROWS * CELL
  const walls = wallPalette(accent)
  MAZE.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const char = row[x]
      const px = x * CELL, py = top + y * CELL
      if (char === '#') buffer.blit(WALL, px, py, walls)
      else if (char === '.') buffer.blit(PELLET, px + 3, py + 3, { w: CREAM })
      else if (char === 'S') buffer.blit(SAUCE, px + 1, py, SAUCE_PALETTE)
    }
  })
  // a few ingredients in place of pellets, to show what is picked up
  const spots = [[2, 1], [6, 4], [13, 6], [21, 4], [25, 1], [9, 14], [18, 18]] as const
  spots.forEach(([x, y], index) => {
    const sprite = [TOMATO, PICKLE, ONION][index % 3]
    buffer.rect(x * CELL, top + y * CELL, CELL, CELL, BG)
    buffer.blit(sprite, x * CELL + 1, top + y * CELL + 1, ITEM_PALETTE)
  })
  const [start] = cellsOf('B')
  buffer.rect(start.x * CELL, top + start.y * CELL, CELL, CELL, BG)
  buffer.blit(BURGER[(options.frame ?? 0) % 2], start.x * CELL, top + start.y * CELL, BURGER_PALETTE)
  const pen = cellsOf('H')
  pen.slice(0, 4).forEach((cell, index) => buffer.blit(HUMAN[(index + (options.frame ?? 0)) % 2], cell.x * CELL, top + cell.y * CELL, humanPalette(HUMAN_COLORS[index])))
  // one human out on the prowl
  buffer.blit(HUMAN[(options.frame ?? 0) % 2], 6 * CELL, top + 6 * CELL, humanPalette(HUMAN_COLORS[1]))
  return buffer
}

/** A moment of RANDOM EATER: the border, the human stretched over seven cells with a bend, three contents to eat. */
export function renderEaterPlay(accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize('eater')
  const buffer = new PixelBuffer(width, height, BG)
  drawHud(buffer, accent, options.level ?? 1, options.score ?? 70, options.lives ?? 1)
  const top = HUD_ROWS * CELL
  buffer.rect(0, top, width, 1, accent)
  buffer.rect(0, height - 1, width, 1, accent)
  buffer.rect(0, top, 1, height - top, accent)
  buffer.rect(width - 1, top, 1, height - top, accent)
  const palette = eaterPalette(accent)
  const at = (cx: number, cy: number) => [cx * CELL, top + cy * CELL] as const
  // legs at the tail, going right, then the torso, a bend upwards, the head at the top
  const frame = options.frame ?? 0
  let [x, y] = at(5, 12); buffer.blit(EATER_LEGS.right[frame % 2], x, y, palette)
  for (const cx of [6, 7, 8, 9]) { [x, y] = at(cx, 12); buffer.blit(EATER_TORSO.horizontal, x, y, palette) }
  ;[x, y] = at(10, 12); buffer.blit(EATER_TURN['left-up'], x, y, palette)
  for (const cy of [11, 10]) { [x, y] = at(10, cy); buffer.blit(EATER_TORSO.vertical, x, y, palette) }
  ;[x, y] = at(10, 9); buffer.blit(EATER_HEAD.up, x, y, palette)
  const food = foodPalette(accent)
  ;[x, y] = at(10, 5); buffer.blit(FOOD_VIDEO, x + 1, y + 1, food)
  ;[x, y] = at(17, 15); buffer.blit(FOOD_IMAGE, x + 1, y + 1, food)
  ;[x, y] = at(4, 19); buffer.blit(FOOD_TEXT, x + 1, y + 1, food)
  return buffer
}

export function renderPlay(game: Game, accent: string, options: { level?: number; score?: number; lives?: number; frame?: number } = {}): PixelBuffer {
  return game === 'catcher' ? renderCatcherPlay(accent, options) : renderEaterPlay(accent, options)
}

export type Outcome = 'won' | 'lost'
export function renderEnd(game: Game, accent: string, outcome: Outcome, options: { score?: number; level?: number } = {}): PixelBuffer {
  const { width, height } = canvasSize(game)
  const buffer = new PixelBuffer(width, height, BG)
  drawLogoCentered(buffer, 10, accent)
  const title = outcome === 'won' ? (game === 'eater' ? 'LEVEL UP' : 'LEVEL CLEAR') : 'GAME OVER'
  drawTextCentered(buffer, title, 10 + LOGO_HEIGHT + 14, outcome === 'won' ? accent : '#d90845', 2)
  drawTextCentered(buffer, `SCORE ${String(options.score ?? 0).padStart(5, '0')}`, 10 + LOGO_HEIGHT + 14 + 18, CREAM)
  drawTextCentered(buffer, `LEVEL ${options.level ?? 1}`, 10 + LOGO_HEIGHT + 14 + 28, '#8a8a82')
  const y = Math.min(height - 22, 10 + LOGO_HEIGHT + 14 + 48)
  const left = outcome === 'won' ? 'CONTINUER' : 'REJOUER'
  const right = outcome === 'won' ? 'QUITTER' : 'CONTINUER'
  const half = Math.floor(width / 2)
  drawText(buffer, `> ${left}`, half - textWidth(`> ${left}`) - 6, y, accent)
  drawText(buffer, right, half + 6, y, '#8a8a82')
  return buffer
}

/** Every still screen of one game, for the mock and the report. */
export function renderAll(game: Game, accent: string, frame = 0): Array<{ name: string; buffer: PixelBuffer }> {
  return [
    { name: 'titre', buffer: renderTitle(game, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0 }) },
    { name: 'jeu', buffer: renderPlay(game, accent, { level: 3, score: 1280, lives: game === 'catcher' ? 2 : 1, frame }) },
    { name: 'fin-gagne', buffer: renderEnd(game, accent, 'won', { score: 1280, level: 3 }) },
    { name: 'fin-perdu', buffer: renderEnd(game, accent, 'lost', { score: 640, level: 3 }) },
  ]
}
