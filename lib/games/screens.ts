/**
 * The screens of both games, wide or tall: the title on its night street,
 * a moment of play, GAME OVER. The title and GAME OVER are drawn twice as
 * fine as play, with the play sprites smoothed to that finer grid, so the
 * characters stay the same. RANDOM CATCHER opens on the front of a little
 * convenience store and plays inside it, seen from above; RANDOM EATER
 * opens on a diner, its neon sign the game's own mark, and plays on the
 * diner's floor. Everything takes the theme's accent.
 */

import { drawLogo, LOGO_WIDTH } from './logo'
import { catcherLogoSize, drawCatcherLogo, drawEaterLogo, eaterLogoSize } from './logos'
import { mazeFor, MAZE_HEIGHT, MAZE_WIDTH } from './maze'
import { dim, mix, PixelBuffer, scale2x, type Palette, type Sprite } from './pixels'
import {
  bin, car, city, cloud, drawDiner, drawStore, hedge, lamp, moon, NIGHTS, palm, railing, signFrame, sky, stars, street, tree, vending, wisp, type Night,
} from './scenes'
import {
  BURGER, BURGER_PALETTE, CELL, CHEESE, CRAWL_ARMS, CRAWL_HEAD, CRAWL_LEGS, eaterPalette, facing, HUMAN, humanPalette, ITEM_PALETTE,
  MINI_BURGER, MINI_BURGER_PALETTE, ONION, PICKLE, SAUCE, SAUCE_PALETTE, TOMATO, torsoLook, tubePiece, type Direction,
} from './sprites'
import { arcadeText, button, CREAM, dpad, hud, HUD_HEIGHT, infoLine, INK, pressStart } from './ui'

export type Game = 'catcher' | 'eater'
export type Layout = 'landscape' | 'portrait'
export type Floor = 'plain' | 'tiles' | 'checker'
export const GAME_NAMES: Record<Game, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER' }
export const LAYOUTS: readonly Layout[] = ['landscape', 'portrait']

/** The title and GAME OVER: a scene the size of a screen, sixteen by nine or nine by sixteen, in fine pixels. */
export const SCENE_SIZE: Record<Layout, { width: number; height: number }> = { landscape: { width: 768, height: 432 }, portrait: { width: 432, height: 768 } }
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

/** The title screens' sprites: the play sprites, smoothed to the finer grid. */
const fine = new Map<Sprite, Sprite>()
const smooth = (sprite: Sprite): Sprite => { let out = fine.get(sprite); if (!out) { out = scale2x(sprite); fine.set(sprite, out) } return out }

/** Where things stand on a street scene, for a game and a layout. */
type Stage = {
  ground: number; building: [number, number]; horizon: number; skyline: number
  randomY: number; markY: number; markSize: number
  road: { bottom: number; line: number; lanes: number[] }
  press: number; info: 'top' | 'bottom'
  moon: [number, number, number]; clouds: Array<[number, number, number]>; wisps: Array<[number, number, number]>
  lamps: number[]; greens: number[]; greenSize: number
}

function stage(game: Game, layout: Layout): Stage {
  if (layout === 'landscape') {
    return game === 'catcher'
      ? { ground: 332, building: [200, 368], horizon: 300, skyline: 190, randomY: 12, markY: 62, markSize: 1, road: { bottom: 432, line: 404, lanes: [364] }, press: 412, info: 'top', moon: [690, 70, 17], clouds: [[14, 84, 170], [590, 120, 170], [520, 26, 96]], wisps: [[210, 44, 60], [60, 40, 44]], lamps: [96, 672], greens: [38, 730], greenSize: 30 }
      : { ground: 332, building: [152, 464], horizon: 300, skyline: 200, randomY: 10, markY: 62, markSize: 1.7, road: { bottom: 432, line: 404, lanes: [364] }, press: 412, info: 'top', moon: [686, 64, 17], clouds: [[6, 96, 176], [600, 128, 166], [548, 22, 90]], wisps: [[230, 52, 56]], lamps: [118, 650], greens: [56, 712], greenSize: 190 }
  }
  return game === 'catcher'
    ? { ground: 562, building: [32, 368], horizon: 540, skyline: 250, randomY: 236, markY: 300, markSize: 0.72, road: { bottom: 700, line: 640, lanes: [596, 650] }, press: 716, info: 'bottom', moon: [352, 82, 22], clouds: [[8, 104, 176], [214, 166, 200]], wisps: [[40, 40, 70], [250, 50, 60]], lamps: [14, 418], greens: [], greenSize: 0 }
    : { ground: 562, building: [16, 400], horizon: 540, skyline: 250, randomY: 196, markY: 256, markSize: 1.95, road: { bottom: 700, line: 640, lanes: [596, 650] }, press: 716, info: 'bottom', moon: [352, 82, 22], clouds: [[8, 96, 176], [210, 150, 200]], wisps: [[40, 40, 70]], lamps: [], greens: [], greenSize: 0 }
}

