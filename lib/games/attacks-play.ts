/**
 * RANDOM ATTACKS in play: the traced night of Mars under the bar, and on it
 * the burgers, the plates, what falls, the squirts, the cook; the bosses;
 * the controls under the board on a touch screen — left and right, and the
 * FIRE button.
 *
 * The night heats up as the levels go by (`attacksTier`): a calm sky at
 * first, with a shooting star now and then; from the first boss, squadrons
 * of far burgers crossing the sky; from the second, the horizon glowing,
 * fires on the plain and meteors; from the third, a red sky, a dust storm
 * blowing across, meteors striking the ground; at the MEGA BURGER, a sky of
 * blood and lightning. Each level opens on its number and what it brings.
 */

import { attacksArt } from './attacks-art'
import { ATTACKS_MOTION } from './attacks-art-data'
import { BOSS_KEY, BOSS_SIZE, bossPicture } from './attacks-boss'
import {
  ATTACKS_BOARD, ATTACKS_BOSSES, ATTACKS_KINDS, burgerSpot, createAttacks, GOLD_Y, levelPlan, multiplier, stepAttacks, throwX,
  type AttacksLayout, type AttacksState,
} from './attacks-rules'
import {
  BONUS_PALETTE, BURGER_BIG, BURGER_BIG_TILT, BURGER_FAR, BURGER_MID_TILT, BURGER_PALETTE, BURGER_SMALL_TILT, BURGER_SPECK, burgerCentre, BURGERS,
  COOK, COOK_HEAD, COOK_PALETTE, drawPlates, FOIL_PALETTE, GOLD_PALETTE, KETCHUP_PALETTE, MUSTARD, MUSTARD_PALETTE, SQUIRT, THROW_PALETTE, THROWS, TORCH,
} from './attacks-sprites'
import { dim, drawText, drawText7, mix, PixelBuffer, rgbOf, text7Width, textWidth, type Sprite } from './pixels'
import { playCard, playSize, type Hit, type Pad } from './screens'
import { arcadeText, GREY as GREY_TEXT, HUD_HEIGHT } from './ui'

type Layout = AttacksLayout
const CREAM = '#f8f5e6'
const INK = '#0a0a14'

/** How hot the night is at a level: 0 calm (1–3), 1 the invasion (4–7), 2 Mars burning (8–11), 3 the storm (12–15), 4 the MEGA BURGER (16). */
export const attacksTier = (level: number): number => (level >= 16 ? 4 : level >= 12 ? 3 : level >= 8 ? 2 : level >= 4 ? 1 : 0)
/** Where the plain meets the foot of the rocks, on each board. */
const HORIZON: Record<Layout, number> = { landscape: 272, portrait: 400 }

/** A number from 0 to 1 for `n`, always the same: the sky's events are drawn from the steps, never from the game's own random. */
const hash = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
/** A pixel mixed toward a colour by `a`, straight in the buffer's bytes. */
function blend(buffer: PixelBuffer, x: number, y: number, rgb: readonly [number, number, number], a: number): void {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return
  const o = (y * buffer.width + x) * 4, d = buffer.data
  d[o] += (rgb[0] - d[o]) * a; d[o + 1] += (rgb[1] - d[o + 1]) * a; d[o + 2] += (rgb[2] - d[o + 2]) * a
}

// ---------------------------------------------------------------- the night, as hot as the level

