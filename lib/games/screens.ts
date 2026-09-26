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
import type { LetteringName } from './lettering-data'
import { mazeFor, MAZE_HEIGHT, MAZE_WIDTH } from './maze'
import { dim, mix, PixelBuffer, scale2x, type Palette, type Sprite } from './pixels'
import {
  bench, bin, car, cloud, drawDiner, drawStore, hedge, hydrant, lamp, moon, NIGHTS, palm, railing, signFrame, skyline, sky, stars, street, tree, vending, wisp,
  type Building, type Night,
} from './scenes'
import {
  BURGER, BURGER_PALETTE, CELL, CHEESE, CRAWL_ARMS, CRAWL_HEAD, CRAWL_LEGS, eaterPalette, facing, HUMAN, humanPalette, ITEM_PALETTE,
  MILKSHAKE, MILKSHAKE_PALETTE, MINI_BURGER, MINI_BURGER_PALETTE, ONION, PICKLE, SAUCE, SAUCE_PALETTE, TOMATO, torsoLook, tubePiece, type Direction,
} from './sprites'
import { arcadeText, button, CREAM, dpad, hud, HUD_HEIGHT, infoLine, INK, pressStart } from './ui'

export type Game = 'catcher' | 'eater'
export type Layout = 'landscape' | 'portrait'
export type Floor = 'plain' | 'checker'
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

/** Something standing on the street, left or right of the building. */
type Prop =
  | { kind: 'lamp'; x: number; h: number; left?: boolean }
  | { kind: 'tree'; x: number; size: number }
  | { kind: 'palm'; x: number; h: number; lean: number }
  | { kind: 'bench'; x: number; w: number }
  | { kind: 'hydrant'; x: number }
  | { kind: 'vending'; x: number }
  | { kind: 'bin'; x: number }
  | { kind: 'hedge'; x: number; w: number }

/** Where things stand on a street scene, for a game and a layout. Left and right are never mirrored. */
type Stage = {
  ground: number; building: [number, number]; horizon: number
  randomY: number; markY: number; markSize: number
  road: { bottom: number; line: number; lanes: number[] }
  press: number; info: 'top' | 'bottom'
  moon: [number, number, number]; clouds: Array<[number, number, 'big' | 'long' | 'small', boolean]>; wisps: Array<[number, number, number]>
  far: Building[]; near: Building[]; props: Prop[]
}

/** How much bigger than the play sprites the cars are drawn: a car is about twice as long as the door is high. */
const CAR_SCALE = 1.8

