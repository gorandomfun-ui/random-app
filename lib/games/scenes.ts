/**
 * The night street both games open on, drawn in pixels piece by piece: a
 * sky that deepens upward, stars, a crescent moon, clouds lit on their
 * rims, the city behind, a railing, the sidewalk, the road with its cars.
 * In the middle, RANDOM CATCHER's little convenience store or RANDOM
 * EATER's diner. Every piece takes its place from the caller, so the same
 * street recomposes wide or tall.
 */

import { dim, mix, PixelBuffer } from './pixels'

const CREAM = '#f8f5e6'
const INK = '#0a0a14'

/** A small deterministic sequence, so a scene is the same every time it is drawn. */
export function rng(seed: number): () => number {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

export type Night = {
  sky: readonly string[]
  cloud: string; cloudLight: string; rim: string
  farCity: string; nearCity: string; windows: readonly string[]
  sidewalk: string; sidewalkLight: string; road: string; line: string
  leaf: readonly string[]
}

/** CATCHER's night is blue, EATER's is violet with pink on the clouds. */
export const NIGHTS: Record<'blue' | 'violet', Night> = {
  blue: {
    sky: ['#070b26', '#0b1333', '#101b45', '#16245a', '#1d2e70'],
    cloud: '#2a3d8f', cloudLight: '#4a66c4', rim: '#efe0bc',
    farCity: '#172565', nearCity: '#0f1848', windows: ['#f2c33c', '#ffd97a'],
    sidewalk: '#4a5078', sidewalkLight: '#6a7098', road: '#161a36', line: '#efe0bc',
    leaf: ['#1e5a3a', '#2f7d45', '#4aa85a'],
  },
  violet: {
    sky: ['#0b0620', '#120a2c', '#1a0f3c', '#24164e', '#301d60'],
    cloud: '#3a2a78', cloudLight: '#5b3f9e', rim: '#ff7aa2',
    farCity: '#261a5c', nearCity: '#180f40', windows: ['#ffb85a', '#5fe3ff', '#ff7aa2'],
    sidewalk: '#4a4270', sidewalkLight: '#6a6090', road: '#140f2c', line: '#efe0bc',
    leaf: ['#123a38', '#1d5a4a', '#2f7d5a'],
  },
}

/** The sky in bands from dark to light down to `horizon`, the seams dithered. */
export function sky(buffer: PixelBuffer, night: Night, horizon: number): void {
  const bands = night.sky
  const bandH = horizon / bands.length
  for (let y = 0; y < buffer.height; y += 1) {
    const f = y / bandH
    const i = Math.min(bands.length - 1, Math.floor(f))
    const next = Math.min(bands.length - 1, i + 1)
    const frac = f - i
    for (let x = 0; x < buffer.width; x += 1) {
      // the last quarter of each band mixes into the next, one pixel in two
      const dither = frac > 0.75 && (x + y) % 2 === 0
      buffer.set(x, y, dither ? bands[next] : bands[i])
    }
  }
}

/** Stars: single pixels, a few crosses that twinkle with the frame. */
export function stars(buffer: PixelBuffer, seed: number, count: number, below: number, frame: number): void {
  const next = rng(seed)
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(next() * buffer.width), y = Math.floor(next() * below)
    const big = next() < 0.18
    if (big && (i + frame) % 4 !== 0) {
      buffer.set(x, y, CREAM); buffer.set(x - 1, y, '#9aa0c8'); buffer.set(x + 1, y, '#9aa0c8'); buffer.set(x, y - 1, '#9aa0c8'); buffer.set(x, y + 1, '#9aa0c8')
    } else if (!big && (i + frame) % 7 !== 0) buffer.set(x, y, next() < 0.5 ? CREAM : '#9aa0c8')
  }
}

/** A crescent moon: a disc of cream with a second disc taken out of it, two craters. */
export function moon(buffer: PixelBuffer, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
    const inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
    const bitten = (x + 0.5 - cx + r * 0.55) ** 2 + (y + 0.5 - cy + r * 0.25) ** 2 <= (r * 0.9) ** 2
    if (inside && !bitten) buffer.set(x, y, (x - cx) > r * 0.45 ? '#e6d6a8' : '#fff3cc')
  }
}

