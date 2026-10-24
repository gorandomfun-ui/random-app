/**
 * RANDOM FIGHTER's screens, after the owner's two pictures (made with
 * ChatGPT, traced: `scripts/games/fighter-trace.ts`, `fighter-sprites.ts`):
 * a fighting game seen from the side, after the old computer games of the
 * kind — the ninja, his headband and belt in the site's colour, against the
 * burgers: burger ninjas, the burger samurai with his sword. Two places
 * through sixteen levels: by the gate and the lake at sundown (1 to 8),
 * before the temple at night (9 to 16). The title (the night picture's
 * flying kick under RANDOM and FIGHTER as the dusk picture letters them), a
 * moment of play in each place, GAME OVER and WINNER — wide and tall.
 * FIGHTER in Shojumaru (SIL Open Font License), the rest in the site's pixel
 * letters. Nothing plays yet.
 */

import { actionKey, arrowCross } from './flat-controls'
import { drawStar } from './fighter-figures'
import { fighterArt } from './fighter-art'
import { FIGHTER_LETTERING, type FighterLettering } from './fighter-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { drawText7, mix, PixelBuffer, text7Width } from './pixels'
import type { Layout } from './screens'
import { pressStart } from './ui'

const CREAM = '#f8f5e6'
const INK = '#0a0a14'

/** The title's and the end screens' sizes; a moment of play's: the bar on top, the stage, the controls under it on a tall screen. */
export const FIGHTER_SCREEN: Record<Layout, { width: number; height: number }> = { landscape: { width: 768, height: 432 }, portrait: { width: 432, height: 768 } }
export const FIGHTER_PLAY: Record<Layout, { width: number; height: number; stage: number }> = { landscape: { width: 448, height: 344, stage: 320 }, portrait: { width: 320, height: 568, stage: 380 } }
const BAR = 24

export type FighterPlace = 'dusk' | 'night'
/** Where a level is fought, after the owner's two pictures: by the gate and the lake at sundown (1 to 8), before the temple at night (9 to 16). */
export const fighterPlace = (level: number): FighterPlace => (level <= 8 ? 'dusk' : 'night')

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

/** A shadow on the floor under someone. */
function shadow(buffer: PixelBuffer, cx: number, y: number, w: number): void {
  for (let x = Math.floor(-w / 2); x <= w / 2; x += 1) for (let dy = -2; dy <= 2; dy += 1) if ((x * x) / ((w * w) / 4) + (dy * dy) / 6 <= 1) buffer.tint(Math.round(cx + x), Math.round(y + dy), '#000000', 0.35)
}

// ---------------------------------------------------------------- the title, after the owner's pictures

/** A cut-out laid down with its top left at `x`, `y`, its clear pixels left out; `flip` mirrors it. */
function drawCut(buffer: PixelBuffer, art: PixelBuffer, x: number, y: number, flip = false): void {
  const d = art.data, W = art.width
  for (let yy = 0; yy < art.height; yy += 1) for (let xx = 0; xx < W; xx += 1) {
    const o = (yy * W + xx) * 4
    if (d[o + 3] < 128) continue
    buffer.set(Math.round(x) + (flip ? W - 1 - xx : xx), Math.round(y) + yy, `#${((1 << 24) | (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]).toString(16).slice(1)}`)
  }
}

/**
 * RANDOM as the owner's picture has it over FIGHTER: the site's word in
 * chunky pixels, in the colour, its top rows lighter, the ink round it and
 * a darker depth under it.
 */
