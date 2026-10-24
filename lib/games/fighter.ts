/**
 * RANDOM FIGHTER, a first proposal of its screens, to be looked at: a
 * fighting game seen from the side, after the old computer games of the
 * kind, the fighter in his gi against the burgers — burger ninjas throwing
 * their sesame stars, burger samurai with their swords, little burgers
 * rolling along the floor. Three places through sixteen levels: in front of
 * the burger dojo, as the sun goes down (1 to 5); inside, on its mats,
 * lanterns lit (6 to 11); down in its kitchen at night (12 to 16). The
 * title, a moment of play in each place, GAME OVER and WINNER — wide and
 * tall. FIGHTER in Shojumaru (SIL Open Font License), the rest in the
 * site's pixel letters. Nothing plays yet.
 */

import { actionKey, arrowCross } from './flat-controls'
import { drawFighter, drawFoe, drawStar, FIGHTER_BOX, FOE_BOX, type FighterPose, type FoeKind } from './fighter-figures'
import { FIGHTER_LETTERING, type FighterLettering } from './fighter-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { drawText7, mix, PixelBuffer, text7Width } from './pixels'
import { cloud, NIGHTS, sun } from './scenes'
import type { Layout } from './screens'
import { pressStart } from './ui'

const CREAM = '#f8f5e6'
const INK = '#0a0a14'

/** The title's and the end screens' sizes; a moment of play's: the bar on top, the stage, the controls under it on a tall screen. */
export const FIGHTER_SCREEN: Record<Layout, { width: number; height: number }> = { landscape: { width: 768, height: 432 }, portrait: { width: 432, height: 768 } }
export const FIGHTER_PLAY: Record<Layout, { width: number; height: number; stage: number }> = { landscape: { width: 448, height: 344, stage: 320 }, portrait: { width: 320, height: 568, stage: 380 } }
const BAR = 24

export type FighterPlace = 'street' | 'dojo' | 'kitchen'
/** Where a level is fought: in front of the dojo, inside, down in its kitchen. */
export const fighterPlace = (level: number): FighterPlace => (level <= 5 ? 'street' : level <= 11 ? 'dojo' : 'kitchen')
type Hour = 'day' | 'dusk' | 'night'
const hourOf = (level: number): Hour => (level <= 2 ? 'day' : level <= 8 ? 'dusk' : 'night')

// ---------------------------------------------------------------- small helpers

/** A pixel's own threshold, so two tones blend by dots. */
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const dots = (x: number, y: number, t: number) => t > (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16

/** A gradient down a box through `stops`, dotted between them. */
function gradient(buffer: PixelBuffer, x0: number, y0: number, w: number, h: number, stops: readonly string[]): void {
  for (let y = 0; y < h; y += 1) {
    const f = (y / Math.max(1, h - 1)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), t = f - i
    for (let x = 0; x < w; x += 1) buffer.set(x0 + x, y0 + y, dots(x0 + x, y0 + y, t) ? stops[i + 1] : stops[i])
  }
}

/** A glow: a colour laid over what is there, fading out from the middle. */
function glow(buffer: PixelBuffer, cx: number, cy: number, r: number, color: string, strength: number): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
    if (d < 1) buffer.tint(x, y, color, strength * (1 - d) * (1 - d))
  }
}

/** Letters of the site's pixel font, centred, with a dark shadow under them. */
function words(buffer: PixelBuffer, text: string, cx: number, y: number, color: string, scale = 1): void {
  const w = text7Width(text, scale, true), x = Math.round(cx - w / 2)
  drawText7(buffer, text, x + scale, y + scale, INK, scale, true)
  drawText7(buffer, text, x, y, color, scale, true)
}

// ---------------------------------------------------------------- FIGHTER in its lettering

type Mask = { w: number; h: number; data: Uint8Array }
const masks = new Map<FighterLettering, Mask>()
function maskOf(name: FighterLettering): Mask {
  let mask = masks.get(name)
  if (mask) return mask
  const spec = FIGHTER_LETTERING[name], data = new Uint8Array(spec.width * spec.height)
  spec.runs.split(' ').forEach((row, y) => { let x = 0, on = false; for (const k of row.split('.')) { const n = parseInt(k, 36); if (on) data.fill(1, y * spec.width + x, y * spec.width + x + n); x += n; on = !on } })
  mask = { w: spec.width, h: spec.height, data }
  masks.set(name, mask)
  return mask
}

/** How tall a word stands for a width, its depth and ink in. */
export const fighterWordHeight = (name: FighterLettering, width: number) => Math.round((width * maskOf(name).h) / maskOf(name).w) + Math.round(width * 0.03) + 6