/**
 * A cloud: puffs of different sizes on a flat base, the biggest off
 * centre, each puff lit on its upper left — a rim of light, a lit band,
 * the body, a darker underside.
 */
export function cloud(buffer: PixelBuffer, x: number, y: number, width: number, night: Night, seed: number): void {
  const next = rng(seed)
  const peak = Math.min(12, Math.max(5, width / 4.5))
  const height = Math.ceil(peak * 1.7) + 2
  const base = height - 2
  const puffs: Array<[number, number, number]> = []
  const count = Math.max(3, Math.round(width / 11))
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count
    const r = Math.max(3, peak * (0.42 + 0.58 * Math.sin(Math.PI * Math.pow(t, 0.8))) * (0.8 + next() * 0.35))
    puffs.push([t * width + (next() - 0.5) * 3, base - r * 0.55, r])
  }
  const inside = (px: number, py: number) => py < base + 1 && (puffs.some(([cx, cy, r]) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r) || (py > base - 4 && px > puffs[0][0] && px < puffs[puffs.length - 1][0]))
  for (let yy = 0; yy < height; yy += 1) for (let xx = 0; xx < width; xx += 1) {
    const px = xx + 0.5, py = yy + 0.5
    if (!inside(px, py)) continue
    const rim = !inside(px, py - 1) || !inside(px - 1, py - 1)
    const lit = !inside(px - 1, py - 2.5) || !inside(px, py - 3)
    const under = yy >= base - 2
    buffer.set(x + xx, y + yy, rim ? night.rim : under ? dim(night.cloud, 0.75) : lit ? night.cloudLight : night.cloud)
  }
}

/** The city: blocks of towers from `base` up, the far row paler, lit windows here and there, one blinking. */
export function city(buffer: PixelBuffer, night: Night, base: number, tallest: number, seed: number, frame: number): void {
  for (const [layer, color, lit] of [[0, night.farCity, 0.18], [1, night.nearCity, 0.3]] as const) {
    const next = rng(seed + layer * 97)
    let x = -6 - Math.floor(next() * 10)
    while (x < buffer.width) {
      const w = 14 + Math.floor(next() * 22)
      const h = Math.floor(tallest * (0.35 + next() * 0.65) * (layer === 0 ? 1 : 0.72))
      const top = base - h
      buffer.rect(x, top, w, h, color)
      if (next() < 0.3) buffer.rect(x + Math.floor(w / 2), top - 5, 1, 5, color)
      if (next() < 0.25) buffer.rect(x + 2, top - 2, w - 4, 2, color)
      for (let wy = top + 4; wy < base - 3; wy += 5) for (let wx = x + 3; wx < x + w - 3; wx += 4) {
        const on = next() < lit
        const tone = night.windows[Math.floor(next() * night.windows.length)]
        if (on && !(next() < 0.06 && frame % 3 === 1)) buffer.rect(wx, wy, 2, 2, layer === 0 ? dim(tone, 0.55) : tone)
      }
      x += w + (layer === 0 ? 2 : 4) + Math.floor(next() * 4)
    }
  }
}

/** A low railing along the back of the sidewalk: a bar, a post every so often. */
export function railing(buffer: PixelBuffer, y: number, color: string, from = 0, to = buffer.width): void {
  buffer.rect(from, y, to - from, 2, color)
  buffer.rect(from, y + 5, to - from, 1, dim(color, 0.8))
  for (let x = from + 6; x < to; x += 22) buffer.rect(x, y - 1, 3, 11, color)
}

