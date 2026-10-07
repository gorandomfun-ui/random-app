/**
 * RANDOM RACING in play: the road seen from behind the car, under the bar.
 *
 * The far view is the owner's picture's, at the level's hour — the sunset,
 * the dusk, the night with its moon, the storm — sliding a little as the
 * road turns, rising and sinking as the car climbs and dips. In front of it
 * the road, drawn stretch by stretch as it comes, fading into the haze far
 * off: its bends and its hills; the beach with its foam, the promenade and
 * its lamps, the cliff's rock over the deep sea, the causeway, the tunnel;
 * the concrete barriers, the picture's palms, the chevrons; the stopwatches,
 * the mustard turbo and the coins over the road, the ketchup puddles and the
 * roadworks' cones on it; the start's gantry with its lights, the
 * checkpoints', the finish line's chequered one. The rivals and the traffic
 * are the picture's cars, turning as they change lanes or take a bend, with
 * their shadows; the player's at the foot of the road, turning as it
 * steers, bouncing, kicking up sand off the road, flaming with the turbo.
 * The bar on top — TIME, SCORE, the level and how far along it, the place —
 * the speed in a corner, the lights and GO!, CHECKPOINT and the time it
 * gives, GOAL! and its points, TIME UP; the rain and the lightning in the
 * storm; on a touch screen the arrows on the left, A (gas) and B (brake) on
 * the right.
 */

import { BONUS_PALETTE, MUSTARD } from './attacks-sprites'
import { racingArt, type RacingCarKind } from './racing-art'
import { crowdPicture, GULL, PLANE, PLANE_PALETTE, PROP_HIGH, propPicture } from './racing-props'
import { shop, SHOPS, TOWN_UNIT } from './racing-town'
import {
  createRacing, heightAt, RACING_BEND, RACING_CAR_WIDTH, RACING_LAST_LEVEL, RACING_SEGMENT, RACING_START_STEPS,
  racingHour, racingKmh, racingSunset, segmentOf, stepRacing, type RacingItem, type RacingLayout, type RacingProp, type RacingSegment, type RacingShop, type RacingState, type RacingTrafficModel, type RacingZone,
} from './racing-rules'
import {
  blocks, bottle, chevron, cliffPiece, coin, cone, drawArt, drawCar, drawTraffic, farGround, flames, fogStep, gantry, glow, groundRow, lamp, lampPool, skyAt,
  facadePiece, puddle, puff, rail, shopSide, shrub, stopwatch, tintFor, tunnelMouth, tunnelPiece, type End, type Tier,
} from './racing-scene'
import { dim, drawText, drawText7, mix, PixelBuffer, rgbOf, text7Width, textWidth } from './pixels'
import { playCard, playSize, type Hit, type Pad } from './screens'
import { arcadeText, CREAM, GREY, HUD_HEIGHT, INK } from './ui'

export { drawArt, drawCar, puff } from './racing-scene'

/** The start's gantry, over the road ahead of the grid. */
const START_LINE = 40

type Layout = RacingLayout

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
/** How many stretches ahead are drawn; nearer than this (half widths) nothing is. */
const DRAW = 260
const NEAR = 0.25
const FAR = DRAW * RACING_SEGMENT
/** A palm's height, in half widths. */
const PALM_HIGH = 2.7

const FLAT: RacingSegment = { curve: 0, y1: 0, y2: 0, zone: 'beach', things: [] }

/** A stretch on the screen: its near and far ends (middle, row, pixels to a half width), the row under which nearer ground hides it, its haze. */
type Projected = { i: number; seg: RacingSegment; a: End; b: End; clip: number; behind: boolean; fog: number; zNear: number }

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