function drawRandomWord(buffer: PixelBuffer, cx: number, y: number, scale: number, accent: string): void {
  const w = LOGO_WIDTH * scale, h = 22 * scale, pad = 4
  const tmp = new PixelBuffer(w + pad * 2, h + pad * 2, '#000000')
  drawLogo(tmp, pad, pad, '#ffffff', scale)
  const on = (X: number, Y: number) => X >= 0 && Y >= 0 && X < tmp.width && Y < tmp.height && tmp.data[(Y * tmp.width + X) * 4] > 128
  const x0 = Math.round(cx - tmp.width / 2), deep = mix(accent, '#000000', 0.55), ink = mix(accent, '#000000', 0.8)
  const depth = Math.max(2, scale + 1)
  for (let Y = -3; Y < tmp.height + depth + 3; Y += 1) for (let X = -3; X < tmp.width + 3; X += 1) {
    let solid = false
    for (let d = 0; d <= depth && !solid; d += 1) if (on(X, Y - d)) solid = true
    if (solid) { if (!on(X, Y)) buffer.set(x0 + X, y + Y, deep); continue }
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy += 1) for (let dx = -2; dx <= 2; dx += 1) { let s2 = false; for (let d = 0; d <= depth && !s2; d += 1) if (on(X + dx, Y + dy - d)) s2 = true; if (s2) { near = true; break } }
    if (near) buffer.set(x0 + X, y + Y, ink)
  }
  for (let Y = 0; Y < tmp.height; Y += 1) for (let X = 0; X < tmp.width; X += 1) if (on(X, Y)) buffer.set(x0 + X, y + Y, (Y - pad) < h * 0.38 ? mix(accent, '#ffffff', 0.35) : accent)
}

/**
 * FIGHTER as the owner's picture has it: leaning forward, its face in bands
 * from cream down to the colour, the ink round it, a deep shade of the
 * colour as its depth; behind it a red brush stroke from beyond its first
 * letter to beyond its last, ragged at its ends, a thinner stroke over it.
 */
function drawFighterTitleWord(buffer: PixelBuffer, cx: number, y: number, width: number, accent: string, name: FighterLettering = 'fighter'): void {
  const src = maskOf(name), w = Math.round(width), h = Math.round((width * src.h) / src.w), slant = 0.24, extra = Math.round(h * slant)
  const depth = Math.max(3, Math.round(h * 0.07))
  const W2 = w + extra
  const face = new Uint8Array(W2 * h)
  for (let Y = 0; Y < h; Y += 1) for (let X = 0; X < W2; X += 1) {
    const sx = X - (h - Y) * slant
    let n = 0
    for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) { const u = (sx + ox) / w, v = (Y + oy) / h; if (u >= 0 && u < 1 && src.data[Math.floor(v * src.h) * src.w + Math.floor(u * src.w)]) n += 1 }
    face[Y * W2 + X] = n >= 2 ? 1 : 0
  }
  const x0 = Math.round(cx - W2 / 2)
  const on = (X: number, Y: number) => X >= 0 && Y >= 0 && X < W2 && Y < h && face[Y * W2 + X] === 1
  // the red stroke behind, its ends ragged, and a thinner one above it
  const red = '#e8402a', redDark = '#a8241a', redLight = '#ff7a52'
  const stroke = (yMid: number, thick: number, from: number, to: number, seed: number) => {
    for (let X = Math.floor(from); X < to; X += 1) {
      const u = (X - from) / (to - from), taper = Math.min(1, u * 5, (1 - u) * 4)
      const rag = Math.sin(X * 0.9 + seed) * 0.5 + Math.sin(X * 0.23 + seed * 2) * 0.5
      const half = thick * taper * (0.75 + 0.25 * rag)
      if (half < 0.6) continue
      for (let Y = Math.round(yMid - half); Y <= yMid + half; Y += 1) buffer.set(X, Y, Y > yMid + half * 0.45 ? redDark : Y < yMid - half * 0.55 ? redLight : red)
    }
  }
  stroke(y + h * 0.55, h * 0.3, x0 - w * 0.14, x0 + W2 + w * 0.1, 1)
  stroke(y + h * 0.22, h * 0.07, x0 + W2 * 0.55, x0 + W2 + w * 0.16, 4)
  stroke(y + h * 0.86, h * 0.06, x0 - w * 0.2, x0 + W2 * 0.35, 7)
  // the depth, the ink round face and depth, then the face in its bands
  const deep = mix(accent, '#000000', 0.6), ink = mix(accent, '#000000', 0.82)
  const solid = (X: number, Y: number) => { for (let d = 0; d <= depth; d += 1) if (on(X - Math.round(d * 0.5), Y - d)) return true; return false }
  for (let Y = -3; Y < h + depth + 3; Y += 1) for (let X = -3; X < W2 + depth + 3; X += 1) {
    if (solid(X, Y)) { if (!on(X, Y)) buffer.set(x0 + X, y + Y, deep); continue }
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (Math.abs(dx) + Math.abs(dy) <= 3 && solid(X + dx, Y + dy)) { near = true; break }
    if (near) buffer.set(x0 + X, y + Y, ink)
  }
  const bands = ['#fff6d8', mix('#fff6d8', accent, 0.25), mix('#fff6d8', accent, 0.55), mix(accent, '#ffffff', 0.15), accent, mix(accent, '#000000', 0.12)]
  for (let Y = 0; Y < h; Y += 1) {
    const band = Math.min(bands.length - 1, Math.floor((Y / h) * bands.length))
    for (let X = 0; X < W2; X += 1) if (on(X, Y)) buffer.set(x0 + X, y + Y, !on(X, Y - 1) ? mix(bands[band], '#ffffff', 0.55) : bands[band])
  }
}
/** How tall FIGHTER's title word stands, its depth and ink in. */
const titleWordHeight = (name: FighterLettering, width: number) => Math.round((width * maskOf(name).h) / maskOf(name).w) * 1.08 + 8

