/**
 * RANDOM RACING in play: the road seen from behind the car, under the bar.
 *
 * The far view is the owner's picture's — the sky, the sun going down into
 * the sea, the mountains, the city — sliding a little as the road turns. In
 * front of it the road, drawn stretch by stretch as it comes: its bends and
 * its hills, its kerbs in the picture's salmon, its lanes, the beach and the
 * sea on the left, the bushes on the right, the rails along both sides, the
 * picture's palms and red chevrons by it; the start's gantry with its lights,
 * the finish line's chequered one. The rivals are the picture's cars, small
 * with the distance; the player's at the foot of the road, leaning as it
 * steers, bouncing, kicking up sand off the road. The bar on top — TIME,
 * SCORE, the level and how far along it, the place — the speed in a corner,
 * the lights and GO!, GOAL! and its points, TIME UP; on a touch screen the
 * arrows on the left, A (gas) and B (brake) on the right.
 */

import { racingArt, type RacingCarKind } from './racing-art'
import {
  createRacing, heightAt, RACING_BEND, RACING_CAR_WIDTH, RACING_KERB, RACING_LAST_LEVEL, RACING_RAIL, RACING_SEGMENT, RACING_START_STEPS,
  racingKmh, segmentOf, stepRacing, type RacingLayout, type RacingSegment, type RacingState,
} from './racing-rules'
import { dim, drawText, drawText7, mix, PixelBuffer, rgbOf, text7Width, textWidth } from './pixels'
import { playCard, playSize, type Hit, type Pad } from './screens'
import { arcadeText, CREAM, GREY, HUD_HEIGHT, INK } from './ui'

/** The start's gantry, over the road ahead of the grid. */
const RACING_START_LINE = 40

type Layout = RacingLayout
type RGB = readonly [number, number, number]

// ---------------------------------------------------------------- the traced pictures

/** A traced picture's pixels onto the buffer at `x`, `y`, leaving out its clear ones; drawn `w` × `h` (each pixel taken from the nearest), its own size if not given; no row at or under `clip`; mirrored if asked. */
export function drawArt(buffer: PixelBuffer, pic: PixelBuffer, x: number, y: number, w = pic.width, h = pic.height, clip = buffer.height, flip = false): void {
  const sx = pic.width / w, sy = pic.height / h, d = buffer.data, s = pic.data
  const x0 = Math.round(x), y0 = Math.round(y), W = Math.round(w), H = Math.round(h)
  const bottom = Math.min(buffer.height, clip)
  for (let yy = 0; yy < H; yy += 1) {
    const ty = y0 + yy
    if (ty < 0) continue
    if (ty >= bottom) break
    const py = Math.min(pic.height - 1, Math.floor((yy + 0.5) * sy))
    for (let xx = 0; xx < W; xx += 1) {
      const tx = x0 + xx
      if (tx < 0 || tx >= buffer.width) continue
      const px = Math.min(pic.width - 1, Math.floor(((flip ? W - 1 - xx : xx) + 0.5) * sx))
      const o = (py * pic.width + px) * 4
      if (s[o + 3] < 128) continue
      const t = (ty * buffer.width + tx) * 4
      d[t] = s[o]; d[t + 1] = s[o + 1]; d[t + 2] = s[o + 2]; d[t + 3] = 255
    }
  }
}

/** A car seen from behind, its picture nearest the width asked for, drawn that wide, its foot at `foot` and its middle at `cx`; no row at or under `clip`. */
export function drawCar(buffer: PixelBuffer, kind: RacingCarKind, cx: number, foot: number, width: number, clip = buffer.height): void {
  const size = width > 112 ? 130 : width > 70 ? 104 : 60
  const pic = racingArt(`car-${kind}-${size}`)
  if (!pic || width < 2) return
  const w = Math.max(2, Math.round(width * (kind === 'burger' ? 0.78 : 1))), h = Math.max(1, Math.round((pic.height * w) / pic.width))
  drawArt(buffer, pic, Math.round(cx - w / 2), Math.round(foot - h), w, h, clip)
}