/** The bar on top: TIME counting down (red in its last ten seconds), SCORE, the level and how far along it (its checkpoints marked), the place. */
function racingHud(buffer: PixelBuffer, accent: string, s: RacingState): void {
  const W = buffer.width
  const [r, g, b] = rgbOf('#07070e'), d = buffer.data
  for (let t = 0; t < W * HUD_HEIGHT * 4; t += 4) { d[t] = r; d[t + 1] = g; d[t + 2] = b; d[t + 3] = 255 }
  buffer.rect(0, HUD_HEIGHT - 1, W, 1, dim(accent, 0.55))
  const secs = Math.ceil(s.time / 60), late = s.phase === 'play' && secs <= 10
  drawText(buffer, 'TIME', 8, 3, GREY)
  drawText7(buffer, String(secs).padStart(2, '0'), 8, 11, late ? ((s.steps >> 4) % 2 ? '#ff5a4a' : '#ffb0a0') : CREAM, 1, true)
  const score = String(s.score).padStart(5, '0')
  const sx = Math.round(W * 0.2)
  drawText(buffer, 'SCORE', sx, 3, GREY)
  drawText7(buffer, score, sx, 11, CREAM, 1, true)
  // the level: a line from the start to the finish, its checkpoints, the car's dot on it
  const bx = Math.round(W * 0.47), bw = Math.round(W * 0.28), progress = Math.max(0, Math.min(1, s.z / s.finish))
  drawText(buffer, `LEVEL ${String(s.level).padStart(2, '0')}`, bx, 3, GREY)
  buffer.rect(bx, 14, bw, 3, '#2a2a3a')
  buffer.rect(bx, 14, Math.round(bw * progress), 3, accent)
  for (const c of s.checks) buffer.rect(bx + Math.round((bw * c) / s.finish), 12, 1, 7, GREY)
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
  const board = boardSurface(layout)
  drawRace(board, s, VIEW[layout], W / 2, accent)
  // the board under the bar, the controls beside or under it (their band cleared first)
  for (let y = 0; y < H; y += 1) out.data.set(board.data.subarray(y * W * 4, (y + 1) * W * 4), ((HUD_HEIGHT + y) * out.width + 0) * 4)
  const controls = racingPadGeometry(layout, pad)
  if (controls) controlsOn(out, layout, pad, controls, accent, view.pressed ?? {}, W, H)
  racingHud(out, accent, s)
  words(out, s, accent, W, H)
  if (s.phase === 'won' && s.single) playCard(out, layout, accent, 'LEVEL CLEAR', [])
  else if (view.pause != null) playCard(out, layout, accent, 'PAUSED', view.resumeOnly ? ['RESUME'] : ['RESUME', 'QUIT'], view.resumeOnly ? 0 : view.pause)
  return out
}

/** The controls' band as last drawn, kept while no button changes. */
const bands = new Map<string, { key: string; rows: Array<[number, Uint8ClampedArray]> }>()
/** The controls' band: cleared to ink and the buttons drawn, or as kept from before. */
function controlsOn(out: PixelBuffer, layout: Layout, pad: Pad, controls: RacingPad, accent: string, pressed: NonNullable<RacingView['pressed']>, W: number, H: number): void {
  const area = out.width > W ? { x: W, y: HUD_HEIGHT, w: out.width - W, h: out.height - HUD_HEIGHT } : { x: 0, y: HUD_HEIGHT + H, w: out.width, h: out.height - HUD_HEIGHT - H }
  const key = `${accent}|${pressed.left ? 1 : 0}${pressed.right ? 1 : 0}${pressed.gas ? 1 : 0}${pressed.brake ? 1 : 0}`, where = `${layout}|${pad}`
  const kept = bands.get(where)
  if (kept && kept.key === key) { for (const [o, row] of kept.rows) out.data.set(row, o); return }
  inkOver(out, area.x, area.y, area.w, area.h)
  drawPad(out, controls, accent, pressed)
  const rows: Array<[number, Uint8ClampedArray]> = []
  for (let y = area.y; y < area.y + area.h; y += 1) { const o = (y * out.width + area.x) * 4; rows.push([o, out.data.slice(o, o + area.w * 4)]) }
  bands.set(where, { key, rows })
}

/** A rectangle of the screen filled with ink, a row at a time. */
function inkOver(out: PixelBuffer, x: number, y: number, w: number, h: number): void {
  const [r, g, b] = rgbOf(INK), d = out.data
  for (let yy = y; yy < y + h; yy += 1) for (let xx = x, t = (yy * out.width + x) * 4; xx < x + w; xx += 1, t += 4) { d[t] = r; d[t + 1] = g; d[t + 2] = b; d[t + 3] = 255 }
}

