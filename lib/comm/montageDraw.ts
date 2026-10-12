/**
 * One drawer for the moving slide, used by the live preview and by the
 * recording alike, so what is seen is what is exported. Seven animations,
 * the first the site's own, the six others after the owner's references:
 *   random   bands of the picture shifted, the engine's lines over it;
 *   slices   horizontal slices of the picture thrown sideways, cyan and magenta fringes;
 *   bands    the whole frame flooded with dense coloured noise lines, the picture through;
 *   sweep    a bright vertical line crossing, the columns it touches sliding up and down;
 *   collage  blocks cut from the picture and from the queue's other pictures, tiled, jumping;
 *   feed     framed cards of the pictures rushing upward like a feed, then settling;
 *   letters  the slide's words huge, cut in bands, re-ordered, doubled with shadows, filled with pictures.
 * Every number comes from a hash, so a frame is the same twice.
 */

export type GlitchStyle = 'random' | 'slices' | 'bands' | 'sweep' | 'collage' | 'feed' | 'letters'
export const GLITCH_STYLES: Array<{ key: GlitchStyle; name: string; hint: string }> = [
  { key: 'random', name: 'Random', hint: 'rafales, bandes, morceaux de l’image' },
  { key: 'slices', name: 'Tranches', hint: 'tranches horizontales jetées de côté, franges cyan et magenta' },
  { key: 'bands', name: 'Bandes', hint: 'tout l’écran noyé de lignes de bruit colorées' },
  { key: 'sweep', name: 'Balayage', hint: 'une ligne verticale traverse, les colonnes glissent' },
  { key: 'collage', name: 'Collage', hint: 'des blocs découpés dans les images, qui sautent' },
  { key: 'feed', name: 'Défilé', hint: 'des cartes encadrées qui remontent à toute vitesse' },
  { key: 'letters', name: 'Lettres', hint: 'le texte géant, coupé, réordonné, doublé d’ombres' },
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

const CREAM = '#F8F5E6', DEEP = '#121210', CYAN = '#00e5ff', MAGENTA = '#ff2bd6'
const POP = ['#00e5ff', '#ff2bd6', '#39ff14', '#ffe600', '#ffffff', '#ff5a1f']

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

/** The fringes of a torn edge: a hairline of cyan above, magenta below. */
function fringe(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
  ctx.globalAlpha = 0.5 + k * 0.4
  ctx.fillStyle = CYAN; ctx.fillRect(x, y - 2, w, 2)
  ctx.fillStyle = MAGENTA; ctx.fillRect(x, y + h, w, 2)
  ctx.globalAlpha = 1
}

export function createDrawer(input: DrawerInput) {
  const { width, height } = input
  const extras = input.extras ?? []
  const hud = (ctx: CanvasRenderingContext2D, frame: number, atMs: number) => {
    ctx.save(); ctx.fillStyle = CREAM; ctx.font = `${Math.round(width * 0.02)}px "Inter Tight", monospace`; ctx.textBaseline = 'top'
    const t = Math.floor(atMs / 1000)
    ctx.fillText(`17:${String(13 + t).padStart(2, '0')}  ${String(140 + (frame % 30)).padStart(3, '0')}`, Math.round(width * 0.04), Math.round(height * 0.025))
    ctx.fillText('F R N', Math.round(width * 0.9), Math.round(height * 0.06))
    ctx.strokeStyle = hash(frame, 22) < 0.5 ? input.accent : CREAM; ctx.lineWidth = Math.max(2, Math.round(width * 0.003))
    const m = Math.round(width * 0.035), l = Math.round(width * 0.05)
    for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]] as const) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke() }
    ctx.restore()
  }

  return (ctx: CanvasRenderingContext2D, source: CanvasImageSource, atMs: number, schedule: Slot[], frame: number) => {
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
    ctx.fillStyle = input.background; ctx.fillRect(0, 0, width, height)
    if (input.ground) {
      const { w: sw, h: sh } = sizeOf(source, width, height)
      const scale = Math.max(width / sw, height / sh)
      const gw = Math.round(sw * scale), gh = Math.round(sh * scale)
      ctx.drawImage(source, Math.round((width - gw) / 2), Math.round((height - gh) / 2), gw, gh)
      ctx.fillStyle = input.background; ctx.globalAlpha = 0.72; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
    }
    const r = input.rect, c = input.clip ?? { x: 0, y: 0, w: width, h: height }
    const slot = schedule.find((s) => atMs < s.until)
    const variant = slot?.variant ?? 0
    const k = input.intensity
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
      // Calm: slices always on the move, a few fringed. Burst: the frame cut in many slices thrown far, fringed.
      const n = burst ? Math.round(10 + k * 30) : Math.round(2 + k * 10)
      for (let i = 0; i < n; i += 1) {
        const sh = Math.max(2, Math.round(height * (0.003 + hash(seed, i, 5) * (burst ? 0.05 : 0.03))))
        const y = Math.round(hash(seed, i, 6) * (height - sh))
        const shift = Math.round((hash(seed, i, 7) - 0.5) * width * (burst ? 0.35 : 0.12) * (0.4 + k))
        ctx.drawImage(ctx.canvas, 0, y, width, sh, shift, y, width, sh)
        if (hash(seed, i, 8) < (burst ? 0.6 : 0.3)) fringe(ctx, 0, y, width, sh, k)
      }
      if (burst && hash(seed, 9) < 0.35) { ctx.globalAlpha = 0.35; ctx.drawImage(ctx.canvas, Math.round(width * 0.012), 0); ctx.fillStyle = CYAN; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 }
      hud(ctx, frame, atMs)
    }

    if (style === 'bands') {
      // Lines of coloured noise all the time, the frame's own slices shifted beneath; in a burst the frame drowns in them.
      const lines = burst ? Math.round(80 + k * 160) : Math.round(6 + k * 44)
      for (let i = 0; i < lines; i += 1) {
        const y = Math.round(hash(seed, i, 11) * height), h = Math.max(1, Math.round(height * (0.001 + hash(seed, i, 12) * 0.006)))
        if (hash(seed, i, 13) < (burst ? 0.5 : 0.25)) ctx.drawImage(ctx.canvas, 0, y, width, h, Math.round((hash(seed, i, 14) - 0.5) * width * (burst ? 0.5 : 0.2)), y, width, h)
        const x = Math.round(hash(seed, i, 15) * width * 0.7), w = Math.round(width * (0.05 + hash(seed, i, 16) * 0.95))
        const q = hash(seed, i, 17)
        ctx.fillStyle = q < 0.25 ? DEEP : q < 0.4 ? CREAM : POP[Math.floor(hash(seed, i, 18) * POP.length)]
        ctx.globalAlpha = burst ? 0.55 + hash(seed, i, 19) * 0.45 : 0.6
        ctx.fillRect(x, y, w, h)
        if (burst && hash(seed, i, 20) < 0.3) for (let j = 0; j < 12; j += 1) { ctx.fillStyle = POP[Math.floor(hash(seed, i, j, 21) * POP.length)]; ctx.fillRect(x + hash(seed, i, j, 22) * w, y, 2 + hash(seed, i, j, 23) * 6, h) }
      }
      ctx.globalAlpha = 1
      hud(ctx, frame, atMs)
    }

    if (style === 'sweep') {
      // A bright line crosses every 1.4 s; the columns it passes slide up and down, some mirrored, with vertical fringes.
      const period = 1400, pos = (atMs % period) / period
      const lineX = Math.round(pos * width)
      const reach = Math.round(width * (0.08 + k * 0.25))
      const cols = Math.round(4 + k * 14)
      for (let i = 0; i < cols; i += 1) {
        const cw = Math.round(width * (0.01 + hash(seed, i, 24) * 0.08))
        const cx = Math.round(lineX - reach + hash(seed, i, 25) * reach * 2)
        if (cx + cw < 0 || cx > width) continue
        const dy = Math.round((hash(seed, i, 26) - 0.5) * height * 0.4 * k)
        if (hash(seed, i, 27) < 0.2) { ctx.save(); ctx.translate(cx + cw / 2, height / 2); ctx.scale(1, -1); ctx.drawImage(ctx.canvas, cx, 0, cw, height, -cw / 2, -height / 2 + dy, cw, height); ctx.restore() }
        else ctx.drawImage(ctx.canvas, cx, 0, cw, height, cx, dy, cw, height)
        if (hash(seed, i, 28) < 0.4) { ctx.globalAlpha = 0.7; ctx.fillStyle = hash(seed, i, 29) < 0.5 ? CYAN : MAGENTA; ctx.fillRect(cx, 0, 2, height); ctx.globalAlpha = 1 }
      }
      ctx.fillStyle = CREAM; ctx.fillRect(lineX, 0, Math.max(2, Math.round(width * 0.004)), height)
      if (burst) for (let i = 0; i < 6; i += 1) { const sh = Math.round(height * (0.01 + hash(seed, i, 30) * 0.05)), y = Math.round(hash(seed, i, 31) * (height - sh)); ctx.drawImage(ctx.canvas, 0, y, width, sh, Math.round((hash(seed, i, 32) - 0.5) * width * 0.2), y, width, sh) }
    }

    if (style === 'collage') {
      // Blocks cut from the pictures, tiled in a loose grid, bordered, jumping every few frames; thick in a burst, a handful otherwise.
      const n = burst ? Math.round(14 + k * 30) : Math.round(4 + k * 10)
      const step = burst ? 90 : 220
      const s2 = Math.floor(atMs / step)
      for (let i = 0; i < n; i += 1) {
        const w = Math.round(width * (0.1 + hash(s2, i, 33) * 0.45)), h = Math.round(height * (0.05 + hash(s2, i, 34) * 0.28))
        const x = Math.round(hash(s2, i, 35) * (width - w)), y = Math.round(hash(s2, i, 36) * (height - h))
        const q = hash(s2, i, 37)
        if (q < 0.12) { ctx.fillStyle = DEEP; ctx.fillRect(x, y, w, h) }
        else if (q < 0.2) { ctx.fillStyle = POP[Math.floor(hash(s2, i, 38) * POP.length)]; ctx.fillRect(x, y, w, h) }
        else {
          const src = pool[Math.floor(hash(s2, i, 39) * pool.length)]
          cover(ctx, src, x, y, w, h, hash(s2, i, 40), hash(s2, i, 41), 1 + hash(s2, i, 42) * 2)
        }
        ctx.lineWidth = 2 + Math.round(hash(s2, i, 43) * 3); ctx.strokeStyle = hash(s2, i, 44) < 0.5 ? DEEP : CREAM; ctx.strokeRect(x, y, w, h)
      }
      if (burst) for (let i = 0; i < 10; i += 1) { const sh = Math.round(height * (0.004 + hash(seed, i, 45) * 0.03)), y = Math.round(hash(seed, i, 46) * (height - sh)); ctx.drawImage(ctx.canvas, 0, y, width, sh, Math.round((hash(seed, i, 47) - 0.5) * width * 0.3), y, width, sh) }
    }

    if (style === 'feed') {
      // Cards rushing upward for a second and a half, then the picture settles in its own frame; the ground is the picture darkened.
      const { w: sw, h: sh } = sizeOf(source, width, height)
      const gscale = Math.max(width / sw, height / sh)
      ctx.drawImage(source, Math.round((width - sw * gscale) / 2), Math.round((height - sh * gscale) / 2), Math.round(sw * gscale), Math.round(sh * gscale))
      ctx.fillStyle = input.background; ctx.globalAlpha = 0.8; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
      const cycle = 4000, t = (atMs % cycle) / cycle
      const rushing = t < 0.4
      const cardW = Math.round(width * 0.7), cardH = Math.round(cardW * 1.25), gap = Math.round(height * 0.04)
      const frameCard = (x: number, y: number, src: CanvasImageSource, fx: number, fy: number) => {
        cover(ctx, src, x, y, cardW, cardH, fx, fy)
        ctx.lineWidth = 3; ctx.strokeStyle = CYAN; ctx.strokeRect(x - 3, y - 3, cardW + 6, cardH + 6)
        ctx.strokeStyle = MAGENTA; ctx.strokeRect(x + 3, y + 3, cardW - 6, cardH - 6)
      }
      if (rushing) {
        // The speed falls as the second passes; the cards blur into doubles.
        const ease = 1 - t / 0.4
        const offset = (ease * ease * height * 6) % (cardH + gap)
        const count = 6
        for (let i = -1; i < count; i += 1) {
          const y = Math.round(i * (cardH + gap) - offset + height * 0.1)
          const src = pool[(i + count) % pool.length]
          ctx.globalAlpha = 0.35; frameCard(Math.round((width - cardW) / 2), y + Math.round(ease * 40), src, 0.5, 0.5)
          ctx.globalAlpha = 1; frameCard(Math.round((width - cardW) / 2), y, src, 0.5, 0.5)
        }
        for (let i = 0; i < 8; i += 1) { const sh2 = Math.round(height * (0.004 + hash(seed, i, 48) * 0.02)), y = Math.round(hash(seed, i, 49) * (height - sh2)); ctx.drawImage(ctx.canvas, 0, y, width, sh2, Math.round((hash(seed, i, 50) - 0.5) * width * 0.25), y, width, sh2) }
      } else {
        const settle = Math.min(1, (t - 0.4) / 0.1)
        const y = Math.round((height - cardH) / 2 + (1 - settle) * height * 0.3)
        frameCard(Math.round((width - cardW) / 2), y, source, 0.5, 0.5)
        if (burst) for (let i = 0; i < 6; i += 1) { const sh2 = Math.round(height * (0.004 + hash(seed, i, 51) * 0.03)), yy = Math.round(hash(seed, i, 52) * (height - sh2)); ctx.drawImage(ctx.canvas, 0, yy, width, sh2, Math.round((hash(seed, i, 53) - 0.5) * width * 0.2), yy, width, sh2) }
      }
    }

    if (style === 'letters') {
      // The words huge, in bands cut and shifted, doubled with dark shadows, some letters filled with the pictures; the ground is the picture darkened.
      const words = (input.text?.trim() || 'RANDOM').toUpperCase().split(/\s+/).slice(0, 3)
      const { w: sw, h: sh } = sizeOf(source, width, height)
      const gscale = Math.max(width / sw, height / sh)
      ctx.drawImage(source, Math.round((width - sw * gscale) / 2), Math.round((height - sh * gscale) / 2), Math.round(sw * gscale), Math.round(sh * gscale))
      ctx.fillStyle = input.background; ctx.globalAlpha = burst ? 0.55 : 0.82; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
      const family = input.titleFont ?? 'Tomorrow, sans-serif'
      const scratch = document.createElement('canvas'); scratch.width = width; scratch.height = height
      const s = scratch.getContext('2d')!
      // The size that lets the widest word fill the width, measured in the typeface itself.
      s.font = `900 100px ${family}`
      const widest = Math.max(...words.map((w) => s.measureText(w).width), 1)
      const size = Math.round(Math.min(100 * width * 0.96 / widest, height * 0.24))
      s.font = `900 ${size}px ${family}`; s.textAlign = 'center'; s.textBaseline = 'middle'
      const top = height / 2 - (words.length - 1) * size * 0.55
      const s3 = Math.floor(atMs / (burst ? 120 : 400))
      const drift = Math.sin(atMs / 700)
      words.forEach((word, wi) => {
        const y = top + wi * size * 1.1
        const dx = burst ? Math.round((hash(s3, wi, 54) - 0.5) * width * 0.3) : Math.round(drift * size * 0.08 * (wi % 2 ? -1 : 1))
        // The shadow copies, dark then coloured, then the word, then the pictures through some letters.
        s.fillStyle = DEEP; s.fillText(word, width / 2 + dx + Math.round(size * 0.08), y + Math.round(size * 0.06))
        if (burst) { s.fillStyle = hash(s3, wi, 66) < 0.5 ? CYAN : MAGENTA; s.fillText(word, width / 2 + dx - Math.round(size * 0.04), y - Math.round(size * 0.02)) }
        s.fillStyle = CREAM; s.fillText(word, width / 2 + dx, y)
      })
      ctx.drawImage(scratch, 0, 0)
      {
        // A few letters as windows on the pictures.
        s.globalCompositeOperation = 'source-in'
        const src = pool[Math.floor(hash(s3, 56) * pool.length)]
        cover(s, src, 0, 0, width, height, hash(s3, 57), hash(s3, 58), 1.5)
        s.globalCompositeOperation = 'source-over'
        for (let i = 0; i < 2 + Math.round(k * 4); i += 1) {
          const w = Math.round(width * (0.15 + hash(s3, i, 59) * 0.4)), h = Math.round(size * (0.5 + hash(s3, i, 60) * 1.4))
          const x = Math.round(hash(s3, i, 61) * (width - w)), y = Math.round(top - size / 2 + hash(s3, i, 62) * (words.length * size * 1.1 - h))
          ctx.drawImage(scratch, x, y, w, h, x, y, w, h)
        }
      }
      if (burst) {
        // Bands of the whole frame cut and thrown, the letters re-ordered by it.
        for (let i = 0; i < Math.round(4 + k * 8); i += 1) { const bh = Math.round(height * (0.03 + hash(seed, i, 63) * 0.12)), y = Math.round(hash(seed, i, 64) * (height - bh)); ctx.drawImage(ctx.canvas, 0, y, width, bh, Math.round((hash(seed, i, 65) - 0.5) * width * 0.5), y, width, bh) }
      }
    }

    const overlay = input.overlays[variant] ?? input.overlays[0]
    if (overlay) ctx.drawImage(overlay, 0, 0, width, height)
  }
}