/**
 * A word in FIGHTER's lettering, `width` wide, its top at `y`: its face in
 * bands from cream down to the colour, a thin light line along each band's
 * top, its depth below in the colour's darkest shade, the ink all round.
 */
export function drawFighterWord(buffer: PixelBuffer, cx: number, y: number, width: number, accent: string, name: FighterLettering): void {
  const src = maskOf(name), w = Math.round(width), h = Math.round((width * src.h) / src.w), depth = Math.max(3, Math.round(width * 0.03))
  const x0 = Math.round(cx - w / 2)
  const face = new Uint8Array(w * h)
  for (let Y = 0; Y < h; Y += 1) for (let X = 0; X < w; X += 1) {
    let n = 0
    for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) if (src.data[Math.floor(((Y + oy) / h) * src.h) * src.w + Math.floor(((X + ox) / w) * src.w)]) n += 1
    face[Y * w + X] = n >= 2 ? 1 : 0
  }
  const on = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && face[Y * w + X] === 1
  const deep = mix(accent, '#000000', 0.55), shade = mix(accent, '#000000', 0.25)
  const bands = [CREAM, mix(CREAM, accent, 0.35), mix(CREAM, accent, 0.7), accent, shade]
  // the depth, then the ink round face and depth, then the face
  const solid = (X: number, Y: number) => { for (let d = 0; d <= depth; d += 1) if (on(X - Math.round(d * 0.4), Y - d)) return true; return false }
  for (let Y = -3; Y < h + depth + 3; Y += 1) for (let X = -3; X < w + 3; X += 1) {
    if (solid(X, Y)) { if (!on(X, Y)) buffer.set(x0 + X, y + Y, deep); continue }
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (Math.abs(dx) + Math.abs(dy) <= 3 && solid(X + dx, Y + dy)) { near = true; break }
    if (near) buffer.set(x0 + X, y + Y, INK)
  }
  for (let Y = 0; Y < h; Y += 1) {
    const band = Math.min(bands.length - 1, Math.floor((Y / h) * bands.length)), top = Math.floor((band * h) / bands.length) === Y
    for (let X = 0; X < w; X += 1) if (on(X, Y)) buffer.set(x0 + X, y + Y, top && band > 0 ? mix(bands[band], '#ffffff', 0.5) : !on(X, Y - 1) ? mix(bands[band], '#ffffff', 0.6) : bands[band])
  }
}

// ---------------------------------------------------------------- the places

const SKIES: Record<Hour, readonly string[]> = {
  day: ['#3a7ee0', '#5596ea', '#74aef0', '#98c4f2', '#bcd8f2', '#e2e6e6', '#fde2c2'],
  dusk: ['#1e1250', '#3a1a6a', '#66247a', '#9a347c', '#d0507a', '#f27a6a', '#ffac6a', '#ffd48a'],
  night: ['#04061a', '#0a0e2a', '#121a3e', '#1c2650', '#283462', '#384274'],
}

/** The far mountains at `horizon`: a range, and the snow-capped volcano standing over it. */
function mountains(buffer: PixelBuffer, horizon: number, peakX: number, height: number, hour: Hour): void {
  const W = buffer.width
  const far = hour === 'day' ? '#8aa0c8' : hour === 'dusk' ? '#6a3a7a' : '#1a2044', near = hour === 'day' ? '#6a84b0' : hour === 'dusk' ? '#4a2a62' : '#141838'
  const snow = hour === 'day' ? '#f4f6fa' : hour === 'dusk' ? '#ffd0c8' : '#9aa4c8', snowShade = hour === 'day' ? '#c8d2e6' : hour === 'dusk' ? '#d08aa0' : '#6a749a'
  for (let x = 0; x < W; x += 1) {
    const ridge = horizon - height * 0.18 - Math.sin(x * 0.021) * height * 0.06 - Math.sin(x * 0.053 + 1) * height * 0.04
    for (let y = Math.floor(ridge); y < horizon; y += 1) buffer.set(x, y, far)
  }
  // the volcano: its slopes curving out, its flat top, its snow running down in tongues, shaded on the right
  const half = height * 1.35, top = horizon - height
  for (let x = Math.floor(peakX - half); x <= peakX + half; x += 1) {
    const u = Math.abs(x - peakX) / half
    if (u > 1) continue
    const y0 = u < 0.08 ? top : top + height * Math.pow((u - 0.08) / 0.92, 0.75)
    for (let y = Math.floor(y0); y < horizon; y += 1) {
      const fromTop = (y - top) / height, tongue = 0.24 + 0.06 * Math.sin(x * 0.35) + 0.04 * Math.sin(x * 0.11)
      const right = x > peakX
      buffer.set(x, y, fromTop < tongue ? (right ? snowShade : snow) : right ? mix(near, '#000000', 0.12) : near)
    }
  }
}

