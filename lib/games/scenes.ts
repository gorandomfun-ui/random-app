/**
 * The night street both games open on, drawn in fine pixels — twice as
 * fine as the play screens — piece by piece: a sky that deepens upward in
 * a smooth dithered gradient, stars that twinkle, a crescent moon with its
 * halo, clouds in layers lit on their rims, the city on three planes, a
 * railing, the sidewalk, the road and its cars. In the middle, RANDOM
 * CATCHER's little convenience store or RANDOM EATER's diner. Every piece
 * takes its place from the caller, so the same street recomposes wide or
 * tall.
 */

import { dim, dither, mix, PixelBuffer } from './pixels'

const CREAM = '#f8f5e6'
const INK = '#0a0a14'

/** A small deterministic sequence, so a scene is the same every time it is drawn. */
export function rng(seed: number): () => number {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

export type Night = {
  sky: readonly string[]
  cloudDark: string; cloud: string; cloudLight: string; rim: string; rimBack: string
  cities: readonly [string, string, string]; windows: readonly string[]
  sidewalk: string; sidewalkLight: string; sidewalkDark: string; road: string; line: string
  leaf: readonly [string, string, string, string]
}

/** CATCHER's night is blue with cream-lit clouds; EATER's is violet with pink on the clouds. */
export const NIGHTS: Record<'blue' | 'violet', Night> = {
  blue: {
    sky: ['#040820', '#070e2e', '#0b163e', '#101f50', '#162a64', '#1e3778', '#27448a'],
    cloudDark: '#1a2a6a', cloud: '#2a409a', cloudLight: '#4462c8', rim: '#f2e2ba', rimBack: '#7f9ee8',
    cities: ['#1b2c70', '#13215a', '#0c1644'], windows: ['#f7c850', '#ffe08a', '#f0a840'],
    sidewalk: '#4a5280', sidewalkLight: '#6e77a6', sidewalkDark: '#363d66', road: '#141a36', line: '#efe0bc',
    leaf: ['#12402c', '#1d6a3c', '#2f8f4a', '#5cbf5a'],
  },
  violet: {
    sky: ['#06021a', '#0c0526', '#150a36', '#1f0f47', '#2a1658', '#371e68', '#452672'],
    cloudDark: '#261a58', cloud: '#3a2a80', cloudLight: '#5b40a8', rim: '#ff7fa8', rimBack: '#b07ad8',
    cities: ['#2a1d64', '#1e1450', '#140c3a'], windows: ['#ffb85a', '#5fe3ff', '#ff7aa2', '#ffe08a'],
    sidewalk: '#4a4276', sidewalkLight: '#6e649c', sidewalkDark: '#362f5e', road: '#120d2a', line: '#efe0bc',
    leaf: ['#0c2e2c', '#154a40', '#1f6a50', '#3f9a6a'],
  },
}

/** The sky: a smooth gradient through the night's tones down to `horizon`, dithered between them. */
export function sky(buffer: PixelBuffer, night: Night, horizon: number): void {
  const stops = night.sky
  for (let y = 0; y < buffer.height; y += 1) {
    const f = Math.min(stops.length - 1, (y / horizon) * (stops.length - 1))
    const i = Math.floor(f), frac = f - i
    const next = stops[Math.min(stops.length - 1, i + 1)]
    for (let x = 0; x < buffer.width; x += 1) buffer.set(x, y, dither(x, y, frac) ? next : stops[i])
  }
}

/** Stars: fine dots, small crosses, and a few four-pointed sparkles that pulse with the frame. */
export function stars(buffer: PixelBuffer, seed: number, count: number, below: number, frame: number): void {
  const next = rng(seed)
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(next() * buffer.width), y = Math.floor(next() * below)
    const kind = next()
    if (y < 40 && (x < 200 || x > buffer.width - 200)) continue
    const on = (i + frame) % 6 !== 0
    if (kind < 0.07) {
      const len = on ? 4 : 2
      for (let d = 1; d <= len; d += 1) {
        const c = d === 1 ? CREAM : d < len ? '#b8c0ec' : '#6a74b0'
        buffer.set(x + d, y, c); buffer.set(x - d, y, c); buffer.set(x, y + d, c); buffer.set(x, y - d, c)
      }
      buffer.set(x, y, '#ffffff')
    } else if (kind < 0.25) {
      buffer.set(x, y, on ? CREAM : '#9aa0c8')
      if (on) { buffer.tint(x - 1, y, '#c8d0f0', 0.5); buffer.tint(x + 1, y, '#c8d0f0', 0.5); buffer.tint(x, y - 1, '#c8d0f0', 0.5); buffer.tint(x, y + 1, '#c8d0f0', 0.5) }
    } else if (on || kind > 0.6) buffer.set(x, y, kind > 0.6 ? '#8a90c0' : CREAM)
  }
}

/** A crescent moon: three tones of cream, a few craters, a soft halo dithered into the sky. */
export function moon(buffer: PixelBuffer, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r * 2.2); y <= cy + r * 2.2; y += 1) for (let x = Math.floor(cx - r * 2.2); x <= cx + r * 2.2; x += 1) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if (d > r && d < r * 2.2 && dither(x, y, (1 - (d - r) / (r * 1.2)) * 0.35)) buffer.tint(x, y, '#fff3cc', 0.12)
  }
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
    const px = x + 0.5 - cx, py = y + 0.5 - cy
    const inside = px * px + py * py <= r * r
    const bitten = (px + r * 0.5) ** 2 + (py + r * 0.28) ** 2 <= (r * 0.88) ** 2
    if (!inside || bitten) continue
    const edge = px * px + py * py > (r - 1.2) ** 2
    const shade = px > r * 0.35 ? '#e8d6a2' : px > -r * 0.05 ? '#fbeec0' : '#fff7da'
    buffer.set(x, y, edge && px > 0 ? '#d8c28a' : shade)
  }
  for (const [ox, oy, rr] of [[0.55, 0.1, 0.13], [0.35, 0.45, 0.09], [0.62, -0.35, 0.08]] as const) buffer.disc(cx + ox * r, cy + oy * r, rr * r, '#e2cf98')
}

