/**
 * One drawer for the moving slide, used by the live preview and by the
 * recording alike, so what is seen is what is exported. Two glitches:
 * 'random', the site's own (bands of the picture shifted, the engine's
 * lines over it), and 'mosh', the corrupted-stream look of the owner's
 * reference (macroblocks, saturated bands, smears, tape-deck counters).
 */

export type GlitchStyle = 'random' | 'mosh'

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
  /** Pictures to tear fragments from, the logo for one: odd pieces of them drift through the frame. */
  fragments?: CanvasImageSource[]
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
const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= v + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 10000) / 10000 }

const CREAM = '#F8F5E6', BASE = '#191916'

/** A colour between two, as hex. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** The inks of the moving glitch: the accent, its light and deep sisters, the cream. Nothing outside the site. */
export function inksOf(accent: string): string[] {
  return [accent, mix(accent, CREAM, 0.5), mix(accent, BASE, 0.45), CREAM]
}

/**
 * The things that drift through, glitch or not: soft ectoplasms, fragments
 * of the logo's letters, clusters of hairlines, dust. Fewer when calm, more
 * in a burst; all in the site's inks.
 */
function oddThings(ctx: CanvasRenderingContext2D, width: number, height: number, atMs: number, k: number, inks: string[], fragments: CanvasImageSource[] | undefined, burst: boolean) {
  const slot = Math.floor(atMs / (burst ? 90 : 420))
  const count = Math.round((burst ? 3 : 1) + k * (burst ? 6 : 3))
  for (let i = 0; i < count; i += 1) {
    const kind = hash(slot, i, 30)
    const x = hash(slot, i, 31) * width, y = height * 0.06 + hash(slot, i, 32) * height * 0.8
    if (kind < 0.3) {
      // An ectoplasm: a soft, stretched glow in the accent, drifting a little with time.
      const w = width * (0.15 + hash(slot, i, 33) * 0.4), h = height * (0.01 + hash(slot, i, 34) * 0.05)
      const drift = ((atMs / 1000) * (0.02 + hash(slot, i, 35) * 0.05) * width) % width
      const g = ctx.createRadialGradient(x + drift, y, 0, x + drift, y, w / 2)
      const ink = inks[Math.floor(hash(slot, i, 36) * inks.length)]
      g.addColorStop(0, ink); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save(); ctx.globalAlpha = 0.12 + hash(slot, i, 37) * 0.18 * (burst ? 1.5 : 1); ctx.translate(x + drift, y); ctx.scale(1, h / w); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    } else if (kind < 0.55 && fragments?.length) {
      // A fragment of a letter, scaled, sometimes mirrored, passing by.
      const src = fragments[Math.floor(hash(slot, i, 38) * fragments.length)]
      const sw = (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width || 100, sh = (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height || 100
      const fw = sw * (0.1 + hash(slot, i, 39) * 0.3), fh = sh * (0.1 + hash(slot, i, 40) * 0.3)
      const sx = hash(slot, i, 41) * (sw - fw), sy = hash(slot, i, 42) * (sh - fh)
      const scale = (0.4 + hash(slot, i, 43) * 1.8) * (width / sw)
      ctx.save(); ctx.globalAlpha = 0.35 + hash(slot, i, 44) * 0.4; ctx.translate(x, y); if (hash(slot, i, 45) < 0.4) ctx.scale(-1, 1)
      ctx.drawImage(src, sx, sy, fw, fh, 0, 0, fw * scale, fh * scale); ctx.restore()
    } else if (kind < 0.85) {
      // A cluster of hairlines, fading at both ends.
      const n = 3 + Math.floor(hash(slot, i, 46) * 8), ink = inks[Math.floor(hash(slot, i, 47) * inks.length)]
      for (let j = 0; j < n; j += 1) {
        const ly = y + j * (2 + hash(slot, i, j, 48) * 10), lw = width * (0.1 + hash(slot, i, j, 49) * 0.7), lx = hash(slot, i, j, 50) * (width - lw)
        const g = ctx.createLinearGradient(lx, 0, lx + lw, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, ink); g.addColorStop(0.8, ink); g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = 0.25 + hash(slot, i, j, 51) * 0.6; ctx.fillStyle = g; ctx.fillRect(lx, ly, lw, Math.max(1, Math.round(height * 0.0012 * (1 + k))))
      }
      ctx.globalAlpha = 1
    } else {
      // Dust: a handful of tiny cream marks.
      ctx.fillStyle = CREAM
      for (let j = 0; j < 12; j += 1) { ctx.globalAlpha = 0.3 + hash(slot, i, j, 52) * 0.6; const d = 2 + Math.round(hash(slot, i, j, 53) * 5); ctx.fillRect(Math.round(x + (hash(slot, i, j, 54) - 0.5) * width * 0.3), Math.round(y + (hash(slot, i, j, 55) - 0.5) * height * 0.1), d, d) }
      ctx.globalAlpha = 1
    }
  }
}

export function createDrawer(input: DrawerInput) {
  const { width, height } = input
  return (ctx: CanvasRenderingContext2D, source: CanvasImageSource, atMs: number, schedule: Slot[], frameIndex: number) => {
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
    ctx.fillStyle = input.background; ctx.fillRect(0, 0, width, height)
    if (input.ground) {
      const sw = (source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || width
      const sh = (source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || height
      const scale = Math.max(width / sw, height / sh)
      const gw = Math.round(sw * scale), gh = Math.round(sh * scale)
      ctx.drawImage(source, Math.round((width - gw) / 2), Math.round((height - gh) / 2), gw, gh)
      ctx.fillStyle = input.background; ctx.globalAlpha = 0.72; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1
    }
    const r = input.rect, c = input.clip ?? { x: 0, y: 0, w: width, h: height }
    ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip()
    ctx.drawImage(source, r.x, r.y, r.w, r.h)
    ctx.restore()
    const slot = schedule.find((s) => atMs < s.until)
    const variant = slot?.variant ?? 0
    const k = input.intensity
    if (variant > 0 && k > 0) {
      const seed = variant * 1000 + Math.floor(atMs / 90)
      if (input.style === 'random') {
        // Bands of the frame copied sideways: the picture itself tearing.
        const pieces = Math.round(2 + k * 6)
        for (let i = 0; i < pieces; i += 1) {
          const ph = Math.max(4, Math.round(height * (0.006 + hash(seed, i, 1) * 0.03 * k)))
          const y = Math.round(height * 0.08 + hash(seed, i, 2) * (height * 0.76 - ph))
          const shift = Math.round((hash(seed, i, 3) - 0.5) * width * 0.12 * (0.5 + k))
          ctx.drawImage(ctx.canvas, 0, y, width, ph, shift, y, width, ph)
        }
      } else {
        // The corrupted stream, fine: small blocks jumping, a few tinted in the site's inks, thin smears, hairlines by the dozen.
        const inks = inksOf(input.accent)
        const blocks = Math.round(10 + k * 30)
        for (let i = 0; i < blocks; i += 1) {
          const bw = Math.round(width * (0.03 + hash(seed, i, 4) * 0.12)), bh = Math.round(height * (0.004 + hash(seed, i, 5) * 0.025))
          const sx = Math.round(hash(seed, i, 6) * (width - bw)), sy = Math.round(hash(seed, i, 7) * (height - bh))
          const dx = Math.round(sx + (hash(seed, i, 8) - 0.5) * width * 0.25 * k), dy = Math.round(sy + (hash(seed, i, 9) - 0.5) * height * 0.04 * k)
          ctx.drawImage(ctx.canvas, sx, sy, bw, bh, dx, dy, bw, bh)
          if (hash(seed, i, 10) < 0.3 * k) { ctx.fillStyle = inks[Math.floor(hash(seed, i, 11) * inks.length)]; ctx.globalAlpha = 0.3; ctx.fillRect(dx, dy, bw, bh); ctx.globalAlpha = 1 }
        }
        const smears = Math.round(3 + k * 10)
        for (let i = 0; i < smears; i += 1) {
          const y = Math.round(hash(seed, i, 12) * height), sh = Math.max(1, Math.round(height * 0.002 * (1 + k * 2)))
          const x = Math.round(hash(seed, i, 13) * width * 0.6)
          ctx.drawImage(ctx.canvas, x, y, 2, sh, 0, y, width, sh)
        }
        const lines = Math.round(15 + k * 45)
        for (let i = 0; i < lines; i += 1) {
          const ink = inks[Math.floor(hash(seed, i, 16) * inks.length)]
          const y = Math.round(hash(seed, i, 17) * height), h = Math.max(1, Math.round(height * 0.0012 * (1 + k * 2)))
          const x = Math.round(hash(seed, i, 18) * width * 0.5), w = Math.round(width * (0.15 + hash(seed, i, 19) * 0.85))
          const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, ink); g.addColorStop(0.85, ink); g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.globalAlpha = 0.3 + hash(seed, i, 14) * 0.6; ctx.fillStyle = g; ctx.fillRect(x, y, w, h)
        }
        ctx.globalAlpha = 1
      }
    }
    if (input.style === 'mosh' && k > 0) oddThings(ctx, width, height, atMs, k, inksOf(input.accent), input.fragments, variant > 0)
    if (input.style === 'mosh' && k > 0) {
      // The tape deck: a counter, arrows, bracket marks in the corners, flickering.
      const on = hash(frameIndex, 21) < 0.85
      if (on) {
        ctx.fillStyle = '#F8F5E6'; ctx.font = `${Math.round(width * 0.022)}px "Inter Tight", monospace`; ctx.textBaseline = 'top'
        const t = Math.floor(atMs / 1000), f = frameIndex % 30
        ctx.fillText(`${String(17 + (t % 2)).padStart(2, '0')}:${String(13 + t).padStart(2, '0')}  ${String(140 + f).padStart(3, '0')}`, Math.round(width * 0.04), Math.round(height * 0.025))
        ctx.fillText('F R N', Math.round(width * 0.9), Math.round(height * 0.06))
        ctx.strokeStyle = hash(frameIndex, 22) < 0.5 ? input.accent : '#F8F5E6'; ctx.lineWidth = Math.max(2, Math.round(width * 0.003))
        const m = Math.round(width * 0.035), l = Math.round(width * 0.05)
        for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]] as const) {
          ctx.beginPath(); ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy); ctx.stroke()
        }
      }
    }
    const overlay = input.overlays[variant] ?? input.overlays[0]
    if (overlay) ctx.drawImage(overlay, 0, 0, width, height)
  }
}
