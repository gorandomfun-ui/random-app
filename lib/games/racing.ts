/**
 * RANDOM RACING's title, a first proposal: the start of a road trip at
 * sunset. The road runs straight ahead and bends away toward a great sun
 * going down behind the mountains, a city far off on the left; palms stand
 * along it, black against the sky, edged in pink; a gantry spans it with
 * its five start lights; on the line, seen from behind, the three cars the
 * player chooses from — the red one, the burger, the yellow one — their
 * exhausts puffing. RACING in chrome over the sky, leaning forward, deep,
 * with speed lines, in the theme's colour; RANDOM, LEVEL, BEST and PRESS
 * START where the other games have them.
 */

import { CARS, CAR_BOX, drawCarRear } from './racing-cars'
import { RACING_LETTERING, type RacingLettering } from './racing-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { dim, dither, mix, PixelBuffer } from './pixels'
import { CREAM, infoLine, INK, pressStart } from './ui'

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
 * middle like a horizon, warm under it; deep toward the lower left as if it
 * had come from there; a cream edge, an ink outline; speed lines trailing.
 */
function logoPixels(name: RacingLettering, width: number, accent: string): Array<[number, number, string]> {
  const key = `${name}|${width}|${accent}`
  let out = logos.get(key)
  if (out) return out
  const f = face(name, width, 0.14)
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

/** RACING, its top left about `x`, `y`, `width` wide, with its speed lines to the left; frame moves the glint. */
function drawRacingLogo(buffer: PixelBuffer, cx: number, y: number, width: number, accent: string, name: RacingLettering, frame: number): void {
  const px = logoPixels(name, width, accent)
  let w = 0, h = 0
  for (const [x, yy] of px) { w = Math.max(w, x + 1); h = Math.max(h, yy + 1) }
  const x0 = Math.round(cx - w / 2)
  // the speed lines first, behind: streaks leaving the word's left side, from where its first letter starts on that row
  // (Faster One draws its own in its letters)
  const lines = name === 'faster' ? [] : [0.22, 0.38, 0.58, 0.74, 0.86]
  lines.forEach((t, i) => {
    const row = Math.round(h * t)
    const first = px.reduce((m, [x, yy, c]) => (yy === row && c !== INK && x < m ? x : m), w)
    const ly = y + row, len = Math.round(width * (0.16 + (i % 3) * 0.07)), from = x0 + first - 3
    for (let k = 0; k < len; k += 1) {
      const a = 1 - k / len
      if (!dither(from - k, ly, a)) continue
      buffer.set(from - k, ly, k < len * 0.3 ? CREAM : mix(accent, '#ffffff', 0.3))
      if (i % 2 === 0 && k < len * 0.6) buffer.set(from - k, ly + 1, dim(accent, 0.6))
    }
  })
  for (const [x, yy, c] of px) buffer.set(x0 + x, y + yy, c)
  // a glint running across the chrome
  const g = (frame * 37) % (w + 80) - 40
  for (const [x, yy, c] of px) if (c !== INK && c !== CREAM && Math.abs(x - yy * 0.5 - g) < 3) buffer.set(x0 + x, y + yy, mix(c, '#ffffff', 0.65))
}

// ---------------------------------------------------------------- the scene

/** Where things stand on each screen. */
const STAGE: Record<Layout, { horizon: number; bend: number; near: number; sun: number; logoY: number; logoW: number; randomY: number; carScale: number; carY: number; gap: number; gantry: number; press: number; info: 'top' | 'bottom' }> = {
  landscape: { horizon: 214, bend: 46, near: 330, sun: 80, logoY: 54, logoW: 470, randomY: 14, carScale: 1.05, carY: 330, gap: 32, gantry: 0.36, press: 300, info: 'top' },
  portrait: { horizon: 420, bend: 34, near: 250, sun: 72, logoY: 120, logoW: 380, randomY: 64, carScale: 0.8, carY: 622, gap: 10, gantry: 0.32, press: 712, info: 'bottom' },
}

const SKY = ['#1c0c3a', '#2a1048', '#3a1458', '#5a1a6a', '#8a2a7a', '#c03a7a', '#ff5a6a', '#ff8a5a', '#ffb060']

/** The sky at sunset, in bands dithered into one another, and a few stars high up. */
function sky(buffer: PixelBuffer, horizon: number): void {
  const W = buffer.width
  for (let y = 0; y < horizon; y += 1) {
    const t = (y / horizon) ** 1.15 * (SKY.length - 1), i = Math.floor(t), f = t - i
    const a = SKY[i], b = SKY[Math.min(SKY.length - 1, i + 1)]
    for (let x = 0; x < W; x += 1) buffer.set(x, y, dither(x, y, f) ? b : a)
  }
  for (let k = 0; k < 40; k += 1) {
    const x = (k * 197) % W, y = (k * 71) % Math.round(horizon * 0.45)
    buffer.set(x, y, k % 5 === 0 ? '#ffffff' : '#c8a0e0')
  }
}

/** The sun going down at the road's end: yellow at the top, pink at the foot, cut by bands that widen toward the horizon. */
function sun(buffer: PixelBuffer, cx: number, horizon: number, r: number): void {
  for (let y = horizon - r; y < horizon; y += 1) {
    const t = (y - (horizon - r)) / r
    // the cuts: thin high up, wider lower down
    const u = t * 9
    if (t > 0.42 && u - Math.floor(u) < 0.18 + (t - 0.42) * 0.9) continue
    const half = Math.sqrt(Math.max(0, r * r - (horizon - y) ** 2))
    const c = mix('#fff27a', '#ff4a8a', t ** 1.2)
    for (let x = Math.round(cx - half); x <= cx + half; x += 1) buffer.set(x, y, dither(x, y, 0.15) ? mix(c, '#ffffff', 0.3) : c)
  }
  // its glow in the sky round it
  for (let y = horizon - r * 1.7; y < horizon; y += 1) for (let x = Math.round(cx - r * 1.8); x < cx + r * 1.8; x += 1) {
    const d = Math.hypot(x - cx, (y - horizon) * 1.2) / r
    if (d > 1 && d < 1.8 && dither(x, Math.round(y), (1.8 - d) * 0.35)) buffer.tint(x, Math.round(y), '#ffb07a', 0.35)
  }
}

/** Long thin clouds, dark with their undersides lit pink by the sun, drifting slowly. */
function clouds(buffer: PixelBuffer, horizon: number, frame: number): void {
  const W = buffer.width
  const streaks: Array<[number, number, number, number]> = [[0.12, 0.6, 130, 3], [0.6, 0.68, 170, 3.5], [0.34, 0.79, 110, 2.5], [0.78, 0.84, 90, 2.5]]
  streaks.forEach(([fx, fy, len, ry], i) => {
    const cy = Math.round(horizon * fy), cx = ((fx * W + frame * (1 + (i % 2))) % (W + len)) - len / 2
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) for (let dx = -len / 2; dx <= len / 2; dx += 1) {
      const q = (dx / (len / 2)) ** 2 + (dy / ry) ** 2
      if (q > 1 || !dither(Math.round(cx + dx), cy + dy, Math.min(1, (1 - q) * 3))) continue
      buffer.set(Math.round(cx + dx), cy + dy, dy >= Math.ceil(ry) - 1 ? '#ff8aa0' : dy > 0 ? '#a83a7a' : '#5a1a5a')
    }
  })
}

