/**
 * The montage as one function: a clip element, the cut, the slide's dressing
 * (several draws of it so the glitch moves), the canvas size; the browser
 * plays the cut once, every frame is drawn and recorded, and the MP4 comes
 * back. No panel, no choices: full screen, cover, the Random glitch in bursts.
 */

import { recorderChoice, cropRect, expectedSeconds } from './montage'
import { videoDuration } from './client'

export type MontageRunInput = {
  /** The clip's address in the store; CORS lets the canvas read it. */
  src: string
  canvas: { width: number; height: number }
  trim: { startSec: number; endSec: number }
  /** The dressing, transparent: the calm draw first, then the glitched variants. */
  overlayUrls: string[]
  /** 0 keeps every frame calm; up to 1 for bursts most of the time. */
  intensity: number
  background: string
  onProgress?: (seconds: number, total: number) => void
}

export type MontageRunResult = { blob: Blob; mimeType: string; extension: 'mp4' | 'webm'; seconds: number; width: number; height: number }

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img); img.onerror = () => resolve(null)
    img.src = url
  })
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'; video.preload = 'auto'; video.muted = true; video.playsInline = true
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () => reject(new Error('Le navigateur ne lit pas ce clip.'))
    video.src = src
  })
}

const seek = (video: HTMLVideoElement, time: number) => new Promise<void>((resolve) => { const done = () => { video.removeEventListener('seeked', done); resolve() }; video.addEventListener('seeked', done); video.currentTime = time })

/** The glitch's rhythm: calm stretches, then bursts of a few tenths of a second, more often as the intensity rises. */
export function burstSchedule(lengthMs: number, intensity: number, variants: number): Array<{ until: number; variant: number }> {
  const out: Array<{ until: number; variant: number }> = []
  let at = 0, k = 0
  while (at < lengthMs + 2000) {
    const calm = intensity <= 0 || ((k * 7919) % 100) / 100 > intensity * 0.75
    const length = calm ? 350 + ((k * 104729) % 900) : 100 + ((k * 15485863) % 320)
    at += length; k += 1
    out.push({ until: at, variant: calm || variants < 2 ? 0 : 1 + (k % (variants - 1)) })
  }
  return out
}

export async function recordMontage(input: MontageRunInput): Promise<MontageRunResult> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : utilise Chrome ou Edge sur ordinateur.')
  const video = await loadVideo(input.src)
  const known = await videoDuration(video)
  const duration = known ?? input.trim.endSec
  const start = Math.max(0, Math.min(input.trim.startSec, duration)), end = Math.max(start + 0.5, Math.min(input.trim.endSec, duration))
  const overlays = (await Promise.all(input.overlayUrls.map(loadImage))).filter((img): img is HTMLImageElement => Boolean(img))
  const { width, height } = input.canvas
  const work = document.createElement('canvas'); work.width = width; work.height = height
  const ctx = work.getContext('2d')!
  const size = { width: video.videoWidth || 16, height: video.videoHeight || 9 }
  const rect = cropRect(size, input.canvas, { top: 0, height: 1 }, 'centered')
  const stream = work.captureStream(30)
  let audio: AudioContext | null = null
  try {
    audio = new AudioContext()
    const source = audio.createMediaElementSource(video)
    const sink = audio.createMediaStreamDestination()
    source.connect(sink)
    for (const track of sink.stream.getAudioTracks()) stream.addTrack(track)
    video.muted = false; video.volume = 1
  } catch { /* no sound then */ }
  const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  const schedule = burstSchedule((end - start) * 1000, input.intensity, overlays.length)
  const draw = (atMs: number) => {
    ctx.fillStyle = input.background; ctx.fillRect(0, 0, width, height)
    ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h)
    const slot = schedule.find((s) => atMs < s.until)
    const variant = slot?.variant ?? 0
    if (variant > 0 && input.intensity > 0) {
      // A few bands of the frame copied sideways: the picture itself tearing.
      const pieces = Math.round(2 + input.intensity * 6)
      for (let i = 0; i < pieces; i += 1) {
        const seedy = (variant * 131 + i * 17) % 97 / 97, seedx = (variant * 53 + i * 29) % 89 / 89
        const ph = Math.max(4, Math.round(height * (0.006 + seedy * 0.03 * input.intensity)))
        const y = Math.round(height * 0.08 + seedy * (height * 0.76 - ph))
        const shift = Math.round((seedx - 0.5) * width * 0.12 * (0.5 + input.intensity))
        ctx.drawImage(work, 0, y, width, ph, shift, y, width, ph)
      }
    }
    const overlay = overlays[variant] ?? overlays[0]
    if (overlay) ctx.drawImage(overlay, 0, 0, width, height)
  }
  await seek(video, start)
  draw(0)
  recorder.start(1000)
  const started = performance.now()
  let finished = false, handle = 0
  const finish = () => { if (finished) return; finished = true; video.pause(); if (handle) cancelAnimationFrame(handle); recorder.stop() }
  const tick = () => {
    const at = performance.now() - started
    draw(at)
    input.onProgress?.(Math.min(end - start, video.currentTime - start), end - start)
    if (video.currentTime >= end - 0.04 || video.ended) { finish(); return }
    handle = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.(tick) ?? requestAnimationFrame(tick)
  }
  const guard = window.setTimeout(finish, (expectedSeconds(start, end) + 5) * 1000)
  try { await video.play() } catch { finish() }
  tick()
  await stopped
  window.clearTimeout(guard)
  try { await audio?.close() } catch { /* ignore */ }
  const blob = new Blob(chunks, { type: choice.mimeType.split(';')[0] })
  if (!blob.size) throw new Error('Rien n’a été enregistré.')
  return { blob, mimeType: choice.mimeType.split(';')[0], extension: choice.extension, seconds: Math.round((end - start) * 100) / 100, width, height }
}

/** A slide as a JPEG, from the engine's PNG: what Instagram takes, what the curator downloads. */
export async function renderJpeg(renderUrl: string, quality = 0.92): Promise<Blob> {
  const response = await fetch(renderUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`rendu ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('JPEG')
  return blob
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