/** A paper lantern hanging at `cx`, `cy`: red, ribbed, a black cap and foot, lit from within after dusk. */
function lantern(buffer: PixelBuffer, cx: number, cy: number, r: number, lit: boolean): void {
  if (lit) glow(buffer, cx, cy, r * 3.2, '#ffb060', 0.35)
  buffer.line(cx, cy - r * 1.9, cx, cy - r * 1.1, '#2a1a1a')
  for (let y = -Math.round(r * 1.05); y <= r * 1.05; y += 1) for (let x = -r; x <= r; x += 1) {
    const q = (x * x) / (r * r) + (y * y) / (r * r * 1.1)
    if (q > 1) continue
    const rib = Math.abs(y) % Math.max(2, Math.round(r / 2.5)) === 0
    const c = lit ? (x < -r * 0.3 ? '#ffd890' : x > r * 0.5 ? '#c83a2a' : '#ff6a3a') : x < -r * 0.3 ? '#e85a4a' : x > r * 0.5 ? '#8a1e1a' : '#c8302a'
    buffer.set(cx + x, cy + y, rib ? mix(c, '#000000', 0.25) : c)
  }
  buffer.rect(Math.round(cx - r * 0.5), Math.round(cy - r * 1.2), Math.round(r), 2, '#1a1414')
  buffer.rect(Math.round(cx - r * 0.5), Math.round(cy + r * 1.05), Math.round(r), 2, '#1a1414')
}

/**
 * The burger dojo from the street, `x` to `x + w`, standing on `ground`: its
 * curved roof of dark tiles with the eaves turned up, the sign over the door
 * (DOJO, and a burger), the paper screens of its windows lit warm, the
 * door's blue curtain, the lanterns along the eaves, its stone step.
 */
function dojoFront(buffer: PixelBuffer, x: number, ground: number, w: number, h: number, hour: Hour, frame: number): void {
  const lit = hour !== 'day'
  const wallTop = ground - h * 0.62
  // the walls: cream plaster on a dark wooden frame
  buffer.rect(x, wallTop, w, ground - wallTop, hour === 'night' ? '#8a8070' : '#efe4cc')
  for (const fx of [0, 0.32, 0.68, 1]) buffer.rect(Math.round(x + fx * (w - 6)), wallTop, 6, ground - wallTop, '#4a2a1e')
  buffer.rect(x, wallTop, w, 5, '#4a2a1e')
  // the windows: paper screens in their grid, warm after dark
  for (const fx of [0.06, 0.74]) {
    const wx = Math.round(x + fx * w), wy = Math.round(wallTop + h * 0.12), ww = Math.round(w * 0.2), wh = Math.round(h * 0.3)
    buffer.rect(wx, wy, ww, wh, lit ? '#ffd890' : '#f4ecd8')
    if (lit) glow(buffer, wx + ww / 2, wy + wh / 2, ww, '#ffb060', 0.25)
    for (let k = 1; k < 4; k += 1) buffer.rect(wx + Math.round((k * ww) / 4), wy, 2, wh, '#6a3a24')
    for (let k = 1; k < 3; k += 1) buffer.rect(wx, wy + Math.round((k * wh) / 3), ww, 2, '#6a3a24')
    buffer.rect(wx - 2, wy - 2, ww + 4, 3, '#4a2a1e'); buffer.rect(wx - 2, wy + wh, ww + 4, 3, '#4a2a1e')
  }
  // the door: its blue curtain in three panels, a white circle on it, the light behind
  const dx = Math.round(x + w * 0.38), dw = Math.round(w * 0.24), dy = Math.round(wallTop + h * 0.14)
  buffer.rect(dx, dy, dw, ground - dy, lit ? '#ffcc80' : '#3a2a20')
  const sway = Math.round(Math.sin(frame * 0.8) * 1)
  for (let k = 0; k < 3; k += 1) buffer.rect(dx + Math.round((k * dw) / 3) + 1 + sway, dy, Math.round(dw / 3) - 2, Math.round(h * 0.2), '#2a3a8a')
  buffer.disc(dx + dw / 2 + sway, dy + h * 0.1, Math.max(3, h * 0.05), '#f4f0e6')
  // the sign over the door: DOJO, a little burger beside it
  const sw = Math.round(w * 0.36), sx = Math.round(x + w / 2 - sw / 2), sh = Math.max(12, Math.round(h * 0.11)), sy = Math.round(wallTop - sh - h * 0.02)
  // the roof first: dark tiles curving down to eaves turned up at both ends
  const eave = ground - h * 0.6, ridge = ground - h, over = w * 0.08
  for (let X = Math.floor(x - over); X <= x + w + over; X += 1) {
    const u = (X - (x + w / 2)) / (w / 2 + over), lift = Math.pow(Math.abs(u), 6) * h * 0.1
    const top = ridge + (h * 0.18) * (1 - Math.cos(Math.min(1, Math.abs(u)) * Math.PI * 0.5)) - lift * 0.4
    const bottom = eave - lift
    for (let Y = Math.floor(top); Y < bottom; Y += 1) buffer.set(X, Y, (Y - Math.floor(top)) % 5 === 0 ? '#2a2a3a' : X % 9 === 0 ? '#3a3a50' : '#44465e')
    buffer.set(X, Math.floor(bottom), '#1a1a26'); buffer.set(X, Math.floor(bottom) + 1, '#1a1a26')
  }
  buffer.rect(Math.round(x + w * 0.2), Math.round(ridge - 3), Math.round(w * 0.6), 4, '#1a1a26')
  buffer.rect(sx - 2, sy - 2, sw + 4, sh + 4, '#4a2a1e')
  buffer.rect(sx, sy, sw, sh, '#c8282e')
  const scale = sh >= 22 ? 2 : 1, label = 'DOJO'
  drawText7(buffer, label, Math.round(sx + sw / 2 - text7Width(label, scale, true) / 2 - sh * 0.4), Math.round(sy + sh / 2 - 3.5 * scale), '#ffe6a0', scale, true)
  const bx = Math.round(sx + sw / 2 + text7Width(label, scale, true) / 2 + sh * 0.1), by = Math.round(sy + sh / 2)
  buffer.disc(bx, by - 1, sh * 0.24, '#e8a24a'); buffer.rect(bx - Math.round(sh * 0.24), by, Math.round(sh * 0.48), 2, '#5ac83a'); buffer.rect(bx - Math.round(sh * 0.24), by + 2, Math.round(sh * 0.48), 2, '#6e3a22')
  // the lanterns along the eaves
  for (let k = 0; k < 5; k += 1) lantern(buffer, Math.round(x + ((k + 0.5) * w) / 5), Math.round(eave + h * 0.1), Math.max(4, Math.round(h * 0.055)), lit)
  // the stone step
  buffer.rect(dx - 6, ground - 4, dw + 12, 4, '#9a9288')
}

