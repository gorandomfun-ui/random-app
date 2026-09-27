/**
 * The screens of both games, wide or tall: the title on its night street,
 * a moment of play, GAME OVER. The title and GAME OVER are drawn twice as
 * fine as play, with the play sprites smoothed to that finer grid, so the
 * characters stay the same. RANDOM CATCHER opens on the front of a little
 * convenience store and plays inside it, seen from above; RANDOM EATER
 * opens on a diner, its neon sign the game's own mark, and plays on the
 * diner's floor. Everything takes the theme's accent.
 */

import { positionOf, type CatcherState } from './catcher'
import { EATER_LEVELS, type Floor, type Furniture } from './diner'
import type { EaterState } from './eater'
import { drawLogo, LOGO_WIDTH } from './logo'
import { catcherLogoSize, drawCatcherLogo, drawEaterLogo, eaterLogoSize } from './logos'
import { mazeFor, MAZE_HEIGHT, MAZE_WIDTH } from './maze'
import { dim, drawText7, mix, PixelBuffer, scale2x, text7Width, type Palette, type Sprite } from './pixels'
import {
  bench, bin, car, cloud, DAYS, drawDiner, drawStore, hedge, hydrant, lamp, moon, NIGHTS, palm, railing, signFrame, skyline, sky, stars, street, sun, tree, vending, wisp,
  type Building, type Night,
} from './scenes'
import {
  BANKNOTE, BANKNOTE_PALETTE, BURGER, BURGER_PALETTE, CELL, CHEESE, COIN, COIN_PALETTE, CRAWL_ARMS, CRAWL_HEAD, CRAWL_LEGS, DONUT, DONUT_PALETTE, eaterPalette, facing,
  FRIES, FRIES_PALETTE, GOLD_BURGER_PALETTE, GOLD_CARD, GOLD_CARD_PALETTE, HUMAN, humanPalette, ITEM_PALETTE, MILKSHAKE, MILKSHAKE_PALETTE, MINI_BURGER,
  MINI_BURGER_PALETTE, ONION, PICKLE, SAUCE, SAUCE_PALETTE, TOMATO, torsoLook, tubePiece, WINNER_STAND, winnerPalette, type Direction,
} from './sprites'
import { arcadeText, button, CREAM, dpad, hud, HUD_HEIGHT, infoLine, INK, pressStart } from './ui'

export type Game = 'catcher' | 'eater'
export type Layout = 'landscape' | 'portrait'
export { EATER_LEVELS, obstacleCells, openCell } from './diner'
export type { Floor } from './diner'
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

/** A play screen: the HUD, the board, and under it the cross of arrows when there is one — always tall, and wide on a touch screen. */
export function playSize(layout: Layout, pad = layout === 'portrait'): { width: number; height: number } {
  const { cols, rows } = boardSize(layout)
  return { width: cols * CELL, height: HUD_HEIGHT + rows * CELL + (pad ? DPAD_HEIGHT : 0) }
}

// ---------------------------------------------------------------- the street, composed

/** The winner standing, smoothed twice over. */
let stood: Sprite | null = null
const standing = (): Sprite => (stood ??= scale2x(scale2x(WINNER_STAND)))

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
  road: { bottom: number; line: number; lanes: Array<[number, number]> }
  press: number; info: 'top' | 'bottom'
  moon: [number, number, number]; clouds: Array<[number, number, 'big' | 'long' | 'small', boolean]>; wisps: Array<[number, number, number]>
  far: Building[]; near: Building[]; props: Prop[]
}

/** How much bigger than the play sprites the cars are drawn: a car is about twice as long as the door is high. */
const CAR_SCALE = 2.1

