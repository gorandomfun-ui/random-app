/**
 * The promo loops: short films that speak of Random itself, built from the
 * site's own things — the wordmark, the brand block, the icons — and from
 * stock pictures under a permissive licence, never from a creator's work.
 * A run of scenes cut by breaks, drawn by a seed: the seven animations of
 * the composer on those things; the wordmark or the brand block enormous,
 * overflowing; the icons swarming, enlarged, glitched; ectoplasms over the
 * logo; a camera's interface; a codec's blocks; a video game's pixels; a
 * GIF's stutter and dither. The curator's own words on top, with the
 * composer's tools. Theme colours only: no gradient, no blur, no RGB.
 * Every number comes from a hash, so a seed gives the same film twice.
 */

import { burstSchedule, createDrawer, GLITCH_STYLES, type GlitchStyle } from './montageDraw'
import { recorderChoice } from './montage'

const CREAM = '#F8F5E6', DEEP = '#121210'
const SITE = 'gorandom.fun'

const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }
function mix(a: string, b: string, t: number): string {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

export type PromoText = { value: string; size: number; align: 'left' | 'center' | 'right'; font: string; weight: number; x: number; y: number; width: number }
export type PromoIcon = { image: HTMLImageElement; x: number; y: number; size: number }
export type PromoInput = {
  seconds: number
  intensity: number
  seed: number
  accent: string
  /** The wordmark across, and the letters stacked, cream; and the same in deep, for the accent grounds. */
  logo: HTMLImageElement
  logoVertical: HTMLImageElement
  logoDark: HTMLImageElement
  logoVerticalDark: HTMLImageElement
  /** The site's icons, cream. */
  icons: HTMLImageElement[]
  /** Stock pictures under a permissive licence, already loadable by a canvas. */
  stock: HTMLImageElement[]
  titleFont: string
  /** The curator's words and icon, as in the composer; sizes in 1080-wide units. */
  text?: PromoText | null
  icon?: PromoIcon | null
}

type Kind = 'anim' | 'huge' | 'icons' | 'ecto' | 'cam' | 'codec' | 'game' | 'gif'
type Source = 'brand' | 'stock' | 'icons'
type Transition = 'cut' | 'black' | 'flash' | 'slices' | 'blocks'
export type Cut = { from: number; to: number; kind: Kind; seed: number; transition: Transition; style: GlitchStyle; source: Source; pick: number }

const KINDS: Array<[Kind, number]> = [['anim', 3], ['huge', 2], ['icons', 2], ['ecto', 1], ['cam', 1], ['codec', 1.5], ['game', 1], ['gif', 1]]

/** The run of cuts: shorter and wilder as the force rises, never the same kind twice in a row, the brand first. */
export function planPromo(seconds: number, intensity: number, seed: number, stock: number): Cut[] {
  const out: Cut[] = []
  const total = seconds * 1000
  let at = 0, i = 0, last: Kind | null = null
  const weight = KINDS.reduce((a, [, w]) => a + w, 0)
  while (at < total) {
    let kind: Kind = 'huge'
    if (i > 0) {
      for (let tries = 0; tries < 6; tries += 1) {
        let q = hash(seed, i, tries, 1) * weight
        for (const [k, w] of KINDS) { q -= w; if (q <= 0) { kind = k; break } }
        if (kind !== last) break
      }
    }
    const quick = hash(seed, i, 2) < intensity * 0.6
    const length = Math.round((quick ? 280 + hash(seed, i, 3) * 420 : 600 + hash(seed, i, 3) * 900) * (1.3 - intensity * 0.5))
    const qs = hash(seed, i, 4)
    const source: Source = kind === 'icons' ? 'icons' : stock && qs < (kind === 'anim' ? 0.4 : 0.6) ? 'stock' : kind === 'anim' && qs > 0.8 ? 'icons' : 'brand'
    const qt = hash(seed, i, 5)
    const transition: Transition = i === 0 ? 'cut' : qt < 0.3 ? 'cut' : qt < 0.45 ? 'black' : qt < 0.6 ? 'flash' : qt < 0.85 ? 'slices' : 'blocks'
    out.push({ from: at, to: Math.min(total, at + length), kind, seed: seed * 7 + i * 131, transition, style: GLITCH_STYLES[Math.floor(hash(seed, i, 6) * GLITCH_STYLES.length)].key, source, pick: Math.floor(hash(seed, i, 7) * 1000) })
    at += length; i += 1; last = kind
  }
  return out
}

/** A crop of a picture drawn to cover a rectangle. */
function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, x: number, y: number, w: number, h: number, zoom = 1, fx = 0.5, fy = 0.5) {
  const sw = (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width || w, sh = (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height || h
  const scale = Math.max(w / sw, h / sh) * zoom
  const cw = w / scale, ch = h / scale
  ctx.drawImage(src, Math.max(0, Math.min(sw - cw, (sw - cw) * fx)), Math.max(0, Math.min(sh - ch, (sh - ch) * fy)), cw, ch, x, y, w, h)
}

/** An organic blob path — the ectoplasm — breathing with time. */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number, t: number) {
  const n = 7 + Math.floor(hash(seed, 1) * 3)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < n; i += 1) { const a = (i / n) * Math.PI * 2; const rr = r * (0.7 + hash(seed, i, 2) * 0.5 + Math.sin(t * 2.1 + i * 1.7 + seed) * 0.12); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (0.75 + hash(seed, 3) * 0.5)]) }
  ctx.beginPath()
  for (let i = 0; i < n; i += 1) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n], [x2, y2] = pts[(i + 2) % n]; if (i === 0) ctx.moveTo((x0 + x1) / 2, (y0 + y1) / 2); ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2) }
  ctx.closePath()
}

