/**
 * A proposal for RANDOM EATER's and RANDOM CATCHER's titles, in the manner
 * RANDOM ATTACKS' title found: the same street, the same building, the same
 * characters, with more depth and more life. The sky glows over the city at
 * the horizon, a third row of buildings stands far off in the haze, a
 * shooting star now and then; the building's light falls on the sidewalk;
 * the road is wet and shimmers with the windows, the neon and the lamps;
 * the cars light the road ahead; the characters have a lit edge and a
 * shaded one, and EATER's eater stands, swaying, eating a burger; CATCHER's
 * tree has leaves, its drinks machine, bin and hydrant their details. Shown on the test page only, next to the titles in play.
 */

import { drawLogo, LOGO_WIDTH } from './logo'
import { drawEaterLogo, eaterLogoSize } from './logos'
import { dither, mix, PixelBuffer, rgbOf, rotateSprite, scale2x, type Palette, type Sprite } from './pixels'
import { car, cloud, drawDiner, drawStore, moon, NIGHTS, railing, rng, signFrame, skyline, sky, stars, street, wisp, type Night } from './scenes'
import { CAR_SCALE, drawMarks, drawProp, smooth, stage, type Game, type Layout, type Prop, type Stage, type TitleOptions } from './screens'
import { BURGER, BURGER_PALETTE, CELL, CRAWL_HEAD, CRAWL_LEGS, eaterPalette, MINI_BURGER, MINI_BURGER_PALETTE, torsoLook, tubePiece } from './sprites'
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

/**
 * The eater standing, with volume: from the ground up his legs, a striped
 * piece of his body, his shirt with an arm holding a burger to his mouth,
 * his head — each piece swaying a little further than the one under it, so
 * one sees he is made of parts. He bites every other moment.
 */
function standingEater(buffer: PixelBuffer, x: number, feet: number, accent: string, frame: number): void {
  const palette = eaterPalette(accent)
  const step = CELL * 2
  const sway = Math.sin(frame * 0.7)
  const at = (k: number) => Math.round(x + sway * k * 2.5)
  const legs = smooth(rotateSprite(CRAWL_LEGS[frame % 2], 3))
  const stripes = tubePiece('up', 'down', torsoLook(1))
  const shirt = tubePiece('up', 'down', { pattern: 'plain', cloth: accent, print: accent })
  // pieces overlap by a few pixels, as the body's joints do
  const lap = 4
  const legsY = feet - step, torsoY = legsY - step + lap, shirtY = torsoY - step + lap, headY = shirtY - step + lap + 2
  blitShaded(buffer, legs, at(0), legsY, palette)
  blitShaded(buffer, scale2x(stripes.sprite), at(1), torsoY, stripes.palette)
  blitShaded(buffer, scale2x(shirt.sprite), at(2), shirtY, shirt.palette)
  blitShaded(buffer, standingHead(), at(3), headY, palette)
  // the arm up from the shirt to the mouth: the sleeve, then the hand under the burger
  const burgerX = at(3) + 30, burgerY = headY + 12
  const sx = at(2) + 27, sy = shirtY + 8, hx = burgerX + 8, hy = burgerY + 22
  // the ink round the whole arm first, then the arm over it
  for (const inner of [false, true]) for (let t = 0; t <= 1; t += 0.04) {
    const cx = sx + (hx - sx) * t, cy = sy + (hy - sy) * t, r = inner ? 2.2 : 3.2
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      if (Math.hypot(dx, dy) > r) continue
      buffer.set(Math.round(cx + dx), Math.round(cy + dy), !inner ? '#1c1210' : t > 0.72 ? (dx + dy > 0 ? '#d8946c' : '#f6c49c') : dx + dy > 0 ? mix(accent, '#160a26', 0.3) : accent)
    }
  }
  // the burger in his hand: whole, then with a bite out of it
  blitShaded(buffer, frame % 2 === 1 ? bitten() : smooth(MINI_BURGER), burgerX, burgerY, MINI_BURGER_PALETTE)
}