/** A puff from an exhaust, low by the road, swelling and thinning as it drifts out, one moment after another. */
export function puff(buffer: PixelBuffer, x: number, y: number, dir: number, frame: number, seed: number, color = '#e8dcf0', strength = 0.38): void {
  const age = (frame + seed) % 5, r = 2 + age * 1.6
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
    const q = (dx * dx + dy * dy) / (r * r)
    if (q <= 1) buffer.tint(Math.round(x + dir * age * 3 + dx), Math.round(y + age * 0.6 + dy * 0.6), color, strength * (1 - age / 5) * (1 - q * 0.5))
  }
}

// ---------------------------------------------------------------- the view

/** The boards under the bar: wide 448 × 320, tall 320 × 448, as the other games'. */
export const RACING_BOARD: Record<Layout, { width: number; height: number }> = { landscape: { width: 448, height: 320 }, portrait: { width: 320, height: 448 } }
/**
 * Where the eye is, for each board: the horizon's row on a flat road, the
 * row the player's car stands on, and the road's half width there in
 * pixels — the camera's height and distance follow from them.
 */
const VIEW: Record<Layout, { horizon: number; foot: number; half: number }> = {
  landscape: { horizon: 148, foot: 308, half: 200 },
  portrait: { horizon: 214, foot: 432, half: 150 },
}
/** How many stretches ahead are drawn; nearer than this (world units) nothing is. */
const DRAW = 260
const NEAR = 0.25
/** The beach's width past the kerbs before the sea, the rails' height and their bar's, a palm's height and a chevron's: in half widths. */
const BEACH = 2.4
const RAIL_HIGH = 0.32, RAIL_BAR = 0.07
const PALM_HIGH = 2.6, CHEVRON_HIGH = 0.62
/** The gantries' posts, out past the rails, and their height. */
const GANTRY_X = 1.95, GANTRY_HIGH = 2

/** The road's colours, taken from the picture. */
const hex = (c: string): RGB => rgbOf(c)
const C = {
  tar: [hex('#252645'), hex('#2b2b4a')], line: hex('#d5bca5'),
  kerb: [hex('#f99259'), hex('#d8744a')],
  bush: [hex('#1f4a3a'), hex('#26573f')], sea: [hex('#0998b1'), hex('#047ba5'), hex('#13b0c4')], glint: hex('#d8faff'), sand: [hex('#f0a07a'), hex('#e08c6a')],
}
const RAIL = '#8c7b8b', RAIL_TOP = '#d5bca5', POST = '#1c2474'
/** A number from 0 to 1 for a pixel, always the same. */
const grain = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

/** A stretch on the screen: its near and far ends' middles, half widths and rows, the scale at each, and the row under which nearer ground hides it. */
type Projected = { i: number; x1: number; y1: number; w1: number; s1: number; x2: number; y2: number; w2: number; s2: number; clip: number; seg: RacingSegment; behind: boolean }

const FLAT: RacingSegment = { curve: 0, y1: 0, y2: 0, things: [] }

/** The far view, mirrored past its edges so it can slide either way. */
function farView(buffer: PixelBuffer, back: PixelBuffer | null, W: number, horizon: number, slide: number): void {
  if (!back) {
    for (let y = 0; y < horizon; y += 1) buffer.rect(0, y, W, 1, mix('#1a0a34', '#ff7a5a', (y / horizon) ** 1.5))
    return
  }
  const d = buffer.data, s = back.data, bw = back.width, top = horizon - back.height
  const shift = Math.round((W - bw) / 2 + slide)
  const column = (x: number) => { let u = (x - shift) % (bw * 2); if (u < 0) u += bw * 2; return u < bw ? u : bw * 2 - 1 - u }
  for (let y = 0; y < horizon; y += 1) {
    // over a tall board, the sky carried up from the picture's top, darkening
    const py = Math.max(0, y - top), fade = y < top ? ((top - y) / Math.max(1, top)) ** 1.2 : 0
    const [fr, fg, fb] = rgbOf('#1a0a34')
    for (let x = 0; x < W; x += 1) {
      const o = (py * bw + column(x)) * 4, t = (y * W + x) * 4
      d[t] = s[o] + (fr - s[o]) * fade; d[t + 1] = s[o + 1] + (fg - s[o + 1]) * fade; d[t + 2] = s[o + 2] + (fb - s[o + 2]) * fade; d[t + 3] = 255
    }
  }
}

