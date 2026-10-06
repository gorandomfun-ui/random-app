/**
 * RANDOM RACING's screens, after the owner's picture made simple, in the
 * manner of the old arcade racers: flat bands of colour, few details.
 *
 * The title: a coast road at sunset. The sun goes down into the sea on the
 * left, behind low mountains; the road comes from the front, three lanes
 * wide, and bends right along the shore toward the city; a guardrail and
 * red chevrons on the sea side, the grass, palms and a neon diner on the
 * other; big palms frame it all. On the road, seen from behind, the three
 * cars the player chooses from — the red one, the burger on its wheels,
 * the yellow one. RACING in chrome over the sky, leaning forward, with
 * speed lines and a chequered strip, in the theme's colour; RANDOM, LEVEL,
 * BEST and PRESS START where the other games have them.
 *
 * A moment of play (a proposal, not playable yet): the same coast under
 * the bar — TIME, SPEED, the stage's progress, the place among the rivals —
 * the player's car at the foot of the road, rivals and traffic ahead; on a
 * touch screen, the arrows on the left and A (gas) and B (brake) on the
 * right.
 */

import { CARS, CAR_BOX, drawCarRear, type CarKind } from './racing-cars'
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

// ---------------------------------------------------------------- the coast at sunset

/** The road on a board: its middle bending right toward the horizon, its half width, its stretch (even or odd) at a row, `scroll` moving the stretches toward the viewer. */
type Road = { horizon: number; depth: number; p: (y: number) => number; centre: (y: number) => number; half: (y: number) => number; band: (y: number) => number }
function roadOf(W: number, H: number, horizon: number, bend: number, near: number, scroll = 0): Road {
  const depth = H - horizon
  const p = (y: number) => Math.max(0, (y - horizon) / depth)
  return {
    horizon, depth, p,
    centre: (y) => W / 2 + bend * (1 - p(y)) ** 2.3,
    half: (y) => 3 + p(y) * near,
    band: (y) => Math.floor(10 / (p(y) + 0.05) + scroll) % 2,
  }
}

const SKY = ['#2a0e4a', '#3e1258', '#5a1a6a', '#8a2470', '#c0346c', '#ec4a62', '#ff6a52', '#ff9048', '#ffb44a']
/** The sky: purple high up to orange at the horizon, in bands dithered into one another, thin stripes over the horizon as on the old racers; a few stars. */
function sky(buffer: PixelBuffer, horizon: number): void {
  const W = buffer.width
  for (let y = 0; y < horizon; y += 1) {
    const t = (y / horizon) ** 1.1 * (SKY.length - 1), i = Math.floor(t), f = t - i
    const a = SKY[i], b = SKY[Math.min(SKY.length - 1, i + 1)]
    const stripe = y > horizon * 0.78 && (horizon - y) % 5 === 0 ? '#ffd27a' : null
    for (let x = 0; x < W; x += 1) buffer.set(x, y, stripe ?? (dither(x, y, f) ? b : a))
  }
  for (let k = 0; k < 30; k += 1) buffer.set((k * 197 + 31) % W, (k * 53) % Math.round(horizon * 0.35), k % 4 === 0 ? '#ffffff' : '#c8a0e0')
}

/** Clouds in long flat bands, stepped at their ends, dark red with a lit pink underside, drifting. */
function clouds(buffer: PixelBuffer, horizon: number, frame: number): void {
  const W = buffer.width
  const bands: Array<[number, number, number, number]> = [[0.05, 0.3, 0.34, 7], [0.62, 0.22, 0.4, 6], [0.3, 0.46, 0.3, 5], [0.78, 0.54, 0.26, 5], [0.14, 0.62, 0.22, 4]]
  bands.forEach(([fx, fy, fw, th], i) => {
    const len = Math.round(W * fw), y0 = Math.round(horizon * fy), x0 = Math.round(((fx * W + frame * (1 + (i % 2))) % (W + len)) - len / 2)
    for (let r = 0; r < th; r += 1) {
      // each row a little shorter than the one under it, by a step at each end
      const inset = (th - 1 - r) * Math.round(len * 0.05)
      for (let x = x0 + inset; x < x0 + len - inset; x += 1) buffer.set(x, y0 + r, r === th - 1 ? '#ff8a8a' : r === th - 2 ? '#d0406a' : '#7a1e5a')
    }
  })
}