const boards = new Map<Layout, PixelBuffer>()
function boardSurface(layout: Layout): PixelBuffer {
  let b = boards.get(layout)
  if (!b) { b = new PixelBuffer(RACING_BOARD[layout].width, RACING_BOARD[layout].height, INK); boards.set(layout, b) }
  return b
}

/** The far view as last drawn on each board, kept while it has neither slid nor moved up or down, nor the hour changed. */
const skies = new Map<number, { key: string; data: Uint8ClampedArray }>()
/** The far view at the hour, its sun as low as the hour has it, its foot on the horizon, slid as the road has turned; over a tall board the sky carried up, darkening; mirrored past its edges. */
function farView(board: PixelBuffer, tier: Tier, sinking: number, horizon: number, slide: number): void {
  const back = skyAt(tier, sinking), W = board.width, d = board.data
  const rows = Math.max(0, Math.min(horizon, board.height))
  if (!back) { for (let y = 0; y < rows; y += 1) board.rect(0, y, W, 1, mix('#1a0a34', '#ff7a5a', (y / horizon) ** 1.5)); return }
  const bw = back.width, top = horizon - back.height
  const shift = Math.round((W - bw) / 2 + slide)
  const key = `${Math.round(tier * 8)}|${Math.round(sinking * 60)}|${shift}|${horizon}`, kept = skies.get(W)
  if (kept && kept.key === key) { d.set(kept.data.subarray(0, rows * W * 4)); return }
  const s = back.data
  const column = new Int32Array(W)
  for (let x = 0; x < W; x += 1) { let u = (x - shift) % (bw * 2); if (u < 0) u += bw * 2; column[x] = u < bw ? u : bw * 2 - 1 - u }
  const [fr, fg, fb] = rgbOf(tier >= 2 ? '#05050f' : '#1a0a34')
  for (let y = 0; y < rows; y += 1) {
    const py = Math.max(0, y - top), fade = y < top ? ((top - y) / Math.max(1, top)) ** 1.2 : 0
    for (let x = 0; x < W; x += 1) {
      const o = (py * bw + column[x]) * 4, t = (y * W + x) * 4
      d[t] = s[o] + (fr - s[o]) * fade; d[t + 1] = s[o + 1] + (fg - s[o + 1]) * fade; d[t + 2] = s[o + 2] + (fb - s[o + 2]) * fade; d[t + 3] = 255
    }
  }
  skies.set(W, { key, data: d.slice(0, rows * W * 4) })
}

/** The things to draw on each stretch ahead: what lies on the road, the rivals and the traffic ahead of the player. */
type Cargo = { items: RacingItem[]; cars: Array<{ kind: RacingCarKind | RacingTrafficModel; traffic: boolean; z: number; x: number; turn: -1 | 0 | 1; look: number; speed: number }> }

/** Which way a car turns on the screen: toward the lane it is heading for, else with a sharp bend. */
const turnOf = (lane: number, x: number, curve: number): -1 | 0 | 1 => (Math.abs(lane - x) > 0.04 ? (lane > x ? 1 : -1) : Math.abs(curve) > 2.5 ? (curve > 0 ? 1 : -1) : 0)