/** The road's ground on one row: the sea and the beach on the left, the kerbs, the road with its lanes, the bushes on the right. */
function groundRow(d: Uint8ClampedArray, W: number, y: number, c: number, h: number, band: number, frame: number): void {
  const kerb = h * RACING_KERB, shore = h * (RACING_KERB + BEACH)
  const edge = Math.max(1, h * 0.028), lane = Math.max(1, h * 0.022)
  const put = (x: number, rgb: RGB) => { const t = (y * W + x) * 4; d[t] = rgb[0]; d[t + 1] = rgb[1]; d[t + 2] = rgb[2]; d[t + 3] = 255 }
  for (let x = 0; x < W; x += 1) {
    const dx = x + 0.5 - c, ad = Math.abs(dx)
    if (ad < h) put(x, Math.abs(ad - (h - edge * 2.2)) < edge / 2 ? C.line : band && Math.abs(ad - h / 3) < lane / 2 ? C.line : C.tar[band])
    else if (ad < kerb) put(x, C.kerb[band])
    else if (dx < 0 && dx > -shore) put(x, C.sand[band])
    else if (dx < 0) { const g = grain(x, y + ((frame >> 3) & 63) * 7); put(x, g > 0.986 ? C.glint : C.sea[y % 4 === 0 ? 1 : g > 0.72 ? 2 : 0]) }
    else put(x, C.bush[band])
  }
}

/** A piece of rail between two ends on the screen (its bar's top and bottom at each), no pixel at or under `clip`. */
function railPiece(buffer: PixelBuffer, xa: number, ta: number, ba: number, xb: number, tb: number, bb: number, clip: number): void {
  const from = Math.round(Math.min(xa, xb)), to = Math.round(Math.max(xa, xb))
  for (let x = from; x <= to; x += 1) {
    const t = to === from ? 0 : (x - xa) / (xb - xa)
    const top = Math.round(ta + (tb - ta) * t), bot = Math.max(top + 1, Math.round(ba + (bb - ba) * t))
    for (let y = top; y < Math.min(bot, clip); y += 1) buffer.set(x, y, y === top ? RAIL_TOP : RAIL)
  }
}

/** A gantry across the road on the screen: two posts, a beam; the start's with its three lights, the finish's chequered. */
function gantry(buffer: PixelBuffer, p: { x: number; y: number; s: number }, K: number, clip: number, finish: boolean, lit: number): void {
  const u = p.s * K, xl = p.x - GANTRY_X * u, xr = p.x + GANTRY_X * u
  const top = p.y - GANTRY_HIGH * u, beam = Math.max(2, Math.round(0.34 * u)), post = Math.max(1, Math.round(0.08 * u))
  const bottom = Math.min(clip, buffer.height)
  const fill = (x0: number, y0: number, w: number, h: number, color: string) => { for (let y = Math.max(0, Math.round(y0)); y < Math.min(bottom, Math.round(y0 + h)); y += 1) for (let x = Math.round(x0); x < Math.round(x0 + w); x += 1) buffer.set(x, y, color) }
  fill(xl - post / 2, top, post, p.y - top, '#3a3450')
  fill(xr - post / 2, top, post, p.y - top, '#3a3450')
  if (finish) {
    // the chequered banner
    const sq = Math.max(1, Math.round(beam / 2))
    for (let y = Math.round(top); y < Math.min(bottom, Math.round(top + beam)); y += 1) for (let x = Math.round(xl); x < Math.round(xr); x += 1) {
      if (y < 0) continue
      buffer.set(x, y, (Math.floor((x - xl) / sq) + Math.floor((y - top) / sq)) % 2 ? CREAM : '#1a1a22')
    }
  } else {
    fill(xl, top, xr - xl, beam, '#1c1a2e')
    // three lights: red one by one, then all green
    const r = Math.max(1, beam * 0.32)
    for (let k = 0; k < 3; k += 1) {
      const cx = p.x + (k - 1) * beam * 1.2, cy = top + beam / 2
      if (cy + r >= bottom) continue
      buffer.disc(cx, cy, r, lit >= 3 ? '#3aff6a' : k <= lit ? '#ff3a2a' : '#4a2a2a')
    }
  }
}

/** A rival where it stands, small with the distance, bouncing a little. */
function rival(board: PixelBuffer, rows: Projected[], b0: number, r: RacingState['rivals'][number], K: number, frame: number): void {
  const at = placeOn(rows, b0, r.z, r.x, K)
  if (!at) return
  const bob = r.speed > 0.05 && (frame >> 2) % 2 ? 1 : 0
  drawCar(board, r.kind, at.x, at.y - bob, RACING_CAR_WIDTH * at.s * K, at.clip)
}