/** The sun going down into the sea: yellow at the top, orange at its foot, cut by bands that widen toward the horizon; its glow round it. */
function sun(buffer: PixelBuffer, cx: number, horizon: number, r: number): void {
  for (let y = Math.round(horizon - r * 1.6); y < horizon; y += 1) for (let x = Math.round(cx - r * 1.7); x < cx + r * 1.7; x += 1) {
    const d = Math.hypot(x - cx, (y - horizon) * 1.15) / r
    if (d > 1 && d < 1.7 && dither(x, y, (1.7 - d) * 0.4)) buffer.tint(x, y, '#ffd27a', 0.35)
  }
  for (let y = horizon - r; y < horizon; y += 1) {
    const t = (y - (horizon - r)) / r, u = t * 7
    if (t > 0.45 && u - Math.floor(u) < 0.16 + (t - 0.45) * 0.8) continue
    const half = Math.sqrt(Math.max(0, r * r - (horizon - y) ** 2))
    const c = mix('#fff6a0', '#ff8a3a', t ** 1.1)
    for (let x = Math.round(cx - half); x <= cx + half; x += 1) buffer.set(x, y, c)
  }
}

/** Low mountains behind the sea, purple, lit pink on the slopes facing the sun. */
function mountains(buffer: PixelBuffer, horizon: number, from: number, to: number, high: number, sunX: number): void {
  const peak = (x: number) => Math.max(0, Math.sin((x - from) / (to - from) * Math.PI)) * (high * 0.6 + Math.abs(Math.sin(x * 0.031)) * high * 0.4 + Math.sin(x * 0.11) * 2)
  for (let x = Math.round(from); x < to; x += 1) {
    const h = Math.round(peak(x))
    for (let y = horizon - h; y < horizon; y += 1) buffer.set(x, y, y < horizon - h + 2 && (peak(x + 1) > peak(x)) === (x > sunX) ? '#ff7a8a' : y > horizon - 3 ? '#4a1858' : '#6a2270')
  }
}

/** The city on the horizon, right of the road's end: towers in flat blues and purples, rows of lit windows, a mast with its light. */
function city(buffer: PixelBuffer, horizon: number, from: number, to: number, high: number): void {
  let x = Math.round(from), k = 0
  while (x < to) {
    const w = Math.round(high * (0.16 + ((k * 7) % 5) * 0.03)), h = Math.round(high * (0.35 + ((k * 13) % 7) * 0.1))
    const tone = k % 3 === 0 ? '#3a2a7a' : k % 3 === 1 ? '#2a2268' : '#4a3488'
    buffer.rect(x, horizon - h, w, h, tone)
    buffer.rect(x, horizon - h, 1, h, mix(tone, '#ff9aa0', 0.35))
    for (let wy = horizon - h + 3; wy < horizon - 2; wy += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3) if ((wx * 13 + wy * 7 + k) % 4 !== 0) buffer.set(wx, wy, (wx + wy) % 5 === 0 ? '#ff9ad0' : '#ffd27a')
    if (k === 3) { buffer.rect(x + Math.floor(w / 2), horizon - h - Math.round(high * 0.25), 1, Math.round(high * 0.25), tone); buffer.set(x + Math.floor(w / 2), horizon - h - Math.round(high * 0.25) - 1, '#ff4a4a') }
    x += w + 1 + (k % 2); k += 1
  }
}

/**
 * The ground row by row: the sea from the horizon to the shore on the left
 * of the road, sparkling, the sun's path on it; the beach under the shore;
 * on the right the grass; the road in its two greys, its white edges, its
 * two dashed lanes as far as `lineTo`.
 */
