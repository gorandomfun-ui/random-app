/**
 * RANDOM ATTACKS' screens, after the owner's picture: the title and a
 * moment of play.
 *
 * The title is the picture itself, traced onto the games' grid
 * (`scripts/games/attacks-trace.ts`, files in `public/games/attacks/`):
 * night on Mars, the moon, the striped planet, the burgers flying on their
 * jets toward the fast food of the fifties, RANDOM BURGER on its rocket
 * sign, the cook in front, the rover. Its stars twinkle and the jets
 * flicker. Over it, ATTACKS in Zen Dots, laid back like a film's title,
 * deep, its face in bands, a cream contour and an ink outline, in the
 * theme's colour; RANDOM, LEVEL, BEST and PRESS START where the other games
 * have them.
 *
 * The play stands on the same night, traced too — the sky, the far ranges,
 * the red spires, the plain — with sprites drawn by hand in its colours
 * (`attacks-sprites.ts`): the burgers in rows, the golden one across the
 * top, the stacks of plates, the cook at the bottom with his ketchup.
 */

import { attacksArt } from './attacks-art'
import { drawCook } from './attacks-cook'
import { ATTACKS_MOTION } from './attacks-art-data'
import { ATTACKS_BOARD, burgerAt, createAttacks, GOLD_Y, stepAttacks, type AttacksState } from './attacks-rules'
import { BONUS_PALETTE, BURGER_BIG, BURGER_BIG_TILT, BURGER_FAR, BURGER_FINE_TILT, BURGER_PALETTE, BURGER_SMALL_TILT, BURGER_SPECK, burgerCentre, BURGERS, COOK, COOK_HEAD, COOK_PALETTE, drawPlates, GOLD_PALETTE, KETCHUP_PALETTE, MUSTARD, MUSTARD_PALETTE, SQUIRT, THROW_PALETTE, THROWS, TORCH } from './attacks-sprites'
import { ATTACKS_LETTERING, type AttacksLettering } from './attacks-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { dim, dither, drawText, drawText7, mix, PixelBuffer, type Sprite, text7Width, textWidth } from './pixels'
import { dpadGeometry, gameOverHits, playCard, playSize, winnerRow, type Pad } from './screens'
import { arcadeText, button, dpad, GREY as GREY_TEXT, HUD_HEIGHT, infoLine, pressStart } from './ui'

export type { AttacksLettering }
type Layout = 'landscape' | 'portrait'

const CREAM = '#f8f5e6'
const INK = '#0a0a14'

// ---------------------------------------------------------------- the title

type Mask = { w: number; h: number; data: Uint8Array }
const masks = new Map<AttacksLettering, Mask>()
function maskOf(name: AttacksLettering): Mask {
  let mask = masks.get(name)
  if (mask) return mask
  const spec = ATTACKS_LETTERING[name]
  const data = new Uint8Array(spec.width * spec.height)
  spec.runs.split(' ').forEach((row, y) => {
    let x = 0, on = false
    for (const k of row.split('.')) { const n = parseInt(k, 36); if (on) data.fill(1, y * spec.width + x, y * spec.width + x + n); x += n; on = !on }
  })
  mask = { w: spec.width, h: spec.height, data }
  masks.set(name, mask)
  return mask
}

/** A mask grown by one pixel in the eight directions, `times` times. */
function grow(m: Mask, times: number): Mask {
  let cur = m.data
  for (let t = 0; t < times; t += 1) {
    const next = new Uint8Array(cur)
    for (let y = 0; y < m.h; y += 1) for (let x = 0; x < m.w; x += 1) {
      if (cur[y * m.w + x]) continue
      for (let dy = -1; dy <= 1 && !next[y * m.w + x]; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const X = x + dx, Y = y + dy
        if (X >= 0 && Y >= 0 && X < m.w && Y < m.h && cur[Y * m.w + X]) { next[y * m.w + x] = 1; break }
      }
    }
    cur = next
  }
  return { w: m.w, h: m.h, data: cur }
}