/** One layer of cloud: puffs on a flat base, a rim of light along the top, a lit band under it, the body, a darker underside. */
function cloudLayer(buffer: PixelBuffer, x: number, y: number, width: number, seed: number, tones: { rim: string; light: string; body: string; dark: string }): void {
  const next = rng(seed)
  const peak = Math.min(30, Math.max(8, width / 4.4))
  const height = Math.ceil(peak * 1.8) + 4
  const base = height - 5
  const count = Math.max(3, Math.round(width / 16))
  const puffs: Array<[number, number, number]> = []
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count
    const r = Math.max(5, peak * (0.4 + 0.6 * Math.sin(Math.PI * Math.pow(t, 0.85))) * (0.78 + next() * 0.4))
    puffs.push([t * width + (next() - 0.5) * 6, base - r * 0.5, r])
  }
  const inside = (px: number, py: number) => py < base + 4 && (puffs.some(([cx, cy, r]) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r) || (py > base - 6 && px > puffs[0][0] && px < puffs[puffs.length - 1][0]))
  for (let yy = 0; yy < height; yy += 1) for (let xx = -8; xx < width + 8; xx += 1) {
    const px = xx + 0.5, py = yy + 0.5
    if (!inside(px, py)) continue
    let depth = 0
    while (depth < 8 && inside(px, py - depth - 1)) depth += 1
    const bottom = yy >= base
    let color = tones.body
    if (depth === 0) color = tones.rim
    else if (depth <= 2) color = tones.light
    else if (depth <= 4) color = dither(xx, yy, 0.5) ? tones.light : tones.body
    if (bottom) color = dither(xx, yy, (yy - base) / 4) ? tones.dark : color === tones.rim ? tones.rim : tones.body
    buffer.set(x + xx, y + yy, color)
  }
}

/** A cloud bank: a paler layer behind, a lit layer in front, lower and a little aside. */
export function cloud(buffer: PixelBuffer, x: number, y: number, width: number, night: Night, seed: number): void {
  cloudLayer(buffer, x + Math.round(width * 0.18), y, Math.round(width * 0.7), seed + 31, { rim: night.rimBack, light: night.cloud, body: night.cloudDark, dark: dim(night.cloudDark, 0.85) })
  cloudLayer(buffer, x, y + Math.round(width * 0.09), width, seed, { rim: night.rim, light: night.cloudLight, body: night.cloud, dark: night.cloudDark })
}

/** A thin wisp of cloud: a few lines, lit on top. */
export function wisp(buffer: PixelBuffer, x: number, y: number, width: number, night: Night): void {
  buffer.rect(x + 6, y, width - 12, 1, night.rimBack)
  buffer.rect(x, y + 1, width, 2, night.cloud)
  buffer.rect(x + 10, y + 3, width - 24, 1, night.cloudDark)
}

/**
 * The city on three planes from `base` up: a pale far row with a few
 * spires, a middle row with its grids of windows, a near row with roofs
 * — water tanks, antennas with a red light — and more windows lit.
 */
export function city(buffer: PixelBuffer, night: Night, base: number, tallest: number, seed: number, frame: number): void {
  const planes = [
    { color: night.cities[0], scale: 1, lit: 0.1, win: [1, 2] as const, gap: 2 },
    { color: night.cities[1], scale: 0.78, lit: 0.2, win: [2, 3] as const, gap: 4 },
    { color: night.cities[2], scale: 0.55, lit: 0.28, win: [3, 4] as const, gap: 8 },
  ]
  planes.forEach((plane, layer) => {
    const next = rng(seed + layer * 97)
    let x = -10 - Math.floor(next() * 20)
    while (x < buffer.width) {
      const w = Math.round((22 + Math.floor(next() * 40)) * (layer === 2 ? 1.2 : 1))
      const h = Math.floor(tallest * plane.scale * (0.4 + next() * 0.6))
      const top = base - h
      const edge = mix(plane.color, '#ffffff', 0.07)
      buffer.rect(x, top, w, h, plane.color)
      buffer.rect(x, top, 1, h, edge)
      // roofs: a stepped top, a spire, a water tank, an antenna with its light
      const roof = next()
      if (roof < 0.2) { buffer.rect(x + 3, top - 4, w - 6, 4, plane.color); buffer.rect(x + 6, top - 7, w - 12, 3, plane.color) }
      else if (roof < 0.35 && layer === 0) { buffer.poly([[x + w / 2 - 3, top], [x + w / 2 + 3, top], [x + w / 2, top - 18]], plane.color) }
      else if (roof < 0.5 && layer > 0) {
        const tx = x + 4 + Math.floor(next() * Math.max(1, w - 16))
        buffer.rect(tx, top - 9, 10, 7, plane.color); buffer.rect(tx + 1, top - 2, 1, 2, plane.color); buffer.rect(tx + 8, top - 2, 1, 2, plane.color)
        buffer.rect(tx - 1, top - 10, 12, 1, edge)
      } else if (roof < 0.65) {
        const ax = x + Math.floor(w * 0.6)
        buffer.rect(ax, top - 14, 1, 14, plane.color)
        if ((frame + layer) % 3 !== 2) buffer.set(ax, top - 15, '#ff4a4a')
      }
      // windows: a grid, some lit in the night's tones, a few flickering
      const [ww, wh] = plane.win
      const stepX = ww + (layer === 0 ? 3 : 4), stepY = wh + (layer === 0 ? 3 : 4)
      for (let wy = top + 5; wy < base - wh - 2; wy += stepY) for (let wx = x + 4; wx < x + w - ww - 3; wx += stepX) {
        const on = next() < plane.lit
        const tone = night.windows[Math.floor(next() * night.windows.length)]
        const flicker = next() < 0.05 && frame % 4 === 1
        if (on && !flicker) {
          buffer.rect(wx, wy, ww, wh, layer === 0 ? mix(tone, plane.color, 0.55) : tone)
          if (layer === 2) buffer.rect(wx, wy + wh - 1, ww, 1, dim(tone, 0.75))
        } else if (layer > 0) buffer.rect(wx, wy, ww, wh, mix(plane.color, '#000000', 0.25))
      }
      x += w + plane.gap + Math.floor(next() * 6)
    }
  })
}

/** A low railing along the back of the sidewalk: two rails and posts, lit on top. */
export function railing(buffer: PixelBuffer, y: number, color: string, from = 0, to = buffer.width): void {
  const light = mix(color, '#ffffff', 0.25), dark = dim(color, 0.7)
  for (let x = from + 10; x < to; x += 44) { buffer.rect(x, y - 2, 5, 24, color); buffer.rect(x, y - 2, 5, 1, light); buffer.rect(x + 4, y - 1, 1, 23, dark) }
  buffer.rect(from, y, to - from, 3, color); buffer.rect(from, y, to - from, 1, light); buffer.rect(from, y + 3, to - from, 1, dark)
  buffer.rect(from, y + 11, to - from, 2, color); buffer.rect(from, y + 13, to - from, 1, dark)
}