function ground(buffer: PixelBuffer, road: Road, shore: number, sunX: number, lineTo: number, frame: number): void {
  const W = buffer.width, H = buffer.height
  for (let y = road.horizon; y < H; y += 1) {
    const p = road.p(y), band = road.band(y), haze = Math.max(0, 1 - p * 5) * 0.5
    const c = road.centre(y), half = road.half(y), edge = Math.max(1, half * 0.03), lane = Math.max(1, half * 0.022)
    const sand = mix(band ? '#f0b880' : '#e0a470', '#ffb090', haze), grass = mix(band ? '#4a9a4a' : '#3c8a42', '#c87a6a', haze)
    const tar = mix(band ? '#46424e' : '#3e3a46', '#8a6a7a', haze)
    for (let x = 0; x < W; x += 1) {
      const d = x - c
      let col: string
      if (Math.abs(d) < half) {
        const ad = Math.abs(d)
        col = ad > half - edge * 2 && ad < half - edge * 0.5 ? '#f0eadc' : band && y < lineTo && Math.abs(ad - half / 3) < lane ? '#f0eadc' : tar
      } else if (d < 0) {
        if (y < shore) {
          // the sea, in bands, glittering; the sun's path in broken lines under it
          const t = (y - road.horizon) / Math.max(1, shore - road.horizon)
          col = mix('#2ab8d0', '#1a7aa0', t)
          if ((x * 7 + y * 13 + frame * 3) % 37 === 0) col = '#e8ffff'
          const path = Math.abs(x - sunX) < 6 + t * 26 && (y + frame) % 3 !== 0 && (x * 5 + y) % 4 !== 0
          if (path) col = t < 0.4 ? '#fff0a0' : '#ffb060'
        } else col = sand
      } else col = y < shore ? mix('#2a6a4a', '#c87a6a', 0.35) : grass
      buffer.set(x, y, col)
    }
  }
}

/** The guardrail along the sea side of the road, its posts at each stretch, from the shore to the foot of the board. */
function guardrail(buffer: PixelBuffer, road: Road, from: number): void {
  let last = road.band(from)
  for (let y = from; y < buffer.height; y += 1) {
    const p = road.p(y), x = Math.round(road.centre(y) - road.half(y) - 3 - p * 14), h = Math.round(2 + p * 22), t = Math.max(1, Math.round(p * 4))
    for (let k = 0; k < t; k += 1) { buffer.set(x, y - h + k, k === 0 ? '#ffffff' : '#c8c8d8'); buffer.set(x - 1, y - h + k, '#8a8aa0') }
    if (road.band(y) !== last) { last = road.band(y); buffer.rect(x - Math.max(1, Math.round(p * 2)), y - h, Math.max(1, Math.round(p * 3)), h, '#7a7a8e') }
  }
}

/** A chevron sign on the sea side, pointing the way the road bends: red, a white arrow, on its post. */
function chevron(buffer: PixelBuffer, road: Road, p: number): void {
  const y = Math.round(road.horizon + p * road.depth), s = 5 + p * 34, x = Math.round(road.centre(y) - road.half(y) - 6 - p * 40)
  buffer.rect(x - 1, Math.round(y - s * 1.6), Math.max(1, Math.round(s * 0.12)), Math.round(s * 1.6), '#5a5a6a')
  const top = Math.round(y - s * 1.6 - s * 0.9), w = Math.round(s * 1.1), h = Math.round(s * 0.9)
  buffer.rect(x - Math.round(w / 2) - 1, top - 1, w + 2, h + 2, INK)
  buffer.rect(x - Math.round(w / 2), top, w, h, '#e0302a')
  for (let r = 0; r < h; r += 1) {
    const off = Math.round(Math.abs(r - h / 2) * 0.7), cx = x - Math.round(w * 0.15) - off + Math.round(w * 0.3)
    for (let k = 0; k < Math.max(1, Math.round(w * 0.18)); k += 1) buffer.set(cx - k, top + r, '#ffffff')
  }
}