/** The race on the board: the far view, the road and what stands by it and lies on it, the cars, the player's car, the weather. */
function drawRace(board: PixelBuffer, s: RacingState, v: { horizon: number; foot: number; half: number }, K: number, accent: string): void {
  const W = board.width, H = board.height, d = board.data, frame = s.steps
  // the hour as the race goes on: the sun sinking, the dusk, the night; the storm
  const tier: Tier = racingHour(s.level, s.z / Math.max(1, s.finish)), sinking = racingSunset(tier)
  const camH = (v.foot - v.horizon) / v.half
  const back = (K / v.half) / RACING_SEGMENT
  const camZ = s.z - back
  const camY = heightAt(s.track, Math.max(0, s.z)) + camH
  // the eye follows the road's slope a little: up a hill the horizon sinks, down one it rises
  const slope = (heightAt(s.track, s.z + 8) - heightAt(s.track, Math.max(0, s.z - 2))) / (10 * RACING_SEGMENT)
  const horizon = Math.round(v.horizon + Math.max(-34, Math.min(34, slope * K * 0.3)))
  const here = segmentOf(s.track, Math.max(0, s.z)).zone
  farView(board, tier, sinking, horizon, -s.view)
  sky(board, frame, horizon, tier, accent)
  // the stretches ahead, nearest first: each drawn only where nearer ground has not been
  const b0 = Math.floor(camZ)
  const seg = (i: number) => (i < 0 ? FLAT : segmentOf(s.track, i))
  let x = 0, dx = -seg(b0).curve * RACING_BEND * (camZ - b0)
  let maxY = H, farX = W / 2, farZone: RacingZone = here
  const rows: Projected[] = []
  const project = (zw: number, xw: number, yw: number): End => { const sc = 1 / zw; return { x: W / 2 + sc * (xw - s.x) * K, y: horizon + sc * (camY - yw) * K, u: sc * K } }
  const pending: Array<() => void> = []
  for (let n = 0; n < DRAW; n += 1) {
    const i = b0 + n, g = seg(i)
    const z1 = Math.max(NEAR, (i - camZ) * RACING_SEGMENT), z2 = (i + 1 - camZ) * RACING_SEGMENT
    const a = project(z1, x, i < 0 ? 0 : g.y1), b = project(Math.max(NEAR, z2), x + dx, i < 0 ? 0 : g.y2)
    const p: Projected = { i, seg: g, a, b, clip: maxY, behind: z2 <= NEAR, fog: fogStep(z1, FAR), zNear: z1 }
    rows.push(p)
    x += dx
    dx += g.curve * RACING_BEND
    if (p.behind || b.y >= maxY || b.y >= a.y) continue
    const top = Math.max(0, Math.ceil(b.y - 0.5)), bottom = Math.min(maxY, Math.ceil(a.y - 0.5))
    const band = Math.floor((i < 0 ? i - 2 : i) / 3) & 1, wave = ((i >> 2) + (frame >> 4)) & 1
    pending.push(() => { for (let y = top; y < bottom; y += 1) { const t = (y + 0.5 - b.y) / (a.y - b.y); groundRow(d, W, y, { c: b.x + (a.x - b.x) * t, h: b.u + (a.u - b.u) * t, band, zone: g.zone, fog: p.fog, wave, land: true }, tier, frame) } })
    maxY = Math.min(maxY, top)
    farX = b.x; farZone = g.zone
  }
  // under the horizon where no road reaches: the sea, the land on the land's side of the road's far end
  farGround(d, W, Math.max(0, horizon), Math.max(0, Math.min(H, maxY)), Math.round(farX + 6), farZone, tier, frame)
  for (const draw of pending) draw()
  // in the tunnel, its dark
  if (here === 'tunnel') for (let i = 0; i < d.length; i += 4) { d[i] *= 0.62; d[i + 1] *= 0.62; d[i + 2] *= 0.66 }
  // what lies on each stretch and the cars on it, ahead of the player
  const cargo: Cargo[] = rows.map(() => ({ items: [], cars: [] }))
  for (const it of s.items) { if (it.taken) continue; const n = Math.floor(it.z) - b0; if (n >= 0 && n < rows.length) cargo[n].items.push(it) }
  for (const r of s.rivals) { const n = Math.floor(r.z) - b0; if (n >= 0 && n < rows.length && r.z >= s.z) cargo[n].cars.push({ kind: r.kind, traffic: false, look: 0, z: r.z, x: r.x, speed: r.speed, turn: turnOf(r.lane, r.x, segmentOf(s.track, r.z).curve) }) }
  for (const t of s.traffic) { const n = Math.floor(t.z) - b0; if (n >= 0 && n < rows.length && t.z >= s.z) cargo[n].cars.push({ kind: t.kind, traffic: true, z: t.z, x: t.x, speed: t.speed, look: t.look, turn: turnOf(t.lane, t.x, segmentOf(s.track, t.z).curve) }) }
  const lit = tier >= 0.55
  const night = tier >= 1.4
  // furthest first: the rock and the tunnel, the barriers, what lies on the road, what stands by it, the gantries, the cars
  for (let n = rows.length - 1; n >= 0; n -= 1) {
    const p = rows[n]
    if (p.clip <= 0 || p.behind) continue
    const { i, a, b, seg: g, clip, fog } = p
    const band = Math.floor(i / 3) & 1
    if (g.zone === 'tunnel') {
      tunnelPiece(board, a, b, i, clip, tier, fog)
    } else {
      if (g.zone === 'cliff') cliffPiece(board, a, b, 1, band, clip, tier, fog)
      const fence = g.zone === 'promenade' || g.zone === 'causeway' ? blocks : rail
      fence(board, a, b, -1, i, clip, tier, fog)
      if (g.zone !== 'cliff') fence(board, a, b, 1, i, clip, tier, fog)
      if (seg(i + 1).zone === 'tunnel' && i >= 0) tunnelMouth(board, b, clip, tier, fog)
    }
    // a shop along the promenade: its front going by, its side at its near end, what stands on its roof, its lights after dark
    if (g.shop && g.zone === 'promenade') shopPiece(board, p, g.shop, i, lit, tier)
    for (const it of cargo[n].items) {
      const at = place(p, it.z, it.x)
      if (it.kind === 'puddle') puddle(board, at.x, at.y, at.u, clip, tier, fog)
      else if (it.kind === 'cone') cone(board, at.x, at.y, at.u, clip, tier, fog)
      else if (it.kind === 'coin') coin(board, at.x, at.y, at.u, clip, frame, it.z)
      else if (it.kind === 'time') stopwatch(board, at.x, at.y, at.u, clip, frame)
      else bottle(board, at.x, at.y, at.u, clip, frame)
    }
    for (const thing of g.things) {
      const cx = a.x + thing.x * a.u
      if (thing.kind === 'chevron') chevron(board, cx, a.y, a.u, thing.flip, clip, tier, fog)
      else if (thing.kind === 'bush') shrub(board, cx, a.y, a.u, thing.flip, clip, tier, fog)
      else if (thing.kind === 'lamp') { if (lit && fog < 12) lampPool(board, a.x + thing.x * 0.8 * a.u, a.y, a.u, clip); lamp(board, cx, a.y, a.u, thing.flip ? -1 : 1, clip, tier, fog, lit) }
      else if (thing.kind === 'palm') {
        const pic = racingArt('palm')
        if (!pic) continue
        const h = PALM_HIGH * a.u, w = (pic.width * h) / pic.height
        if (h < 3) continue
        const { rgb, by } = tintFor(tier, fog)
        // the crowns move in the wind, more in the storm
        const sway = Math.sin(frame * 0.035 + i * 0.7) * h * (tier >= 3 ? 0.07 : 0.025)
        drawArt(board, pic, cx - w / 2, a.y - h, w, h, clip, thing.flip, rgb, by, sway)
      } else lively(board, thing.kind, thing.look, i, cx, a.y, a.u, thing.flip, clip, tier, fog, frame, lit)
    }
    if (i === START_LINE) gantry(board, a, clip, 'start', s.phase === 'start' ? Math.floor(s.phaseTimer / 60) : 3, accent, tier, fog)
    if (s.checks.includes(i)) gantry(board, a, clip, 'check', 0, accent, tier, fog)
    if (i === s.finish) gantry(board, a, clip, 'finish', 0, accent, tier, fog)
    for (const c of cargo[n].cars.sort((m, k) => k.z - m.z)) {
      const at = place(p, c.z, c.x)
      const bob = c.speed > 0.05 && ((frame + Math.round(c.z)) >> 2) % 2 ? 1 : 0
      if (c.traffic) drawTraffic(board, c.kind as RacingTrafficModel, c.look, at.x, at.y - bob, RACING_CAR_WIDTH * at.u, { turn: c.turn, clip, tier, fog, lights: night })
      else drawCar(board, c.kind as RacingCarKind, at.x, at.y - bob, RACING_CAR_WIDTH * at.u, { turn: c.turn, clip, tier, fog, lights: night })
    }
  }
  // the player's car: turning as it steers, bouncing at speed, shaken by a knock; its lights on the road after dark
  const width = RACING_CAR_WIDTH * v.half
  const shake = s.knock > 0 ? ((s.knock >> 1) % 2 ? 2 : -2) : 0
  const bob = s.speed > 0.05 && (frame >> 2) % 2 ? 1 : 0
  const cx = W / 2 + shake
  if (night) glow(board, cx, v.foot - width * 0.95, width * 1.3, '#fff6d8', 0.13, v.foot - width * 0.35, 0.22)
  drawCar(board, s.car, cx, v.foot - bob, width, { turn: s.steer, tier: tier === 3 ? 2 : tier, fog: 0, lights: night })
  if (s.turbo > 0) for (const side of [-1, 1]) flames(board, cx + side * width * 0.28, v.foot - 6, width * 0.14, frame + side)
  else if (s.offroad && s.speed > 0.05) {
    const color = here === 'beach' && s.x < 0 ? '#f0c09a' : '#3a7a4a'
    puff(board, cx - width * 0.42, v.foot - 4, -1, frame, 0, color, 0.7)
    puff(board, cx + width * 0.42, v.foot - 4, 1, frame, 2, color, 0.7)
  } else if (s.speed < 0.35 && s.phase !== 'over') {
    puff(board, cx - width * 0.28, v.foot - 6, -1, frame >> 1, 0)
    puff(board, cx + width * 0.28, v.foot - 6, 1, frame >> 1, 2)
  }
  if (s.skid > 0) for (const side of [-1, 1]) glow(board, cx + side * width * 0.4, v.foot - 2, width * 0.18, '#c81a1a', 0.5)
  // a car just behind, nearer the eye than the player's
  for (const r of s.rivals) if (r.z < s.z && r.z > camZ + 2) { const n = Math.floor(r.z) - b0, p = rows[n]; if (p) { const at = place(p, r.z, r.x); drawCar(board, r.kind, at.x, at.y, RACING_CAR_WIDTH * at.u, { turn: turnOf(r.lane, r.x, 0), tier, fog: 0, lights: night }) } }
  if (tier === 3) storm(board, frame, horizon)
  // the speed, in a corner
  const kmh = String(racingKmh(s.speed)).padStart(3, ' ')
  const ky = H - 26
  drawText7(board, kmh, 11, ky + 1, INK, 2, true)
  drawText7(board, kmh, 10, ky, s.turbo > 0 ? '#ffd02a' : CREAM, 2, true)
  drawText(board, 'KM/H', 10 + text7Width(kmh, 2, true) + 4, ky + 8, CREAM)
}