/** The sidewalk from `top`, the kerb, the road down to `bottom` with its dashed line at `line`. */
export function street(buffer: PixelBuffer, night: Night, top: number, depth: number, bottom: number, line: number): void {
  const W = buffer.width
  buffer.rect(0, top, W, depth, night.sidewalk)
  buffer.rect(0, top, W, 2, night.sidewalkLight)
  for (let x = 0; x < W; x += 48) { buffer.rect(x, top + 2, 1, depth - 2, night.sidewalkDark); buffer.rect(x + 1, top + 2, 1, depth - 2, mix(night.sidewalk, night.sidewalkLight, 0.4)) }
  buffer.rect(0, top + Math.floor(depth / 2), W, 1, mix(night.sidewalk, night.sidewalkDark, 0.5))
  // the kerb: a lit edge, its face, a shadow on the road
  buffer.rect(0, top + depth, W, 3, night.sidewalkLight)
  buffer.rect(0, top + depth + 3, W, 3, night.sidewalkDark)
  buffer.rect(0, top + depth + 6, W, bottom - top - depth - 6, night.road)
  buffer.rect(0, top + depth + 6, W, 2, dim(night.road, 0.7))
  const next = rng(3)
  for (let i = 0; i < (W * (bottom - top - depth)) / 90; i += 1) buffer.set(Math.floor(next() * W), top + depth + 8 + Math.floor(next() * (bottom - top - depth - 8)), mix(night.road, '#ffffff', 0.06))
  for (let x = 8; x < W; x += 56) { buffer.rect(x, line, 30, 4, night.line); buffer.rect(x, line + 3, 30, 1, dim(night.line, 0.7)) }
}

/** A street lamp standing on `ground`: a pole with its base, an arm, a lamp, a halo round it and a pool of light below. */
export function lamp(buffer: PixelBuffer, x: number, ground: number, height: number, facingLeft = false): void {
  const pole = '#262c4a', poleLight = '#48507a', bulb = '#fff0b0'
  const hx = x + (facingLeft ? -6 : 6), hy = ground - height + 6
  for (let y = hy - 26; y <= hy + 26; y += 1) for (let xx = hx - 26; xx <= hx + 26; xx += 1) {
    const d = Math.hypot(xx - hx, y - hy)
    if (d < 26 && dither(xx, y, (1 - d / 26) * 0.9)) buffer.tint(xx, y, '#ffd27a', d < 10 ? 0.4 : 0.22)
  }
  for (let y = ground - 2; y < ground + 18; y += 1) for (let xx = x - 40; xx < x + 40; xx += 1) {
    const d = Math.hypot((xx - x) / 40, (y - ground - 6) / 12)
    if (d < 1 && dither(xx, y, (1 - d) * 0.8)) buffer.tint(xx, y, '#ffd27a', 0.18)
  }
  buffer.rect(x - 1, ground - height, 4, height, pole); buffer.rect(x - 1, ground - height, 1, height, poleLight)
  buffer.rect(x - 4, ground - 8, 10, 8, pole); buffer.rect(x - 4, ground - 8, 10, 1, poleLight)
  buffer.rect(x - 3, ground - 30, 8, 3, pole)
  const armTo = facingLeft ? x - 9 : x + 9
  buffer.rect(Math.min(x, armTo), ground - height, Math.abs(armTo - x) + 3, 3, pole)
  buffer.poly([[hx - 7, hy - 5], [hx + 7, hy - 5], [hx + 5, hy], [hx - 5, hy]], pole)
  buffer.rect(hx - 4, hy, 9, 3, bulb); buffer.rect(hx - 3, hy + 3, 7, 1, '#ffd27a')
}

/** A round tree in its square pit: a trunk, a crown of clusters in four greens lit from the top left. */
export function tree(buffer: PixelBuffer, x: number, ground: number, size: number, night: Night, seed: number): void {
  const next = rng(seed)
  buffer.rect(x - 10, ground - 2, 20, 3, '#2a2230')
  buffer.rect(x - 2, ground - size, 5, size, '#4a2a18'); buffer.rect(x - 2, ground - size, 1, size, '#6a3c20'); buffer.rect(x + 2, ground - size, 1, size, '#301a10')
  const cy = ground - size - size * 0.55
  const blobs = Array.from({ length: 9 }, () => [x + (next() - 0.5) * size * 1.3, cy + (next() - 0.5) * size * 0.9, size * (0.34 + next() * 0.18)] as const)
  for (const [bx, by, r] of blobs) buffer.disc(bx, by + 2, r, night.leaf[0])
  for (const [bx, by, r] of blobs) buffer.disc(bx, by, r - 1.5, night.leaf[1])
  for (const [bx, by, r] of blobs) buffer.disc(bx - r * 0.25, by - r * 0.3, r * 0.6, night.leaf[2])
  for (const [bx, by, r] of blobs) buffer.disc(bx - r * 0.4, by - r * 0.45, r * 0.25, night.leaf[3])
}

/** A palm: a leaning trunk in rings, a crown of fronds arching out and drooping, each with its leaflets. */
export function palm(buffer: PixelBuffer, x: number, ground: number, height: number, lean: number, night: Night): void {
  for (let i = 0; i < height; i += 1) {
    const t = i / height
    const px = Math.round(x + lean * t * t * height * 0.22)
    buffer.rect(px - 3, ground - i, 6, 1, i % 6 < 2 ? '#2e1c0c' : '#5a3a1c')
    buffer.set(px - 3, ground - i, '#3a2410'); buffer.set(px + 1, ground - i, i % 6 < 2 ? '#3a2410' : '#7a5028')
  }
  const topX = Math.round(x + lean * height * 0.22), topY = ground - height
  const fronds: Array<[number, number, number, number]> = [[-1, 44, 0.7, 1], [1, 44, 0.7, 1], [-1, 36, 1.3, 0], [1, 36, 1.3, 0], [-1, 30, 0.2, 1], [1, 30, 0.2, 1], [-0.5, 24, 1.8, 0], [0.5, 24, 1.8, 0], [0.1, 18, -0.8, 1]]
  for (const [dir, len, droop, near] of fronds) {
    for (let s = 0; s <= len; s += 1) {
      const t = s / len
      const fx = Math.round(topX + dir * s), fy = Math.round(topY - Math.sin(t * Math.PI * 0.55) * 10 + t * t * len * droop * 0.45)
      buffer.rect(fx, fy, 2, 2, near ? night.leaf[2] : night.leaf[1])
      if (s > 4 && s % 2 === 0) {
        const leaf = Math.round(6 * (1 - t) + 2)
        const side = Math.sign(dir) || 1
        for (let k = 1; k <= leaf; k += 1) {
          buffer.set(fx - side * Math.round(k * 0.3), fy + k, near ? night.leaf[1] : night.leaf[0])
          if (near) buffer.set(fx + side * Math.round(k * 0.2), fy - Math.round(k * 0.6), night.leaf[3])
        }
      }
    }
  }
  buffer.disc(topX + 0.5, topY + 3, 4, '#3a2410'); buffer.disc(topX - 1, topY + 2, 1.5, '#6a4020')
}