/** The mountains far off along the horizon, lit pink on their left slopes; a city on the left. */
function mountains(buffer: PixelBuffer, horizon: number): void {
  const W = buffer.width
  const peak = (x: number, seed: number) => Math.abs(Math.sin(x * 0.013 + seed) * 26 + Math.sin(x * 0.041 + seed * 2) * 12 + Math.sin(x * 0.11 + seed) * 3)
  for (let x = 0; x < W; x += 1) {
    const far = Math.round(peak(x, 1.3) * 0.9 + 6), near = Math.round(peak(x + 400, 4.1) * 0.55)
    for (let y = horizon - far; y < horizon; y += 1) buffer.set(x, y, y < horizon - far + 2 && peak(x - 1, 1.3) < peak(x, 1.3) ? '#ff7a8a' : '#5a1a6a')
    for (let y = horizon - near; y < horizon; y += 1) buffer.set(x, y, y < horizon - near + 1 && peak(x + 399, 4.1) < peak(x + 400, 4.1) ? '#c84a7a' : '#3a0e4a')
  }
  // the city on the left: towers dark against the glow, a few windows lit
  let x = 8
  for (let k = 0; k < 14 && x < W * 0.24; k += 1) {
    const w = 8 + ((k * 7) % 9), h = 18 + ((k * 13) % 34)
    buffer.rect(x, horizon - h, w, h, '#2a0a3a')
    for (let wy = horizon - h + 3; wy < horizon - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if ((wx * 31 + wy * 17) % 5 === 0) buffer.set(wx, wy, '#ffd27a')
    if (k === 5) { buffer.rect(x + w / 2, horizon - h - 22, 2, 22, '#2a0a3a'); buffer.set(x + w / 2, horizon - h - 23, '#ff4a4a') }
    x += w + 1
  }
}

type Road = { horizon: number; height: number; centre: (y: number) => number; half: (y: number) => number; band: (y: number) => number }
/** The road: its middle bending right toward the horizon, its half width, its stripe of depth (even or odd) at a row. */
function roadOf(W: number, H: number, horizon: number, bend: number, near: number): Road {
  const depth = H - horizon
  const p = (y: number) => (y - horizon) / depth
  return {
    horizon, height: depth,
    centre: (y) => W / 2 + bend * (1 - p(y)) ** 2.2,
    half: (y) => 6 + p(y) * near,
    // the distance a row stands for, cut in equal stretches: the stripes narrow toward the horizon
    band: (y) => Math.floor(9 / (p(y) + 0.06)) % 2,
  }
}

/** The plain in stripes of two sands, misty toward the horizon; the road in stripes of two greys with its kerbs red and white and its middle line, as far as the cars (`lineTo`). */
function ground(buffer: PixelBuffer, road: Road, lineTo: number): void {
  const W = buffer.width, H = buffer.height
  for (let y = road.horizon; y < H; y += 1) {
    const p = (y - road.horizon) / road.height, band = road.band(y)
    const haze = Math.max(0, 1 - p * 4) * 0.55
    const sand = mix(band ? '#c8704a' : '#b86240', '#ff9a7a', haze)
    const tar = mix(band ? '#4a4058' : '#40384e', '#9a6a8a', haze)
    const c = road.centre(y), half = road.half(y), kerb = half * 0.09, line = Math.max(1, half * 0.022)
    for (let x = 0; x < W; x += 1) {
      const d = Math.abs(x - c)
      let col = sand
      if (d < half) col = d > half - kerb ? (band ? mix('#e0302a', '#ff9a7a', haze) : mix('#f0eadc', '#ffc8b8', haze)) : band && d < line && y < lineTo ? '#f0eadc' : tar
      buffer.set(x, y, col)
    }
  }
}

/** A palm, black against the sunset with a pink rim on its left: a curved trunk in rings, fronds hanging. */
function palm(buffer: PixelBuffer, x: number, base: number, size: number, lean: number): void {
  const dark = '#22082e', rim = '#ff6a9a'
  const h = size, top: [number, number] = [x + lean * h * 0.35, base - h]
  for (let t = 0; t <= 1; t += 1 / h) {
    const px = x + lean * h * 0.35 * t * t, py = base - h * t, w = Math.max(1, size * 0.045 * (1.2 - t * 0.4))
    for (let k = -w; k <= w; k += 1) buffer.set(Math.round(px + k), Math.round(py), k <= -w + 0.5 ? rim : dark)
  }
  // the fronds: arcs out from the crown, drooping at their ends
  for (let i = 0; i < 9; i += 1) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + (i % 2) * 0.08
    const len = size * (0.42 + (i % 3) * 0.06)
    for (let t = 0; t <= 1; t += 1 / len) {
      const fx = top[0] + Math.cos(a) * len * t, fy = top[1] + Math.sin(a) * len * t + t * t * len * 0.55
      const w = Math.max(0.6, size * 0.03 * (1 - t))
      for (let k = -w; k <= w; k += 1) buffer.set(Math.round(fx), Math.round(fy + k), k <= -w + 0.5 && Math.cos(a) < 0.2 ? rim : dark)
      // the leaflets hanging from it
      if (Math.round(t * len) % 3 === 0 && t > 0.15) for (let d = 1; d < size * 0.07 * (1 - t * 0.5); d += 1) buffer.set(Math.round(fx + Math.cos(a) * d * 0.3), Math.round(fy + d), dark)
    }
  }
}