function stage(game: Game, layout: Layout): Stage {
  if (layout === 'landscape') {
    return game === 'catcher'
      ? {
          ground: 332, building: [200, 368], horizon: 330, randomY: 10, markY: 60, markSize: 1,
          road: { bottom: 432, line: 402, lanes: [354, 366] }, press: 408, info: 'top',
          moon: [712, 62, 17], clouds: [[6, 52, 'big', false], [596, 116, 'long', true], [524, 16, 'small', false]], wisps: [],
          far: [[-10, 74, 128, 'stepped'], [66, 52, 104, 'spire'], [126, 70, 96, 'block'], [300, 90, 168, 'block'], [548, 58, 112, 'twin'], [612, 76, 166, 'stepped'], [694, 90, 104, 'block']],
          near: [[0, 58, 88, 'tank'], [60, 74, 132, 'antenna'], [138, 58, 70, 'block'], [576, 66, 96, 'block'], [648, 56, 62, 'tank'], [702, 70, 124, 'antenna']],
          props: [{ kind: 'bench', x: 22, w: 70 }, { kind: 'lamp', x: 118, h: 178 }, { kind: 'vending', x: 152 }, { kind: 'bin', x: 588 }, { kind: 'hydrant', x: 640 }, { kind: 'tree', x: 712, size: 46 }],
        }
      : {
          ground: 336, building: [152, 464], horizon: 330, randomY: 8, markY: 0, markSize: 0,
          road: { bottom: 432, line: 404, lanes: [356, 368] }, press: 410, info: 'top',
          moon: [118, 60, 16], clouds: [[560, 54, 'big', true], [0, 104, 'long', false], [250, 16, 'small', true]], wisps: [[310, 150, 56]],
          far: [[-6, 66, 120, 'block'], [58, 90, 162, 'stepped'], [640, 50, 176, 'spire'], [688, 84, 118, 'twin']],
          near: [[0, 62, 76, 'antenna'], [104, 50, 100, 'block'], [618, 70, 90, 'tank'], [690, 80, 136, 'block']],
          props: [{ kind: 'palm', x: 74, h: 230, lean: 1 }, { kind: 'hedge', x: 108, w: 40 }, { kind: 'lamp', x: 660, h: 176, left: true }, { kind: 'palm', x: 740, h: 160, lean: -0.6 }],
        }
  }
  return game === 'catcher'
    ? {
        ground: 562, building: [32, 368], horizon: 560, randomY: 236, markY: 300, markSize: 0.72,
        road: { bottom: 708, line: 640, lanes: [588, 638] }, press: 720, info: 'bottom',
        moon: [96, 66, 20], clouds: [[216, 92, 'big', true], [0, 170, 'long', false], [300, 30, 'small', false]], wisps: [[40, 130, 60]],
        far: [[-10, 80, 170, 'stepped'], [80, 60, 240, 'spire'], [150, 90, 150, 'block'], [260, 70, 200, 'twin'], [340, 100, 150, 'stepped']],
        near: [[0, 70, 110, 'tank'], [300, 60, 140, 'antenna'], [370, 70, 100, 'block']],
        props: [{ kind: 'lamp', x: 16, h: 190 }, { kind: 'hydrant', x: 414 }],
      }
    : {
        ground: 562, building: [16, 400], horizon: 560, randomY: 196, markY: 0, markSize: 0,
        road: { bottom: 708, line: 640, lanes: [588, 638] }, press: 720, info: 'bottom',
        moon: [330, 70, 20], clouds: [[0, 90, 'big', false], [260, 150, 'long', true], [150, 30, 'small', true]], wisps: [[300, 40, 60]],
        far: [[-10, 90, 160, 'block'], [80, 56, 230, 'spire'], [140, 90, 180, 'stepped'], [250, 70, 150, 'twin'], [330, 110, 200, 'stepped']],
        near: [[0, 60, 120, 'antenna'], [360, 80, 110, 'tank']],
        props: [{ kind: 'hedge', x: 404, w: 30 }],
      }
}

type SceneOptions = { frame: number; lit: boolean; hero: boolean; building: boolean; lettering: LetteringName }

function drawProp(buffer: PixelBuffer, prop: Prop, s: Stage, night: Night, accent: string, lit: boolean, index: number): void {
  if (prop.kind === 'lamp') lamp(buffer, prop.x, s.ground, prop.h, prop.left)
  else if (prop.kind === 'tree') tree(buffer, prop.x, s.ground, prop.size, night, 3 + index)
  else if (prop.kind === 'palm') palm(buffer, prop.x, s.ground - 10, prop.h, prop.lean, night)
  else if (prop.kind === 'bench') bench(buffer, prop.x, s.ground, prop.w)
  else if (prop.kind === 'hydrant') hydrant(buffer, prop.x, s.ground + 4)
  else if (prop.kind === 'vending') vending(buffer, prop.x, s.ground, accent, lit)
  else if (prop.kind === 'bin') bin(buffer, prop.x, s.ground, dim(accent, 0.55))
  else hedge(buffer, prop.x, s.ground, prop.w, night)
}