/** A palm, flat and simple: a trunk leaning and ringed, a crown of fronds in two greens, lit on top, the leaflets hanging; swaying a little. `spread`: the fronds' length, 1 as usual. */
function palm(buffer: PixelBuffer, x: number, base: number, size: number, lean: number, frame: number, spread = 1): void {
  const top: [number, number] = [x + lean * size * 0.4, base - size]
  const w0 = Math.max(1, size * 0.032)
  for (let t = 0; t <= 1; t += 0.5 / size) {
    const px = x + lean * size * 0.4 * t * t, py = base - size * t, w = w0 * (1.15 - t * 0.35)
    const ring = Math.floor(t * size / Math.max(2, size * 0.05)) % 2 === 0
    for (let k = -w; k <= w; k += 1) buffer.set(Math.round(px + k), Math.round(py), k < -w * 0.4 ? '#a0683a' : ring ? '#5a3018' : '#7a4a2a')
  }
  const sway = frame % 2 ? 1 : 0
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI * 0.98 + (i / 9) * Math.PI * 0.96
    const len = size * (0.5 + ((i * 5) % 3) * 0.07) * spread
    for (let t = 0; t <= 1; t += 0.6 / len) {
      const droop = t * t * len * 0.7
      const fx = top[0] + Math.cos(a) * len * t + (t > 0.6 ? sway * (Math.cos(a) > 0 ? 1 : -1) : 0), fy = top[1] + Math.sin(a) * len * t * 0.7 + droop
      const w = Math.max(0.6, size * 0.034 * (1 - t * 0.7))
      for (let k = -w; k <= w; k += 1) buffer.set(Math.round(fx), Math.round(fy + k), k <= -w + 0.6 ? '#7ad04a' : '#2f8f48')
      // leaflets hanging from it, darker
      if (Math.round(t * len) % 2 === 0 && t > 0.12) for (let d = 1; d < size * 0.075 * (1 - t * 0.6); d += 1) buffer.set(Math.round(fx + (Math.cos(a) > 0 ? 1 : -1) * d * 0.25), Math.round(fy + d), d > size * 0.04 ? '#1f6a3a' : '#2f8f48')
    }
  }
}

/** A diner by the road: a chrome box with its windows lit, a teal band, DINER in pink neon on its roof, its glow round it. */
function diner(buffer: PixelBuffer, x: number, base: number, s: number, frame: number): void {
  const w = Math.round(120 * s), h = Math.round(34 * s)
  buffer.rect(x - 1, base - h - 1, w + 2, h + 2, INK)
  buffer.rect(x, base - h, w, h, '#c8cce0')
  buffer.rect(x, base - h, w, Math.max(1, Math.round(2 * s)), '#ffffff')
  buffer.rect(x, base - Math.round(h * 0.35), w, Math.max(2, Math.round(4 * s)), '#2ab8b0')
  for (let k = 0; k < 5; k += 1) buffer.rect(x + Math.round((6 + k * 23) * s), base - Math.round(h * 0.82), Math.round(16 * s), Math.round(h * 0.38), '#ffd27a')
  // the neon on the roof
  const word = 'DINER', scale = s >= 0.9 ? 2 : 1, tw = text7Width(word, scale, true), tx = x + Math.round(w / 2 - tw / 2), ty = base - h - Math.round(12 * scale) - 2
  const on = frame % 7 !== 6
  for (let dy = -4; dy < 7 * scale + 4; dy += 1) for (let dx = -5; dx < tw + 5; dx += 1) if (dither(tx + dx, ty + dy, 0.5)) buffer.tint(tx + dx, ty + dy, '#ff4aa0', on ? 0.3 : 0.1)
  buffer.rect(tx - 3, ty - 3, tw + 6, 7 * scale + 6, INK)
  drawText7(buffer, word, tx, ty, on ? '#ff8ad0' : '#8a3a6a', scale, true)
}

/** A puff from an exhaust, low by the road, swelling and thinning as it drifts out, one moment after another. */
function puff(buffer: PixelBuffer, x: number, y: number, dir: number, frame: number, seed: number): void {
  const age = (frame + seed) % 5, r = 2 + age * 1.6
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
    const q = (dx * dx + dy * dy) / (r * r)
    if (q <= 1) buffer.tint(Math.round(x + dir * age * 3 + dx), Math.round(y + age * 0.6 + dy * 0.6), '#e8dcf0', 0.38 * (1 - age / 5) * (1 - q * 0.5))
  }
}