/**
 * What brings the coast to life, where it stands: the public, waving; the
 * promenade's buildings, lit after dark; the parasols and the lifeguard
 * towers; out at sea the boats bobbing, the jet skis coming and going, a
 * dolphin leaping now and then, the lighthouse and its beam after dark.
 */
function lively(board: PixelBuffer, kind: 'crowd' | 'lamp' | 'chevron' | 'bush' | RacingProp, look: number, i: number, cx: number, y: number, u: number, flip: boolean, clip: number, tier: Tier, fog: number, frame: number, lit: boolean): void {
  const { rgb, by } = tintFor(tier, fog)
  if (kind === 'crowd') {
    const pic = crowdPicture(look, ((frame >> 4) + look) & 1 ? 1 : 0)
    const h = 0.72 * u, w = (pic.width * h) / pic.height
    if (h >= 3) drawArt(board, pic, cx - w / 2, y - h, w, h, clip, flip, rgb, by * 0.85)
    return
  }
  if (kind === 'lamp' || kind === 'chevron' || kind === 'bush') return
  const pic = propPicture(kind, look)
  let h = PROP_HIGH[kind] * u, x = cx, foot = y
  if (h < 2) return
  // the sea moves them: a bob, a jet ski's runs back and forth, a dolphin's leap
  if (kind === 'sailboat' || kind === 'yacht' || kind === 'buoy' || kind === 'windsurf') foot += Math.sin(frame * 0.06 + i) * 0.03 * u
  if (kind === 'jetski') x += Math.sin(frame * 0.012 + i) * 1.6 * u
  if (kind === 'dolphin') {
    const t = ((frame + i * 37) % 200) / 40
    if (t > 1) return
    foot -= Math.sin(t * Math.PI) * 0.6 * u
    h *= 0.9
  }
  const w = (pic.width * h) / pic.height
  drawArt(board, pic, x - w / 2, foot - h, w, h, clip, kind === 'jetski' ? Math.cos(frame * 0.012 + i) < 0 : flip, rgb, by)
  if (kind === 'jetski') glow(board, x + (Math.cos(frame * 0.012 + i) < 0 ? 1 : -1) * w * 0.7, foot - 1, w * 0.5, '#f2fbff', 0.45, clip, 0.25)
  if (kind === 'lighthouse' && lit) { glow(board, x, foot - h * 0.93, h * 0.25, '#fff2b0', 0.7, clip); const beam = Math.sin(frame * 0.05); glow(board, x + beam * h * 0.9, foot - h * 0.93, h * 0.5, '#fff2b0', 0.25, clip, 0.18) }
}