function stage(game: Game, layout: Layout): Stage {
  if (layout === 'landscape') {
    return game === 'catcher'
      ? {
          ground: 328, building: [200, 368], horizon: 326, randomY: 16, markY: 62, markSize: 1.0,
          road: { bottom: 432, line: 404, lanes: [[343, 1.6], [357, 2.0]] }, press: 412, info: 'top',
          moon: [712, 62, 17], clouds: [[6, 52, 'big', false], [596, 116, 'long', true], [524, 16, 'small', false]], wisps: [],
          far: [[-10, 74, 128, 'stepped'], [66, 52, 104, 'spire'], [126, 70, 96, 'block'], [300, 90, 168, 'block'], [548, 58, 112, 'twin'], [612, 76, 166, 'stepped'], [694, 90, 104, 'block']],
          near: [[0, 58, 88, 'tank'], [60, 74, 132, 'antenna'], [138, 58, 70, 'block'], [576, 66, 96, 'block'], [648, 56, 62, 'tank'], [702, 70, 124, 'antenna']],
          props: [{ kind: 'bench', x: 22, w: 70 }, { kind: 'lamp', x: 118, h: 178 }, { kind: 'vending', x: 152 }, { kind: 'bin', x: 588 }, { kind: 'hydrant', x: 640 }, { kind: 'tree', x: 712, size: 46 }],
        }
      : {
          ground: 330, building: [152, 464], horizon: 326, randomY: 16, markY: 46, markSize: 0,
          road: { bottom: 432, line: 406, lanes: [[345, 1.6], [357, 2.0]] }, press: 414, info: 'top',
          moon: [40, 74, 16], clouds: [[560, 54, 'big', true], [0, 104, 'long', false], [250, 16, 'small', true]], wisps: [[310, 150, 56]],
          far: [[-6, 66, 120, 'block'], [58, 90, 162, 'stepped'], [640, 50, 176, 'spire'], [688, 84, 118, 'twin']],
          near: [[0, 62, 76, 'antenna'], [104, 50, 100, 'block'], [618, 70, 90, 'tank'], [690, 80, 136, 'block']],
          props: [{ kind: 'palm', x: 74, h: 230, lean: 1 }, { kind: 'hedge', x: 108, w: 40 }, { kind: 'lamp', x: 660, h: 176, left: true }, { kind: 'palm', x: 740, h: 160, lean: -0.6 }],
        }
  }
  return game === 'catcher'
    ? {
        ground: 562, building: [32, 368], horizon: 560, randomY: 196, markY: 242, markSize: 0.88,
        road: { bottom: 714, line: 654, lanes: [[585, 1.7], [634, CAR_SCALE]] }, press: 724, info: 'bottom',
        moon: [96, 66, 20], clouds: [[216, 92, 'big', true], [0, 170, 'long', false], [300, 30, 'small', false]], wisps: [[40, 130, 60]],
        far: [[-10, 80, 170, 'stepped'], [80, 60, 240, 'spire'], [150, 90, 150, 'block'], [260, 70, 200, 'twin'], [340, 100, 150, 'stepped']],
        near: [[0, 70, 110, 'tank'], [300, 60, 140, 'antenna'], [370, 70, 100, 'block']],
        props: [{ kind: 'lamp', x: 16, h: 190 }, { kind: 'hydrant', x: 414 }],
      }
    : {
        ground: 562, building: [16, 400], horizon: 560, randomY: 196, markY: 226, markSize: 0,
        road: { bottom: 714, line: 654, lanes: [[585, 1.7], [634, CAR_SCALE]] }, press: 724, info: 'bottom',
        moon: [330, 70, 20], clouds: [[0, 90, 'big', false], [260, 150, 'long', true], [150, 30, 'small', true]], wisps: [[300, 40, 60]],
        far: [[-10, 90, 160, 'block'], [80, 56, 230, 'spire'], [140, 90, 180, 'stepped'], [250, 70, 150, 'twin'], [330, 110, 200, 'stepped']],
        near: [[0, 60, 120, 'antenna'], [360, 80, 110, 'tank']],
        props: [{ kind: 'hedge', x: 404, w: 30 }],
      }
}

/** `hero`: the title's (the burger at the door, the eater crawling in), the winner's (the burger hopping, the eater standing with his cup) or none; `winner` puts WINNER on the building instead of the game's name. */
type SceneOptions = { frame: number; lit: boolean; hero: 'title' | 'winner' | false; building: boolean; day?: boolean; winner?: boolean }