let headUp: Sprite | null = null
/** The crawler's head without the collar behind it (lying, his shirt; standing, a flag). */
const standingHead = (): Sprite => (headUp ??= smooth(CRAWL_HEAD.map((row) => row.replace(/c/g, '.'))))
let bite: Sprite | null = null
/** The burger with a mouthful gone from its left side, its edge outlined. */
const bitten = (): Sprite => {
  if (bite) return bite
  const rows = smooth(MINI_BURGER).map((row) => row.split(''))
  const h = rows.length
  for (let y = 0; y < h; y += 1) for (let x = 0; x < rows[y].length; x += 1) if (Math.hypot(x - 1, y - h / 2) < 7.5) rows[y][x] = '.'
  for (let y = 0; y < h; y += 1) for (let x = 0; x < rows[y].length; x += 1) if (rows[y][x] !== '.' && rows[y][x] !== 'k' && Math.hypot(x - 1, y - h / 2) < 9) rows[y][x] = 'k'
  bite = rows.map((row) => row.join(''))
  return bite
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

// ---------------------------------------------------------------- the street's furniture, finer

const noise = (x: number, y: number, seed: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296 }

/**
 * A street tree with real leaves: a forked trunk, a crown of many small
 * clusters, each lit from above and shaded under, the leaves' grain and
 * ragged edges, the branches seen in the gaps.
 */
function leafyTree(buffer: PixelBuffer, x: number, ground: number, size: number, night: Night, seed: number): void {
  const next = rng(seed)
  const [deep, dark, mid, light] = night.leaf
  for (let dx = -16; dx <= 16; dx += 1) for (let dy = 0; dy < 3; dy += 1) if ((dx / 16) ** 2 + ((dy - 1) / 2) ** 2 <= 1) buffer.tint(x + dx, ground - 1 + dy, '#000000', 0.35)
  // the trunk and its two branches
  for (let y = ground - size; y < ground; y += 1) for (let k = -2; k <= 2; k += 1) buffer.set(x + k, y, k === -2 ? '#6a3c20' : k === 2 ? '#2a160c' : noise(x + k, y, 3) < 0.25 ? '#3a2012' : '#4e2c18')
  const cy = ground - size - size * 0.5, rx = size * 0.95, ry = size * 0.72
  for (const [tx, ty] of [[x - size * 0.5, cy - size * 0.2], [x + size * 0.45, cy - size * 0.3], [x + size * 0.05, cy - size * 0.55]] as const) {
    for (let t = 0; t <= 1; t += 0.02) { const bx = Math.round(x + (tx - x) * t), by = Math.round(ground - size + (ty - (ground - size)) * t); buffer.set(bx, by, '#3a2012'); buffer.set(bx + 1, by, '#4e2c18') }
  }
  // the crown: clusters of leaves inside an ellipse
  const clusters: Array<[number, number, number]> = []
  while (clusters.length < 34) {
    const px = (next() * 2 - 1) * rx, py = (next() * 2 - 1) * ry
    if ((px / rx) ** 2 + (py / ry) ** 2 > 1) continue
    clusters.push([x + px, cy + py, size * (0.16 + next() * 0.12)])
  }
  for (let Y = Math.floor(cy - ry - size * 0.3); Y <= cy + ry + size * 0.3; Y += 1) for (let X = Math.floor(x - rx - size * 0.3); X <= x + rx + size * 0.3; X += 1) {
    let best = -1, bd = Infinity
    for (let i = 0; i < clusters.length; i += 1) { const [ccx, ccy, r] = clusters[i]; const d = Math.hypot(X + 0.5 - ccx, Y + 0.5 - ccy) / r; if (d < bd) { bd = d; best = i } }
    // ragged edges: each leaf's pixel in or out by its own grain
    if (bd > 1 + (noise(X, Y, seed) - 0.5) * 0.5) continue
    const [ccx, ccy, r] = clusters[best]
    const lit = -(X + 0.5 - ccx) * 0.5 - (Y + 0.5 - ccy) * 0.9
    const low = (Y - (cy - ry)) / (ry * 2)
    let tone = lit > r * 0.45 ? 3 : lit > -r * 0.1 ? 2 : lit > -r * 0.6 ? 1 : 0
    if (low > 0.7 && tone > 0) tone -= 1
    const g = noise(X, Y, seed + 1)
    if (g < 0.12 && tone > 0) tone -= 1
    else if (g > 0.9 && tone < 3) tone += 1
    buffer.set(X, Y, [deep, dark, mid, light][tone])
  }
}

/**
 * A drinks machine: a lit panel on top with its name, the glass with three
 * shelves of cans and bottles, the buttons with their lights, the coin slot,
 * the tray, the cold glow it throws on the sidewalk.
 */
function drinksMachine(buffer: PixelBuffer, x: number, ground: number, accent: string): void {
  const h = 78, w = 40, top = ground - h
  for (let dy = 0; dy < 8; dy += 1) for (let dx = -6; dx < w + 6; dx += 1) if (dither(x + dx, ground + dy, 0.5 * (1 - dy / 8))) buffer.tint(x + dx, ground + dy, '#bfe6ff', 0.25)
  buffer.rect(x - 1, top - 1, w + 2, h + 1, INK)
  for (let y = top; y < ground; y += 1) for (let X = x; X < x + w; X += 1) {
    const u = (X - x) / w
    buffer.set(X, y, u < 0.06 ? mix(accent, '#ffffff', 0.35) : u > 0.92 ? mix(accent, '#000000', 0.35) : u > 0.8 ? mix(accent, '#000000', 0.15) : accent)
  }
  // the lit panel and its name
  buffer.rect(x + 4, top + 4, w - 8, 10, '#fff6dc'); buffer.rect(x + 4, top + 13, w - 8, 1, '#e8c890')
  for (let k = 0; k < 5; k += 1) buffer.rect(x + 8 + k * 5, top + 7, 3, 4, k % 2 ? '#e8412c' : mix(accent, '#000000', 0.2))
  // the glass, three shelves of cans and bottles, a gleam across
  const gx = x + 4, gy = top + 17, gw = 24, gh = 40
  buffer.rect(gx, gy, gw, gh, '#0e1830')
  const goods = ['#e8412c', '#ffcc33', '#4a7cff', '#5ad06a', '#ff7ab0', '#f8f5e6']
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const sy = gy + 4 + shelf * 13
    for (let k = 0; k < 4; k += 1) {
      const c = goods[(k + shelf * 2) % goods.length], cx = gx + 2 + k * 6
      buffer.rect(cx, sy, 4, 8, c); buffer.rect(cx, sy, 1, 8, mix(c, '#ffffff', 0.45)); buffer.rect(cx + 3, sy, 1, 8, mix(c, '#000000', 0.35)); buffer.rect(cx + 1, sy - 1, 2, 1, '#c8ccd8')
    }
    buffer.rect(gx, sy + 9, gw, 2, '#5a6488')
  }
  for (let k = 0; k < gh; k += 1) { buffer.tint(gx + 3 + Math.floor(k * 0.4), gy + k, '#ffffff', 0.18); buffer.tint(gx + 4 + Math.floor(k * 0.4), gy + k, '#ffffff', 0.12) }
  buffer.rect(gx - 1, gy - 1, gw + 2, 1, INK); buffer.rect(gx - 1, gy + gh, gw + 2, 1, mix(accent, '#ffffff', 0.3))
  // the buttons, their lights, the coin slot
  for (let k = 0; k < 6; k += 1) { buffer.rect(x + 31, gy + 1 + k * 5, 5, 3, '#f8f5e6'); buffer.rect(x + 31, gy + 3 + k * 5, 5, 1, '#9aa0ae'); buffer.set(x + 30, gy + 2 + k * 5, k === 2 ? '#ff4a4a' : '#7aff9a') }
  buffer.rect(x + 31, gy + 32, 5, 7, '#2a2e3a'); buffer.rect(x + 33, gy + 33, 1, 5, '#c8ccd8')
  // the tray
  buffer.rect(x + 7, ground - 17, 22, 10, INK); buffer.rect(x + 8, ground - 16, 20, 1, '#5a6488'); buffer.rect(x + 8, ground - 10, 20, 2, mix(accent, '#000000', 0.4))
  buffer.rect(x + 2, ground - 3, w - 4, 3, mix(accent, '#000000', 0.45))
}

