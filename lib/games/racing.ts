/**
 * RANDOM RACING's screens, after the owner's picture: traced from it
 * (`scripts/games/racing-trace.ts`, files in `public/games/racing/`).
 *
 * The title is the picture itself — the coast road at sunset, the sun going
 * down into the sea, the city, the neon diner, the people at the rail, the
 * palms, the three cars from behind — wide, or tall for a phone with the sky
 * carried up for the title — made simpler than the picture, nearer the
 * other games' level of detail. The sea glitters, the diner's neon (drawn
 * here, sharp) flickers, the cars' exhausts puff. Over it, RANDOM, and RACING in chrome in the theme's
 * colour, leaning forward with its speed lines and its chequered strip;
 * LEVEL, BEST and PRESS START where the other games have them.
 *
 * The car is chosen on the title: the one marked, left and right to change
 * it, a tap on another. The race itself is drawn by `racing-play.ts`, its
 * rules in `racing-rules.ts`. GAME OVER on the same coast a shade darker,
 * WINNER in full light, in RACING's chrome.
 */

import { RACING_MOTION } from './racing-art-data'
import { racingArt, type RacingCarKind } from './racing-art'
import { RACING_LETTERING, type RacingLettering } from './racing-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { STAT_LOOK } from './racing-play'
import { CAR_STATS, RACING_STATS } from './racing-rules'
import { puff } from './racing-scene'
import { dim, dither, drawText7, mix, PixelBuffer, text7Width } from './pixels'
import { gameOverHits, winnerHits, winnerRow } from './screens'
import { arcadeText, button, CREAM, infoLine, INK, pressStart } from './ui'

export type { RacingLettering }
type Layout = 'landscape' | 'portrait'

// ---------------------------------------------------------------- the word

type Mask = { w: number; h: number; data: Uint8Array }
const masks = new Map<RacingLettering, Mask>()
function maskOf(name: RacingLettering): Mask {
  let mask = masks.get(name)
  if (mask) return mask
  const spec = RACING_LETTERING[name]
  const data = new Uint8Array(spec.width * spec.height)
  spec.runs.split(' ').forEach((row, y) => {
    let x = 0, on = false
    for (const k of row.split('.')) { const n = parseInt(k, 36); if (on) data.fill(1, y * spec.width + x, y * spec.width + x + n); x += n; on = !on }
  })
  mask = { w: spec.width, h: spec.height, data }
  masks.set(name, mask)
  return mask
}

/** The word's face brought to `width` pixels, leaning forward by `lean` (pixels across per pixel up). */
function face(name: RacingLettering, width: number, lean: number): Mask {
  const src = maskOf(name)
  const s = width / src.w, h = Math.round(src.h * s), extra = Math.ceil(h * lean)
  const w = width + extra
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    const shift = (h - 1 - y) * lean
    for (let x = 0; x < w; x += 1) {
      // the share of the source's pixels on: on from a half
      const sx0 = (x - shift) / s, sy0 = y / s
      let on = 0, all = 0
      for (let k = 0; k < 4; k += 1) {
        const X = Math.floor(sx0 + ((k & 1) + 0.5) / (2 * s)), Y = Math.floor(sy0 + ((k >> 1) + 0.5) / (2 * s))
        all += 1
        if (X >= 0 && Y >= 0 && X < src.w && Y < src.h && src.data[Y * src.w + X]) on += 1
      }
      if (on * 2 >= all) data[y * w + x] = 1
    }
  }
  return { w, h, data }
}

const logos = new Map<string, Array<[number, number, string]>>()
/**
 * RACING in chrome: the face lit white at the top, a dark line across its
 * middle like a horizon, warm under it with two thin light bands running
 * through, as if the letters went fast; deep toward the lower left as if it
 * had come from there; a cream edge, an ink outline.
 */