/** Where a shop's front stands, out from the road's middle, and how far back it goes. */
const SHOP_FRONT = 2.25, SHOP_DEPTH = 1.9

/**
 * The part of a shop on stretch `i`: its front from this stretch's near end
 * to its far end — the picture's left at the shop's far end, as it reads
 * from the road — the shop's side if this is its near end, what stands on
 * its roof and its lights where they are along it.
 */
function shopPiece(board: PixelBuffer, p: Projected, at: RacingShop, i: number, lit: boolean, tier: Tier): void {
  const s = shop(SHOPS[at.kind % SHOPS.length], lit), { front } = s
  const high = front.height * TOWN_UNIT, fog = p.fog, tint = tintFor(tier, fog), soft = lit ? { rgb: tint.rgb, by: tint.by * 0.55 } : tint
  const along = (col: number) => at.start + (1 - col / front.width) * at.len
  facadePiece(board, p.a, p.b, SHOP_FRONT, high, p.clip, front, (1 - (i - at.start) / at.len) * front.width, (1 - (i + 1 - at.start) / at.len) * front.width, soft)
  if (i === at.start) shopSide(board, p.a, SHOP_FRONT, SHOP_DEPTH, high, p.clip, s.wall, s.floors, lit, tint)
  if (s.top) {
    const z = along(s.top.x0 + s.top.pic.width / 2)
    if (Math.floor(z) === i) {
      const foot = place(p, z, SHOP_FRONT + SHOP_DEPTH * 0.3), roof = foot.y - high * foot.u
      const h = s.top.pic.height * TOWN_UNIT * foot.u, w = s.top.pic.width * TOWN_UNIT * foot.u
      if (h >= 2) drawArt(board, s.top.pic, foot.x - w / 2, roof - h, w, h, p.clip, false, soft.rgb, soft.by)
      if (lit && fog < 13) for (const g of s.top.glows) glow(board, foot.x - w / 2 + g.x * TOWN_UNIT * foot.u, roof - h + g.y * TOWN_UNIT * foot.u, Math.max(2, g.r * TOWN_UNIT * foot.u), g.colour, 0.35, p.clip)
    }
  }
  if (lit && fog < 13) for (const g of s.frontGlows) {
    const z = along(g.x)
    if (Math.floor(z) !== i) continue
    const foot = place(p, z, SHOP_FRONT)
    glow(board, foot.x, foot.y - (front.height - g.y) * TOWN_UNIT * foot.u, Math.max(2, g.r * TOWN_UNIT * foot.u), g.colour, 0.3, p.clip)
  }
}