/** `top`: the top's width, a fraction of the bottom's; `stretch`: taller letters than the font's, for a narrow screen; `depth` in pixels. */
export type AttacksLogoOptions = { top?: number; depth?: number; stretch?: number }

const faceHeight = (src: Mask, width: number, stretch = 1) => Math.round(width * (src.h / src.w) * 0.95 * stretch)
const depthOf = (face: number, options: AttacksLogoOptions) => options.depth ?? Math.round(face * 0.45)

/** How tall the title stands, all in, for a width: the face, its depth, the contour and the outline. */
export function attacksLogoHeight(name: AttacksLettering, width: number, options: AttacksLogoOptions = {}): number {
  const face = faceHeight(maskOf(name), width, options.stretch)
  return face + depthOf(face, options) + 8
}

/**
 * ATTACKS laid back like a film's title: the bottom `width` wide, the top
 * narrower (`top`, a fraction), the rows nearer the top drawn closer
 * together as true perspective does. Under it its depth, converging; around
 * the face a cream contour; around everything an ink outline. The face in
 * bands from cream to the colour, a thin line where each band meets the next.
 */
export function drawAttacksLogo(buffer: PixelBuffer, cx: number, y: number, width: number, accent: string, name: AttacksLettering, options: AttacksLogoOptions = {}): void {
  // the title does not move: worked out once for a lettering, a colour and a size, then only laid down
  const key = `${name}|${accent}|${width}|${options.top ?? ''}|${options.depth ?? ''}|${options.stretch ?? ''}`
  let pixels = logos.get(key)
  if (!pixels) { pixels = logoPixels(width, accent, name, options); logos.set(key, pixels) }
  const ox = Math.round(cx), oy = Math.round(y)
  for (const [dx, dy, color] of pixels) buffer.set(ox + dx, oy + dy, color)
}

const logos = new Map<string, Array<[number, number, string]>>()

/** The title's pixels, as offsets from its top centre. */
function logoPixels(width: number, accent: string, name: AttacksLettering, options: AttacksLogoOptions): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = []
  const cx = 0, y = 0
  const src = maskOf(name)
  const r = options.top ?? 0.75
  const faceH = faceHeight(src, width, options.stretch)
  const depth = depthOf(faceH, options)
  const k = 1 / r - 1
  const bottom = y + faceH
  const horizon = bottom - faceH / (1 - r)
  const pad = 6
  const box = { x: Math.floor(cx - width / 2) - pad, y: y - pad, w: Math.ceil(width) + pad * 2, h: faceH + depth + pad * 2 }
  const at = (X: number, Y: number) => (Y - box.y) * box.w + (X - box.x)
  // the face, read through the perspective, four samples a pixel; and how far down the letters each pixel is (v)
  const face = new Uint8Array(box.w * box.h)
  const vOf = new Float32Array(box.w * box.h)
  for (let Y = y; Y < bottom; Y += 1) {
    for (let X = box.x; X < box.x + box.w; X += 1) {
      let n = 0, vs = 0
      for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) {
        const z = (bottom - horizon) / (Y + oy - horizon)
        const v = 1 - (z - 1) / k
        const u = 0.5 + ((X + ox - cx) * z) / width
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
        if (src.data[Math.floor(v * src.h) * src.w + Math.floor(u * src.w)]) { n += 1; vs += v }
      }
      if (n >= 2) { face[at(X, Y)] = 1; vOf[at(X, Y)] = vs / n }
    }
  }
  // the depth: the face pushed down a pixel at a time, drawing in toward a point below the middle
  const layer = new Uint8Array(box.w * box.h)
  for (let i = depth; i >= 1; i -= 1) {
    const pull = 1 - i * 0.0032
    for (let Y = y; Y < bottom; Y += 1) for (let X = box.x; X < box.x + box.w; X += 1) {
      if (!face[at(X, Y)]) continue
      const DX = Math.round(cx + (X - cx) * pull), DY = Y + i
      if (DX < box.x || DX >= box.x + box.w || DY >= box.y + box.h) continue
      layer[at(DX, DY)] = i
    }
  }
  const faceMask: Mask = { w: box.w, h: box.h, data: face }
  const contour = grow(faceMask, 2)
  const all = new Uint8Array(box.w * box.h)
  for (let i = 0; i < all.length; i += 1) all[i] = contour.data[i] || layer[i] ? 1 : 0
  const outline = grow({ w: box.w, h: box.h, data: all }, 2)
  // the depth's tones: lit near the face, dark at the back; the face's bands
  const near = mix(dim(accent, 0.62), INK, 0.1), mid = dim(accent, 0.45), far = mix(dim(accent, 0.28), INK, 0.3)
  const bands: Array<[number, string]> = [[0, CREAM], [0.17, mix(accent, CREAM, 0.72)], [0.35, mix(accent, CREAM, 0.45)], [0.53, accent], [0.8, dim(accent, 0.8)]]
  const line = (i: number) => (i <= 2 ? mix(accent, CREAM, 0.25) : dim(accent, 0.62))
  const bandOf = (v: number) => { let b = 0; for (let i = 0; i < bands.length; i += 1) if (v >= bands[i][0]) b = i; return b }
  for (let Y = box.y; Y < box.y + box.h; Y += 1) for (let X = box.x; X < box.x + box.w; X += 1) {
    const i = at(X, Y)
    if (!outline.data[i]) continue
    let color = INK
    if (face[i]) {
      const b = bandOf(vOf[i])
      const above = Y > y && face[i - box.w] ? bandOf(vOf[i - box.w]) : b
      color = above !== b ? line(b) : bands[b][1]
    } else if (contour.data[i]) color = CREAM
    else if (layer[i]) {
      const t = layer[i] / depth
      color = t < 0.4 ? (dither(X, Y, t / 0.4) ? mid : near) : dither(X, Y, (t - 0.4) / 0.6) ? far : mid
    }
    out.push([X, Y, color])
  }
  return out
}