function drawProp(buffer: PixelBuffer, prop: Prop, s: Stage, night: Night, accent: string, lit: boolean, index: number): void {
  if (prop.kind === 'lamp') lamp(buffer, prop.x, s.ground, prop.h, prop.left, !night.day)
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
  const day = options.day === true
  const night: Night = (day ? DAYS : NIGHTS)[game === 'catcher' ? 'blue' : 'violet']
  const { width: W, height: H } = buffer
  const { frame, lit } = options
  sky(buffer, night, s.horizon)
  if (day) sun(buffer, s.moon[0], s.moon[1], s.moon[2] * 1.15)
  else {
    stars(buffer, game === 'catcher' ? 7 : 11, layout === 'landscape' ? 120 : 150, s.horizon - 120, frame)
    moon(buffer, ...s.moon)
  }
  s.wisps.forEach(([x, y, w]) => wisp(buffer, x, y, w, night))
  s.clouds.forEach(([x, y, design, flip]) => cloud(buffer, x, y, design, night, flip, s.moon[0] < W / 2))
  skyline(buffer, night, s.ground - 16, s.far, s.near, frame)
  const [bx, bw] = s.building
  // palms stand behind the railing; everything else in front
  s.props.forEach((prop, i) => { if (prop.kind === 'palm') drawProp(buffer, prop, s, night, accent, lit, i) })
  railing(buffer, s.ground - 26, day ? '#7a82a0' : game === 'catcher' ? '#343c6c' : '#3c3068')
  if (options.building) {
    // RANDOM first: each game's own mark may bite a little into it
    const rx = Math.round(W / 2 - LOGO_WIDTH)
    drawLogo(buffer, rx + 3, s.randomY + 4, INK, 2)
    drawLogo(buffer, rx, s.randomY, mix(accent, CREAM, 0.25), 2)
    if (game === 'catcher') drawStore(buffer, bx, bw, s.ground, accent, frame, lit, day)
    else {
      const lettering = options.winner ? (layout === 'landscape' ? 'winnerWide' : 'winnerTall') : layout === 'landscape' ? 'wide' : 'tall'
      const logo = eaterLogoSize(lettering)
      const roof = s.ground - 128
      const markY = s.markY
      const frameTop = markY + Math.round(logo.height * 0.24)
      // the board behind the letters stops just under them; its posts carry it down to the roof
      const frameBottom = Math.min(roof - 6, markY + logo.height - 10)
      signFrame(buffer, Math.round(W / 2 - logo.width / 2) - 4, frameTop, logo.width + 8, Math.max(20, frameBottom - frameTop), roof, day)
      drawEaterLogo(buffer, Math.round(W / 2 - logo.width / 2), markY, accent, lettering, { lit: lit && frame % 13 !== 12, swashLit: frame % 7 !== 6, glow: !day })
      drawDiner(buffer, bx, bw, s.ground, accent, frame, lit, day)
    }
  }
  s.props.forEach((prop, i) => { if (prop.kind !== 'palm' && (options.building || prop.kind !== 'vending')) drawProp(buffer, prop, s, night, accent, lit, i) })
  street(buffer, night, s.ground, 22, s.road.bottom, s.road.line)
  if (s.road.bottom < H) {
    // the near sidewalk under the road on a tall screen
    buffer.rect(0, s.road.bottom, W, H - s.road.bottom, day ? night.sidewalkDark : dim(night.sidewalk, 0.55))
    buffer.rect(0, s.road.bottom, W, 3, night.sidewalkLight)
    for (let x = 24; x < W; x += 48) buffer.rect(x, s.road.bottom + 3, 1, H - s.road.bottom - 3, dim(night.sidewalk, 0.42))
  }
  // the hero on the sidewalk first: the cars pass in front of it
  if (options.hero === 'winner') {
    const door = bx + Math.round(bw / 2)
    if (game === 'catcher') {
      // the burger hops on the spot, mouth open at the top of the jump
      const up = frame % 2 === 1
      buffer.blit(smooth(BURGER[up ? 1 : 0]), door - 16, s.ground - 26 - (up ? 16 : 0), BURGER_PALETTE)
    } else {
      // the eater on his feet, the cup over his head, a glint on it every other moment; smoothed twice,
      // since his head is half the crawler's in the sprite: the same man, the same size
      const x0 = door - 32, y0 = s.ground + 18 - 128
      buffer.blit(standing(), x0, y0, winnerPalette(accent))
      const glints: Array<[number, number]> = frame % 2 ? [[x0 + 8, y0 + 12], [x0 + 55, y0 + 24]] : [[x0 + 50, y0 + 4], [x0 + 12, y0 + 30]]
      for (const [gx, gy] of glints) { buffer.rect(gx - 3, gy, 7, 1, '#fff6c0'); buffer.rect(gx, gy - 3, 1, 7, '#fff6c0'); buffer.set(gx, gy, '#ffffff') }
    }
  } else if (options.hero) {
    const door = bx + Math.round(bw / 2)
    if (game === 'catcher') buffer.blit(smooth(BURGER[frame % 2]), door - 16, s.ground - 26, BURGER_PALETTE)
    else {
      // the eater crawling to the door, a burger on his way
      const head = door - 60 + (frame % 4) * 3
      drawCrawler(buffer, head, s.ground - 6, accent, frame, 1)
      buffer.blit(smooth(MINI_BURGER), head + 40, s.ground + 3, MINI_BURGER_PALETTE)
    }
  }
  // traffic: a car in each lane, each at its own speed and way, the nearer lane drawn last
  const colors = game === 'catcher' ? ['#eeeae0', '#e0304a'] : ['#eeeae0', '#e8563a']
  const carLength = Math.round(104 * CAR_SCALE)
  s.road.lanes.forEach(([y, scale], i) => {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1
    const length = Math.round(104 * scale)
    const span = W + carLength * 2
    const pos = ((frame * (i === 0 ? 14 : 11) + (i === 0 ? carLength - 10 : carLength + 30)) % span) - carLength
    car(buffer, dir === 1 ? pos : W - pos - length, y, colors[i % colors.length], dir, scale)
  })
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

/** CATCHER's letters in volume over the store — or WINNER in the same letters (RANDOM is drawn with the street, EATER's neon hangs on its diner). */
function drawMarks(buffer: PixelBuffer, game: Game, s: Stage, accent: string, frame: number, winner = false): void {
  const W = buffer.width
  if (game === 'catcher') {
    const word = winner ? 'WINNER' : undefined
    // WINNER is a shorter word: on a tall screen, where there is sky to spare, a little larger
    const scale = winner && buffer.height > W ? Math.round(s.markSize * 1.08 * 100) / 100 : s.markSize
    const size = catcherLogoSize(scale, word)
    drawCatcherLogo(buffer, Math.round(W / 2 - size.width / 2), s.markY, accent, scale, frame, word)
  }
}

// ---------------------------------------------------------------- the fine screens

/** `press` false leaves PRESS START out: in the Random flow a real button takes its place. */
export type TitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; day?: boolean; press?: boolean }