/** What each tier does to the picture: the sky toward a colour, the glow over the horizon, the ground lit warmer, the whole darker. */
const TINTS: Array<{ sky: string; skyBy: number; glow: string; glowBy: number; ground: string; groundBy: number; dark: number; moon: number; haze: number } | null> = [
  null,
  { sky: '#2a1440', skyBy: 0.08, glow: '#ff6a4a', glowBy: 0.14, ground: '#ff8a5a', groundBy: 0.03, dark: 1, moon: 0, haze: 0 },
  { sky: '#4a1838', skyBy: 0.16, glow: '#ff7030', glowBy: 0.48, ground: '#ff9a5a', groundBy: 0.1, dark: 1, moon: 0.2, haze: 0 },
  { sky: '#6a1430', skyBy: 0.36, glow: '#ff5020', glowBy: 0.58, ground: '#ff6a3a', groundBy: 0.15, dark: 0.96, moon: 0.5, haze: 0.22 },
  { sky: '#6a0a14', skyBy: 0.56, glow: '#ff3010', glowBy: 0.62, ground: '#ff4020', groundBy: 0.2, dark: 0.9, moon: 0.7, haze: 0.3 },
]
/** The moon on each picture: its middle and its radius. */
const MOON: Record<Layout, { x: number; y: number; r: number }> = { landscape: { x: 75, y: 65, r: 28 }, portrait: { x: 60, y: 74, r: 28 } }
const tinted = new Map<string, PixelBuffer>()
/** The traced night as hot as `tier`: the sky (bluer than red) toward its colour and glowing over the horizon, the rocks and the plain lit warmer. */
function nightAt(layout: Layout, tier: number): PixelBuffer | null {
  const art = attacksArt(layout === 'landscape' ? 'playWide' : 'playTall')
  const tint = TINTS[tier]
  if (!art || !tint) return art
  const key = `${layout}|${tier}`
  let out = tinted.get(key)
  if (out) return out
  out = new PixelBuffer(art.width, art.height)
  out.data.set(art.data)
  const d = out.data, W = art.width, H = art.height, horizon = HORIZON[layout], moon = MOON[layout]
  const sky = rgbOf(tint.sky), glow = rgbOf(tint.glow), ground = rgbOf(tint.ground), blood = rgbOf('#ff3a18'), haze = rgbOf('#d88a50')
  for (let y = 0; y < H; y += 1) {
    const g = Math.max(0, Math.min(1, (y - 0.15 * H) / (horizon - 0.15 * H))) ** 1.2 * tint.glowBy
    // the storm's haze, thickest along the foot of the rocks
    const h = tint.haze * Math.max(0, 1 - Math.abs(y - horizon + 18) / 70)
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4
      let r = d[o], gr = d[o + 1], b = d[o + 2]
      const grey = Math.abs(r - gr) < 18 && Math.abs(gr - b) < 22 && r + gr + b > 150
      if (tint.moon && grey && (x - moon.x) ** 2 + (y - moon.y) ** 2 < moon.r ** 2) {
        // the moon going red
        r += (blood[0] - r) * tint.moon; gr += (blood[1] - gr) * tint.moon * 0.8; b += (blood[2] - b) * tint.moon * 0.8
      } else if (b >= r - 6) {
        r += (sky[0] - r) * tint.skyBy; gr += (sky[1] - gr) * tint.skyBy; b += (sky[2] - b) * tint.skyBy
        r += (glow[0] - r) * g; gr += (glow[1] - gr) * g; b += (glow[2] - b) * g
      } else { r += (ground[0] - r) * tint.groundBy; gr += (ground[1] - gr) * tint.groundBy; b += (ground[2] - b) * tint.groundBy }
      if (h > 0) { r += (haze[0] - r) * h; gr += (haze[1] - gr) * h; b += (haze[2] - b) * h }
      d[o] = r * tint.dark; d[o + 1] = gr * tint.dark; d[o + 2] = b * tint.dark
    }
  }
  tinted.set(key, out)
  return out
}

/** Squadrons of far burgers crossing the sky in a V, behind the battle: one from the invasion on, up to three. */
function squadrons(buffer: PixelBuffer, top: number, W: number, H: number, steps: number, tier: number): void {
  const count = [0, 1, 2, 3, 3][tier]
  for (let j = 0; j < count; j += 1) {
    const period = 1100 + j * 170, t = steps + j * 397, cycle = Math.floor(t / period), p = (t % period) / period
    const dir = hash(cycle * 7 + j) < 0.5 ? 1 : -1
    const far = hash(cycle * 5 + j * 11) < 0.5
    const y = top + H * (0.08 + 0.3 * hash(cycle * 13 + j * 3))
    const n = 3 + Math.floor(hash(cycle * 3 + j * 17) * 3)
    const x0 = dir === 1 ? -70 + p * (W + 140) : W + 70 - p * (W + 140)
    const frames = far ? BURGER_SPECK : BURGER_FAR, gap = far ? 9 : 14, rise = far ? 4 : 6
    for (let k = 0; k < n; k += 1) {
      const sprite = frames[((steps >> 3) + k) % 2]
      const dx = -dir * Math.ceil(k / 2) * gap, dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * rise
      buffer.blit(sprite, Math.round(x0 + dx - sprite[0].length / 2), Math.round(y + dy), BURGER_PALETTE)
    }
  }
}

const WHITE = rgbOf('#ffffff'), EMBER = rgbOf('#ffb050'), FIRE = rgbOf('#ff5a1a'), SMOKE = rgbOf('#2a1a2e'), DUST = rgbOf('#e8a060'), FLASH = rgbOf('#fff4e0')
/** Shooting stars on a calm night; heavier meteors with fiery trails once Mars burns, striking the plain in the storm. */
function meteors(buffer: PixelBuffer, top: number, W: number, H: number, horizon: number, steps: number, tier: number): void {
  const period = [540, 360, 200, 130, 70][tier]
  const heavy = tier >= 2, life = heavy ? 90 : 34
  for (let i = Math.floor(steps / period) - 1; i <= Math.floor(steps / period); i += 1) {
    if (i < 0) continue
    const t = steps - (i * period + Math.floor(hash(i * 1.7) * period * 0.5))
    if (t < 0 || t >= life) continue
    const dir = hash(i * 2.3) < 0.5 ? -1 : 1
    const vx = dir * (heavy ? 1.7 : 4), vy = heavy ? 2.3 : 2.6
    const x0 = W * (0.15 + 0.7 * hash(i * 3.1)), y0 = top + H * 0.3 * hash(i * 5.7)
    const ground = top + horizon + 4 + hash(i * 9.1) * 20
    const land = (ground - y0) / vy
    const k = Math.min(t, land), x = x0 + vx * k, y = y0 + vy * k
    const fade = Math.min(1, t / 6, (life - t) / 8)
    if (t < land) {
      const len = heavy ? 30 : 16
      for (let s = 1; s <= len; s += 1) {
        const c = heavy ? (s < 5 ? FLASH : s < 12 ? EMBER : FIRE) : WHITE, a = fade * 0.9 * (1 - s / len)
        blend(buffer, x - vx * s * 0.45, y - vy * s * 0.45, c, a)
        if (heavy && s < len * 0.6) { blend(buffer, x - vx * s * 0.45 + 1, y - vy * s * 0.45, c, a * 0.6); blend(buffer, x - vx * s * 0.45, y - vy * s * 0.45 - 1, c, a * 0.5) }
      }
      blend(buffer, x, y, WHITE, fade)
      if (heavy) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) blend(buffer, x + dx, y + dy, dx && dy ? EMBER : FLASH, fade * 0.85)
    } else if (tier >= 3 && t - land < 24) {
      // struck: a flash on the plain and a ring of dust
      const age = t - land, r = 2 + age * 0.7
      if (age < 5) for (let dy = -3; dy <= 3; dy += 1) for (let dx = -5; dx <= 5; dx += 1) blend(buffer, x + dx, y + dy, FLASH, 0.6 * (1 - (Math.abs(dx) + Math.abs(dy)) / 8))
      for (let a = 0; a < 16; a += 1) blend(buffer, x + Math.cos(a * 0.39) * r, y + Math.sin(a * 0.39) * r * 0.45, DUST, 0.75 * (1 - age / 24))
    }
  }
}

