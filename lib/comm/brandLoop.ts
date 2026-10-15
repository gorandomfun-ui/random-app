/**
 * The brand loop, after the owner's reference: not one card that shakes but a
 * run of scenes drawn at random, each in its own look, cut by brutal
 * transitions — VHS bands, block mosaics, organic ectoplasms inside and
 * around the letters, a torn sticker, the letters zoomed with chromatic
 * fringes, another typeface, the camera's interface, grain and scratches on
 * everything. A seed decides the run: every generation is another film.
 */

import { recorderChoice } from './montage'

export type BrandLoopInput = {
  accent: string
  /** 0.2 calm … 1 wild: how long the chaos lasts against the calm. */
  intensity: number
  seconds: number
  seed: number
  vertical: HTMLImageElement
  horizontal: HTMLImageElement
  verticalAccent: HTMLImageElement
  verticalDark: HTMLImageElement
  pillFont: string
  titleFont: string
  width?: number
  height?: number
  onProgress?: (fraction: number) => void
  preview?: HTMLCanvasElement | null
}

const CREAM = '#F8F5E6', BASE = '#191916', DEEP = '#121210', PILL = '#D90845'
const ACCENTS = ['#0FC55D', '#D90845', '#E5972B', '#FF978F', '#3D42CC', '#AF3BF2']

const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

type SceneKind = 'card' | 'tinted' | 'filled' | 'sticker' | 'linefont' | 'zoom' | 'ecto' | 'vhs' | 'mosaic' | 'dark'
type Cut = { kind: SceneKind; from: number; to: number; seed: number; transition: 'vhs' | 'mosaic' | 'slice' | 'none' }

/** The calm scenes carry the brand; the wild ones are the corruption; the mix follows the intensity. */
const CALM: SceneKind[] = ['card', 'card', 'tinted', 'filled', 'sticker', 'linefont', 'zoom', 'ecto', 'dark']
const WILD: SceneKind[] = ['vhs', 'mosaic', 'filled', 'zoom', 'ecto']

export function planCuts(seconds: number, intensity: number, seed: number): Cut[] {
  const cuts: Cut[] = []
  let at = 0, i = 0
  const total = seconds * 1000
  while (at < total) {
    const wild = hash(seed, i, 1) < intensity * 0.55
    const pool = wild ? WILD : CALM
    const kind = i === 0 ? 'card' : pool[Math.floor(hash(seed, i, 2) * pool.length)]
    const length = wild ? 120 + hash(seed, i, 3) * 380 : 450 + hash(seed, i, 3) * 900
    const t = hash(seed, i, 4)
    const transition: Cut['transition'] = i === 0 ? 'none' : t < 0.35 ? 'vhs' : t < 0.6 ? 'mosaic' : t < 0.85 ? 'slice' : 'none'
    cuts.push({ kind, from: at, to: Math.min(total, at + length), seed: seed * 7 + i, transition })
    at += length; i += 1
  }
  return cuts
}

