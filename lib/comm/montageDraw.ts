/**
 * One drawer for the moving slide, used by the live preview and by the
 * recording alike, so what is seen is what is exported. Seven animations,
 * the first the site's own, the six others after the owner's references:
 *   random   bands of the picture shifted, the engine's lines over it;
 *   slices   horizontal slices of the picture thrown sideways, fringed in the theme's colours;
 *   bands    lines of noise in the theme's colours over the frame, the picture through;
 *   sweep    a fine line passes — across, backwards, downwards, part of the way — leaving a mirrored trail,
 *            the strips it touches shifted a little, ectoplasms drifting beside it;
 *   collage  the picture cut in rows; in some rows, blocks of the picture itself slide sideways, thinly framed;
 *   feed     the picture in a framed card under a camera's interface; now and then the feed scrolls one card;
 *   letters  a filter of giant letters — the slide's words, the wordmark or the brand block — open on the picture.
 * Only the slide's own picture is ever drawn: nothing from elsewhere appears without its source.
 * The force goes from nothing (the picture alone) to a lot, and the picture stays readable at the top.
 * With cleanOnTop the animation is the ground and the picture sits on it untouched, in a window of the
 * screen's shape with a margin around it, zoomed as the curator wants.
 * No gradient, no blur, no RGB: the colours are the theme's — cream, deep, the accent and their mixes.
 * Every number comes from a hash, so a frame is the same twice.
 */

export type GlitchStyle = 'random' | 'slices' | 'bands' | 'sweep' | 'collage' | 'feed' | 'letters'
export const GLITCH_STYLES: Array<{ key: GlitchStyle; name: string; hint: string }> = [
  { key: 'random', name: 'Random', hint: 'rafales, bandes, morceaux de l’image' },
  { key: 'slices', name: 'Tranches', hint: 'tranches horizontales jetées de côté, franges aux couleurs du thème' },
  { key: 'bands', name: 'Bandes', hint: 'des lignes de bruit aux couleurs du thème, l’image à travers' },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne fine passe — en travers, à rebours, vers le bas, en partie — et laisse une trace en miroir ; des ectoplasmes dérivent à côté' },
  { key: 'collage', name: 'Collage', hint: 'l’image coupée en rangées ; dans certaines, des blocs de l’image glissent, finement encadrés' },
  { key: 'feed', name: 'Défilé', hint: 'l’image dans une carte sous l’interface d’une caméra ; de temps en temps le fil défile d’une carte' },
  { key: 'letters', name: 'Lettres', hint: 'un filtre de lettres géantes — ton texte, RANDOM ou le bloc marque — ouvert sur l’image' },
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
  /** The slide's words and the typeface for the letters. */
  text?: string
  titleFont?: string
  /** The animation fills the frame as a ground; the picture is drawn clean on top, covering its clip, zoomed. */
  cleanOnTop?: boolean
  zoom?: number
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

/** An organic blob path — the ectoplasm — around a centre, breathing with time. */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number, t: number) {
  const n = 7 + Math.floor(hash(seed, 1) * 3)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2
    const rr = r * (0.7 + hash(seed, i, 2) * 0.5 + Math.sin(t * 2.1 + i * 1.7 + seed) * 0.12)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (0.75 + hash(seed, 3) * 0.5)])
  }
  ctx.beginPath()
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
    if (i === 0) ctx.moveTo(mx, my)
    const [x2, y2] = pts[(i + 2) % n]
    ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2)
  }
  ctx.closePath()
}

