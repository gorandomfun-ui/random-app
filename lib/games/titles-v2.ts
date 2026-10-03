/**
 * A proposal for RANDOM EATER's and RANDOM CATCHER's titles, in the manner
 * RANDOM ATTACKS' title found: the same street, the same building, the same
 * characters, with more depth and more life. The sky glows over the city at
 * the horizon, a third row of buildings stands far off in the haze, a
 * shooting star now and then; the building's light falls on the sidewalk;
 * the road is wet and shimmers with the windows, the neon and the lamps;
 * the cars light the road ahead; the characters have a lit edge and a
 * shaded one. Shown on the test page only, next to the titles in play.
 */

import { drawLogo, LOGO_WIDTH } from './logo'
import { drawEaterLogo, eaterLogoSize } from './logos'
import { dither, mix, PixelBuffer, rgbOf, scale2x, type Palette, type Sprite } from './pixels'
import { car, cloud, drawDiner, drawStore, moon, NIGHTS, railing, rng, signFrame, skyline, sky, stars, street, wisp, type Night } from './scenes'
import { CAR_SCALE, drawMarks, drawProp, smooth, stage, type Game, type Layout, type Stage, type TitleOptions } from './screens'
import { BURGER, BURGER_PALETTE, CELL, CRAWL_ARMS, CRAWL_HEAD, CRAWL_LEGS, eaterPalette, MINI_BURGER, MINI_BURGER_PALETTE, torsoLook, tubePiece } from './sprites'
import { CREAM, infoLine, INK, pressStart } from './ui'

const SIZE: Record<Layout, { width: number; height: number }> = { landscape: { width: 768, height: 432 }, portrait: { width: 432, height: 768 } }
const lumOf = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b

// ---------------------------------------------------------------- characters with volume

const shaded = new WeakMap<Sprite, Map<string, Array<[number, number, string]>>>()
/**
 * A sprite drawn with a lit edge toward the upper left and a shaded one away
 * from it, on each of its parts (a part: neighbouring pixels of close
 * colours), the ink lines kept as they are.
 */
function blitShaded(buffer: PixelBuffer, sprite: Sprite, x: number, y: number, palette: Palette): void {
  const key = Object.entries(palette).map(([k, v]) => k + v).join('')
  let byPalette = shaded.get(sprite)
  if (!byPalette) { byPalette = new Map(); shaded.set(sprite, byPalette) }
  let pixels = byPalette.get(key)
  if (!pixels) {
    pixels = []
    const colorAt = (cx: number, cy: number) => (cy >= 0 && cy < sprite.length && cx >= 0 && cx < sprite[cy].length ? palette[sprite[cy][cx]] : undefined)
    const apart = (a: string, b: string | undefined) => { if (!b) return true; const [r1, g1, b1] = rgbOf(a), [r2, g2, b2] = rgbOf(b); return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) > 120 }
    for (let yy = 0; yy < sprite.length; yy += 1) for (let xx = 0; xx < sprite[yy].length; xx += 1) {
      const hex = palette[sprite[yy][xx]]
      if (!hex) continue
      const [r, g, b] = rgbOf(hex)
      if (lumOf(r, g, b) < 40) { pixels.push([xx, yy, hex]); continue }
      const lit = apart(hex, colorAt(xx, yy - 1)) || (apart(hex, colorAt(xx - 1, yy)) && apart(hex, colorAt(xx - 1, yy - 1)))
      const dark = apart(hex, colorAt(xx + 1, yy + 1)) || apart(hex, colorAt(xx + 2, yy + 2)) || apart(hex, colorAt(xx + 1, yy))
      pixels.push([xx, yy, lit && !dark ? mix(hex, '#ffffff', 0.32) : dark && !lit ? mix(hex, '#160a26', 0.3) : hex])
    }
    byPalette.set(key, pixels)
  }
  for (const [dx, dy, hex] of pixels) buffer.set(x + dx, y + dy, hex)
}