/** The sky's own life over the far view: gulls crossing, flapping; now and then the little plane pulling its banner, RANDOM on it. */
function sky(board: PixelBuffer, frame: number, horizon: number, tier: Tier, accent: string): void {
  const W = board.width, ink = tier >= 1.4 ? '#c8c8d8' : '#3a2a3a'
  for (let k = 0; k < 4; k += 1) {
    const x = W + 30 - ((frame * (0.35 + k * 0.08) + k * 131) % (W + 60)), y = Math.round(18 + k * 13 + Math.sin(frame * 0.02 + k) * 5)
    if (y < horizon - 10) board.blit(GULL[((frame >> 3) + k) & 1], Math.round(x), y, { k: ink })
  }
  const pass = frame % 2400
  if (pass < 900 && tier < 1.4) {
    const x = W + 20 - pass * ((W + 260) / 900), y = 26
    board.blit(PLANE, Math.round(x), y, PLANE_PALETTE)
    board.line(Math.round(x + 13), y + 2, Math.round(x + 22), y + 3, '#5a4a5a')
    const word = 'RANDOM', bw = text7Width(word, 1, true) + 8, bx = Math.round(x + 22), wave = (frame >> 2) % 2
    board.rect(bx, y - 2 + wave, bw, 11, '#faf6ec')
    drawText7(board, word, bx + 4, y + wave, accent, 1, true)
  }
}

