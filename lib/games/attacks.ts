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
import { ATTACKS_MOTION } from './attacks-art-data'
import { type Bite, BONUS_PALETTE, BURGER_BIG, BURGER_BIG_TILT, BURGER_FAR, BURGER_FINE_TILT, BURGER_PALETTE, BURGER_SMALL_TILT, BURGER_SPECK, burgerCentre, BURGERS, COOK, COOK_FINE, COOK_FINE_PALETTE, COOK_HEAD, COOK_PALETTE, drawPlates, GOLD_PALETTE, KETCHUP_PALETTE, MUSTARD, platesHeight, SQUIRT, THROW_PALETTE, THROWS } from './attacks-sprites'
import { ATTACKS_LETTERING, type AttacksLettering } from './attacks-lettering-data'
import { drawLogo, LOGO_WIDTH } from './logo'
import { dim, dither, drawText, drawText7, mix, PixelBuffer, type Sprite, text7Width, textWidth } from './pixels'
import { GREY as GREY_TEXT, HUD_HEIGHT, infoLine, pressStart } from './ui'

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
function flyerSprite(width: number): { frames: readonly Sprite[]; near: boolean; trail: number } {
  if (width >= 56) return { frames: BURGER_FINE_TILT, near: true, trail: 46 }
  if (width >= 30) return { frames: BURGER_BIG_TILT, near: false, trail: 26 }
  if (width >= 14) return { frames: BURGER_SMALL_TILT, near: false, trail: 14 }
  if (width >= 5) return { frames: BURGER_FAR, near: false, trail: 6 }
  return { frames: BURGER_SPECK, near: false, trail: 0 }
}
/** The picture's burgers, the ones closer than 9 pixels to a bigger one left out (bits of the same burger). */
const flyersOf = (layout: Layout) => {
  const all = ATTACKS_MOTION.flyers[layout === 'landscape' ? 'wide' : 'tall']
  return all.filter(([x, y, w]) => !all.some(([x2, y2, w2]) => w2 > w && Math.hypot(x2 - x, y2 - y) < 9))
}
/** A streak of speed behind a burger, up and to the right whence it came: hot near the burger, cooling, breaking up. */
function trail(buffer: PixelBuffer, x: number, y: number, length: number, frame: number): void {
  const len = Math.round(length * (0.85 + 0.15 * Math.sin(frame * 1.3 + x)))
  for (let i = 0; i < len; i += 1) {
    const t = i / Math.max(1, len), X = Math.round(x + i * 0.95), Y = Math.round(y - i * 0.31)
    if (t > 0.6 && (i + frame) % 2 === 0) continue
    buffer.set(X, Y, t < 0.25 ? '#ffd27a' : t < 0.6 ? '#ff7a2a' : '#c8402a')
  }
}

/** Where the cook stands (his top left), and the stretch of ground the rover drives to and fro. */
const COOK_AT: Record<Layout, readonly [number, number]> = { landscape: [589, 256], portrait: [303, 556] }
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
 * flew, bobbing on their jets, trailing speed; the rover driving to and fro; the game's cook,
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
  // the stream as in the picture, far ones first: the near ones dive, rise and fall on their jets, trailing speed
  flyersOf(layout).forEach(([cx, cy, width], i) => {
    const { frames, near, trail: length } = flyerSprite(width)
    const sprite = frames[(frame + i) % 2]
    const w = sprite[0].length, h = sprite.length
    const bob = near ? Math.round(Math.sin((frame + i * 1.7) * 0.9) * 2) : width >= 14 && (frame + i) % 4 >= 2 ? 1 : 0
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2) + bob
    if (length) trail(buffer, x + Math.round(w * 0.86), y + Math.round(h * 0.34), length, frame + i)
    buffer.blit(sprite, x, y, BURGER_PALETTE)
  })
  // the rover, to and fro, a jolt now and then
  const rover = attacksArt('rover'), path = ROVER_PATH[layout]
  if (rover) {
    const span = path.to - path.from, t = (frame * 3) % (span * 2), ahead = t < span
    overlay(buffer, rover, path.from + (ahead ? t : span * 2 - t), path.y - (frame % 4 === 1 ? 1 : 0), !ahead)
  }
  // the cook, blinking
  const [cookX, cookY] = COOK_AT[layout]
  buffer.blit(COOK_FINE[frame % 9 === 8 ? 1 : 0], cookX, cookY, COOK_FINE_PALETTE)
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

/** The bar on top: LEVEL, SCORE, and the lives as the cook's head. */
function attacksHud(buffer: PixelBuffer, accent: string, level: number, score: number, lives: number): void {
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
}

/** Where things stand on each screen: the formation, the plates, the cook. */
const PLAY: Record<Layout, { w: number; h: number; cols: number; gapX: number; gapY: number; formation: number; stacks: number[]; plate: number }> = {
  landscape: { w: 448, h: 344, cols: 9, gapX: 44, gapY: 28, formation: 40, stacks: [86, 178, 270, 362], plate: 34 },
  portrait: { w: 320, h: 472, cols: 6, gapX: 48, gapY: 32, formation: 64, stacks: [50, 123, 197, 270], plate: 30 },
}

export type AttacksPlayOptions = { frame?: number }