/** A street bin: a barrel of slats rounded by the light, its domed lid with the mouth, a bag's edge showing. */
function streetBin(buffer: PixelBuffer, x: number, ground: number, color: string): void {
  const w = 24, h = 30, top = ground - h
  for (let dx = -2; dx < w + 4; dx += 1) buffer.tint(x + dx, ground, '#000000', 0.35)
  buffer.rect(x - 1, top, w + 2, h, INK)
  for (let X = x; X < x + w; X += 1) {
    const u = (X - x + 0.5) / w, light = Math.cos((u - 0.3) * Math.PI)
    const slat = (X - x) % 4 === 3
    for (let y = top + 1; y < ground; y += 1) buffer.set(X, y, slat ? mix(color, '#000000', 0.45) : mix(color, light > 0.6 ? '#ffffff' : '#000000', light > 0.6 ? (light - 0.6) * 0.6 : (0.6 - light) * 0.5))
  }
  for (const band of [top + 4, ground - 6]) { buffer.rect(x, band, w, 2, mix(color, '#000000', 0.3)); buffer.rect(x, band, w, 1, mix(color, '#ffffff', 0.25)) }
  // the lid: a flat dome over the rim, its dark mouth
  buffer.rect(x - 3, top - 6, w + 6, 7, INK)
  for (let X = x - 2; X < x + w + 2; X += 1) for (let y = top - 5; y < top; y += 1) {
    const u = (X - x + 2) / (w + 4)
    buffer.set(X, y, y === top - 5 ? mix(color, '#ffffff', 0.35) : u < 0.3 ? mix(color, '#ffffff', 0.15) : mix(color, '#000000', 0.15 + u * 0.2))
  }
  buffer.rect(x + 6, top - 4, 12, 3, '#0a0a14'); buffer.rect(x + 7, top - 5, 3, 1, '#d8dce6')
  buffer.rect(x + 9, top - 9, 6, 3, INK); buffer.rect(x + 10, top - 8, 4, 1, mix(color, '#ffffff', 0.3))
}

