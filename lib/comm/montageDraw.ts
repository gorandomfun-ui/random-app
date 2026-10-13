/**
 * One drawer for the moving slide, used by the live preview and by the
 * recording alike, so what is seen is what is exported. Seven animations,
 * the first the site's own, the six others after the owner's references:
 *   random   bands of the picture shifted, the engine's lines over it;
 *   slices   horizontal slices of the picture thrown sideways, fringed in the theme's colours;
 *   bands    lines of noise in the theme's colours over the frame, the picture through;
 *   sweep    a line crossing — whole, partial, backwards or downwards — the strips it touches sliding, blocks and lines with it;
 *   collage  blocks cut from the picture and from the queue's other pictures, bordered, jumping;
 *   feed     the picture in a framed card; now and then a feed of the pictures rushes past and it settles back;
 *   letters  a filter of giant letters — the slide's words, the wordmark or the brand block — open on the pictures.
 * The force goes from nothing (the picture alone) to a lot, and the picture stays readable at the top.
 * With cleanOnTop the animation is the ground and the picture sits on it untouched.
 * No gradient, no blur, no RGB: the colours are the theme's — cream, deep, the accent and their mixes.
 * Every number comes from a hash, so a frame is the same twice.
 */

export type GlitchStyle = 'random' | 'slices' | 'bands' | 'sweep' | 'collage' | 'feed' | 'letters'
export const GLITCH_STYLES: Array<{ key: GlitchStyle; name: string; hint: string }> = [
  { key: 'random', name: 'Random', hint: 'rafales, bandes, morceaux de l’image' },
  { key: 'slices', name: 'Tranches', hint: 'tranches horizontales jetées de côté, franges aux couleurs du thème' },
  { key: 'bands', name: 'Bandes', hint: 'des lignes de bruit aux couleurs du thème, l’image à travers' },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne traverse — entière, partielle, à rebours ou vers le bas — les bandes glissent, des blocs et des lignes l’accompagnent' },
  { key: 'collage', name: 'Collage', hint: 'des blocs découpés dans les images, qui sautent ; rien à zéro, beaucoup au maximum' },
  { key: 'feed', name: 'Défilé', hint: 'l’image dans un cadre ; de temps en temps un défilé des images passe et elle se repose' },
  { key: 'letters', name: 'Lettres', hint: 'un filtre de lettres géantes — ton texte, RANDOM ou le bloc marque — ouvert sur les images' },
]

export type DrawerInput = {
  width: number
  height: number
  background: string
  /** Where the picture is drawn, in canvas pixels (it may overflow its clip when it covers). */
  rect: { x: number; y: number; w: number; h: number }
  /** The rectangle the picture must stay in; the whole canvas when absent. */
  clip?: { x: number; y: number; w: number; h: number } | null
  /** The dressing, transparent: the calm draw first, then the glitched variants. */
  overlays: HTMLImageElement[]
  intensity: number
  style: GlitchStyle
  accent: string
  /** When the picture sits in a smaller rectangle, the ground behind it: the picture enlarged and darkened, or nothing. */
  ground?: boolean
  /** Other pictures of the queue, for the collage and the feed. */
  extras?: CanvasImageSource[]
  /** The slide's words and the typeface for the letters. */
  text?: string
  titleFont?: string
  /** The animation fills the frame as a ground; the picture is drawn clean on top, at its rect. */
  cleanOnTop?: boolean
  /** The wordmark, for the letters' filter; the word RANDOM in the typeface when absent. */
  logo?: CanvasImageSource | null
  /** How much the giant letters cover the picture, 0 to 1. */
  letterAlpha?: number
}

export type Slot = { until: number; variant: number }

/** The glitch's rhythm: calm stretches, then bursts of a few tenths of a second, more often as the intensity rises. */
export function burstSchedule(lengthMs: number, intensity: number, variants: number): Slot[] {
  const out: Slot[] = []
  let at = 0, k = 0
  while (at < lengthMs + 2000) {
    const calm = intensity <= 0 || ((k * 7919) % 100) / 100 > intensity * 0.75
    const length = calm ? 350 + ((k * 104729) % 900) : 100 + ((k * 15485863) % 320)
    at += length; k += 1
    out.push({ until: at, variant: calm || variants < 2 ? 0 : 1 + (k % (variants - 1)) })
  }
  return out
}