type SceneOptions = { frame: number; lit: boolean; hero: boolean; building: boolean }

/** The night street of a game, its building and the game's own mark, its traffic, and its hero on the sidewalk. */
function drawStreetScene(buffer: PixelBuffer, game: Game, layout: Layout, accent: string, options: SceneOptions): Stage {
  const s = stage(game, layout)
  const night: Night = NIGHTS[game === 'catcher' ? 'blue' : 'violet']
  const { width: W, height: H } = buffer
  const { frame, lit } = options
  sky(buffer, night, s.horizon)
  stars(buffer, game === 'catcher' ? 7 : 11, layout === 'landscape' ? 130 : 150, s.horizon - 60, frame)
  moon(buffer, ...s.moon)
  s.wisps.forEach(([x, y, w]) => wisp(buffer, x, y, w, night))
  s.clouds.forEach(([x, y, w], i) => cloud(buffer, x, y, w, night, 5 + i * 13))
  city(buffer, night, s.ground - 16, s.skyline, game === 'catcher' ? 17 : 23, frame)
  const [bx, bw] = s.building
  if (game === 'eater') s.greens.forEach((x, i) => palm(buffer, x, s.ground - 10, s.greenSize, i === 0 ? 1 : -1, night))
  railing(buffer, s.ground - 26, game === 'catcher' ? '#343c6c' : '#3c3068')
  if (game === 'catcher') {
    if (options.building) {
      drawStore(buffer, bx, bw, s.ground, accent, frame, lit)
      if (layout === 'landscape') { vending(buffer, bx - 50, s.ground, accent, lit); bin(buffer, bx + bw + 18, s.ground, dim(accent, 0.55)) }
    }
    s.greens.forEach((x, i) => tree(buffer, x, s.ground, s.greenSize, night, 3 + i))
  } else if (options.building) {
    const logo = eaterLogoSize(s.markSize)
    const roof = s.ground - 128
    const frameTop = s.markY + Math.round(logo.height * 0.16)
    signFrame(buffer, Math.round(W / 2 - logo.width / 2) - 16, frameTop, logo.width + 32, roof - 6 - frameTop, roof)
    const dark = lit && frame % 11 === 10 ? [3] : []
    drawEaterLogo(buffer, Math.round(W / 2 - logo.width / 2), s.markY, accent, s.markSize, { lit, dark, swashLit: frame % 7 !== 6 })
    drawDiner(buffer, bx, bw, s.ground, accent, frame, lit)
    hedge(buffer, bx - 44, s.ground, 40, night); hedge(buffer, bx + bw + 4, s.ground, 40, night)
  }
  s.lamps.forEach((x, i) => lamp(buffer, x, s.ground, layout === 'landscape' ? 112 : 150, i === 1))
  street(buffer, night, s.ground, 22, s.road.bottom, s.road.line)
  if (s.road.bottom < H) {
    // the near sidewalk under the road on a tall screen
    buffer.rect(0, s.road.bottom, W, H - s.road.bottom, dim(night.sidewalk, 0.55))
    buffer.rect(0, s.road.bottom, W, 3, night.sidewalkLight)
    for (let x = 24; x < W; x += 48) buffer.rect(x, s.road.bottom + 3, 1, H - s.road.bottom - 3, dim(night.sidewalk, 0.42))
  }
  // traffic: a car in each lane, each at its own speed and way
  const colors = game === 'catcher' ? ['#eeeae0', '#e0304a'] : ['#eeeae0', '#e8563a']
  s.road.lanes.forEach((y, i) => {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1
    const span = W + 240
    const pos = ((frame * (i === 0 ? 22 : 16) + (i === 0 ? 60 : 380)) % span) - 120
    car(buffer, dir === 1 ? pos : W - pos - 104, y, colors[i % colors.length], dir)
  })
  if (options.hero) {
    const door = bx + Math.round(bw / 2)
    if (game === 'catcher') {
      // the burger at the door, chomping; a shopper at the window
      buffer.blit(smooth(BURGER[frame % 2]), door - 16, s.ground - 26, BURGER_PALETTE)
      buffer.blit(smooth(HUMAN[frame % 2]), door + (layout === 'landscape' ? 112 : 96), s.ground - 26, humanPalette(1))
    } else {
      // the eater crawling to the door, a burger on his way
      const head = door - 60 + (frame % 4) * 3
      drawCrawler(buffer, head, s.ground - 6, accent, frame, 1)
      buffer.blit(smooth(MINI_BURGER), head + 40, s.ground + 3, MINI_BURGER_PALETTE)
    }
  }
  return s
}