/** The night street of a game, its building and the game's own mark, its traffic, and its hero on the sidewalk. */
function drawStreetScene(buffer: PixelBuffer, game: Game, layout: Layout, accent: string, options: SceneOptions): Stage {
  const s = stage(game, layout)
  const night: Night = NIGHTS[game === 'catcher' ? 'blue' : 'violet']
  const { width: W, height: H } = buffer
  const { frame, lit } = options
  sky(buffer, night, s.horizon)
  stars(buffer, game === 'catcher' ? 7 : 11, layout === 'landscape' ? 120 : 150, s.horizon - 120, frame)
  moon(buffer, ...s.moon)
  s.wisps.forEach(([x, y, w]) => wisp(buffer, x, y, w, night))
  s.clouds.forEach(([x, y, design, flip]) => cloud(buffer, x, y, design, night, flip))
  skyline(buffer, night, s.ground - 16, s.far, s.near, frame)
  const [bx, bw] = s.building
  // palms stand behind the railing; everything else in front
  s.props.forEach((prop, i) => { if (prop.kind === 'palm') drawProp(buffer, prop, s, night, accent, lit, i) })
  railing(buffer, s.ground - 26, game === 'catcher' ? '#343c6c' : '#3c3068')
  if (options.building) {
    if (game === 'catcher') drawStore(buffer, bx, bw, s.ground, accent, frame, lit)
    else {
      const logo = eaterLogoSize(options.lettering)
      const roof = s.ground - 128
      const markY = roof - logo.height + 14
      const frameTop = markY + Math.round(logo.height * 0.24)
      signFrame(buffer, Math.round(W / 2 - logo.width / 2) - 4, frameTop, logo.width + 8, roof - 6 - frameTop, roof)
      drawEaterLogo(buffer, Math.round(W / 2 - logo.width / 2), markY, accent, options.lettering, { lit: lit && frame % 13 !== 12, swashLit: frame % 7 !== 6 })
      drawDiner(buffer, bx, bw, s.ground, accent, frame, lit)
    }
  }
  s.props.forEach((prop, i) => { if (prop.kind !== 'palm' && (options.building || prop.kind !== 'vending')) drawProp(buffer, prop, s, night, accent, lit, i) })
  street(buffer, night, s.ground, 22, s.road.bottom, s.road.line)
  if (s.road.bottom < H) {
    // the near sidewalk under the road on a tall screen
    buffer.rect(0, s.road.bottom, W, H - s.road.bottom, dim(night.sidewalk, 0.55))
    buffer.rect(0, s.road.bottom, W, 3, night.sidewalkLight)
    for (let x = 24; x < W; x += 48) buffer.rect(x, s.road.bottom + 3, 1, H - s.road.bottom - 3, dim(night.sidewalk, 0.42))
  }
  // traffic: a car in each lane, each at its own speed and way, the nearer lane drawn last
  const colors = game === 'catcher' ? ['#eeeae0', '#e0304a'] : ['#eeeae0', '#e8563a']
  const carLength = Math.round(104 * CAR_SCALE)
  s.road.lanes.forEach((y, i) => {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1
    const span = W + carLength * 2
    const pos = ((frame * (i === 0 ? 14 : 11) + (i === 0 ? carLength - 10 : carLength + 30)) % span) - carLength
    car(buffer, dir === 1 ? pos : W - pos - carLength, y, colors[i % colors.length], dir, CAR_SCALE)
  })
  if (options.hero) {
    const door = bx + Math.round(bw / 2)
    if (game === 'catcher') buffer.blit(smooth(BURGER[frame % 2]), door - 16, s.ground - 26, BURGER_PALETTE)
    else {
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

export type TitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; lettering?: LetteringName }

export function renderTitle(game: Game, layout: Layout, accent: string, options: TitleOptions = {}): PixelBuffer {
  const { width, height } = SCENE_SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const s = drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: true, building: true, lettering: options.lettering ?? 'meow' })
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
  drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: false, building: false, lettering: 'meow' })
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

export type PlayOptions = { level?: number; score?: number; lives?: number; frame?: number; bonus?: boolean }

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

/** A piece of the diner's furniture seen from above: where it stands, the cells it covers, which way a chair's back faces. */
type Furniture = { kind: 'chair' | 'table' | 'stool' | 'booth' | 'counter'; x: number; y: number; w: number; h: number; back?: Direction }

const chair = (x: number, y: number, back: Direction): Furniture => ({ kind: 'chair', x, y, w: 1, h: 1, back })
const stool = (x: number, y: number): Furniture => ({ kind: 'stool', x, y, w: 1, h: 1 })
const CHAIRS_A = [chair(5, 3, 'up'), chair(21, 15, 'down'), chair(24, 4, 'right')]
const CHAIRS_B = [chair(4, 15, 'left'), chair(17, 2, 'up'), chair(15, 15, 'down')]
const TABLE_A = [{ kind: 'table' as const, x: 20, y: 11, w: 2, h: 2 }, chair(19, 11, 'left'), chair(22, 12, 'right')]
const TABLE_B = [{ kind: 'table' as const, x: 5, y: 6, w: 2, h: 2 }, chair(5, 5, 'up'), chair(7, 7, 'right')]
const COUNTER = [{ kind: 'counter' as const, x: 14, y: 18, w: 7, h: 1 }, stool(14, 17), stool(16, 17), stool(18, 17), stool(20, 17)]
const BOOTH = [{ kind: 'booth' as const, x: 24, y: 8, w: 3, h: 3 }]

/**
 * The eight levels of RANDOM EATER, then round again faster: the floor
 * black to begin with, then a light checker of black and dark grey; and
 * the diner filling up — a few chairs, more chairs, a table, two, the
 * counter with its stools, a booth. Cells in the board's own grid, the
 * wide one; the tall board turns them over.
 */