// ---------------------------------------------------------------- the title

/** Where RANDOM and ATTACKS stand on each picture: where the reference had its own title. */
const MARKS: Record<Layout, { randomY: number; markY: number; markWidth: number; stretch: number; press: number; info: 'top' | 'bottom' }> = {
  landscape: { randomY: 16, markY: 62, markWidth: 540, stretch: 1.15, press: 412, info: 'top' },
  portrait: { randomY: 196, markY: 244, markWidth: 412, stretch: 1.5, press: 724, info: 'bottom' },
}

/**
 * A burger of the owner's picture by its width there (ring included, or
 * only its bright parts for the far ones): the game's own of about that
 * size, diving like them for the near ones, and how big to draw it.
 */
function flyerSprite(width: number): { frames: readonly Sprite[]; near: boolean } {
  if (width >= 56) return { frames: BURGER_FINE_TILT, near: true }
  if (width >= 30) return { frames: BURGER_BIG_TILT, near: false }
  if (width >= 14) return { frames: BURGER_SMALL_TILT, near: false }
  if (width >= 5) return { frames: BURGER_FAR, near: false }
  return { frames: BURGER_SPECK, near: false }
}
/** The picture's burgers, the ones closer than 9 pixels to a bigger one left out (bits of the same burger). */
const flyersOf = (layout: Layout) => {
  const all = ATTACKS_MOTION.flyers[layout === 'landscape' ? 'wide' : 'tall']
  return all.filter(([x, y, w]) => !all.some(([x2, y2, w2]) => w2 > w && Math.hypot(x2 - x, y2 - y) < 9))
}

/** The stretch of ground the rover drives to and fro. */
const ROVER_PATH: Record<Layout, { from: number; to: number; y: number }> = { landscape: { from: 40, to: 232, y: 346 }, portrait: { from: 2, to: 122, y: 642 } }

/** A picture with clear pixels laid over the screen, mirrored if asked. */
function overlay(buffer: PixelBuffer, art: PixelBuffer, x: number, y: number, flip: boolean): void {
  for (let yy = 0; yy < art.height; yy += 1) for (let xx = 0; xx < art.width; xx += 1) {
    const o = (yy * art.width + xx) * 4
    if (art.data[o + 3] < 128) continue
    const X = x + (flip ? art.width - 1 - xx : xx), Y = y + yy
    if (X < 0 || Y < 0 || X >= buffer.width || Y >= buffer.height) continue
    const t = (Y * buffer.width + X) * 4
    buffer.data[t] = art.data[o]; buffer.data[t + 1] = art.data[o + 1]; buffer.data[t + 2] = art.data[o + 2]
  }
}