/** The eater on a street, crawling right, in fine pixels: legs, `torso` pieces, shoulders with their arms, the head at `x`. */
function drawCrawler(buffer: PixelBuffer, x: number, y: number, accent: string, frame: number, torso: number): void {
  const palette = eaterPalette(accent)
  const step = CELL * 2
  const shirt = tubePiece('right', 'left', { pattern: 'plain', cloth: accent, print: accent })
  let cx = x - (torso + 2) * step
  buffer.blit(smooth(CRAWL_LEGS[frame % 2]), cx, y, palette); cx += step
  for (let i = 0; i < torso; i += 1) { const t = tubePiece('right', 'left', torsoLook(i)); buffer.blit(scale2x(t.sprite), cx, y, t.palette); cx += step }
  buffer.blit(scale2x(shirt.sprite), cx, y, shirt.palette); buffer.blit(smooth(CRAWL_ARMS[frame % 2]), cx, y, palette); cx += step
  buffer.blit(smooth(CRAWL_HEAD), cx, y, palette)
}

/** The marks: RANDOM at the top in its big pixels, then CATCHER's letters in volume (EATER's neon hangs on its diner). */
function drawMarks(buffer: PixelBuffer, game: Game, s: Stage, accent: string, frame: number): void {
  const W = buffer.width
  const x = Math.round(W / 2 - LOGO_WIDTH)
  drawLogo(buffer, x + 2, s.randomY + 3, INK, 2)
  drawLogo(buffer, x, s.randomY, mix(accent, CREAM, 0.25), 2)
  if (game === 'catcher') {
    const size = catcherLogoSize(s.markSize)
    drawCatcherLogo(buffer, Math.round(W / 2 - size.width / 2), s.markY, accent, s.markSize, frame)
  }
}

// ---------------------------------------------------------------- the fine screens

export type TitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean }

export function renderTitle(game: Game, layout: Layout, accent: string, options: TitleOptions = {}): PixelBuffer {
  const { width, height } = SCENE_SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const s = drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: true, building: true })
  drawMarks(buffer, game, s, accent, frame)
  pressStart(buffer, width / 2, s.press, accent, options.blink !== false, 2)
  const level = String(options.level ?? 1), best = String(options.best ?? 0).padStart(5, '0')
  if (s.info === 'top') {
    infoLine(buffer, 16, 16, 'LEVEL', level, 'left', 2)
    infoLine(buffer, width - 16, 16, 'BEST', best, 'right', 2)
  } else {
    infoLine(buffer, width / 2 - 14, s.press + 28, 'LEVEL', level, 'right', 2)
    infoLine(buffer, width / 2 + 14, s.press + 28, 'BEST', best, 'left', 2)
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
  drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: false, building: false })
  buffer.shade(0, 0, width, height, 0.6)
  const c = width / 2
  const score = String(options.score ?? 0).padStart(5, '0'), best = String(options.best ?? 0).padStart(5, '0')
  const chosen = options.blink !== false
  if (layout === 'landscape') {
    arcadeText(buffer, 'GAME OVER', c, 70, 8, accent)
    infoLine(buffer, c - 20, 150, 'SCORE', score, 'right', 2)
    infoLine(buffer, c + 20, 150, 'BEST', best, 'left', 2)
    arcadeText(buffer, 'PLAY AGAIN?', c, 192, 4, accent)
    button(buffer, 'YES', c - 64, 244, accent, chosen, 2)
    button(buffer, 'NO', c + 64, 244, accent, false, 2)
  } else {
    arcadeText(buffer, 'GAME', c, 120, 11, accent)
    arcadeText(buffer, 'OVER', c, 214, 11, accent)
    infoLine(buffer, c, 318, 'SCORE', score, 'centre', 2)
    infoLine(buffer, c, 346, 'BEST', best, 'centre', 2)
    arcadeText(buffer, 'PLAY AGAIN?', c, 392, 3, accent)
    button(buffer, 'YES', c - 64, 440, accent, chosen, 2)
    button(buffer, 'NO', c + 64, 440, accent, false, 2)
  }
  return buffer
}