/** The sidewalk from `top`, the kerb, the road down to `bottom` with its dashed line at `line`. */
export function street(buffer: PixelBuffer, night: Night, top: number, depth: number, bottom: number, line: number): void {
  buffer.rect(0, top, buffer.width, depth, night.sidewalk)
  buffer.rect(0, top, buffer.width, 1, night.sidewalkLight)
  for (let x = 0; x < buffer.width; x += 20) buffer.rect(x, top + 1, 1, depth - 1, dim(night.sidewalk, 0.8))
  buffer.rect(0, top + depth, buffer.width, 2, night.sidewalkLight)
  buffer.rect(0, top + depth + 2, buffer.width, 1, dim(night.sidewalk, 0.6))
  buffer.rect(0, top + depth + 3, buffer.width, bottom - top - depth - 3, night.road)
  for (let x = 4; x < buffer.width; x += 26) buffer.rect(x, line, 14, 2, night.line)
}

/** A street lamp standing on `ground`: a pole, an arm, a warm lamp with a halo of light round it. */
export function lamp(buffer: PixelBuffer, x: number, ground: number, height: number, facingLeft = false): void {
  const pole = '#2a2f4a', head = '#ffe08a'
  // the halo first, a soft disc dithered into the night
  const hx = x + 1, hy = ground - height + 3
  for (let y = hy - 9; y <= hy + 9; y += 1) for (let xx = hx - 9; xx <= hx + 9; xx += 1) {
    const d = Math.hypot(xx - hx, y - hy)
    if (d < 5 || (d < 9 && (xx + y) % 2 === 0)) {
      if (xx < 0 || y < 0 || xx >= buffer.width || y >= buffer.height) continue
      const [r, g, b] = buffer.get(xx, y)
      const lit = mix(`#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`, '#ffd27a', d < 5 ? 0.35 : 0.18)
      buffer.set(xx, y, lit)
    }
  }
  buffer.rect(x, ground - height, 2, height, pole)
  buffer.rect(x - 1, ground - 3, 4, 3, pole)
  buffer.rect(x - 2, ground - height, 6, 2, pole)
  buffer.rect(x - 1, ground - height + 2, 4, 3, head)
  buffer.set(facingLeft ? x - 2 : x + 3, ground - height + 1, pole)
}

/** A round tree: a trunk, a crown of three greens lit from the top left. */
export function tree(buffer: PixelBuffer, x: number, ground: number, size: number, night: Night, seed: number): void {
  const next = rng(seed)
  buffer.rect(x - 1, ground - size, 3, size, '#4a2a18')
  const cy = ground - size - size * 0.3
  const blobs = Array.from({ length: 5 }, () => [x + (next() - 0.5) * size * 0.9, cy + (next() - 0.5) * size * 0.6, size * (0.35 + next() * 0.2)] as const)
  for (const [bx, by, r] of blobs) buffer.disc(bx, by + 1, r, night.leaf[0])
  for (const [bx, by, r] of blobs) buffer.disc(bx, by, r - 1, night.leaf[1])
  for (const [bx, by, r] of blobs) buffer.disc(bx - r * 0.3, by - r * 0.35, r * 0.45, night.leaf[2])
}

/** A palm: a leaning trunk in rings, a crown of fronds arching out and drooping, each two greens. */
export function palm(buffer: PixelBuffer, x: number, ground: number, height: number, lean: number, night: Night): void {
  for (let i = 0; i < height; i += 1) {
    const t = i / height
    const px = Math.round(x + lean * t * t * height * 0.22)
    buffer.rect(px - 1, ground - i, 3, 1, i % 4 === 0 ? '#2e1c0c' : '#5a3a1c')
    if (i % 4 === 1) buffer.set(px + 1, ground - i, '#7a5028')
  }
  const topX = Math.round(x + lean * height * 0.22), topY = ground - height
  // fronds: an arc up and out, then down; the far ones darker
  const fronds: Array<[number, number, number, number]> = [[-1, 18, 0.9, 0], [1, 18, 0.9, 0], [-1, 14, 1.4, 0], [1, 14, 1.4, 0], [-1, 11, 0.4, 1], [1, 11, 0.4, 1], [-0.4, 9, 1.8, 1], [0.5, 9, 1.8, 1]]
  for (const [dir, len, droop, far] of fronds) {
    for (let s = 0; s <= len; s += 1) {
      const t = s / len
      const fx = Math.round(topX + dir * s)
      const fy = Math.round(topY - Math.sin(t * Math.PI * 0.6) * 4 + t * t * len * droop * 0.5)
      buffer.rect(fx, fy, 2, 1, far ? night.leaf[0] : night.leaf[1])
      if (s % 2 === 0 && s > 2) { buffer.set(fx, fy + 1, night.leaf[0]); buffer.set(fx, fy + 2, night.leaf[0]) }
      if (!far && s % 3 === 0) buffer.set(fx, fy - 1, night.leaf[2])
    }
  }
  buffer.disc(topX + 0.5, topY + 1.5, 2.2, '#3a2410')
}

