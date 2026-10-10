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
import { racingArt, type RacingArtName, type RacingCarKind } from './racing-art'
import { crowdPicture, GULL, PLANE, PLANE_PALETTE, PROP_HIGH, propPicture } from './racing-props'
import {
  createRacing, heightAt, RACING_BEND, RACING_CAR_SPIN_STEPS, RACING_CAR_WIDTH, RACING_CRASH_STEPS, RACING_LAST_LEVEL, RACING_SEGMENT, RACING_START_STEPS,
  FORK_NAME, racingHour, racingKmh, racingSunset, RACING_STATS, segmentOf, STAT_MAX, stepRacing, type RacingItem, type RacingLayout, type RacingSegment, type RacingShop, type RacingStat, type RacingState, type RacingThing, type RacingTrafficModel, type RacingWorld, type RacingZone,
} from './racing-rules'
import {
  blocks, bottle, chevron, coastRock, coin, cone, drawArt, drawCar, drawTraffic, farGround, flames, fogStep, gantry, globeLamp, glow, groundRow, lamp, lampPool, sceneWorld, skyAt,
  facadePiece, puddle, puff, rail, shopSide, shrub, stopwatch, tintFor, trafficLights, tunnelMouth, tunnelPiece, type End, type Tier,
} from './racing-scene'
import { fountainPicture, redRock, SCENERY_HIGH, shrubPicture, treePicture, tumbleweedPicture } from './racing-scenery'
import { carSide, CAR_SPAN } from './racing-sides'
import { shop, SHOPS, TOWN_UNIT } from './racing-town'
import { TRAFFIC_WIDTH, trafficHigh } from './racing-traffic'
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

/** The traced pictures each world needs. */
const WORLD_ART: Record<RacingWorld, RacingArtName[]> = { coast: ['playBack', 'palm', 'face-mountain'], mountain: ['far-mountain', 'pine', 'rock', 'face-mountain'], desert: ['far-desert', 'saguaro', 'butte', 'rock', 'face-desert'], city: ['far-city', 'palm'] }

/** What runs along each side of each kind of road, left and right: the metal rail, the coast's concrete blocks, or nothing (the streets, the rock). */
const FENCES: Record<RacingZone, [typeof rail | null, typeof rail | null]> = {
  beach: [rail, rail], promenade: [blocks, blocks], causeway: [blocks, blocks], cliff: [rail, null], tunnel: [null, null],
  forest: [rail, rail], village: [null, null], lake: [rail, rail], gorge: [rail, null],
  dunes: [rail, rail], town: [null, null], canyon: [null, null], mesa: [rail, null],
  avenue: [null, null], downtown: [null, null], park: [null, null], bridge: [rail, rail],
}
/** What flies off the wheels off the road, by the kind of ground. */
const dustOf = (zone: RacingZone, x: number): string =>
  zone === 'beach' ? (x < 0 ? '#f0c09a' : '#3a7a4a') : zone === 'dunes' || zone === 'town' || zone === 'canyon' || zone === 'mesa' ? '#f0c08a'
    : zone === 'avenue' || zone === 'downtown' || zone === 'bridge' || zone === 'village' || zone === 'promenade' ? '#b8b4c8' : zone === 'lake' && x < 0 ? '#c8c0b0' : '#3a7a4a'

/** A stretch on the screen: its near and far ends (middle, row, pixels to a half width), the row under which nearer ground hides it, its haze. */
type Projected = { i: number; seg: RacingSegment; a: End; b: End; clip: number; behind: boolean; fog: number; zNear: number }

// ---------------------------------------------------------------- the controls