export function renderTitle(game: Game, layout: Layout, accent: string, options: TitleOptions = {}): PixelBuffer {
  const { width, height } = SCENE_SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const s = drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: 'title', building: true, day: options.day })
  drawMarks(buffer, game, s, accent, frame)
  if (options.press !== false) pressStart(buffer, width / 2, s.press, accent, options.blink !== false, 2)
  const level = String(options.level ?? 1), best = String(options.best ?? 0).padStart(5, '0')
  if (s.info === 'top') {
    infoLine(buffer, 16, 16, 'LEVEL', level, 'left', 2, options.day === true)
    infoLine(buffer, width - 16, 16, 'BEST', best, 'right', 2, options.day === true)
  } else {
    infoLine(buffer, width / 2 - 14, s.press + 24, 'LEVEL', level, 'right', 2, options.day === true)
    infoLine(buffer, width / 2 + 14, s.press + 24, 'BEST', best, 'left', 2, options.day === true)
  }
  return buffer
}

/** `choice`: the answer lit, YES (0) or NO (1). */
/** `choice`: the answer lit, YES (0) or NO (1); `ask` false leaves PLAY AGAIN? and its answers out. */
export type OverOptions = { score?: number; best?: number; frame?: number; blink?: boolean; choice?: 0 | 1; ask?: boolean }

/** Where the lines of GAME OVER stand, for a game and a layout: the words in the title's lettering take more room in EATER's script. */
function overPlaces(game: Game, layout: Layout): { score: number; best: number; question: number; buttons: number } {
  if (layout === 'landscape') return game === 'catcher' ? { score: 150, best: 150, question: 192, buttons: 244 } : { score: 160, best: 160, question: 200, buttons: 250 }
  return game === 'catcher' ? { score: 352, best: 380, question: 424, buttons: 470 } : { score: 356, best: 384, question: 428, buttons: 474 }
}

/** GAME OVER in the game's own lettering: CATCHER's letters in volume, EATER's neon script; on one line wide, two tall. */
function drawOverWords(buffer: PixelBuffer, game: Game, layout: Layout, accent: string): void {
  const W = buffer.width
  if (game === 'catcher') {
    if (layout === 'landscape') {
      const size = catcherLogoSize(0.8, 'GAME OVER')
      drawCatcherLogo(buffer, Math.round(W / 2 - size.width / 2), 34, accent, 0.8, 0, 'GAME OVER')
    } else {
      const game1 = catcherLogoSize(1.12, 'GAME'), over = catcherLogoSize(1.12, 'OVER')
      drawCatcherLogo(buffer, Math.round(W / 2 - game1.width / 2), 70, accent, 1.12, 0, 'GAME')
      drawCatcherLogo(buffer, Math.round(W / 2 - over.width / 2), 70 + game1.height + 8, accent, 1.12, 0, 'OVER')
    }
    return
  }
  if (layout === 'landscape') {
    const size = eaterLogoSize('overWide')
    drawEaterLogo(buffer, Math.round(W / 2 - size.width / 2), 0, accent, 'overWide')
  } else {
    const top = eaterLogoSize('overGame'), bottom = eaterLogoSize('overOver')
    drawEaterLogo(buffer, Math.round(W / 2 - top.width / 2) - 10, 44, accent, 'overGame')
    drawEaterLogo(buffer, Math.round(W / 2 - bottom.width / 2) + 14, 44 + top.height - 22, accent, 'overOver')
  }
}

/**
 * GAME OVER: the game's night street with nothing in front — no building,
 * no hero — a shade darker, and in the sky the verdict in the title's own
 * lettering, the score, PLAY AGAIN? and the two framed answers.
 */