export type AttacksTitleOptions = { level?: number; best?: number; frame?: number; blink?: boolean; press?: boolean }

/**
 * RANDOM ATTACKS' title, wide (768 × 432) or tall (432 × 768): the traced
 * night, its stars twinkling; the game's burgers diving where the picture's
 * flew, bobbing on their jets; the rover driving to and fro; the game's cook,
 * drawn as fine as the landscape, blinking now and then; over it RANDOM, ATTACKS in the
 * theme's colour, LEVEL, BEST and PRESS START, where the other games have
 * them.
 */
export function renderAttacksTitle(layout: Layout, accent: string, lettering: AttacksLettering = 'zen', options: AttacksTitleOptions = {}): PixelBuffer {
  const wide = layout === 'landscape'
  const W = wide ? 768 : 432, H = wide ? 432 : 768
  const m = MARKS[layout]
  const frame = options.frame ?? 0
  const buffer = new PixelBuffer(W, H, '#0f0a22')
  const art = attacksArt(wide ? 'titleWide' : 'titleTall')
  if (art) {
    buffer.data.set(art.data)
    ATTACKS_MOTION[wide ? 'wide' : 'tall'].stars.forEach(([x, y], i) => { if ((i + frame) % 5 === 0) buffer.set(x, y, mix(buffer.hex(x, y), '#1c1036', 0.7)) })
  } else {
    // the picture on its way: the night alone
    for (let y = 0; y < H; y += 1) buffer.rect(0, y, W, 1, mix('#0a0718', '#45224f', y / H))
  }
  // the stream as in the picture, far ones first: the near ones dive, rise and fall on their jets
  flyersOf(layout).forEach(([cx, cy, width], i) => {
    const { frames, near } = flyerSprite(width)
    const sprite = frames[(frame + i) % 2]
    const w = sprite[0].length, h = sprite.length
    const bob = near ? Math.round(Math.sin((frame + i * 1.7) * 0.9) * 2) : width >= 14 && (frame + i) % 4 >= 2 ? 1 : 0
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2) + bob
    buffer.blit(sprite, x, y, BURGER_PALETTE)
  })
  // the rover, to and fro, a jolt now and then
  const rover = attacksArt('rover'), path = ROVER_PATH[layout]
  if (rover) {
    const span = path.to - path.from, t = (frame * 3) % (span * 2), ahead = t < span
    overlay(buffer, rover, path.from + (ahead ? t : span * 2 - t), path.y - (frame % 4 === 1 ? 1 : 0), !ahead)
  }
  // the game's cook, built at the landscape's fineness, where the picture's stood
  drawCook(buffer, wide ? 587 : 301, wide ? 231 : 531, frame)
  const rx = Math.round(W / 2 - LOGO_WIDTH)
  drawLogo(buffer, rx + 3, m.randomY + 4, INK, 2)
  drawLogo(buffer, rx, m.randomY, mix(accent, CREAM, 0.25), 2)
  drawAttacksLogo(buffer, W / 2, m.markY, m.markWidth, accent, lettering, { stretch: m.stretch })
  if (options.press !== false) pressStart(buffer, W / 2, m.press, accent, options.blink !== false, 2)
  const level = String(options.level ?? 1), best = String(options.best ?? 0).padStart(5, '0')
  if (m.info === 'top') {
    infoLine(buffer, 16, 16, 'LEVEL', level, 'left', 2)
    infoLine(buffer, W - 16, 16, 'BEST', best, 'right', 2)
  } else {
    infoLine(buffer, W / 2 - 14, m.press + 24, 'LEVEL', level, 'right', 2)
    infoLine(buffer, W / 2 + 14, m.press + 24, 'BEST', best, 'left', 2)
  }
  return buffer
}

// ---------------------------------------------------------------- the play