function logoPixels(name: RacingLettering, width: number, accent: string): Array<[number, number, string]> {
  const key = `${name}|${width}|${accent}`
  let out = logos.get(key)
  if (out) return out
  const f = face(name, width, 0.2)
  const depth = Math.max(4, Math.round(f.h * 0.09))
  const pad = depth + 4
  const W = f.w + pad * 2, H = f.h + pad * 2
  const at = (m: Uint8Array, x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1
  const fill = new Uint8Array(W * H)
  for (let y = 0; y < f.h; y += 1) for (let x = 0; x < f.w; x += 1) if (f.data[y * f.w + x]) fill[(y + pad) * W + x + pad] = 1
  // the depth: the face pushed down and to the left, step by step
  const side = new Uint8Array(W * H)
  for (let d = 1; d <= depth; d += 1) for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (at(fill, x, y)) { const X = x - Math.round(d * 0.7), Y = y + d; if (X >= 0 && Y < H && !fill[Y * W + X]) side[Y * W + X] = Math.max(side[Y * W + X], d) }
  const body = (x: number, y: number) => at(fill, x, y) || (x >= 0 && y >= 0 && x < W && y < H && side[y * W + x] > 0)
  out = []
  const light = mix(accent, '#ffffff', 0.55), warm = mix(accent, '#ffe08a', 0.45), line = dim(accent, 0.35)
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (at(fill, x, y)) {
      // a cream edge where the face meets anything else
      const edge = !at(fill, x, y - 1) || !at(fill, x - 1, y)
      const t = (y - pad) / f.h
      let c: string
      if (t < 0.5) c = mix('#ffffff', light, (t / 0.5) ** 1.3)
      else if (t < 0.56) c = line
      else c = mix(accent, warm, (t - 0.56) / 0.44)
      if ((t > 0.68 && t < 0.72) || (t > 0.83 && t < 0.86)) c = mix(c, '#ffffff', 0.55)
      if (dither(x, y, 0.25) && t < 0.5) c = mix(c, '#ffffff', 0.25)
      out.push([x, y, edge ? CREAM : c])
    } else if (side[y * W + x]) {
      const d = side[y * W + x]
      out.push([x, y, mix(dim(accent, 0.55), dim(accent, 0.25), d / depth)])
    } else if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => body(x + dx, y + dy))) out.push([x, y, INK])
  }
  logos.set(key, out)
  return out
}

/** How tall a word stands in chrome at a width, its depth and outline in. */
export function racingLogoHeight(name: RacingLettering, width: number): number {
  let h = 0
  for (const [, y] of logoPixels(name, width, CREAM)) h = Math.max(h, y + 1)
  return h
}

/**
 * RACING (or another of the words), centred on `cx`, its top at `y`,
 * `width` wide: speed lines trailing from its letters' left side, long and
 * short, some thick; a chequered strip under its right half (unless `strip`
 * is false); a glint running across the chrome.
 */
function drawRacingLogo(buffer: PixelBuffer, cx: number, y: number, width: number, accent: string, name: RacingLettering, frame: number, strip = true): void {
  const px = logoPixels(name, width, accent)
  let w = 0, h = 0
  for (const [x, yy] of px) { w = Math.max(w, x + 1); h = Math.max(h, yy + 1) }
  const x0 = Math.round(cx - w / 2)
  const lines: Array<[number, number, number]> = [[0.14, 0.26, 1], [0.27, 0.42, 2], [0.4, 0.3, 1], [0.55, 0.46, 2], [0.68, 0.34, 1], [0.8, 0.4, 2], [0.9, 0.22, 1]]
  for (const [t, share, thick] of lines) {
    const row = Math.round(h * t)
    const first = px.reduce((m, [x, yy, c]) => (yy === row && c !== INK && x < m ? x : m), w)
    if (first >= w) continue
    const len = Math.round(width * share), from = x0 + first - 3
    for (let k = 0; k < len; k += 1) {
      const a = 1 - k / len
      for (let d = 0; d < thick; d += 1) {
        if (!dither(from - k, y + row + d, a)) continue
        buffer.set(from - k, y + row + d, k < len * 0.35 ? CREAM : mix(accent, '#ffffff', 0.35))
      }
      if (k < len * 0.7 && dither(from - k, y + row + thick, a)) buffer.set(from - k, y + row + thick, INK)
    }
  }
  for (const [x, yy, c] of px) buffer.set(x0 + x, y + yy, c)
  // the chequered strip under the right half, leaning with the letters
  if (strip) chequers(buffer, x0, y, w, h)
  // a glint running across the chrome
  const g = (frame * 37) % (w + 80) - 40
  for (const [x, yy, c] of px) if (c !== INK && c !== CREAM && Math.abs(x - yy * 0.5 - g) < 3) buffer.set(x0 + x, y + yy, mix(c, '#ffffff', 0.65))
}