// ---------------------------------------------------------------- CATCHER in play

export type PlayOptions = { level?: number; score?: number; lives?: number; frame?: number; floor?: Floor; obstacles?: boolean }

const FLOOR = '#161a2c'
/** The colour strip along each gondola's shelf edges, one per aisle, like a store's departments. */
const DEPARTMENTS = ['#5ad06a', '#4a9cff', '#ff6a5a', '#ffcc33', '#b07aff', '#4ad0d0', '#ff9a3a', '#ff7ab0']

/**
 * The store seen from above, plain around the characters: a dark floor;
 * the gondolas as grey blocks with a lit edge and a shadow, the line of
 * their back panel, a department's colour along the shelf edges and the
 * ends capped in the accent; fridges along the walls with their glass
 * doors; produce tables as wooden crates; checkout counters with their
 * belts and tills; the store's wall with a line of the accent; the
 * entrance's sliding doors.
 */
function drawStoreFloor(buffer: PixelBuffer, maze: readonly string[], top: number, accent: string, tall: boolean): void {
  const h = maze.length, w = maze[0].length
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : maze[y][x])
  const walkable = (x: number, y: number) => '.B'.includes(at(x, y))
  buffer.rect(0, top, w * CELL, h * CELL, FLOOR)
  // a faint grid of floor tiles
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (walkable(x, y)) { buffer.rect(x * CELL, top + y * CELL, CELL, 1, '#1b2034'); buffer.rect(x * CELL, top + y * CELL, 1, CELL, '#1b2034') }
  const shelfTop = '#8c92ab', shelfLight = '#b8bdd0', shelfShadow = '#555b76', shelfLine = '#6c728c'
  // gondolas: find each block of `=` and draw it whole
  const done = new Set<string>()
  let dept = 0
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (at(x, y) !== '=' || done.has(`${x},${y}`)) continue
    let x1 = x, y1 = y
    while (at(x1 + 1, y) === '=') x1 += 1
    while (at(x, y1 + 1) === '=' && at(x1, y1 + 1) === '=') y1 += 1
    for (let yy = y; yy <= y1; yy += 1) for (let xx = x; xx <= x1; xx += 1) done.add(`${xx},${yy}`)
    const px = x * CELL + 2, py = top + y * CELL + 2, pw = (x1 - x + 1) * CELL - 4, ph = (y1 - y + 1) * CELL - 4
    const vertical = ph > pw
    const strip = DEPARTMENTS[dept % DEPARTMENTS.length]; dept += 1
    buffer.rect(px + 2, py + 2, pw, ph, '#0c0e18')
    buffer.rect(px, py, pw, ph, shelfTop)
    buffer.rect(px, py, pw, 1, shelfLight); buffer.rect(px, py, 1, ph, shelfLight)
    buffer.rect(px, py + ph - 1, pw, 1, shelfShadow); buffer.rect(px + pw - 1, py, 1, ph, shelfShadow)
    if (vertical) {
      buffer.rect(px + Math.floor(pw / 2), py + 3, 1, ph - 6, shelfLine)
      buffer.rect(px + 1, py + 3, 2, ph - 6, strip); buffer.rect(px + pw - 3, py + 3, 2, ph - 6, strip)
      for (let yy = py + CELL - 2; yy < py + ph - 4; yy += CELL) buffer.rect(px + 3, yy, pw - 6, 1, shelfLine)
      buffer.rect(px + 2, py, pw - 4, 2, accent); buffer.rect(px + 2, py + ph - 2, pw - 4, 2, accent)
    } else {
      buffer.rect(px + 3, py + Math.floor(ph / 2), pw - 6, 1, shelfLine)
      buffer.rect(px + 3, py + 1, pw - 6, 2, strip); buffer.rect(px + 3, py + ph - 3, pw - 6, 2, strip)
      for (let xx = px + CELL - 2; xx < px + pw - 4; xx += CELL) buffer.rect(xx, py + 3, 1, ph - 6, shelfLine)
      buffer.rect(px, py + 2, 2, ph - 4, accent); buffer.rect(px + pw - 2, py + 2, 2, ph - 4, accent)
    }
  }
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const c = at(x, y), px = x * CELL, py = top + y * CELL
    if (c === '#') {
      buffer.rect(px, py, CELL, CELL, '#0b0d18')
      if (walkable(x, y - 1)) buffer.rect(px, py, CELL, 2, dim(accent, 0.6))
      if (walkable(x, y + 1)) buffer.rect(px, py + CELL - 2, CELL, 2, dim(accent, 0.6))
      if (walkable(x - 1, y)) buffer.rect(px, py, 2, CELL, dim(accent, 0.6))
      if (walkable(x + 1, y)) buffer.rect(px + CELL - 2, py, 2, CELL, dim(accent, 0.6))
    } else if (c === 'F') {
      // a fridge unit: steel frame, a glass door lit cold, its handle on the aisle side
      const alongX = at(x - 1, y) === 'F' || at(x + 1, y) === 'F'
      buffer.rect(px, py, CELL, CELL, '#c8ccd8')
      if (alongX) {
        const face = walkable(x, y + 1) ? py + CELL - 6 : py
        buffer.rect(px + 1, py + 2, CELL - 2, CELL - 4, '#9ad0f4'); buffer.rect(px + 1, py + 2, CELL - 2, 3, '#d8f0ff')
        buffer.rect(px + CELL - 1, py, 1, CELL, '#8a8ea4'); buffer.rect(px + 6, face + 2, 4, 2, '#eef0f6')
      } else {
        const face = walkable(x + 1, y) ? px + CELL - 6 : px
        buffer.rect(px + 2, py + 1, CELL - 4, CELL - 2, '#9ad0f4'); buffer.rect(px + 2, py + 1, 3, CELL - 2, '#d8f0ff')
        buffer.rect(px, py + CELL - 1, CELL, 1, '#8a8ea4'); buffer.rect(face + 2, py + 6, 2, 4, '#eef0f6')
      }
    } else if (c === 'T') {
      // a produce table: wooden crates, their slats
      buffer.rect(px, py, CELL, CELL, '#8a5a2e')
      buffer.rect(px + 1, py + 1, CELL - 2, CELL - 2, '#a8723c')
      for (let k = 3; k < CELL - 1; k += 4) buffer.rect(px + 1, py + k, CELL - 2, 1, '#7a4a22')
      if (at(x + 1, y) !== 'T') buffer.rect(px + CELL - 1, py, 1, CELL, '#4a2e14')
      if (at(x, y + 1) !== 'T') buffer.rect(px, py + CELL - 1, CELL, 1, '#4a2e14')
    } else if (c === 'K') {
      // a checkout: the counter, its dark belt down the long side, the till at the far end of the other
      buffer.rect(px, py, CELL, CELL, '#b8bccc')
      const run = (dx: number, dy: number) => { let n = 1; for (let k = 1; at(x + dx * k, y + dy * k) === 'K'; k += 1) n += 1; for (let k = 1; at(x - dx * k, y - dy * k) === 'K'; k += 1) n += 1; return n }
      const down = run(0, 1) > run(1, 0)
      if (down ? at(x + 1, y) === 'K' : at(x, y + 1) === 'K') buffer.rect(down ? px + 4 : px, down ? py : py + 4, down ? 8 : CELL, down ? CELL : 8, '#2a2d3a')
      else if (down ? at(x, y - 1) !== 'K' : at(x - 1, y) !== 'K') { buffer.rect(px + 3, py + 3, 10, 9, '#2a2d3a'); buffer.rect(px + 4, py + 4, 8, 4, accent) }
      if (at(x + 1, y) !== 'K') buffer.rect(px + CELL - 1, py, 1, CELL, '#6a6e84')
      if (at(x, y + 1) !== 'K') buffer.rect(px, py + CELL - 1, CELL, 1, '#6a6e84')
    } else if (c === 'D') {
      // the entrance: sliding glass doors, a mat on the floor side
      buffer.rect(px, py, CELL, CELL, '#0b0d18')
      if (tall) { buffer.rect(px + 4, py, 6, CELL, '#9ad0f4'); buffer.rect(px + 4, py, 1, CELL, '#d8f0ff'); buffer.rect(px - 3, py, 3, CELL, '#3a3040') }
      else { buffer.rect(px, py + 4, CELL, 6, '#9ad0f4'); buffer.rect(px, py + 4, CELL, 1, '#d8f0ff'); buffer.rect(px, py - 3, CELL, 3, '#3a3040') }
    }
  }
}