export const EATER_LEVELS: ReadonlyArray<{ floor: Floor; furniture: readonly Furniture[] }> = [
  { floor: 'plain', furniture: [] },
  { floor: 'plain', furniture: [] },
  { floor: 'checker', furniture: CHAIRS_A },
  { floor: 'checker', furniture: [...CHAIRS_A, ...CHAIRS_B] },
  { floor: 'checker', furniture: [...CHAIRS_A, ...CHAIRS_B, ...TABLE_A] },
  { floor: 'checker', furniture: [...CHAIRS_A, ...CHAIRS_B, ...TABLE_A, ...TABLE_B] },
  { floor: 'checker', furniture: [...CHAIRS_A, ...CHAIRS_B, ...TABLE_A, ...TABLE_B, ...COUNTER] },
  { floor: 'checker', furniture: [...CHAIRS_A, ...CHAIRS_B, ...TABLE_A, ...TABLE_B, ...COUNTER, ...BOOTH] },
]

/** Every cell the furniture of a level takes, for a layout. */
export function obstacleCells(layout: Layout, level: number): Set<string> {
  const out = new Set<string>()
  for (const f of EATER_LEVELS[(level - 1) % EATER_LEVELS.length].furniture) for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) out.add(layout === 'portrait' ? `${y},${x}` : `${x},${y}`)
  return out
}

const TURN: Record<Direction, Direction> = { up: 'left', left: 'up', down: 'right', right: 'down' }