/** The controls under (or beside) the board on a touch screen: the arrows left and right, A (gas), B (brake) and T (the turbo). */
export type RacingPad = { zone: Hit; left: Hit; right: Hit; gas: { cx: number; cy: number; r: number }; brake: { cx: number; cy: number; r: number }; nitro: { cx: number; cy: number; r: number } }
export function racingPadGeometry(layout: Layout, pad: Pad): RacingPad | null {
  if (pad === 'none') return null
  const { width, height } = playSize(layout, pad)
  const board = RACING_BOARD[layout]
  if (pad === 'side') {
    const x = board.width, a = 56, r = 30
    return { zone: { x, y: HUD_HEIGHT, w: width - x, h: height - HUD_HEIGHT }, left: { x: x + 14, y: height - 24 - a, w: a, h: a }, right: { x: x + 24 + a, y: height - 24 - a, w: a, h: a }, gas: { cx: x + (width - x) / 2 + 30, cy: HUD_HEIGHT + 70, r }, brake: { cx: x + (width - x) / 2 - 30, cy: HUD_HEIGHT + 150, r }, nitro: { cx: x + (width - x) / 2 + 30, cy: HUD_HEIGHT + 150, r: 22 } }
  }
  const y = HUD_HEIGHT + board.height, h = height - y
  const left = { x: 14, y: y + (h - (pad === 'big' ? 68 : 60)) / 2, w: pad === 'big' ? 68 : 60, h: pad === 'big' ? 68 : 60 }
  const right = { ...left, x: left.x + left.w + 10 }
  // B a little lower and further in, A further out and higher, as a thumb rests; in the tall band, one over the other's shoulder
  if (pad === 'big') {
    const r = 34, gas = { cx: width - 16 - r, cy: y + h * 0.33, r }, brake = { cx: gas.cx - r * 2 - 4, cy: y + h * 0.68, r }
    return { zone: { x: 0, y, w: width, h }, left, right, gas, brake, nitro: { cx: brake.cx - 8, cy: y + h * 0.22, r: 22 } }
  }
  const r = 27
  return { zone: { x: 0, y, w: width, h }, left, right, gas: { cx: width - 14 - r, cy: y + h / 2 - r * 0.35, r }, brake: { cx: width - 14 - r * 3.3, cy: y + h / 2 + r * 0.35, r }, nitro: { cx: right.x + right.w + 22 + 2, cy: y + h / 2 - 4, r: 20 } }
}
/** Which control a finger at (`x`, `y`) means: anywhere in their band counts, the nearest wins. */
export function racingPadPart(x: number, y: number, pad: RacingPad): 'left' | 'right' | 'gas' | 'brake' | 'nitro' | null {
  const { zone } = pad
  if (x < zone.x || y < zone.y || x >= zone.x + zone.w || y >= zone.y + zone.h) return null
  const d = (cx: number, cy: number) => Math.hypot(x - cx, y - cy)
  const parts: Array<['left' | 'right' | 'gas' | 'brake' | 'nitro', number]> = [
    ['left', d(pad.left.x + pad.left.w / 2, pad.left.y + pad.left.h / 2)],
    ['right', d(pad.right.x + pad.right.w / 2, pad.right.y + pad.right.h / 2)],
    ['gas', d(pad.gas.cx, pad.gas.cy) - pad.gas.r * 0.3],
    ['brake', d(pad.brake.cx, pad.brake.cy) - pad.brake.r * 0.3],
    ['nitro', d(pad.nitro.cx, pad.nitro.cy) - pad.nitro.r * 0.3],
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
/** The controls, the ones held pressed down; T, the turbo, lit as far as its gauge is full, dull below what lets it go. */
function drawPad(buffer: PixelBuffer, pad: RacingPad, accent: string, pressed: RacingView['pressed'] = {}, boost = 0): void {
  arrowButton(buffer, pad.left, -1, !!pressed.left, accent)
  arrowButton(buffer, pad.right, 1, !!pressed.right, accent)
  roundButton(buffer, pad.brake, 'B', '#3a7aff', !!pressed.brake)
  roundButton(buffer, pad.gas, 'A', '#2ac05a', !!pressed.gas)
  const n = pad.nitro, ready = boost >= 0.3
  roundButton(buffer, n, 'T', ready ? '#ffb020' : '#6a5a3a', !!pressed.nitro)
  // the gauge round it, filling clockwise from the top
  for (let k = 0; k < 48; k += 1) {
    if (k / 48 > boost) break
    const a = -Math.PI / 2 + (k / 48) * Math.PI * 2
    buffer.disc(n.cx + Math.cos(a) * (n.r + 4), n.cy + Math.sin(a) * (n.r + 4), 1.6, boost >= 1 ? '#fff3a0' : '#ffd02a')
  }
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
export type RacingView = { pause?: 0 | 1 | null; pad?: Pad; resumeOnly?: boolean; pressed?: { left?: boolean; right?: boolean; gas?: boolean; brake?: boolean; nitro?: boolean } }

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
  if (controls) controlsOn(out, layout, pad, controls, accent, view.pressed ?? {}, W, H, s.boost)
  racingHud(out, accent, s)
  words(out, s, accent, W, H)
  if (s.phase === 'won' && s.single) playCard(out, layout, accent, 'LEVEL CLEAR', [])
  else if (view.pause != null) playCard(out, layout, accent, 'PAUSED', view.resumeOnly ? ['RESUME'] : ['RESUME', 'QUIT'], view.resumeOnly ? 0 : view.pause)
  return out
}

/** The controls' band as last drawn, kept while no button changes. */
const bands = new Map<string, { key: string; rows: Array<[number, Uint8ClampedArray]> }>()
/** The controls' band: cleared to ink and the buttons drawn, or as kept from before. */
function controlsOn(out: PixelBuffer, layout: Layout, pad: Pad, controls: RacingPad, accent: string, pressed: NonNullable<RacingView['pressed']>, W: number, H: number, boost: number): void {
  const area = out.width > W ? { x: W, y: HUD_HEIGHT, w: out.width - W, h: out.height - HUD_HEIGHT } : { x: 0, y: HUD_HEIGHT + H, w: out.width, h: out.height - HUD_HEIGHT - H }
  const gauge = Math.floor(boost * 24) / 24
  const key = `${accent}|${pressed.left ? 1 : 0}${pressed.right ? 1 : 0}${pressed.gas ? 1 : 0}${pressed.brake ? 1 : 0}${pressed.nitro ? 1 : 0}|${gauge}`, where = `${layout}|${pad}`
  const kept = bands.get(where)
  if (kept && kept.key === key) { for (const [o, row] of kept.rows) out.data.set(row, o); return }
  inkOver(out, area.x, area.y, area.w, area.h)
  drawPad(out, controls, accent, pressed, gauge)
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
function farView(board: PixelBuffer, tier: Tier, sinking: number, horizon: number, slide: number, world: RacingWorld): void {
  const back = skyAt(tier, sinking), W = board.width, d = board.data
  const rows = Math.max(0, Math.min(horizon, board.height))
  if (!back) { for (let y = 0; y < rows; y += 1) board.rect(0, y, W, 1, mix('#1a0a34', '#ff7a5a', (y / horizon) ** 1.5)); return }
  const bw = back.width, top = horizon - back.height
  const shift = Math.round((W - bw) / 2 + slide)
  const key = `${world}|${Math.round(tier * 8)}|${Math.round(sinking * 60)}|${shift}|${horizon}`, kept = skies.get(W)
  if (kept && kept.key === key) { d.set(kept.data.subarray(0, rows * W * 4)); return }
  const s = back.data, s0 = s
  const column = new Int32Array(W)
  for (let x = 0; x < W; x += 1) { let u = (x - shift) % (bw * 2); if (u < 0) u += bw * 2; column[x] = u < bw ? u : bw * 2 - 1 - u }
  // the sky carried up: the coast's deep violet, the others' own sky deeper
  let [fr, fg, fb] = rgbOf(tier >= 2 ? '#05050f' : '#1a0a34')
  if (world !== 'coast') { let r = 0, g = 0, b = 0; for (let x = 0; x < bw; x += 1) { r += s0[x * 4]; g += s0[x * 4 + 1]; b += s0[x * 4 + 2] } fr = (r / bw) * 0.62; fg = (g / bw) * 0.62; fb = (b / bw) * 0.7 }
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
type Cargo = { items: RacingItem[]; cars: Array<{ kind: RacingCarKind | RacingTrafficModel; traffic: boolean; z: number; x: number; turn: -1 | 0 | 1; look: number; speed: number; boost?: boolean; pose: number }> }

/** Which way a car turns on the screen: toward the lane it is heading for, else with a sharp bend. */
const turnOf = (lane: number, x: number, curve: number): -1 | 0 | 1 => (Math.abs(lane - x) > 0.04 ? (lane > x ? 1 : -1) : Math.abs(curve) > 2.5 ? (curve > 0 ? 1 : -1) : 0)

/** The race on the board: the far view, the road and what stands by it and lies on it, the cars, the player's car, the weather. */
function drawRace(board: PixelBuffer, s: RacingState, v: { horizon: number; foot: number; half: number }, K: number, accent: string): void {
  const W = board.width, H = board.height, d = board.data, frame = s.steps
  // the hour as the race goes on: the sun sinking, the dusk, the night; the storm
  const world = s.world
  sceneWorld(world)
  // the next level's world's pictures asked for now, so they are in when it comes
  const next = s.worlds[Math.min(s.worlds.length - 1, s.level)]
  for (const name of WORLD_ART[next]) racingArt(name)
  const tier: Tier = racingHour(s.level, s.z / Math.max(1, s.finish)), sinking = world === 'coast' ? racingSunset(tier) : 0
  const camH = (v.foot - v.horizon) / v.half
  const back = (K / v.half) / RACING_SEGMENT
  const camZ = s.z - back
  const camY = heightAt(s.track, Math.max(0, s.z)) + camH
  // the eye follows the road's slope a little: up a hill the horizon sinks, down one it rises
  const slope = (heightAt(s.track, s.z + 8) - heightAt(s.track, Math.max(0, s.z - 2))) / (10 * RACING_SEGMENT)
  const horizon = Math.round(v.horizon + Math.max(-34, Math.min(34, slope * K * 0.3)))
  const here = segmentOf(s.track, Math.max(0, s.z)).zone
  // the stretches ahead, nearest first: each drawn only where nearer ground has not been
  const b0 = Math.floor(camZ)
  const flat = FLAT.zone === s.track[0].zone ? FLAT : { ...FLAT, zone: s.track[0].zone }
  const seg = (i: number) => (i < 0 ? flat : segmentOf(s.track, i))
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
    // past the fork, the road not taken going away on its side
    const gone = s.fork && s.forkPick >= 0 && i >= s.fork.at && i < s.fork.at + GHOST_LEN ? (s.forkPick === 0 ? 1 : -1) * (2.3 + ((i - s.fork.at) / GHOST_LEN) ** 1.8 * 5) : 0
    pending.push(() => { for (let y = top; y < bottom; y += 1) { const t = (y + 0.5 - b.y) / (a.y - b.y); groundRow(d, W, y, { c: b.x + (a.x - b.x) * t, h: b.u + (a.u - b.u) * t, band, zone: g.zone, fog: p.fog, wave, land: true, ghost: gone }, tier, frame) } })
    maxY = Math.min(maxY, top)
    farX = b.x; farZone = g.zone
  }
  // under the horizon where no road reaches: the sea, the land on the land's side of the road's far end
  // the far view stands on the horizon — or, up a hill, on its crest: the landscape always behind the road's top, never sky alone
  const backdrop = Math.max(8, Math.min(horizon, maxY + 2))
  farView(board, tier, sinking, backdrop, -s.view, world)
  sky(board, frame, backdrop, tier, accent, world)
  farGround(d, W, Math.max(0, horizon), Math.max(0, Math.min(H, maxY)), Math.round(farX + 6), farZone, tier, frame)
  for (const draw of pending) draw()
  // in the tunnel, its dark
  if (here === 'tunnel') for (let i = 0; i < d.length; i += 4) { d[i] *= 0.62; d[i + 1] *= 0.62; d[i + 2] *= 0.66 }
  // what lies on each stretch and the cars on it, ahead of the player
  const cargo: Cargo[] = rows.map(() => ({ items: [], cars: [] }))
  for (const it of s.items) { if (it.taken) continue; const n = Math.floor(it.z) - b0; if (n >= 0 && n < rows.length) cargo[n].items.push(it) }
  for (const r of s.rivals) { const n = Math.floor(r.z) - b0; if (n >= 0 && n < rows.length && r.z >= s.z) cargo[n].cars.push({ kind: r.kind, traffic: false, look: 0, z: r.z, x: r.x, speed: r.speed, boost: r.turbo > 0, turn: turnOf(r.lane, r.x, segmentOf(s.track, r.z).curve), pose: spinPose(r.spin, RACING_CAR_SPIN_STEPS, r.spinWay) }) }
  for (const t of s.traffic) { const n = Math.floor(t.z) - b0; if (n >= 0 && n < rows.length && t.z >= s.z) cargo[n].cars.push({ kind: t.kind, traffic: true, z: t.z, x: t.x, speed: t.speed, look: t.look, turn: turnOf(t.lane, t.x, segmentOf(s.track, t.z).curve), pose: spinPose(t.spin, RACING_CAR_SPIN_STEPS, t.spinWay) }) }
  // the lights on after sunset; in the city, always: it is lit up from the start
  const lit = world === 'city' || tier >= 0.55
  const night = world === 'city' || tier >= 1.4
  // furthest first: the tunnel, the barriers, what lies on the road, what stands by it, the gantries, the cars
  for (let n = rows.length - 1; n >= 0; n -= 1) {
    const p = rows[n]
    if (p.clip <= 0 || p.behind) continue
    const { i, a, b, seg: g, clip, fog } = p
    if (g.zone === 'tunnel') {
      tunnelPiece(board, a, b, i, clip, tier, fog)
    } else {
      // the rails and the blocks
      const [left, right] = FENCES[g.zone]
      if (left) left(board, a, b, -1, i, clip, tier, fog)
      if (right) right(board, a, b, 1, i, clip, tier, fog)
      if (seg(i + 1).zone === 'tunnel' && i >= 0) tunnelMouth(board, b, clip, tier, fog)
    }
    // the shops along the road: their fronts going by, their sides at their near ends, what stands on their roofs, their lights after dark
    if (g.shop) shopPiece(board, p, g.shop, i, lit, tier, 1)
    if (g.shopL) shopPiece(board, p, g.shopL, i, lit, tier, -1)
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
      } else if (thing.kind === 'globe') { if (fog < 9) lampPool(board, a.x + thing.x * 0.8 * a.u, a.y, a.u, clip); globeLamp(board, cx, a.y, a.u, clip, tier, fog, lit && fog < 13) }
      else if (thing.kind === 'lights') trafficLights(board, a, clip, tier, fog, frame, thing.look)
      else if (thing.kind === 'pine' || thing.kind === 'saguaro' || thing.kind === 'butte' || thing.kind === 'rock' || thing.kind === 'redrock' || thing.kind === 'crag' || thing.kind === 'shrub' || thing.kind === 'tree' || thing.kind === 'fountain' || thing.kind === 'tumbleweed') scenery(board, thing, i, a, clip, tier, fog, frame, lit)
      else lively(board, thing.kind, thing.look, i, cx, a.y, a.u, thing.flip, clip, tier, fog, frame, lit)
    }
    // the fork in the middle of the level: the same barrier up to it while the car decides, the gantry with what each road offers
    if (s.fork && s.forkPick < 0 && i >= s.fork.at - 90 && i < s.fork.at) median(board, a, b, i, clip, tier, fog)
    if (s.fork && s.forkPick < 0 && i === s.fork.at - 70) forkGantry(board, a, clip, s.fork.kinds.map((k) => FORK_SIGN[k]) as [Sign, Sign], tier, fog)
    if (i === START_LINE) gantry(board, a, clip, 'start', s.phase === 'start' ? Math.floor(s.phaseTimer / 60) : 3, accent, tier, fog)
    if (s.checks.includes(i)) gantry(board, a, clip, 'check', 0, accent, tier, fog)
    if (i === s.finish) gantry(board, a, clip, 'finish', 0, accent, tier, fog)
    for (const c of cargo[n].cars.sort((m, k) => k.z - m.z)) {
      const at = place(p, c.z, c.x)
      const bob = c.speed > 0.05 && ((frame + Math.round(c.z)) >> 2) % 2 ? 1 : 0
      // a car spinning after a crash, in its smoke
      if (c.pose) { posed(board, c, at.x, at.y, RACING_CAR_WIDTH * at.u, c.pose, frame, { clip, tier, fog, lights: night }); continue }
      // its flank, when it shows
      flank(board, rows, b0, c, at, at.y - bob, tier, fog, clip)
      if (c.traffic) drawTraffic(board, c.kind as RacingTrafficModel, c.look, at.x, at.y - bob, RACING_CAR_WIDTH * at.u, { turn: c.turn, clip, tier, fog, lights: night })
      else {
        drawCar(board, c.kind as RacingCarKind, at.x, at.y - bob, RACING_CAR_WIDTH * at.u, { turn: c.turn, clip, tier, fog, lights: night })
        // a rival's own turbo: flames out of its exhausts
        const w = RACING_CAR_WIDTH * at.u
        if (c.boost && w > 6 && at.y < clip) for (const side of [-1, 1]) flames(board, at.x + side * w * 0.28, at.y - bob - 3, w * 0.14, frame + side)
      }
    }
  }
  // the player's car: turning as it steers, bouncing at speed, shaken by a knock; its lights on the road after dark
  const width = RACING_CAR_WIDTH * v.half
  const shake = s.knock > 0 ? ((s.knock >> 1) % 2 ? 2 : -2) : 0
  const bob = s.speed > 0.05 && (frame >> 2) % 2 ? 1 : 0
  const cx = W / 2 + shake
  if (night) glow(board, cx, v.foot - width * 0.95, width * 1.3, '#fff6d8', 0.13, v.foot - width * 0.35, 0.22)
  if (s.crash > 0) posed(board, { kind: s.car, traffic: false, look: 0 }, cx, v.foot, width, spinPose(s.crash, RACING_CRASH_STEPS, s.crashWay), frame, { tier: tier === 3 ? 2 : tier, fog: 0, lights: night })
  else drawCar(board, s.car, cx, v.foot - bob, width, { turn: s.steer, tier: tier === 3 ? 2 : tier, fog: 0, lights: night })
  // scraping a rail: sparks off the car's side
  if (s.sparks > 0) sparks(board, cx + s.sparkSide * width * 0.5, v.foot - width * 0.12, s.sparkSide, frame, width)
  if (s.crash > 0) { /* its smoke is drawn with it */ } else if (s.turbo > 0) for (const side of [-1, 1]) flames(board, cx + side * width * 0.28, v.foot - 6, width * 0.14, frame + side)
  else if (s.offroad && s.speed > 0.05) {
    const color = dustOf(here, s.x)
    puff(board, cx - width * 0.42, v.foot - 4, -1, frame, 0, color, 0.7)
    puff(board, cx + width * 0.42, v.foot - 4, 1, frame, 2, color, 0.7)
  } else if (s.speed < 0.35 && s.phase !== 'over') {
    puff(board, cx - width * 0.28, v.foot - 6, -1, frame >> 1, 0)
    puff(board, cx + width * 0.28, v.foot - 6, 1, frame >> 1, 2)
  }
  if (s.skid > 0) for (const side of [-1, 1]) glow(board, cx + side * width * 0.4, v.foot - 2, width * 0.18, '#c81a1a', 0.5)
  // the wheels spinning after a start too early: smoke all round them
  if (s.spin > 0) for (let k = 0; k < 3; k += 1) for (const side of [-1, 1]) puff(board, cx + side * width * (0.3 + k * 0.08), v.foot - 4, side, frame + k * 2, k, '#d8d4e0', 0.75)
  // in a car's slipstream: the air rushing past, lines along the sides
  if (s.drafting && s.phase === 'play') slipstream(board, frame, horizon)
  // a rival close behind, out of sight: a mark at the foot of the screen, in its colour, on its side
  for (const r of s.rivals) {
    const behind = s.z - r.z
    if (behind <= 2 || behind > 45 || r.z > camZ + 2) continue
    const tx = W / 2 + (r.x - s.x) * v.half * 0.9, near = 1 - behind / 45, c = RIVAL_COLOUR[r.kind]
    const size = 4 + Math.round(near * 4), ty = H - 3
    if ((frame >> 3) % 2 || near > 0.6) for (let k = 0; k < size; k += 1) board.rect(Math.round(tx - k), ty - size + k, k * 2 + 1, 1, c)
  }
  // a car being passed, its back already behind the player's but still beside it, nearer the eye: its flank, then its back, until it goes out at the foot of the screen
  const passing = [...s.rivals.map((r) => ({ kind: r.kind as RacingCarKind | RacingTrafficModel, traffic: false, z: r.z, x: r.x, look: 0, speed: r.speed, turn: turnOf(r.lane, r.x, 0), pose: spinPose(r.spin, RACING_CAR_SPIN_STEPS, r.spinWay) })), ...s.traffic.map((t) => ({ kind: t.kind as RacingCarKind | RacingTrafficModel, traffic: true, z: t.z, x: t.x, look: t.look, speed: t.speed, turn: turnOf(t.lane, t.x, 0), pose: spinPose(t.spin, RACING_CAR_SPIN_STEPS, t.spinWay) }))]
  for (const c of passing.filter((c) => c.z < s.z && c.z > camZ + 2).sort((m, k) => k.z - m.z)) {
    const p = rows[Math.floor(c.z) - b0]
    if (!p) continue
    const at = place(p, c.z, c.x)
    if (at.y - RACING_CAR_WIDTH * at.u * 0.7 > H) continue
    if (c.pose) { posed(board, c, at.x, at.y, RACING_CAR_WIDTH * at.u, c.pose, frame, { tier, fog: 0, lights: night }); continue }
    flank(board, rows, b0, c, at, at.y, tier, 0, H)
    if (c.traffic) drawTraffic(board, c.kind as RacingTrafficModel, c.look, at.x, at.y, RACING_CAR_WIDTH * at.u, { turn: c.turn, tier, fog: 0, lights: night })
    else drawCar(board, c.kind as RacingCarKind, at.x, at.y, RACING_CAR_WIDTH * at.u, { turn: c.turn, tier, fog: 0, lights: night })
  }
  if (tier === 3) { if (world === 'mountain') snow(board, frame); else if (world === 'desert') sandstorm(board, frame); else storm(board, frame, horizon) }
  if (s.phase !== 'garage') minimap(board, s, accent)
  if (s.goalAt >= 0) celebrate(board, s.steps - s.goalAt, s.level, horizon)
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
function lively(board: PixelBuffer, kind: RacingThing['kind'], look: number, i: number, cx: number, y: number, u: number, flip: boolean, clip: number, tier: Tier, fog: number, frame: number, lit: boolean): void {
  const { rgb, by } = tintFor(tier, fog)
  if (kind === 'crowd') {
    const pic = crowdPicture(look, ((frame >> 4) + look) & 1 ? 1 : 0)
    const h = 0.72 * u, w = (pic.width * h) / pic.height
    if (h >= 3) drawArt(board, pic, cx - w / 2, y - h, w, h, clip, flip, rgb, by * 0.85)
    return
  }
  if (kind !== 'parasol' && kind !== 'tower' && kind !== 'sailboat' && kind !== 'yacht' && kind !== 'jetski' && kind !== 'windsurf' && kind !== 'buoy' && kind !== 'dolphin' && kind !== 'lighthouse') return
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
 * The part of a shop on stretch `i`, on the right (`side` 1) or the left
 * (−1): its front from this stretch's near end to its far end — the
 * picture's left at the shop's far end on the right, at its near end on the
 * left, as it reads from the road — the shop's side if this is its near end,
 * what stands on its roof and its lights where they are along it.
 */
function shopPiece(board: PixelBuffer, p: Projected, at: RacingShop, i: number, lit: boolean, tier: Tier, side: -1 | 1): void {
  const s = shop(SHOPS[at.kind % SHOPS.length], lit), { front } = s
  const high = front.height * TOWN_UNIT, fog = p.fog, tint = tintFor(tier, fog), soft = lit ? { rgb: tint.rgb, by: tint.by * 0.55 } : tint
  const col = (z: number) => (side > 0 ? 1 - (z - at.start) / at.len : (z - at.start) / at.len) * front.width
  const along = (c: number) => at.start + (side > 0 ? 1 - c / front.width : c / front.width) * at.len
  facadePiece(board, p.a, p.b, side * SHOP_FRONT, high, p.clip, front, col(i), col(i + 1), soft)
  if (i === at.start) shopSide(board, p.a, side * SHOP_FRONT, SHOP_DEPTH, high, p.clip, s.wall, s.floors, lit, tint)
  if (s.top) {
    const z = along(s.top.x0 + s.top.pic.width / 2)
    if (Math.floor(z) === i) {
      const foot = place(p, z, side * (SHOP_FRONT + SHOP_DEPTH * 0.3)), roof = foot.y - high * foot.u
      const h = s.top.pic.height * TOWN_UNIT * foot.u, w = s.top.pic.width * TOWN_UNIT * foot.u
      if (h >= 2) drawArt(board, s.top.pic, foot.x - w / 2, roof - h, w, h, p.clip, false, soft.rgb, soft.by)
      if (lit && fog < 13) for (const g of s.top.glows) glow(board, foot.x - w / 2 + g.x * TOWN_UNIT * foot.u, roof - h + g.y * TOWN_UNIT * foot.u, Math.max(2, g.r * TOWN_UNIT * foot.u), g.colour, 0.35, p.clip)
    }
  }
  if (lit && fog < 13) for (const g of s.frontGlows) {
    const z = along(g.x)
    if (Math.floor(z) !== i) continue
    const foot = place(p, z, side * SHOP_FRONT)
    glow(board, foot.x, foot.y - (front.height - g.y) * TOWN_UNIT * foot.u, Math.max(2, g.r * TOWN_UNIT * foot.u), g.colour, 0.3, p.clip)
  }
}

// ---------------------------------------------------------------- the map in the corner

/** Each stretch's place on a flat map of the level (`x`, `y`) and the way the road heads there, the bends turned into turns: worked out once a road. */
const maps = new WeakMap<RacingSegment[], { x: Float32Array; y: Float32Array; h: Float32Array }>()
/** How much a bend of the road turns it on the map, a stretch: a hairpin a good half turn, a long sweeper a wide curve. */
const MAP_TURN = 0.0045
function mapOf(track: RacingSegment[]): { x: Float32Array; y: Float32Array; h: Float32Array } {
  const known = maps.get(track)
  if (known) return known
  const n = track.length + 1, x = new Float32Array(n), y = new Float32Array(n), h = new Float32Array(n)
  for (let i = 0; i < track.length; i += 1) {
    h[i + 1] = h[i] + track[i].curve * MAP_TURN
    x[i + 1] = x[i] + Math.sin(h[i])
    y[i + 1] = y[i] + Math.cos(h[i])
  }
  const out = { x, y, h }
  maps.set(track, out)
  return out
}
/** The stretches the map shows, behind the car and ahead of it. */
const MAP_BEHIND = 120
const MAP_AHEAD = 380

/**
 * The map in the corner: the road around the car — a little behind, a good
 * way ahead, its bends coming — turning as the car does, so ahead is always
 * up; the rivals on it in their colours, the traffic in small grey dots, the
 * checkpoints and the line; a rival out of the map at its edge, an arrow in
 * its colour pointing where it is.
 */
function minimap(board: PixelBuffer, s: RacingState, accent: string): void {
  const W = board.width, H = board.height, size = W >= 400 ? 78 : 66
  const bx = W - size - 6, by = H - size - 6
  board.shade(bx, by, size, size, 0.55)
  board.rect(bx - 1, by - 1, size + 2, 1, dim(accent, 0.6)); board.rect(bx - 1, by + size, size + 2, 1, dim(accent, 0.6))
  board.rect(bx - 1, by, 1, size, dim(accent, 0.6)); board.rect(bx + size, by, 1, size, dim(accent, 0.6))
  const m = mapOf(s.track), last = s.track.length
  const at = (z: number) => {
    const i = Math.max(0, Math.min(last - 1, Math.floor(z))), t = Math.max(0, Math.min(1, z - i))
    return { x: m.x[i] + (m.x[i + 1] - m.x[i]) * t, y: m.y[i] + (m.y[i + 1] - m.y[i]) * t, h: m.h[i] + (m.h[i + 1] - m.h[i]) * t }
  }
  const me = at(Math.max(0, s.z)), cos = Math.cos(me.h), sin = Math.sin(me.h)
  const scale = (size * 0.72) / MAP_AHEAD, cx = bx + size / 2, cy = by + size * 0.78
  /** A place of the road on the map, turned so the car heads up. */
  const onMap = (z: number) => {
    const p = at(z), dx = p.x - me.x, dy = p.y - me.y
    return { x: cx + (dx * cos - dy * sin) * scale, y: cy - (dx * sin + dy * cos) * scale }
  }
  const inside = (p: { x: number; y: number }, r: number) => p.x >= bx + r && p.y >= by + r && p.x < bx + size - r && p.y < by + size - r
  const dot = (p: { x: number; y: number }, r: number, c: string) => board.rect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r, c)
  // the road: its edge in ink, then the road, a dot every other stretch, darker in the tunnel
  const from = Math.max(0, Math.floor(s.z) - MAP_BEHIND), to = Math.min(last, s.z + MAP_AHEAD)
  for (let z = from; z < to; z += 2) { const p = onMap(z); if (inside(p, 2)) dot(p, 5, '#0c0c14') }
  for (let z = from; z < to; z += 2) { const p = onMap(z); if (inside(p, 2)) dot(p, 3, s.track[z].zone === 'tunnel' ? '#6a6a7a' : '#c8c8d8') }
  // the checkpoints and the line, if they are on it
  for (const c of s.checks) { const p = onMap(c); if (inside(p, 2)) { dot({ x: p.x - 2, y: p.y }, 2, '#3aff6a'); dot({ x: p.x + 2, y: p.y }, 2, '#3aff6a') } }
  { const p = onMap(s.finish); if (inside(p, 3)) for (let k = 0; k < 4; k += 1) dot({ x: p.x - 3 + k * 2, y: p.y + (k % 2) }, 2, k % 2 ? '#1a1a22' : '#faf6ec') }
  // the traffic, then the rivals: on the map, or at its edge pointing where they are
  for (const t of s.traffic) { if (t.z < from || t.z > to) continue; const p = onMap(t.z); if (inside(p, 1)) dot(p, 3, '#5a5a6a') }
  for (const r of s.rivals) {
    const p = onMap(r.z), c = RIVAL_COLOUR[r.kind]
    if (r.z >= from && r.z <= to && inside(p, 3)) { dot(p, 6, '#0c0c14'); dot(p, 4, c); continue }
    const ahead = r.z > s.z, ex = Math.max(bx + 3, Math.min(bx + size - 4, p.x)), ey = ahead ? by + 3 : by + size - 4
    for (let k = 0; k < 3; k += 1) board.rect(Math.round(ex - k), ahead ? ey + k : ey - k, k * 2 + 1, 1, c)
  }
  // the player's car: an arrow pointing ahead, blinking
  const me2 = (s.steps >> 3) % 2 ? '#ffffff' : mix(accent, '#ffffff', 0.4)
  for (let k = 0; k < 6; k += 1) board.rect(Math.round(cx - k / 2 - 1), Math.round(cy - 3 + k), Math.round(k + 2), 1, '#0c0c14')
  for (let k = 0; k < 5; k += 1) board.rect(Math.round(cx - k / 2 - 0.5), Math.round(cy - 2 + k), Math.max(1, Math.round(k + 1)), 1, me2)
}

/** The fork's call stops a little before the side is decided. */
const FORK_DECIDE_SHOWN = 30
/** A sign over the road: its words and its colour. */
type Sign = { name: string; colour: string }
/** The stretches the road not taken at the fork is seen going away for. */
const GHOST_LEN = 120
/** What each road of the fork says on its sign. */
const FORK_SIGN: Record<'bends' | 'fast' | 'tunnel', Sign> = { bends: { name: FORK_NAME.bends, colour: '#2e8a48' }, fast: { name: FORK_NAME.fast, colour: '#d0702e' }, tunnel: { name: FORK_NAME.tunnel, colour: '#5a4ab0' } }
/** Each rival's colour, for its mark when it is close behind. */
const RIVAL_COLOUR: Record<RacingCarKind, string> = { rosso: '#ff3a2a', giallo: '#ffd23f', burger: '#ff9a3a' }

/** Fills a rectangle of the board (fractions allowed), no row at or under `clip`. */
function block(board: PixelBuffer, x: number, y: number, w: number, h: number, colour: string, clip: number): void {
  const x0 = Math.max(0, Math.round(x)), x1 = Math.min(board.width, Math.max(Math.round(x + w), x0 + 1)), y0 = Math.max(0, Math.round(y)), y1 = Math.min(clip, board.height, Math.round(y + h))
  const [r, g, b] = rgbOf(colour), d = board.data, W = board.width
  for (let yy = y0; yy < y1; yy += 1) for (let xx = x0, t = (yy * W + x0) * 4; xx < x1; xx += 1, t += 4) { d[t] = r; d[t + 1] = g; d[t + 2] = b; d[t + 3] = 255 }
}

/** The barrier down the middle where the road divides: a low block at each stretch, yellow and black in turn, through the hour. */
function median(board: PixelBuffer, a: End, b: End, i: number, clip: number, tier: Tier, fog: number): void {
  const w = 0.14 * a.u, h = 0.26 * a.u
  if (h < 1) return
  const { rgb, by } = tintFor(tier, fog), paint = (c: string) => mix(c, `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`, by)
  block(board, a.x - w / 2, a.y - h, w, h, paint(Math.floor(i / 2) % 2 ? '#ffd23f' : '#1a1a22'), clip)
  block(board, a.x - w / 2, a.y - h, w, Math.max(1, h * 0.18), paint('#f6f2e8'), clip)
  void b
}

/** The gantry over a fork: its posts, and over each half of the road a panel with where it leads (a world, what it offers) and an arrow. */
function forkGantry(board: PixelBuffer, p: End, clip: number, signs: [Sign, Sign], tier: Tier, fog: number): void {
  const u = p.u, top = p.y - 2.3 * u, panel = Math.max(3, 0.5 * u), post = Math.max(1, 0.08 * u)
  const { rgb, by } = tintFor(tier, fog), paint = (c: string) => mix(c, `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`, by * 0.6)
  for (const x of [-1.95, 0, 1.95]) block(board, p.x + x * u - post / 2, top, post, p.y - top, paint('#3a3a4a'), clip)
  signs.forEach((sign, k) => {
    const side = k === 0 ? -1 : 1, x0 = p.x + (side < 0 ? -1.9 : 0.1) * u, w = 1.8 * u
    if (top + panel >= clip) return
    block(board, x0 - 1, top - 1, w + 2, panel + 2, paint('#141420'), clip)
    block(board, x0, top, w, panel, paint(sign.colour), clip)
    const label = `${side < 0 ? '< ' : ''}${sign.name}${side > 0 ? ' >' : ''}`
    const scale = text7Width(label, 2, true) < w - 6 && panel >= 18 ? 2 : 1
    if (text7Width(label, scale, true) < w - 4 && panel >= 9 && top + panel < clip) drawText7(board, label, Math.round(x0 + (w - text7Width(label, scale, true)) / 2), Math.round(top + (panel - 7 * scale) / 2), '#faf6ec', scale, true)
  })
}

/** The air rushing past in a slipstream: pale lines along both sides of the screen, flowing toward the viewer. */
function slipstream(board: PixelBuffer, frame: number, horizon: number): void {
  const W = board.width, H = board.height, d = board.data
  for (let k = 0; k < 20; k += 1) {
    const side = k % 2 ? 1 : -1, lane = (k >> 1) / 10
    const t = ((frame * 0.06 + k * 0.37) % 1)
    const x = W / 2 + side * W * (0.3 + lane * 0.2 + t * 0.25), y = horizon + (H - horizon) * (0.15 + t * 0.85)
    const len = 6 + t * 18
    for (let j = 0; j < len; j += 1) {
      const px = Math.round(x + side * j * 0.8), py = Math.round(y + j * 0.5)
      if (px < 0 || px >= W || py < 0 || py >= H) continue
      const o = (py * W + px) * 4, f = 0.8 * (1 - j / len)
      d[o] += (240 - d[o]) * f; d[o + 1] += (244 - d[o + 1]) * f; d[o + 2] += (255 - d[o + 2]) * f
    }
  }
}

/** The sky's own life over the far view: gulls crossing, flapping, over the sea (birds of prey over the mountains and the desert, two); now and then, by day, the little plane pulling its banner, RANDOM on it. */
function sky(board: PixelBuffer, frame: number, horizon: number, tier: Tier, accent: string, world: RacingWorld): void {
  const W = board.width, ink = tier >= 1.4 ? '#c8c8d8' : '#3a2a3a'
  if (world === 'city') return
  for (let k = 0; k < (world === 'coast' ? 4 : 2); k += 1) {
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

/**
 * A car's flank, the side of it that shows: the one whose nose stands out past
 * its back on the screen (a car off to a side, or turning in a bend). Drawn
 * in the pictures' own eye, level with the cars: from the back's edge toward
 * the nose, at the back's height, narrowing as the nose is further, rising
 * only a little with the road: the car's back alone far ahead, then a
 * three-quarter view, then more of its side as it comes alongside.
 */
function flank(board: PixelBuffer, rows: Projected[], b0: number, c: Cargo['cars'][number], at: { x: number; y: number; u: number }, foot: number, tier: Tier, fog: number, clip: number): void {
  const nose = rows[Math.floor(c.z + CAR_SPAN) - b0]
  if (!nose || nose.behind || at.u < 2) return
  const wide = c.traffic ? RACING_CAR_WIDTH * TRAFFIC_WIDTH[c.kind as RacingTrafficModel] : RACING_CAR_WIDTH
  const high = c.traffic ? wide * trafficHigh(c.kind as RacingTrafficModel) : wide * rivalHigh(c.kind as RacingCarKind)
  const front = place(nose, c.z + CAR_SPAN, c.x), r = front.u / at.u
  const lb = at.x - (wide / 2) * at.u, lf = front.x - (wide / 2) * front.u, rb = at.x + (wide / 2) * at.u, rf = front.x + (wide / 2) * front.u
  let xb: number, xf: number
  if (lf < lb - 1) { xb = lb; xf = lf } else if (rf > rb + 1) { xb = rb; xf = rf } else return
  // a car turning shows its flank on the side it turns to, in its own picture: never the other side as well
  if (c.turn !== 0 && Math.sign(xf - xb) !== c.turn) return
  // tucked a little under the back's edge, so no gap shows between them
  xb -= Math.sign(xf - xb) * Math.max(1, wide * at.u * 0.03)
  const eye = foot - FLANK_EYE * high * at.u, yf = eye + (foot - eye) * r + (front.y - at.y) * FLANK_LIFT
  const { pic, share } = carSide(c.traffic ? (c.kind as RacingTrafficModel) : (c.kind as RacingCarKind), c.look)
  facadePiece(board, { x: xb, y: foot, u: at.u }, { x: xf, y: yf, u: at.u * r }, 0, high * share, clip, pic, 0, pic.width, tintFor(tier, fog))
}
/** Where the pictures' eye stands on a car (a share of its height from its foot), and how much of the road's rise its flank follows. */
const FLANK_EYE = 0.5, FLANK_LIFT = 0

/**
 * How far round a spinning car has turned, in degrees (its nose to the right
 * for more than 0), `left` steps before its spin ends: round to its side and
 * back, then a smaller swing the other way as it catches.
 */
function spinPose(left: number, total: number, way: -1 | 1): number {
  if (left <= 0) return 0
  const t = 1 - left / total
  return way * (t < 0.7 ? 100 * Math.sin((Math.PI * t) / 0.7) : -28 * Math.sin((Math.PI * (t - 0.7)) / 0.3))
}

/**
 * A car spinning after a crash, `width` wide at its back: from behind, turned
 * (its turning picture), then side on (its side, as long as the car), by how
 * far round it is; in the smoke of its tyres.
 */
function posed(board: PixelBuffer, c: { kind: RacingCarKind | RacingTrafficModel; traffic: boolean; look: number }, cx: number, foot: number, width: number, pose: number, frame: number, options: { clip?: number; tier: Tier; fog: number; lights: boolean }): void {
  const clip = options.clip ?? board.height, turn: -1 | 1 = pose > 0 ? 1 : -1, round = Math.abs(pose)
  const back = c.traffic ? width * TRAFFIC_WIDTH[c.kind as RacingTrafficModel] : width
  if (round >= 62) {
    const high = c.traffic ? trafficHigh(c.kind as RacingTrafficModel) : rivalHigh(c.kind as RacingCarKind)
    const { pic } = carSide(c.traffic ? (c.kind as RacingTrafficModel) : (c.kind as RacingCarKind), c.look, true)
    const w = back * SIDE_ON, h = back * high
    glow(board, cx, foot - 1, w * 0.55, '#0a0814', 0.55, clip, 0.13)
    const { rgb, by } = tintFor(options.tier, options.fog)
    drawArt(board, pic, cx - w / 2, foot - h, w, h, clip, turn < 0, rgb, by)
  } else {
    const t = round >= 22 ? turn : 0
    if (c.traffic) drawTraffic(board, c.kind as RacingTrafficModel, c.look, cx, foot, width, { turn: t, clip, tier: options.tier, fog: options.fog, lights: options.lights })
    else drawCar(board, c.kind as RacingCarKind, cx, foot, width, { turn: t, clip, tier: options.tier, fog: options.fog, lights: options.lights })
  }
  // the tyres' smoke, rolling up round the wheels and drifting back
  if (back > 4) for (let k = 0; k < 6; k += 1) {
    const age = ((frame + k * 5) % 26) / 26, r = back * (0.18 + age * 0.4)
    glow(board, cx + (k - 2.5) * back * 0.24 + Math.sin(frame * 0.2 + k) * back * 0.05, foot - back * 0.04 - age * back * 0.26, r, '#ece8f2', 0.7 * (1 - age * 0.8), clip, 0.7)
  }
}
/** How long a car side on is, for its back's width. */
const SIDE_ON = 1.75

/** Sparks off a rail scraped, from the car's side at `x`, `y`, flying back and out (`side` the rail's), white then yellow then orange. */
function sparks(board: PixelBuffer, x: number, y: number, side: -1 | 1, frame: number, size: number): void {
  for (let k = 0; k < 14; k += 1) {
    const n = (frame * 13 + k * 29) % 37, len = size * (0.08 + (n % 5) * 0.04), dx = side * (0.25 + (n % 7) * 0.13), dy = (n % 4) * 0.3 - 0.45
    const x0 = x + side * (n % 4), y0 = y - (n % 8), colour = k % 3 === 0 ? '#fffbe0' : k % 3 === 1 ? '#ffd23a' : '#ff8a1e'
    for (let j = 0; j < len; j += 1) board.set(Math.round(x0 + dx * j), Math.round(y0 + dy * j), colour)
  }
  glow(board, x, y, size * 0.18, '#ffcf5a', 0.7)
}
/** A racing car's height as a share of its width, from its picture. */
function rivalHigh(kind: RacingCarKind): number {
  const pic = racingArt(`car-${kind}-104`)
  return pic ? pic.height / pic.width : 0.55
}

/** Where a point of the road at `z`, `x` stands on the screen, inside its stretch. */
function place(p: Projected, z: number, x: number): { x: number; y: number; u: number } {
  const t = Math.max(0, Math.min(1, z - Math.floor(z)))
  const u = p.a.u + (p.b.u - p.a.u) * t
  return { x: p.a.x + (p.b.x - p.a.x) * t + x * u, y: p.a.y + (p.b.y - p.a.y) * t, u }
}

/** A number from 0 to 1, always the same for `n`. */
const hash = (n: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
const PARTY = ['#ffd23f', '#ff4ab0', '#3af0ff', '#7aff6a', '#ff7a3a', '#ffffff', '#8a5aff']

/**
 * The finish line crossed: fireworks bursting over the road and confetti
 * raining down, `t` steps on — more bursts at once and thicker confetti as
 * the levels go.
 */
function celebrate(board: PixelBuffer, t: number, level: number, horizon: number): void {
  const W = board.width, H = board.height, d = board.data
  const put = (x: number, y: number, c: string, size = 1) => { for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) { const X = Math.round(x) + dx, Y = Math.round(y) + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) { const [r, g, b] = rgbOf(c), o = (Y * W + X) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b } } }
  // the fireworks: a rocket climbing, then a ring of sparks opening, falling and fading
  const every = Math.max(7, 24 - level * 1.1)
  for (let k = Math.max(0, Math.floor((t - 70) / every)); k * every <= t; k += 1) {
    const at = t - k * every, x = W * (0.12 + hash(k * 7 + 1) * 0.76), top = Math.max(16, horizon * (0.25 + hash(k * 7 + 2) * 0.45)), colour = PARTY[Math.floor(hash(k * 7 + 3) * PARTY.length)]
    if (at < 16) { const y = H * 0.75 - (H * 0.75 - top) * (at / 16); put(x, y, '#fff2c0'); put(x, y + 2, '#ffb050'); continue }
    const age = at - 16
    if (age > 56) continue
    const r = Math.min(1, (age / 16) ** 0.6) * (26 + level * 1.5), sparks = 18 + Math.min(14, level), fall = age * age * 0.014
    if (age < 8) glow(board, x, top, r + 14, colour, 0.6 - age * 0.06)
    for (let n = 0; n < sparks; n += 1) {
      const a = (n / sparks) * Math.PI * 2 + hash(k) * 3
      if ((age + n) % 3 === 0 && age > 38) continue
      const big = age < 14 ? 3 : age < 32 ? 2 : 1
      // each spark and its trail back toward the middle
      for (const [share, size, c] of [[1, big, n % 4 === 0 ? '#ffffff' : colour], [0.8, Math.max(1, big - 1), colour], [0.62, 1, colour]] as const) put(x + Math.cos(a) * r * share - size / 2, top + Math.sin(a) * r * share * 0.85 + fall - size / 2, c, size)
    }
  }
  // the confetti: falling, swaying, turning
  const many = 150 + level * 20
  for (let n = 0; n < many; n += 1) {
    const start = hash(n * 3 + 11) * 100, age = t - start
    if (age < 0) continue
    const y = -6 + age * (1.1 + hash(n * 3 + 12) * 1.3)
    if (y > H) continue
    // a piece of paper: wide, then narrow, as it turns
    const x = hash(n * 3 + 13) * W + Math.sin(age * 0.09 + n) * 10, c = PARTY[n % PARTY.length], turn = (age + n) % 12
    if (turn < 4) { put(x, y, c, 2); put(x + 2, y, c, 2); put(x + 1, y + 2, c, 2) } else if (turn < 8) { put(x, y, c, 2); put(x, y + 2, c, 2) } else { put(x, y, c, 2); put(x, y + 2, c); put(x, y + 3, c) }
  }
}

/**
 * What stands by the other worlds' roads, where it stands: the pines (moving
 * a little in the snow's wind), the rocks, the saguaros, the desert's shrubs
 * and its red rocks, the park's trees and its fountain playing, and the
 * tumbleweed rolling across the road and back, hopping.
 */
function scenery(board: PixelBuffer, thing: RacingThing, i: number, a: End, clip: number, tier: Tier, fog: number, frame: number, lit: boolean): void {
  const kind = thing.kind as keyof typeof SCENERY_HIGH
  let pic: PixelBuffer | null
  if (kind === 'pine' || kind === 'saguaro' || kind === 'rock' || kind === 'butte') pic = racingArt(kind)
  else if (kind === 'redrock') { const rock = racingArt('rock'); pic = rock ? redRock(rock) : null }
  else if (kind === 'crag') { const rock = racingArt('rock'); pic = rock ? coastRock(rock) : null }
  else if (kind === 'shrub') pic = shrubPicture()
  else if (kind === 'tree') pic = treePicture(thing.look)
  else if (kind === 'fountain') pic = fountainPicture(frame >> 3, lit)
  else pic = tumbleweedPicture(frame >> 2)
  if (!pic) return
  // the rocks of all sizes (`look`), the bigger further back
  const rocky = kind === 'rock' || kind === 'redrock' || kind === 'crag' || kind === 'butte'
  const h = SCENERY_HIGH[kind] * a.u * (rocky ? (0.7 + thing.look * 0.2) * (Math.abs(thing.x) > 3 && kind !== 'butte' ? 1.8 : 1) : 1)
  // too small to see, or so close it would fill the screen with its pixels: left out
  if (h < 2 || (rocky && h > board.height * 1.1)) return
  const w = (pic.width * h) / pic.height
  let x = a.x + thing.x * a.u, foot = a.y
  if (kind === 'tumbleweed') {
    // across the road and back, from one verge to the other, hopping
    const t = ((frame + thing.look * 97) % 600) / 600, across = Math.sin(t * Math.PI * 2) * 3.2
    x = a.x + across * a.u
    foot -= Math.abs(Math.sin(frame * 0.09 + i)) * 0.25 * a.u
  }
  const { rgb, by } = tintFor(tier, fog)
  const sway = kind === 'pine' && tier >= 3 ? Math.sin(frame * 0.04 + i * 0.7) * h * 0.03 : 0
  drawArt(board, pic, x - w / 2, foot - h, w, h, clip, thing.flip && kind !== 'fountain', rgb, kind === 'fountain' && lit ? by * 0.5 : by, sway)
  if (kind === 'fountain' && lit && fog < 12) glow(board, x, foot - h * 0.55, w * 0.6, '#7af0ff', 0.3, clip)
}

/** The mountains' storm: the snow falling, drifting with the wind, the nearer flakes bigger. */
function snow(board: PixelBuffer, frame: number): void {
  const W = board.width, H = board.height, d = board.data
  for (let k = 0; k < 150; k += 1) {
    const near = k % 5 === 0, speed = near ? 2.2 : 1.1
    const x = Math.floor((((k * 7919) % 997) / 997) * W + frame * 0.8 + Math.sin(frame * 0.03 + k) * 6) % W, y = Math.floor((((k * 104729) % 991) / 991) * H + frame * speed) % H
    const size = near ? 2 : 1
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) { const px = x + dx, py = y + dy; if (px >= 0 && px < W && py < H) { const o = (py * W + px) * 4; d[o] += (245 - d[o]) * 0.75; d[o + 1] += (248 - d[o + 1]) * 0.75; d[o + 2] += (255 - d[o + 2]) * 0.75 } }
  }
}

/** The desert's storm: sand blowing across in long streaks. */
function sandstorm(board: PixelBuffer, frame: number): void {
  const W = board.width, H = board.height, d = board.data
  for (let k = 0; k < 90; k += 1) {
    const len = 8 + (k % 4) * 4
    const x = Math.floor((((k * 7919) % 997) / 997) * (W + len) - frame * (5 + (k % 3) * 2)) % (W + len), y = Math.floor((((k * 104729) % 991) / 991) * H + Math.sin(frame * 0.05 + k) * 3)
    const X = x < 0 ? x + W + len : x
    for (let j = 0; j < len; j += 1) { const px = X - j; if (px >= 0 && px < W && y >= 0 && y < H) { const o = (y * W + px) * 4, f = 0.4 * (1 - j / len); d[o] += (232 - d[o]) * f; d[o + 1] += (184 - d[o + 1]) * f; d[o + 2] += (120 - d[o + 2]) * f } }
  }
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
  if (s.phase === 'garage') { garageCard(out, s, accent, W, H); return }
  if (s.phase === 'start') {
    arcadeText(out, `LEVEL ${String(s.level).padStart(2, '0')}`, W / 2, top + 12, 3, accent)
    if (s.phaseTimer >= 20) said(out, String(3 - Math.floor(s.phaseTimer / 60)), W / 2, top + 46, CREAM, 5)
    // how to start well, over the first levels
    if (s.level <= 3 && s.phaseTimer >= 20) said(out, 'PRESS A ON 1: TURBO START', W / 2, top + 96, '#ffd23f', 1)
    gauge(out, s, top)
    return
  }
  if (s.phase === 'play' && s.phaseTimer < 50 && s.z < 60 && s.launch === 'none') said(out, 'GO!', W / 2, top + 46, '#3aff6a', 5)
  else if (s.phase === 'goal') {
    arcadeText(out, 'GOAL!', W / 2, mid - 6, 4, accent)
    if (s.phaseTimer > 30 && s.bonus) said(out, `${ordinal(s.bonus.rank)} PLACE +${s.bonus.place}`, W / 2, mid + 36, s.bonus.rank === 1 ? '#ffd23f' : CREAM, 2)
    if (s.phaseTimer > 70 && s.bonus) said(out, `TIME +${s.bonus.time}`, W / 2, mid + 56, CREAM, 2)
    return
  } else if (s.phase === 'timeup' || s.phase === 'over') { arcadeText(out, 'TIME UP', W / 2, mid, 4, '#ff5a4a'); return }
  if (s.news && (s.news.steps > 20 || (s.news.steps >> 2) % 2 === 0)) said(out, s.news.text, W / 2, top + 40, s.news.text.startsWith('CHECK') ? '#3aff6a' : '#ffd23f', W >= 400 ? 3 : 2)
  // the fork coming: what each road offers, on its side, the side the car is on lit
  if (s.fork && s.forkPick < 0 && s.z > s.fork.at - 200 && s.z < s.fork.at - FORK_DECIDE_SHOWN) {
    const [left, right] = s.fork.kinds.map((k) => FORK_SIGN[k]), on = s.x < 0 ? 0 : 1, blink = (s.steps >> 3) % 2
    said(out, 'PICK YOUR ROAD', W / 2, top + 64, '#faf6ec', 1)
    said(out, `< ${left.name}`, W * 0.26, top + 76, on === 0 && blink ? '#ffffff' : mix(left.colour, '#ffffff', 0.35), 1)
    said(out, `${right.name} >`, W * 0.74, top + 76, on === 1 && blink ? '#ffffff' : mix(right.colour, '#ffffff', 0.35), 1)
  }
  gauge(out, s, top)
  // the brushes, the overtakes, the turbo ready: small, over the car, the latest lowest, rising as they fade
  s.pops.forEach((p, k) => {
    const rise = Math.round((70 - p.steps) * 0.25), y = top + Math.round(H * 0.6) - (s.pops.length - 1 - k) * 12 - rise
    if (p.steps > 12 || (p.steps >> 1) % 2 === 0) said(out, p.text, W / 2, y, p.colour, 1)
  })
}

/** The turbo's gauge under the bar: the mustard bottle, dull until the turbo can be let go, and the gauge — or, while the turbo runs, what is left of it. */
function gauge(out: PixelBuffer, s: RacingState, top: number): void {
  const full = s.boost >= 1, ready = s.boost >= 0.3
  out.blit(MUSTARD, 10, top + 6, ready ? BONUS_PALETTE : { ...BONUS_PALETTE, r: '#6a5a3a', R: '#4a3e2a', P: '#8a7a5a' }, { scale: 2 })
  out.rect(28, top + 13, 42, 6, '#14141c')
  out.rect(29, top + 14, 40, 4, '#2a2a3a')
  if (s.turbo > 0) out.rect(29, top + 14, Math.max(1, Math.min(40, Math.round((40 * s.turbo) / 240))), 4, (s.steps >> 2) % 2 ? '#ff7a1a' : '#ffd02a')
  else if (s.boost > 0) out.rect(29, top + 14, Math.max(1, Math.round(40 * s.boost)), 4, full && (s.steps >> 3) % 2 ? '#fff3a0' : ready ? '#ffd02a' : '#a08a3a')
  // the threshold that lets it go
  out.rect(29 + 12, top + 12, 1, 8, '#faf6ec')
}

/** Each improvement's name and colour, in the garage and on the title. */
export const STAT_LOOK: Record<RacingStat, { name: string; colour: string }> = {
  speed: { name: 'SPEED', colour: '#ff5a4a' }, accel: { name: 'ACCEL', colour: '#3aff6a' }, grip: { name: 'GRIP', colour: '#3af0ff' }, turbo: { name: 'TURBO', colour: '#ffd02a' },
}

/** Where the garage's three improvements stand on the screen (the bar included), for drawing them and for a finger. */
function garageBoxes(layout: Layout, n: number): Hit[] {
  const { width: W, height: H } = RACING_BOARD[layout]
  const bw = Math.min(118, Math.floor((W - 24 - (n - 1) * 8) / n)), bh = 64, y = HUD_HEIGHT + Math.round(H * 0.3)
  const x0 = Math.round((W - (n * bw + (n - 1) * 8)) / 2)
  return Array.from({ length: n }, (_, k) => ({ x: x0 + k * (bw + 8), y, w: bw, h: bh }))
}
/** Which of the garage's improvements a finger at (`x`, `y`) is on, if any. */
export function racingGarageAt(layout: Layout, x: number, y: number, n = 3): number | null {
  const k = garageBoxes(layout, n).findIndex((b) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h)
  return k < 0 ? null : k
}

/** One of the car's points as a row of pips: those it has, the one an improvement would add blinking. */
function pips(out: PixelBuffer, x: number, y: number, have: number, colour: string, adding: boolean, frame: number): void {
  for (let k = 0; k < STAT_MAX; k += 1) {
    const on = k < have, next = adding && k === have
    out.rect(x + k * 9, y, 7, 6, on ? colour : next && (frame >> 3) % 2 ? mix(colour, '#ffffff', 0.4) : '#2a2a3a')
  }
}

/** The garage between two levels: three improvements of the car to pick from, the one pointed at lit, the car's points under them. */
function garageCard(out: PixelBuffer, s: RacingState, accent: string, W: number, H: number): void {
  const g = s.garage
  if (!g) return
  out.shade(0, HUD_HEIGHT, W, H, 0.6)
  const top = HUD_HEIGHT
  arcadeText(out, 'PIT STOP', W / 2, top + 14, 3, accent)
  said(out, 'PICK AN UPGRADE', W / 2, top + 44, CREAM, 1)
  garageBoxes(s.layout, g.options.length).forEach((b, k) => {
    const stat = g.options[k], look = STAT_LOOK[stat], on = k === g.pick
    out.rect(b.x - 2, b.y - 2 - (on ? 3 : 0), b.w + 4, b.h + 4, on ? accent : '#3a3a4a')
    out.rect(b.x, b.y - (on ? 3 : 0), b.w, b.h, on ? '#1c1c2c' : '#14141e')
    const y = b.y - (on ? 3 : 0)
    said(out, look.name, b.x + b.w / 2, y + 10, on ? look.colour : dim(look.colour, 0.65), 2)
    said(out, '+1', b.x + b.w / 2, y + 36, on ? CREAM : GREY, 2)
  })
  // the car's points, the one pointed at about to grow
  const rows = RACING_STATS.length, y0 = top + Math.round(H * 0.3) + 80, x0 = Math.round(W / 2 - (44 + STAT_MAX * 9) / 2)
  RACING_STATS.forEach((stat, k) => {
    const look = STAT_LOOK[stat], y = y0 + k * 14
    drawText(out, look.name, x0, y, look.colour)
    pips(out, x0 + 44, y, s.stats[stat], look.colour, g.options[g.pick] === stat, s.steps)
  })
  if (y0 + rows * 14 + 12 < top + H) said(out, '< >  CHOOSE    A  TAKE', W / 2, y0 + rows * 14 + 6, GREY, 1)
}

// ---------------------------------------------------------------- a moment of play, for the gallery

/** A driver for the gallery's moment of play: gas held, toward its lane, lifting before the sharp bends. */
function demoMove(s: RacingState): { steer: -1 | 0 | 1; gas: boolean } {
  // the lights: A on the third, a perfect start
  if (s.phase === 'start') return { steer: 0, gas: s.phaseTimer >= 125 }
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