export function renderGameOver(game: Game, layout: Layout, accent: string, options: OverOptions = {}): PixelBuffer {
  const { width, height } = SCENE_SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: false, building: false })
  buffer.shade(0, 0, width, height, 0.6)
  drawOverWords(buffer, game, layout, accent)
  const c = width / 2
  const score = String(options.score ?? 0).padStart(5, '0'), best = String(options.best ?? 0).padStart(5, '0')
  const chosen = options.blink !== false, choice = options.choice ?? 0
  const at = overPlaces(game, layout)
  const ask = options.ask !== false
  if (layout === 'landscape') {
    infoLine(buffer, c - 20, at.score, 'SCORE', score, 'right', 2)
    infoLine(buffer, c + 20, at.best, 'BEST', best, 'left', 2)
    if (ask) arcadeText(buffer, 'PLAY AGAIN?', c, at.question, 4, accent)
  } else {
    infoLine(buffer, c, at.score, 'SCORE', score, 'centre', 2)
    infoLine(buffer, c, at.best, 'BEST', best, 'centre', 2)
    if (ask) arcadeText(buffer, 'PLAY AGAIN?', c, at.question, 3, accent)
  }
  if (!ask) return buffer
  button(buffer, 'YES', c - 64, at.buttons, accent, chosen && choice === 0, 2)
  button(buffer, 'NO', c + 64, at.buttons, accent, chosen && choice === 1, 2)
  return buffer
}

/** WINNER's row at the foot of the scene: PLAY AGAIN? and the two answers side by side, where the title says PRESS START. */
function winnerRow(layout: Layout): { text: number; textY: number; yes: number; no: number; y: number } {
  const { width, height } = SCENE_SIZE[layout]
  const textW = text7Width('PLAY AGAIN?', 2), yesW = text7Width('YES', 2, true) + 28, noW = text7Width('NO', 2, true) + 28
  const total = textW + 30 + yesW + 12 + noW
  const x0 = Math.round(width / 2 - total / 2)
  const y = layout === 'landscape' ? height - 34 : 726
  return { text: x0, textY: y + 8, yes: x0 + textW + 30 + yesW / 2, no: x0 + textW + 30 + yesW + 12 + noW / 2, y }
}

export type WinnerOptions = OverOptions & { day?: boolean }

/**
 * WINNER, the sixteenth level cleared: the title's own street and building,
 * day or night, WINNER where the game's name was, in the same letters; the
 * hero at the door — CATCHER's burger hopping, EATER's man on his feet
 * holding up a golden cup with a burger on it. The score and the best
 * where the title shows the level and the best, and PLAY AGAIN? with its
 * two answers where it says PRESS START.
 */
export function renderWinner(game: Game, layout: Layout, accent: string, options: WinnerOptions = {}): PixelBuffer {
  const { width, height } = SCENE_SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const s = drawStreetScene(buffer, game, layout, accent, { frame, lit: true, hero: 'winner', building: true, day: options.day, winner: true })
  drawMarks(buffer, game, s, accent, frame, true)
  const score = String(options.score ?? 0).padStart(5, '0'), best = String(options.best ?? 0).padStart(5, '0')
  const dark = options.day === true
  // the score and the best in the top corners, wide or tall: the foot of the scene keeps the question
  infoLine(buffer, 16, 16, 'SCORE', score, 'left', 2, dark)
  infoLine(buffer, width - 16, 16, 'BEST', best, 'right', 2, dark)
  void s
  if (options.ask === false) return buffer
  const row = winnerRow(layout)
  const chosen = options.blink !== false, choice = options.choice ?? 0
  if (layout === 'landscape') buffer.shade(0, row.y - 5, width, height - row.y + 5, 0.45)
  drawText7(buffer, 'PLAY AGAIN?', row.text + 2, row.textY + 2, INK, 2)
  drawText7(buffer, 'PLAY AGAIN?', row.text, row.textY, dark ? '#ffffff' : CREAM, 2)
  button(buffer, 'YES', row.yes, row.y, accent, chosen && choice === 0, 2)
  button(buffer, 'NO', row.no, row.y, accent, chosen && choice === 1, 2)
  void height
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
  for (const island of level.islands) for (const f of island) drawFurniture(buffer, f, top, accent, tall)
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
    const [mx, my] = tall ? [4, 19] : [19, 4]
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

/** Every base screen, not drawn yet: title, play, GAME OVER, WINNER, each wide and tall; the titles and WINNER by night and by day; EATER's play at levels 1, 4 and 8. */
export function shotSpecs(accent: string): ShotSpec[] {
  const specs: ShotSpec[] = []
  for (const game of ['catcher', 'eater'] as Game[]) {
    for (const layout of LAYOUTS) {
      const scene = SCENE_SIZE[layout], play = playSize(layout)
      const add = (name: string, size: { width: number; height: number }, draw: (frame: number) => PixelBuffer) => specs.push({ game, layout, name, width: size.width, height: size.height, draw })
      add('titre', scene, (frame) => renderTitle(game, layout, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0 }))
      add('titre-jour', scene, (frame) => renderTitle(game, layout, accent, { level: 3, best: 4210, frame, blink: frame % 2 === 0, day: true }))
      if (game === 'catcher') add('jeu', play, (frame) => renderPlay(game, layout, accent, { level: 3, score: 1280, lives: 2, frame }))
      else {
        add('jeu-niveau-1', play, (frame) => renderPlay(game, layout, accent, { level: 1, score: 320, frame }))
        add('jeu-niveau-4', play, (frame) => renderPlay(game, layout, accent, { level: 4, score: 2150, frame }))
        add('jeu-niveau-8', play, (frame) => renderPlay(game, layout, accent, { level: 8, score: 6480, frame, bonus: true }))
      }
      add('game-over', scene, (frame) => renderGameOver(game, layout, accent, { score: 640, best: 4210, frame, blink: frame % 2 === 0 }))
      add('winner', scene, (frame) => renderWinner(game, layout, accent, { score: 18450, best: 18450, frame, blink: frame % 2 === 0 }))
      add('winner-jour', scene, (frame) => renderWinner(game, layout, accent, { score: 18450, best: 18450, frame, blink: frame % 2 === 0, day: true }))
    }
  }
  return specs
}