/** The bar on top: LEVEL, SCORE, the bonus under way with what is left of it, and the lives as the cook's head. */
function attacksHud(buffer: PixelBuffer, accent: string, level: number, score: number, lives: number, power: AttacksState['power'] = null): void {
  const W = buffer.width
  buffer.rect(0, 0, W, HUD_HEIGHT, '#07070e')
  buffer.rect(0, HUD_HEIGHT - 1, W, 1, dim(accent, 0.55))
  drawText(buffer, 'LEVEL', 8, 3, GREY_TEXT)
  drawText7(buffer, String(level).padStart(2, '0'), 8, 11, CREAM, 1, true)
  const scoreText = String(score).padStart(5, '0')
  drawText(buffer, 'SCORE', Math.round(W / 2 - textWidth('SCORE') / 2), 3, GREY_TEXT)
  drawText7(buffer, scoreText, Math.round(W / 2 - text7Width(scoreText, 1, true) / 2), 11, CREAM, 1, true)
  drawText(buffer, 'LIVES', W - 8 - textWidth('LIVES'), 3, GREY_TEXT)
  for (let i = 0; i < lives; i += 1) buffer.blit(COOK_HEAD, W - 17 - i * 11, 12, COOK_PALETTE)
  if (power) {
    // the bonus's bottle and the time it has left, between the score and the lives
    const x = Math.round(W * 0.66)
    buffer.blit(power.kind === 'mustard' ? MUSTARD : TORCH, x, power.kind === 'mustard' ? 6 : 5, BONUS_PALETTE)
    const full = power.kind === 'mustard' ? 9 * 60 : 5 * 60, w = 30
    buffer.rect(x + 13, 15, w, 3, '#2a2a3a')
    buffer.rect(x + 13, 15, Math.max(1, Math.round((w * power.left) / full)), 3, power.kind === 'mustard' ? '#ffd02a' : '#8cc4ff')
  }
}

/** The night under the bar, the cross in its band: drawn once for a board, a pad and a colour. */
const backs = new Map<string, PixelBuffer>()
function back(layout: Layout, pad: Pad, accent: string): PixelBuffer {
  const key = `${layout}|${pad}|${accent}`
  const art = attacksArt(layout === 'landscape' ? 'playWide' : 'playTall')
  let out = backs.get(key)
  if (out && art) return out
  const { width, height } = playSize(layout, pad)
  out = new PixelBuffer(width, height, INK)
  const board = ATTACKS_BOARD[layout]
  if (art) for (let y = 0; y < art.height; y += 1) out.data.set(art.data.subarray(y * art.width * 4, (y + 1) * art.width * 4), ((HUD_HEIGHT + y) * width) * 4)
  else for (let y = HUD_HEIGHT; y < HUD_HEIGHT + board.height; y += 1) out.rect(0, y, board.width, 1, mix('#0a0718', '#45224f', (y - HUD_HEIGHT) / board.height))
  const cross = dpadGeometry(layout, pad)
  if (cross) dpad(out, cross.cx, cross.cy, cross.arm, accent)
  // kept once the picture is in
  if (art) { if (backs.size > 12) backs.clear(); backs.set(key, out) }
  return out
}
const surfaces = new Map<string, PixelBuffer>()

/** What the play screen shows over the game: the pause card (RESUME 0, QUIT 1), or RESUME alone; where the cross goes. */
export type AttacksView = { pause?: 0 | 1 | null; pad?: Pad; resumeOnly?: boolean }

/** The blowtorch's flame, going up: white at the heart, yellow, orange at the tips, flickering. */
function flame(buffer: PixelBuffer, x: number, y: number, steps: number): void {
  for (let k = 0; k < 14; k += 1) {
    const w = k < 3 ? 1 : k < 9 ? 2 : 1, jitter = ((steps + k) % 3) - 1
    const c = k < 4 ? '#ffffff' : k < 8 ? '#fff0a0' : k < 11 ? '#ffb040' : '#ff6a2a'
    buffer.rect(x - w + (k > 8 ? jitter : 0), y + k, w * 2 + 1, 1, c)
  }
}

