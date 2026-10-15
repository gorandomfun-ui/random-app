/**
 * The promo loops: short films that speak of Random itself, built from the
 * site's own things — the wordmark, the brand block, the icons — and from
 * stock pictures under a permissive licence, never from a creator's work.
 *
 * Not a run of poses but three layers alive at once, changed on a beat:
 *   the ground   one of the composer's animations, chosen by the curator, over a source that
 *                moves — the stock pictures passing like a feed, the icons drifting, the brand
 *                block — and the pictures never shown as they are: darkened, dithered, torn,
 *                a support for the glitch and nothing more;
 *   the brand    giant letters (RANDOM, the brand block, the curator's words) open on the
 *                ground, or the wordmark enormous stepping bigger, or the icons swarming;
 *   the dressing the screen's own artefacts, as in the references: a phone's status bar,
 *                counters, timecode, brackets, REC; a codec's macroblocks; scanlines and
 *                tearing; a game's score and pixels; a GIF's stutter and dither.
 * Breaks on the beat: black, a flash, the frame before in slices or blocks.
 * Theme colours only: no gradient, no blur, no RGB. Every number comes from a
 * hash, so a seed gives the same film twice.
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

export type BrandLayer = 'letters' | 'huge' | 'icons'
export type Dressing = 'cam' | 'codec' | 'screen' | 'game' | 'gif'
export const BRAND_LAYERS: Array<{ key: BrandLayer; name: string }> = [{ key: 'letters', name: 'Lettres' }, { key: 'huge', name: 'Logo énorme' }, { key: 'icons', name: 'Icônes' }]
export const DRESSINGS: Array<{ key: Dressing; name: string }> = [{ key: 'cam', name: 'Caméra' }, { key: 'codec', name: 'Codec' }, { key: 'screen', name: 'Écran' }, { key: 'game', name: 'Jeu vidéo' }, { key: 'gif', name: 'GIF' }]

export type PromoText = { value: string; size: number; align: 'left' | 'center' | 'right'; font: string; weight: number; x: number; y: number; width: number }
export type PromoIcon = { image: HTMLImageElement; x: number; y: number; size: number }
export type PromoInput = {
  seconds: number
  intensity: number
  seed: number
  accent: string
  /** The animations the ground may use, the brand layers, the dressings: the curator's choice. */
  styles: GlitchStyle[]
  brands: BrandLayer[]
  dressings: Dressing[]
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

/** A moment of the film: what each layer is doing, decided on the beats. */
export type Beat = { from: number; to: number; style: GlitchStyle; brand: BrandLayer | null; brandMode: 'text' | 'wordmark' | 'block'; dressing: Dressing[]; break: 'none' | 'black' | 'flash' | 'slices' | 'blocks'; picture: number; seed: number }