/** Where a point of the road at `z`, `x` stands on the screen, inside its stretch. */
function place(p: Projected, z: number, x: number): { x: number; y: number; u: number } {
  const t = Math.max(0, Math.min(1, z - Math.floor(z)))
  const u = p.a.u + (p.b.u - p.a.u) * t
  return { x: p.a.x + (p.b.x - p.a.x) * t + x * u, y: p.a.y + (p.b.y - p.a.y) * t, u }
}

/** The storm: rain slanting across, now and then lightning lighting everything up, its bolt over the sea. */
function storm(board: PixelBuffer, frame: number, horizon: number): void {
  const W = board.width, H = board.height, d = board.data
  const flash = frame % 431 < 4 || frame % 677 < 3
  if (flash) {
    for (let i = 0; i < d.length; i += 4) { d[i] += (220 - d[i]) * 0.45; d[i + 1] += (226 - d[i + 1]) * 0.45; d[i + 2] += (255 - d[i + 2]) * 0.45 }
    let bx = 60 + ((frame * 37) % (W - 120)), by = 0
    while (by < horizon - 20) { const nx = bx + (((by * 13 + frame) % 7) - 3) * 3; board.line(bx, by, nx, by + 8, '#ffffff'); bx = nx; by += 8 }
  }
  for (let k = 0; k < 110; k += 1) {
    const x = Math.floor((((k * 7919) % 997) / 997) * W + frame * 2.5) % W, y = Math.floor((((k * 104729) % 991) / 991) * H + frame * 11) % H
    for (let j = 0; j < 7; j += 1) { const px = x - (j >> 1), py = y + j; if (px >= 0 && py < H) { const o = (py * W + px) * 4; d[o] += (190 - d[o]) * 0.4; d[o + 1] += (200 - d[o + 1]) * 0.4; d[o + 2] += (230 - d[o + 2]) * 0.4 } }
  }
}

/** The words over the board: the level and the lights at the start, GO!, a checkpoint, the stopwatch or the turbo just taken, GOAL! and its points, TIME UP. */
function words(out: PixelBuffer, s: RacingState, accent: string, W: number, H: number): void {
  const top = HUD_HEIGHT, mid = top + Math.round(H * 0.36)
  if (s.phase === 'start') {
    arcadeText(out, `LEVEL ${String(s.level).padStart(2, '0')}`, W / 2, top + 12, 3, accent)
    if (s.phaseTimer >= 20) said(out, String(3 - Math.floor(s.phaseTimer / 60)), W / 2, top + 46, CREAM, 5)
    return
  }
  if (s.phase === 'play' && s.phaseTimer < 50 && s.z < 60) said(out, 'GO!', W / 2, top + 46, '#3aff6a', 5)
  else if (s.phase === 'goal') {
    arcadeText(out, 'GOAL!', W / 2, mid - 6, 4, accent)
    if (s.phaseTimer > 30 && s.bonus) said(out, `${ordinal(s.bonus.rank)} PLACE +${s.bonus.place}`, W / 2, mid + 36, s.bonus.rank === 1 ? '#ffd23f' : CREAM, 2)
    if (s.phaseTimer > 70 && s.bonus) said(out, `TIME +${s.bonus.time}`, W / 2, mid + 56, CREAM, 2)
    return
  } else if (s.phase === 'timeup' || s.phase === 'over') { arcadeText(out, 'TIME UP', W / 2, mid, 4, '#ff5a4a'); return }
  if (s.news && (s.news.steps > 20 || (s.news.steps >> 2) % 2 === 0)) said(out, s.news.text, W / 2, top + 40, s.news.text.startsWith('CHECK') ? '#3aff6a' : '#ffd23f', W >= 400 ? 3 : 2)
  // the turbo: the bottle and what is left of it, under the bar
  if (s.turbo > 0) {
    out.blit(MUSTARD, 10, top + 6, BONUS_PALETTE, { scale: 2 })
    out.rect(28, top + 14, 40, 4, '#2a2a3a')
    out.rect(28, top + 14, Math.max(1, Math.round((40 * s.turbo) / 240)), 4, '#ffd02a')
  }
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
