/**
 * RANDOM RACING's screens, after the owner's picture: traced from it
 * (`scripts/games/racing-trace.ts`, files in `public/games/racing/`).
 *
 * The title is the picture itself — the coast road at sunset, the sun going
 * down into the sea, the city, the neon diner, the people at the rail, the
 * palms, the three cars from behind — wide, or tall for a phone with the sky
 * carried up for the title. The sea glitters, the diner's neon flickers, the
 * cars' exhausts puff. Over it, RANDOM, and RACING in chrome in the theme's
 * colour, leaning forward with its speed lines and its chequered strip;
 * LEVEL, BEST and PRESS START where the other games have them.
 *
 * A moment of play (a proposal, not playable yet): the picture's far view —
 * the sky, the sun on the sea, the mountains, the city — over the road drawn
 * in the picture's own colours, bending right along the coast: its kerbs,
 * its rails, the picture's palms and red chevrons by it, getting nearer;
 * rivals ahead, the player's car at the foot of it, all three cars the
 * picture's own; the bar on top — TIME, SPEED, the stage, the place — and on
 * a touch screen the arrows on the left, A (gas) and B (brake) on the right.
 */

import { RACING_MOTION } from './racing-art-data'
import { racingArt, type RacingCarKind } from './racing-art'
import { RACING_LETTERING, type RacingLettering } from './racing-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { dim, dither, drawText, drawText7, mix, PixelBuffer, text7Width, textWidth } from './pixels'
import { CREAM, GREY, HUD_HEIGHT, infoLine, INK, pressStart } from './ui'

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

/**
 * RACING, centred on `cx`, its top at `y`, `width` wide: speed lines
 * trailing from its letters' left side, long and short, some thick; a
 * chequered strip under its right half; a glint running across the chrome.
 */
function drawRacingLogo(buffer: PixelBuffer, cx: number, y: number, width: number, accent: string, name: RacingLettering, frame: number): void {
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
  const sq = Math.max(3, Math.round(h * 0.07)), sy = y + h - Math.round(sq * 0.5), from = x0 + Math.round(w * 0.56), to = x0 + Math.round(w * 0.93)
  for (let r = -1; r <= sq * 2; r += 1) for (let x = from - 1; x <= to + 1; x += 1) {
    const X = x - Math.round(r * 0.2)
    const inside = r >= 0 && r < sq * 2 && x >= from && x < to
    buffer.set(X, sy + r, inside ? ((Math.floor((x - from) / sq) + Math.floor(r / sq)) % 2 ? CREAM : '#1a1a22') : INK)
  }
  // a glint running across the chrome
  const g = (frame * 37) % (w + 80) - 40
  for (const [x, yy, c] of px) if (c !== INK && c !== CREAM && Math.abs(x - yy * 0.5 - g) < 3) buffer.set(x0 + x, y + yy, mix(c, '#ffffff', 0.65))
}

// ---------------------------------------------------------------- the traced pictures

/** A traced picture's pixels onto the buffer at `x`, `y`, leaving out its clear ones; drawn `w` × `h` (each pixel taken from the nearest), its own size if not given. */
function art(buffer: PixelBuffer, pic: PixelBuffer, x: number, y: number, w = pic.width, h = pic.height): void {
  const sx = pic.width / w, sy = pic.height / h, d = buffer.data, s = pic.data
  for (let yy = 0; yy < h; yy += 1) {
    const ty = Math.round(y + yy)
    if (ty < 0 || ty >= buffer.height) continue
    const py = Math.min(pic.height - 1, Math.floor((yy + 0.5) * sy))
    for (let xx = 0; xx < w; xx += 1) {
      const tx = Math.round(x + xx)
      if (tx < 0 || tx >= buffer.width) continue
      const o = (py * pic.width + Math.min(pic.width - 1, Math.floor((xx + 0.5) * sx))) * 4
      if (s[o + 3] < 128) continue
      const t = (ty * buffer.width + tx) * 4
      d[t] = s[o]; d[t + 1] = s[o + 1]; d[t + 2] = s[o + 2]; d[t + 3] = 255
    }
  }
}