/** The gantry over the road: two posts, a beam in black and white checks, START and the five lights. */
function gantry(buffer: PixelBuffer, road: Road, p: number, frame: number): void {
  const y = Math.round(road.horizon + p * road.height), c = road.centre(y), half = road.half(y)
  const scale = half / 160, postH = Math.round(118 * scale), beamH = Math.max(10, Math.round(26 * scale))
  const left = Math.round(c - half - 8 * scale), right = Math.round(c + half + 8 * scale), top = y - postH
  for (const px of [left, right]) {
    buffer.rect(px - 3, top, 6, postH, INK)
    buffer.rect(px - 2, top, 4, postH, '#8a8aa0')
    buffer.rect(px - 2, top, 1, postH, '#c8c8dc')
  }
  buffer.rect(left - 4, top - 2, right - left + 8, beamH + 4, INK)
  const sq = Math.max(3, Math.round(beamH / 3))
  for (let yy = 0; yy < beamH; yy += 1) for (let xx = left - 2; xx < right + 2; xx += 1) buffer.set(xx, top + yy, (Math.floor((xx - left) / sq) + Math.floor(yy / sq)) % 2 ? '#f0eadc' : '#1a1a22')
  // the panel in the middle: the lights, red one after the other, then all green
  const n = 5, lw = Math.max(5, Math.round(beamH * 0.5)), panelW = n * (lw + 4) + 8, px0 = Math.round(c - panelW / 2)
  buffer.rect(px0 - 1, top - 2, panelW + 2, beamH + 4, INK)
  buffer.rect(px0, top - 1, panelW, beamH + 2, '#22222c')
  const step = frame % 8
  for (let i = 0; i < n; i += 1) {
    const lx = px0 + 6 + i * (lw + 4) + lw / 2, ly = top + beamH / 2
    const on = step >= 6 ? '#5aff7a' : i < step ? '#ff3a2a' : '#4a1a1a'
    buffer.disc(lx, ly, lw / 2 + 0.5, '#0a0a12')
    buffer.disc(lx, ly, lw / 2 - 0.5, on)
    if (on !== '#4a1a1a') buffer.disc(lx - lw * 0.15, ly - lw * 0.15, lw * 0.15, '#ffffff')
  }
}