/** A red puddle of sauce spread on the floor. */
function puddle(buffer: PixelBuffer, x: number, y: number): void {
  buffer.disc(x + 8, y + 10, 7, '#a01c10'); buffer.disc(x + 7, y + 9, 6, '#e0301e')
  buffer.disc(x + 13, y + 5, 2, '#e0301e'); buffer.disc(x + 2, y + 13, 1.5, '#e0301e')
  buffer.rect(x + 5, y + 7, 3, 1, '#ff9a8a')
}

/** Little stars turning round a head: a shopper who slipped. */
function dizzy(buffer: PixelBuffer, x: number, y: number, frame: number): void {
  for (let i = 0; i < 3; i += 1) {
    const a = frame * 0.9 + (i * Math.PI * 2) / 3
    const sx = Math.round(x + 8 + Math.cos(a) * 7), sy = Math.round(y - 2 + Math.sin(a) * 2.5)
    buffer.set(sx, sy, '#ffe070'); buffer.set(sx - 1, sy, '#ffcc33'); buffer.set(sx + 1, sy, '#ffcc33'); buffer.set(sx, sy - 1, '#ffcc33'); buffer.set(sx, sy + 1, '#ffcc33')
  }
}

/**
 * A moment of RANDOM CATCHER: the store, the ingredients of the shopping
 * list scattered in the aisles, the burger, shoppers coming in and about,
 * one of them dizzy on a puddle of sauce, a bottle of sauce to pick up.
 */