/**
 * RANDOM ATTACKS in play, wide (448 × 344) or tall (320 × 472), with the
 * cross where it goes: the traced night; the burgers in their formation,
 * their jets flickering at each step it takes; the golden one across the
 * top; the plates, bitten where they were hit; what the burgers throw; the
 * squirts going up — ketchup, mustard, or the blowtorch's flame; a bonus
 * falling; the cook, blinking while he gets over a hit; what was just hit
 * splashing; the bar; LEVEL UP, LEVEL CLEAR, the pause card.
 */
export function renderAttacksGame(s: AttacksState, accent: string, view: AttacksView = {}): PixelBuffer {
  const layout = s.layout
  const pad = view.pad ?? (layout === 'portrait' ? 'band' : 'none')
  const { width } = playSize(layout, pad)
  const key = `${layout}|${pad}`
  let buffer = surfaces.get(key)
  if (!buffer) { const size = playSize(layout, pad); buffer = new PixelBuffer(size.width, size.height, INK); surfaces.set(key, buffer) }
  buffer.data.set(back(layout, pad, accent).data)
  const top = HUD_HEIGHT, board = ATTACKS_BOARD[layout]
  ATTACKS_MOTION[layout === 'landscape' ? 'playWide' : 'playTall'].stars.forEach(([x, y], i) => { if ((i + (s.steps >> 4)) % 5 === 0) buffer!.set(x, y + top, mix(buffer!.hex(x, y + top), '#1c1036', 0.7)) })
  // the formation
  for (const b of s.burgers) {
    if (!b.alive) continue
    const sprite = BURGERS[b.row][s.formation.frame]
    const c = burgerAt(s, b)
    buffer.blit(sprite, Math.round(c.x - burgerCentre(sprite)), top + s.formation.y + b.row * board.gapY, BURGER_PALETTE)
  }
  // the golden one
  if (s.gold) { const gold = BURGER_BIG[(s.steps >> 3) % 2]; buffer.blit(gold, Math.round(s.gold.x - burgerCentre(gold)), top + GOLD_Y - 13, GOLD_PALETTE) }
  // the plates
  s.plates.forEach((p, i) => drawPlates(buffer!, p.x, top + s.height - 42, board.plate, 5, p.bites, i))
  // what they throw
  for (const t of s.throws) { const sprite = THROWS[t.kind]; buffer.blit(sprite, Math.round(t.x - sprite[0].length / 2), Math.round(top + t.y - sprite.length / 2), THROW_PALETTE) }
  // the squirts
  const mustard = s.power?.kind === 'mustard'
  for (const shot of s.shots) {
    if (shot.torch) flame(buffer, Math.round(shot.x), Math.round(top + shot.y), s.steps)
    else buffer.blit(SQUIRT, Math.round(shot.x) - 1, Math.round(top + shot.y), mustard ? MUSTARD_PALETTE : KETCHUP_PALETTE)
  }
  // a bonus falling, sparkling
  if (s.drop) {
    const sprite = s.drop.kind === 'mustard' ? MUSTARD : TORCH
    const bx = Math.round(s.drop.x), by = Math.round(top + s.drop.y)
    buffer.blit(sprite, bx - Math.floor(sprite[0].length / 2), by - Math.floor(sprite.length / 2), BONUS_PALETTE)
    for (const [dx, dy] of [[-8, -6], [8, -2], [-6, 8]] as const) if (((s.steps >> 3) + dx) % 2 === 0) { buffer.set(bx + dx, by + dy, '#ffffff'); for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) buffer.set(bx + dx + ex, by + dy + ey, '#fff4b0') }
  }
  // the cook, blinking while he gets over a hit
  if (s.cook.hurt === 0 || (s.cook.hurt >> 2) % 2 === 0) buffer.blit(COOK, Math.round(s.cook.x - COOK[0].length / 2), top + s.height - 3 - COOK.length, COOK_PALETTE)
  // what was just hit
  for (const p of s.splats) {
    const x = Math.round(p.x), y = Math.round(top + p.y)
    if (p.kind === 'burger') {
      const r = p.t / 16
      for (const [dx, dy, size, c] of [[0, 0, 5, '#e0301e'], [-7, -3, 2, '#e28c42'], [8, 2, 2, '#e28c42'], [4, -5, 1.5, '#ffd030'], [-5, 4, 1.5, '#e0301e'], [9, -4, 1, '#54c448']] as const) buffer.disc(x + dx * (1.6 - r * 0.6), y + dy * (1.6 - r * 0.6), size * (0.4 + r * 0.6), c)
    } else if (p.kind === 'gold') {
      for (let k = 0; k < 8; k += 1) { const a = (k / 8) * Math.PI * 2, d = 6 + (30 - p.t) * 0.8; buffer.set(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.6), k % 2 ? '#fff6c0' : '#ffd23f') }
    } else for (const [dx, dy] of [[-2, 0], [2, 1], [0, 3]] as const) buffer.set(x + dx, y + dy + (18 - p.t) / 3, '#ffffff')
  }
  attacksHud(buffer, accent, s.level, s.score, s.lives, s.power)
  if (s.phase === 'won' && s.single) playCard(buffer, layout, accent, 'LEVEL CLEAR', [])
  else if (view.pause != null) playCard(buffer, layout, accent, 'PAUSED', view.resumeOnly ? ['RESUME'] : ['RESUME', 'QUIT'], view.resumeOnly ? 0 : view.pause)
  else if (s.levelUp > 0 && Math.floor(s.levelUp / 10) % 2 === 0) arcadeText(buffer, 'LEVEL UP', width / 2, HUD_HEIGHT + 30, 3, accent)
  return buffer
}