/** The chequered strip under a word's right half, leaning with its letters. */
function chequers(buffer: PixelBuffer, x0: number, y: number, w: number, h: number): void {
  const sq = Math.max(3, Math.round(h * 0.07)), sy = y + h - Math.round(sq * 0.5), from = x0 + Math.round(w * 0.56), to = x0 + Math.round(w * 0.93)
  for (let r = -1; r <= sq * 2; r += 1) for (let x = from - 1; x <= to + 1; x += 1) {
    const X = x - Math.round(r * 0.2)
    const inside = r >= 0 && r < sq * 2 && x >= from && x < to
    buffer.set(X, sy + r, inside ? ((Math.floor((x - from) / sq) + Math.floor(r / sq)) % 2 ? CREAM : '#1a1a22') : INK)
  }
}

// ---------------------------------------------------------------- the picture's moving parts

/** The sun's path on the sea under it (`cx`), from the horizon (`top`) to the shore (`bottom`), `half` wide at the horizon and narrowing to the shore, as light on water does: short lines of gold and orange, broken, shifting from one moment to the next. */
function sunPath(buffer: PixelBuffer, cx: number, top: number, bottom: number, half: number, frame: number): void {
  for (let y = top + 1; y < bottom; y += 1) {
    if ((y - top) % 3 === 2) continue
    const t = (y - top) / Math.max(1, bottom - top), w = half * (1 - t * 0.6)
    let x = Math.round(cx - w)
    while (x < cx + w) {
      const h = ((x * 73856093) ^ (y * 19349663) ^ (frame * 83492791)) >>> 0
      const len = 2 + (h % 7), gap = 1 + ((h >>> 3) % 4)
      const near = Math.abs(x + len / 2 - cx) / w
      const c = near < 0.35 ? '#fff4b8' : near < 0.7 ? '#ffd06a' : '#ff9a4a'
      // thinner toward its sides: some of the outer lines left out
      if (near < 0.6 || (h >>> 9) % 3 !== 0) for (let k = 0; k < len && x + k < cx + w; k += 1) buffer.set(x + k, y, c)
      x += len + gap
    }
  }
}

/** The diner's sign in its box (`x0`, `y0` to `x1`, `y1`): a dark panel framed in pink, DINER in pink neon, its glow round it; dim when off. */
function neon(buffer: PixelBuffer, x0: number, y0: number, x1: number, y1: number, on: boolean): void {
  const w = x1 - x0, h = y1 - y0, scale = h >= 30 ? 2 : 1
  const pink = on ? '#ff6ac8' : '#7a2a5a', light = on ? '#ffd0f0' : '#a05a88'
  if (on) for (let y = y0 - 4; y < y1 + 4; y += 1) for (let x = x0 - 4; x < x1 + 4; x += 1) if (dither(x, y, 0.45)) buffer.tint(x, y, '#ff4ab0', 0.3)
  buffer.rect(x0, y0, w, h, '#1a0a2a')
  buffer.rect(x0, y0, w, 1, pink); buffer.rect(x0, y1 - 1, w, 1, pink); buffer.rect(x0, y0, 1, h, pink); buffer.rect(x1 - 1, y0, 1, h, pink)
  const word = 'DINER', tw = text7Width(word, scale, true), tx = Math.round(x0 + (w - tw) / 2), ty = Math.round(y0 + (h - 7 * scale) / 2)
  drawText7(buffer, word, tx, ty + 1, dim(pink, 0.45), scale, true)
  drawText7(buffer, word, tx, ty, pink, scale, true)
  // the tubes' bright heart
  if (on) for (let y = ty; y < ty + 7 * scale; y += 1) for (let x = tx; x < tx + tw; x += 1) if (buffer.hex(x, y) === pink && (x + y) % 3 === 0) buffer.set(x, y, light)
}

// ---------------------------------------------------------------- the title

/** Where the words stand on each title, over the picture's sky; where the picture had them. */
const TITLE: Record<Layout, { randomY: number; logoY: number; logoW: number; cx: number; press: number; info: 'top' | 'bottom' }> = {
  landscape: { randomY: 24, logoY: 74, logoW: 446, cx: 388, press: 386, info: 'top' },
  portrait: { randomY: 112, logoY: 168, logoW: 384, cx: 216, press: 704, info: 'bottom' },
}