/** A car seen from behind, its picture nearest the width asked for, drawn that wide, its foot at `y` and its middle at `cx`. */
function car(buffer: PixelBuffer, kind: RacingCarKind, cx: number, foot: number, width: number): void {
  const size = width > 112 ? 130 : width > 70 ? 104 : 60
  const pic = racingArt(`car-${kind}-${size}`)
  if (!pic) return
  const w = Math.round(width * (kind === 'burger' ? 0.78 : 1)), h = Math.round((pic.height * w) / pic.width)
  art(buffer, pic, Math.round(cx - w / 2), Math.round(foot - h), w, h)
}

/** A puff from an exhaust, low by the road, swelling and thinning as it drifts out, one moment after another. */
function puff(buffer: PixelBuffer, x: number, y: number, dir: number, frame: number, seed: number): void {
  const age = (frame + seed) % 5, r = 2 + age * 1.6
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
    const q = (dx * dx + dy * dy) / (r * r)
    if (q <= 1) buffer.tint(Math.round(x + dir * age * 3 + dx), Math.round(y + age * 0.6 + dy * 0.6), '#e8dcf0', 0.38 * (1 - age / 5) * (1 - q * 0.5))
  }
}

// ---------------------------------------------------------------- the title

/** Where the words stand on each title, over the picture's sky; where the picture had them. */
const TITLE: Record<Layout, { randomY: number; logoY: number; logoW: number; cx: number; press: number; info: 'top' | 'bottom' }> = {
  landscape: { randomY: 24, logoY: 74, logoW: 446, cx: 388, press: 386, info: 'top' },
  portrait: { randomY: 112, logoY: 168, logoW: 384, cx: 216, press: 704, info: 'bottom' },
}

export type RacingTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean }

/** RANDOM RACING's title, wide (768 × 432) or tall (432 × 768). */
export function renderRacingTitle(layout: Layout, accent: string, lettering: RacingLettering = 'sans', options: RacingTitleOptions = {}): PixelBuffer {
  const wide = layout === 'landscape'
  const W = wide ? 768 : 432, H = wide ? 432 : 768
  const st = TITLE[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, '#1a0c34')
  const pic = racingArt(wide ? 'titleWide' : 'titleTall')
  if (pic) buffer.data.set(pic.data)
  else for (let y = 0; y < H; y += 1) buffer.rect(0, y, W, 1, mix('#1a0c34', '#ff7a5a', (y / H) ** 1.5))
  if (pic) {
    const m = RACING_MOTION[wide ? 'wide' : 'tall']
    // the sea glitters: a few of its bright points at a time, white, the others dimmed
    m.sea.forEach(([x, y], i) => { const k = (i * 7 + frame) % 5; if (k === 0) buffer.set(x, y, '#ffffff'); else if (k === 3) buffer.tint(x, y, '#1a6a9a', 0.45) })
    // the diner's neon flickers now and then
    if (frame % 9 === 8) buffer.shade(m.neon[0], m.neon[1], m.neon[2] - m.neon[0], m.neon[3] - m.neon[1], 0.62)
    // the exhausts puff, outward from each car
    m.exhausts.forEach(([x, y], i) => puff(buffer, x, y, i % 2 ? 1 : -1, frame, i * 2))
  }
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

// ---------------------------------------------------------------- a moment of play

/** The road's colours, taken from the picture. */
const ROAD = {
  tar: ['#252645', '#2b2b4a'], line: '#d5bca5',
  kerb: ['#f99259', '#d8744a'], rail: '#8c7b8b', railTop: '#d5bca5', post: '#1c2474',
  bush: ['#1f4a3a', '#26573f', '#16382c'], sea: ['#0998b1', '#047ba5', '#13b0c4'], glint: '#d8faff', sand: ['#f0a07a', '#e08c6a'],
}
/** A number from 0 to 1 for a pixel, always the same. */
const grain = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

/** The road on a board: its middle bending right toward the horizon, its half width, its stretch (even or odd) at a row, `scroll` bringing the stretches nearer. */
type Road = { horizon: number; depth: number; p: (y: number) => number; centre: (y: number) => number; half: (y: number) => number; band: (y: number) => number; y: (p: number) => number }
function roadOf(W: number, H: number, horizon: number, bend: number, near: number, scroll: number): Road {
  const depth = H - horizon
  const p = (y: number) => Math.max(0, (y - horizon) / depth)
  return {
    horizon, depth, p,
    centre: (y) => W / 2 + bend * (1 - p(y)) ** 2.3,
    half: (y) => 3 + p(y) * near,
    band: (y) => Math.floor(10 / (p(y) + 0.05) + scroll) % 2,
    y: (q) => Math.round(horizon + q * depth),
  }
}

/** The ground row by row: on the left the sea to its shore, then the beach; on the right the bushes; the kerbs in two salmons; the road in two greys with its edges and its two dashed lanes. */
function ground(buffer: PixelBuffer, road: Road, sea: number, frame: number): void {
  const W = buffer.width, H = buffer.height
  for (let y = road.horizon; y < H; y += 1) {
    const band = road.band(y), c = road.centre(y), half = road.half(y)
    const kerb = half * 0.13, edge = Math.max(1, half * 0.022), lane = Math.max(1, half * 0.02)
    for (let x = 0; x < W; x += 1) {
      const d = x - c, ad = Math.abs(d)
      let col: string
      if (ad < half) col = Math.abs(ad - (half - edge * 2.5)) < edge ? ROAD.line : band && Math.abs(ad - half / 3) < lane ? ROAD.line : ROAD.tar[band]
      else if (ad < half + kerb) col = ROAD.kerb[band]
      else if (d < 0 && y < sea) {
        // the sea in its bands, glittering here and there, a little more each moment somewhere else
        const g = grain(x, y + frame * 7)
        col = g > 0.985 ? ROAD.glint : ROAD.sea[(y - road.horizon) % 4 === 0 ? 1 : g > 0.7 ? 2 : 0]
      } else if (d < 0) col = ROAD.sand[grain(x >> 1, y) > 0.6 ? 1 : 0]
      else { const g = grain(x >> 1, y >> 1); col = ROAD.bush[g > 0.82 ? 2 : g > 0.45 ? 1 : 0] }
      buffer.set(x, y, col)
    }
  }
}

/** The rails along both sides of the road, past the kerbs, their posts at each stretch. */
function rails(buffer: PixelBuffer, road: Road): void {
  let last = -1
  for (let y = road.horizon + 2; y < buffer.height; y += 1) {
    const p = road.p(y), h = Math.round(2 + p * 20), t = Math.max(1, Math.round(p * 5))
    const post = road.band(y) !== last
    last = road.band(y)
    for (const side of [-1, 1]) {
      const x = Math.round(road.centre(y) + side * road.half(y) * 1.16)
      for (let k = 0; k < t; k += 1) buffer.rect(x - Math.round(p * 4), y - h + k, Math.max(2, Math.round(p * 9)), 1, k === 0 ? ROAD.railTop : ROAD.rail)
      if (post) buffer.rect(x - Math.max(1, Math.round(p * 2)), y - h + t, Math.max(1, Math.round(p * 4)), h - t, ROAD.post)
    }
  }
}

/** The play boards, under the bar: wide 448 × 320, tall 320 × 448, as the other games'. */
const PLAY: Record<Layout, { horizon: number; bend: number; near: number; sea: number; carFoot: number }> = {
  landscape: { horizon: 134, bend: 150, near: 240, sea: 176, carFoot: 312 },
  portrait: { horizon: 196, bend: 100, near: 190, sea: 246, carFoot: 438 },
}
/** A car's width on the road at a row: about a quarter of the road's width there. */
const carWidthAt = (road: Road, y: number) => road.half(y) * 2 * 0.27

export type RacingPlayOptions = { frame?: number; car?: RacingCarKind; pad?: boolean }

/**
 * A moment of play, as a proposal: the picture's far view over the road,
 * the road rolling toward the viewer with its rails, the picture's palms
 * and chevrons by it; two rivals ahead, small with the distance; the
 * player's car at the foot of the road, swaying in the bend; TIME, SPEED,
 * the stage, the place; the controls under it on a tall board.
 */
export function renderRacingPlay(layout: Layout, accent: string, options: RacingPlayOptions = {}): PixelBuffer {
  const wide = layout === 'landscape'
  const bw = wide ? 448 : 320, bh = wide ? 320 : 448
  const pad = options.pad ?? !wide
  const frame = options.frame ?? 0, st = PLAY[layout]
  const out = new PixelBuffer(bw, HUD_HEIGHT + bh + (pad ? 96 : 0), INK)
  const board = new PixelBuffer(bw, bh, '#2a0e4a')
  // the far view, its foot on the horizon, a little to the side as the road bends; the sky carried up over a tall board
  const back = racingArt('playBack')
  if (back) {
    const shift = Math.round((bw - back.width) / 2 + Math.sin(frame * 0.05) * 6)
    const top = st.horizon - back.height
    for (let y = 0; y < top; y += 1) for (let x = 0; x < bw; x += 1) { const o = Math.min(back.width - 1, Math.max(0, x - shift)) * 4; board.set(x, y, mix(`#${[back.data[o], back.data[o + 1], back.data[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`, '#1a0a34', ((top - y) / Math.max(1, top)) ** 1.2)) }
    art(board, back, shift, top)
  }
  const road = roadOf(bw, bh, st.horizon, st.bend, st.near, frame * 0.9)
  ground(board, road, st.sea, frame)
  rails(board, road)
  // what stands by the road, far ones first: the chevrons on the sea side, the palms on both, coming nearer
  const palm = racingArt('palm'), chevron = racingArt('chevron')
  const things: Array<[number, 'palm' | 'chevron', number]> = []
  for (let k = 0; k < 6; k += 1) {
    const q = ((k / 6 + frame * 0.012) % 1) ** 2
    things.push([q, 'palm', k % 2 ? 1 : -1])
    if (k % 2 === 0) things.push([((k / 6 + 0.08 + frame * 0.012) % 1) ** 2, 'chevron', -1])
  }
  things.sort((a, b) => a[0] - b[0])
  for (const [q, kind, side] of things) {
    const y = road.y(q), x = road.centre(y) + side * road.half(y) * (kind === 'palm' ? 1.45 : 1.25)
    const pic = kind === 'palm' ? palm : chevron
    if (!pic || q < 0.01) continue
    const h = Math.round(pic.height * q * (kind === 'palm' ? 2.2 : 1.6)), w = Math.max(1, Math.round((pic.width * h) / pic.height))
    if (h < 3) continue
    art(board, pic, Math.round(x - w / 2), y - h, w, h)
  }
  // the rivals ahead, small with the distance, each in its lane; then the player's own car, swaying a little in the bend
  const me = options.car ?? 'burger'
  const rivals: Array<[RacingCarKind, number, number]> = [[me === 'rosso' ? 'burger' : 'rosso', 0.16, -0.36], [me === 'giallo' ? 'burger' : 'giallo', 0.34, 0.34]]
  for (const [kind, q, lane] of rivals) { const y = road.y(q); car(board, kind, road.centre(y) + lane * road.half(y) * 0.66, y + 2, carWidthAt(road, y)) }
  const sway = Math.round(Math.sin(frame * 0.7) * 3), mine = carWidthAt(road, st.carFoot)
  car(board, me, bw / 2 + sway, st.carFoot, mine)
  puff(board, bw / 2 + sway - mine * 0.28, st.carFoot - 6, -1, frame, 0)
  puff(board, bw / 2 + sway + mine * 0.28, st.carFoot - 6, 1, frame, 2)
  out.data.set(board.data, HUD_HEIGHT * bw * 4)
  racingHud(out, accent, 47 - (frame % 47), 212 + (frame % 5) * 3, ((frame % 40) + 10) / 60, 2, 4)
  if (pad) racingPad(out, HUD_HEIGHT + bh)
  return out
}

/** The bar on top: TIME counting down, SPEED, the stage's progress as a little road, the place among the rivals. */
function racingHud(buffer: PixelBuffer, accent: string, time: number, speed: number, progress: number, place: number, of: number): void {
  const W = buffer.width
  buffer.rect(0, 0, W, HUD_HEIGHT, '#07070e')
  buffer.rect(0, HUD_HEIGHT - 1, W, 1, dim(accent, 0.55))
  drawText(buffer, 'TIME', 8, 3, GREY)
  drawText7(buffer, String(time).padStart(2, '0'), 8, 11, time <= 10 ? '#ff5a4a' : CREAM, 1, true)
  const sp = `${String(speed).padStart(3, ' ')} KM/H`
  drawText(buffer, 'SPEED', Math.round(W * 0.27), 3, GREY)
  drawText7(buffer, sp, Math.round(W * 0.27), 11, CREAM, 1, true)
  // the stage: a line from start to finish, the car's dot on it
  const bx = Math.round(W * 0.52), bw = Math.round(W * 0.24)
  drawText(buffer, 'STAGE', bx, 3, GREY)
  buffer.rect(bx, 14, bw, 3, '#2a2a3a')
  buffer.rect(bx, 14, Math.round(bw * progress), 3, accent)
  buffer.rect(bx + bw - 2, 11, 3, 9, CREAM)
  buffer.disc(bx + bw * progress, 15.5, 2.5, CREAM)
  const pl = `${place}/${of}`
  drawText(buffer, 'POS', W - 8 - textWidth('POS'), 3, GREY)
  drawText7(buffer, pl, W - 8 - text7Width(pl, 1, true), 11, place === 1 ? '#ffd23f' : CREAM, 1, true)
}

/** The controls under the board on a touch screen: the arrows on the left, A (gas) and B (brake) on the right. */
function racingPad(buffer: PixelBuffer, top: number): void {
  const W = buffer.width, h = buffer.height - top, cy = top + h / 2, a = 60
  for (const [x, dir] of [[14, -1], [24 + a, 1]] as const) {
    buffer.rect(x + 1, cy - a / 2 + 4, a, a, INK)
    buffer.rect(x, cy - a / 2, a, a, '#262a3c')
    buffer.rect(x, cy - a / 2, a, 1, '#3c4260')
    const cx = x + a / 2, sz = Math.round(a * 0.2)
    for (let i = 0; i <= sz; i += 1) buffer.rect(Math.round(cx - dir * (sz / 2) + dir * i) - (dir < 0 ? 1 : 0), Math.round(cy - (sz - i)), 2, (sz - i) * 2 + 1, CREAM)
  }
  // B (brake) a little lower and further in, A (gas) further out and higher, as a thumb rests
  for (const [label, x, y, color] of [['B', W - 104, cy + 10, '#3a7aff'], ['A', W - 44, cy - 10, '#2ac05a']] as const) {
    buffer.disc(x + 1, y + 4, 26, INK)
    buffer.disc(x, y, 26, dim(color, 0.5))
    buffer.disc(x - 1, y - 1, 23, color)
    buffer.disc(x - 8, y - 9, 7, mix(color, '#ffffff', 0.45))
    const tw = text7Width(label, 2, true)
    drawText7(buffer, label, Math.round(x - tw / 2) + 1, y - 6, INK, 2, true)
    drawText7(buffer, label, Math.round(x - tw / 2), y - 7, CREAM, 2, true)
  }
}