export type AttacksPlayOptions = { frame?: number }

/** A moment of play for the mock page: a game at level 3 played on its own, a little further at each picture. */
const demos = new Map<Layout, { state: AttacksState; frame: number }>()
export function renderAttacksPlay(layout: Layout, accent: string, options: AttacksPlayOptions = {}): PixelBuffer {
  const frame = options.frame ?? 0
  let demo = demos.get(layout)
  if (!demo || frame < demo.frame || demo.state.phase !== 'play') { demo = { state: createAttacks(layout, 3, 11 + frame), frame: 0 }; demos.set(layout, demo) }
  // the cook sways toward the burgers; a picture is about half a second of play
  while (demo.frame < frame) {
    for (let k = 0; k < 27 && demo.state.phase === 'play'; k += 1) {
      const s = demo.state, near = s.burgers.filter((b) => b.alive).map((b) => burgerAt(s, b).x - 11).sort((a, b) => Math.abs(a - s.cook.x) - Math.abs(b - s.cook.x))[0] ?? s.cook.x
      stepAttacks(s, Math.abs(near - s.cook.x) < 2 ? 0 : near > s.cook.x ? 1 : -1)
    }
    demo.frame += 1
  }
  return renderAttacksGame(demo.state, accent, { pad: layout === 'portrait' ? 'band' : 'none' })
}

// ---------------------------------------------------------------- GAME OVER and WINNER

/** The night of the title behind the end screens, without its cook, a shade darker if asked. */
function endNight(layout: Layout, frame: number, shade: number): PixelBuffer {
  const wide = layout === 'landscape'
  const W = wide ? 768 : 432, H = wide ? 432 : 768
  const buffer = new PixelBuffer(W, H, '#0f0a22')
  const art = attacksArt(wide ? 'titleWide' : 'titleTall')
  if (art) buffer.data.set(art.data)
  else for (let y = 0; y < H; y += 1) buffer.rect(0, y, W, 1, mix('#0a0718', '#45224f', y / H))
  ATTACKS_MOTION[wide ? 'wide' : 'tall'].stars.forEach(([x, y], i) => { if ((i + frame) % 5 === 0) buffer.set(x, y, mix(buffer.hex(x, y), '#1c1036', 0.7)) })
  if (shade < 1) buffer.shade(0, 0, W, H, shade)
  return buffer
}

/** `choice`: the answer lit, YES (0) or NO (1); `ask` false leaves PLAY AGAIN? and its answers out. */
export type AttacksEndOptions = { score?: number; best?: number; frame?: number; blink?: boolean; choice?: 0 | 1; ask?: boolean }