/** The picture with what moves on it: the sun's path shimmering, the sea glittering, the diner's neon flickering, the cars' exhausts puffing. */
function scene(layout: Layout, frame: number): PixelBuffer {
  const wide = layout === 'landscape'
  const W = wide ? 768 : 432, H = wide ? 432 : 768
  const buffer = new PixelBuffer(W, H, '#1a0c34')
  const pic = racingArt(wide ? 'titleWide' : 'titleTall')
  if (!pic) {
    for (let y = 0; y < H; y += 1) buffer.rect(0, y, W, 1, mix('#1a0c34', '#ff7a5a', (y / H) ** 1.5))
    return buffer
  }
  buffer.data.set(pic.data)
  const m = RACING_MOTION[wide ? 'wide' : 'tall']
  sunPath(buffer, m.sun[0], m.sun[1], m.sun[2], m.sun[3], frame)
  m.sea.forEach(([x, y], i) => { const k = (i * 7 + frame) % 5; if (k === 0) buffer.set(x, y, '#ffffff'); else if (k === 3) buffer.tint(x, y, '#1a6a9a', 0.45) })
  neon(buffer, m.neon[0], m.neon[1], m.neon[2], m.neon[3], frame % 9 !== 8)
  m.exhausts.forEach(([x, y], i) => puff(buffer, x, y, i % 2 ? 1 : -1, frame, i * 2))
  return buffer
}

const CAR_ORDER: readonly RacingCarKind[] = ['rosso', 'burger', 'giallo']
/** Each car's box on a title. */
const carBox = (layout: Layout, car: RacingCarKind): readonly number[] => RACING_MOTION[layout === 'landscape' ? 'wide' : 'tall'].cars[car]
/** The car under a finger on the title, if any (a little room round each). */
export function racingCarAt(layout: Layout, x: number, y: number): RacingCarKind | null {
  for (const car of CAR_ORDER) { const [x0, y0, x1, y1] = carBox(layout, car); if (x >= x0 - 6 && x < x1 + 6 && y >= y0 - 16 && y < y1 + 6) return car }
  return null
}
/** The next car to the left (`-1`) or the right (`1`) of one, staying put at the ends. */
export const nextCar = (car: RacingCarKind, way: -1 | 1): RacingCarKind => CAR_ORDER[Math.max(0, Math.min(CAR_ORDER.length - 1, CAR_ORDER.indexOf(car) + way))]

/** A triangle pointing down (`dir` 0), left (−1) or right (1), its point at `x`, `y`, `size` long, with an ink edge. */
function pointer(buffer: PixelBuffer, x: number, y: number, size: number, dir: -1 | 0 | 1, color: string): void {
  for (const [ink, grow] of [[true, 1], [false, 0]] as const) {
    for (let k = 0; k <= size + grow; k += 1) {
      const half = Math.round((k * 0.75)) + grow
      if (dir === 0) buffer.rect(Math.round(x - half), Math.round(y - k + (ink ? 1 : 0)), half * 2 + 1, 1, ink ? INK : color)
      else buffer.rect(Math.round(x - dir * k + (ink ? dir : 0)), Math.round(y - half), 1, half * 2 + 1, ink ? INK : color)
    }
  }
}

/**
 * The chosen car marked: corners round it in the theme's colour, a pointer
 * over it bobbing, and small arrows on its sides toward the other cars.
 */
function markCar(buffer: PixelBuffer, layout: Layout, car: RacingCarKind, accent: string, frame: number, on: boolean): void {
  const [x0, y0, x1, y1] = carBox(layout, car)
  const c = mix(accent, CREAM, 0.2), arm = layout === 'landscape' ? 16 : 11, t = 3
  if (on) {
    for (const [cx, cy, sx, sy] of [[x0 - 4, y0 - 4, 1, 1], [x1 + 4, y0 - 4, -1, 1], [x0 - 4, y1 + 2, 1, -1], [x1 + 4, y1 + 2, -1, -1]] as const) {
      const hx = sx > 0 ? cx : cx - arm, vy = sy > 0 ? cy : cy - arm
      buffer.rect(hx + 1, cy - (sy > 0 ? 0 : t) + 1, arm, t, INK)
      buffer.rect((sx > 0 ? cx : cx - t) + 1, vy + 1, t, arm, INK)
      buffer.rect(hx, cy - (sy > 0 ? 0 : t), arm, t, c)
      buffer.rect(sx > 0 ? cx : cx - t, vy, t, arm, c)
    }
  }
  const mid = (x0 + x1) / 2, bob = frame % 2 ? 2 : 0
  pointer(buffer, mid, y0 - 10 + bob, layout === 'landscape' ? 13 : 9, 0, accent)
  const i = CAR_ORDER.indexOf(car), side = layout === 'landscape' ? 11 : 8, cy = (y0 + y1) / 2
  if (i > 0) pointer(buffer, x0 - 10, cy, side, -1, accent)
  if (i < CAR_ORDER.length - 1) pointer(buffer, x1 + 10, cy, side, 1, accent)
}