/** A hedge: a mound of leaves in bumps, three greens. */
export function hedge(buffer: PixelBuffer, x: number, ground: number, width: number, night: Night): void {
  for (let i = 0; i < width; i += 9) buffer.disc(x + i + 5, ground - 10, 8, night.leaf[0])
  buffer.rect(x, ground - 10, width, 10, night.leaf[0])
  for (let i = 0; i < width; i += 9) buffer.disc(x + i + 4, ground - 12, 5, night.leaf[1])
  for (let i = 0; i < width; i += 9) buffer.disc(x + i + 3, ground - 14, 2, night.leaf[2])
}

/**
 * A car from the side, 104 pixels long: the body in two tones with a
 * chrome strip, a cabin with its windows and a glint, door lines and
 * handles, bumpers, wheels with hubcaps, head and tail lights. `dir` 1
 * goes right.
 */
export function car(buffer: PixelBuffer, x: number, y: number, color: string, dir: 1 | -1): void {
  const L = 104
  const X = (dx: number) => (dir === 1 ? x + dx : x + L - dx)
  const P = (pts: Array<[number, number]>) => pts.map(([dx, dy]) => [X(dx), y + dy] as [number, number])
  const R = (dx: number, dy: number, w: number, h: number, c: string) => buffer.rect(dir === 1 ? x + dx : x + L - dx - w, y + dy, w, h, c)
  const light = mix(color, '#ffffff', 0.35), shade = dim(color, 0.66), glass = '#1a2548', glassLight = '#4a64a8'
  // outline, then body and cabin
  buffer.poly(P([[-1, 15], [8, 13], [26, 12], [34, 1], [70, 1], [82, 12], [100, 14], [105, 17], [105, 28], [-1, 28]]), INK)
  buffer.poly(P([[1, 16], [9, 14], [27, 13], [35, 3], [69, 3], [80, 13], [99, 15], [103, 18], [103, 27], [1, 27]]), color)
  buffer.poly(P([[1, 16], [9, 14], [99, 15], [103, 18], [103, 19], [1, 19]]), light)
  buffer.poly(P([[1, 23], [103, 23], [103, 27], [1, 27]]), shade)
  // windows and the pillar between them
  buffer.poly(P([[30, 13], [37, 5], [51, 5], [51, 13]]), glass)
  buffer.poly(P([[55, 5], [67, 5], [76, 13], [55, 13]]), glass)
  buffer.poly(P([[40, 5], [44, 5], [38, 12], [34, 12]]), glassLight)
  buffer.poly(P([[60, 5], [63, 5], [58, 11], [56, 11]]), glassLight)
  // door lines, handles, the chrome strip
  for (const dx of [28, 53, 78]) R(dx, 14, 1, 12, shade)
  for (const dx of [44, 69]) R(dx, 17, 4, 1, '#d8dce6')
  R(2, 21, 100, 1, '#c8ccd8')
  // bumpers, lights
  R(-1, 23, 5, 3, '#b8bcc8'); R(100, 23, 5, 3, '#b8bcc8')
  R(99, 17, 4, 3, '#fff3b0'); R(1, 17, 3, 3, '#e0301e')
  // wheels
  for (const wx of [22, 80]) {
    buffer.disc(X(wx), y + 28, 9, INK)
    buffer.disc(X(wx), y + 28, 7, '#1c1c24')
    buffer.disc(X(wx), y + 28, 4.2, '#9aa0ae')
    buffer.disc(X(wx) - 1, y + 27, 1.6, '#e0e4ee')
  }
}

// ---------------------------------------------------------------- the store (CATCHER)

/** Colours of the bottles and boxes on the store's shelves. */
const GOODS = ['#e8412c', '#ffcc33', '#4a7cff', '#5ad06a', '#ff7ab0', '#fff1e0', '#ff9a3a']