/** The street before the dojo: its pavement of big stones, lit warm by the dojo after dark, long shadows by day. */
function pavement(buffer: PixelBuffer, top: number, bottom: number, hour: Hour): void {
  const base = hour === 'day' ? '#b8ae9c' : hour === 'dusk' ? '#8a6a72' : '#3a3650', line = mix(base, '#000000', 0.25), light = mix(base, '#ffffff', 0.18)
  gradient(buffer, 0, top, buffer.width, bottom - top, [light, base, mix(base, '#000000', 0.15)])
  for (let row = 0, y = top; y < bottom; row += 1) {
    const hh = 6 + row * 4
    buffer.rect(0, y, buffer.width, 1, line)
    for (let x = (row % 2) * 24; x < buffer.width; x += 48 + row * 6) buffer.rect(x, y, 1, Math.min(hh, bottom - y), line)
    y += hh
  }
}

/** Inside the dojo: the wooden wall and its paper screens lit, a scroll with a burger, the counter at the back, lanterns, the mats. */
function dojoRoom(buffer: PixelBuffer, top: number, floor: number, bottom: number, hour: Hour, frame: number): void {
  const W = buffer.width
  gradient(buffer, 0, top, W, floor - top, hour === 'night' ? ['#3a2418', '#4a2e1e', '#5a3a26'] : ['#6a4028', '#7a4a2e', '#8a5634'])
  // the paper screens: a row of lit panels in their dark frames
  const sy = top + Math.round((floor - top) * 0.18), sh = Math.round((floor - top) * 0.5)
  for (let x = 6; x < W - 40; x += 74) {
    buffer.rect(x, sy, 62, sh, hour === 'night' ? '#e8c890' : '#f6e8c8')
    for (let k = 1; k < 3; k += 1) buffer.rect(x + Math.round((k * 62) / 3), sy, 2, sh, '#5a3020')
    for (let k = 1; k < 4; k += 1) buffer.rect(x, sy + Math.round((k * sh) / 4), 62, 2, '#5a3020')
    buffer.rect(x - 3, sy - 3, 68, 3, '#3a1e14'); buffer.rect(x - 3, sy + sh, 68, 3, '#3a1e14')
  }
  // the scroll hanging between two screens: a burger in ink on cream
  const kx = Math.round(W * 0.5) - 14, ky = sy - 6
  buffer.rect(kx, ky, 28, sh + 8, '#f4ecd8'); buffer.rect(kx - 2, ky - 2, 32, 3, '#3a1e14'); buffer.rect(kx - 2, ky + sh + 8, 32, 3, '#3a1e14')
  buffer.disc(kx + 14, ky + sh * 0.4, 8, '#2a1a1a'); buffer.rect(kx + 5, ky + sh * 0.4 + 3, 18, 3, '#2a1a1a'); buffer.rect(kx + 6, ky + sh * 0.4 + 7, 16, 3, '#2a1a1a')
  // the counter along the back with its stools, a red top
  const cy = floor - Math.round((floor - top) * 0.2)
  buffer.rect(0, cy, W, floor - cy, '#5a2a1e'); buffer.rect(0, cy, W, 3, '#c8282e')
  for (let x = 30; x < W; x += 70) { buffer.rect(x, cy - 2, 14, 3, '#c8282e'); buffer.rect(x + 6, cy + 1, 2, floor - cy - 1, '#2a1a1a') }
  // the lanterns over the mats
  for (let x = 40; x < W; x += 120) lantern(buffer, x, top + 14, 6, true)
  // the mats: rows of straw, their dark edges, going away
  gradient(buffer, 0, floor, W, bottom - floor, ['#c8b878', '#b8a868', '#a89858'])
  for (let row = 0, y = floor; y < bottom; row += 1) { const hh = 8 + row * 5; buffer.rect(0, y, W, 2, '#3a5a2a'); for (let x = (row % 2) * 40; x < W; x += 80 + row * 8) buffer.rect(x, y, 2, Math.min(hh, bottom - y), '#3a5a2a'); y += hh }
  void frame
}