/** Over the car chosen, what it is made of: its four points as rows of pips, so the choice is a real one. */
function carCard(buffer: PixelBuffer, layout: Layout, car: RacingCarKind): void {
  const [x0, y0, x1] = carBox(layout, car)
  const stats = CAR_STATS[car], pip = layout === 'landscape' ? 9 : 8, gap = 2, label = 40, row = pip + 4
  const w = label + 5 * (pip + gap) + 10, h = 4 * row + 10
  const x = Math.round(Math.max(4, Math.min(buffer.width - w - 4, (x0 + x1) / 2 - w / 2))), y = Math.round(y0 - 26 - h)
  buffer.rect(x - 1, y - 1, w + 2, h + 2, INK)
  buffer.rect(x, y, w, h, '#16142a')
  RACING_STATS.forEach((stat, k) => {
    const look = STAT_LOOK[stat], ry = y + 6 + k * row
    drawText7(buffer, look.name, x + 5, ry + Math.round((pip - 7) / 2), look.colour, 1)
    for (let n = 0; n < 5; n += 1) buffer.rect(x + 5 + label + n * (pip + gap), ry, pip, pip, n < stats[stat] ? look.colour : '#3a3a4a')
  })
}

export type RacingTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean; car?: RacingCarKind }

/** RANDOM RACING's title, wide (768 × 432) or tall (432 × 768): the picture, the car chosen marked on it, RANDOM, RACING, PRESS START, LEVEL and BEST. */
export function renderRacingTitle(layout: Layout, accent: string, lettering: RacingLettering = 'sans', options: RacingTitleOptions = {}): PixelBuffer {
  const W = layout === 'landscape' ? 768 : 432
  const st = TITLE[layout], frame = options.frame ?? 0
  const buffer = scene(layout, frame)
  if (racingArt(layout === 'landscape' ? 'titleWide' : 'titleTall')) { markCar(buffer, layout, options.car ?? 'burger', accent, frame, options.blink !== false); carCard(buffer, layout, options.car ?? 'burger') }
  // RANDOM, then RACING over the sky
  const rx = Math.round(st.cx - LOGO_WIDTH)
  drawLogo(buffer, rx + 3, st.randomY + 4, INK, 2)
  drawLogo(buffer, rx, st.randomY, mix(accent, CREAM, 0.25), 2)
  drawRacingLogo(buffer, st.cx, st.logoY, st.logoW, accent, lettering, frame)
  if (options.press !== false) pressStart(buffer, st.cx, st.press, accent, options.blink !== false, 2)
  const level = String(options.level ?? 1), best = String(options.best ?? 0).padStart(5, '0')
  if (st.info === 'top') {
    infoLine(buffer, 16, 16, 'LEVEL', level, 'left', 2)
    infoLine(buffer, W - 16, 16, 'BEST', best, 'right', 2)
  } else {
    infoLine(buffer, W / 2 - 14, st.press + 24, 'LEVEL', level, 'right', 2)
    infoLine(buffer, W / 2 + 14, st.press + 24, 'BEST', best, 'left', 2)
  }
  return buffer
}

// ---------------------------------------------------------------- the play

export {
  drawArt, drawCar, racingGarageAt, racingPadGeometry, racingPadPart, RACING_BOARD, renderRacingGame, renderRacingPlay, STAT_LOOK,
  type RacingPad, type RacingPlayOptions, type RacingView,
} from './racing-play'

// ---------------------------------------------------------------- GAME OVER and WINNER