/** Where fires burn on the far plain, between the stacks of plates: up to six. */
const FIRES: Record<Layout, Array<readonly [number, number]>> = {
  landscape: [[132, 277], [316, 279], [40, 283], [224, 276], [410, 281], [175, 286]],
  portrait: [[86, 404], [233, 406], [160, 403], [16, 409], [300, 407], [120, 412]],
}
/** Fires on the plain once Mars burns, their smoke rising and leaning: two, then four, then six. */
function fires(buffer: PixelBuffer, top: number, layout: Layout, steps: number, tier: number): void {
  const count = [0, 0, 3, 5, 6][tier]
  FIRES[layout].slice(0, count).forEach(([fx, fy], i) => {
    const y = top + fy
    // the smoke first, behind the flames: puffs going up, growing, leaning with the wind
    for (let k = 0; k < 18; k += 1) {
      const phase = (steps * 0.25 + i * 7) % 6, rise = k * 6 + phase, r = 2 + (k + phase / 6) * 0.55
      const sx = fx + Math.sin(steps * 0.015 + k * 0.35 + i) * (1 + k * 0.3) + (k + phase / 6) * 1.4
      const a = 0.28 * (1 - (k + phase / 6) / 18)
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
        const q = (dx * dx + dy * dy) / (r * r)
        if (q > 1) continue
        blend(buffer, sx + dx, y - 10 - rise + dy * 0.75, SMOKE, a * (1 - q * 0.6))
      }
    }
    // the light it casts on the ground round it
    for (let dy = -2; dy <= 3; dy += 1) for (let dx = -10; dx <= 10; dx += 1) blend(buffer, fx + dx, y + dy, EMBER, 0.22 * (1 - Math.abs(dx) / 11) * (1 - Math.abs(dy) / 4))
    // the flames, flickering, and sparks going up
    const h = 9 + ((steps >> 2) + i * 3) % 5
    for (let k = 0; k < h; k += 1) {
      const w = Math.max(0, Math.round((h - k) / 2.6)), c = k < h * 0.35 ? FIRE : k < h * 0.75 ? EMBER : FLASH
      const lean = k > 3 ? (((steps >> 2) + k) % 3) - 1 : 0
      for (let dx = -w; dx <= w; dx += 1) blend(buffer, fx + dx + lean, y - k, Math.abs(dx) === w && w > 0 ? FIRE : c, k < h - 1 ? 0.95 : 0.6)
    }
    for (let k = 0; k < 3; k += 1) { const t = (steps + i * 23 + k * 17) % 40; blend(buffer, fx + Math.sin((steps + k * 30) * 0.1) * 3, y - h - t * 0.9, EMBER, 0.9 * (1 - t / 40)) }
  })
}

/** The dust storm: streaks blowing across the whole board, behind the battle. */
function dust(buffer: PixelBuffer, top: number, W: number, H: number, steps: number, tier: number): void {
  const count = [0, 0, 0, 44, 70][tier]
  for (let i = 0; i < count; i += 1) {
    const speed = 3 + hash(i * 3.3) * 3.5, len = 10 + Math.floor(hash(i * 4.1) * 22)
    const x = ((hash(i) * (W + 100) + steps * speed) % (W + 100)) - 50, y = top + hash(i * 7.7) * H
    const a = 0.3 + hash(i * 5.5) * 0.3
    for (let s = 0; s < len; s += 1) { blend(buffer, x - s, y + s * 0.15, DUST, a * (1 - s / len)); if (s < len * 0.7) blend(buffer, x - s, y + 1 + s * 0.15, DUST, a * 0.55 * (1 - s / len)) }
  }
  // and slow clouds of it, wide and faint
  for (let i = 0; i < (tier >= 4 ? 5 : 3); i += 1) {
    const cx = ((hash(i * 9.3) * (W + 200) + steps * (1.2 + hash(i) * 0.8)) % (W + 200)) - 100, cy = top + H * (0.3 + 0.55 * hash(i * 2.9)), rx = 50 + hash(i * 6.1) * 40, ry = 9 + hash(i * 4.7) * 8
    for (let dy = -ry; dy <= ry; dy += 1) for (let dx = -rx; dx <= rx; dx += 2) { const q = (dx / rx) ** 2 + (dy / ry) ** 2; if (q < 1) { blend(buffer, cx + dx, cy + dy, DUST, 0.12 * (1 - q)); blend(buffer, cx + dx + 1, cy + dy, DUST, 0.12 * (1 - q)) } }
  }
}

