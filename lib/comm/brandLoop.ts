/**
 * The brand loop, built like the owner's reference: the stacked RAN DOM card
 * with the address pill, then bursts of corruption, the letters tinted, the
 * one-line logo, the letters filled with colour blocks, the card again; the
 * tape-deck interface in the corners all along. Drawn frame by frame in the
 * browser and recorded as an MP4. One accent, one intensity, five seconds.
 */

import { recorderChoice } from './montage'
import { burstSchedule, createDrawer } from './montageDraw'

export type BrandLoopInput = {
  accent: string
  intensity: number
  seconds: number
  vertical: HTMLImageElement
  horizontal: HTMLImageElement
  verticalAccent: HTMLImageElement
  /** The typeface for the address pill, as a CSS font family the page has. */
  pillFont: string
  width?: number
  height?: number
  onProgress?: (fraction: number) => void
  /** A canvas on the page, drawn as it goes, for the curator to watch. */
  preview?: HTMLCanvasElement | null
}

type Scene = 'card' | 'burst' | 'tinted' | 'line' | 'filled'

/** The scenes in order, each with its share of the loop; the bursts are short and the card is home. */
const SCENES: Array<[Scene, number]> = [['card', 0.16], ['burst', 0.07], ['tinted', 0.14], ['burst', 0.06], ['line', 0.15], ['burst', 0.07], ['filled', 0.15], ['burst', 0.06], ['card', 0.14]]

const INKS = ['#00eaff', '#ff006f', '#0FC55D', '#ffe600', '#3D42CC', '#E5972B']
const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= v + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 10000) / 10000 }

export function sceneAt(fraction: number): { scene: Scene; local: number } {
  let acc = 0
  for (const [scene, share] of SCENES) { if (fraction < acc + share) return { scene, local: (fraction - acc) / share }; acc += share }
  return { scene: 'card', local: 1 }
}

export async function recordBrandLoop(input: BrandLoopInput): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : Chrome ou Edge sur ordinateur.')
  const width = input.width ?? 1080, height = input.height ?? 1920
  const bg = '#191916', cream = '#F8F5E6', pill = '#D90845'
  const work = document.createElement('canvas'); work.width = width; work.height = height
  const ctx = work.getContext('2d')!
  const scene = document.createElement('canvas'); scene.width = width; scene.height = height
  const sctx = scene.getContext('2d')!
  const drawer = createDrawer({ width, height, background: bg, rect: { x: 0, y: 0, w: width, h: height }, overlays: [], intensity: input.intensity, style: 'mosh', accent: input.accent })

  const logoBox = { w: Math.round(width * 0.6), x: Math.round(width * 0.2) }
  const vH = Math.round(logoBox.w * (input.vertical.naturalHeight / input.vertical.naturalWidth))
  const vY = Math.round(height * 0.3)
  const drawPill = (c: CanvasRenderingContext2D, y: number) => {
    const w = Math.round(width * 0.52), h = Math.round(height * 0.038), x = Math.round((width - w) / 2), r = h / 2
    c.fillStyle = pill; c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); c.lineTo(x + r, y + h); c.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2); c.closePath(); c.fill()
    c.fillStyle = cream; c.font = `bold ${Math.round(h * 0.5)}px ${input.pillFont}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('GORANDOM.FUN', width / 2, y + h / 2); c.textAlign = 'left'; c.textBaseline = 'alphabetic'
  }
  const drawScene = (s: Scene, local: number, frame: number) => {
    sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1
    sctx.fillStyle = bg; sctx.fillRect(0, 0, width, height)
    if (s === 'card' || s === 'burst') { sctx.drawImage(input.vertical, logoBox.x, vY, logoBox.w, vH); drawPill(sctx, vY + vH + Math.round(height * 0.03)) }
    if (s === 'tinted') { sctx.drawImage(input.verticalAccent, logoBox.x, vY, logoBox.w, vH); drawPill(sctx, vY + vH + Math.round(height * 0.03)) }
    if (s === 'line') {
      const w = Math.round(width * 0.7), h = Math.round(w * (input.horizontal.naturalHeight / input.horizontal.naturalWidth))
      sctx.drawImage(input.horizontal, Math.round((width - w) / 2), Math.round(height * 0.44), w, h)
      drawPill(sctx, Math.round(height * 0.44) + h + Math.round(height * 0.03))
    }
    if (s === 'filled') {
      // The letters as windows on a stream of colour blocks.
      const mask = document.createElement('canvas'); mask.width = width; mask.height = height
      const m = mask.getContext('2d')!
      m.drawImage(input.vertical, logoBox.x, vY, logoBox.w, vH)
      m.globalCompositeOperation = 'source-in'
      const seed = Math.floor(local * 12)
      for (let i = 0; i < 40; i += 1) {
        const bw = Math.round(width * (0.05 + hash(seed, i, 1) * 0.2)), bh = Math.round(height * (0.01 + hash(seed, i, 2) * 0.04))
        m.fillStyle = hash(seed, i, 3) < 0.3 ? cream : INKS[Math.floor(hash(seed, i, 4) * INKS.length)]
        m.fillRect(Math.round(hash(seed, i, 5) * width), Math.round(vY + hash(seed, i, 6) * vH), bw, bh)
      }
      m.globalCompositeOperation = 'source-over'
      sctx.drawImage(mask, 0, 0)
      drawPill(sctx, vY + vH + Math.round(height * 0.03))
    }
    void frame
  }

  const stream = work.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 10_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  const total = input.seconds * 1000
  // During a burst scene every frame tears; elsewhere the usual rhythm applies.
  const schedule = burstSchedule(total, input.intensity, 5)
  recorder.start(500)
  const started = performance.now()
  let frame = 0
  const previewCtx = input.preview?.getContext('2d') ?? null
  await new Promise<void>((resolve) => {
    const tick = () => {
      const at = performance.now() - started
      if (at >= total) { resolve(); return }
      const { scene: s, local } = sceneAt(at / total)
      drawScene(s, local, frame)
      const burstSchedule2 = s === 'burst' ? [{ until: Number.MAX_SAFE_INTEGER, variant: 1 + (frame % 4) }] : schedule
      drawer(ctx, scene, at, burstSchedule2, frame)
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