/** The eater crawling right, as in play but with volume: legs, `torso` pieces, shoulders and arms, the head at `x`. */
function crawler(buffer: PixelBuffer, x: number, y: number, accent: string, frame: number, torso: number): void {
  const palette = eaterPalette(accent)
  const step = CELL * 2
  const shirt = tubePiece('right', 'left', { pattern: 'plain', cloth: accent, print: accent })
  let cx = x - (torso + 2) * step
  blitShaded(buffer, smooth(CRAWL_LEGS[frame % 2]), cx, y, palette); cx += step
  for (let i = 0; i < torso; i += 1) { const t = tubePiece('right', 'left', torsoLook(i)); blitShaded(buffer, scale2x(t.sprite), cx, y, t.palette); cx += step }
  blitShaded(buffer, scale2x(shirt.sprite), cx, y, shirt.palette); blitShaded(buffer, smooth(CRAWL_ARMS[frame % 2]), cx, y, palette); cx += step
  blitShaded(buffer, smooth(CRAWL_HEAD), cx, y, palette)
}

// ---------------------------------------------------------------- depth and light

/** The city's glow low in the sky, dithered into it: amber over CATCHER's blue night, pink over EATER's violet one. */
function cityGlow(buffer: PixelBuffer, horizon: number, glow: string): void {
  const top = horizon - 150
  for (let y = Math.max(0, top); y < horizon; y += 1) {
    const t = ((y - top) / (horizon - top)) ** 2
    for (let x = 0; x < buffer.width; x += 1) if (dither(x, y, t * 0.75)) buffer.tint(x, y, glow, 0.22)
  }
}

/** A row of buildings far off, behind the others and above them, pale in the haze, with a few pin-point lights and masts. */
function farCity(buffer: PixelBuffer, night: Night, base: number, seed: number, glow: string): void {
  const next = rng(seed)
  const color = mix(night.cities[0], mix(night.sky[night.sky.length - 1], glow, 0.25), 0.6)
  const light = mix(color, glow, 0.6)
  for (let x = -12; x < buffer.width;) {
    const w = 16 + Math.floor(next() * 34), h = 60 + Math.floor(next() * 110)
    buffer.rect(x, base - h, w, h, color)
    buffer.rect(x, base - h, 1, h, mix(color, '#ffffff', 0.08))
    for (let k = 0; k < (w * h) / 70; k += 1) if (next() < 0.55) buffer.set(x + 2 + Math.floor(next() * (w - 4)), base - h + 3 + Math.floor(next() * (h - 6)), light)
    if (next() < 0.25) { buffer.rect(x + Math.floor(w / 2), base - h - 16, 1, 16, color); buffer.set(x + Math.floor(w / 2), base - h - 17, '#ff6a6a') }
    x += w + Math.floor(next() * 8) - 3
  }
}

/** A shooting star now and then, across the upper sky toward the lower left. */
function shootingStar(buffer: PixelBuffer, frame: number): void {
  const p = frame % 24
  if (p > 3) return
  const x0 = Math.round(buffer.width * 0.8 - p * 40), y0 = 26 + p * 13
  for (let i = 0; i < 22; i += 1) {
    const c = i < 3 ? '#ffffff' : i < 10 ? CREAM : '#9aa0c8'
    if (i > 12 && i % 2) continue
    buffer.set(x0 + i, Math.round(y0 - i * 0.34), c)
  }
}

/** The building's light on the sidewalk in front of it, strongest at its foot, fading at its ends. */
function lightSpill(buffer: PixelBuffer, from: number, to: number, ground: number, depth: number, warm: string): void {
  for (let y = ground + 2; y < ground + depth; y += 1) {
    const t = 1 - (y - ground - 2) / depth
    for (let x = from; x < to; x += 1) {
      const edge = Math.min(1, Math.min(x - from, to - x) / 24)
      buffer.tint(x, y, warm, 0.1 * t * edge)
      if (dither(x, y, t * edge * 0.7)) buffer.tint(x, y, warm, 0.22)
    }
  }
}

/**
 * The road wet: what shines above the street — windows, neon, lamps — is
 * seen again in it, upside down, in vertical streaks that break into dashes
 * toward us and sway from one moment to the next.
 */