/** Down in the kitchen at night: tiles on the walls, the steel hood, the fryers glowing, pans hanging, a bulb; a floor of dark checks. */
function kitchen(buffer: PixelBuffer, top: number, floor: number, bottom: number, frame: number): void {
  const W = buffer.width
  for (let y = top; y < floor; y += 1) for (let x = 0; x < W; x += 1) {
    const tile = ((x >> 4) + (y >> 4)) % 2, edge = x % 16 === 0 || (y - top) % 16 === 0
    buffer.set(x, y, edge ? '#2a3a40' : tile ? '#4a6a70' : '#56787e')
  }
  // the hood and the fryers under it, their oil glowing, steam going up
  const hx = Math.round(W * 0.58), hw = Math.round(W * 0.34), fy = floor - Math.round((floor - top) * 0.34)
  buffer.poly([[hx, top + 10], [hx + hw, top + 10], [hx + hw + 12, top + 40], [hx - 12, top + 40]], '#8a96a6')
  buffer.rect(hx - 12, top + 40, hw + 24, 4, '#5a6676')
  buffer.rect(hx - 8, fy, hw + 16, floor - fy, '#6a7686'); buffer.rect(hx - 8, fy, hw + 16, 3, '#aab4c4')
  for (let k = 0; k < 2; k += 1) { const ox = hx + 6 + k * Math.round(hw / 2); buffer.rect(ox, fy + 4, Math.round(hw / 2) - 12, 8, '#ffa030'); glow(buffer, ox + hw / 4, fy + 4, hw / 3, '#ff8a20', 0.35) }
  for (let k = 0; k < 3; k += 1) { const py = fy - 8 - ((frame * 3 + k * 9) % 26); buffer.tint(hx + 14 + k * 18, py, '#ffffff', 0.35); buffer.tint(hx + 15 + k * 18, py - 1, '#ffffff', 0.25) }
  // the pans on their rail, the bulb and its light
  buffer.rect(10, top + 18, Math.round(W * 0.4), 2, '#2a2a30')
  for (let k = 0; k < 4; k += 1) { const px = 22 + k * 30; buffer.line(px, top + 20, px, top + 26, '#2a2a30'); buffer.disc(px, top + 34, 8, '#3a3a44'); buffer.disc(px - 2, top + 32, 3, '#6a6a78') }
  const bx = Math.round(W * 0.3)
  buffer.line(bx, top, bx, top + 50, '#1a1a20'); buffer.disc(bx, top + 54, 4, '#fff2b0'); glow(buffer, bx, top + 54, 70, '#ffe08a', 0.22)
  // the floor: dark checks going away
  for (let y = floor; y < bottom; y += 1) {
    const row = Math.floor(Math.sqrt(y - floor + 1) * 1.6)
    for (let x = 0; x < W; x += 1) buffer.set(x, y, (Math.floor(x / (18 + row * 3)) + row) % 2 ? '#2a2630' : '#3e3a46')
  }
}