/** A fire hydrant: its foot, the barrel rounded by the light, the two side caps on their chains, the dome and its nut, bolts. */
function fireHydrant(buffer: PixelBuffer, x: number, ground: number): void {
  const red = '#d0302a', light = '#ff7a5a', dark = '#8a1a14', deep = '#5a0e0a'
  const shade = (X: number, x0: number, w: number) => { const u = (X - x0 + 0.5) / w; return u < 0.22 ? light : u > 0.75 ? dark : red }
  for (let dx = -10; dx <= 12; dx += 1) buffer.tint(x + dx, ground, '#000000', 0.35)
  buffer.rect(x - 9, ground - 6, 18, 6, INK)
  for (let X = x - 8; X < x + 8; X += 1) for (let y = ground - 5; y < ground; y += 1) buffer.set(X, y, y === ground - 5 ? light : shade(X, x - 8, 16))
  buffer.rect(x - 7, ground - 31, 14, 26, INK)
  for (let X = x - 6; X < x + 6; X += 1) for (let y = ground - 30; y < ground - 5; y += 1) buffer.set(X, y, shade(X, x - 6, 12))
  // the side caps and their chains
  for (const side of [-1, 1] as const) {
    const cx = side === -1 ? x - 11 : x + 7
    buffer.rect(cx - 1, ground - 23, 6, 8, INK)
    for (let X = cx; X < cx + 4; X += 1) for (let y = ground - 22; y < ground - 16; y += 1) buffer.set(X, y, y === ground - 22 ? light : shade(X, cx, 4))
    buffer.set(cx + (side === -1 ? 1 : 2), ground - 19, deep)
    for (let k = 0; k < 4; k += 1) buffer.set(x + side * (3 + k), ground - 14 + (k % 2), '#c8ccd8')
  }
  // the band, the dome, the nut, bolts
  buffer.rect(x - 8, ground - 33, 16, 4, INK); buffer.rect(x - 7, ground - 32, 14, 2, light); buffer.rect(x - 7, ground - 30, 14, 1, dark)
  for (let y = ground - 41; y < ground - 33; y += 1) for (let X = x - 7; X < x + 7; X += 1) {
    const d = Math.hypot((X + 0.5 - x) / 7, (y + 0.5 - (ground - 33)) / 8)
    if (d > 1) continue
    buffer.set(X, y, d > 0.86 ? INK : X < x - 2 && y < ground - 37 ? light : X > x + 2 ? dark : red)
  }
  buffer.rect(x - 2, ground - 45, 5, 5, INK); buffer.rect(x - 1, ground - 44, 3, 3, '#9aa0ae'); buffer.set(x - 1, ground - 44, '#e0e4ee')
  for (const bx of [x - 5, x - 1, x + 3]) buffer.set(bx, ground - 31, '#f0c8a0')
}

/** The street's things, finer ones where the proposal has them. */
function drawPropV2(buffer: PixelBuffer, prop: Prop, s: Stage, night: Night, accent: string, index: number): void {
  if (prop.kind === 'tree') leafyTree(buffer, prop.x, s.ground, prop.size, night, 3 + index)
  else if (prop.kind === 'vending') drinksMachine(buffer, prop.x, s.ground, accent)
  else if (prop.kind === 'bin') streetBin(buffer, prop.x, s.ground, mix(accent, '#000000', 0.45))
  else if (prop.kind === 'hydrant') fireHydrant(buffer, prop.x, s.ground + 4)
  else drawProp(buffer, prop, s, night, accent, true, index)
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
  s.props.forEach((prop, i) => { if (prop.kind !== 'palm') drawPropV2(buffer, prop, s, night, accent, i) })
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
  } else standingEater(buffer, door - 88, s.ground + 18, accent, frame)
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