function renderCatcherPlay(layout: Layout, accent: string, options: PlayOptions): PixelBuffer {
  const { width, height } = playSize(layout)
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const maze = mazeFor(layout)
  const tall = layout === 'portrait'
  const at = (x: number, y: number): [number, number] => (tall ? [y, x] : [x, y])
  const top = HUD_HEIGHT
  drawStoreFloor(buffer, maze, top, accent, tall)
  const put = (sprite: Sprite, palette: Palette, x: number, y: number, dx = 3, dy = 3) => { const [cx, cy] = at(x, y); buffer.blit(sprite, cx * CELL + dx, top + cy * CELL + dy, palette) }
  // the shopping list's ingredients still on the floor
  const items: Array<[Sprite, number, number]> = [
    [TOMATO, 1, 3], [TOMATO, 17, 1], [TOMATO, 26, 13], [PICKLE, 4, 7], [PICKLE, 20, 5], [ONION, 10, 1], [ONION, 23, 9], [ONION, 7, 17],
    [CHEESE, 1, 12], [CHEESE, 14, 6], [CHEESE, 24, 17], [PICKLE, 15, 13],
  ]
  for (const [sprite, x, y] of items) put(sprite, ITEM_PALETTE, x, y)
  // a bottle of sauce to pick up, a puddle with a shopper slipping on it
  put(SAUCE, SAUCE_PALETTE, 7, 3, 2, 1)
  const [px, py] = at(20, 10)
  puddle(buffer, px * CELL, top + py * CELL)
  // the burger in the cross aisle, shoppers: one dizzy, one in an aisle, one coming in at the door
  put(BURGER[frame % 2], BURGER_PALETTE, 11, 10, 0, 0)
  put(HUMAN[0], humanPalette(0), 20, 10, 0, -2)
  dizzy(buffer, px * CELL, top + py * CELL - 2, frame)
  put(HUMAN[frame % 2], humanPalette(2), 7, 13, 0, 0)
  put(HUMAN[(frame + 1) % 2], humanPalette(3), 13, 18, 0, 0)
  hud(buffer, accent, {
    level: options.level ?? 1, score: options.score ?? 0, lives: options.lives ?? 3,
    list: [
      { icon: TOMATO, palette: ITEM_PALETTE, have: 2, need: 5 }, { icon: PICKLE, palette: ITEM_PALETTE, have: 4, need: 4 },
      { icon: ONION, palette: ITEM_PALETTE, have: 1, need: 4 }, { icon: CHEESE, palette: ITEM_PALETTE, have: 0, need: 3 },
    ],
  })
  if (tall) dpad(buffer, width / 2, HUD_HEIGHT + MAZE_WIDTH * CELL + DPAD_HEIGHT / 2, 26, accent)
  return buffer
}

// ---------------------------------------------------------------- EATER in play

/** The diner's furniture seen from above, on higher levels: where each piece stands, the cells it covers. */
type Furniture = { kind: 'table' | 'stool' | 'booth' | 'counter'; x: number; y: number; w: number; h: number }
export const EATER_OBSTACLES: readonly Furniture[] = [
  { kind: 'table', x: 5, y: 4, w: 2, h: 2 },
  { kind: 'table', x: 21, y: 13, w: 2, h: 2 },
  { kind: 'booth', x: 20, y: 3, w: 3, h: 3 },
  { kind: 'counter', x: 6, y: 16, w: 6, h: 1 },
  { kind: 'stool', x: 6, y: 15, w: 1, h: 1 }, { kind: 'stool', x: 8, y: 15, w: 1, h: 1 }, { kind: 'stool', x: 10, y: 15, w: 1, h: 1 },
  { kind: 'stool', x: 4, y: 5, w: 1, h: 1 }, { kind: 'stool', x: 7, y: 4, w: 1, h: 1 },
  { kind: 'stool', x: 23, y: 14, w: 1, h: 1 }, { kind: 'stool', x: 22, y: 12, w: 1, h: 1 },
]