/** Three-by-five capitals for the little signs on the buildings. */
const MINI: Record<string, readonly string[]> = {
  O: ['###', '#.#', '#.#', '#.#', '###'], P: ['###', '#.#', '###', '#..', '#..'], E: ['###', '#..', '##.', '#..', '###'], N: ['#.#', '###', '###', '#.#', '#.#'],
  C: ['###', '#..', '#..', '#..', '###'], L: ['#..', '#..', '#..', '#..', '###'], S: ['###', '#..', '###', '..#', '###'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
}
export function miniText(buffer: PixelBuffer, text: string, x: number, y: number, color: string, scale = 1): void {
  let cx = x
  for (const ch of text) {
    (MINI[ch] ?? MINI.O).forEach((row, dy) => { for (let dx = 0; dx < 3; dx += 1) if (row[dx] === '#') buffer.rect(cx + dx * scale, y + dy * scale, scale, scale, color) })
    cx += 4 * scale
  }
}

/** A glass pane: the colour graded top to bottom, a diagonal glint across it. */
function pane(buffer: PixelBuffer, x: number, y: number, w: number, h: number, top: string, bottom: string, glint = true): void {
  for (let yy = 0; yy < h; yy += 1) for (let xx = 0; xx < w; xx += 1) buffer.set(x + xx, y + yy, dither(x + xx, y + yy, yy / h) ? bottom : top)
  if (glint) for (let i = 0; i < Math.min(w, h) * 0.6; i += 1) { buffer.tint(x + 4 + i, y + h - 6 - i, '#ffffff', 0.18); buffer.tint(x + 7 + i, y + h - 6 - i, '#ffffff', 0.12) }
}

/**
 * A little convenience store at night, `width` wide, standing on `ground`,
 * 150 pixels high: a cornice, two gooseneck lamps, the striped awning in
 * the accent with its folds and scalloped edge, a window of shelves lit
 * warm, the glass door with its OPEN neon, a drinks fridge and a burger
 * poster, a kick plate in the accent's shade. Lights off, the glass goes
 * dark and the sign reads CLOSED.
 */
export function drawStore(buffer: PixelBuffer, x: number, width: number, ground: number, accent: string, frame: number, lit = true): void {
  const top = ground - 150
  const awningTop = top + 12, awningBottom = top + 44, wallTop = awningBottom + 8
  const kick = ground - 22
  const accentDark = dim(accent, 0.55), accentDeep = dim(accent, 0.38), accentLight = mix(accent, '#ffffff', 0.25)
  const wall = '#161a36', wallLight = '#20264a', frameC = '#2a3056', frameLight = '#3e4678'
  // the wall and the cornice
  buffer.rect(x, top + 6, width, ground - top - 6, wall)
  for (let yy = wallTop; yy < kick; yy += 6) buffer.rect(x, yy, width, 1, wallLight)
  buffer.rect(x - 6, top, width + 12, 8, '#252b50'); buffer.rect(x - 6, top, width + 12, 2, '#3a4272'); buffer.rect(x - 6, top + 7, width + 12, 1, '#10132a')
  // the awning: a fold of shade at the top, stripes, scallops with their shadow on the wall
  const stripe = 22
  for (let sx = 0; sx < width + 8; sx += 1) {
    const px = x - 4 + sx
    const on = Math.floor(sx / stripe) % 2 === 0
    const base = on ? accent : CREAM
    for (let yy = awningTop; yy < awningBottom; yy += 1) {
      const t = (yy - awningTop) / (awningBottom - awningTop)
      let c = base
      if (t < 0.18) c = on ? accentDark : '#cfc6a6'
      else if (t < 0.28) c = dither(px, yy, 0.5) ? (on ? accentDark : '#cfc6a6') : base
      else if (t > 0.85) c = on ? mix(accent, '#000000', 0.12) : '#e8e0c4'
      buffer.set(px, yy, c)
    }
    const k = sx % stripe
    const drop = Math.round(Math.sqrt(Math.max(0, 1 - ((k - stripe / 2 + 0.5) / (stripe / 2)) ** 2)) * 7)
    buffer.rect(px, awningBottom, 1, drop, on ? mix(accent, '#000000', 0.12) : '#e8e0c4')
    buffer.set(px, awningBottom + drop, on ? accentDeep : '#a8a088')
    for (let d = 1; d <= 4; d += 1) buffer.tint(px, awningBottom + drop + d, '#000000', 0.35 - d * 0.07)
  }
  buffer.rect(x - 4, awningTop - 2, width + 8, 2, accentDeep)
  // two gooseneck lamps over the awning and the light they throw
  for (const lx of [x + Math.round(width * 0.28), x + Math.round(width * 0.72)]) {
    buffer.rect(lx, top - 10, 3, 10, '#2a2f4a'); buffer.rect(lx - 6, top - 12, 15, 4, '#2a2f4a'); buffer.rect(lx - 5, top - 8, 13, 2, lit ? '#fff3b0' : '#4a4a58')
    if (lit) for (let dy = 0; dy < 26; dy += 1) for (let dx = -4 - dy; dx <= 4 + dy; dx += 1) if (dither(lx + dx, awningTop + dy, 0.5 * (1 - dy / 26))) buffer.tint(lx + dx + 1, top - 6 + dy, '#fff3b0', 0.35)
  }
  // the openings
  const doorW = 56, doorX = x + Math.round(width / 2 - doorW / 2)
  const glassTop = wallTop + 6, glassBottom = kick - 4
  const leftX = x + 12, leftW = doorX - 10 - leftX
  const rightX = doorX + doorW + 10, rightW = x + width - 12 - rightX
  const warmTop = lit ? '#ffd88a' : '#1d2140', warmLow = lit ? '#f29a3a' : '#171a34'
  for (const [wx, ww] of [[leftX, leftW], [rightX, rightW]] as const) {
    buffer.rect(wx - 4, glassTop - 4, ww + 8, glassBottom - glassTop + 8, frameC)
    buffer.rect(wx - 4, glassTop - 4, ww + 8, 1, frameLight)
    pane(buffer, wx, glassTop, ww, glassBottom - glassTop, warmTop, warmLow, false)
    if (lit) for (let lx = wx + 14; lx < wx + ww - 10; lx += 34) { buffer.rect(lx, glassTop, 16, 2, '#fffbe0'); for (let d = 1; d < 8; d += 1) for (let e = -d; e < 16 + d; e += 1) if (dither(lx + e, glassTop + 2 + d, 0.4 * (1 - d / 8))) buffer.tint(lx + e, glassTop + 2 + d, '#ffffff', 0.3) }
  }
  // shelves of bottles and boxes in the left window
  const next = rng(31)
  for (let sy = glassTop + 22; sy < glassBottom - 2; sy += 22) {
    buffer.rect(leftX, sy, leftW, 3, lit ? '#9a6a34' : '#10132a'); buffer.rect(leftX, sy, leftW, 1, lit ? '#c89050' : '#181c38')
    for (let bx = leftX + 3; bx < leftX + leftW - 8; bx += 7 + Math.floor(next() * 3)) {
      const c = GOODS[Math.floor(next() * GOODS.length)]
      const tone = lit ? c : dim(c, 0.22), light = lit ? mix(c, '#ffffff', 0.45) : tone, shadeC = lit ? dim(c, 0.72) : tone
      if (next() < 0.55) {
        const h = 11 + Math.floor(next() * 5)
        buffer.rect(bx, sy - h, 5, h, tone); buffer.rect(bx + 1, sy - h - 3, 3, 3, tone); buffer.rect(bx + 1, sy - h - 4, 3, 1, lit ? '#3a3a40' : tone)
        buffer.rect(bx, sy - h, 1, h, light); buffer.rect(bx + 4, sy - h, 1, h, shadeC)
        if (lit) buffer.rect(bx, sy - h + 4, 5, 3, '#fff1e0')
      } else {
        const h = 8 + Math.floor(next() * 6)
        buffer.rect(bx, sy - h, 6, h, tone); buffer.rect(bx, sy - h, 6, 1, light); buffer.rect(bx + 5, sy - h, 1, h, shadeC)
      }
    }
  }
  // the fridge: glass doors with handles, lit cold, rows of cans
  const fridgeW = Math.round(rightW * 0.56)
  const fx = rightX + 4
  buffer.rect(fx - 2, glassTop + 2, fridgeW + 4, glassBottom - glassTop - 2, '#c8ccd8')
  pane(buffer, fx, glassTop + 4, fridgeW, glassBottom - glassTop - 6, lit ? (frame % 9 === 8 ? '#8ac0e8' : '#d8f0ff') : '#161a34', lit ? '#9ad0f4' : '#141830', lit)
  for (let sy = glassTop + 18; sy < glassBottom - 3; sy += 15) {
    buffer.rect(fx, sy, fridgeW, 2, lit ? '#7aa6cc' : '#10132a')
    for (let bx = fx + 3; bx < fx + fridgeW - 4; bx += 6) {
      const c = ['#2a7ad0', '#5ad06a', '#e8412c', '#ffcc33'][(bx + sy) % 4]
      buffer.rect(bx, sy - 10, 4, 10, lit ? c : '#141830'); if (lit) buffer.rect(bx, sy - 10, 1, 10, mix(c, '#ffffff', 0.4))
    }
  }
  buffer.rect(fx + Math.round(fridgeW / 2) - 1, glassTop + 4, 2, glassBottom - glassTop - 6, '#c8ccd8')
  buffer.rect(fx + Math.round(fridgeW / 2) - 5, glassTop + 30, 2, 18, '#eef0f6'); buffer.rect(fx + Math.round(fridgeW / 2) + 3, glassTop + 30, 2, 18, '#eef0f6')
  // the burger poster
  const posterX = rightX + fridgeW + 14, posterW = rightW - fridgeW - 18
  if (posterW > 20) {
    const py = glassTop + 8, ph = Math.min(44, posterW + 6)
    const on = (c: string, off: string) => (lit ? c : off)
    const cx = posterX + posterW / 2, cy = py + ph / 2
    const bw = Math.round(posterW * 0.7)
    buffer.rect(posterX - 2, py - 2, posterW + 4, ph + 4, on('#fff1e0', '#2a2a38'))
    // a sunburst behind the burger, inside the poster only
    for (let yy = py; yy < py + ph; yy += 1) for (let xx = posterX; xx < posterX + posterW; xx += 1) {
      const ray = Math.floor(((Math.atan2(yy - cy, xx - cx) + Math.PI) / (Math.PI * 2)) * 16) % 2 === 0
      buffer.set(xx, yy, on(ray ? '#e84a2e' : '#c8241a', ray ? '#3a1a1a' : '#321616'))
    }
    buffer.poly([[cx - bw / 2, cy - 1], [cx - bw / 2 + 3, cy - 9], [cx + bw / 2 - 3, cy - 9], [cx + bw / 2, cy - 1]], on('#e89a3a', '#3a2a1a'))
    buffer.rect(cx - bw / 2, cy - 1, bw, 3, on('#5ad06a', '#1a3a1a')); buffer.rect(cx - bw / 2, cy + 2, bw, 2, on('#ffcc33', '#3a3a1a'))
    buffer.rect(cx - bw / 2, cy + 4, bw, 4, on('#6a3a1a', '#2a1a10')); buffer.rect(cx - bw / 2 + 2, cy + 8, bw - 4, 4, on('#e89a3a', '#3a2a1a'))
    for (const [sx, sy] of [[-6, -7], [0, -8], [5, -6]]) buffer.rect(cx + sx, cy + sy, 2, 1, on('#fff6dc', '#3a2a1a'))
  }
  // the door: frame, two glass leaves, a warm strip of light, push bars, the sign
  buffer.rect(doorX - 5, wallTop, doorW + 10, ground - wallTop, frameC)
  buffer.rect(doorX - 5, wallTop, doorW + 10, 1, frameLight)
  pane(buffer, doorX, wallTop + 5, doorW, ground - wallTop - 5, lit ? '#2a4070' : '#141830', lit ? '#1c2c52' : '#10132a', true)
  if (lit) { buffer.rect(doorX, wallTop + 5, doorW, 3, '#ffe7a0'); for (let d = 0; d < 6; d += 1) buffer.rect(doorX, wallTop + 8 + d, doorW, 1, mix('#2a4070', '#ffe7a0', 0.3 - d * 0.05)) }
  buffer.rect(doorX + doorW / 2 - 1, wallTop + 5, 3, ground - wallTop - 5, frameC)
  buffer.rect(doorX + 6, wallTop + 58, doorW / 2 - 12, 3, '#b8bccc'); buffer.rect(doorX + doorW / 2 + 6, wallTop + 58, doorW / 2 - 12, 3, '#b8bccc')
  const sign = lit ? 'OPEN' : 'CLOSED'
  const signW = sign.length * 8 + 6, signX = doorX + Math.round(doorW / 2 - signW / 2)
  buffer.rect(signX - 1, wallTop + 20, signW + 2, 16, '#3a3a48'); buffer.rect(signX, wallTop + 21, signW, 14, INK)
  const neon = lit && frame % 7 !== 6 ? accent : '#e0301e'
  if (lit) for (let yy = wallTop + 22; yy < wallTop + 34; yy += 1) for (let xx = signX + 1; xx < signX + signW - 1; xx += 1) if (dither(xx, yy, 0.25)) buffer.tint(xx, yy, neon, 0.35)
  miniText(buffer, sign, signX + 4, wallTop + 23, neon, 2)
  // the kick plate in panels, the pillars
  buffer.rect(x, kick, width, ground - kick, accentDark)
  buffer.rect(x, kick, width, 2, accentLight); buffer.rect(x, ground - 2, width, 2, accentDeep)
  for (let px = x + 8; px < x + width - 30; px += 46) { buffer.rect(px, kick + 5, 38, ground - kick - 9, accentDeep); buffer.rect(px, kick + 5, 38, 1, dim(accent, 0.3)); buffer.rect(px, ground - 5, 38, 1, mix(accentDark, '#ffffff', 0.15)) }
  for (const px of [x - 6, x + width - 2]) { buffer.rect(px, wallTop - 6, 8, ground - wallTop + 6, '#252b50'); buffer.rect(px, wallTop - 6, 1, ground - wallTop + 6, '#3a4272') }
}

/** The vending machine outside the store: a box in the accent, a lit window of drinks, buttons, the slot. */
export function vending(buffer: PixelBuffer, x: number, ground: number, accent: string, lit = true): void {
  const h = 76, w = 38
  buffer.rect(x - 1, ground - h - 1, w + 2, h + 1, INK)
  buffer.rect(x, ground - h, w, h, accent)
  buffer.rect(x, ground - h, 3, h, mix(accent, '#ffffff', 0.3)); buffer.rect(x + w - 3, ground - h, 3, h, dim(accent, 0.7))
  pane(buffer, x + 5, ground - h + 6, 22, 42, lit ? '#e0f4ff' : '#1a2040', lit ? '#a8d8f8' : '#141830', lit)
  for (let ry = 0; ry < 4; ry += 1) for (let rx = 0; rx < 3; rx += 1) {
    const c = GOODS[(rx + ry * 3) % GOODS.length]
    buffer.rect(x + 7 + rx * 7, ground - h + 9 + ry * 10, 4, 7, lit ? c : '#20264a')
  }
  for (let by = 0; by < 5; by += 1) buffer.rect(x + 30, ground - h + 8 + by * 7, 4, 4, lit ? (by === 2 ? '#ff4a4a' : '#f8f5e6') : '#3a3a48')
  buffer.rect(x + 8, ground - 22, 20, 8, INK); buffer.rect(x + 8, ground - 22, 20, 1, dim(accent, 0.5))
  buffer.rect(x + 30, ground - 30, 4, 8, INK)
}

/** A bin at the kerb, lidded, in the accent's shade. */
export function bin(buffer: PixelBuffer, x: number, ground: number, color: string): void {
  buffer.rect(x - 1, ground - 30, 26, 30, INK)
  buffer.rect(x, ground - 29, 24, 29, color)
  buffer.rect(x, ground - 29, 2, 29, mix(color, '#ffffff', 0.25))
  for (let px = x + 5; px < x + 21; px += 5) buffer.rect(px, ground - 24, 2, 20, dim(color, 0.7))
  buffer.rect(x - 3, ground - 35, 30, 7, INK); buffer.rect(x - 2, ground - 34, 28, 5, dim(color, 0.85)); buffer.rect(x - 2, ground - 34, 28, 1, mix(color, '#ffffff', 0.3))
  buffer.rect(x + 8, ground - 38, 8, 3, INK)
}

// ---------------------------------------------------------------- the diner (EATER)

/**
 * A diner at night, `width` wide, on `ground`, 128 pixels high: a chrome
 * roof band with two neon lines in the accent, warm windows between chrome
 * posts with hanging lamps, booths, tables with ketchup and mustard, a
 * plant; the door in the middle with its round window and a lamp over it;
 * the black-and-cream band of tiles under the windows, a chrome foot.
 */
export function drawDiner(buffer: PixelBuffer, x: number, width: number, ground: number, accent: string, frame: number, lit = true): void {
  const roof = ground - 128
  const bandBottom = roof + 30
  const checkTop = ground - 34, foot = ground - 16
  const chrome = '#c9ccd8', chromeDark = '#8a8ea4', chromeLight = '#f2f4fa', chromeDeep = '#5a5e74'
  const neon = lit ? accent : '#4a4a58', neonCore = lit ? mix(accent, '#ffffff', 0.7) : '#5a5a68'
  // the roof band: chrome in bands, two neon tubes with their glow
  buffer.rect(x - 10, roof, width + 20, bandBottom - roof, chrome)
  buffer.rect(x - 10, roof, width + 20, 2, chromeLight); buffer.rect(x - 10, roof + 2, width + 20, 1, chromeDark)
  buffer.rect(x - 10, bandBottom - 3, width + 20, 3, chromeDark); buffer.rect(x - 10, bandBottom - 1, width + 20, 1, chromeDeep)
  for (const ny of [roof + 8, roof + 17]) {
    if (lit) { buffer.rect(x - 8, ny - 2, width + 16, 8, mix(chrome, accent, 0.35)); buffer.rect(x - 8, ny - 1, width + 16, 6, mix(chrome, accent, 0.6)) }
    buffer.rect(x - 8, ny, width + 16, 4, neon); buffer.rect(x - 8, ny + 1, width + 16, 2, neonCore)
  }
  for (let px = x - 4; px < x + width + 4; px += 64) { buffer.rect(px, roof + 4, 3, bandBottom - roof - 7, chromeDark); buffer.rect(px, roof + 4, 1, bandBottom - roof - 7, chromeLight) }
  // the wall under the band
  buffer.rect(x, bandBottom, width, ground - bandBottom, '#2a2244')
  buffer.rect(x, bandBottom, width, 3, '#1a1430')
  // windows between posts, the door in the middle
  const doorW = 48, doorX = x + Math.round(width / 2 - doorW / 2)
  const winTop = bandBottom + 6, winBottom = checkTop - 4
  const spans: Array<[number, number]> = []
  const split = (from: number, to: number) => { const n = Math.max(1, Math.round((to - from) / 64)); for (let i = 0; i < n; i += 1) spans.push([from + Math.round(((to - from) * i) / n), from + Math.round(((to - from) * (i + 1)) / n)]) }
  split(x + 6, doorX - 8); split(doorX + doorW + 8, x + width - 6)
  const next = rng(17)
  spans.forEach(([a, b], i) => {
    const w = b - a - 6, wx = a + 3
    pane(buffer, wx, winTop, w, winBottom - winTop, lit ? '#ffd28a' : '#1c1834', lit ? '#f08a4a' : '#181430', false)
    const mid = wx + Math.round(w / 2)
    // a lamp hanging: cord, a dome shade in the accent, its light
    for (const lx of w > 50 ? [mid - Math.round(w / 4), mid + Math.round(w / 4)] : [mid]) {
      buffer.rect(lx, winTop, 1, 8, '#3a2a2a')
      buffer.poly([[lx - 7, winTop + 15], [lx - 4, winTop + 8], [lx + 5, winTop + 8], [lx + 8, winTop + 15]], lit ? accent : '#3a3048')
      buffer.rect(lx - 7, winTop + 15, 16, 1, lit ? dim(accent, 0.7) : '#2a2440')
      if (lit) { buffer.rect(lx - 3, winTop + 16, 7, 2, '#fff8d0'); for (let d = 0; d < 14; d += 1) for (let e = -3 - d; e <= 3 + d; e += 1) if (dither(lx + e, winTop + 18 + d, 0.35 * (1 - d / 14))) buffer.tint(lx + e, winTop + 18 + d, '#fff3c0', 0.25) }
    }
    // booths either side of a table, ketchup and mustard; a plant in the last window
    const seat = lit ? dim(accent, 0.75) : '#241c38', seatLight = lit ? mix(accent, '#ffffff', 0.2) : '#2a2240'
    const by = winBottom - 20
    buffer.rect(wx + 4, by, 10, 20, seat); buffer.rect(wx + 4, by, 10, 2, seatLight); buffer.rect(wx + 8, by + 3, 1, 14, dim(seat, 0.7))
    buffer.rect(wx + w - 14, by, 10, 20, seat); buffer.rect(wx + w - 14, by, 10, 2, seatLight); buffer.rect(wx + w - 10, by + 3, 1, 14, dim(seat, 0.7))
    buffer.rect(mid - 12, winBottom - 12, 24, 3, lit ? CREAM : '#2a2440'); buffer.rect(mid - 12, winBottom - 9, 24, 1, lit ? '#b8b4a0' : '#221c34')
    buffer.rect(mid - 1, winBottom - 9, 2, 9, lit ? chromeDark : '#221c34')
    if (lit) { buffer.rect(mid - 6, winBottom - 19, 3, 7, '#e0301e'); buffer.rect(mid - 6, winBottom - 20, 3, 1, '#ffffff'); buffer.rect(mid + 3, winBottom - 19, 3, 7, '#ffcc33'); buffer.rect(mid + 3, winBottom - 20, 3, 1, '#ffffff') }
    if (i === spans.length - 1 && lit) {
      const px = wx + w - 30
      buffer.rect(px, winBottom - 10, 10, 10, '#8a4a2a')
      for (let k = 0; k < 7; k += 1) buffer.disc(px + 5 + Math.cos(k * 1.7) * 5 * next(), winBottom - 16 - k * 1.6, 3, k % 2 ? '#2f8f4a' : '#1d6a3c')
    }
    // the chrome posts
    buffer.rect(a, winTop - 2, 4, winBottom - winTop + 4, chrome); buffer.rect(a, winTop - 2, 1, winBottom - winTop + 4, chromeLight); buffer.rect(a + 3, winTop - 2, 1, winBottom - winTop + 4, chromeDark)
    buffer.rect(b - 3, winTop - 2, 4, winBottom - winTop + 4, chrome); buffer.rect(b - 3, winTop - 2, 1, winBottom - winTop + 4, chromeLight)
  })
  buffer.rect(x + 4, winTop - 3, width - 8, 2, chrome); buffer.rect(x + 4, winBottom + 1, width - 8, 3, chrome); buffer.rect(x + 4, winBottom + 1, width - 8, 1, chromeLight)
  // the door: chrome frame, dark glass, a round window lit warm, a handle, a lamp over it
  buffer.rect(doorX - 5, winTop - 6, doorW + 10, ground - winTop + 6, chrome)
  buffer.rect(doorX - 5, winTop - 6, 2, ground - winTop + 6, chromeLight); buffer.rect(doorX + doorW + 3, winTop - 6, 2, ground - winTop + 6, chromeDark)
  buffer.rect(doorX, winTop - 1, doorW, ground - winTop + 1, '#1c1636')
  buffer.rect(doorX + 3, winTop + 2, doorW - 6, ground - winTop - 5, '#231c42')
  buffer.disc(doorX + doorW / 2, winTop + 22, 11, chromeDark); buffer.disc(doorX + doorW / 2, winTop + 22, 9, lit ? '#ffcf7a' : '#241c38')
  if (lit) buffer.disc(doorX + doorW / 2 - 3, winTop + 19, 3, '#fff0c0')
  buffer.rect(doorX + doorW - 12, winTop + 46, 3, 16, chromeLight); buffer.rect(doorX + doorW - 11, winTop + 46, 1, 16, chromeDark)
  buffer.rect(doorX + doorW / 2 - 8, winTop - 12, 16, 5, '#3a3048'); buffer.rect(doorX + doorW / 2 - 6, winTop - 7, 12, 2, lit ? '#fff3b0' : '#4a4a58')
  if (lit) for (let d = 0; d < 20; d += 1) for (let e = -6 - d; e <= 6 + d; e += 1) if (dither(doorX + doorW / 2 + e, winTop - 5 + d, 0.4 * (1 - d / 20))) buffer.tint(doorX + doorW / 2 + e, winTop - 5 + d, '#fff3c0', 0.3)
  // the band of tiles, black and cream, and the chrome foot
  for (let cx = x; cx < x + width; cx += 1) {
    if (cx >= doorX - 5 && cx < doorX + doorW + 5) continue
    for (let yy = checkTop; yy < foot; yy += 1) {
      const light = (Math.floor((cx - x) / 9) + Math.floor((yy - checkTop) / 9)) % 2 === 0
      buffer.set(cx, yy, light ? (lit ? CREAM : '#8a8698') : '#14101c')
    }
  }
  buffer.rect(x, checkTop - 2, width, 2, chrome)
  buffer.rect(x, foot, width, ground - foot, chromeDark)
  buffer.rect(x, foot, width, 2, chromeLight); buffer.rect(x, foot + 6, width, 1, chromeDeep); buffer.rect(x, ground - 2, width, 2, chromeDeep)
}

/** The frame the neon hangs on over the roof: a dark backing, a chrome edge, posts down to the roof. */
export function signFrame(buffer: PixelBuffer, x: number, y: number, width: number, height: number, roof: number): void {
  const chrome = '#c9ccd8', chromeDark = '#8a8ea4'
  for (const lx of [x + Math.round(width * 0.22), x + Math.round(width * 0.78)]) { buffer.rect(lx - 3, y + height, 6, roof - y - height, chromeDark); buffer.rect(lx - 3, y + height, 1, roof - y - height, chrome) }
  buffer.poly([[x + 10, y], [x + width - 10, y], [x + width, y + height], [x, y + height]], '#0f0b20')
  buffer.rect(x, y + height - 3, width, 3, chromeDark); buffer.rect(x, y + height - 3, width, 1, chrome)
  buffer.line(x + 10, y, x + width - 10, y, '#2a2246')
}