/** A car from the side, 52 pixels long: body, cabin with windows, chrome, wheels, lights. `dir` 1 goes right. */
export function car(buffer: PixelBuffer, x: number, y: number, color: string, dir: 1 | -1): void {
  const dark = dim(color, 0.62), light = mix(color, '#ffffff', 0.35)
  const L = 52
  const X = (dx: number, w = 1) => (dir === 1 ? x + dx : x + L - dx - w)
  const hline = (dx: number, dy: number, w: number, c: string) => buffer.rect(X(dx, w), y + dy, w, 1, c)
  // the outline and body
  hline(14, 0, 22, INK)
  hline(12, 1, 26, INK); hline(13, 1, 24, color)
  for (let dy = 2; dy < 6; dy += 1) { hline(11 - (dy - 2), dy, 30 + (dy - 2) * 2, INK); hline(12 - (dy - 2), dy, 28 + (dy - 2) * 2, color) }
  hline(2, 6, 49, INK); hline(3, 6, 47, color)
  for (let dy = 7; dy < 13; dy += 1) { hline(0, dy, 52, INK); hline(1, dy, 50, dy < 9 ? light : dy > 10 ? dark : color) }
  hline(1, 13, 50, INK)
  // windows, the pillar between them, a glint
  for (let dy = 2; dy < 6; dy += 1) { hline(14 - (dy - 2), dy, 9 + (dy - 2), '#1a2440'); hline(26, dy, 10 + (dy - 2), '#1a2440') }
  hline(24, 2, 2, color); hline(24, 3, 2, color); hline(24, 4, 2, color); hline(24, 5, 2, color)
  hline(29, 2, 3, '#6a88c8')
  // a door line, the chrome strip, lights
  hline(1, 10, 50, dark)
  buffer.rect(X(25), y + 7, 1, 5, dark)
  hline(1, 12, 50, '#b8bcc8')
  buffer.rect(X(49, 2), y + 7, 2, 2, '#fff3b0')
  buffer.rect(X(1, 2), y + 7, 2, 2, '#e0301e')
  // wheels
  for (const wx of [11, 40]) {
    buffer.disc(X(wx) + 0.5, y + 14, 5, INK)
    buffer.disc(X(wx) + 0.5, y + 14, 2.4, '#8a8f9c')
    buffer.set(X(wx), y + 14, '#d0d4de')
  }
}

// ---------------------------------------------------------------- the store (CATCHER)

/** Colours of the bottles on the store's shelves. */
const GOODS = ['#e8412c', '#ffcc33', '#4a7cff', '#5ad06a', '#ff7ab0', '#fff1e0']

/**
 * A little convenience store at night, `width` wide, standing on `ground`:
 * the striped awning in the accent with two lamps over it, a window of
 * shelves lit warm, the glass door with its OPEN sign, a drinks fridge and
 * a burger poster; a kick plate in the accent's shade. With the lights off
 * the glass goes dark and the sign reads CLOSED.
 */