/** Every cell the furniture takes, for a layout. */
export function obstacleCells(layout: Layout): Set<string> {
  const out = new Set<string>()
  for (const f of EATER_OBSTACLES) for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) out.add(layout === 'portrait' ? `${y},${x}` : `${x},${y}`)
  return out
}

function drawFurniture(buffer: PixelBuffer, f: Furniture, top: number, accent: string, tall: boolean): void {
  const [x, y, w, h] = tall ? [f.y, f.x, f.h, f.w] : [f.x, f.y, f.w, f.h]
  const px = x * CELL, py = top + y * CELL, pw = w * CELL, ph = h * CELL
  const chrome = '#c9ccd8', chromeDark = '#6a6e84', shadow = '#0c0a16'
  if (f.kind === 'table') {
    buffer.disc(px + pw / 2 + 2, py + ph / 2 + 2, pw / 2 - 1, shadow)
    buffer.disc(px + pw / 2, py + ph / 2, pw / 2 - 1, chromeDark)
    buffer.disc(px + pw / 2, py + ph / 2, pw / 2 - 2.5, CREAM)
    buffer.disc(px + pw / 2 - 5, py + ph / 2 - 5, 3, '#ffffff')
    buffer.disc(px + pw / 2 - 3, py + ph / 2 + 3, 2, '#e0301e'); buffer.disc(px + pw / 2 + 3, py + ph / 2 + 3, 2, '#ffcc33')
  } else if (f.kind === 'stool') {
    buffer.disc(px + 9, py + 9, 6.5, shadow)
    buffer.disc(px + 8, py + 8, 6.5, chrome)
    buffer.disc(px + 8, py + 8, 5, accent)
    buffer.disc(px + 7, py + 7, 2, mix(accent, '#ffffff', 0.45))
  } else if (f.kind === 'booth') {
    const seat = dim(accent, 0.8), seatLight = mix(accent, '#ffffff', 0.2)
    buffer.rect(px + 2, py + 2, pw, ph, shadow)
    const benches = tall ? [[px, py, CELL, ph], [px + pw - CELL, py, CELL, ph]] : [[px, py, pw, CELL], [px, py + ph - CELL, pw, CELL]]
    for (const [bx, by, bw, bh] of benches) {
      buffer.rect(bx, by, bw, bh, seat); buffer.rect(bx + 1, by + 1, bw - 2, bh - 2, seatLight)
      if (tall) for (let k = 4; k < bh - 2; k += 6) buffer.rect(bx + 3, by + k, bw - 6, 1, seat)
      else for (let k = 4; k < bw - 2; k += 6) buffer.rect(bx + k, by + 3, 1, bh - 6, seat)
    }
    const [tx, ty, tw, th] = tall ? [px + CELL, py + 2, pw - 2 * CELL, ph - 4] : [px + 2, py + CELL, pw - 4, ph - 2 * CELL]
    buffer.rect(tx, ty, tw, th, chromeDark); buffer.rect(tx + 1, ty + 1, tw - 2, th - 2, CREAM)
  } else {
    buffer.rect(px + 2, py + 2, pw, ph, shadow)
    buffer.rect(px, py, pw, ph, chromeDark); buffer.rect(px + 1, py + 1, pw - 2, ph - 3, '#e0d8c8'); buffer.rect(px + 1, py + 1, pw - 2, 2, '#ffffff')
    buffer.rect(px, py + ph - 3, pw, 2, accent)
  }
}

/**
 * The diner's floor inside its counter: plain and dark (the first
 * levels), white tiles with grey joints, or the black-and-white checker
 * of a real diner (higher levels, where the furniture comes in).
 */