/** A small deterministic number from a few integers, in [0, 1). */
const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }

const CREAM = '#F8F5E6', DEEP = '#121210'
const SITE = 'gorandom.fun'

/** Two hex colours blended. */
function mix(a: string, b: string, t: number): string {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

const sizeOf = (s: CanvasImageSource, fallbackW: number, fallbackH: number) => ({
  w: (s as HTMLVideoElement).videoWidth || (s as HTMLImageElement).naturalWidth || (s as HTMLCanvasElement).width || fallbackW,
  h: (s as HTMLVideoElement).videoHeight || (s as HTMLImageElement).naturalHeight || (s as HTMLCanvasElement).height || fallbackH,
})

/** A crop of a picture drawn to cover a rectangle. */
function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, x: number, y: number, w: number, h: number, fx = 0.5, fy = 0.5, zoom = 1) {
  const { w: sw, h: sh } = sizeOf(src, w, h)
  const scale = Math.max(w / sw, h / sh) * zoom
  const cw = w / scale, ch = h / scale
  const sx = Math.max(0, Math.min(sw - cw, (sw - cw) * fx)), sy = Math.max(0, Math.min(sh - ch, (sh - ch) * fy))
  ctx.drawImage(src, sx, sy, cw, ch, x, y, w, h)
}