/** The MEGA BURGER's sky: now and then lightning — the sky lit in two flashes, a bolt down to the rocks. */
function lightning(buffer: PixelBuffer, top: number, W: number, horizon: number, steps: number): void {
  const cycle = Math.floor(steps / 330), t = steps % 330
  if (t >= 11 || (t >= 4 && t < 7)) return
  const d = buffer.data
  for (let y = top; y < top + horizon - 40; y += 1) for (let x = 0; x < W; x += 1) { const o = (y * buffer.width + x) * 4; d[o] += 34; d[o + 1] += 22; d[o + 2] += 40 }
  if (t >= 4) return
  let x = W * (0.15 + 0.7 * hash(cycle * 1.3)), y = top
  while (y < top + horizon - 50) {
    const nx = x + (hash(cycle * 31 + y) - 0.5) * 18, ny = y + 6 + hash(cycle * 17 + y) * 8
    buffer.line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), '#ffffff')
    buffer.line(Math.round(x) + 1, Math.round(y), Math.round(nx) + 1, Math.round(ny), '#c8b0ff')
    x = nx; y = ny
  }
}

// ---------------------------------------------------------------- the controls

/** The controls under (or beside) the board on a touch screen: the arrows left and right, and FIRE. */
export type AttacksPad = { zone: Hit; left: Hit; right: Hit; fire: { cx: number; cy: number; r: number } }
const BOARD_SIZE: Record<Layout, { w: number; h: number }> = { landscape: { w: 448, h: 320 }, portrait: { w: 320, h: 448 } }
export function attacksPadGeometry(layout: Layout, pad: Pad): AttacksPad | null {
  if (pad === 'none') return null
  const { width, height } = playSize(layout, pad)
  const board = BOARD_SIZE[layout]
  if (pad === 'side') {
    const x = board.w, a = 56
    return { zone: { x, y: HUD_HEIGHT, w: width - x, h: height - HUD_HEIGHT }, left: { x: x + 14, y: height - 24 - a, w: a, h: a }, right: { x: x + 24 + a, y: height - 24 - a, w: a, h: a }, fire: { cx: x + (width - x) / 2, cy: HUD_HEIGHT + 104, r: 46 } }
  }
  const y = HUD_HEIGHT + board.h, h = height - y
  const a = pad === 'big' ? 76 : 60, r = pad === 'big' ? 48 : 36
  return { zone: { x: 0, y, w: width, h }, left: { x: 14, y: y + (h - a) / 2, w: a, h: a }, right: { x: 24 + a, y: y + (h - a) / 2, w: a, h: a }, fire: { cx: width - 16 - r, cy: y + h / 2, r } }
}
/** Which control a finger at (`x`, `y`) means: anywhere in their band counts, the nearest wins. */
export function attacksPadPart(x: number, y: number, pad: AttacksPad): 'left' | 'right' | 'fire' | null {
  const { zone } = pad
  if (x < zone.x || y < zone.y || x >= zone.x + zone.w || y >= zone.y + zone.h) return null
  const centre = (h: Hit) => [h.x + h.w / 2, h.y + h.h / 2]
  const d = (cx: number, cy: number) => Math.hypot(x - cx, y - cy)
  const [lx, ly] = centre(pad.left), [rx, ry] = centre(pad.right)
  const dl = d(lx, ly), dr = d(rx, ry), df = d(pad.fire.cx, pad.fire.cy) - pad.fire.r * 0.4
  return df < dl && df < dr ? 'fire' : dl <= dr ? 'left' : 'right'
}