/**
 * A moment of play, wide (448 × 344) or tall (320 × 472), on the night
 * traced from the owner's picture: the burgers in their formation — sliders
 * on top, cheeseburgers, doubles — one just hit, the golden one crossing
 * the top; what they throw; the stacks of plates, bitten; the cook at the
 * bottom with his ketchup going up; the mustard falling as a bonus.
 */
export function renderAttacksPlay(layout: Layout, accent: string, options: AttacksPlayOptions = {}): PixelBuffer {
  const frame = options.frame ?? 0
  const p = PLAY[layout]
  const { w: W, h: H } = p
  const top = HUD_HEIGHT
  const buffer = new PixelBuffer(W, H, '#0f0a22')
  const art = attacksArt(layout === 'landscape' ? 'playWide' : 'playTall')
  if (art) {
    buffer.data.set(art.data, top * W * 4)
    ATTACKS_MOTION[layout === 'landscape' ? 'playWide' : 'playTall'].stars.forEach(([x, y], i) => { if ((i + frame) % 5 === 0) buffer.set(x, y + top, mix(buffer.hex(x, y + top), '#1c1036', 0.7)) })
  } else for (let y = top; y < H; y += 1) buffer.rect(0, y, W, 1, mix('#0a0718', '#45224f', (y - top) / (H - top)))
  const ground = H - 46
  // the formation, marching; one just hit, two gone from the front row
  const x0 = Math.round(W / 2 - ((p.cols - 1) * p.gapX) / 2) + ((frame % 4) - 1.5) * 3, y0 = top + p.formation
  BURGERS.forEach((frames, row) => {
    const sprite = frames[frame % 2]
    for (let col = 0; col < p.cols; col += 1) {
      if (row === 4 && (col === 1 || col === p.cols - 2)) continue
      const x = x0 + col * p.gapX, y = y0 + row * p.gapY
      if (row === 3 && col === Math.floor(p.cols / 2)) {
        for (const [dx, dy, r, c] of [[0, 6, 5, '#e0301e'], [-7, 3, 2, '#e28c42'], [8, 8, 2, '#e28c42'], [4, 1, 1.5, '#ffd030'], [-5, 10, 1.5, '#e0301e'], [9, 2, 1, '#54c448']] as const) buffer.disc(x + dx, y + dy, r, c)
        continue
      }
      buffer.blit(sprite, Math.round(x - burgerCentre(sprite)), y, BURGER_PALETTE)
    }
  })
  // the golden one across the top
  const gold = BURGER_BIG[frame % 2]
  const gx = ((frame * 18 + Math.round(W * 0.62)) % (W + 60)) - 30
  buffer.blit(gold, Math.round(gx - burgerCentre(gold)), top + 4, GOLD_PALETTE)
  // the plates, standing on the plain, bitten; a shard falling from the freshest bite
  const plateTop = ground + 4 - platesHeight(5) + 1
  const bites: Bite[][] = [[], [[3, 4, 4], [p.plate - 2, 18, 3]], [[p.plate - 5, 3, 4], [12, 1, 3], [16, 26, 3]], [[1, 14, 3]]]
  p.stacks.forEach((sx, i) => drawPlates(buffer, sx, ground + 4, p.plate, 5, bites[i], i))
  const shard = p.stacks[2] - p.plate / 2 + 14, sy = plateTop + 32 + (frame % 3) * 2
  buffer.set(shard, sy, '#ffffff'); buffer.set(shard + 1, sy, '#d8d2dc'); buffer.set(shard - 3, sy + 4, '#e8e4ec')
  // what the burgers throw
  const throws: Array<[number, number, number]> = layout === 'landscape'
    ? [[x0 + p.gapX * 2, y0 + 150, 0], [x0 + p.gapX * 6, y0 + 172, 1], [x0 + p.gapX * 4, y0 + 196, 2], [x0 + p.gapX * 8, y0 + 140, 3]]
    : [[x0 + p.gapX, y0 + 200, 1], [x0 + p.gapX * 4, y0 + 250, 0], [x0 + p.gapX * 5, y0 + 180, 3], [x0 + p.gapX * 2, y0 + 290, 2]]
  for (const [tx, ty, kind] of throws) buffer.blit(THROWS[kind], Math.round(tx - THROWS[kind][0].length / 2), ty + (frame % 2) * 3, THROW_PALETTE)
  // the cook, his ketchup going up
  const cookX = Math.round(W / 2 - 6)
  const cookY = H - 3 - COOK.length
  buffer.blit(COOK, cookX - COOK[0].length / 2, cookY, COOK_PALETTE)
  const nozzle = cookX - COOK[0].length / 2 + 26
  for (const up of [34, 96]) buffer.blit(SQUIRT, nozzle - 1, cookY - up - ((frame % 2) * 4), KETCHUP_PALETTE)
  // a bonus falling: the mustard, sparkling
  const bx = Math.round(W * 0.74), by = ground - 64 + (frame % 4) * 3
  buffer.blit(MUSTARD, bx - 3, by - 6, BONUS_PALETTE)
  for (const [sx2, sy2] of [[-6, -6], [8, -2], [-5, 9]] as const) if ((frame + sx2) % 2 === 0) { buffer.set(bx + sx2, by + sy2, '#ffffff'); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) buffer.set(bx + sx2 + dx, by + sy2 + dy, '#fff4b0') }
  attacksHud(buffer, accent, 3, 1250, 3)
  return buffer
}