/** A place's backdrop over a box of the board, down to `bottom`, the floor's edge at `floor`. */
function backdrop(buffer: PixelBuffer, place: FighterPlace, hour: Hour, top: number, floor: number, bottom: number, frame: number): void {
  const W = buffer.width
  if (place === 'street') {
    gradient(buffer, 0, top, W, floor - top, SKIES[hour])
    if (hour !== 'day') for (let k = 0; k < 40; k += 1) { const sx = (k * 97) % W, sy = top + ((k * 53) % Math.round((floor - top) * 0.4)); if (hour === 'night' || k % 3 === 0) buffer.set(sx, sy, k % 5 === 0 && (frame + k) % 4 === 0 ? '#ffffff' : '#c8c8f0') }
    if (hour !== 'night') sun(buffer, Math.round(W * 0.56), Math.round(floor - (floor - top) * (hour === 'day' ? 0.75 : 0.3)), Math.max(10, Math.round((floor - top) * 0.07)))
    else { buffer.disc(Math.round(W * 0.78), top + 30, 12, '#f4f0d8'); buffer.disc(Math.round(W * 0.78) + 4, top + 27, 11, SKIES.night[1]) }
    if (hour !== 'night') cloud(buffer, Math.round(W * 0.08), top + 18, 'small', NIGHTS.violet, false, true)
    mountains(buffer, Math.round(floor - (floor - top) * 0.2), Math.round(W * 0.36), Math.round((floor - top) * 0.4), hour)
    // the dojo on the right, under the words: as tall as a third of the sky, never wider than half the screen
    const dh = Math.round(Math.min((floor - top) * 0.36, (W * 0.5) / 1.6)), dw = Math.round(dh * 1.6)
    dojoFront(buffer, W - dw - Math.round(W * 0.03), Math.round(floor - (floor - top) * 0.05), dw, dh, hour, frame)
    buffer.rect(0, Math.round(floor - (floor - top) * 0.05), W, Math.round((floor - top) * 0.05), hour === 'day' ? '#8a8270' : '#4a3a4a')
    pavement(buffer, floor, bottom, hour)
  } else if (place === 'dojo') dojoRoom(buffer, top, floor, bottom, hour, frame)
  else kitchen(buffer, top, floor, bottom, frame)
}

/** A shadow on the floor under someone. */
function shadow(buffer: PixelBuffer, cx: number, y: number, w: number): void {
  for (let x = Math.floor(-w / 2); x <= w / 2; x += 1) for (let dy = -2; dy <= 2; dy += 1) if ((x * x) / ((w * w) / 4) + (dy * dy) / 6 <= 1) buffer.tint(Math.round(cx + x), Math.round(y + dy), '#000000', 0.35)
}

// ---------------------------------------------------------------- the title

export type FighterTitleOptions = { frame?: number; blink?: boolean; best?: number }

/**
 * The title: the burger dojo at sundown under the snowy volcano, RANDOM over
 * FIGHTER, PRESS START blinking; on the street the fighter on guard, the
 * burgers coming at him — a samurai with his sword up, two ninjas with their
 * stars, a little one rolling.
 */
export function renderFighterTitle(layout: Layout, accent: string, options: FighterTitleOptions = {}): PixelBuffer {
  const { width: W, height: H } = FIGHTER_SCREEN[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, '#000000')
  const wide = layout === 'landscape'
  const floor = wide ? 352 : 610
  backdrop(buffer, 'street', 'dusk', 0, floor, H, frame)
  // the words
  const logo = wide ? 2 : 2, lw = LOGO_WIDTH * logo
  drawLogo(buffer, Math.round(W / 2 - lw / 2) + 2, (wide ? 18 : 40) + 2, INK, logo)
  drawLogo(buffer, Math.round(W / 2 - lw / 2), wide ? 18 : 40, CREAM, logo)
  const fw = wide ? 540 : 400, fy = wide ? 66 : 92
  drawFighterWord(buffer, W / 2, fy, fw, accent, 'fighter')
  pressStart(buffer, W / 2, fy + fighterWordHeight('fighter', fw) + (wide ? 8 : 16), accent, options.blink !== false, 2)
  // the fight on the street
  const s = wide ? 1.9 : 1.95, feet = H - (wide ? 22 : 40)
  const at = (box: { width: number; height: number }, k: number, x: number) => ({ x, y: feet - box.height * k })
  const hero = at(FIGHTER_BOX, s, wide ? 110 : 18)
  shadow(buffer, hero.x + 40 * s, feet, 50 * s)
  drawFighter(buffer, hero.x, hero.y, s, 'guard', frame, accent)
  const foes: Array<{ kind: FoeKind; k: number; x: number; pose?: 'walk' | 'strike' }> = wide
    ? [{ kind: 'ninja', k: 1.35, x: 600 }, { kind: 'samurai', k: 1.6, x: 410 }, { kind: 'ninja', k: 1.25, x: 520 }, { kind: 'mini', k: 1.4, x: 360 }]
    : [{ kind: 'ninja', k: 1.2, x: 300 }, { kind: 'samurai', k: 1.45, x: 190 }, { kind: 'mini', k: 1.3, x: 150 }]
  for (const f of foes) { const p = at(FOE_BOX[f.kind], f.k, f.x); shadow(buffer, p.x + FOE_BOX[f.kind].width * f.k * 0.45, feet, FOE_BOX[f.kind].width * f.k * 0.6); drawFoe(buffer, p.x, p.y, f.k, f.kind, frame + f.x, true) }
  if (options.best) words(buffer, `BEST ${String(options.best).padStart(5, '0')}`, W / 2, H - 14, CREAM)
  return buffer
}