/** The start line across the road, two rows of checks. */
function startLine(buffer: PixelBuffer, road: Road, y: number): void {
  const half = road.half(y), c = road.centre(y), sq = Math.max(3, Math.round(half / 26))
  for (let yy = 0; yy < sq * 2; yy += 1) for (let x = Math.round(c - half * 0.91); x < c + half * 0.91; x += 1) buffer.set(x, y + yy, (Math.floor((x - c) / sq) + Math.floor(yy / sq)) % 2 ? '#f0eadc' : '#1a1a22')
}

/** A puff from an exhaust, low by the road, swelling and thinning as it drifts out, one moment after another. */
function puff(buffer: PixelBuffer, x: number, y: number, dir: number, frame: number, seed: number): void {
  const age = (frame + seed) % 5, r = 2 + age * 1.6
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
    const q = (dx * dx + dy * dy) / (r * r)
    if (q <= 1) buffer.tint(Math.round(x + dir * age * 3 + dx), Math.round(y + age * 0.6 + dy * 0.6), '#e8dcf0', 0.42 * (1 - age / 5) * (1 - q * 0.5))
  }
}
export type RacingTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean }

/** RANDOM RACING's title, wide (768 × 432) or tall (432 × 768). */
export function renderRacingTitle(layout: Layout, accent: string, lettering: RacingLettering = 'sans', options: RacingTitleOptions = {}): PixelBuffer {
  const wide = layout === 'landscape'
  const W = wide ? 768 : 432, H = wide ? 432 : 768
  const st = STAGE[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, INK)
  const road = roadOf(W, H, st.horizon, st.bend, st.near)
  sky(buffer, st.horizon)
  sun(buffer, road.centre(st.horizon + 1), st.horizon, st.sun)
  clouds(buffer, st.horizon, frame)
  mountains(buffer, st.horizon)
  // the middle line as far as PRESS START on a wide screen, the cars on a tall one
  ground(buffer, road, st.info === 'top' ? st.press - 6 : st.carY)
  // the palms along both sides, far ones first
  const ps = [0.06, 0.12, 0.2, 0.32, 0.5, 0.78]
  ps.forEach((p, i) => {
    const y = Math.round(st.horizon + p * road.height), half = road.half(y), size = Math.max(10, half * 0.95)
    palm(buffer, road.centre(y) - half - size * 0.35, y, size, -0.6 - (i % 2) * 0.2)
    palm(buffer, road.centre(y) + half + size * 0.35, y, size, 0.6 + (i % 2) * 0.2)
  })
  gantry(buffer, road, st.gantry, frame)
  // the three cars on the line, the burger in the middle, each puffing
  const s = st.carScale, cw = CAR_BOX.w * s, ch = CAR_BOX.h * s
  startLine(buffer, road, Math.round(st.carY - 6 * s))
  CARS.forEach((kind, i) => {
    const x = Math.round(W / 2 + (i - 1) * (cw + st.gap) - cw / 2), bob = (frame + i) % 3 === 0 ? 1 : 0
    drawCarRear(buffer, kind, x, st.carY + bob, s, frame + i)
    // the exhausts' puffs, by the pipes, low over the road
    puff(buffer, x + cw * (kind === 'giallo' ? 0.22 : 0.33), st.carY + ch * 0.9, -1, frame, i * 2)
    puff(buffer, x + cw * (kind === 'giallo' ? 0.78 : 0.67), st.carY + ch * 0.9, 1, frame, i * 2 + 1)
  })
  // RANDOM, then RACING over the sky
  const rx = Math.round(W / 2 - LOGO_WIDTH)
  drawLogo(buffer, rx + 3, st.randomY + 4, INK, 2)
  drawLogo(buffer, rx, st.randomY, mix(accent, CREAM, 0.25), 2)
  drawRacingLogo(buffer, W / 2, st.logoY, st.logoW, accent, lettering, frame)
  if (options.press !== false) pressStart(buffer, W / 2, st.press, accent, options.blink !== false, 2)
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