export type Promo = { cuts: Cut[]; frame: (ctx: CanvasRenderingContext2D, atMs: number, frameNo: number) => void; cutAt: (atMs: number) => Cut }

/** The film at one size: its cuts, and one function drawing any moment of it. The live preview and the recording share it. */
export function createPromo(input: PromoInput, W: number, H: number): Promo {
  const accent = input.accent
  const TONES = [accent, CREAM, DEEP, mix(accent, DEEP, 0.45), mix(accent, CREAM, 0.5)]
  const tone = (q: number) => TONES[Math.floor(q * TONES.length)]
  const k = Math.min(1, Math.max(0, input.intensity))
  const u = W / 1080
  const px = Math.max(1, Math.round(u))
  const font = input.titleFont
  const cuts = planPromo(input.seconds, k, input.seed, input.stock.length)
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c }
  const prev = make(), scratch = make(), tiny = make()
  const pv = prev.getContext('2d')!, sx = scratch.getContext('2d')!

  // ----- the sources: the brand block, the icon field, the stock pictures, each as a frame-sized picture.
  const brandCard = (() => {
    const c = make(); const g = c.getContext('2d')!
    g.fillStyle = DEEP; g.fillRect(0, 0, W, H)
    const lw = Math.round(W * 0.72), lh = Math.round(lw * input.logo.naturalHeight / Math.max(1, input.logo.naturalWidth))
    g.drawImage(input.logo, Math.round((W - lw) / 2), Math.round(H * 0.44 - lh / 2), lw, lh)
    g.fillStyle = CREAM; g.font = `700 ${Math.round(W * 0.05)}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SITE, W / 2, Math.round(H * 0.44 + lh / 2 + W * 0.06))
    for (let i = 0; i < 6; i += 1) { g.fillStyle = tone(hash(i, 8)); g.globalAlpha = 0.5; g.fillRect(hash(i, 9) * W * 0.6, hash(i, 10) * H, W * (0.1 + hash(i, 11) * 0.5), px) }
    return c
  })()
  const iconField = (() => {
    const c = make(); const g = c.getContext('2d')!
    g.fillStyle = DEEP; g.fillRect(0, 0, W, H)
    const icons = input.icons
    for (let i = 0; i < 18 && icons.length; i += 1) { const img = icons[Math.floor(hash(i, 12) * icons.length)]; const s = Math.round(W * (0.08 + hash(i, 13) * 0.22)); g.globalAlpha = 0.6 + hash(i, 14) * 0.4; g.drawImage(img, hash(i, 15) * (W - s), hash(i, 16) * (H - s), s, s) }
    return c
  })()
  const stockCards = input.stock.map((img) => { const c = make(); cover(c.getContext('2d')!, img, 0, 0, W, H); return c })
  const sourceOf = (cut: Cut): HTMLCanvasElement => cut.source === 'stock' && stockCards.length ? stockCards[cut.pick % stockCards.length] : cut.source === 'icons' ? iconField : brandCard

  // ----- pieces
  const slices = (ctx: CanvasRenderingContext2D, seed: number, n: number, reach: number) => {
    for (let i = 0; i < n; i += 1) { const sh = Math.max(2, Math.round(H * (0.004 + hash(seed, i, 20) * 0.05))), y = Math.round(hash(seed, i, 21) * (H - sh)); ctx.drawImage(ctx.canvas, 0, y, W, sh, Math.round((hash(seed, i, 22) - 0.5) * W * reach), y, W, sh); if (hash(seed, i, 23) < 0.4) { ctx.fillStyle = hash(seed, i, 24) < 0.5 ? accent : CREAM; ctx.globalAlpha = 0.7; ctx.fillRect(0, y, W, px); ctx.globalAlpha = 1 } }
  }
  const hairlines = (ctx: CanvasRenderingContext2D, seed: number, n: number) => {
    for (let i = 0; i < n; i += 1) { ctx.fillStyle = tone(hash(seed, i, 25)); ctx.globalAlpha = 0.4 + hash(seed, i, 26) * 0.5; const vertical = hash(seed, i, 27) < 0.3; const len = (vertical ? H : W) * (0.1 + hash(seed, i, 28) * 0.6); if (vertical) ctx.fillRect(hash(seed, i, 29) * W, hash(seed, i, 30) * (H - len), px, len); else ctx.fillRect(hash(seed, i, 29) * (W - len), hash(seed, i, 30) * H, len, px) }
    ctx.globalAlpha = 1
  }
  const tinted = (img: CanvasImageSource, colour: string, w: number, h: number) => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'; sx.drawImage(img, 0, 0, w, h)
    sx.globalCompositeOperation = 'source-in'; sx.fillStyle = colour; sx.fillRect(0, 0, w, h); sx.globalCompositeOperation = 'source-over'
    return scratch
  }
  const cam = (ctx: CanvasRenderingContext2D, frame: number, at: number) => {
    ctx.save(); ctx.fillStyle = CREAM; ctx.font = `${Math.round(W * 0.022)}px ${font}`; ctx.textBaseline = 'top'
    const t = Math.floor(at / 1000)
    ctx.fillText(`17:${String(13 + t).padStart(2, '0')}`, Math.round(W * 0.04), Math.round(H * 0.025))
    ctx.fillText(`${String(140 + (frame % 30)).padStart(3, '0')}  F R N`, Math.round(W * 0.76), Math.round(H * 0.025))
    for (let i = 0; i < 4; i += 1) ctx.fillRect(Math.round(W * 0.6) + i * 7 * px, Math.round(H * 0.025) + (3 - i) * 3 * px, 4 * px, (i + 1) * 3 * px)
    ctx.strokeStyle = CREAM; ctx.lineWidth = px; ctx.strokeRect(Math.round(W * 0.66), Math.round(H * 0.027), 22 * px, 10 * px); ctx.fillRect(Math.round(W * 0.66) + 2 * px, Math.round(H * 0.027) + 2 * px, 14 * px, 6 * px)
    if (Math.floor(at / 500) % 2 === 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(Math.round(W * 0.04) + 6 * px, Math.round(H * 0.075), 6 * px, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CREAM; ctx.fillText('REC', Math.round(W * 0.04) + 16 * px, Math.round(H * 0.075) - 10 * px) }
    ctx.strokeStyle = hash(frame, 31) < 0.5 ? accent : CREAM; ctx.lineWidth = Math.max(1, Math.round(W * 0.002))
    const m = Math.round(W * 0.035), l = Math.round(W * 0.05)
    for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    ctx.restore()
  }
  const grain = (ctx: CanvasRenderingContext2D, seed: number, n: number) => { ctx.fillStyle = CREAM; for (let i = 0; i < n; i += 1) { ctx.globalAlpha = 0.1 + hash(seed, i, 32) * 0.4; ctx.fillRect(hash(seed, i, 33) * W, hash(seed, i, 34) * H, px * (1 + hash(seed, i, 35) * 2), px * (1 + hash(seed, i, 36) * 2)) } ctx.globalAlpha = 1 }
  const dither = (() => { const c = document.createElement('canvas'); c.width = 4 * px; c.height = 4 * px; const g = c.getContext('2d')!; g.fillStyle = DEEP; g.fillRect(0, 0, 2 * px, 2 * px); g.fillRect(2 * px, 2 * px, 2 * px, 2 * px); return c })()

  // The composer's animations, one drawer per cut, over the cut's source.
  const drawers = new Map<number, { draw: ReturnType<typeof createDrawer>; schedule: ReturnType<typeof burstSchedule> }>()
  const animOf = (cut: Cut, index: number) => {
    let d = drawers.get(index)
    if (!d) {
      d = { draw: createDrawer({ width: W, height: H, background: DEEP, rect: { x: 0, y: 0, w: W, h: H }, overlays: [], intensity: Math.max(0.35, k), style: cut.style, accent, text: hash(cut.seed, 37) < 0.5 ? 'RANDOM' : SITE, titleFont: font, logo: input.logo, letterAlpha: 0.85 }), schedule: burstSchedule(cut.to - cut.from, Math.max(0.35, k), 2) }
      drawers.set(index, d)
    }
    return d
  }

  // ----- the scenes
  const scene = (ctx: CanvasRenderingContext2D, cut: Cut, index: number, local: number, frame: number, at: number) => {
    const s = cut.seed, head = at - cut.from
    switch (cut.kind) {
      case 'anim': { const d = animOf(cut, index); d.draw(ctx, sourceOf(cut), head, d.schedule, frame); break }
      case 'huge': {
        // The wordmark or the stacked letters, enormous, stepping bigger, overflowing; the address small in a corner.
        const onAccent = hash(s, 40) < 0.5
        ctx.fillStyle = onAccent ? accent : DEEP; ctx.fillRect(0, 0, W, H)
        const across = hash(s, 41) < 0.6
        const dark = onAccent && hash(s, 45) < 0.5
        const img = across ? (dark ? input.logoDark : input.logo) : dark ? input.logoVerticalDark : input.logoVertical
        const step = Math.floor(local * (3 + k * 4) + hash(s, 42) * 3)
        // Bigger by steps, up to about three times the width; the letters always leave something in the frame.
        const scale = 1.1 + (step % 5) * (0.35 + k * 0.25)
        const lw = Math.round(W * 0.74 * scale), lh = Math.round(lw * img.naturalHeight / Math.max(1, img.naturalWidth))
        const ox = Math.round((hash(s, step, 43) - 0.5) * W * 0.22 * (scale - 1)), oy = Math.round((hash(s, step, 44) - 0.5) * H * 0.18 * (scale - 1))
        const x = Math.round((W - lw) / 2 + ox), y = Math.round((H - lh) / 2 + oy)
        ctx.drawImage(img, x, y, lw, lh)
        ctx.fillStyle = onAccent ? DEEP : CREAM; ctx.font = `700 ${Math.round(W * 0.04)}px ${font}`; ctx.textAlign = hash(s, 46) < 0.5 ? 'left' : 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(SITE, hash(s, 46) < 0.5 ? Math.round(W * 0.05) : Math.round(W * 0.95), Math.round(H * (0.12 + hash(s, 47) * 0.8)))
        if (hash(frame, s, 48) < 0.15 + k * 0.3) slices(ctx, s + frame, Math.round(3 + k * 8), 0.3)
        break
      }
      case 'icons': {
        // The icons swarm: many, some enormous, jumping every few frames, a few in the accent, slices through them.
        ctx.fillStyle = hash(s, 50) < 0.3 ? accent : DEEP; ctx.fillRect(0, 0, W, H)
        const icons = input.icons
        if (!icons.length) break
        const jump = Math.floor(at / 90)
        const n = 8 + Math.round(k * 18)
        for (let i = 0; i < n; i += 1) {
          const img = icons[Math.floor(hash(s, i, 51) * icons.length)]
          const huge = hash(s, i, 52) < 0.12
          const size = Math.round(W * (huge ? 0.6 + hash(s, i, 53) * 0.6 : 0.06 + hash(s, i, 53) * 0.22))
          const x = Math.round(hash(s, i, 54) * (W + size) - size + (hash(jump, i, 55) - 0.5) * W * 0.06 * k), y = Math.round(hash(s, i, 56) * (H + size) - size + (hash(jump, i, 57) - 0.5) * H * 0.04 * k)
          const colour = hash(s, i, 58) < 0.3 ? accent : hash(s, i, 58) < 0.4 ? DEEP : CREAM
          ctx.globalAlpha = huge ? 0.35 : 1
          if (colour === CREAM) ctx.drawImage(img, x, y, size, size); else ctx.drawImage(tinted(img, colour, size, size), 0, 0, size, size, x, y, size, size)
        }
        ctx.globalAlpha = 1
        if (hash(frame, s, 59) < 0.2 + k * 0.4) slices(ctx, s + frame, Math.round(4 + k * 10), 0.25)
        hairlines(ctx, s + jump, Math.round(k * 6))
        break
      }
      case 'ecto': {
        // The stacked letters, and ectoplasms drifting over them: through each, the frame displaced or mirrored, a fine outline around.
        ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H)
        const img = input.logoVertical
        const lw = Math.round(W * 0.62), lh = Math.round(lw * img.naturalHeight / Math.max(1, img.naturalWidth))
        ctx.drawImage(img, Math.round((W - lw) / 2), Math.round((H - lh) / 2), lw, lh)
        pv.drawImage(ctx.canvas, 0, 0)
        const blobs = 2 + Math.round(k * 3)
        for (let i = 0; i < blobs; i += 1) {
          const cx = W * (0.2 + hash(s, i, 60) * 0.6) + Math.sin(at / 900 + i) * W * 0.08, cy = H * (0.25 + hash(s, i, 61) * 0.5) + Math.cos(at / 1100 + i * 2) * H * 0.05
          const r = W * (0.1 + hash(s, i, 62) * 0.2)
          ctx.save(); blobPath(ctx, cx, cy, r, s + i, at / 1000); ctx.clip()
          ctx.fillStyle = hash(s, i, 63) < 0.4 ? accent : tone(hash(s, i, 64)); ctx.fillRect(0, 0, W, H)
          if (hash(s, i, 65) < 0.5) { ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(prev, Math.round((hash(s, i, 66) - 0.5) * W * 0.3), 0) } else ctx.drawImage(prev, Math.round((hash(s, i, 66) - 0.5) * W * 0.3), Math.round((hash(s, i, 67) - 0.5) * H * 0.1))
          ctx.restore()
          ctx.save(); blobPath(ctx, cx, cy, r, s + i, at / 1000); ctx.strokeStyle = hash(s, i, 68) < 0.6 ? CREAM : accent; ctx.lineWidth = 1.5 * px; ctx.stroke(); ctx.restore()
        }
        grain(ctx, s + frame, 120)
        break
      }
      case 'cam': {
        // A picture under a camera's interface, the frame creeping in, grain, a hairline or two.
        cover(ctx, sourceOf(cut), 0, 0, W, H, 1 + local * 0.08, 0.5 + (hash(s, 70) - 0.5) * 0.3, 0.5)
        if (hash(frame, s, 71) < k * 0.2) ctx.drawImage(ctx.canvas, Math.round((hash(frame, 72) - 0.5) * W * 0.03), 0)
        hairlines(ctx, s + Math.floor(at / 200), Math.round(1 + k * 4))
        grain(ctx, s + frame, 160)
        cam(ctx, frame, at)
        break
      }
      case 'codec': {
        // A codec losing its way: the picture in blocks, some copied from elsewhere, some shifted, some tinted; rows that slide.
        cover(ctx, sourceOf(cut), 0, 0, W, H)
        const B = Math.round(W / 15), cols = Math.ceil(W / B), rows = Math.ceil(H / B)
        const step = Math.floor(at / 110)
        pv.drawImage(ctx.canvas, 0, 0)
        const p = 0.08 + k * 0.3
        for (let by = 0; by < rows; by += 1) for (let bx = 0; bx < cols; bx += 1) {
          const q = hash(s, step, bx, by)
          if (q < p * 0.45) { const ox = Math.floor(hash(s, step, bx, by, 73) * cols), oy = Math.max(0, Math.min(rows - 1, by + Math.round((hash(s, step, bx, by, 74) - 0.5) * 4))); ctx.drawImage(prev, ox * B, oy * B, B, B, bx * B, by * B, B, B) }
          else if (q < p * 0.75) { const d = Math.round((hash(s, step, bx, by, 75) - 0.5) * 4) * B; ctx.drawImage(prev, bx * B, by * B, B, B, bx * B + d, by * B, B, B) }
          else if (q < p) { ctx.fillStyle = tone(hash(s, step, bx, by, 76)); ctx.globalAlpha = 0.55; ctx.fillRect(bx * B, by * B, B, B); ctx.globalAlpha = 1 }
        }
        for (let i = 0; i < Math.round(k * 3); i += 1) { const ry = Math.floor(hash(s, step, i, 77) * rows) * B; ctx.drawImage(ctx.canvas, 0, ry, W, B, Math.round((hash(s, step, i, 78) - 0.5) * W * 0.4), ry, W, B) }
        ctx.fillStyle = CREAM; ctx.font = `${Math.round(W * 0.022)}px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`${Math.round(8 + hash(step, 79) * 40)} Mbps  I P B P B  ${String(step % 300).padStart(3, '0')}`, Math.round(W * 0.04), Math.round(H * 0.95))
        break
      }
      case 'game': {
        // A video game: the picture in fat pixels, a score that climbs, lives, a bar of blocks, the wordmark in pixels too.
        const f = 14
        const tw = Math.round(W / f), th = Math.round(H / f)
        tiny.width = tw; tiny.height = th
        const tg = tiny.getContext('2d')!
        cover(tg, sourceOf(cut), 0, 0, tw, th)
        const lw = Math.round(tw * 0.7), lh = Math.round(lw * input.logo.naturalHeight / Math.max(1, input.logo.naturalWidth))
        tg.drawImage(input.logo, Math.round((tw - lw) / 2), Math.round(th * 0.12), lw, lh)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tiny, 0, 0, tw, th, 0, 0, W, H)
        ctx.imageSmoothingEnabled = true
        ctx.fillStyle = DEEP; ctx.fillRect(0, Math.round(H * 0.86), W, Math.round(H * 0.14))
        ctx.fillStyle = CREAM; ctx.font = `900 ${Math.round(W * 0.05)}px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(`SCORE ${String(Math.floor(hash(s, 80) * 9000 + at * (0.4 + k))).padStart(6, '0')}`, Math.round(W * 0.05), Math.round(H * 0.91))
        ctx.fillStyle = accent; for (let i = 0; i < 3; i += 1) ctx.fillRect(Math.round(W * 0.72) + i * Math.round(W * 0.07), Math.round(H * 0.895), Math.round(W * 0.045), Math.round(W * 0.045))
        const blocks = 12, bw = Math.round(W * 0.9 / blocks), lit = Math.round(blocks * ((at / 1000) % 1.5) / 1.5)
        for (let i = 0; i < blocks; i += 1) { ctx.fillStyle = i < lit ? accent : mix(accent, DEEP, 0.7); ctx.fillRect(Math.round(W * 0.05) + i * bw, Math.round(H * 0.955), bw - 3 * px, Math.round(H * 0.018)) }
        if (hash(frame, s, 81) < k * 0.25) slices(ctx, s + frame, 4, 0.2)
        break
      }
      case 'gif': {
        // A GIF: the frame held and let go in jerks, dithered, with its badge and its looping arrow.
        const hold = Math.floor(at / 140)
        if (hold !== Math.floor((at - 34) / 140) || head < 40) {
          cover(ctx, sourceOf(cut), 0, 0, W, H, 1 + (hold % 3) * 0.06, 0.5 + (hash(s, hold, 82) - 0.5) * 0.1, 0.5)
          ctx.globalAlpha = 0.22; ctx.fillStyle = ctx.createPattern(dither, 'repeat')!; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1
          if (hash(s, hold, 83) < 0.3) { ctx.fillStyle = accent; ctx.globalAlpha = 0.25; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
          pv.drawImage(ctx.canvas, 0, 0)
        } else ctx.drawImage(prev, 0, 0)
        ctx.fillStyle = CREAM; ctx.font = `900 ${Math.round(W * 0.14)}px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('GIF', Math.round(W * 0.05), Math.round(H * 0.06))
        ctx.font = `700 ${Math.round(W * 0.06)}px ${font}`; ctx.fillText(Math.floor(at / 140) % 2 === 0 ? '↻' : '↺', Math.round(W * 0.05), Math.round(H * 0.19))
        break
      }
    }
  }

  // ----- the curator's words and icon, last, crisp: cream with a deep outline, readable over the cream letters as over a picture.
  const words = (ctx: CanvasRenderingContext2D) => {
    const t = input.text
    if (t && t.value.trim()) {
      const size = Math.round(t.size * u)
      ctx.font = `${t.weight} ${size}px ${t.font}`; ctx.textBaseline = 'top'; ctx.textAlign = t.align
      const maxW = t.width * W
      const lines: string[] = []
      for (const para of t.value.split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const next = line ? `${line} ${w}` : w; if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w } else line = next } lines.push(line) }
      const x = Math.round(t.x * W + (t.align === 'center' ? maxW / 2 : t.align === 'right' ? maxW : 0))
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(size * 0.14)); ctx.strokeStyle = DEEP
      lines.forEach((line, i) => { const y = Math.round(t.y * H + i * size * 1.1); ctx.strokeText(line, x, y); ctx.fillStyle = CREAM; ctx.fillText(line, x, y) })
    }
    const ic = input.icon
    if (ic) ctx.drawImage(ic.image, Math.round(ic.x * W), Math.round(ic.y * H), Math.round(ic.size * u), Math.round(ic.size * u))
  }

  const frame = (ctx: CanvasRenderingContext2D, at: number, frameNo: number) => {
    const index = Math.max(0, cuts.findIndex((c) => at < c.to))
    const cut = cuts[index === -1 ? cuts.length - 1 : index] ?? cuts[cuts.length - 1]
    const local = Math.min(1, (at - cut.from) / Math.max(1, cut.to - cut.from))
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
    scene(ctx, cut, index, local, frameNo, at)
    // The break at the head of a cut: a few frames of black, a flash, the frame before in slices or in blocks.
    const head = at - cut.from
    if (head < 130 && cut.transition !== 'cut') {
      if (cut.transition === 'black') { ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H) }
      else if (cut.transition === 'flash') { ctx.fillStyle = hash(cut.seed, 90) < 0.5 ? CREAM : accent; ctx.globalAlpha = 1 - head / 130; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
      else if (cut.transition === 'slices') for (let i = 0; i < 16; i += 1) { const y = Math.round(hash(cut.seed, frameNo, i, 91) * H), h = Math.round(H * (0.01 + hash(cut.seed, frameNo, i, 92) * 0.06)); ctx.drawImage(prev, 0, y, W, h, Math.round((hash(cut.seed, frameNo, i, 93) - 0.5) * W * 0.5), y, W, h) }
      else { const B = Math.round(W / 6); for (let by = 0; by < H / B; by += 1) for (let bx = 0; bx < 6; bx += 1) if (hash(cut.seed, frameNo, bx, by, 94) < 0.45) ctx.drawImage(prev, bx * B, by * B, B, B, bx * B + Math.round((hash(cut.seed, bx, by, 95) - 0.5) * B), by * B, B, B) }
    }
    // Now and then the whole frame jumps; the wilder, the more often.
    if (hash(frameNo, 96) < k * 0.1) { ctx.drawImage(ctx.canvas, Math.round((hash(frameNo, 97) - 0.5) * W * 0.05), 0); slices(ctx, frameNo, 3, 0.2) }
    // The frame kept for the next break is taken before the words, so no break ever tears them.
    pv.drawImage(ctx.canvas, 0, 0)
    words(ctx)
  }
  const cutAt = (at: number) => { const index = cuts.findIndex((c) => at < c.to); return cuts[index === -1 ? cuts.length - 1 : index] }
  return { cuts, frame, cutAt }
}