function arrowButton(buffer: PixelBuffer, h: Hit, dir: -1 | 1, pressed: boolean, accent: string): void {
  const x = Math.round(h.x), y = Math.round(h.y), w = h.w, push = pressed ? 2 : 0
  buffer.rect(x + 1, y + 4, w, w, INK)
  buffer.rect(x, y + push, w, w - push, pressed ? dim(accent, 0.55) : '#262a3c')
  buffer.rect(x, y + push, w, 1, pressed ? mix(accent, '#ffffff', 0.2) : '#3c4260')
  buffer.rect(x, y + push, 1, w - push, pressed ? accent : '#343a54')
  buffer.rect(x + w - 1, y + push, 1, w - push, '#161826')
  buffer.rect(x, y + w - 1, w, 1, '#161826')
  const cx = x + w / 2, cy = y + w / 2 + push, s = Math.round(w * 0.2)
  for (let i = 0; i <= s; i += 1) buffer.rect(Math.round(cx - dir * (s / 2) + dir * i) - (dir < 0 ? 1 : 0), Math.round(cy - (s - i)), 2, (s - i) * 2 + 1, CREAM)
}
function fireButton(buffer: PixelBuffer, f: AttacksPad['fire'], pressed: boolean): void {
  const push = pressed ? 2 : 0
  buffer.disc(f.cx + 1, f.cy + 4, f.r, INK)
  buffer.disc(f.cx, f.cy + push, f.r, '#7a120c')
  buffer.disc(f.cx - 1, f.cy - 1 + push, f.r - 3, pressed ? '#ff4a30' : '#d8281c')
  buffer.disc(f.cx - f.r * 0.3, f.cy - f.r * 0.35 + push, f.r * 0.32, pressed ? '#ff8a6a' : '#f05a40')
  const scale = f.r >= 44 ? 2 : 1, label = 'FIRE', w = text7Width(label, scale, true)
  drawText7(buffer, label, Math.round(f.cx - w / 2) + 1, Math.round(f.cy - 3.5 * scale) + push + 1, '#5a0a08', scale, true)
  drawText7(buffer, label, Math.round(f.cx - w / 2), Math.round(f.cy - 3.5 * scale) + push, CREAM, scale, true)
}
/** The controls, the ones held pressed down. */
function drawPad(buffer: PixelBuffer, pad: AttacksPad, accent: string, pressed: AttacksView['pressed'] = {}): void {
  arrowButton(buffer, pad.left, -1, !!pressed.left, accent)
  arrowButton(buffer, pad.right, 1, !!pressed.right, accent)
  fireButton(buffer, pad.fire, !!pressed.fire)
}

// ---------------------------------------------------------------- the play screen

/** The bar on top: LEVEL, SCORE with its multiplier, the bonus under way with what is left of it, the lives as the cook's head. */
function attacksHud(buffer: PixelBuffer, accent: string, s: AttacksState): void {
  const W = buffer.width
  buffer.rect(0, 0, W, HUD_HEIGHT, '#07070e')
  buffer.rect(0, HUD_HEIGHT - 1, W, 1, dim(accent, 0.55))
  drawText(buffer, 'LEVEL', 8, 3, GREY_TEXT)
  drawText7(buffer, String(s.level).padStart(2, '0'), 8, 11, CREAM, 1, true)
  const scoreText = String(s.score).padStart(5, '0'), sw = text7Width(scoreText, 1, true)
  drawText(buffer, 'SCORE', Math.round(W / 2 - textWidth('SCORE') / 2), 3, GREY_TEXT)
  drawText7(buffer, scoreText, Math.round(W / 2 - sw / 2), 11, CREAM, 1, true)
  const times = multiplier(s.chain)
  if (times > 1) drawText7(buffer, `×${times}`, Math.round(W / 2 + sw / 2) + 4, 11, s.chainUp > 0 && (s.chainUp >> 2) % 2 === 0 ? CREAM : accent, 1, true)
  drawText(buffer, 'LIVES', W - 8 - textWidth('LIVES'), 3, GREY_TEXT)
  for (let i = 0; i < s.lives; i += 1) buffer.blit(COOK_HEAD, W - 17 - i * 11, 12, COOK_PALETTE)
  if (s.power) {
    // the bonus's bottle and the time it has left, between the score and the lives
    const x = Math.round(W * 0.66)
    buffer.blit(s.power.kind === 'mustard' ? MUSTARD : TORCH, x, s.power.kind === 'mustard' ? 6 : 5, BONUS_PALETTE)
    const full = s.power.kind === 'mustard' ? 9 * 60 : 5 * 60, w = 30
    buffer.rect(x + 13, 15, w, 3, '#2a2a3a')
    buffer.rect(x + 13, 15, Math.max(1, Math.round((w * s.power.left) / full)), 3, s.power.kind === 'mustard' ? '#ffd02a' : '#8cc4ff')
  }
}

/** The night under the bar at the level's heat, the controls in their band: drawn once for each board, pad, colour and heat. */
const backs = new Map<string, PixelBuffer>()
function back(layout: Layout, pad: Pad, accent: string, tier: number): PixelBuffer {
  const key = `${layout}|${pad}|${accent}|${tier}`
  const art = nightAt(layout, tier)
  let out = backs.get(key)
  if (out && art) return out
  const { width, height } = playSize(layout, pad)
  out = new PixelBuffer(width, height, INK)
  const board = BOARD_SIZE[layout]
  if (art) for (let y = 0; y < art.height; y += 1) out.data.set(art.data.subarray(y * art.width * 4, (y + 1) * art.width * 4), ((HUD_HEIGHT + y) * width) * 4)
  else for (let y = HUD_HEIGHT; y < HUD_HEIGHT + board.h; y += 1) out.rect(0, y, board.w, 1, mix('#0a0718', '#45224f', (y - HUD_HEIGHT) / board.h))
  const controls = attacksPadGeometry(layout, pad)
  if (controls) drawPad(out, controls, accent)
  // kept once the picture is in
  if (art) { if (backs.size > 16) backs.clear(); backs.set(key, out) }
  return out
}
const surfaces = new Map<string, PixelBuffer>()