/** The beats: short and wild as the force rises; each layer keeps or changes on its own; the pictures pass. */
export function planBeats(input: Pick<PromoInput, 'seconds' | 'intensity' | 'seed' | 'styles' | 'brands' | 'dressings'>, pictures: number): Beat[] {
  const k = Math.min(1, Math.max(0, input.intensity))
  const styles = input.styles.length ? input.styles : GLITCH_STYLES.map((g) => g.key)
  const brands = input.brands
  const dressings = input.dressings
  const out: Beat[] = []
  const total = input.seconds * 1000
  const period = Math.round(760 - k * 400)
  let at = 0, i = 0
  let style = styles[Math.floor(hash(input.seed, 1) * styles.length)]
  let brand: BrandLayer | null = brands.length ? brands[Math.floor(hash(input.seed, 2) * brands.length)] : null
  let brandMode: Beat['brandMode'] = 'wordmark'
  let dressing: Dressing[] = dressings.length ? [dressings[Math.floor(hash(input.seed, 3) * dressings.length)]] : []
  let picture = 0
  while (at < total) {
    const s = input.seed * 13 + i * 97
    const length = Math.round(period * (0.7 + hash(s, 4) * 0.6))
    if (i > 0) {
      if (hash(s, 5) < 0.3 + k * 0.2 && styles.length > 1) { const others = styles.filter((x) => x !== style); style = others[Math.floor(hash(s, 6) * others.length)] }
      if (hash(s, 7) < 0.35 && brands.length) { const pool: Array<BrandLayer | null> = [...brands, null]; brand = pool[Math.floor(hash(s, 8) * pool.length)] }
      if (hash(s, 9) < 0.4 && dressings.length) { const n = hash(s, 10) < k * 0.6 ? 2 : 1; dressing = []; for (let j = 0; j < n; j += 1) { const d = dressings[Math.floor(hash(s, 11, j) * dressings.length)]; if (!dressing.includes(d)) dressing.push(d) } }
      if (hash(s, 12) < 0.5 + k * 0.3 && pictures > 1) picture = (picture + 1 + Math.floor(hash(s, 13) * (pictures - 1))) % pictures
    }
    const qm = hash(s, 14)
    brandMode = qm < 0.4 ? 'wordmark' : qm < 0.7 ? 'block' : 'text'
    const qb = hash(s, 15)
    const brk: Beat['break'] = i === 0 ? 'none' : qb > 0.35 + k * 0.35 ? 'none' : qb < 0.08 ? 'black' : qb < 0.2 ? 'flash' : qb < 0.5 ? 'slices' : 'blocks'
    out.push({ from: at, to: Math.min(total, at + length), style, brand, brandMode, dressing: [...dressing], break: brk, picture, seed: s })
    at += length; i += 1
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

export type Promo = { beats: Beat[]; frame: (ctx: CanvasRenderingContext2D, atMs: number, frameNo: number) => void; beatAt: (atMs: number) => Beat }

/** The film at one size: its beats, and one function drawing any moment of it. The live preview and the recording share it. */
export function createPromo(input: PromoInput, W: number, H: number): Promo {
  const accent = input.accent
  const TONES = [accent, CREAM, DEEP, mix(accent, DEEP, 0.45), mix(accent, CREAM, 0.5)]
  const tone = (q: number) => TONES[Math.floor(q * TONES.length)]
  const k = Math.min(1, Math.max(0, input.intensity))
  const u = W / 1080
  const px = Math.max(1, Math.round(u))
  const font = input.titleFont
  const beats = planBeats(input, Math.max(1, input.stock.length))
  const make = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const prev = make(), source = make(), scratch = make(), scratch2 = make(), tiny = make(Math.round(W / 14), Math.round(H / 14))
  const pv = prev.getContext('2d')!, sg = source.getContext('2d')!, sx = scratch.getContext('2d')!, s2 = scratch2.getContext('2d')!, tg = tiny.getContext('2d')!
  const dither = (() => { const c = make(4 * px, 4 * px); const g = c.getContext('2d')!; g.fillStyle = DEEP; g.fillRect(0, 0, 2 * px, 2 * px); g.fillRect(2 * px, 2 * px, 2 * px, 2 * px); return c })()
  const scan = (() => { const c = make(1, 3 * px); const g = c.getContext('2d')!; g.fillStyle = DEEP; g.fillRect(0, 0, 1, px); return c })()

  // ----- pieces
  const slices = (ctx: CanvasRenderingContext2D, seed: number, n: number, reach: number, thick = 0.05) => {
    for (let i = 0; i < n; i += 1) { const sh = Math.max(2, Math.round(H * (0.004 + hash(seed, i, 20) * thick))), y = Math.round(hash(seed, i, 21) * (H - sh)); ctx.drawImage(ctx.canvas, 0, y, W, sh, Math.round((hash(seed, i, 22) - 0.5) * W * reach), y, W, sh); if (hash(seed, i, 23) < 0.4) { ctx.fillStyle = hash(seed, i, 24) < 0.5 ? accent : CREAM; ctx.globalAlpha = 0.7; ctx.fillRect(0, y, W, px); ctx.globalAlpha = 1 } }
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
  const logoSize = (img: HTMLImageElement, w: number) => ({ w: Math.round(w), h: Math.round(w * img.naturalHeight / Math.max(1, img.naturalWidth)) })

  // ----- the ground's source: never a picture as it is. The stock pictures pass with a drift, darkened and dithered, torn in rows;
  // without them, the brand block. The icons drift across either way.
  const drawSource = (beat: Beat, at: number, frame: number) => {
    sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1
    const local = (at - beat.from) / Math.max(1, beat.to - beat.from)
    if (input.stock.length) {
      const img = input.stock[beat.picture % input.stock.length]
      cover(sg, img, 0, 0, W, H, 1.05 + local * 0.12, 0.3 + hash(beat.seed, 40) * 0.4 + local * 0.08 * (hash(beat.seed, 41) < 0.5 ? 1 : -1), 0.5)
      // Darkened, tinted a little toward the accent, dithered: a support, not a photograph.
      sg.fillStyle = DEEP; sg.globalAlpha = 0.42 + k * 0.1; sg.fillRect(0, 0, W, H)
      sg.fillStyle = accent; sg.globalAlpha = 0.12; sg.fillRect(0, 0, W, H)
      sg.globalAlpha = 0.3; sg.fillStyle = sg.createPattern(dither, 'repeat')!; sg.fillRect(0, 0, W, H); sg.globalAlpha = 1
      // Rows torn, always; a column displaced now and then.
      const rows = Math.round(4 + k * 14)
      for (let i = 0; i < rows; i += 1) { const sh = Math.max(2, Math.round(H * (0.004 + hash(beat.seed, frame, i, 42) * 0.03))), y = Math.round(hash(beat.seed, frame, i, 43) * (H - sh)); sg.drawImage(source, 0, y, W, sh, Math.round((hash(beat.seed, frame, i, 44) - 0.5) * W * (0.08 + k * 0.25)), y, W, sh) }
      if (hash(beat.seed, Math.floor(at / 120), 45) < k * 0.5) { const cw = Math.round(W * (0.05 + hash(beat.seed, 46) * 0.2)), cx = Math.round(hash(beat.seed, Math.floor(at / 120), 47) * (W - cw)); sg.drawImage(source, cx, 0, cw, H, cx, Math.round((hash(beat.seed, 48) - 0.5) * H * 0.2 * k), cw, H) }
    } else {
      sg.fillStyle = DEEP; sg.fillRect(0, 0, W, H)
      const { w: lw, h: lh } = logoSize(input.logo, W * 0.7)
      sg.drawImage(input.logo, Math.round((W - lw) / 2), Math.round(H * 0.44 - lh / 2), lw, lh)
      sg.fillStyle = CREAM; sg.font = `700 ${Math.round(W * 0.05)}px ${font}`; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText(SITE, W / 2, Math.round(H * 0.44 + lh / 2 + W * 0.06))
    }
    const icons = input.icons
    if (icons.length) {
      const n = 4 + Math.round(k * 6)
      for (let i = 0; i < n; i += 1) { const img = icons[Math.floor(hash(beat.seed, i, 49) * icons.length)]; const s = Math.round(W * (0.08 + hash(beat.seed, i, 50) * 0.18)); const x = ((hash(beat.seed, i, 51) * (W + s) + at * (0.02 + hash(beat.seed, i, 52) * 0.08) * (hash(beat.seed, i, 53) < 0.5 ? 1 : -1)) % (W + s) + W + s) % (W + s) - s; const y = hash(beat.seed, i, 54) * (H - s) + Math.sin(at / 700 + i) * H * 0.02; sg.globalAlpha = 0.35 + hash(beat.seed, i, 55) * 0.4; sg.drawImage(img, Math.round(x), Math.round(y), s, s) }
      sg.globalAlpha = 1
    }
  }

  // ----- the ground: the composer's animations, one drawer per style, over the source.
  const drawers = new Map<GlitchStyle, { draw: ReturnType<typeof createDrawer>; schedule: ReturnType<typeof burstSchedule> }>()
  const groundOf = (style: GlitchStyle) => {
    let d = drawers.get(style)
    if (!d) {
      d = { draw: createDrawer({ width: W, height: H, background: DEEP, rect: { x: 0, y: 0, w: W, h: H }, overlays: [], intensity: Math.max(0.45, k), style, accent, text: 'RANDOM', titleFont: font, logo: input.logo, letterAlpha: 0.8 }), schedule: burstSchedule(input.seconds * 1000, Math.max(0.45, k), 2) }
      drawers.set(style, d)
    }
    return d
  }

  // ----- the brand layer
  /** One stamp of giant letters on the scratch: the words, the wordmark, or the brand block; returns its bounds. */
  const stamp = (mode: Beat['brandMode'], scale: number, cy: number, align: 'left' | 'center' | 'right') => {
    sx.clearRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'
    const maxW = W * 0.96 * scale
    const anchorX = align === 'left' ? W * 0.03 : align === 'right' ? W * 0.97 : W / 2
    const left = (w: number) => align === 'left' ? anchorX : align === 'right' ? anchorX - w : anchorX - w / 2
    if (mode === 'text') {
      const words = (input.text?.value.trim() || 'RANDOM').toUpperCase().split(/\s+/).slice(0, 3)
      sx.font = `900 100px ${font}`
      const widest = Math.max(...words.map((w) => sx.measureText(w).width), 1)
      const size = Math.round(Math.min(100 * maxW / widest, H * 0.22 * scale))
      sx.font = `900 ${size}px ${font}`; sx.textAlign = align; sx.textBaseline = 'middle'; sx.fillStyle = CREAM
      const top = cy - (words.length - 1) * size * 0.55
      words.forEach((word, wi) => sx.fillText(word, anchorX, top + wi * size * 1.1))
      return { x: left(maxW), y: top - size * 0.6, w: maxW, h: words.length * size * 1.1 }
    }
    const { w: lw, h: lh } = logoSize(input.logo, maxW * (mode === 'block' ? 0.8 : 1))
    sx.drawImage(input.logo, left(lw), cy - lh / 2 - (mode === 'block' ? lh * 0.35 : 0), lw, lh)
    if (mode === 'block') { sx.font = `700 ${Math.round(lh * 0.42)}px ${font}`; sx.textAlign = align; sx.textBaseline = 'middle'; sx.fillStyle = CREAM; sx.fillText(SITE, anchorX, cy + lh * 0.45); return { x: left(lw), y: cy - lh * 0.95, w: lw, h: lh * 1.8 } }
    return { x: left(lw), y: cy - lh / 2, w: lw, h: lh }
  }
  const brandLayer = (ctx: CanvasRenderingContext2D, beat: Beat, at: number, frame: number) => {
    const s = beat.seed, local = (at - beat.from) / Math.max(1, beat.to - beat.from)
    if (beat.brand === 'letters') {
      // Giant letters open on the ground: a deep silhouette behind, the shapes in cream, the ground through windows cut in them.
      const zone = hash(s, 60), qa = hash(s, 61)
      const cy = H * (zone < 0.5 ? 0.42 : zone < 0.75 ? 0.24 : 0.58)
      const align = qa < 0.5 ? 'center' : qa < 0.75 ? 'left' : 'right'
      const jump = Math.floor(at / 110)
      const dx = hash(jump, s, 62) < k * 0.4 ? Math.round((hash(jump, s, 63) - 0.5) * W * 0.25) : 0
      const bounds = stamp(beat.brandMode, 1, cy, align)
      s2.clearRect(0, 0, W, H); s2.globalCompositeOperation = 'source-over'; s2.drawImage(scratch, Math.round(W * 0.012), Math.round(H * 0.006)); s2.globalCompositeOperation = 'source-in'; s2.fillStyle = DEEP; s2.fillRect(0, 0, W, H); s2.globalCompositeOperation = 'source-over'
      ctx.drawImage(scratch2, dx, 0)
      ctx.drawImage(scratch, dx, 0)
      // Windows: the ground, lighter, through parts of the letters.
      sx.globalCompositeOperation = 'source-in'; sx.drawImage(source, 0, 0); sx.fillStyle = CREAM; sx.globalAlpha = 0.25; sx.fillRect(0, 0, W, H); sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 2 + Math.round(k * 4); i += 1) { const w = Math.round(bounds.w * (0.15 + hash(jump, i, 64) * 0.5)), h = Math.round(bounds.h * (0.3 + hash(jump, i, 65) * 0.7)); const x = Math.round(bounds.x + hash(jump, i, 66) * Math.max(0, bounds.w - w)), y = Math.round(bounds.y + hash(jump, i, 67) * Math.max(0, bounds.h - h)); ctx.drawImage(scratch, x, y, w, h, x + dx, y, w, h) }
      if (hash(frame, s, 68) < k * 0.3) slices(ctx, s + frame, Math.round(3 + k * 6), 0.35)
    } else if (beat.brand === 'huge') {
      // The wordmark or the stacked letters, enormous, stepping bigger, over a panel of the accent now and then.
      const panel = hash(s, 70) < 0.35
      if (panel) { ctx.fillStyle = accent; ctx.globalAlpha = 0.85; ctx.fillRect(0, Math.round(H * (0.1 + hash(s, 71) * 0.4)), W, Math.round(H * (0.25 + hash(s, 72) * 0.3))); ctx.globalAlpha = 1 }
      const across = hash(s, 73) < 0.6
      const img = across ? (panel ? input.logoDark : input.logo) : panel ? input.logoVerticalDark : input.logoVertical
      const step = Math.floor(local * (3 + k * 4) + hash(s, 74) * 3)
      const scale = 1.1 + (step % 5) * (0.35 + k * 0.25)
      const { w: lw, h: lh } = logoSize(img, W * 0.74 * scale)
      const ox = Math.round((hash(s, step, 75) - 0.5) * W * 0.22 * (scale - 1)), oy = Math.round((hash(s, step, 76) - 0.5) * H * 0.18 * (scale - 1))
      ctx.drawImage(img, Math.round((W - lw) / 2 + ox), Math.round((H - lh) / 2 + oy), lw, lh)
      if (hash(frame, s, 77) < 0.15 + k * 0.3) slices(ctx, s + frame, Math.round(3 + k * 8), 0.3)
    } else if (beat.brand === 'icons') {
      // The icons swarming: some enormous and faint, most jumping every few frames, a few in the accent or deep.
      const icons = input.icons
      if (!icons.length) return
      const jump = Math.floor(at / 90)
      const n = 6 + Math.round(k * 14)
      for (let i = 0; i < n; i += 1) {
        const img = icons[Math.floor(hash(s, i, 80) * icons.length)]
        const huge = hash(s, i, 81) < 0.15
        const size = Math.round(W * (huge ? 0.6 + hash(s, i, 82) * 0.6 : 0.07 + hash(s, i, 82) * 0.2))
        const x = Math.round(hash(s, i, 83) * (W + size) - size + (hash(jump, i, 84) - 0.5) * W * 0.06 * k), y = Math.round(hash(s, i, 85) * (H + size) - size + (hash(jump, i, 86) - 0.5) * H * 0.04 * k)
        const colour = hash(s, i, 87) < 0.3 ? accent : hash(s, i, 87) < 0.4 ? DEEP : CREAM
        ctx.globalAlpha = huge ? 0.3 : 0.9
        if (colour === CREAM) ctx.drawImage(img, x, y, size, size); else ctx.drawImage(tinted(img, colour, size, size), 0, 0, size, size, x, y, size, size)
      }
      ctx.globalAlpha = 1
    }
  }

  // ----- the dressing: the screen's artefacts
  const dressCam = (ctx: CanvasRenderingContext2D, frame: number, at: number) => {
    ctx.save(); ctx.fillStyle = CREAM; ctx.font = `${Math.round(W * 0.022)}px ${font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    const t = Math.floor(at / 1000)
    ctx.fillText(`17:${String(13 + t).padStart(2, '0')}`, Math.round(W * 0.04), Math.round(H * 0.025))
    ctx.fillText(`${String(140 + (frame % 30)).padStart(3, '0')}  F R N`, Math.round(W * 0.76), Math.round(H * 0.025))
    for (let i = 0; i < 4; i += 1) ctx.fillRect(Math.round(W * 0.6) + i * 7 * px, Math.round(H * 0.025) + (3 - i) * 3 * px, 4 * px, (i + 1) * 3 * px)
    ctx.strokeStyle = CREAM; ctx.lineWidth = px; ctx.strokeRect(Math.round(W * 0.66), Math.round(H * 0.027), 22 * px, 10 * px); ctx.fillRect(Math.round(W * 0.66) + 2 * px, Math.round(H * 0.027) + 2 * px, 14 * px, 6 * px)
    // The timecode, and REC blinking.
    ctx.font = `${Math.round(W * 0.03)}px ${font}`; ctx.fillText(`00:00:${String(t).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`, Math.round(W * 0.04), Math.round(H * 0.93))
    if (Math.floor(at / 500) % 2 === 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(Math.round(W * 0.04) + 6 * px, Math.round(H * 0.075), 6 * px, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CREAM; ctx.font = `${Math.round(W * 0.022)}px ${font}`; ctx.fillText('REC', Math.round(W * 0.04) + 16 * px, Math.round(H * 0.075) - 10 * px) }
    ctx.strokeStyle = hash(frame, 31) < 0.5 ? accent : CREAM; ctx.lineWidth = Math.max(1, Math.round(W * 0.002))
    const m = Math.round(W * 0.035), l = Math.round(W * 0.05)
    for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    // The focus square in the middle, drifting.
    const fs = Math.round(W * 0.18), fx = Math.round(W / 2 - fs / 2 + Math.sin(at / 900) * W * 0.05), fy = Math.round(H * 0.45 - fs / 2 + Math.cos(at / 1300) * H * 0.03)
    ctx.strokeStyle = CREAM; ctx.lineWidth = px; ctx.globalAlpha = 0.8
    for (const [cx, cy, dx, dy] of [[fx, fy, 1, 1], [fx + fs, fy, -1, 1], [fx, fy + fs, 1, -1], [fx + fs, fy + fs, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * fs * 0.25); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * fs * 0.25, cy); ctx.stroke() }
    ctx.restore()
  }
  const dressCodec = (ctx: CanvasRenderingContext2D, beat: Beat, at: number) => {
    // Macroblocks: some copied from elsewhere, some shifted, some tinted; a row or two sliding; the stream's figures.
    const B = Math.round(W / 15), cols = Math.ceil(W / B), rows = Math.ceil(H / B)
    const step = Math.floor(at / 110)
    pv.drawImage(ctx.canvas, 0, 0)
    const p = 0.06 + k * 0.28
    for (let by = 0; by < rows; by += 1) for (let bx = 0; bx < cols; bx += 1) {
      const q = hash(beat.seed, step, bx, by)
      if (q < p * 0.45) { const ox = Math.floor(hash(beat.seed, step, bx, by, 90) * cols), oy = Math.max(0, Math.min(rows - 1, by + Math.round((hash(beat.seed, step, bx, by, 91) - 0.5) * 4))); ctx.drawImage(prev, ox * B, oy * B, B, B, bx * B, by * B, B, B) }
      else if (q < p * 0.75) { const d = Math.round((hash(beat.seed, step, bx, by, 92) - 0.5) * 4) * B; ctx.drawImage(prev, bx * B, by * B, B, B, bx * B + d, by * B, B, B) }
      else if (q < p) { ctx.fillStyle = tone(hash(beat.seed, step, bx, by, 93)); ctx.globalAlpha = 0.5; ctx.fillRect(bx * B, by * B, B, B); ctx.globalAlpha = 1 }
    }
    for (let i = 0; i < Math.round(k * 3); i += 1) { const ry = Math.floor(hash(beat.seed, step, i, 94) * rows) * B; ctx.drawImage(ctx.canvas, 0, ry, W, B, Math.round((hash(beat.seed, step, i, 95) - 0.5) * W * 0.4), ry, W, B) }
    ctx.fillStyle = CREAM; ctx.font = `${Math.round(W * 0.022)}px ${font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(`${Math.round(8 + hash(step, 96) * 40)} Mbps  I P B P B  ${String(step % 300).padStart(3, '0')}`, Math.round(W * 0.96), Math.round(H * 0.95))
  }
  const dressScreen = (ctx: CanvasRenderingContext2D, beat: Beat, at: number, frame: number) => {
    // Scanlines over everything, a bar rolling down, tearing lines, a flicker.
    ctx.globalAlpha = 0.18; ctx.fillStyle = ctx.createPattern(scan, 'repeat')!; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1
    const bar = Math.round(((at * 0.25) % (H * 1.3)) - H * 0.15), bh = Math.round(H * 0.08)
    ctx.fillStyle = CREAM; ctx.globalAlpha = 0.07; ctx.fillRect(0, bar, W, bh); ctx.globalAlpha = 1
    for (let i = 0; i < Math.round(1 + k * 4); i += 1) { const y = Math.round(hash(beat.seed, Math.floor(at / 80), i, 97) * H), sh = Math.round(H * (0.002 + hash(beat.seed, i, 98) * 0.02)); ctx.drawImage(ctx.canvas, 0, y, W, sh, Math.round((hash(beat.seed, frame, i, 99) - 0.5) * W * 0.12), y, W, sh) }
    if (hash(frame, 100) < k * 0.08) { ctx.fillStyle = CREAM; ctx.globalAlpha = 0.12; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
    hairlines(ctx, beat.seed + Math.floor(at / 160), Math.round(1 + k * 3))
  }
  const dressGame = (ctx: CanvasRenderingContext2D, beat: Beat, at: number) => {
    // Fat pixels over a band of the frame on some moments, a score climbing, lives, a bar of blocks.
    if (hash(beat.seed, Math.floor(at / 200), 101) < 0.5 + k * 0.4) {
      const bandY = Math.round(hash(beat.seed, Math.floor(at / 200), 102) * H * 0.6), bandH = Math.round(H * (0.15 + hash(beat.seed, 103) * 0.35))
      const th = Math.max(1, Math.round(tiny.width * bandH / W))
      tg.drawImage(ctx.canvas, 0, bandY, W, bandH, 0, 0, tiny.width, th)
      ctx.imageSmoothingEnabled = false; ctx.drawImage(tiny, 0, 0, tiny.width, th, 0, bandY, W, bandH); ctx.imageSmoothingEnabled = true
    }
    ctx.fillStyle = DEEP; ctx.fillRect(0, Math.round(H * 0.9), W, Math.round(H * 0.1))
    ctx.fillStyle = CREAM; ctx.font = `900 ${Math.round(W * 0.045)}px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`SCORE ${String(Math.floor(hash(beat.seed, 104) * 9000 + at * (0.4 + k))).padStart(6, '0')}`, Math.round(W * 0.05), Math.round(H * 0.935))
    ctx.fillStyle = accent; for (let i = 0; i < 3; i += 1) ctx.fillRect(Math.round(W * 0.72) + i * Math.round(W * 0.07), Math.round(H * 0.92), Math.round(W * 0.045), Math.round(W * 0.045))
    const blocks = 12, bw = Math.round(W * 0.9 / blocks), lit = Math.round(blocks * ((at / 1000) % 1.5) / 1.5)
    for (let i = 0; i < blocks; i += 1) { ctx.fillStyle = i < lit ? accent : mix(accent, DEEP, 0.7); ctx.fillRect(Math.round(W * 0.05) + i * bw, Math.round(H * 0.975), bw - 3 * px, Math.round(H * 0.012)) }
  }
  const dressGif = (ctx: CanvasRenderingContext2D, at: number) => {
    // Dithered, a badge, the looping arrow; the stutter is the frame held in the loop below.
    ctx.globalAlpha = 0.25; ctx.fillStyle = ctx.createPattern(dither, 'repeat')!; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1
    ctx.fillStyle = CREAM; ctx.font = `900 ${Math.round(W * 0.12)}px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('GIF', Math.round(W * 0.05), Math.round(H * 0.05))
    ctx.font = `700 ${Math.round(W * 0.05)}px ${font}`; ctx.fillText(Math.floor(at / 140) % 2 === 0 ? '↻' : '↺', Math.round(W * 0.05), Math.round(H * 0.16))
  }

  // ----- the curator's words and icon, last, crisp: cream with a deep outline, readable over anything.
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

  const beatAt = (at: number) => { const index = beats.findIndex((b) => at < b.to); return beats[index === -1 ? beats.length - 1 : index] }
  let held = -1
  const frame = (ctx: CanvasRenderingContext2D, at: number, frameNo: number) => {
    const beat = beatAt(at)
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
    // A GIF's stutter: the frame held, let go every 140 ms.
    const hold = Math.floor(at / 140)
    if (beat.dressing.includes('gif') && hold === held && at - beat.from > 60) { ctx.drawImage(prev, 0, 0); words(ctx); return }
    held = hold
    // The ground: the moving source, through the chosen animation.
    drawSource(beat, at, frameNo)
    const g = groundOf(beat.style)
    g.draw(ctx, source, at, g.schedule, frameNo)
    // The brand over it.
    brandLayer(ctx, beat, at, frameNo)
    // The break at the head of a beat: black, a flash, the frame before in slices or blocks.
    const head = at - beat.from
    if (head < 120 && beat.break !== 'none') {
      if (beat.break === 'black') { ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H) }
      else if (beat.break === 'flash') { ctx.fillStyle = hash(beat.seed, 110) < 0.5 ? CREAM : accent; ctx.globalAlpha = 1 - head / 120; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
      else if (beat.break === 'slices') for (let i = 0; i < 16; i += 1) { const y = Math.round(hash(beat.seed, frameNo, i, 111) * H), h = Math.round(H * (0.01 + hash(beat.seed, frameNo, i, 112) * 0.06)); ctx.drawImage(prev, 0, y, W, h, Math.round((hash(beat.seed, frameNo, i, 113) - 0.5) * W * 0.5), y, W, h) }
      else { const B = Math.round(W / 6); for (let by = 0; by < H / B; by += 1) for (let bx = 0; bx < 6; bx += 1) if (hash(beat.seed, frameNo, bx, by, 114) < 0.45) ctx.drawImage(prev, bx * B, by * B, B, B, bx * B + Math.round((hash(beat.seed, bx, by, 115) - 0.5) * B), by * B, B, B) }
    }
    // The dressing: the screen's artefacts, one or two at a time.
    for (const d of beat.dressing) {
      if (d === 'codec') dressCodec(ctx, beat, at)
      else if (d === 'screen') dressScreen(ctx, beat, at, frameNo)
      else if (d === 'game') dressGame(ctx, beat, at)
      else if (d === 'gif') dressGif(ctx, at)
      else if (d === 'cam') dressCam(ctx, frameNo, at)
    }
    // Now and then the whole frame jumps; the wilder, the more often.
    if (hash(frameNo, 116) < k * 0.1) { ctx.drawImage(ctx.canvas, Math.round((hash(frameNo, 117) - 0.5) * W * 0.05), 0); slices(ctx, frameNo, 3, 0.2) }
    // The frame kept for the next break and the GIF's hold is taken before the words, so nothing ever tears them.
    pv.drawImage(ctx.canvas, 0, 0)
    words(ctx)
  }
  return { beats, frame, beatAt }
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