/** Where a car or a thing at `z` (stretches) and `x` (half widths) stands on the screen, from the stretches drawn; null when out of sight. */
function placeOn(rows: Projected[], b0: number, z: number, x: number, K: number): { x: number; y: number; s: number; clip: number } | null {
  const n = Math.floor(z) - b0
  const p = rows[n]
  if (!p) return null
  const t = z - Math.floor(z)
  const s = p.s1 + (p.s2 - p.s1) * t
  const cx = p.x1 + (p.x2 - p.x1) * t, cy = p.y1 + (p.y2 - p.y1) * t
  return { x: cx + x * s * K, y: cy, s, clip: p.clip }
}

// ---------------------------------------------------------------- the controls

/** The controls under (or beside) the board on a touch screen: the arrows left and right, A (gas) and B (brake). */
export type RacingPad = { zone: Hit; left: Hit; right: Hit; gas: { cx: number; cy: number; r: number }; brake: { cx: number; cy: number; r: number } }
export function racingPadGeometry(layout: Layout, pad: Pad): RacingPad | null {
  if (pad === 'none') return null
  const { width, height } = playSize(layout, pad)
  const board = RACING_BOARD[layout]
  if (pad === 'side') {
    const x = board.width, a = 56, r = 30
    return { zone: { x, y: HUD_HEIGHT, w: width - x, h: height - HUD_HEIGHT }, left: { x: x + 14, y: height - 24 - a, w: a, h: a }, right: { x: x + 24 + a, y: height - 24 - a, w: a, h: a }, gas: { cx: x + (width - x) / 2 + 30, cy: HUD_HEIGHT + 70, r }, brake: { cx: x + (width - x) / 2 - 30, cy: HUD_HEIGHT + 150, r } }
  }
  const y = HUD_HEIGHT + board.height, h = height - y
  const left = { x: 14, y: y + (h - (pad === 'big' ? 68 : 60)) / 2, w: pad === 'big' ? 68 : 60, h: pad === 'big' ? 68 : 60 }
  const right = { ...left, x: left.x + left.w + 10 }
  // B a little lower and further in, A further out and higher, as a thumb rests; in the tall band, one over the other's shoulder
  if (pad === 'big') {
    const r = 34, gas = { cx: width - 16 - r, cy: y + h * 0.33, r }
    return { zone: { x: 0, y, w: width, h }, left, right, gas, brake: { cx: gas.cx - r * 2 - 4, cy: y + h * 0.68, r } }
  }
  const r = 27
  return { zone: { x: 0, y, w: width, h }, left, right, gas: { cx: width - 14 - r, cy: y + h / 2 - r * 0.35, r }, brake: { cx: width - 14 - r * 3.3, cy: y + h / 2 + r * 0.35, r } }
}
/** Which control a finger at (`x`, `y`) means: anywhere in their band counts, the nearest wins. */
export function racingPadPart(x: number, y: number, pad: RacingPad): 'left' | 'right' | 'gas' | 'brake' | null {
  const { zone } = pad
  if (x < zone.x || y < zone.y || x >= zone.x + zone.w || y >= zone.y + zone.h) return null
  const d = (cx: number, cy: number) => Math.hypot(x - cx, y - cy)
  const parts: Array<['left' | 'right' | 'gas' | 'brake', number]> = [
    ['left', d(pad.left.x + pad.left.w / 2, pad.left.y + pad.left.h / 2)],
    ['right', d(pad.right.x + pad.right.w / 2, pad.right.y + pad.right.h / 2)],
    ['gas', d(pad.gas.cx, pad.gas.cy) - pad.gas.r * 0.3],
    ['brake', d(pad.brake.cx, pad.brake.cy) - pad.brake.r * 0.3],
  ]
  return parts.sort((a, b) => a[1] - b[1])[0][0]
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
function roundButton(buffer: PixelBuffer, b: { cx: number; cy: number; r: number }, label: string, color: string, pressed: boolean): void {
  const push = pressed ? 2 : 0
  buffer.disc(b.cx + 1, b.cy + 4, b.r, INK)
  buffer.disc(b.cx, b.cy + push, b.r, dim(color, 0.5))
  buffer.disc(b.cx - 1, b.cy - 1 + push, b.r - 3, pressed ? mix(color, '#ffffff', 0.25) : color)
  buffer.disc(b.cx - b.r * 0.3, b.cy - b.r * 0.35 + push, b.r * 0.28, mix(color, '#ffffff', 0.45))
  const scale = b.r >= 26 ? 2 : 1, w = text7Width(label, scale, true)
  drawText7(buffer, label, Math.round(b.cx - w / 2) + 1, Math.round(b.cy - 3.5 * scale) + push + 1, INK, scale, true)
  drawText7(buffer, label, Math.round(b.cx - w / 2), Math.round(b.cy - 3.5 * scale) + push, CREAM, scale, true)
}
/** The controls, the ones held pressed down. */
function drawPad(buffer: PixelBuffer, pad: RacingPad, accent: string, pressed: RacingView['pressed'] = {}): void {
  arrowButton(buffer, pad.left, -1, !!pressed.left, accent)
  arrowButton(buffer, pad.right, 1, !!pressed.right, accent)
  roundButton(buffer, pad.brake, 'B', '#3a7aff', !!pressed.brake)
  roundButton(buffer, pad.gas, 'A', '#2ac05a', !!pressed.gas)
}

// ---------------------------------------------------------------- the bar and the words

const ordinal = (n: number) => `${n}${n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'}`

/** The bar on top: TIME counting down (red in its last ten seconds), SCORE, the level and how far along it, the place. */
function racingHud(buffer: PixelBuffer, accent: string, s: RacingState): void {
  const W = buffer.width
  buffer.rect(0, 0, W, HUD_HEIGHT, '#07070e')
  buffer.rect(0, HUD_HEIGHT - 1, W, 1, dim(accent, 0.55))
  const secs = Math.ceil(s.time / 60), late = s.phase === 'play' && secs <= 10
  drawText(buffer, 'TIME', 8, 3, GREY)
  drawText7(buffer, String(secs).padStart(2, '0'), 8, 11, late ? ((s.steps >> 4) % 2 ? '#ff5a4a' : '#ffb0a0') : CREAM, 1, true)
  const score = String(s.score).padStart(5, '0')
  const sx = Math.round(W * 0.2)
  drawText(buffer, 'SCORE', sx, 3, GREY)
  drawText7(buffer, score, sx, 11, CREAM, 1, true)
  // the level: a line from the start to the finish, the car's dot on it
  const bx = Math.round(W * 0.47), bw = Math.round(W * 0.28), progress = Math.max(0, Math.min(1, s.z / s.finish))
  drawText(buffer, `LEVEL ${String(s.level).padStart(2, '0')}`, bx, 3, GREY)
  buffer.rect(bx, 14, bw, 3, '#2a2a3a')
  buffer.rect(bx, 14, Math.round(bw * progress), 3, accent)
  buffer.rect(bx + bw - 2, 11, 3, 9, CREAM)
  buffer.disc(bx + bw * progress, 15.5, 2.5, CREAM)
  const pl = `${s.place}/${s.rivals.length + 1}`
  drawText(buffer, 'POS', W - 8 - textWidth('POS'), 3, GREY)
  drawText7(buffer, pl, W - 8 - text7Width(pl, 1, true), 11, s.place === 1 ? '#ffd23f' : CREAM, 1, true)
}

/** A line of words with its ink shadow, centred. */
function said(buffer: PixelBuffer, text: string, cx: number, y: number, color: string, scale = 2): void {
  const w = text7Width(text, scale, true)
  drawText7(buffer, text, Math.round(cx - w / 2) + 1, y + 1, INK, scale, true)
  drawText7(buffer, text, Math.round(cx - w / 2), y, color, scale, true)
}

// ---------------------------------------------------------------- the play screen

const surfaces = new Map<string, PixelBuffer>()

/** What the play screen shows over the race: the pause card (RESUME 0, QUIT 1), or RESUME alone; where the controls go; which of them are held. */
export type RacingView = { pause?: 0 | 1 | null; pad?: Pad; resumeOnly?: boolean; pressed?: { left?: boolean; right?: boolean; gas?: boolean; brake?: boolean } }

export function renderRacingGame(s: RacingState, accent: string, view: RacingView = {}): PixelBuffer {
  const layout = s.layout
  const pad = view.pad ?? (layout === 'portrait' ? 'band' : 'none')
  const size = playSize(layout, pad)
  const key = `${layout}|${pad}`
  let out = surfaces.get(key)
  if (!out) { out = new PixelBuffer(size.width, size.height, INK); surfaces.set(key, out) }
  const { width: W, height: H } = RACING_BOARD[layout]
  const v = VIEW[layout], K = W / 2
  const board = boardSurface(layout)
  drawRace(board, s, v, K)
  // the board under the bar, the controls beside or under it
  out.clear(INK)
  for (let y = 0; y < H; y += 1) out.data.set(board.data.subarray(y * W * 4, (y + 1) * W * 4), ((HUD_HEIGHT + y) * out.width) * 4)
  const controls = racingPadGeometry(layout, pad)
  if (controls) drawPad(out, controls, accent, view.pressed)
  racingHud(out, accent, s)
  words(out, s, accent, W, H)
  if (s.phase === 'won' && s.single) playCard(out, layout, accent, 'LEVEL CLEAR', [])
  else if (view.pause != null) playCard(out, layout, accent, 'PAUSED', view.resumeOnly ? ['RESUME'] : ['RESUME', 'QUIT'], view.resumeOnly ? 0 : view.pause)
  return out
}

const boards = new Map<Layout, PixelBuffer>()
function boardSurface(layout: Layout): PixelBuffer {
  let b = boards.get(layout)
  if (!b) { b = new PixelBuffer(RACING_BOARD[layout].width, RACING_BOARD[layout].height, INK); boards.set(layout, b) }
  return b
}

/** The race on the board: the far view, the road and what stands by it, the rivals, the player's car. */
function drawRace(board: PixelBuffer, s: RacingState, v: { horizon: number; foot: number; half: number }, K: number): void {
  const W = board.width, H = board.height, d = board.data, frame = s.steps
  const camH = (v.foot - v.horizon) / v.half
  const back = (K / v.half) / RACING_SEGMENT
  const camZ = s.z - back
  const camY = heightAt(s.track, Math.max(0, s.z)) + camH
  farView(board, racingArt('playBack'), W, v.horizon, -s.view)
  // under the horizon, the sea out to it, where no road is drawn
  for (let y = v.horizon; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const g = grain(x, y + ((frame >> 3) & 63) * 7), rgb = g > 0.99 ? C.glint : C.sea[y % 4 === 0 ? 1 : g > 0.72 ? 2 : 0]
    const t = (y * W + x) * 4
    d[t] = rgb[0]; d[t + 1] = rgb[1]; d[t + 2] = rgb[2]; d[t + 3] = 255
  }
  // the road, nearest first, each stretch only where nearer ground has not been drawn
  const b0 = Math.floor(camZ)
  const seg = (i: number) => (i < 0 ? FLAT : segmentOf(s.track, i))
  const frac = camZ - b0
  let x = 0, dx = -seg(b0).curve * RACING_BEND * frac
  let maxY = H
  const rows: Projected[] = []
  for (let n = 0; n < DRAW; n += 1) {
    const i = b0 + n, g = seg(i)
    const z1 = Math.max(NEAR, (i - camZ) * RACING_SEGMENT), z2 = (i + 1 - camZ) * RACING_SEGMENT
    const y1w = i < 0 ? 0 : g.y1, y2w = i < 0 ? 0 : g.y2
    const s1 = 1 / z1, s2 = 1 / Math.max(NEAR, z2)
    const p: Projected = {
      i, seg: g, clip: maxY, behind: z2 <= NEAR,
      x1: W / 2 + s1 * (x - s.x) * K, y1: v.horizon + s1 * (camY - y1w) * K, w1: s1 * K, s1,
      x2: W / 2 + s2 * (x + dx - s.x) * K, y2: v.horizon + s2 * (camY - y2w) * K, w2: s2 * K, s2,
    }
    rows.push(p)
    x += dx
    dx += g.curve * RACING_BEND
    if (p.behind || p.y2 >= maxY || p.y2 >= p.y1) continue
    const band = Math.floor((i < 0 ? i - 2 : i) / 3) & 1
    const top = Math.max(0, Math.ceil(p.y2 - 0.5)), bottom = Math.min(maxY, Math.ceil(p.y1 - 0.5))
    for (let y = top; y < bottom; y += 1) {
      const t = (y + 0.5 - p.y2) / (p.y1 - p.y2)
      groundRow(d, W, y, p.x2 + (p.x1 - p.x2) * t, p.w2 + (p.w1 - p.w2) * t, band, frame)
    }
    maxY = Math.min(maxY, top)
  }
  // what stands by the road and the rivals ahead of the player, furthest first, each hidden by the ground in front of it
  const rivals = s.rivals.filter((r) => r.z >= s.z).sort((a, b) => b.z - a.z)
  const close = s.rivals.filter((r) => r.z < s.z).sort((a, b) => b.z - a.z)
  let ri = 0
  for (let n = rows.length - 1; n >= 0; n -= 1) {
    const p = rows[n]
    if (p.clip <= 0 || p.behind) continue
    const i = p.i
    // the rails along both sides, a post every fourth stretch
    for (const side of [-1, 1]) {
      const xa = p.x1 + side * RACING_RAIL * p.w1, xb = p.x2 + side * RACING_RAIL * p.w2
      const ta = p.y1 - RAIL_HIGH * p.w1, tb = p.y2 - RAIL_HIGH * p.w2
      railPiece(board, xa, ta, ta + Math.max(1, RAIL_BAR * p.w1), xb, tb, tb + Math.max(1, RAIL_BAR * p.w2), p.clip)
      if (i % 4 === 0) { const pw = Math.max(1, Math.round(0.05 * p.w1)); for (let y = Math.round(ta); y < Math.min(p.clip, Math.round(p.y1)); y += 1) for (let k = 0; k < pw; k += 1) board.set(Math.round(xa) + k, y, POST) }
    }
    for (const thing of p.seg.things) {
      const u = p.w1, foot = p.y1, cx = p.x1 + thing.x * u
      const pic = racingArt(thing.kind === 'palm' ? 'palm' : 'chevron')
      if (!pic) continue
      const h = (thing.kind === 'palm' ? PALM_HIGH : CHEVRON_HIGH) * u, w = (pic.width * h) / pic.height
      if (h < 2) continue
      drawArt(board, pic, cx - w / 2, foot - h, w, h, p.clip, thing.flip)
    }
    // the start's gantry and the finish line's
    if (i === RACING_START_LINE) gantry(board, { x: p.x1, y: p.y1, s: p.s1 }, K, p.clip, false, s.phase === 'start' ? Math.floor(s.phaseTimer / 60) : 3)
    if (i === s.finish) gantry(board, { x: p.x1, y: p.y1, s: p.s1 }, K, p.clip, true, 0)
    // the rivals on this stretch
    while (ri < rivals.length && Math.floor(rivals[ri].z) > i) ri += 1
    while (ri < rivals.length && Math.floor(rivals[ri].z) === i) {
      const r = rivals[ri]
      ri += 1
      rival(board, rows, b0, r, K, frame + ri * 5)
    }
  }
  // the player's car: leaning as it steers, bouncing at speed, shaken by a knock
  const width = RACING_CAR_WIDTH * v.half
  const shake = s.knock > 0 ? ((s.knock >> 1) % 2 ? 2 : -2) : 0
  const bob = s.speed > 0.05 && (frame >> 2) % 2 ? 1 : 0
  const cx = W / 2 + s.steer * 3 + shake
  drawCar(board, s.car, cx, v.foot - bob, width)
  // a rival just behind, nearer the eye than the player's car
  close.forEach((r, k) => rival(board, rows, b0, r, K, frame + k * 7))
  // off the road, sand or leaves flying from the wheels; slow, the exhausts' puffs
  if (s.offroad && s.speed > 0.05) {
    const color = s.x < 0 ? '#f0c09a' : '#3a7a4a'
    puff(board, cx - width * 0.42, v.foot - 4, -1, frame, 0, color, 0.7)
    puff(board, cx + width * 0.42, v.foot - 4, 1, frame, 2, color, 0.7)
  } else if (s.speed < 0.35 && s.phase !== 'over') {
    puff(board, cx - width * 0.28, v.foot - 6, -1, frame >> 1, 0)
    puff(board, cx + width * 0.28, v.foot - 6, 1, frame >> 1, 2)
  }
  // the speed, in a corner
  const kmh = String(racingKmh(s.speed)).padStart(3, ' ')
  const ky = H - 26
  drawText7(board, kmh, 11, ky + 1, INK, 2, true)
  drawText7(board, kmh, 10, ky, CREAM, 2, true)
  drawText(board, 'KM/H', 10 + text7Width(kmh, 2, true) + 4, ky + 8, CREAM)
}

/** The words over the board: the level and the lights at the start, GO!, GOAL! and its points, TIME UP. */
function words(out: PixelBuffer, s: RacingState, accent: string, W: number, H: number): void {
  const top = HUD_HEIGHT, mid = top + Math.round(H * 0.36)
  // the level, then the count over the start's gantry
  if (s.phase === 'start') {
    arcadeText(out, `LEVEL ${String(s.level).padStart(2, '0')}`, W / 2, top + 12, 3, accent)
    if (s.phaseTimer >= 20) said(out, String(3 - Math.floor(s.phaseTimer / 60)), W / 2, top + 46, CREAM, 5)
  } else if (s.phase === 'play' && s.phaseTimer < 50 && s.z < 60) said(out, 'GO!', W / 2, top + 46, '#3aff6a', 5)
  else if (s.phase === 'goal') {
    arcadeText(out, 'GOAL!', W / 2, mid - 6, 4, accent)
    if (s.phaseTimer > 30 && s.bonus) said(out, `${ordinal(s.bonus.rank)} PLACE +${s.bonus.place}`, W / 2, mid + 36, s.bonus.rank === 1 ? '#ffd23f' : CREAM, 2)
    if (s.phaseTimer > 70 && s.bonus) said(out, `TIME +${s.bonus.time}`, W / 2, mid + 56, CREAM, 2)
  } else if (s.phase === 'timeup' || s.phase === 'over') arcadeText(out, 'TIME UP', W / 2, mid, 4, '#ff5a4a')
}

// ---------------------------------------------------------------- a moment of play, for the gallery

/** A driver for the gallery's moment of play: gas held, toward its lane, lifting before the sharp bends. */
function demoMove(s: RacingState): { steer: -1 | 0 | 1; gas: boolean } {
  let worst = 0
  for (let k = 0; k < 40; k += 1) worst = Math.max(worst, Math.abs(segmentOf(s.track, s.z + k).curve))
  const limit = worst < 1e-6 ? 1 : Math.min(1, Math.sqrt(1 / (0.3 * worst)))
  const curve = segmentOf(s.track, s.z).curve, share = s.speed
  const e = 0.3 - (s.x - (1 / 30) * share * share * curve * 0.3)
  return { steer: e > 0.03 ? 1 : e < -0.03 ? -1 : 0, gas: s.speed < limit * 0.99 }
}

export type RacingPlayOptions = { frame?: number; car?: RacingCarKind; pad?: boolean; level?: number }

const demos = new Map<string, { state: RacingState; frame: number }>()
/**
 * A moment of play for the gallery: a race at the level asked, driven by
 * itself from a little way in, half a second of it a picture (the gallery
 * shows one every 450 ms), and again from the start once over.
 */
export function renderRacingPlay(layout: Layout, accent: string, options: RacingPlayOptions = {}): PixelBuffer {
  const frame = options.frame ?? 0, car = options.car ?? 'burger', level = Math.max(1, Math.min(RACING_LAST_LEVEL, options.level ?? 1))
  const key = `${layout}|${car}|${level}`
  let demo = demos.get(key)
  if (!demo || frame < demo.frame || demo.state.phase === 'won' || demo.state.phase === 'over') {
    const state = createRacing(layout, level, 5, { single: true, car })
    // into the race: past the lights and up to speed, among the rivals
    for (let i = 0; i < RACING_START_STEPS + 420; i += 1) { const m = demoMove(state); stepRacing(state, m.steer, m.gas) }
    demo = { state, frame }
    demos.set(key, demo)
  }
  while (demo.frame < frame) { for (let k = 0; k < 27; k += 1) { const m = demoMove(demo.state); stepRacing(demo.state, m.steer, m.gas) } demo.frame += 1 }
  return renderRacingGame(demo.state, accent, { pad: (options.pad ?? layout === 'portrait') ? 'band' : 'none' })
}