/** Every base screen, drawn at one moment. */
export function renderAll(accent: string, frame = 0): Shot[] {
  return shotSpecs(accent).map(({ game, layout, name, draw }) => ({ game, layout, name, buffer: draw(frame) }))
}

// ---------------------------------------------------------------- the games as they are played

/** Where a button of the pause card, of GAME OVER or of WINNER stands, so a tap can be read against it. */
export type Hit = { x: number; y: number; w: number; h: number }
const hitOfButton = (label: string, centre: number, y: number, scale: number): Hit => {
  const w = (label.length * 7 + 14) * scale
  return { x: Math.round(centre - w / 2) - 8 * scale, y: y - 4 * scale, w: w + 16 * scale, h: 23 * scale }
}
export function gameOverHits(game: Game, layout: Layout): { yes: Hit; no: Hit } {
  const c = SCENE_SIZE[layout].width / 2, y = overPlaces(game, layout).buttons
  return { yes: hitOfButton('YES', c - 64, y, 2), no: hitOfButton('NO', c + 64, y, 2) }
}
export function winnerHits(layout: Layout): { yes: Hit; no: Hit } {
  const row = winnerRow(layout)
  return { yes: hitOfButton('YES', row.yes, row.y, 2), no: hitOfButton('NO', row.no, row.y, 2) }
}
const boardMiddle = (layout: Layout) => Math.round(HUD_HEIGHT + (boardSize(layout).rows * CELL) / 2)
export function pauseHits(layout: Layout): { resume: Hit; quit: Hit } {
  const { width } = playSize(layout)
  const mid = boardMiddle(layout)
  return { resume: hitOfButton('RESUME', width / 2, mid + 6, 1), quit: hitOfButton('QUIT', width / 2, mid + 30, 1) }
}
/** The cross of arrows under the board, when there is one: its centre, the width of an arm, and the top of the band that answers to it. */
export function dpadGeometry(layout: Layout, pad = layout === 'portrait'): { cx: number; cy: number; arm: number; top: number } | null {
  if (!pad) return null
  const top = HUD_HEIGHT + boardSize(layout).rows * CELL
  return { cx: playSize(layout, pad).width / 2, cy: top + DPAD_HEIGHT / 2, arm: 26, top }
}

/** A card across the board: the board a shade darker, the words in arcade letters, the choices, `choice` the one lit. */
function playCard(buffer: PixelBuffer, layout: Layout, accent: string, title: string, buttons: string[], choice = 0): void {
  const boardH = boardSize(layout).rows * CELL
  const mid = boardMiddle(layout)
  buffer.shade(0, HUD_HEIGHT, buffer.width, boardH, 0.45)
  arcadeText(buffer, title, buffer.width / 2, mid - (buttons.length ? 44 : 12), 3, accent)
  buttons.forEach((label, i) => button(buffer, label, buffer.width / 2, mid + 6 + i * 24, accent, i === choice))
}

/** One drawing surface per screen, used again every frame, and the floors that never change, drawn once. */
const surfaces = new Map<string, PixelBuffer>()
function surface(name: string, layout: Layout, pad: boolean): PixelBuffer {
  const key = `${name}|${layout}|${pad}`
  let out = surfaces.get(key)
  if (!out) { const { width, height } = playSize(layout, pad); out = new PixelBuffer(width, height, INK); surfaces.set(key, out) }
  return out
}
const floors = new Map<string, PixelBuffer>()
function cachedFloor(key: string, layout: Layout, pad: boolean, draw: (buffer: PixelBuffer) => void): PixelBuffer {
  let out = floors.get(key)
  if (!out) {
    if (floors.size > 24) floors.clear()
    const { width, height } = playSize(layout, pad)
    out = new PixelBuffer(width, height, INK)
    draw(out)
    floors.set(key, out)
  }
  return out
}

/** What a play screen shows over the game: nothing, or the pause card with RESUME (0) or QUIT (1) lit; `pad`: the cross under the board (tall screens always have it). */
export type PlayView = { pause?: 0 | 1 | null; pad?: boolean }