function wetRoad(buffer: PixelBuffer, mirror: number, from: number, to: number, frame: number): void {
  const W = buffer.width
  const above = new Uint8ClampedArray(buffer.data)
  for (let y = from; y < to; y += 1) {
    const depth = (y - from) / Math.max(1, to - from)
    const my = Math.round(mirror - (y - mirror) * 1.25)
    if (my < 0) continue
    const sway = Math.round(Math.sin((y * 0.9 + frame * 2.1)) * (1 + depth * 2))
    for (let x = 0; x < W; x += 1) {
      const sx = Math.max(0, Math.min(W - 1, x + sway))
      const o = (my * W + sx) * 4
      const r = above[o], g = above[o + 1], b = above[o + 2]
      if (lumOf(r, g, b) < 130) continue
      // dashes: longer near the kerb, broken further out
      const phase = (y + frame * 2 + ((x * 7) % 5)) % (4 + Math.floor(depth * 6))
      if (phase > 2 - depth * 1.5) continue
      const k = 0.55 * (1 - depth * 0.8)
      const t = (y * W + x) * 4
      buffer.data[t] = Math.round(buffer.data[t] + (r - buffer.data[t]) * k); buffer.data[t + 1] = Math.round(buffer.data[t + 1] + (g - buffer.data[t + 1]) * k); buffer.data[t + 2] = Math.round(buffer.data[t + 2] + (b - buffer.data[t + 2]) * k)
    }
  }
}

/** A car's headlights on the road ahead of it: a cone of pale light, dithered, fading away; its tail lights' red glow behind. */
function headlights(buffer: PixelBuffer, x: number, y: number, dir: 1 | -1, s: number): void {
  const hx = dir === 1 ? x + 103 * s : x + 1 * s, hy = y + 18 * s
  for (let i = 0; i < 110; i += 1) {
    const half = 2 + i * 0.26
    for (let k = -half; k <= half; k += 1) {
      const X = Math.round(hx + dir * i), Y = Math.round(hy + k + i * 0.16)
      const t = (1 - i / 110) * (1 - Math.abs(k) / (half + 1))
      buffer.tint(X, Y, '#fff3b0', 0.12 * t)
      if (dither(X, Y, 0.65 * t)) buffer.tint(X, Y, '#fff3b0', 0.3)
    }
  }
  const tx = dir === 1 ? x + 1 * s : x + 103 * s
  for (let i = 0; i < 16; i += 1) for (let k = -3; k <= 3; k += 1) if (dither(Math.round(tx - dir * i), Math.round(hy + k), 0.5 * (1 - i / 16))) buffer.tint(Math.round(tx - dir * i), Math.round(hy + k), '#ff3a2a', 0.35)
}

// ---------------------------------------------------------------- the scene