// ---------------------------------------------------------------- a moment of play

export type FighterPlayOptions = { frame?: number; level?: number; score?: number }

/**
 * A moment of play at a level, in its place: the bar on top (his life, the
 * level, the burgers left, the score), the fight on the floor — the fighter
 * striking, burgers coming from both sides, a sesame star flying — and, on a
 * tall screen, the controls: the cross, A to strike, B to kick.
 */
export function renderFighterPlay(layout: Layout, accent: string, options: FighterPlayOptions = {}): PixelBuffer {
  const { width: W, height: H, stage } = FIGHTER_PLAY[layout], frame = options.frame ?? 0, level = options.level ?? 1
  const buffer = new PixelBuffer(W, H, '#0a0a14')
  const place = fighterPlace(level), hour = place === 'kitchen' ? 'night' : hourOf(level)
  const top = BAR, bottom = BAR + stage, floor = bottom - Math.round(stage * 0.22), feet = bottom - Math.round(stage * 0.08)
  backdrop(buffer, place, hour, top, floor, bottom, frame)
  // the fight: the fighter in the middle, a ninja coming from the left, a samurai from the right, a little one rolling
  const s = layout === 'landscape' ? 0.95 : 0.9
  const poses: FighterPose[] = ['guard', 'punch', 'guard', 'kick']
  const pose = poses[frame % poses.length]
  const hx = Math.round(W * 0.38 - (FIGHTER_BOX.width * s) / 2)
  shadow(buffer, hx + 40 * s, feet, 46 * s)
  drawFighter(buffer, hx, feet - FIGHTER_BOX.height * s, s, pose, frame, accent)
  const ninja = { x: Math.round(W * 0.04 + (frame % 4) * 3), k: s * 0.95 }
  shadow(buffer, ninja.x + 32 * ninja.k, feet, 40 * ninja.k)
  drawFoe(buffer, ninja.x, feet - FOE_BOX.ninja.height * ninja.k, ninja.k, 'ninja', frame, false, frame % 4 === 2 ? 'strike' : 'walk')
  const sam = { x: Math.round(W * 0.62 - (frame % 4 === 1 ? 6 : 0)), k: s * 0.92 }
  shadow(buffer, sam.x + 42 * sam.k, feet, 54 * sam.k)
  drawFoe(buffer, sam.x, feet - FOE_BOX.samurai.height * sam.k, sam.k, 'samurai', frame, true, frame % 4 === 1 ? 'hit' : frame % 4 === 3 ? 'strike' : 'walk')
  if (level >= 4) { const mx = Math.round(W * 0.86 - (frame % 6) * 6); drawFoe(buffer, mx, feet - FOE_BOX.mini.height * s, s, 'mini', frame, true) }
  drawStar(buffer, Math.round(W * 0.2 + (frame % 4) * 12), feet - 60 * s, 6, frame)
  // the bar: his life in the colour, the level, the burgers still to beat, the score
  buffer.rect(0, 0, W, BAR, '#0a0a14')
  drawText7(buffer, 'YOU', 6, 4, CREAM, 1, true)
  const lifeW = layout === 'landscape' ? 96 : 70, life = 0.35 + 0.65 * (((frame >> 2) % 4) / 3)
  buffer.rect(32, 5, lifeW + 2, 9, '#2a2a36'); buffer.rect(33, 6, Math.round(lifeW * life), 7, accent); buffer.rect(33, 6, Math.round(lifeW * life), 2, mix(accent, '#ffffff', 0.4))
  words(buffer, `LEVEL ${String(level).padStart(2, '0')}`, W / 2, 4, CREAM)
  const score = `${String(options.score ?? 1250 + level * 310).padStart(5, '0')}`
  drawText7(buffer, score, W - 6 - text7Width(score, 1, true), 4, CREAM, 1, true)
  const left = 3 + ((level * 5) % 6), icons = Math.min(left, 6)
  for (let k = 0; k < icons; k += 1) { const ix = Math.round(W / 2 - icons * 5 + k * 10), iy = 16; buffer.disc(ix + 3, iy + 1, 3, '#e8a24a'); buffer.rect(ix, iy + 2, 7, 1, '#5ac83a'); buffer.rect(ix, iy + 3, 7, 1, '#6e3a22') }
  // the controls under the stage on a tall screen
  if (layout === 'portrait') {
    const cy = bottom + Math.round((H - bottom) / 2)
    arrowCross(buffer, 82, cy, 30, accent)
    actionKey(buffer, W - 54, cy - 16, 30, 'A', accent, 'main')
    actionKey(buffer, W - 124, cy + 18, 28, 'B', accent, 'other')
  }
  return buffer
}