/** A little four-pointed glint, for what is golden. */
function glint(buffer: PixelBuffer, x: number, y: number): void {
  buffer.set(x, y, '#ffffff'); buffer.set(x - 1, y, '#fff6c0'); buffer.set(x + 1, y, '#fff6c0'); buffer.set(x, y - 1, '#fff6c0'); buffer.set(x, y + 1, '#fff6c0')
}

/** CATCHER's money in its cell: a coin, a banknote, a bundle of notes held by a paper band, a golden card that glints. */
function drawCash(buffer: PixelBuffer, kind: import('./catcher').CatcherCash, px: number, py: number, steps: number): void {
  if (kind === 'coin') buffer.blit(COIN, px + 3, py + 2, COIN_PALETTE)
  else if (kind === 'note') buffer.blit(BANKNOTE, px + 1, py + 4, BANKNOTE_PALETTE)
  else if (kind === 'bundle') {
    for (const [dx, dy] of [[2, 0], [1, 2], [0, 4]]) buffer.blit(BANKNOTE, px + dx, py + 2 + dy, BANKNOTE_PALETTE)
    buffer.rect(px + 6, py + 2, 3, 12, '#f0e0b0'); buffer.rect(px + 6, py + 2, 1, 12, '#c8b080')
  } else {
    buffer.blit(GOLD_CARD, px + 1, py + 4, GOLD_CARD_PALETTE)
    glint(buffer, px + (Math.floor(steps / 12) % 2 ? 12 : 3), py + (Math.floor(steps / 12) % 2 ? 4 : 11))
  }
}

/** EATER's bonus in its cell: fries, the milkshake, a donut, or the golden burger with its glints. */
function drawEaterBonus(buffer: PixelBuffer, kind: import('./eater').EaterBonus, px: number, py: number, steps: number): void {
  if (kind === 'fries') buffer.blit(FRIES, px + 2, py + 2, FRIES_PALETTE)
  else if (kind === 'shake') buffer.blit(MILKSHAKE, px + 2, py, MILKSHAKE_PALETTE)
  else if (kind === 'donut') buffer.blit(DONUT, px + 2, py + 3, DONUT_PALETTE)
  else {
    buffer.blit(MINI_BURGER, px + 2, py + 3, GOLD_BURGER_PALETTE)
    glint(buffer, px + (Math.floor(steps / 12) % 2 ? 13 : 3), py + (Math.floor(steps / 12) % 2 ? 3 : 11))
  }
}

/** A moment of a game of RANDOM CATCHER, drawn from its state. The surface is used again on the next call. */
export function renderCatcherGame(s: CatcherState, accent: string, view: PlayView = {}): PixelBuffer {
  const layout = s.layout
  const tall = layout === 'portrait'
  const pad = view.pad ?? tall
  const floor = cachedFloor(`catcher|${layout}|${pad}|${accent}`, layout, pad, (buffer) => {
    drawStoreFloor(buffer, s.maze, HUD_HEIGHT, accent, tall)
    const cross = dpadGeometry(layout, pad)
    if (cross) dpad(buffer, cross.cx, cross.cy, cross.arm, accent)
  })
  const buffer = surface('catcher', layout, pad)
  buffer.data.set(floor.data)
  const top = HUD_HEIGHT
  const at = (x: number, y: number): [number, number] => [Math.round(x * CELL), Math.round(top + y * CELL)]
  const beat = (every: number) => Math.floor(s.steps / every) % 2
  for (const k of s.puddles.keys()) { const [x, y] = k.split(',').map(Number); puddle(buffer, ...at(x, y)) }
  const kinds = [TOMATO, PICKLE, ONION, CHEESE]
  for (const it of s.items) { const [px, py] = at(it.x, it.y); buffer.blit(kinds[it.kind], px + 3, py + 3, ITEM_PALETTE) }
  // the sauce blinks in its last two seconds
  if (s.sauce && (s.sauce.timer > 120 || beat(8) === 0)) { const [px, py] = at(s.sauce.x, s.sauce.y); buffer.blit(SAUCE, px + 2, py + 1, SAUCE_PALETTE) }
  // the money, blinking in its last two seconds too
  if (s.cash && (s.cash.timer > 120 || beat(8) === 0)) drawCash(buffer, s.cash.kind, ...at(s.cash.x, s.cash.y), s.steps)
  s.shoppers.forEach((sh, i) => {
    if (!sh.inside) return
    const [px, py] = at(positionOf(sh).x, positionOf(sh).y)
    if (sh.stunned > 0) { buffer.blit(HUMAN[0], px, py - 2, humanPalette(sh.look)); dizzy(buffer, px, py - 2, Math.floor(s.steps / 6)) }
    else buffer.blit(HUMAN[(Math.floor(s.steps / 10) + i) % 2], px, py, humanPalette(sh.look))
  })
  // caught, the burger blinks where it was
  if (!(s.phase === 'caught' && beat(6) === 0)) {
    const [px, py] = at(positionOf(s.burger).x, positionOf(s.burger).y)
    buffer.blit(BURGER[s.burger.dir ? beat(8) : 0], px, py, BURGER_PALETTE, { flipX: s.burger.face === 'left' })
  }
  hud(buffer, accent, {
    level: s.level, score: s.score, lives: Math.max(0, s.lives),
    list: kinds.map((icon, k) => ({ icon, palette: ITEM_PALETTE, have: s.have[k], need: s.need[k] })),
  })
  if (s.phase === 'clear') playCard(buffer, layout, accent, 'LEVEL CLEAR', [])
  else if (view.pause != null) playCard(buffer, layout, accent, 'PAUSED', ['RESUME', 'QUIT'], view.pause)
  return buffer
}