/** What the play screen shows over the game: the pause card (RESUME 0, QUIT 1), or RESUME alone; where the controls go; which of them are held. */
export type AttacksView = { pause?: 0 | 1 | null; pad?: Pad; resumeOnly?: boolean; pressed?: { left?: boolean; right?: boolean; fire?: boolean } }

/** The blowtorch's flame, going up: white at the heart, yellow, orange at the tips, flickering. */
function flame(buffer: PixelBuffer, x: number, y: number, steps: number): void {
  for (let k = 0; k < 14; k += 1) {
    const w = k < 3 ? 1 : k < 9 ? 2 : 1, jitter = ((steps + k) % 3) - 1
    const c = k < 4 ? '#ffffff' : k < 8 ? '#fff0a0' : k < 11 ? '#ffb040' : '#ff6a2a'
    buffer.rect(x - w + (k > 8 ? jitter : 0), y + k, w * 2 + 1, 1, c)
  }
}
/** A boss's jet, going down: white at the nozzle, yellow, orange, red at the tip, flickering. */
function jet(buffer: PixelBuffer, x: number, y: number, steps: number, i: number): void {
  const len = 7 + ((steps >> 1) + i * 2) % 4
  for (let k = 0; k < len; k += 1) {
    const w = k < 2 ? 2 : k < len - 3 ? 1 : 0
    const c = k < 2 ? '#ffffff' : k < 4 ? '#fff0a0' : k < len - 2 ? '#ffb040' : '#ff5a2a'
    buffer.rect(x - w, y + k, w * 2 + 1, 1, c)
  }
}

/** A diver's sprite: the burger of its row, leaning into its dive, toward the side it goes. */
const TILTS: readonly (readonly Sprite[])[] = [BURGER_SMALL_TILT, BURGER_MID_TILT, BURGER_MID_TILT, BURGER_BIG_TILT, BURGER_BIG_TILT]

/**
 * RANDOM ATTACKS in play, wide (448 × 344) or tall (320 × 472), with the
 * controls where they go.
 */