export function drawStore(buffer: PixelBuffer, x: number, width: number, ground: number, accent: string, frame: number, lit = true): void {
  const top = ground - 72
  const awningTop = top + 4, awningBottom = top + 18, wallTop = awningBottom + 2
  const kick = ground - 10
  const accentDark = dim(accent, 0.5)
  // the cornice and the wall behind
  buffer.rect(x - 2, top, width + 4, 4, '#262b48')
  buffer.rect(x - 2, top, width + 4, 1, '#3a4068')
  buffer.rect(x, wallTop - 2, width, ground - wallTop + 2, '#161a34')
  // the awning: stripes, a fold at the top, a scalloped edge
  const stripe = 10
  for (let sx = 0; sx < width; sx += 1) {
    const on = Math.floor(sx / stripe) % 2 === 0
    const color = on ? accent : CREAM
    buffer.rect(x + sx, awningTop, 1, awningBottom - awningTop, color)
    buffer.set(x + sx, awningTop, on ? accentDark : '#c9c2a8')
    buffer.set(x + sx, awningTop + 1, on ? accentDark : '#c9c2a8')
    const inScallop = sx % stripe
    const drop = inScallop > 1 && inScallop < stripe - 2 ? 3 : inScallop > 0 && inScallop < stripe - 1 ? 2 : 0
    buffer.rect(x + sx, awningBottom, 1, drop, color)
    buffer.set(x + sx, awningBottom + drop, dim(color, 0.55))
  }
  // two lamps over the awning and the light they throw on it
  for (const lx of [x + Math.round(width * 0.25), x + Math.round(width * 0.75)]) {
    buffer.rect(lx - 3, top - 3, 7, 3, '#2a2f4a')
    buffer.rect(lx - 2, top, 5, 1, lit ? '#fff3b0' : '#4a4a58')
    if (lit) for (let dy = 0; dy < 8; dy += 1) for (let dx = -2 - dy; dx <= 2 + dy; dx += 1) if ((dx + dy) % 2 === 0) {
      const px = lx + dx, py = awningTop + dy
      const [r, g, b] = buffer.get(Math.max(0, Math.min(buffer.width - 1, px)), Math.min(buffer.height - 1, py))
      buffer.set(px, py, mix(`#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`, '#fff3b0', 0.3))
    }
  }
  // the openings: a shelf window, the door, the fridge and poster window
  const doorW = 26, doorX = x + Math.round(width / 2 - doorW / 2)
  const glassTop = wallTop + 4, glassBottom = kick - 1
  const leftX = x + 6, leftW = doorX - 4 - leftX
  const rightX = doorX + doorW + 4, rightW = x + width - 6 - rightX
  const warmTop = lit ? '#ffcf7a' : '#1d2140', warmLow = lit ? '#f2a03a' : '#181b36'
  const frameColor = '#2c3150'
  for (const [wx, ww] of [[leftX, leftW], [rightX, rightW]] as const) {
    buffer.rect(wx - 2, glassTop - 2, ww + 4, glassBottom - glassTop + 3, frameColor)
    for (let yy = glassTop; yy < glassBottom; yy += 1) buffer.rect(wx, yy, ww, 1, yy - glassTop < (glassBottom - glassTop) * 0.45 ? warmTop : warmLow)
  }
  // shelves of bottles in the left window
  const next = rng(31)
  for (let sy = glassTop + 9; sy < glassBottom; sy += 10) {
    buffer.rect(leftX, sy, leftW, 1, lit ? '#8a5a2a' : '#10132a')
    for (let bx = leftX + 2; bx < leftX + leftW - 3; bx += 4) {
      const h = 4 + Math.floor(next() * 3)
      const c = GOODS[Math.floor(next() * GOODS.length)]
      buffer.rect(bx, sy - h, 3, h, lit ? c : dim(c, 0.25))
      if (lit) buffer.set(bx, sy - h, mix(c, '#ffffff', 0.5))
    }
  }
  // the fridge and the poster in the right window
  const fridgeW = Math.round(rightW * 0.55)
  buffer.rect(rightX + 2, glassTop + 2, fridgeW, glassBottom - glassTop - 2, lit ? (frame % 9 === 8 ? '#7ab8e0' : '#bfe6ff') : '#161a34')
  for (let sy = glassTop + 8; sy < glassBottom - 1; sy += 7) {
    buffer.rect(rightX + 2, sy, fridgeW, 1, lit ? '#6a9ac8' : '#10132a')
    for (let bx = rightX + 4; bx < rightX + fridgeW - 1; bx += 4) buffer.rect(bx, sy - 5, 2, 5, lit ? ['#2a7ad0', '#5ad06a', '#e8412c'][(bx + sy) % 3] : '#141830')
  }
  const posterX = rightX + fridgeW + 5, posterW = rightW - fridgeW - 7
  if (posterW > 8) {
    buffer.rect(posterX, glassTop + 4, posterW, 16, lit ? '#e0301e' : '#3a1a1a')
    buffer.rect(posterX + 2, glassTop + 7, posterW - 4, 3, lit ? '#e89a3a' : '#3a2a1a')
    buffer.rect(posterX + 2, glassTop + 10, posterW - 4, 2, lit ? '#5ad06a' : '#1a3a1a')
    buffer.rect(posterX + 2, glassTop + 12, posterW - 4, 2, lit ? '#6a3a1a' : '#2a1a10')
    buffer.rect(posterX + 2, glassTop + 14, posterW - 4, 3, lit ? '#e89a3a' : '#3a2a1a')
  }
  // the door: a frame, the glass, a strip of light, the push bar, the sign
  buffer.rect(doorX - 2, wallTop, doorW + 4, ground - wallTop, frameColor)
  buffer.rect(doorX, wallTop + 2, doorW, ground - wallTop - 2, lit ? '#22345a' : '#141830')
  buffer.rect(doorX, wallTop + 2, doorW, 2, lit ? '#ffe7a0' : '#1d2140')
  buffer.rect(doorX + Math.round(doorW / 2) - 1, wallTop + 2, 2, ground - wallTop - 2, frameColor)
  buffer.rect(doorX + 3, wallTop + 26, doorW - 6, 2, '#9aa0b8')
  for (let i = 0; i < 6; i += 1) buffer.set(doorX + 4 + i, wallTop + 6 + i, lit ? '#3a5080' : '#1a2040')
  const sign = lit ? 'OPEN' : 'CLOSED'
  const signW = sign.length * 4 + 3
  const signX = doorX + Math.round(doorW / 2 - signW / 2)
  buffer.rect(signX, wallTop + 10, signW, 9, INK)
  let cx = signX + 2
  for (const ch of sign) { drawMini(buffer, ch, cx, wallTop + 12, lit && frame % 6 !== 5 ? accent : '#e0301e'); cx += 4 }
  // the kick plate
  buffer.rect(x, kick, width, ground - kick, accentDark)
  buffer.rect(x, kick, width, 1, dim(accent, 0.7))
  for (let px = x + 12; px < x + width; px += 24) buffer.rect(px, kick + 2, 1, ground - kick - 2, dim(accent, 0.35))
  // the pillars at both ends
  buffer.rect(x - 2, wallTop - 2, 4, ground - wallTop + 2, '#262b48')
  buffer.rect(x + width - 2, wallTop - 2, 4, ground - wallTop + 2, '#262b48')
}

