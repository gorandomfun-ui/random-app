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

const MOSH_INKS = ['#00eaff', '#ff006f', '#0FC55D', '#ffe600', '#3D42CC']

/** A small deterministic number from a few integers, in [0, 1). */
const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= v + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 10000) / 10000 }

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
        // The corrupted stream: macroblocks jumping, bands smeared sideways, saturated strips, a few blocks tinted.
        const blocks = Math.round(6 + k * 26)
        for (let i = 0; i < blocks; i += 1) {
          const bw = Math.round(width * (0.05 + hash(seed, i, 4) * 0.25)), bh = Math.round(height * (0.01 + hash(seed, i, 5) * 0.05))
          const sx = Math.round(hash(seed, i, 6) * (width - bw)), sy = Math.round(hash(seed, i, 7) * (height - bh))
          const dx = Math.round(sx + (hash(seed, i, 8) - 0.5) * width * 0.3 * k), dy = Math.round(sy + (hash(seed, i, 9) - 0.5) * height * 0.06 * k)
          ctx.drawImage(ctx.canvas, sx, sy, bw, bh, dx, dy, bw, bh)
          if (hash(seed, i, 10) < 0.35 * k) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = MOSH_INKS[Math.floor(hash(seed, i, 11) * MOSH_INKS.length)]; ctx.globalAlpha = 0.55; ctx.fillRect(dx, dy, bw, bh); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over' }
        }
        const smears = Math.round(2 + k * 8)
        for (let i = 0; i < smears; i += 1) {
          const y = Math.round(hash(seed, i, 12) * height), sh = Math.max(2, Math.round(height * 0.004 * (1 + k * 3)))
          const x = Math.round(hash(seed, i, 13) * width * 0.6)
          ctx.drawImage(ctx.canvas, x, y, 2, sh, 0, y, width, sh)
        }
        const strips = Math.round(3 + k * 10)
        for (let i = 0; i < strips; i += 1) {
          ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5 + hash(seed, i, 14) * 0.4
          ctx.fillStyle = hash(seed, i, 15) < 0.4 ? input.accent : MOSH_INKS[Math.floor(hash(seed, i, 16) * MOSH_INKS.length)]
          const y = Math.round(hash(seed, i, 17) * height), h = Math.max(2, Math.round(height * 0.003 * (1 + k * 4)))
          const x = Math.round(hash(seed, i, 18) * width * 0.5), w = Math.round(width * (0.2 + hash(seed, i, 19) * 0.8))
          ctx.fillRect(x, y, w, h)
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
        }
      }
    }
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