export function createDrawer(input: DrawerInput) {
  const { width, height } = input
  const accent = input.accent
  /** The theme's tones: the accent, cream, deep, and their mixes. */
  const TONES = [accent, CREAM, DEEP, mix(accent, DEEP, 0.45), mix(accent, CREAM, 0.5)]
  const tone = (q: number) => TONES[Math.floor(q * TONES.length)]
  const family = input.titleFont ?? 'Tomorrow, sans-serif'
  const scratch = document.createElement('canvas'); scratch.width = width; scratch.height = height
  const s = scratch.getContext('2d')!
  const scratch2 = document.createElement('canvas'); scratch2.width = width; scratch2.height = height
  const s2 = scratch2.getContext('2d')!
  const px = Math.max(1, Math.round(width / 1080))

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
  /** Fine hairlines, a pixel or two, in cream or the accent. */
  const hairlines = (ctx: CanvasRenderingContext2D, seed: number, n: number, vertical: boolean, from: number, to: number) => {
    for (let i = 0; i < n; i += 1) {
      const p = Math.round(from + hash(seed, i, 90) * (to - from))
      const len = Math.round((vertical ? height : width) * (0.1 + hash(seed, i, 91) * 0.6)), start = Math.round(hash(seed, i, 92) * ((vertical ? height : width) - len))
      ctx.fillStyle = hash(seed, i, 93) < 0.5 ? CREAM : accent; ctx.globalAlpha = 0.5 + hash(seed, i, 94) * 0.4
      if (vertical) ctx.fillRect(p, start, px, len); else ctx.fillRect(start, p, len, px)
    }
    ctx.globalAlpha = 1
  }
  /** The camera's interface: a status bar, the counters, REC blinking, the corner brackets. Thin. */
  const cam = (ctx: CanvasRenderingContext2D, frame: number, atMs: number, rec: boolean) => {
    ctx.save(); ctx.fillStyle = CREAM; ctx.font = `${Math.round(width * 0.02)}px "Inter Tight", monospace`; ctx.textBaseline = 'top'
    const t = Math.floor(atMs / 1000)
    ctx.fillText(`17:${String(13 + t).padStart(2, '0')}`, Math.round(width * 0.04), Math.round(height * 0.025))
    ctx.fillText(`${String(140 + (frame % 30)).padStart(3, '0')}  F R N`, Math.round(width * 0.78), Math.round(height * 0.025))
    for (let i = 0; i < 4; i += 1) ctx.fillRect(Math.round(width * 0.62) + i * 7 * px, Math.round(height * 0.025) + (3 - i) * 3 * px, 4 * px, (i + 1) * 3 * px)
    ctx.strokeStyle = CREAM; ctx.lineWidth = px; ctx.strokeRect(Math.round(width * 0.68), Math.round(height * 0.027), 22 * px, 10 * px); ctx.fillRect(Math.round(width * 0.68) + 2 * px, Math.round(height * 0.027) + 2 * px, 14 * px, 6 * px)
    if (rec && Math.floor(atMs / 500) % 2 === 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(Math.round(width * 0.04) + 5 * px, Math.round(height * 0.07), 5 * px, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CREAM; ctx.fillText('REC', Math.round(width * 0.04) + 14 * px, Math.round(height * 0.07) - 8 * px) }
    ctx.strokeStyle = hash(frame, 22) < 0.5 ? accent : CREAM; ctx.lineWidth = Math.max(1, Math.round(width * 0.002))
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
  /** An ectoplasm: through the blob, the picture displaced (and mirrored now and then), a fine outline around it. */
  const ectoplasm = (ctx: CanvasRenderingContext2D, source: CanvasImageSource, cx: number, cy: number, r: number, seed: number, atMs: number) => {
    const g = coverRect(source)
    ctx.save(); blobPath(ctx, cx, cy, r, seed, atMs / 1000); ctx.clip()
    const dx = Math.round((hash(seed, 95) - 0.5) * width * 0.2), dy = Math.round((hash(seed, 96) - 0.5) * height * 0.08)
    if (hash(seed, 97) < 0.4) { ctx.translate(width, 0); ctx.scale(-1, 1); ctx.drawImage(source, g.x - dx, g.y + dy, g.w, g.h) }
    else ctx.drawImage(source, g.x + dx, g.y + dy, g.w, g.h)
    ctx.restore()
    ctx.save(); blobPath(ctx, cx, cy, r, seed, atMs / 1000); ctx.strokeStyle = hash(seed, 98) < 0.6 ? CREAM : accent; ctx.lineWidth = 1.5 * px; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.restore()
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
      if (k > 0) cam(ctx, frame, atMs, false)
    }

    if (style === 'bands') {
      // Lines of noise in the theme's tones, the frame's own slices shifted beneath; in a burst the frame fills with them.
      const lines = burst ? Math.round(40 + k * 180) : Math.round(k * 40)
      for (let i = 0; i < lines; i += 1) {
        if (hash(seed, i, 13) < (burst ? 0.5 : 0.25)) { const y = Math.round(hash(seed, i, 11) * height), h = Math.max(1, Math.round(height * (0.001 + hash(seed, i, 12) * 0.006))); ctx.drawImage(ctx.canvas, 0, y, width, h, Math.round((hash(seed, i, 14) - 0.5) * width * (burst ? 0.5 : 0.2)), y, width, h) }
      }
      noiseLines(ctx, seed, lines, burst ? 0.9 : 0.7)
      if (k > 0) cam(ctx, frame, atMs, false)
    }

    if (style === 'sweep') {
      // Each pass of 2.2 s has its own way: across, backwards, downwards, a part of the way, or a pause.
      const period = 2200, cycle = Math.floor(atMs / period), pos = (atMs % period) / period
      const q = hash(cycle, 80)
      const kind = q < 0.3 ? 'lr' : q < 0.5 ? 'rl' : q < 0.7 ? 'down' : q < 0.88 ? 'partial' : 'rest'
      const x0 = hash(cycle, 81) * width * 0.5, x1 = x0 + width * (0.25 + hash(cycle, 82) * 0.35)
      const run = Math.min(1, pos / 0.75)
      const vertical = kind !== 'down'
      const line = kind === 'lr' ? run * width : kind === 'rl' ? (1 - run) * width : kind === 'partial' ? x0 + (x1 - x0) * run : run * height
      const moving = pos < 0.75 && kind !== 'rest'
      const ahead = kind === 'rl' ? -1 : 1
      if (moving && k > 0) {
        // The trail: behind the line, a narrow band of the picture in a mirror, its strips shifted a little.
        const trail = Math.round((vertical ? width : height) * (0.03 + k * 0.12))
        ctx.save()
        if (vertical) {
          const tx = Math.round(ahead > 0 ? line - trail : line), tw = trail
          ctx.beginPath(); ctx.rect(tx, 0, tw, height); ctx.clip()
          ctx.translate(2 * line, 0); ctx.scale(-1, 1); ctx.drawImage(ctx.canvas, 0, 0)
        } else {
          ctx.beginPath(); ctx.rect(0, Math.round(line - trail), width, trail); ctx.clip()
          ctx.translate(0, 2 * line); ctx.scale(1, -1); ctx.drawImage(ctx.canvas, 0, 0)
        }
        ctx.restore()
        // The strips the line touches, shifted a little, a few a lot.
        const strips = Math.round(1 + k * 7)
        for (let i = 0; i < strips; i += 1) {
          const big = hash(seed, i, 27) < 0.15
          const d = Math.round(((hash(seed, i, 26) - 0.5) * (big ? 0.25 : 0.05)) * (vertical ? height : width) * (0.4 + k))
          if (vertical) {
            const cw = Math.round(width * (0.004 + hash(seed, i, 24) * 0.03)), cx = Math.round(line - trail + hash(seed, i, 25) * trail * 2)
            if (cx + cw > 0 && cx < width) ctx.drawImage(ctx.canvas, cx, 0, cw, height, cx, d, cw, height)
          } else {
            const rh = Math.round(height * (0.004 + hash(seed, i, 24) * 0.03)), ry = Math.round(line - trail + hash(seed, i, 25) * trail * 2)
            if (ry + rh > 0 && ry < height) ctx.drawImage(ctx.canvas, 0, ry, width, rh, d, ry, width, rh)
          }
        }
        // The ectoplasms drifting beside the line, and fine hairlines along it.
        const blobs = k < 0.3 ? 0 : 1 + Math.round(hash(cycle, 83) * k * 2)
        for (let i = 0; i < blobs; i += 1) {
          const along = hash(cycle, i, 84), side = (hash(cycle, i, 85) - 0.5) * 2
          const rr = Math.round(width * (0.05 + hash(cycle, i, 86) * 0.1 * (0.5 + k)))
          const cx = vertical ? line + side * trail * 1.5 - ahead * rr * 0.6 : along * width
          const cy = vertical ? along * height : line - rr * 0.6 + side * trail
          ectoplasm(ctx, source, cx, cy, rr, cycle * 10 + i, atMs)
        }
        hairlines(ctx, seed, Math.round(1 + k * 5), vertical, Math.max(0, line - trail * 2), Math.min(vertical ? width : height, line + trail))
      }
      if (moving) {
        // The line itself, thin, with a fainter twin a few pixels behind.
        const ink = hash(cycle, 89) < 0.6 ? CREAM : accent
        ctx.fillStyle = ink
        if (vertical) { ctx.fillRect(Math.round(line), 0, 2 * px, height); ctx.globalAlpha = 0.45; ctx.fillRect(Math.round(line - ahead * 6 * px), 0, px, height) }
        else { ctx.fillRect(0, Math.round(line), width, 2 * px); ctx.globalAlpha = 0.45; ctx.fillRect(0, Math.round(line - 6 * px), width, px) }
        ctx.globalAlpha = 1
      }
      if (burst) throwSlices(ctx, seed, 3, 0.12, 0.4, k, 0.02)
    }

    if (style === 'collage') {
      // The frame in rows; in the rows awake, blocks of the picture itself slide sideways, thinly framed, over their own row.
      const rows = 5 + Math.round(k * 4)
      const rowH = height / rows
      const epoch = Math.floor(atMs / 2600)
      const g = coverRect(source)
      for (let ri = 0; ri < rows; ri += 1) {
        // A row wakes for an epoch when the force says so; the pieces glide across it at their own speed.
        const awake = hash(epoch, ri, 30) < k * 0.8
        if (!awake) continue
        const pieces = 1 + Math.round(hash(epoch, ri, 31) * (1 + k * 2))
        const y = Math.round(ri * rowH), h = Math.round(rowH * (0.4 + hash(epoch, ri, 32) * 0.6))
        const yy = y + Math.round(hash(epoch, ri, 33) * (rowH - h))
        for (let pi = 0; pi < pieces; pi += 1) {
          const w = Math.round(width * (0.12 + hash(epoch, ri, pi, 34) * 0.3))
          const speed = (hash(epoch, ri, pi, 35) - 0.5) * width * (0.15 + k * 0.5) / 1000
          const x = Math.round(((hash(epoch, ri, pi, 36) * (width + w) + speed * (atMs % 2600)) % (width + w) + width + w) % (width + w) - w)
          // The piece: the same row of the picture, taken elsewhere along it.
          const srcX = Math.round(hash(epoch, ri, pi, 37) * (width - w))
          ctx.save(); ctx.beginPath(); ctx.rect(x, yy, w, h); ctx.clip()
          ctx.drawImage(source, g.x + (x - srcX), g.y, g.w, g.h)
          ctx.restore()
          ctx.lineWidth = px; ctx.strokeStyle = hash(epoch, ri, pi, 38) < 0.6 ? CREAM : DEEP; ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, h - 1)
          if (hash(epoch, ri, pi, 39) < 0.25) { ctx.fillStyle = tone(hash(epoch, ri, pi, 40)); ctx.fillRect(x, yy + h - 2 * px, w, 2 * px) }
        }
      }
      hairlines(ctx, seed, Math.round(k * 4), false, 0, height)
      if (burst) throwSlices(ctx, seed, 4, 0.2, 0.3, k, 0.02)
    }

    if (style === 'feed') {
      // The picture in a framed card over its own darkened ground, under the camera's interface; now and then the feed scrolls one card.
      const g = coverRect(source)
      ctx.drawImage(source, g.x, g.y, g.w, g.h)
      ctx.fillStyle = input.background; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
      const cardW = Math.round(width * 0.74), cardH = Math.round(cardW * 1.3), gap = Math.round(height * 0.05)
      const cardX = Math.round((width - cardW) / 2), restY = Math.round((height - cardH) / 2)
      const frameCard = (y: number, fy: number) => {
        cover(ctx, source, cardX, y, cardW, cardH, 0.5, fy)
        ctx.lineWidth = px; ctx.strokeStyle = CREAM; ctx.strokeRect(cardX - 2 * px + 0.5, y - 2 * px + 0.5, cardW + 4 * px, cardH + 4 * px)
        ctx.strokeStyle = accent; ctx.strokeRect(cardX + 2 * px + 0.5, y + 2 * px + 0.5, cardW - 4 * px, cardH - 4 * px)
      }
      const cycle = 4500, t = (atMs % cycle) / cycle
      const scrollLen = k <= 0.05 ? 0 : 0.16 - k * 0.06
      if (t < scrollLen) {
        // One scroll: the card leaves upward, the next one (the picture again, framed elsewhere) takes its place.
        const e = t / scrollLen, ease = 1 - (1 - e) * (1 - e)
        const dy = Math.round(ease * (cardH + gap))
        frameCard(restY - dy, 0.5)
        frameCard(restY - dy + cardH + gap, 0.2 + hash(Math.floor(atMs / cycle), 50) * 0.6)
        if (k > 0.5) { ctx.globalAlpha = 0.3; ctx.drawImage(ctx.canvas, 0, Math.round(-(1 - ease) * 24 * px * k)); ctx.globalAlpha = 1 }
        hairlines(ctx, seed, Math.round(k * 4), false, 0, height)
        throwSlices(ctx, seed, Math.round(k * 4), 0.15, 0.3, k, 0.015)
      } else {
        frameCard(restY, 0.5)
        if (burst) throwSlices(ctx, seed, 3, 0.12, 0.3, k, 0.02)
      }
      if (k > 0) cam(ctx, frame, atMs, true)
    }

    if (style === 'letters') {
      // The filter: the slide's words, the wordmark, or the brand block, in giant letters open on the picture; the ground is the picture, darkened as much as the letters cover it.
      const la = Math.min(1, Math.max(0, input.letterAlpha ?? 0.7))
      const g = coverRect(source)
      ctx.drawImage(source, g.x, g.y, g.w, g.h)
      ctx.fillStyle = input.background; ctx.globalAlpha = Math.max(0, 0.15 + 0.6 * la - (burst ? 0.15 : 0)); ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
      // The three filters take turns every 1.8 s, so a clip of a few seconds shows them all; the first is drawn by hash.
      const seg = Math.floor(atMs / 1800)
      const modes: Array<'text' | 'wordmark' | 'block'> = input.text?.trim() ? ['text', 'wordmark', 'text', 'block'] : ['wordmark', 'block']
      const mode = modes[(seg + Math.floor(hash(0, 70) * modes.length)) % modes.length]
      // Placed in the upper two thirds, clear of the slide's own text below.
      const zone = hash(seg, 72), qa = hash(seg, 73)
      const cy = height * (zone < 0.5 ? 0.4 : zone < 0.75 ? 0.22 : 0.5)
      const align = qa < 0.5 ? 'center' : qa < 0.75 ? 'left' : 'right'
      const s3 = Math.floor(atMs / (burst ? 120 : 400))
      const dx = burst ? Math.round((hash(s3, 54) - 0.5) * width * 0.3) : 0
      const bounds = stamp(mode, 1, cy, align)
      // The shapes, with a hard deep shadow, composed once and laid down as one crisp layer.
      s2.clearRect(0, 0, width, height); s2.globalCompositeOperation = 'source-over'
      s2.drawImage(scratch, Math.round(width * 0.012), Math.round(height * 0.006))
      s2.globalCompositeOperation = 'source-in'; s2.fillStyle = DEEP; s2.fillRect(0, 0, width, height); s2.globalCompositeOperation = 'source-over'
      s2.drawImage(scratch, 0, 0)
      ctx.globalAlpha = la; ctx.drawImage(scratch2, dx, 0); ctx.globalAlpha = 1
      // The picture through some of the letters: windows cut in the shapes.
      s.globalCompositeOperation = 'source-in'
      cover(s, source, 0, 0, width, height, hash(seg, 57), hash(seg, 58), 1.5)
      s.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 2 + Math.round(k * 3); i += 1) {
        const w = Math.round(bounds.w * (0.2 + hash(s3, i, 59) * 0.5)), h = Math.round(bounds.h * (0.3 + hash(s3, i, 60) * 0.7))
        const x = Math.round(bounds.x + hash(s3, i, 61) * Math.max(0, bounds.w - w)), y = Math.round(bounds.y + hash(s3, i, 62) * Math.max(0, bounds.h - h))
        ctx.drawImage(scratch, x, y, w, h, x + dx, y, w, h)
      }
      // With the force, the filter repeats: smaller deep silhouettes elsewhere, and the lines.
      const echoes = Math.round(k * 2)
      for (let ci = 1; ci <= echoes; ci += 1) {
        const ecy = height * (0.15 + hash(seg, ci, 74) * 0.7)
        const ealign = hash(seg, ci, 75) < 0.5 ? 'left' : 'right'
        stamp(mode, 0.3 + hash(seg, ci, 76) * 0.25, ecy, ealign)
        s2.clearRect(0, 0, width, height); s2.drawImage(scratch, 0, 0); s2.globalCompositeOperation = 'source-in'; s2.fillStyle = hash(seg, ci, 77) < 0.6 ? DEEP : accent; s2.fillRect(0, 0, width, height); s2.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = Math.min(1, la + 0.2); ctx.drawImage(scratch2, 0, 0); ctx.globalAlpha = 1
      }
      noiseLines(ctx, seed, Math.round(k * 8), 0.8)
      if (burst) throwSlices(ctx, seed, Math.round(2 + k * 8), 0.5, 0.3, k, 0.12)
    }

    if (onTop) {
      // The picture itself, untouched, in its window over the animation, zoomed as wanted.
      const win = input.clip ?? input.rect
      ctx.save(); ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip()
      cover(ctx, source, win.x, win.y, win.w, win.h, 0.5, 0.5, Math.max(1, input.zoom ?? 1))
      ctx.restore()
      // A fine cream edge, so the window reads as one over a ground made of the same picture.
      ctx.lineWidth = 1.5 * px; ctx.strokeStyle = CREAM; ctx.globalAlpha = 0.9; ctx.strokeRect(win.x + 0.5, win.y + 0.5, win.w - 1, win.h - 1); ctx.globalAlpha = 1
    }

    const overlay = input.overlays[variant] ?? input.overlays[0]
    if (overlay) ctx.drawImage(overlay, 0, 0, width, height)
  }
}