export async function recordBrandLoop(input: BrandLoopInput): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : Chrome ou Edge sur ordinateur.')
  const W = input.width ?? 1080, H = input.height ?? 1920
  const work = document.createElement('canvas'); work.width = W; work.height = H
  const ctx = work.getContext('2d')!
  const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H
  const sx = scratch.getContext('2d')!
  const prev = document.createElement('canvas'); prev.width = W; prev.height = H
  const px = prev.getContext('2d')!
  const inks = [input.accent, mix(input.accent, CREAM, 0.5), ...ACCENTS.filter((a) => a !== input.accent).slice(0, 3), CREAM]
  const logoW = Math.round(W * 0.6), logoX = Math.round(W * 0.2)
  const vH = Math.round(logoW * (input.vertical.naturalHeight / input.vertical.naturalWidth)), vY = Math.round(H * 0.3)

  // ----- pieces
  const pill = (c: CanvasRenderingContext2D, y: number, color = PILL, alpha = 1) => {
    const w = Math.round(W * 0.52), h = Math.round(H * 0.038), x = Math.round((W - w) / 2), r = h / 2
    c.save(); c.globalAlpha = alpha; c.fillStyle = color; c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); c.lineTo(x + r, y + h); c.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); c.closePath(); c.fill()
    c.fillStyle = CREAM; c.font = `bold ${Math.round(h * 0.5)}px ${input.pillFont}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('GORANDOM.FUN', W / 2, y + h / 2); c.restore()
  }
  /** An organic field: overlapping soft blobs of several inks, with speckle; the ectoplasm the letters open on. */
  const organic = (c: CanvasRenderingContext2D, seed: number, t: number, alpha = 1) => {
    c.save(); c.globalAlpha = alpha
    const n = 7 + Math.floor(hash(seed, 10) * 6)
    for (let i = 0; i < n; i += 1) {
      const cx = hash(seed, i, 11) * W + Math.sin(t * (0.4 + hash(seed, i, 12)) + i) * W * 0.08
      const cy = hash(seed, i, 13) * H + Math.cos(t * (0.3 + hash(seed, i, 14)) + i) * H * 0.05
      const rx = W * (0.12 + hash(seed, i, 15) * 0.35), ry = rx * (0.3 + hash(seed, i, 16) * 0.9)
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx)
      const ink = inks[Math.floor(hash(seed, i, 17) * inks.length)]
      g.addColorStop(0, ink); g.addColorStop(0.55, mix(ink, DEEP, 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)')
      c.save(); c.translate(cx, cy); c.rotate(hash(seed, i, 18) * Math.PI); c.scale(1, ry / rx); c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore()
    }
    // Speckle, like a scan of a painting.
    c.fillStyle = CREAM
    for (let i = 0; i < 300; i += 1) { c.globalAlpha = alpha * (0.1 + hash(seed, i, 19, Math.floor(t * 8)) * 0.5); c.fillRect(hash(seed, i, 20) * W, hash(seed, i, 21) * H, 2 + hash(seed, i, 22) * 5, 2 + hash(seed, i, 23) * 5) }
    c.restore()
  }
  const vhs = (c: CanvasRenderingContext2D, seed: number, frame: number, density = 1) => {
    const bands = Math.round(30 * density + hash(seed, frame, 30) * 30)
    for (let i = 0; i < bands; i += 1) {
      const y = Math.round(hash(seed, frame, i, 31) * H), h = Math.max(2, Math.round(H * (0.002 + hash(seed, frame, i, 32) * 0.03)))
      const r = hash(seed, frame, i, 33)
      c.fillStyle = r < 0.2 ? '#ffffff' : r < 0.35 ? DEEP : inks[Math.floor(hash(seed, frame, i, 34) * inks.length)]
      c.globalAlpha = 0.5 + hash(seed, frame, i, 35) * 0.5
      const x = Math.round((hash(seed, frame, i, 36) - 0.3) * W), w = Math.round(W * (0.2 + hash(seed, frame, i, 37) * 1.1))
      c.fillRect(x, y, w, h)
      if (hash(seed, frame, i, 38) < 0.5) c.drawImage(c.canvas, 0, y, W, h, Math.round((hash(seed, frame, i, 39) - 0.5) * W * 0.4), y, W, h)
    }
    c.globalAlpha = 1
  }
  const mosaic = (c: CanvasRenderingContext2D, seed: number, frame: number) => {
    const cell = 24 + Math.round(hash(seed, 40) * 60)
    for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
      const r = hash(seed, frame, x, y)
      if (r < 0.45) continue
      c.fillStyle = r < 0.6 ? DEEP : r < 0.7 ? '#ffffff' : inks[Math.floor(hash(seed, frame, x, y, 41) * inks.length)]
      c.fillRect(x, y, cell * (1 + Math.floor(hash(seed, frame, x, y, 42) * 3)), cell)
    }
  }
  const hud = (c: CanvasRenderingContext2D, frame: number, atMs: number, style: number) => {
    c.save(); c.fillStyle = CREAM; c.strokeStyle = CREAM; c.lineWidth = Math.max(2, Math.round(W * 0.0025))
    const small = Math.round(W * 0.022)
    c.font = `${small}px ${input.pillFont}`; c.textBaseline = 'top'
    const t = Math.floor(atMs / 1000)
    if (style < 0.5) {
      // A phone's status bar and a recording's counter.
      c.fillText(`17:${String(13 + t).padStart(2, '0')}`, Math.round(W * 0.05), Math.round(H * 0.02))
      c.fillRect(Math.round(W * 0.86), Math.round(H * 0.022), Math.round(W * 0.07), Math.round(small * 0.7)); c.fillStyle = BASE; c.fillRect(Math.round(W * 0.86) + 3, Math.round(H * 0.022) + 3, Math.round(W * 0.03), Math.round(small * 0.7) - 6); c.fillStyle = CREAM
      c.fillStyle = input.accent; c.beginPath(); c.arc(Math.round(W * 0.07), Math.round(H * 0.955), Math.round(W * 0.012), 0, Math.PI * 2); c.fill(); c.fillStyle = CREAM
      c.fillText(`${70 + (t % 9)}:00`, Math.round(W * 0.1), Math.round(H * 0.945))
      c.fillRect(Math.round(W * 0.1), Math.round(H * 0.975), Math.round(W * 0.8 * ((atMs / 1000 / input.seconds) % 1)), 3)
      c.beginPath(); c.arc(Math.round(W * 0.92), Math.round(H * 0.952), Math.round(W * 0.014), 0, Math.PI * 2); c.stroke()
    } else {
      // The deck: a frame counter, arrows, F R N, bracket corners.
      c.fillText(`${String(17 + (t % 2)).padStart(2, '0')}:${String(13 + t).padStart(2, '0')}  ${String(140 + (frame % 30)).padStart(3, '0')}`, Math.round(W * 0.04), Math.round(H * 0.025))
      c.fillText('‹  ›', Math.round(W * 0.04), Math.round(H * 0.045)); c.fillText('F R N', Math.round(W * 0.9), Math.round(H * 0.06))
      const m = Math.round(W * 0.035), l = Math.round(W * 0.05)
      for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) { c.strokeStyle = hash(frame, cx) < 0.3 ? input.accent : CREAM; c.beginPath(); c.moveTo(cx, cy + dy * l); c.lineTo(cx, cy); c.lineTo(cx + dx * l, cy); c.stroke() }
    }
    c.restore()
  }
  const grunge = (c: CanvasRenderingContext2D, frame: number, amount: number) => {
    // Grain, a few scratches, now and then a jump of the whole frame.
    c.save()
    c.fillStyle = CREAM
    for (let i = 0; i < 400 * amount; i += 1) { c.globalAlpha = hash(frame, i, 50) * 0.25; c.fillRect(hash(frame, i, 51) * W, hash(frame, i, 52) * H, 1 + hash(frame, i, 53) * 3, 1 + hash(frame, i, 54) * 3) }
    c.fillStyle = DEEP
    for (let i = 0; i < 200 * amount; i += 1) { c.globalAlpha = hash(frame, i, 55) * 0.35; c.fillRect(hash(frame, i, 56) * W, hash(frame, i, 57) * H, 1 + hash(frame, i, 58) * 4, 1 + hash(frame, i, 59) * 4) }
    c.globalAlpha = 0.35; c.strokeStyle = CREAM; c.lineWidth = 1
    for (let i = 0; i < 3 * amount; i += 1) { if (hash(frame, i, 60) > 0.3) continue; c.beginPath(); const x = hash(frame, i, 61) * W; c.moveTo(x, 0); c.lineTo(x + (hash(frame, i, 62) - 0.5) * 80, H); c.stroke() }
    c.restore()
  }

  // ----- scenes
  const scene = (c: CanvasRenderingContext2D, cut: Cut, local: number, frame: number, atMs: number) => {
    const s = cut.seed
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1
    c.fillStyle = BASE; c.fillRect(0, 0, W, H)
    switch (cut.kind) {
      case 'card': {
        c.drawImage(input.vertical, logoX, vY, logoW, vH); pill(c, vY + vH + Math.round(H * 0.03))
        break
      }
      case 'tinted': {
        const ink = hash(s, 70) < 0.5 ? input.accent : ACCENTS[Math.floor(hash(s, 71) * ACCENTS.length)]
        c.drawImage(input.verticalAccent, logoX, vY, logoW, vH)
        if (ink !== input.accent) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = ink; c.fillRect(logoX, vY, logoW, vH); c.globalCompositeOperation = 'source-over' }
        pill(c, vY + vH + Math.round(H * 0.03))
        break
      }
      case 'filled': {
        // The letters as windows on the ectoplasm; a few blobs escape outside.
        sx.clearRect(0, 0, W, H); sx.drawImage(input.vertical, logoX, vY, logoW, vH); sx.globalCompositeOperation = 'source-in'; organic(sx, s, atMs / 1000); sx.globalCompositeOperation = 'source-over'
        if (hash(s, 72) < 0.6) { organic(c, s + 1, atMs / 1000, 0.35) }
        c.drawImage(scratch, 0, 0)
        if (hash(s, 73) < 0.5) c.drawImage(input.vertical, logoX, vY, logoW, vH)
        if (hash(s, 73) < 0.5) { sx.clearRect(0, 0, W, H); sx.drawImage(input.vertical, logoX, vY, logoW, vH); sx.globalCompositeOperation = 'source-in'; organic(sx, s, atMs / 1000); sx.globalCompositeOperation = 'source-over'; c.drawImage(scratch, 0, 0) }
        pill(c, vY + vH + Math.round(H * 0.03))
        break
      }
      case 'sticker': {
        // A torn sticker: a ragged light block, slightly turned, the letters dark on it.
        const padX = Math.round(W * 0.06), padY = Math.round(H * 0.03)
        const tone = hash(s, 74) < 0.5 ? '#bdbab2' : CREAM
        c.save(); c.translate(W / 2, vY + vH / 2); c.rotate((hash(s, 75) - 0.5) * 0.08); c.translate(-W / 2, -(vY + vH / 2))
        c.fillStyle = tone; c.beginPath()
        const left = logoX - padX, right = logoX + logoW + padX, top = vY - padY, bottom = vY + vH + padY
        c.moveTo(left, top)
        for (let i = 0; i <= 12; i += 1) c.lineTo(left + (right - left) * i / 12, top + (hash(s, i, 76) - 0.5) * padY * 1.6)
        for (let i = 0; i <= 12; i += 1) c.lineTo(right + (hash(s, i, 77) - 0.5) * padX * 1.2, top + (bottom - top) * i / 12)
        for (let i = 12; i >= 0; i -= 1) c.lineTo(left + (right - left) * i / 12, bottom + (hash(s, i, 78) - 0.5) * padY * 1.6)
        for (let i = 12; i >= 0; i -= 1) c.lineTo(left + (hash(s, i, 79) - 0.5) * padX * 1.2, top + (bottom - top) * i / 12)
        c.closePath(); c.fill()
        c.drawImage(input.verticalDark, logoX, vY, logoW, vH); c.restore()
        pill(c, vY + vH + Math.round(H * 0.045))
        break
      }
      case 'linefont': {
        // The name in the other typeface, an arc under it, like a sticker from somewhere else.
        c.fillStyle = CREAM; c.font = `900 ${Math.round(W * 0.16)}px ${input.titleFont}`; c.textAlign = 'center'; c.textBaseline = 'middle'
        c.fillText('RANDOM', W / 2, Math.round(H * 0.5)); c.textAlign = 'left'
        c.strokeStyle = hash(s, 80) < 0.5 ? '#ffe600' : input.accent; c.lineWidth = Math.round(W * 0.006)
        c.beginPath(); c.arc(W / 2, Math.round(H * 0.5), Math.round(W * 0.42), Math.PI * 0.15, Math.PI * 0.6); c.stroke()
        pill(c, Math.round(H * 0.62))
        break
      }
      case 'zoom': {
        // The letters very close, three times with fringes, like a lens gone wrong.
        const z = 2 + hash(s, 81) * 2
        const cx = logoX + logoW * (0.3 + hash(s, 82) * 0.4), cy = vY + vH * (0.3 + hash(s, 83) * 0.4)
        const dw = logoW * z, dh = vH * z
        const dx = W / 2 - (cx - logoX) * z, dy = H / 2 - (cy - vY) * z
        // The fringes first, the cream letters sharp over them.
        for (const [ink, off] of [[input.accent, 1], ['#00c8ff', -1]] as const) {
          sx.clearRect(0, 0, W, H); sx.drawImage(input.vertical, dx + off * W * 0.012, dy + off * H * 0.003, dw, dh); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = ink; sx.fillRect(0, 0, W, H); sx.globalCompositeOperation = 'source-over'
          c.globalAlpha = 0.8; c.drawImage(scratch, 0, 0); c.globalAlpha = 1
        }
        c.drawImage(input.vertical, dx, dy, dw, dh)
        c.fillStyle = '#ffe600'
        for (let i = 0; i < 5; i += 1) c.fillRect(Math.round(W * 0.2 + i * W * 0.14), Math.round(H * 0.18), Math.round(W * 0.012), Math.round(W * 0.012))
        break
      }
      case 'ecto': {
        organic(c, s, atMs / 1000, 0.85)
        c.globalAlpha = 0.25 + hash(s, 84) * 0.5; c.drawImage(input.vertical, logoX, vY, logoW, vH); c.globalAlpha = 1
        if (hash(s, 85) < 0.6) pill(c, vY + vH + Math.round(H * 0.03), PILL, 0.7)
        break
      }
      case 'vhs': { c.drawImage(input.vertical, logoX, vY, logoW, vH); pill(c, vY + vH + Math.round(H * 0.03), PILL, 0.8); vhs(c, s, frame, 1.2); break }
      case 'mosaic': { mosaic(c, s, frame); if (hash(s, 86) < 0.5) { c.globalAlpha = 0.6; c.drawImage(input.horizontal, Math.round(W * 0.15), Math.round(H * 0.46), Math.round(W * 0.7), Math.round(W * 0.7 * (input.horizontal.naturalHeight / input.horizontal.naturalWidth))); c.globalAlpha = 1 } break }
      case 'dark': {
        // Almost nothing: the deck's marks, a few hairlines, the pill alone.
        if (hash(s, 87) < 0.5) pill(c, Math.round(H * 0.55))
        c.fillStyle = CREAM
        for (let i = 0; i < 12; i += 1) { c.globalAlpha = 0.2 + hash(s, i, 88) * 0.5; c.fillRect(hash(s, i, 89) * W * 0.5, hash(s, i, 90) * H, W * (0.1 + hash(s, i, 91) * 0.6), 1) }
        c.globalAlpha = 1
        break
      }
    }
    void local
  }

  const cuts = planCuts(input.seconds, input.intensity, input.seed)
  const hudStyle = hash(input.seed, 99)
  const stream = work.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 12_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  const total = input.seconds * 1000
  recorder.start(500)
  const started = performance.now()
  let frame = 0
  const previewCtx = input.preview?.getContext('2d') ?? null
  await new Promise<void>((resolve) => {
    const tick = () => {
      const at = performance.now() - started
      if (at >= total) { resolve(); return }
      const cut = cuts.find((k) => at < k.to) ?? cuts[cuts.length - 1]
      const local = (at - cut.from) / Math.max(1, cut.to - cut.from)
      px.drawImage(work, 0, 0)
      scene(ctx, cut, local, frame, at)
      // The transition at the head of a cut: a few frames of bands, blocks, or the previous frame sliced.
      const head = at - cut.from
      if (head < 140 && cut.transition !== 'none') {
        if (cut.transition === 'vhs') vhs(ctx, cut.seed + 5, frame, 1.5)
        else if (cut.transition === 'mosaic') { ctx.globalAlpha = 0.85; mosaic(ctx, cut.seed + 6, frame); ctx.globalAlpha = 1 }
        else for (let i = 0; i < 18; i += 1) { const y = Math.round(hash(cut.seed, frame, i, 92) * H), h = Math.round(H * (0.01 + hash(cut.seed, frame, i, 93) * 0.06)); ctx.drawImage(prev, 0, y, W, h, Math.round((hash(cut.seed, frame, i, 94) - 0.5) * W * 0.5), y, W, h) }
      }
      // Now and then the whole frame jumps a few pixels; the wilder, the more often.
      if (hash(frame, 95) < input.intensity * 0.12) { const j = Math.round((hash(frame, 96) - 0.5) * W * 0.05); ctx.drawImage(work, j, 0) }
      hud(ctx, frame, at, hudStyle)
      grunge(ctx, frame, 0.5 + input.intensity)
      if (previewCtx && input.preview) previewCtx.drawImage(work, 0, 0, input.preview.width, input.preview.height)
      input.onProgress?.(at / total)
      frame += 1
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