export function renderAttacksGame(s: AttacksState, accent: string, view: AttacksView = {}): PixelBuffer {
  const layout = s.layout
  const pad = view.pad ?? (layout === 'portrait' ? 'band' : 'none')
  const { width } = playSize(layout, pad)
  const key = `${layout}|${pad}`
  const tier = attacksTier(s.level)
  let buffer = surfaces.get(key)
  if (!buffer) { const size = playSize(layout, pad); buffer = new PixelBuffer(size.width, size.height, INK); surfaces.set(key, buffer) }
  buffer.data.set(back(layout, pad, accent, tier).data)
  const top = HUD_HEIGHT, board = ATTACKS_BOARD[layout], W = board.width, H = board.height, steps = s.steps
  ATTACKS_MOTION[layout === 'landscape' ? 'playWide' : 'playTall'].stars.forEach(([x, y], i) => { if ((i + (steps >> 4)) % 5 === 0) buffer!.set(x, y + top, mix(buffer!.hex(x, y + top), '#1c1036', 0.7)) })
  // the night, as hot as the level
  if (tier === 4) lightning(buffer, top, W, HORIZON[layout], steps)
  squadrons(buffer, top, W, H, steps, tier)
  meteors(buffer, top, W, H, HORIZON[layout], steps, tier)
  fires(buffer, top, layout, steps, tier)
  dust(buffer, top, W, H, steps, tier)
  // the boss, its jets under it; shaking and flashing as it blows up
  const boss = s.boss
  if (boss) {
    const size = BOSS_SIZE[boss.kind], kind = ATTACKS_BOSSES[boss.kind], share = boss.hp / kind.hp
    const shake = boss.dying ? ((steps >> 1) % 2 ? 2 : -2) : 0
    const bx = Math.round(boss.x - size.cx) + shake, by = Math.round(top + boss.y - size.cy)
    const jets = boss.kind === 4 ? [-30, -10, 10, 30] : boss.kind === 3 ? [-24, 0, 24] : [-14, 0, 14]
    if (!boss.dying) jets.forEach((dx, i) => jet(buffer!, Math.round(boss.x + dx), by + size.h - 1, steps, i))
    const picture = bossPicture(boss.kind, share < 0.25 ? 2 : share < 0.5 ? 1 : 0, steps >> 4, boss.kind === 4 && share < 1 / 3, boss.flash > 0 || (boss.dying > 0 && (boss.dying >> 2) % 2 === 0))
    buffer.stamp(picture, bx - 1, by - 1, BOSS_KEY)
  }
  // the formation, the divers off on their own; wrapped in foil where they are
  for (const b of s.burgers) {
    if (!b.alive) continue
    const k = ATTACKS_KINDS[b.row], palette = b.foil > 0 ? FOIL_PALETTE : BURGER_PALETTE
    if (b.dive && !b.dive.back) {
      const sprite = TILTS[b.row][(steps >> 3) % 2], c = burgerSpot(s, b)
      buffer.blit(sprite, Math.round(c.x - sprite[0].length / 2), Math.round(top + c.y - sprite.length / 2), palette, { flipX: b.dive.vx > 0 })
      continue
    }
    const sprite = BURGERS[b.row][s.formation.frame]
    const c = burgerSpot(s, b)
    const x = Math.round(c.x - burgerCentre(sprite)), y = Math.round(top + c.y - k.dy)
    buffer.blit(sprite, x, y, palette)
    // the foil's glint, running across now and then
    if (b.foil > 0) { const g = (steps + b.col * 13 + b.row * 29) % 90; if (g < 8) for (let d = 0; d < 3; d += 1) buffer.set(x + 6 + g * 2 + d, y + 3 + d, '#ffffff') }
  }
  // the golden one
  if (s.gold) { const gold = BURGER_BIG[(steps >> 3) % 2]; buffer.blit(gold, Math.round(s.gold.x - burgerCentre(gold)), top + GOLD_Y - 13, GOLD_PALETTE) }
  // the plates
  s.plates.forEach((p, i) => drawPlates(buffer!, p.x, top + H - 42, board.plate, 5, p.bites, i))
  // what falls: a chili leaves a trail of heat
  for (const t of s.throws) {
    const sprite = THROWS[t.kind], x = throwX(t)
    if (t.kind === 4) for (let k = 1; k <= 6; k += 1) blend(buffer, x, top + t.y - sprite.length / 2 - k * 1.6, FIRE, 0.5 * (1 - k / 7))
    buffer.blit(sprite, Math.round(x - sprite[0].length / 2), Math.round(top + t.y - sprite.length / 2), THROW_PALETTE)
  }
  // the loose sliders, tumbling
  for (const l of s.loose) {
    const sprite = BURGER_SMALL_TILT[(steps >> 2) % 2]
    buffer.blit(sprite, Math.round(l.x - sprite[0].length / 2), Math.round(top + l.y - sprite.length / 2), BURGER_PALETTE, { flipX: l.vx > 0 })
  }
  // the squirts
  const mustard = s.power?.kind === 'mustard'
  for (const shot of s.shots) {
    if (shot.torch) flame(buffer, Math.round(shot.x), Math.round(top + shot.y), steps)
    else buffer.blit(SQUIRT, Math.round(shot.x) - 1, Math.round(top + shot.y), mustard ? MUSTARD_PALETTE : KETCHUP_PALETTE)
  }
  // a bonus falling, sparkling
  if (s.drop) {
    const sprite = s.drop.kind === 'mustard' ? MUSTARD : TORCH
    const bx = Math.round(s.drop.x), by = Math.round(top + s.drop.y)
    buffer.blit(sprite, bx - Math.floor(sprite[0].length / 2), by - Math.floor(sprite.length / 2), BONUS_PALETTE)
    for (const [dx, dy] of [[-8, -6], [8, -2], [-6, 8]] as const) if (((steps >> 3) + dx) % 2 === 0) { buffer.set(bx + dx, by + dy, '#ffffff'); for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) buffer.set(bx + dx + ex, by + dy + ey, '#fff4b0') }
  }
  // the cook, blinking while he gets over a hit
  if (s.cook.hurt === 0 || (s.cook.hurt >> 2) % 2 === 0) buffer.blit(COOK, Math.round(s.cook.x - COOK[0].length / 2), top + H - 3 - COOK.length, COOK_PALETTE)
  // what was just hit
  for (const p of s.splats) splat(buffer, p, top)
  attacksHud(buffer, accent, s)
  // the boss's name and strength, across the top of the board
  if (boss && !boss.dying && boss.y > -20) {
    const kind = ATTACKS_BOSSES[boss.kind], bw = Math.min(180, Math.round(W * 0.5)), x0 = Math.round((W - bw) / 2), y = top + 5
    buffer.rect(x0 - 1, y - 1, bw + 2, 6, INK)
    buffer.rect(x0, y, bw, 4, '#3a1018')
    const fill = Math.max(0, Math.round((bw * boss.hp) / kind.hp))
    buffer.rect(x0, y, fill, 4, boss.flash > 0 ? '#ffffff' : '#ff4a2a')
    buffer.rect(x0, y, fill, 1, '#ffb070')
    const nw = textWidth(kind.name)
    drawText(buffer, kind.name, Math.round(W / 2 - nw / 2) + 1, y + 8, INK)
    drawText(buffer, kind.name, Math.round(W / 2 - nw / 2), y + 7, CREAM)
  }
  // the controls held down
  const controls = attacksPadGeometry(layout, pad)
  if (controls && view.pressed && (view.pressed.left || view.pressed.right || view.pressed.fire)) drawPad(buffer, controls, accent, view.pressed)
  if (s.phase === 'won' && s.single) playCard(buffer, layout, accent, 'LEVEL CLEAR', [])
  else if (view.pause != null) playCard(buffer, layout, accent, 'PAUSED', view.resumeOnly ? ['RESUME'] : ['RESUME', 'QUIT'], view.resumeOnly ? 0 : view.pause)
  else if (s.banner > 0 && s.phase === 'play' && (s.banner > 24 || (s.banner >> 2) % 2 === 0)) banner(buffer, s, accent, top, width)
  return buffer
}