/** The film recorded as an MP4 (Chrome, Edge) at 1080 × 1920, drawn live into the preview as it goes. */
export async function recordPromo(input: PromoInput, preview?: HTMLCanvasElement | null, onProgress?: (p: number) => void): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : Chrome ou Edge sur ordinateur.')
  const W = 1080, H = 1920
  const work = document.createElement('canvas'); work.width = W; work.height = H
  const ctx = work.getContext('2d')!
  const promo = createPromo(input, W, H)
  const stream = work.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 12_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  const total = input.seconds * 1000
  const previewCtx = preview?.getContext('2d') ?? null
  recorder.start(500)
  const started = performance.now()
  let frameNo = 0
  await new Promise<void>((resolve) => {
    const tick = () => {
      const at = performance.now() - started
      if (at >= total) { resolve(); return }
      promo.frame(ctx, at, frameNo)
      if (previewCtx && preview) previewCtx.drawImage(work, 0, 0, preview.width, preview.height)
      onProgress?.(at / total)
      frameNo += 1
      requestAnimationFrame(tick)
    }
    tick()
  })
  recorder.stop()
  await stopped
  const blob = new Blob(chunks, { type: choice.mimeType.split(';')[0] })
  if (!blob.size) throw new Error('Rien n’a été enregistré.')
  return { blob, extension: choice.extension }
}