/** The vending machine outside the store: a box in the accent, a lit panel of buttons, the slot. */
export function vending(buffer: PixelBuffer, x: number, ground: number, accent: string, lit = true): void {
  buffer.rect(x, ground - 36, 18, 36, INK)
  buffer.rect(x + 1, ground - 35, 16, 35, accent)
  buffer.rect(x + 1, ground - 35, 2, 35, mix(accent, '#ffffff', 0.3))
  buffer.rect(x + 3, ground - 32, 12, 18, lit ? '#d8f0ff' : '#1a2040')
  for (let ry = 0; ry < 4; ry += 1) for (let rx = 0; rx < 3; rx += 1) buffer.rect(x + 4 + rx * 4, ground - 31 + ry * 4, 2, 3, lit ? GOODS[(rx + ry * 3) % GOODS.length] : '#20264a')
  buffer.rect(x + 4, ground - 10, 10, 4, INK)
}

/** A bin at the kerb, lidded. */
export function bin(buffer: PixelBuffer, x: number, ground: number, color: string): void {
  buffer.rect(x, ground - 14, 12, 14, INK)
  buffer.rect(x + 1, ground - 13, 10, 13, color)
  buffer.rect(x - 1, ground - 16, 14, 3, INK)
  buffer.rect(x, ground - 15, 12, 1, mix(color, '#ffffff', 0.25))
  for (let px = x + 3; px < x + 10; px += 3) buffer.rect(px, ground - 11, 1, 9, dim(color, 0.7))
}