function scene(buffer: PixelBuffer, game: Game, layout: Layout, accent: string, frame: number): Stage {
  const s = stage(game, layout)
  const night: Night = NIGHTS[game === 'catcher' ? 'blue' : 'violet']
  const glow = game === 'catcher' ? '#ffb85a' : '#ff7aa2'
  const { width: W, height: H } = buffer
  sky(buffer, night, s.horizon)
  cityGlow(buffer, s.horizon, glow)
  stars(buffer, game === 'catcher' ? 7 : 11, layout === 'landscape' ? 170 : 210, s.horizon - 150, frame)
  moon(buffer, ...s.moon)
  shootingStar(buffer, frame)
  s.wisps.forEach(([x, y, w]) => wisp(buffer, x, y, w, night))
  s.clouds.forEach(([x, y, design, flip]) => cloud(buffer, x, y, design, night, flip, s.moon[0] < W / 2))
  farCity(buffer, night, s.ground - 16, game === 'catcher' ? 17 : 19, glow)
  skyline(buffer, night, s.ground - 16, s.far, s.near, frame)
  const [bx, bw] = s.building
  s.props.forEach((prop, i) => { if (prop.kind === 'palm') drawProp(buffer, prop, s, night, accent, true, i) })
  railing(buffer, s.ground - 26, game === 'catcher' ? '#343c6c' : '#3c3068')
  const rx = Math.round(W / 2 - LOGO_WIDTH)
  drawLogo(buffer, rx + 3, s.randomY + 4, INK, 2)
  drawLogo(buffer, rx, s.randomY, mix(accent, CREAM, 0.25), 2)
  if (game === 'catcher') drawStore(buffer, bx, bw, s.ground, accent, frame, true)
  else {
    const lettering = layout === 'landscape' ? 'wide' : 'tall'
    const logo = eaterLogoSize(lettering)
    const roof = s.ground - 128
    const frameTop = s.markY + Math.round(logo.height * 0.24)
    const frameBottom = Math.min(roof - 6, s.markY + logo.height - 10)
    signFrame(buffer, Math.round(W / 2 - logo.width / 2) - 4, frameTop, logo.width + 8, Math.max(20, frameBottom - frameTop), roof)
    drawEaterLogo(buffer, Math.round(W / 2 - logo.width / 2), s.markY, accent, lettering, { lit: frame % 13 !== 12, swashLit: frame % 7 !== 6, glow: true })
    drawDiner(buffer, bx, bw, s.ground, accent, frame, true)
  }
  s.props.forEach((prop, i) => { if (prop.kind !== 'palm') drawProp(buffer, prop, s, night, accent, true, i) })
  street(buffer, night, s.ground, 22, s.road.bottom, s.road.line)
  lightSpill(buffer, bx, bx + bw, s.ground, 22, '#ffd27a')
  wetRoad(buffer, s.ground, s.ground + 28, s.road.bottom, frame)
  if (s.road.bottom < H) {
    buffer.rect(0, s.road.bottom, W, H - s.road.bottom, mix(night.sidewalk, '#000000', 0.45))
    buffer.rect(0, s.road.bottom, W, 3, night.sidewalkLight)
    for (let x = 24; x < W; x += 48) buffer.rect(x, s.road.bottom + 3, 1, H - s.road.bottom - 3, mix(night.sidewalk, '#000000', 0.58))
  }
  // the hero on the sidewalk, with volume
  const door = bx + Math.round(bw / 2)
  if (game === 'catcher') {
    const up = frame % 4 === 1
    blitShaded(buffer, smooth(BURGER[frame % 2]), door - 16, s.ground - 26 - (up ? 4 : 0), BURGER_PALETTE)
  } else {
    const head = door - 60 + (frame % 4) * 3
    crawler(buffer, head, s.ground - 6, accent, frame, 1)
    blitShaded(buffer, smooth(MINI_BURGER), head + 40, s.ground + 3, MINI_BURGER_PALETTE)
  }
  // traffic, each car lighting the road ahead
  const colors = game === 'catcher' ? ['#eeeae0', '#e0304a'] : ['#eeeae0', '#e8563a']
  const carLength = Math.round(104 * CAR_SCALE)
  s.road.lanes.forEach(([y, scale], i) => {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1
    const length = Math.round(104 * scale)
    const span = W + carLength * 2
    const pos = ((frame * (i === 0 ? 14 : 11) + (i === 0 ? carLength - 10 : carLength + 30)) % span) - carLength
    const x = dir === 1 ? pos : W - pos - length
    headlights(buffer, x, y, dir, scale)
    car(buffer, x, y, colors[i % colors.length], dir, scale)
  })
  // CATCHER's letters in volume over it all (EATER's neon hangs on its diner)
  drawMarks(buffer, game, s, accent, frame)
  return s
}

/** The proposed title of a game: the street with depth and light, the same marks, LEVEL, BEST and PRESS START where they are. */
export function renderTitleV2(game: Game, layout: Layout, accent: string, options: TitleOptions = {}): PixelBuffer {
  const { width, height } = SIZE[layout]
  const buffer = new PixelBuffer(width, height, INK)
  const frame = options.frame ?? 0
  const s = scene(buffer, game, layout, accent, frame)
  if (options.press !== false) pressStart(buffer, width / 2, s.press, accent, options.blink !== false, 2)
  const level = String(options.level ?? 1), best = String(options.best ?? 0).padStart(5, '0')
  if (s.info === 'top') {
    infoLine(buffer, 16, 16, 'LEVEL', level, 'left', 2)
    infoLine(buffer, width - 16, 16, 'BEST', best, 'right', 2)
  } else {
    infoLine(buffer, width / 2 - 14, s.press + 24, 'LEVEL', level, 'right', 2)
    infoLine(buffer, width / 2 + 14, s.press + 24, 'BEST', best, 'left', 2)
  }
  return buffer
}