/** The level's announcement in the middle of the board: LEVEL and what it brings, or BOSS and its name. */
function banner(buffer: PixelBuffer, s: AttacksState, accent: string, top: number, width: number): void {
  const lp = levelPlan(s.level), y = top + Math.round(ATTACKS_BOARD[s.layout].height * 0.55)
  const title = lp.boss ? 'BOSS' : `LEVEL ${String(s.level).padStart(2, '0')}`
  arcadeText(buffer, title, width / 2, y, 3, lp.boss ? '#ff5a2a' : accent)
  const line = lp.boss ? (s.level === 16 ? `FINAL: ${lp.news}` : lp.news) : lp.news
  if (!line) return
  const scale = text7Width(line, 2, true) <= width - 24 ? 2 : 1, w = text7Width(line, scale, true)
  drawText7(buffer, line, Math.round(width / 2 - w / 2) + 1, y + 30 + 1, INK, scale, true)
  drawText7(buffer, line, Math.round(width / 2 - w / 2), y + 30, CREAM, scale, true)
}

/** What was just hit: a burger bursting, the golden one's sparkle, a plate chipping, foil torn off, ketchup on a boss, a boss blowing up. */
function splat(buffer: PixelBuffer, p: AttacksState['splats'][number], top: number): void {
  const x = Math.round(p.x), y = Math.round(top + p.y)
  if (p.kind === 'burger') {
    const r = p.t / 16
    for (const [dx, dy, size, c] of [[0, 0, 5, '#e0301e'], [-7, -3, 2, '#e28c42'], [8, 2, 2, '#e28c42'], [4, -5, 1.5, '#ffd030'], [-5, 4, 1.5, '#e0301e'], [9, -4, 1, '#54c448']] as const) buffer.disc(x + dx * (1.6 - r * 0.6), y + dy * (1.6 - r * 0.6), size * (0.4 + r * 0.6), c)
  } else if (p.kind === 'gold') {
    for (let k = 0; k < 8; k += 1) { const a = (k / 8) * Math.PI * 2, d = 6 + (30 - p.t) * 0.8; buffer.set(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.6), k % 2 ? '#fff6c0' : '#ffd23f') }
  } else if (p.kind === 'foil') {
    // silver scraps flying off
    const d = (14 - p.t) * 1.3
    for (let k = 0; k < 7; k += 1) { const a = k * 0.9 + 0.3; buffer.rect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.7 + (14 - p.t) * 0.3), 2, 1, k % 2 ? '#ffffff' : '#b4bccc') }
  } else if (p.kind === 'boss') {
    for (const [dx, dy] of [[-3, 1], [2, 2], [0, 4], [4, -1], [-2, 5]] as const) buffer.set(x + dx, y + dy + (10 - p.t) / 3, '#e8301e')
  } else if (p.kind === 'boom') {
    // a ball of fire swelling, then its smoke
    const age = 22 - p.t, r = 3 + age * 0.8
    if (age < 14) {
      buffer.disc(x, y, r, '#ff7a2a')
      buffer.disc(x, y, r * 0.7, '#ffd23f')
      if (age < 7) buffer.disc(x, y, r * 0.35, '#ffffff')
    } else for (let k = 0; k < 10; k += 1) { const a = k * 0.63; buffer.set(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), '#5a4a5a') }
  } else for (const [dx, dy] of [[-2, 0], [2, 1], [0, 3]] as const) buffer.set(x + dx, y + dy + (18 - p.t) / 3, '#ffffff')
}

export type AttacksPlayOptions = { frame?: number; level?: number }

/** A player for the test page's moments of play: it goes under the nearest burger (or boss) and fires when it is under it. */
function demoMove(s: AttacksState): { move: -1 | 0 | 1; fire: boolean } {
  const nozzle = s.cook.x + 11
  const aims = s.boss ? [s.boss.x] : s.burgers.filter((b) => b.alive).map((b) => burgerSpot(s, b).x)
  if (!aims.length) return { move: 0, fire: false }
  const near = aims.reduce((best, x) => (Math.abs(x - nozzle) < Math.abs(best - nozzle) ? x : best), aims[0])
  return { move: Math.abs(near - nozzle) < 2 ? 0 : near > nozzle ? 1 : -1, fire: Math.abs(near - nozzle) < 8 }
}
/** A moment of play for the test page: a game at `level` played on its own, a little further at each picture. */
const demos = new Map<string, { state: AttacksState; frame: number }>()
export function renderAttacksPlay(layout: Layout, accent: string, options: AttacksPlayOptions = {}): PixelBuffer {
  const frame = options.frame ?? 0, level = options.level ?? 3
  const key = `${layout}|${level}`
  let demo = demos.get(key)
  if (!demo || frame < demo.frame || demo.state.phase !== 'play' || demo.state.level !== level) { demo = { state: createAttacks(layout, level, 11 + frame, { single: true, lives: 3 }), frame: 0 }; demos.set(key, demo) }
  // a picture is about half a second of play; the announcement is let go by first
  while (demo.frame <= frame) {
    const n = demo.frame === 0 ? 160 : 27
    for (let k = 0; k < n && demo.state.phase === 'play'; k += 1) { const c = demoMove(demo.state); stepAttacks(demo.state, c.move, c.fire) }
    demo.frame += 1
  }
  return renderAttacksGame(demo.state, accent, { pad: layout === 'portrait' ? 'band' : 'none' })
}