function drawFurniture(buffer: PixelBuffer, f: Furniture, top: number, accent: string, tall: boolean): void {
  const [x, y, w, h] = tall ? [f.y, f.x, f.h, f.w] : [f.x, f.y, f.w, f.h]
  const px = x * CELL, py = top + y * CELL, pw = w * CELL, ph = h * CELL
  const chrome = '#c9ccd8', chromeDark = '#6a6e84', shadow = '#08070c'
  const seat = accent, seatLight = mix(accent, '#ffffff', 0.35), seatDark = dim(accent, 0.7)
  if (f.kind === 'chair') {
    // a diner chair from above: a padded seat, its chrome back on one side
    const back = tall ? TURN[f.back ?? 'up'] : f.back ?? 'up'
    buffer.rect(px + 4, py + 4, 11, 11, shadow)
    buffer.rect(px + 2, py + 2, 12, 12, chromeDark)
    buffer.rect(px + 3, py + 3, 10, 10, seat); buffer.rect(px + 3, py + 3, 10, 2, seatLight); buffer.rect(px + 3, py + 3, 2, 10, seatLight); buffer.rect(px + 5, py + 11, 8, 2, seatDark)
    if (back === 'up') buffer.rect(px + 1, py + 1, 14, 3, chrome)
    if (back === 'down') buffer.rect(px + 1, py + 12, 14, 3, chrome)
    if (back === 'left') buffer.rect(px + 1, py + 1, 3, 14, chrome)
    if (back === 'right') buffer.rect(px + 12, py + 1, 3, 14, chrome)
  } else if (f.kind === 'table') {
    buffer.disc(px + pw / 2 + 2, py + ph / 2 + 2, pw / 2 - 1, shadow)
    buffer.disc(px + pw / 2, py + ph / 2, pw / 2 - 1, chromeDark)
    buffer.disc(px + pw / 2, py + ph / 2, pw / 2 - 2.5, CREAM)
    buffer.disc(px + pw / 2 - 5, py + ph / 2 - 5, 3, '#ffffff')
    buffer.disc(px + pw / 2 - 3, py + ph / 2 + 3, 2, '#e0301e'); buffer.disc(px + pw / 2 + 3, py + ph / 2 + 3, 2, '#ffcc33')
  } else if (f.kind === 'stool') {
    buffer.disc(px + 9, py + 9, 6.5, shadow)
    buffer.disc(px + 8, py + 8, 6.5, chrome)
    buffer.disc(px + 8, py + 8, 5, seat)
    buffer.disc(px + 7, py + 7, 2, seatLight)
  } else if (f.kind === 'booth') {
    buffer.rect(px + 2, py + 2, pw, ph, shadow)
    const benches = tall ? [[px, py, CELL, ph], [px + pw - CELL, py, CELL, ph]] : [[px, py, pw, CELL], [px, py + ph - CELL, pw, CELL]]
    for (const [bx, by, bw, bh] of benches) {
      buffer.rect(bx, by, bw, bh, seatDark); buffer.rect(bx + 1, by + 1, bw - 2, bh - 2, seat)
      if (tall) for (let k = 4; k < bh - 2; k += 6) buffer.rect(bx + 3, by + k, bw - 6, 1, seatDark)
      else for (let k = 4; k < bw - 2; k += 6) buffer.rect(bx + k, by + 3, 1, bh - 6, seatDark)
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
 * The diner's floor inside its counter: black on the first levels, then a
 * light checker of black and dark grey — there, but never in the way.
 */
function drawDinerFloor(buffer: PixelBuffer, cols: number, rows: number, top: number, accent: string, floor: Floor): void {
  const W = cols * CELL, H = rows * CELL
  const chrome = '#c9ccd8', chromeDark = '#6a6e84'
  buffer.rect(0, top, W, H, '#110f18')
  if (floor === 'checker') for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) if ((x + y) % 2 === 0) buffer.rect(x * CELL, top + y * CELL, CELL, CELL, '#1c1a26')
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
  const level = EATER_LEVELS[((options.level ?? 1) - 1) % EATER_LEVELS.length]
  drawDinerFloor(buffer, cols, rows, top, accent, level.floor)
  for (const f of level.furniture) drawFurniture(buffer, f, top, accent, tall)
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
  if (options.bonus) {
    // the milkshake, for a few seconds: a ring of light round it counting down
    const [mx, my] = tall ? [3, 12] : [12, 3]
    const cx = mx * CELL + 8, cy = top + my * CELL + 8
    for (let a = 0; a < Math.PI * 2 * 0.7; a += 0.08) buffer.set(Math.round(cx + Math.cos(a - Math.PI / 2) * 10), Math.round(cy + Math.sin(a - Math.PI / 2) * 10), (frame + Math.round(a * 4)) % 3 === 0 ? '#ffffff' : '#ff9ac0')
    buffer.blit(MILKSHAKE, mx * CELL + 2, top + my * CELL, MILKSHAKE_PALETTE)
  }
  hud(buffer, accent, { level: options.level ?? 1, score: options.score ?? 0, progress: [7, 12] })
  if (tall) dpad(buffer, width / 2, HUD_HEIGHT + rows * CELL + DPAD_HEIGHT / 2, 26, accent)
  return buffer
}

export function renderPlay(game: Game, layout: Layout, accent: string, options: PlayOptions = {}): PixelBuffer {
  return game === 'catcher' ? renderCatcherPlay(layout, accent, options) : renderEaterPlay(layout, accent, options)
}

// ---------------------------------------------------------------- all of them

export type ShotSpec = { game: Game; layout: Layout; name: string; width: number; height: number; draw: (frame: number) => PixelBuffer }
export type Shot = { game: Game; layout: Layout; name: string; buffer: PixelBuffer }

/** Every base screen, not drawn yet: title, play, GAME OVER, each wide and tall; EATER's title in both letterings, its play at levels 1, 4 and 8. */
export function shotSpecs(accent: string): ShotSpec[] {
  const specs: ShotSpec[] = []
  for (const game of ['catcher', 'eater'] as Game[]) {
    for (const layout of LAYOUTS) {
      const scene = SCENE_SIZE[layout], play = playSize(layout)
      const add = (name: string, size: { width: number; height: number }, draw: (frame: number) => PixelBuffer) => specs.push({ game, layout, name, width: size.width, height: size.height, draw })
      add('titre', scene, (frame) => renderTitle(game, layout, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0 }))
      if (game === 'eater') add('titre-yesteryear', scene, (frame) => renderTitle(game, layout, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0, lettering: 'yesteryear' }))
      if (game === 'catcher') add('jeu', play, (frame) => renderPlay(game, layout, accent, { level: 3, score: 1280, lives: 2, frame }))
      else {
        add('jeu-niveau-1', play, (frame) => renderPlay(game, layout, accent, { level: 1, score: 320, frame }))
        add('jeu-niveau-4', play, (frame) => renderPlay(game, layout, accent, { level: 4, score: 2150, frame }))
        add('jeu-niveau-8', play, (frame) => renderPlay(game, layout, accent, { level: 8, score: 6480, frame, bonus: true }))
      }
      add('game-over', scene, (frame) => renderGameOver(game, layout, accent, { score: 640, best: 4210, frame, blink: frame % 2 === 0 }))
    }
  }
  return specs
}

/** Every base screen, drawn at one moment. */
export function renderAll(accent: string, frame = 0): Shot[] {
  return shotSpecs(accent).map(({ game, layout, name, draw }) => ({ game, layout, name, buffer: draw(frame) }))
}