/** Where the coast stands on a board of `W` × `H`. */
type Coast = { horizon: number; shore: number; bend: number; near: number; sunX: number; sunR: number; hills: Array<[number, number, number]>; city: [number, number, number]; diner: number | null; palms: number[] }
/** The coast at sunset on a board: the sky, the sun, the sea, the city, the road and what stands by it; the road returned for what goes on it. */
function coast(buffer: PixelBuffer, c: Coast, lineTo: number, frame: number, scroll = 0): Road {
  const W = buffer.width, H = buffer.height
  const road = roadOf(W, H, c.horizon, c.bend, c.near, scroll)
  sky(buffer, c.horizon)
  clouds(buffer, c.horizon, frame)
  sun(buffer, c.sunX, c.horizon, c.sunR)
  for (const [from, to, high] of c.hills) mountains(buffer, c.horizon, from, to, high, c.sunX)
  city(buffer, c.horizon, c.city[0], c.city[1], c.city[2])
  ground(buffer, road, c.shore, c.sunX, lineTo, frame)
  guardrail(buffer, road, c.shore)
  for (const p of [0.07, 0.17, 0.34]) chevron(buffer, road, p)
  // the far side: palms on the grass, the diner among them, far ones first
  const side = (p: number) => { const y = Math.round(c.horizon + p * road.depth); return { y, x: road.centre(y) + road.half(y) } }
  for (const p of c.palms) { const s = side(p); palm(buffer, s.x + 16 + p * 160, s.y, 18 + p * 220, -0.3, frame) }
  if (c.diner != null) { const d = side(c.diner); diner(buffer, Math.round(d.x + 8 + c.diner * 40), d.y, 0.45 + c.diner * 2.4, frame) }
  for (const p of [0.03, 0.08]) { const y = Math.round(c.horizon + p * road.depth); palm(buffer, road.centre(y) - road.half(y) - 30 - p * 260, y, 14 + p * 160, 0.3, frame) }
  return road
}

// ---------------------------------------------------------------- the title

/** Where things stand on each title. */
const TITLE: Record<Layout, { coast: Coast; logoY: number; logoW: number; randomY: number; carScale: number; carY: number; gap: number; press: number; info: 'top' | 'bottom'; frame: Array<[number, number, number, number, number]> }> = {
  landscape: {
    coast: { horizon: 236, shore: 262, bend: 230, near: 520, sunX: 220, sunR: 44, hills: [[290, 480, 36], [0, 130, 20]], city: [470, 680, 120], diner: 0.12, palms: [0.04, 0.3, 0.46] },
    logoY: 58, logoW: 450, randomY: 14, carScale: 1.15, carY: 286, gap: 36, press: 402, info: 'top',
    // the big palms framing the scene: base x, base y, size, lean, the fronds' length
    frame: [[18, 430, 330, 0.55, 1], [752, 430, 340, -0.55, 1]],
  },
  portrait: {
    coast: { horizon: 430, shore: 456, bend: 130, near: 300, sunX: 120, sunR: 40, hills: [[180, 300, 30], [0, 66, 16]], city: [240, 432, 110], diner: 0.05, palms: [0.04, 0.3] },
    logoY: 150, logoW: 384, randomY: 92, carScale: 0.8, carY: 610, gap: 8, press: 712, info: 'bottom',
    frame: [[4, 600, 300, 0.3, 0.55], [428, 600, 310, -0.3, 0.55]],
  },
}

export type RacingTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean }

/** RANDOM RACING's title, wide (768 × 432) or tall (432 × 768). */
export function renderRacingTitle(layout: Layout, accent: string, lettering: RacingLettering = 'sans', options: RacingTitleOptions = {}): PixelBuffer {
  const wide = layout === 'landscape'
  const W = wide ? 768 : 432, H = wide ? 432 : 768
  const st = TITLE[layout], frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, INK)
  // the lanes' dashes as far as the cars
  coast(buffer, st.coast, st.carY + 20, frame)
  // the three cars side by side, the burger in the middle, each puffing
  const s = st.carScale, cw = CAR_BOX.w * s, ch = CAR_BOX.h * s
  CARS.forEach((kind, i) => {
    const x = Math.round(W / 2 + (i - 1) * (cw + st.gap) - cw / 2), bob = (frame + i) % 3 === 0 ? 1 : 0
    drawCarRear(buffer, kind, x, st.carY + bob, s, frame + i)
    puff(buffer, x + cw * 0.3, st.carY + ch * 0.9, -1, frame, i * 2)
    puff(buffer, x + cw * 0.7, st.carY + ch * 0.9, 1, frame, i * 2 + 1)
  })
  // the big palms in front, framing it
  for (const [x, y, size, lean, spread] of st.frame) palm(buffer, x, y, size, lean, frame, spread)
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

// ---------------------------------------------------------------- a moment of play

/** The play boards, under the bar: wide 448 × 320, tall 320 × 448, as the other games'. */
const PLAY: Record<Layout, { coast: Coast; carScale: number; carY: number }> = {
  landscape: { coast: { horizon: 118, shore: 130, bend: 150, near: 250, sunX: 120, sunR: 28, hills: [[180, 330, 22], [0, 72, 14]], city: [280, 420, 70], diner: null, palms: [0.05, 0.14, 0.3, 0.55] }, carScale: 0.62, carY: 250 },
  portrait: { coast: { horizon: 170, shore: 184, bend: 110, near: 190, sunX: 90, sunR: 26, hills: [[140, 230, 18], [0, 44, 10]], city: [190, 320, 66], diner: null, palms: [0.05, 0.14, 0.3, 0.55] }, carScale: 0.5, carY: 388 },
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

export type RacingPlayOptions = { frame?: number; car?: CarKind; pad?: boolean }

/**
 * A moment of play, as a proposal: the coast under the bar, the road
 * rolling toward the viewer; the player's car at its foot, leaning into the
 * bend; two rivals ahead, small with the distance, and a van of traffic;
 * TIME, SPEED, the stage, the place; the controls under it on a tall board.
 */
export function renderRacingPlay(layout: Layout, accent: string, options: RacingPlayOptions = {}): PixelBuffer {
  const wide = layout === 'landscape'
  const bw = wide ? 448 : 320, bh = wide ? 320 : 448
  const pad = options.pad ?? !wide
  const frame = options.frame ?? 0, st = PLAY[layout]
  const out = new PixelBuffer(bw, HUD_HEIGHT + bh + (pad ? 96 : 0), INK)
  const board = new PixelBuffer(bw, bh, INK)
  const road = coast(board, st.coast, bh, frame, frame * 0.9)
  // the rivals ahead, small with the distance, each in its lane; then the player's car
  const others: Array<[CarKind, number, number]> = [['rosso', 0.16, -0.33], ['giallo', 0.3, 0.33]]
  if (options.car === 'rosso') others[0][0] = 'burger'
  if (options.car === 'giallo') others[1][0] = 'burger'
  for (const [kind, p, lane] of others) {
    const y = Math.round(road.horizon + p * road.depth), s = 0.08 + p * 0.85, x = road.centre(y) + lane * road.half(y) * 0.66
    drawCarRear(board, kind, Math.round(x - (CAR_BOX.w * s) / 2), Math.round(y - CAR_BOX.h * s), s, frame)
  }
  const me = options.car ?? 'burger', s = st.carScale, cw = CAR_BOX.w * s
  const x = Math.round(bw / 2 - cw / 2 + Math.sin(frame * 0.7) * 3)
  drawCarRear(board, me, x, st.carY, s, frame)
  puff(board, x + cw * 0.3, st.carY + CAR_BOX.h * s * 0.92, -1, frame, 0)
  puff(board, x + cw * 0.7, st.carY + CAR_BOX.h * s * 0.92, 1, frame, 2)
  out.data.set(board.data, HUD_HEIGHT * bw * 4)
  racingHud(out, accent, 47 - (frame % 47), 212 + (frame % 5) * 3, ((frame % 40) + 10) / 60, 2, 4)
  if (pad) racingPad(out, HUD_HEIGHT + bh)
  return out
}