/** A moment of a game of RANDOM EATER, drawn from its state: furniture still waiting for room shows faint. */
export function renderEaterGame(s: EaterState, accent: string, view: PlayView = {}): PixelBuffer {
  const layout = s.layout
  const tall = layout === 'portrait'
  const pad = view.pad ?? tall
  const { width } = playSize(layout, pad)
  const kind = EATER_LEVELS[(s.level - 1) % EATER_LEVELS.length].floor
  const floor = cachedFloor(`eater|${layout}|${pad}|${accent}|${kind}`, layout, pad, (buffer) => {
    drawDinerFloor(buffer, s.cols, s.rows, HUD_HEIGHT, accent, kind)
    const cross = dpadGeometry(layout, pad)
    if (cross) dpad(buffer, cross.cx, cross.cy, cross.arm, accent)
  })
  const buffer = surface('eater', layout, pad)
  buffer.data.set(floor.data)
  const top = HUD_HEIGHT
  for (const entry of s.islands) {
    // the rules keep a tall board's furniture already turned over; drawn from its wide self, chair backs and booths face the right way
    for (const f of entry.island) drawFurniture(buffer, tall ? { ...f, x: f.y, y: f.x, w: f.h, h: f.w } : f, top, accent, tall)
    if (!entry.solid) for (const f of entry.island) {
      for (let y = 0; y < f.h * CELL; y += 1) for (let x = (y % 2); x < f.w * CELL; x += 2) buffer.set(f.x * CELL + x, top + f.y * CELL + y, '#110f18')
    }
  }
  const place = (c: { x: number; y: number }): [number, number] => [c.x * CELL, top + c.y * CELL]
  if (s.food) { const [px, py] = place(s.food); buffer.blit(MINI_BURGER, px + 2, py + 3, MINI_BURGER_PALETTE) }
  if (s.bonus) {
    // the bonus, a ring of light round it counting its seconds down
    const [px, py] = place(s.bonus)
    const share = s.bonus.timer / s.bonus.life
    const ring = s.bonus.kind === 'gold' ? '#ffd23f' : s.bonus.kind === 'fries' ? '#ffb040' : '#ff9ac0'
    for (let a = 0; a < Math.PI * 2 * share; a += 0.08) buffer.set(Math.round(px + 8 + Math.cos(a - Math.PI / 2) * 10), Math.round(py + 8 + Math.sin(a - Math.PI / 2) * 10), (Math.floor(s.steps / 4) + Math.round(a * 4)) % 3 === 0 ? '#ffffff' : ring)
    drawEaterBonus(buffer, s.bonus.kind, px, py, s.steps)
  }
  const palette = eaterPalette(accent)
  const body = s.body.map((c) => [c.x, c.y] as [number, number])
  const n = body.length
  const step = s.moves % 2
  buffer.blit(facing(CRAWL_LEGS[step], toward(body[n - 1], body[n - 2])), ...place(s.body[n - 1]), palette)
  for (let i = n - 2; i >= 1; i -= 1) {
    const front = toward(body[i], body[i - 1]), back = toward(body[i], body[i + 1])
    const look = i === 1 ? { pattern: 'plain' as const, cloth: accent, print: accent } : torsoLook(i - 2)
    const piece = tubePiece(front, back, look)
    buffer.blit(piece.sprite, ...place(s.body[i]), piece.palette)
    if (i === 1) buffer.blit(facing(CRAWL_ARMS[step], front), ...place(s.body[i]), palette)
  }
  buffer.blit(facing(CRAWL_HEAD, toward(body[1], body[0])), ...place(s.body[0]), palette)
  hud(buffer, accent, { level: s.level, score: s.score, progress: [s.eaten, s.target] })
  if (s.phase === 'won' && s.single) playCard(buffer, layout, accent, 'LEVEL CLEAR', [])
  else if (view.pause != null) playCard(buffer, layout, accent, 'PAUSED', ['RESUME', 'QUIT'], view.pause)
  else if (s.levelUp > 0 && Math.floor(s.levelUp / 10) % 2 === 0) arcadeText(buffer, 'LEVEL UP', width / 2, HUD_HEIGHT + 30, 3, accent)
  return buffer
}