export function createDrawer(input: DrawerInput) {
  const { width, height } = input
  const extras = input.extras ?? []
  const accent = input.accent
  /** The theme's tones: the accent, cream, deep, and their mixes. */
  const TONES = [accent, CREAM, DEEP, mix(accent, DEEP, 0.45), mix(accent, CREAM, 0.5)]
  const tone = (q: number) => TONES[Math.floor(q * TONES.length)]
  const family = input.titleFont ?? 'Tomorrow, sans-serif'
  const scratch = document.createElement('canvas'); scratch.width = width; scratch.height = height
  const s = scratch.getContext('2d')!
  const scratch2 = document.createElement('canvas'); scratch2.width = width; scratch2.height = height
  const s2 = scratch2.getContext('2d')!

  /** The fringes of a torn edge: a hairline of the accent above, of cream below (or the reverse). */
  const fringe = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, q: number) => {
    ctx.globalAlpha = 0.5 + k * 0.4
    ctx.fillStyle = q < 0.5 ? accent : CREAM; ctx.fillRect(x, y - 2, w, 2)
    ctx.fillStyle = q < 0.5 ? CREAM : accent; ctx.fillRect(x, y + h, w, 2)
    ctx.globalAlpha = 1
  }
  /** Slices of the frame thrown sideways. */
  const throwSlices = (ctx: CanvasRenderingContext2D, seed: number, n: number, reach: number, fringes: number, k: number, thick = 0.04) => {
    for (let i = 0; i < n; i += 1) {
      const sh = Math.max(2, Math.round(height * (0.003 + hash(seed, i, 5) * thick)))
      const y = Math.round(hash(seed, i, 6) * (height - sh))
      const shift = Math.round((hash(seed, i, 7) - 0.5) * width * reach)
      ctx.drawImage(ctx.canvas, 0, y, width, sh, shift, y, width, sh)
      if (hash(seed, i, 8) < fringes) fringe(ctx, 0, y, width, sh, k, hash(seed, i, 9))
    }
  }
  /** Lines of noise in the theme's tones, some dotted. */
  const noiseLines = (ctx: CanvasRenderingContext2D, seed: number, n: number, alpha: number, yFrom = 0, yTo = height) => {
    for (let i = 0; i < n; i += 1) {
      const y = Math.round(yFrom + hash(seed, i, 11) * (yTo - yFrom)), h = Math.max(1, Math.round(height * (0.001 + hash(seed, i, 12) * 0.006)))
      const x = Math.round(hash(seed, i, 15) * width * 0.7), w = Math.round(width * (0.05 + hash(seed, i, 16) * 0.95))
      ctx.fillStyle = tone(hash(seed, i, 17)); ctx.globalAlpha = alpha * (0.6 + hash(seed, i, 19) * 0.4)
      ctx.fillRect(x, y, w, h)
      if (hash(seed, i, 20) < 0.3) for (let j = 0; j < 12; j += 1) { ctx.fillStyle = tone(hash(seed, i, j, 21)); ctx.fillRect(x + hash(seed, i, j, 22) * w, y, 2 + hash(seed, i, j, 23) * 6, h) }
    }
    ctx.globalAlpha = 1
  }
  /** A block of a picture, bordered. */
  const block = (ctx: CanvasRenderingContext2D, src: CanvasImageSource, x: number, y: number, w: number, h: number, q: number) => {
    cover(ctx, src, x, y, w, h, hash(q, 40), hash(q, 41), 1 + hash(q, 42) * 2)
    ctx.lineWidth = 2 + Math.round(hash(q, 43) * 3); ctx.strokeStyle = hash(q, 44) < 0.5 ? DEEP : CREAM; ctx.strokeRect(x, y, w, h)
  }
  const hud = (ctx: CanvasRenderingContext2D, frame: number, atMs: number) => {
    ctx.save(); ctx.fillStyle = CREAM; ctx.font = `${Math.round(width * 0.02)}px "Inter Tight", monospace`; ctx.textBaseline = 'top'
    const t = Math.floor(atMs / 1000)
    ctx.fillText(`17:${String(13 + t).padStart(2, '0')}  ${String(140 + (frame % 30)).padStart(3, '0')}`, Math.round(width * 0.04), Math.round(height * 0.025))
    ctx.fillText('F R N', Math.round(width * 0.9), Math.round(height * 0.06))
    ctx.strokeStyle = hash(frame, 22) < 0.5 ? accent : CREAM; ctx.lineWidth = Math.max(2, Math.round(width * 0.003))
    const m = Math.round(width * 0.035), l = Math.round(width * 0.05)
    for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    ctx.restore()
  }
  /** The picture covering the whole frame. */
  const coverRect = (source: CanvasImageSource) => {
    const { w: sw, h: sh } = sizeOf(source, width, height)
    const scale = Math.max(width / sw, height / sh)
    const gw = Math.round(sw * scale), gh = Math.round(sh * scale)
    return { x: Math.round((width - gw) / 2), y: Math.round((height - gh) / 2), w: gw, h: gh }
  }

  /**
   * One stamp of the letters' filter on the scratch canvas: the words, the wordmark, or the brand block,
   * at a scale, placed by its centre line and its alignment. Returns the stamp's bounds.
   */
  const stamp = (mode: 'text' | 'wordmark' | 'block', scale: number, cy: number, align: 'left' | 'center' | 'right') => {
    s.clearRect(0, 0, width, height)
    const maxW = width * 0.96 * scale
    const anchorX = align === 'left' ? width * 0.03 : align === 'right' ? width * 0.97 : width / 2
    const left = (w: number) => align === 'left' ? anchorX : align === 'right' ? anchorX - w : anchorX - w / 2
    if (mode === 'text') {
      const words = (input.text?.trim() || 'RANDOM').toUpperCase().split(/\s+/).slice(0, 3)
      s.font = `900 100px ${family}`
      const widest = Math.max(...words.map((w) => s.measureText(w).width), 1)
      const size = Math.round(Math.min(100 * maxW / widest, height * 0.24 * scale))
      s.font = `900 ${size}px ${family}`; s.textAlign = align; s.textBaseline = 'middle'; s.fillStyle = CREAM
      const top = cy - (words.length - 1) * size * 0.55
      words.forEach((word, wi) => s.fillText(word, anchorX, top + wi * size * 1.1))
      return { x: left(maxW), y: top - size * 0.6, w: maxW, h: words.length * size * 1.1 }
    }
    const logo = input.logo
    const lw = Math.round(maxW * (mode === 'block' ? 0.8 : 1))
    let lh: number
    if (logo) {
      const { w: sw, h: sh } = sizeOf(logo, 10, 2)
      lh = Math.round(lw * sh / sw)
      s.drawImage(logo, left(lw), cy - lh / 2 - (mode === 'block' ? lh * 0.35 : 0), lw, lh)
    } else {
      s.font = `900 100px ${family}`
      const size = Math.round(Math.min(100 * lw / s.measureText('RANDOM').width, height * 0.24 * scale))
      s.font = `900 ${size}px ${family}`; s.textAlign = align; s.textBaseline = 'middle'; s.fillStyle = CREAM
      lh = size
      s.fillText('RANDOM', anchorX, cy - (mode === 'block' ? lh * 0.35 : 0))
    }
    if (mode === 'block') {
      // The address under the wordmark, as on the brand block.
      const size = Math.round(lh * 0.42)
      s.font = `700 ${size}px ${family}`; s.textAlign = align; s.textBaseline = 'middle'; s.fillStyle = CREAM
      s.fillText(SITE, anchorX, cy + lh * 0.45)
      return { x: left(lw), y: cy - lh * 0.95, w: lw, h: lh * 1.8 }
    }
    return { x: left(lw), y: cy - lh / 2, w: lw, h: lh }
  }
  /** The scratch's shapes tinted in one colour, on the second scratch. */
  const tinted = (colour: string) => {
    s2.clearRect(0, 0, width, height); s2.globalCompositeOperation = 'source-over'; s2.drawImage(scratch, 0, 0)
    s2.globalCompositeOperation = 'source-in'; s2.fillStyle = colour; s2.fillRect(0, 0, width, height); s2.globalCompositeOperation = 'source-over'
    return scratch2
  }

  return (ctx: CanvasRenderingContext2D, source: CanvasImageSource, atMs: number, schedule: Slot[], frame: number) => {
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
    ctx.fillStyle = input.background; ctx.fillRect(0, 0, width, height)
    const onTop = Boolean(input.cleanOnTop)
    const full = { x: 0, y: 0, w: width, h: height }
    // With the picture clean on top, the animation works on the picture covering the whole frame.
    const r = onTop ? coverRect(source) : input.rect, c = onTop ? full : input.clip ?? full
    if (input.ground && !onTop) {
      const g = coverRect(source)
      ctx.drawImage(source, g.x, g.y, g.w, g.h)
      ctx.fillStyle = input.background; ctx.globalAlpha = 0.72; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
    }
    const slot = schedule.find((x) => atMs < x.until)
    const variant = slot?.variant ?? 0
    const k = Math.min(1, Math.max(0, input.intensity))
    const burst = variant > 0 && k > 0
    const seed = variant * 1000 + Math.floor(atMs / 90)
    const style = input.style
    const pool: CanvasImageSource[] = [source, ...extras]

    // The picture itself, except for the styles that build the frame otherwise.
    if (style !== 'feed' && style !== 'letters') {
      ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip()
      ctx.drawImage(source, r.x, r.y, r.w, r.h)
      ctx.restore()
    }

    if (style === 'random' && burst) {
      const pieces = Math.round(2 + k * 6)
      for (let i = 0; i < pieces; i += 1) {
        const ph = Math.max(4, Math.round(height * (0.006 + hash(seed, i, 1) * 0.03 * k)))
        const y = Math.round(height * 0.08 + hash(seed, i, 2) * (height * 0.76 - ph))
        const shift = Math.round((hash(seed, i, 3) - 0.5) * width * 0.12 * (0.5 + k))
        ctx.drawImage(ctx.canvas, 0, y, width, ph, shift, y, width, ph)
      }
    }

    if (style === 'slices') {
      // Calm: a few slices on the move, some fringed; burst: many, thrown far. Nothing at zero.
      throwSlices(ctx, seed, burst ? Math.round(8 + k * 26) : Math.round(k * 8), (burst ? 0.35 : 0.12) * (0.4 + k), burst ? 0.6 : 0.3, k, burst ? 0.05 : 0.03)
      if (burst && hash(seed, 9) < 0.35) { ctx.globalAlpha = 0.3; ctx.drawImage(ctx.canvas, Math.round(width * 0.012), 0); ctx.fillStyle = accent; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 }
      if (k > 0) hud(ctx, frame, atMs)
    }

    if (style === 'bands') {
      // Lines of noise in the theme's tones, the frame's own slices shifted beneath; in a burst the frame fills with them.
      const lines = burst ? Math.round(40 + k * 180) : Math.round(k * 40)
      for (let i = 0; i < lines; i += 1) {
        if (hash(seed, i, 13) < (burst ? 0.5 : 0.25)) { const y = Math.round(hash(seed, i, 11) * height), h = Math.max(1, Math.round(height * (0.001 + hash(seed, i, 12) * 0.006))); ctx.drawImage(ctx.canvas, 0, y, width, h, Math.round((hash(seed, i, 14) - 0.5) * width * (burst ? 0.5 : 0.2)), y, width, h) }
      }
      noiseLines(ctx, seed, lines, burst ? 0.9 : 0.7)
      if (k > 0) hud(ctx, frame, atMs)
    }

    if (style === 'sweep') {
      // Each pass of 1.8 s has its own kind: across, backwards, a part of the way, downwards, or none — the companions stay.
      const period = 1800, cycle = Math.floor(atMs / period), pos = (atMs % period) / period
      const q = hash(cycle, 80)
      const kind = q < 0.3 ? 'lr' : q < 0.5 ? 'rl' : q < 0.7 ? 'partial' : q < 0.85 ? 'down' : 'rest'
      const x0 = hash(cycle, 81) * width * 0.5, x1 = x0 + width * (0.25 + hash(cycle, 82) * 0.35)
      const run = Math.min(1, pos / 0.7)
      const lineX = kind === 'lr' ? run * width : kind === 'rl' ? (1 - run) * width : kind === 'partial' ? x0 + (x1 - x0) * run : -1
      const lineY = kind === 'down' ? run * height : -1
      const moving = pos < 0.7 && kind !== 'rest'
      const reach = Math.round((kind === 'down' ? height : width) * (0.06 + k * 0.22))
      const strips = Math.round(2 + k * 12)
      if (moving && k > 0) {
        if (kind === 'down') {
          // Rows near the line slide sideways, a few mirrored.
          for (let i = 0; i < strips; i += 1) {
            const rh = Math.round(height * (0.01 + hash(seed, i, 24) * 0.06)), ry = Math.round(lineY - reach + hash(seed, i, 25) * reach * 2)
            if (ry + rh < 0 || ry > height) continue
            const dx = Math.round((hash(seed, i, 26) - 0.5) * width * 0.35 * k)
            if (hash(seed, i, 27) < 0.2) { ctx.save(); ctx.translate(width / 2, ry + rh / 2); ctx.scale(-1, 1); ctx.drawImage(ctx.canvas, 0, ry, width, rh, -width / 2 + dx, -rh / 2, width, rh); ctx.restore() }
            else ctx.drawImage(ctx.canvas, 0, ry, width, rh, dx, ry, width, rh)
            if (hash(seed, i, 28) < 0.4) { ctx.globalAlpha = 0.7; ctx.fillStyle = hash(seed, i, 29) < 0.5 ? accent : CREAM; ctx.fillRect(0, ry, width, 2); ctx.globalAlpha = 1 }
          }
        } else {
          // Columns near the line slide up and down, a few mirrored, with hairlines of the theme.
          for (let i = 0; i < strips; i += 1) {
            const cw = Math.round(width * (0.01 + hash(seed, i, 24) * 0.08)), cx = Math.round(lineX - reach + hash(seed, i, 25) * reach * 2)
            if (cx + cw < 0 || cx > width) continue
            const dy = Math.round((hash(seed, i, 26) - 0.5) * height * 0.35 * k)
            if (hash(seed, i, 27) < 0.2) { ctx.save(); ctx.translate(cx + cw / 2, height / 2); ctx.scale(1, -1); ctx.drawImage(ctx.canvas, cx, 0, cw, height, -cw / 2, -height / 2 + dy, cw, height); ctx.restore() }
            else ctx.drawImage(ctx.canvas, cx, 0, cw, height, cx, dy, cw, height)
            if (hash(seed, i, 28) < 0.4) { ctx.globalAlpha = 0.7; ctx.fillStyle = hash(seed, i, 29) < 0.5 ? accent : CREAM; ctx.fillRect(cx, 0, 2, height); ctx.globalAlpha = 1 }
          }
        }
        // The companions: blocks of the picture echoed near the line, lines of noise around it.
        const blocks = Math.round(k * 3)
        for (let i = 0; i < blocks; i += 1) {
          const bw = Math.round(width * (0.08 + hash(cycle, i, 83) * 0.2)), bh = Math.round(height * (0.04 + hash(cycle, i, 84) * 0.12))
          const bx = kind === 'down' ? Math.round(hash(cycle, i, 85) * (width - bw)) : Math.round(Math.min(width - bw, Math.max(0, lineX + (hash(cycle, i, 85) - 0.5) * reach * 3)))
          const by = kind === 'down' ? Math.round(Math.min(height - bh, Math.max(0, lineY + (hash(cycle, i, 86) - 0.5) * reach * 3))) : Math.round(hash(cycle, i, 86) * (height - bh))
          block(ctx, pool[Math.floor(hash(cycle, i, 87) * pool.length)], bx, by, bw, bh, hash(cycle, i, 88) * 1000)
        }
        noiseLines(ctx, seed, Math.round(k * 8), 0.8, kind === 'down' ? Math.max(0, lineY - reach * 2) : 0, kind === 'down' ? Math.min(height, lineY + reach * 2) : height)
      }
      if (moving) {
        ctx.fillStyle = hash(cycle, 89) < 0.6 ? CREAM : accent
        if (kind === 'down') ctx.fillRect(0, Math.round(lineY), width, Math.max(2, Math.round(width * 0.004)))
        else ctx.fillRect(Math.round(lineX), 0, Math.max(2, Math.round(width * 0.004)), height)
      }
      if (burst) throwSlices(ctx, seed, 6, 0.2, 0.4, k)
    }

    if (style === 'collage') {
      // Blocks cut from the pictures, bordered, jumping every few frames: none at zero, a handful in the calm, more in a burst; the picture stays readable.
      const n = burst ? Math.round(3 + k * 12) : Math.round(k * 6)
      const step = burst ? 110 : 300
      const s3 = Math.floor(atMs / step)
      const grow = 0.6 + 0.4 * k
      for (let i = 0; i < n; i += 1) {
        const w = Math.round(width * (0.08 + hash(s3, i, 33) * 0.28) * grow), h = Math.round(height * (0.05 + hash(s3, i, 34) * 0.18) * grow)
        const x = Math.round(hash(s3, i, 35) * (width - w)), y = Math.round(hash(s3, i, 36) * (height - h))
        const q = hash(s3, i, 37)
        if (q < 0.1) { ctx.fillStyle = DEEP; ctx.fillRect(x, y, w, h); ctx.lineWidth = 2; ctx.strokeStyle = CREAM; ctx.strokeRect(x, y, w, h) }
        else if (q < 0.18) { ctx.fillStyle = tone(hash(s3, i, 38)); ctx.fillRect(x, y, w, h); ctx.lineWidth = 2; ctx.strokeStyle = DEEP; ctx.strokeRect(x, y, w, h) }
        else block(ctx, pool[Math.floor(hash(s3, i, 39) * pool.length)], x, y, w, h, hash(s3, i, 40) * 1000)
      }
      noiseLines(ctx, seed, Math.round(k * 6), 0.8)
      if (burst) throwSlices(ctx, seed, 6, 0.25, 0.3, k, 0.03)
    }

    if (style === 'feed') {
      // The picture in its framed card over its own darkened ground; now and then the feed rushes past, faster and oftener with the force.
      const g = coverRect(source)
      ctx.drawImage(source, g.x, g.y, g.w, g.h)
      ctx.fillStyle = input.background; ctx.globalAlpha = 0.6; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
      const cycle = 5000, t = (atMs % cycle) / cycle
      const rushLen = k <= 0.05 ? 0 : 0.1 + 0.2 * k
      const rushing = t < rushLen
      const cardW = Math.round(width * 0.7), cardH = Math.round(cardW * 1.25), gap = Math.round(height * 0.05)
      const cardX = Math.round((width - cardW) / 2)
      const frameCard = (x: number, y: number, src: CanvasImageSource) => {
        cover(ctx, src, x, y, cardW, cardH, 0.5, 0.5)
        ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.strokeRect(x - 3, y - 3, cardW + 6, cardH + 6)
        ctx.strokeStyle = CREAM; ctx.strokeRect(x + 3, y + 3, cardW - 6, cardH - 6)
      }
      if (rushing) {
        // The pictures pass, the speed falling as the second goes; a faint double at a high force.
        const ease = 1 - t / rushLen
        const offset = (ease * ease * height * (1.5 + 2 * k)) % (cardH + gap)
        for (let i = -1; i < 4; i += 1) {
          const y = Math.round(i * (cardH + gap) - offset + height * 0.1)
          const src = pool[(i + 4) % pool.length]
          if (k > 0.6) { ctx.globalAlpha = 0.25; frameCard(cardX, y + Math.round(ease * 30), src); ctx.globalAlpha = 1 }
          frameCard(cardX, y, src)
        }
        throwSlices(ctx, seed, Math.round(k * 6), 0.25, 0.3, k, 0.02)
      } else {
        const settle = rushLen ? Math.min(1, (t - rushLen) / 0.08) : 1
        const y = Math.round((height - cardH) / 2 + (1 - settle) * height * 0.25)
        frameCard(cardX, y, source)
        if (burst) throwSlices(ctx, seed, 4, 0.2, 0.3, k, 0.03)
      }
    }

    if (style === 'letters') {
      // The filter: the slide's words, the wordmark, or the brand block, in giant letters open on the pictures; the ground is the picture, darkened as much as the letters are dense.
      const la = Math.min(1, Math.max(0, input.letterAlpha ?? 0.7))
      const g = coverRect(source)
      ctx.drawImage(source, g.x, g.y, g.w, g.h)
      ctx.fillStyle = input.background; ctx.globalAlpha = Math.max(0, 0.2 + 0.55 * la - (burst ? 0.15 : 0)); ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
      // The three filters take turns every 1.8 s, so a clip of a few seconds shows them all; the first is drawn by hash.
      const seg = Math.floor(atMs / 1800)
      const modes: Array<'text' | 'wordmark' | 'block'> = input.text?.trim() ? ['text', 'wordmark', 'text', 'block'] : ['wordmark', 'block']
      const mode = modes[(seg + Math.floor(hash(0, 70) * modes.length)) % modes.length]
      const copies = 1 + Math.round(k * 3)
      const s3 = Math.floor(atMs / (burst ? 120 : 400))
      const drift = Math.sin(atMs / 700)
      for (let ci = 0; ci < copies; ci += 1) {
        const scale = ci === 0 ? 1 : 0.35 + hash(seg, ci, 71) * 0.35
        const zone = hash(seg, ci, 72)
        const cy = ci === 0 && zone < 0.5 ? height / 2 : height * (zone < 0.33 ? 0.22 : zone < 0.66 ? 0.5 : 0.78)
        const qa = hash(seg, ci, 73)
        const align = ci === 0 && qa < 0.5 ? 'center' : qa < 0.33 ? 'left' : qa < 0.66 ? 'center' : 'right'
        const dx = burst ? Math.round((hash(s3, ci, 54) - 0.5) * width * 0.3) : Math.round(drift * height * 0.01 * (ci % 2 ? -1 : 1))
        const bounds = stamp(mode, scale, cy, align)
        const alpha = ci === 0 ? la : la * 0.6
        // The shadow copies, deep then the accent, then the shapes in cream, then the pictures through some of them.
        ctx.globalAlpha = alpha
        ctx.drawImage(tinted(DEEP), dx + Math.round(width * 0.012), Math.round(height * 0.006))
        if (burst) ctx.drawImage(tinted(accent), dx - Math.round(width * 0.006), -Math.round(height * 0.003))
        ctx.drawImage(scratch, dx, 0)
        if (ci === 0 || burst) {
          const src = pool[Math.floor(hash(seg, ci, 56) * pool.length)]
          s.globalCompositeOperation = 'source-in'
          cover(s, src, 0, 0, width, height, hash(seg, ci, 57), hash(seg, ci, 58), 1.5)
          s.globalCompositeOperation = 'source-over'
          for (let i = 0; i < 2 + Math.round(k * 3); i += 1) {
            const w = Math.round(bounds.w * (0.2 + hash(s3, ci, i, 59) * 0.5)), h = Math.round(bounds.h * (0.3 + hash(s3, ci, i, 60) * 0.7))
            const x = Math.round(bounds.x + hash(s3, ci, i, 61) * Math.max(0, bounds.w - w)), y = Math.round(bounds.y + hash(s3, ci, i, 62) * Math.max(0, bounds.h - h))
            ctx.drawImage(scratch, x, y, w, h, x + dx, y, w, h)
          }
        }
        ctx.globalAlpha = 1
      }
      noiseLines(ctx, seed, Math.round(k * 10), 0.8)
      if (burst) throwSlices(ctx, seed, Math.round(2 + k * 8), 0.5, 0.3, k, 0.12)
    }

    if (onTop) {
      // The picture itself, untouched, over the animation.
      ctx.save()
      if (input.clip) { ctx.beginPath(); ctx.rect(input.clip.x, input.clip.y, input.clip.w, input.clip.h); ctx.clip() }
      ctx.drawImage(source, input.rect.x, input.rect.y, input.rect.w, input.rect.h)
      ctx.restore()
    }

    const overlay = input.overlays[variant] ?? input.overlays[0]
    if (overlay) ctx.drawImage(overlay, 0, 0, width, height)
  }
}