/** `choice`: the answer lit, YES (0) or NO (1); `ask` false leaves PLAY AGAIN? and its answers out. */
export type RacingEndOptions = { score?: number; best?: number; frame?: number; blink?: boolean; choice?: 0 | 1; ask?: boolean }

/**
 * GAME OVER: the coast a shade darker, GAME OVER in RACING's chrome — one
 * line wide, two tall — the score and the best, PLAY AGAIN? and its two
 * answers where EATER has them (so a tap finds them the same).
 */
export function renderRacingOver(layout: Layout, accent: string, options: RacingEndOptions = {}): PixelBuffer {
  const frame = options.frame ?? 0
  const buffer = scene(layout, frame)
  buffer.shade(0, 0, buffer.width, buffer.height, 0.5)
  const W = buffer.width, c = W / 2
  if (layout === 'landscape') drawRacingLogo(buffer, c + 10, 34, 560, accent, 'gameOver', frame)
  else {
    drawRacingLogo(buffer, c + 8, 70, 300, accent, 'game', frame, false)
    drawRacingLogo(buffer, c + 8, 70 + racingLogoHeight('game', 300) + 4, 300, accent, 'over', frame)
  }
  const at = layout === 'landscape' ? { score: 160, best: 160, question: 200, buttons: 250 } : { score: 356, best: 384, question: 428, buttons: 474 }
  const score = String(options.score ?? 0).padStart(5, '0'), best = String(options.best ?? 0).padStart(5, '0')
  if (layout === 'landscape') {
    infoLine(buffer, c - 20, at.score, 'SCORE', score, 'right', 2)
    infoLine(buffer, c + 20, at.best, 'BEST', best, 'left', 2)
  } else {
    infoLine(buffer, c, at.score, 'SCORE', score, 'centre', 2)
    infoLine(buffer, c, at.best, 'BEST', best, 'centre', 2)
  }
  if (options.ask === false) return buffer
  arcadeText(buffer, 'PLAY AGAIN?', c, at.question, layout === 'landscape' ? 4 : 3, accent)
  const chosen = options.blink !== false, choice = options.choice ?? 0
  button(buffer, 'YES', c - 64, at.buttons, accent, chosen && choice === 0, 2)
  button(buffer, 'NO', c + 64, at.buttons, accent, chosen && choice === 1, 2)
  return buffer
}
/** GAME OVER's answers: where EATER's are. */
export const racingOverHits = (layout: Layout) => gameOverHits('eater', layout)
/** WINNER's answers: where the other games' are. */
export const racingWinnerHits = (layout: Layout) => winnerHits(layout)

/**
 * WINNER, the sixteenth level cleared: the coast in full light, WINNER in
 * RACING's chrome where RACING was, the chosen car marked; the score and the
 * best in the top corners, PLAY AGAIN? with its two answers along the foot.
 */
export function renderRacingWinner(layout: Layout, accent: string, options: RacingEndOptions & { car?: RacingCarKind } = {}): PixelBuffer {
  const frame = options.frame ?? 0
  const buffer = scene(layout, frame)
  const W = buffer.width, H = buffer.height, st = TITLE[layout]
  if (racingArt(layout === 'landscape' ? 'titleWide' : 'titleTall')) markCar(buffer, layout, options.car ?? 'burger', accent, frame, true)
  drawRacingLogo(buffer, st.cx, st.logoY - 10, st.logoW, accent, 'winner', frame)
  infoLine(buffer, 16, 16, 'SCORE', String(options.score ?? 0).padStart(5, '0'), 'left', 2)
  infoLine(buffer, W - 16, 16, 'BEST', String(options.best ?? 0).padStart(5, '0'), 'right', 2)
  if (options.ask === false) return buffer
  const row = winnerRow(layout)
  const chosen = options.blink !== false, choice = options.choice ?? 0
  buffer.shade(0, row.y - 5, W, H - row.y + 5, 0.45)
  drawText7(buffer, 'PLAY AGAIN?', row.text + 2, row.textY + 2, INK, 2)
  drawText7(buffer, 'PLAY AGAIN?', row.text, row.textY, CREAM, 2)
  button(buffer, 'YES', row.yes, row.y, accent, chosen && choice === 0, 2)
  button(buffer, 'NO', row.no, row.y, accent, chosen && choice === 1, 2)
  return buffer
}