function drawDinerFloor(buffer: PixelBuffer, cols: number, rows: number, top: number, accent: string, floor: Floor): void {
  const W = cols * CELL, H = rows * CELL
  const chrome = '#c9ccd8', chromeDark = '#6a6e84'
  buffer.rect(0, top, W, H, '#16122a')
  for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) {
    const px = x * CELL, py = top + y * CELL
    if (floor === 'tiles') {
      buffer.rect(px, py, CELL, CELL, '#e4e2ea')
      buffer.rect(px, py, CELL, 1, '#b4b2c0'); buffer.rect(px, py, 1, CELL, '#b4b2c0')
      buffer.rect(px + 1, py + 1, CELL - 1, 1, '#f2f0f6')
    } else if (floor === 'checker') {
      const light = (x + y) % 2 === 0
      buffer.rect(px, py, CELL, CELL, light ? '#e4e2ea' : '#24202e')
      if (light) { buffer.rect(px + 2, py + 2, 3, 1, '#ffffff'); buffer.rect(px, py + CELL - 1, CELL, 1, '#c4c2ce') }
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
}

/** The eater's body on the board, from the head back. */
export const EATER_PATH: ReadonlyArray<[number, number]> = [
  [18, 7], [17, 7], [16, 7], [15, 7], [14, 7], [13, 7], [13, 8], [13, 9], [13, 10], [13, 11], [12, 11], [11, 11], [10, 11], [9, 11], [9, 12], [9, 13], [10, 13], [11, 13], [11, 14],
]

function toward([ax, ay]: readonly [number, number], [bx, by]: readonly [number, number]): Direction {
  if (bx > ax) return 'right'
  if (bx < ax) return 'left'
  return by > ay ? 'down' : 'up'
}

/** A moment of RANDOM EATER: the diner's floor inside its counter, the eater bending round, a burger ahead, furniture on higher levels. */
function renderEaterPlay(layout: Layout, accent: string, options: PlayOptions): PixelBuffer {
  const { width, height } = playSize(layout)
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const tall = layout === 'portrait'
  const { cols, rows } = boardSize(layout)
  const top = HUD_HEIGHT
  drawDinerFloor(buffer, cols, rows, top, accent, options.floor ?? 'plain')
  if (options.obstacles) for (const f of EATER_OBSTACLES) drawFurniture(buffer, f, top, accent, tall)
  const path = EATER_PATH.map(([x, y]) => (tall ? [y, x] : [x, y]) as [number, number])
  const place = ([x, y]: readonly [number, number]): [number, number] => [x * CELL, top + y * CELL]
  const palette = eaterPalette(accent)
  const n = path.length
  buffer.blit(facing(CRAWL_LEGS[frame % 2], toward(path[n - 1], path[n - 2])), ...place(path[n - 1]), palette)
  for (let i = n - 2; i >= 1; i -= 1) {
    const front = toward(path[i], path[i - 1]), back = toward(path[i], path[i + 1])
    const look = i === 1 ? { pattern: 'plain' as const, cloth: accent, print: accent } : torsoLook(i - 2)
    const piece = tubePiece(front, back, look)
    buffer.blit(piece.sprite, ...place(path[i]), piece.palette)
    if (i === 1) buffer.blit(facing(CRAWL_ARMS[frame % 2], front), ...place(path[i]), palette)
  }
  buffer.blit(facing(CRAWL_HEAD, toward(path[1], path[0])), ...place(path[0]), palette)
  const food = tall ? [7, 22] : [22, 7]
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

/** Every base screen: title, play, GAME OVER, each wide and tall; EATER's play three times — plain, tiled, and a higher level. */
export function renderAll(accent: string, frame = 0): Shot[] {
  const shots: Shot[] = []
  for (const game of ['catcher', 'eater'] as Game[]) {
    for (const layout of LAYOUTS) {
      shots.push({ game, layout, name: 'titre', buffer: renderTitle(game, layout, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0 }) })
      if (game === 'catcher') shots.push({ game, layout, name: 'jeu', buffer: renderPlay(game, layout, accent, { level: 3, score: 1280, lives: 2, frame }) })
      else {
        shots.push({ game, layout, name: 'jeu-sol-uni', buffer: renderPlay(game, layout, accent, { level: 1, score: 320, frame, floor: 'plain' }) })
        shots.push({ game, layout, name: 'jeu-sol-dalles', buffer: renderPlay(game, layout, accent, { level: 3, score: 1280, frame, floor: 'tiles' }) })
        shots.push({ game, layout, name: 'jeu-niveau-avance', buffer: renderPlay(game, layout, accent, { level: 6, score: 4820, frame, floor: 'checker', obstacles: true }) })
      }
      shots.push({ game, layout, name: 'game-over', buffer: renderGameOver(game, layout, accent, { score: 640, best: 4210, frame, blink: frame % 2 === 0 }) })
    }
  }
  return shots
}