export type FighterTitleOptions = { frame?: number; blink?: boolean; best?: number }

/**
 * The title, after the owner's two pictures: the ninja's flying kick at the
 * burger samurai before the temple at night (traced), RANDOM over FIGHTER
 * leaning forward on its red stroke, PRESS START blinking on the paving.
 */
export function renderFighterTitle(layout: Layout, accent: string, options: FighterTitleOptions = {}): PixelBuffer {
  const { width: W, height: H } = FIGHTER_SCREEN[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, '#020a24')
  const wide = layout === 'landscape'
  const art = fighterArt(wide ? 'titleWide' : 'titleTall')
  if (art) buffer.data.set(art.data)
  else gradient(buffer, 0, 0, W, H, ['#020a24', '#06164a', '#0e2a6a', '#24305a'])
  // a few stars twinkling in the night
  for (let k = 0; k < (wide ? 18 : 30); k += 1) { const sx = (k * 137 + 41) % W, sy = (k * 59 + 13) % Math.round(H * (wide ? 0.3 : 0.45)); if ((frame + k) % 5 === 0) buffer.set(sx, sy, '#ffffff') }
  // on a tall screen the words lower in the night, PRESS START under them, clear of the fight
  const rw = 2
  drawRandomWord(buffer, W / 2, wide ? 10 : 112, rw, accent)
  const fw = wide ? 470 : 370, fy = wide ? 62 : 164
  drawFighterTitleWord(buffer, W / 2, fy, fw, accent)
  pressStart(buffer, W / 2, wide ? H - 34 : fy + titleWordHeight('fighter', fw) + 18, accent, options.blink !== false, 2)
  if (options.best) words(buffer, `BEST ${String(options.best).padStart(5, '0')}`, W / 2, fy + titleWordHeight('fighter', fw) + 6, CREAM)
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
  const place = fighterPlace(level), wide = layout === 'landscape'
  const bottom = BAR + stage, feet = bottom - Math.round(stage * 0.06)
  // the place, traced from the owner's picture, its fighters taken out
  const back = fighterArt(`play-${place}-${wide ? 'wide' : 'tall'}`)
  if (back) for (let y = 0; y < back.height; y += 1) buffer.data.set(back.data.subarray(y * back.width * 4, (y + 1) * back.width * 4), ((BAR + y) * W) * 4)
  else gradient(buffer, 0, BAR, W, stage, place === 'dusk' ? ['#2a2a6a', '#6a3a8a', '#e8806a', '#5a5a7a'] : ['#020a24', '#06164a', '#0e2a6a', '#3a4a6a'])
  // the fight, as the owner's pictures have the fighters: the ninja on guard, then in his flying kick; a burger ninja coming at him; the burger samurai on guard, then crouched to strike
  const kick = frame % 4 >= 2, strike = frame % 4 === 3
  const hero = fighterArt(kick ? 'ninja-kick' : 'ninja-guard'), sam = fighterArt(strike ? 'samurai-crouch' : 'samurai-guard'), little = fighterArt(frame % 2 ? 'burger-ninja-b' : 'burger-ninja-a')
  const sx = wide ? 274 : 170
  if (sam) { shadow(buffer, sx + sam.width * 0.5, feet, sam.width * 0.7); drawCut(buffer, sam, sx + (strike ? 18 : 0), feet - sam.height) }
  if (little && level >= 2) { const lx = wide ? 196 : 122; shadow(buffer, lx + little.width / 2, feet, little.width * 0.8); drawCut(buffer, little, lx - (frame % 2) * 4, feet - little.height) }
  const hx = wide ? 18 : -14
  shadow(buffer, hx + 70, feet, 110)
  if (hero) drawCut(buffer, hero, hx + (kick ? 40 : 0), feet - hero.height - (kick ? 34 : 0))
  if (level >= 3 && !kick) drawStar(buffer, (wide ? 230 : 150) - (frame % 2) * 14, feet - 70, 6, frame)
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

/** The title's picture as the ends' backdrop, darkened by `by` (0 to 1). */
function endBackdrop(buffer: PixelBuffer, layout: Layout, by: number): void {
  const art = fighterArt(layout === 'landscape' ? 'titleWide' : 'titleTall')
  if (art) buffer.data.set(art.data)
  else gradient(buffer, 0, 0, buffer.width, buffer.height, ['#020a24', '#06164a', '#0e2a6a', '#24305a'])
  const d = buffer.data
  for (let i = 0; i < d.length; i += 4) { d[i] *= 1 - by; d[i + 1] *= 1 - by; d[i + 2] *= 1 - by * 0.6 }
}

/** GAME OVER: the night darkened, GAME over OVER in the title's lettering, the score and the best, a burger ninja standing there. */
export function renderFighterOver(layout: Layout, accent: string, options: FighterEndOptions = {}): PixelBuffer {
  const { width: W, height: H } = FIGHTER_SCREEN[layout]
  const buffer = new PixelBuffer(W, H, '#000000')
  const wide = layout === 'landscape'
  endBackdrop(buffer, layout, 0.55)
  const gw = wide ? 300 : 300, gy = wide ? 24 : 80
  drawFighterTitleWord(buffer, W / 2, gy, gw, accent, 'game')
  const oy = gy + titleWordHeight('game', gw)
  drawFighterTitleWord(buffer, W / 2, oy, gw, accent, 'over')
  const y = oy + titleWordHeight('over', gw) + 10
  words(buffer, `SCORE ${String(options.score ?? 0).padStart(5, '0')}`, W / 2, y, CREAM, 2)
  words(buffer, `BEST ${String(options.best ?? 0).padStart(5, '0')}`, W / 2, y + 22, accent, 2)
  pressStart(buffer, W / 2, y + 48, accent, options.blink !== false, 1)
  const foe = fighterArt('burger-ninja-b')
  if (foe) drawCut(buffer, foe, Math.round(W / 2 - foe.width / 2), H - foe.height - (wide ? 16 : 40))
  return buffer
}

/** WINNER: the night, WINNER in the title's lettering, the score and the best, the ninja on guard, confetti in the colour. */
export function renderFighterWinner(layout: Layout, accent: string, options: FighterEndOptions = {}): PixelBuffer {
  const { width: W, height: H } = FIGHTER_SCREEN[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, '#000000')
  const wide = layout === 'landscape'
  endBackdrop(buffer, layout, 0.3)
  const ww = wide ? 470 : 360, wy = wide ? 30 : 90
  drawFighterTitleWord(buffer, W / 2, wy, ww, accent, 'winner')
  const y = wy + titleWordHeight('winner', ww) + 10
  words(buffer, `SCORE ${String(options.score ?? 0).padStart(5, '0')}`, W / 2, y, CREAM, 2)
  words(buffer, `BEST ${String(options.best ?? 0).padStart(5, '0')}`, W / 2, y + 22, accent, 2)
  pressStart(buffer, W / 2, y + 48, accent, options.blink !== false, 1)
  for (let k = 0; k < 90; k += 1) { const cx = (k * 131 + frame * 7) % W, cy = (k * 71 + frame * 11) % Math.round(H * 0.75); buffer.rect(cx, cy, 2, 3, k % 3 ? accent : CREAM) }
  const hero = fighterArt('ninja-guard')
  if (hero) drawCut(buffer, hero, Math.round(W / 2 - hero.width / 2), H - hero.height - (wide ? 16 : 40))
  return buffer
}