// ---------------------------------------------------------------- the ends

export type FighterEndOptions = { score?: number; best?: number; frame?: number; blink?: boolean }

/** GAME OVER: the street darkened, GAME over OVER, the fighter down, a burger ninja standing over him; the score and the best. */
export function renderFighterOver(layout: Layout, accent: string, options: FighterEndOptions = {}): PixelBuffer {
  const { width: W, height: H } = FIGHTER_SCREEN[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, '#000000')
  const wide = layout === 'landscape', floor = wide ? 352 : 610
  backdrop(buffer, 'street', 'night', 0, floor, H, frame)
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) buffer.tint(x, y, '#0a0614', 0.35)
  const gw = wide ? 290 : 320, gy = wide ? 24 : 90
  drawFighterWord(buffer, W / 2, gy, gw, accent, 'game')
  drawFighterWord(buffer, W / 2, gy + fighterWordHeight('game', gw) + 4, gw, accent, 'over')
  const y = gy + fighterWordHeight('game', gw) + fighterWordHeight('over', gw) + 14
  words(buffer, `SCORE ${String(options.score ?? 0).padStart(5, '0')}`, W / 2, y, CREAM, 2)
  words(buffer, `BEST ${String(options.best ?? 0).padStart(5, '0')}`, W / 2, y + 22, accent, 2)
  const feet = H - (wide ? 22 : 40), s = wide ? 1.25 : 1.6
  shadow(buffer, W / 2 - 40, feet, 120)
  drawFighter(buffer, Math.round(W / 2 - 150), Math.round(feet - FIGHTER_BOX.height * s), s, 'hit', frame, accent)
  drawFoe(buffer, Math.round(W / 2 + 20), Math.round(feet - FOE_BOX.ninja.height * s), s, 'ninja', frame, true, 'strike')
  pressStart(buffer, W / 2, y + 48, accent, options.blink !== false, 1)
  return buffer
}

/** WINNER: the dojo at dawn, WINNER, the fighter on guard among the beaten burgers; the score and the best. */
export function renderFighterWinner(layout: Layout, accent: string, options: FighterEndOptions = {}): PixelBuffer {
  const { width: W, height: H } = FIGHTER_SCREEN[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, '#000000')
  const wide = layout === 'landscape', floor = wide ? 352 : 610
  backdrop(buffer, 'street', 'day', 0, floor, H, frame)
  const ww = wide ? 520 : 380, wy = wide ? 40 : 100
  drawFighterWord(buffer, W / 2, wy, ww, accent, 'winner')
  const y = wy + fighterWordHeight('winner', ww) + 14
  words(buffer, `SCORE ${String(options.score ?? 0).padStart(5, '0')}`, W / 2, y, CREAM, 2)
  words(buffer, `BEST ${String(options.best ?? 0).padStart(5, '0')}`, W / 2, y + 22, accent, 2)
  // confetti in the colour and cream, falling
  for (let k = 0; k < 90; k += 1) { const cx = (k * 131 + frame * 7) % W, cy = (k * 71 + frame * 11) % Math.round(H * 0.7); buffer.rect(cx, cy, 2, 3, k % 3 ? accent : CREAM) }
  const feet = H - (wide ? 22 : 40), s = wide ? 1.8 : 1.9
  shadow(buffer, W / 2, feet, 90)
  drawFighter(buffer, Math.round(W / 2 - 40 * s), Math.round(feet - FIGHTER_BOX.height * s), s, 'guard', frame, accent)
  for (const [k, dx] of [[0, -0.36], [1, 0.3]] as const) drawFoe(buffer, Math.round(W / 2 + dx * W - 20), Math.round(feet - FOE_BOX.ninja.height * 1.1 + 18), 1.1, k ? 'ninja' : 'mini', frame, k === 1, 'hit')
  pressStart(buffer, W / 2, y + 48, accent, options.blink !== false, 1)
  return buffer
}