/**
 * GAME OVER: the night of Mars a shade darker, GAME OVER in ATTACKS' own
 * letters — one line wide, two tall — the score and the best, PLAY AGAIN?
 * and its two answers where EATER has them (so a tap finds them the same).
 */
export function renderAttacksOver(layout: Layout, accent: string, options: AttacksEndOptions = {}): PixelBuffer {
  const buffer = endNight(layout, options.frame ?? 0, 0.5)
  const W = buffer.width, c = W / 2
  if (layout === 'landscape') drawAttacksLogo(buffer, c, 36, 600, accent, 'gameOver', { stretch: 1.1 })
  else {
    drawAttacksLogo(buffer, c, 66, 340, accent, 'game', { stretch: 1.05 })
    drawAttacksLogo(buffer, c, 66 + attacksLogoHeight('game', 340, { stretch: 1.05 }) + 6, 340, accent, 'over', { stretch: 1.05 })
  }
  const at = layout === 'landscape' ? { score: 160, best: 160, question: 200, buttons: 250 } : { score: 356, best: 384, question: 428, buttons: 474 }
  const score = String(options.score ?? 0).padStart(5, '0'), best = String(options.best ?? 0).padStart(5, '0')
  if (layout === 'landscape') {
    infoLine(buffer, c - 20, at.score, 'SCORE', score, 'right', 2)
    infoLine(buffer, c + 20, at.best, 'BEST', best, 'left', 2)
  } else {
    infoLine(buffer, c, at.score, 'SCORE', score, 'centre', 2)
    infoLine(buffer, c, at.best, 'BEST', best, 'centre', 2)
  }
  if (options.ask === false) return buffer
  arcadeText(buffer, 'PLAY AGAIN?', c, at.question, layout === 'landscape' ? 4 : 3, accent)
  const chosen = options.blink !== false, choice = options.choice ?? 0
  button(buffer, 'YES', c - 64, at.buttons, accent, chosen && choice === 0, 2)
  button(buffer, 'NO', c + 64, at.buttons, accent, chosen && choice === 1, 2)
  return buffer
}
/** GAME OVER's answers: where EATER's are. */
export const attacksOverHits = (layout: Layout) => gameOverHits('eater', layout)

/**
 * WINNER, the sixteenth level cleared: the title's night with the sky
 * cleared of burgers, the cook there with his ketchup up, WINNER where
 * ATTACKS was, in the same letters; the score and the best in the top
 * corners, PLAY AGAIN? with its two answers along the foot.
 */
export function renderAttacksWinner(layout: Layout, accent: string, options: AttacksEndOptions = {}): PixelBuffer {
  const wide = layout === 'landscape'
  const frame = options.frame ?? 0
  const buffer = endNight(layout, frame, 1)
  const W = buffer.width, H = buffer.height, m = MARKS[layout]
  drawCook(buffer, wide ? 587 : 301, wide ? 231 : 531, frame)
  drawAttacksLogo(buffer, W / 2, m.markY + (wide ? 6 : 10), wide ? 520 : 400, accent, 'winner', { stretch: m.stretch })
  infoLine(buffer, 16, 16, 'SCORE', String(options.score ?? 0).padStart(5, '0'), 'left', 2)
  infoLine(buffer, W - 16, 16, 'BEST', String(options.best ?? 0).padStart(5, '0'), 'right', 2)
  if (options.ask === false) return buffer
  const row = winnerRow(layout)
  const chosen = options.blink !== false, choice = options.choice ?? 0
  buffer.shade(0, row.y - 5, W, H - row.y + 5, 0.45)
  drawText7(buffer, 'PLAY AGAIN?', row.text + 2, row.textY + 2, INK, 2)
  drawText7(buffer, 'PLAY AGAIN?', row.text, row.textY, CREAM, 2)
  button(buffer, 'YES', row.yes, row.y, accent, chosen && choice === 0, 2)
  button(buffer, 'NO', row.no, row.y, accent, chosen && choice === 1, 2)
  return buffer
}