/** Three-by-five capitals for the little signs on the buildings. */
const MINI: Record<string, readonly string[]> = {
  O: ['###', '#.#', '#.#', '#.#', '###'], P: ['###', '#.#', '###', '#..', '#..'], E: ['###', '#..', '##.', '#..', '###'], N: ['#.#', '###', '###', '#.#', '#.#'],
  C: ['###', '#..', '#..', '#..', '###'], L: ['#..', '#..', '#..', '#..', '###'], S: ['###', '#..', '###', '..#', '###'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
}
function drawMini(buffer: PixelBuffer, ch: string, x: number, y: number, color: string): void {
  (MINI[ch] ?? MINI.O).forEach((row, dy) => { for (let dx = 0; dx < 3; dx += 1) if (row[dx] === '#') buffer.set(x + dx, y + dy, color) })
}

// ---------------------------------------------------------------- the diner (EATER)

/**
 * A diner at night, `width` wide, on `ground`: a chrome roof band with two
 * neon lines in the accent, warm windows between chrome posts with lamps
 * hanging and booths, the door in the middle with its round window, the
 * black-and-cream band of tiles under the windows, a chrome foot. The sign
 * board on the roof is drawn apart, so the neon mark can sit on it.
 */
export function drawDiner(buffer: PixelBuffer, x: number, width: number, ground: number, accent: string, frame: number, lit = true): void {
  const roof = ground - 64
  const bandBottom = roof + 14
  const checkTop = ground - 18, foot = ground - 9
  const chrome = '#c9ccd8', chromeDark = '#8a8ea4', chromeLight = '#eef0f6'
  // the roof band: chrome, two neon lines, a lip overhanging
  buffer.rect(x - 4, roof, width + 8, bandBottom - roof, chrome)
  buffer.rect(x - 4, roof, width + 8, 1, chromeLight)
  buffer.rect(x - 4, bandBottom - 1, width + 8, 1, chromeDark)
  const neon = lit ? accent : '#4a4a58'
  for (const ny of [roof + 4, roof + 9]) {
    buffer.rect(x - 2, ny, width + 4, 2, neon)
    if (lit) { buffer.rect(x - 2, ny - 1, width + 4, 1, mix(chrome, accent, 0.4)); buffer.rect(x - 2, ny + 2, width + 4, 1, mix(chrome, accent, 0.4)); buffer.rect(x - 2, ny, width + 4, 1, mix(accent, '#ffffff', 0.6)) }
  }
  // the wall under the band
  buffer.rect(x, bandBottom, width, ground - bandBottom, '#2a2244')
  // windows between posts, the door in the middle
  const doorW = 24, doorX = x + Math.round(width / 2 - doorW / 2)
  const winTop = bandBottom + 3, winBottom = checkTop - 2
  const spans: Array<[number, number]> = []
  const half = (from: number, to: number) => { const n = Math.max(1, Math.round((to - from) / 30)); for (let i = 0; i < n; i += 1) spans.push([from + Math.round(((to - from) * i) / n), from + Math.round(((to - from) * (i + 1)) / n)]) }
  half(x + 4, doorX - 4); half(doorX + doorW + 4, x + width - 4)
  for (const [a, b] of spans) {
    const w = b - a - 3
    for (let yy = winTop; yy < winBottom; yy += 1) buffer.rect(a + 2, yy, w, 1, lit ? (yy - winTop < (winBottom - winTop) * 0.5 ? '#ffcf7a' : '#f29a4a') : '#1c1834')
    // a lamp hanging, a booth, a table with ketchup and mustard
    const mid = a + 2 + Math.round(w / 2)
    buffer.rect(mid, winTop, 1, 4, '#3a2a2a')
    buffer.rect(mid - 3, winTop + 4, 7, 3, lit ? accent : '#3a3048')
    if (lit) buffer.rect(mid - 2, winTop + 7, 5, 1, '#fff3b0')
    buffer.rect(a + 3, winBottom - 9, 5, 9, lit ? dim(accent, 0.7) : '#241c38')
    buffer.rect(a + w - 6, winBottom - 9, 5, 9, lit ? dim(accent, 0.7) : '#241c38')
    buffer.rect(mid - 5, winBottom - 6, 11, 2, lit ? CREAM : '#2a2440')
    buffer.rect(mid - 4, winBottom - 4, 1, 4, lit ? '#8a8ea4' : '#2a2440')
    buffer.rect(mid + 4, winBottom - 4, 1, 4, lit ? '#8a8ea4' : '#2a2440')
    if (lit) { buffer.rect(mid - 2, winBottom - 9, 1, 3, '#e0301e'); buffer.rect(mid + 1, winBottom - 9, 1, 3, '#ffcc33') }
    buffer.rect(a, winTop - 1, 2, winBottom - winTop + 2, chrome)
    buffer.rect(b - 1, winTop - 1, 2, winBottom - winTop + 2, chrome)
  }
  buffer.rect(x + 2, winTop - 1, width - 4, 1, chrome)
  // the door: chrome frame, dark glass, a round window lit warm, a handle
  buffer.rect(doorX - 2, winTop - 1, doorW + 4, ground - winTop + 1, chrome)
  buffer.rect(doorX, winTop + 1, doorW, ground - winTop - 1, '#1c1636')
  buffer.disc(doorX + doorW / 2, winTop + 10, 5, chromeDark)
  buffer.disc(doorX + doorW / 2, winTop + 10, 4, lit ? '#ffcf7a' : '#241c38')
  buffer.rect(doorX + doorW - 6, winTop + 22, 2, 7, chromeLight)
  if (lit) buffer.rect(doorX + 2, winTop + 2, doorW - 4, 1, mix('#1c1636', '#ffcf7a', 0.4))
  // the band of tiles, black and cream, and the chrome foot
  for (let cx = x; cx < x + width; cx += 1) {
    if (cx >= doorX - 2 && cx < doorX + doorW + 2) continue
    for (let yy = checkTop; yy < foot; yy += 1) buffer.set(cx, yy, (Math.floor((cx - x) / 4) + Math.floor((yy - checkTop) / 4)) % 2 === 0 ? '#16121e' : (lit ? CREAM : '#8a8698'))
  }
  buffer.rect(x, checkTop - 1, width, 1, chrome)
  buffer.rect(x, foot, width, ground - foot, chromeDark)
  buffer.rect(x, foot, width, 1, chromeLight)
}

/** The sign board on the diner's roof: a dark panel in a chrome frame, on two legs. */
export function signBoard(buffer: PixelBuffer, x: number, y: number, width: number, height: number, roof: number): void {
  const chrome = '#c9ccd8', chromeDark = '#8a8ea4'
  for (const lx of [x + Math.round(width * 0.2), x + Math.round(width * 0.8)]) buffer.rect(lx - 1, y + height, 3, roof - y - height, chromeDark)
  buffer.rect(x, y, width, height, chromeDark)
  buffer.rect(x + 1, y + 1, width - 2, height - 2, chrome)
  buffer.rect(x + 3, y + 3, width - 6, height - 6, '#120e22')
}

/** A hedge in front of the building: a dark green mound in bumps. */
export function hedge(buffer: PixelBuffer, x: number, ground: number, width: number, night: Night): void {
  for (let i = 0; i < width; i += 6) buffer.disc(x + i + 3, ground - 5, 5, night.leaf[0])
  for (let i = 0; i < width; i += 6) buffer.disc(x + i + 2, ground - 7, 3, night.leaf[1])
  buffer.rect(x, ground - 5, width, 5, night.leaf[0])
}
