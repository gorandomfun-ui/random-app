/**
 * The montage as one function: a clip element, the cut, the slide's dressing
 * (several draws of it so the glitch moves), the canvas size; the browser
 * plays the cut once, every frame is drawn and recorded, and the MP4 comes
 * back. No panel, no choices: full screen, cover, the Random glitch in bursts.
 */

import { recorderChoice, cropRect, cropRectIn, expectedSeconds } from './montage'
import { videoDuration } from './client'
import { burstSchedule, createDrawer, type GlitchStyle } from './montageDraw'

export type MontageRunInput = {
  /** The clip's address in the store; CORS lets the canvas read it. */
  src: string
  /** A still picture instead of a clip: the animation runs for `seconds`. */
  image?: HTMLImageElement | null
  seconds?: number
  canvas: { width: number; height: number }
  trim: { startSec: number; endSec: number }
  /** The dressing, transparent: the calm draw first, then the glitched variants. */
  overlayUrls: string[]
  /** 0 keeps every frame calm; up to 1 for bursts most of the time. */
  intensity: number
  style: GlitchStyle
  accent: string
  background: string
  /** The picture's rectangle as shares of the canvas, when the curator made it smaller; full screen otherwise. */
  mediaPlace?: { x: number; y: number; w: number; h: number } | null
  /** A video element already started by the curator's gesture, so the browser lets it play again. */
  video?: HTMLVideoElement | null
  text?: string
  titleFont?: string
  /** The animation as the ground, the picture clean on top at its place. */
  mediaOnTop?: boolean
  mediaZoom?: number
  /** The wordmark for the letters' filter. */
  logo?: CanvasImageSource | null
  letterAlpha?: number
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

export async function recordMontage(input: MontageRunInput): Promise<MontageRunResult> {
  const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  if (!choice) throw new Error('Ce navigateur n’enregistre pas de vidéo : utilise Chrome ou Edge sur ordinateur.')
  if (input.image) return recordStill(input, input.image, choice)
  const video = input.video ?? await loadVideo(input.src)
  const known = await videoDuration(video)
  const duration = known ?? input.trim.endSec
  const start = Math.max(0, Math.min(input.trim.startSec, duration)), end = Math.max(start + 0.5, Math.min(input.trim.endSec, duration))
  const overlays = (await Promise.all(input.overlayUrls.map(loadImage))).filter((img): img is HTMLImageElement => Boolean(img))
  const { width, height } = input.canvas
  const work = document.createElement('canvas'); work.width = width; work.height = height
  const ctx = work.getContext('2d')!
  const size = { width: video.videoWidth || 16, height: video.videoHeight || 9 }
  const mp = input.mediaPlace
  const rect = mp ? cropRectIn(size, input.canvas, { left: mp.x, top: mp.y, width: mp.w, height: mp.h }, 'centered') : cropRect(size, input.canvas, { top: 0, height: 1 }, 'centered')
  const area = mp ? { x: Math.round(mp.x * width), y: Math.round(mp.y * height), w: Math.round(mp.w * width), h: Math.round(mp.h * height) } : { x: 0, y: 0, w: width, h: height }
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
  // The video drawn into its rectangle, and the frame's own tearing: one drawer, the preview's too.
  const drawer = createDrawer({ width, height, background: input.background, rect, clip: area, overlays, intensity: input.intensity, style: input.style, accent: input.accent, ground: Boolean(mp), text: input.text, titleFont: input.titleFont, cleanOnTop: input.mediaOnTop, zoom: input.mediaZoom, logo: input.logo, letterAlpha: input.letterAlpha })
  let frame = 0
  const draw = (atMs: number) => { drawer(ctx, video, atMs, schedule, frame); frame += 1 }
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

/** A picture animated for a few seconds: the same drawer, no clip to play, no sound. */
async function recordStill(input: MontageRunInput, image: HTMLImageElement, choice: { mimeType: string; extension: 'mp4' | 'webm' }): Promise<MontageRunResult> {
  const { width, height } = input.canvas
  const seconds = input.seconds ?? 5
  const overlays = (await Promise.all(input.overlayUrls.map(loadImage))).filter((img): img is HTMLImageElement => Boolean(img))
  const work = document.createElement('canvas'); work.width = width; work.height = height
  const ctx = work.getContext('2d')!
  const size = { width: image.naturalWidth || 16, height: image.naturalHeight || 9 }
  const mp = input.mediaPlace
  const rect = mp ? cropRectIn(size, input.canvas, { left: mp.x, top: mp.y, width: mp.w, height: mp.h }, 'centered') : cropRect(size, input.canvas, { top: 0, height: 1 }, 'centered')
  const area = mp ? { x: Math.round(mp.x * width), y: Math.round(mp.y * height), w: Math.round(mp.w * width), h: Math.round(mp.h * height) } : { x: 0, y: 0, w: width, h: height }
  const drawer = createDrawer({ width, height, background: input.background, rect, clip: area, overlays, intensity: input.intensity, style: input.style, accent: input.accent, ground: Boolean(mp), text: input.text, titleFont: input.titleFont, cleanOnTop: input.mediaOnTop, zoom: input.mediaZoom, logo: input.logo, letterAlpha: input.letterAlpha })
  const schedule = burstSchedule(seconds * 1000, input.intensity, overlays.length)
  const stream = work.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  recorder.start(1000)
  const started = performance.now()
  let frame = 0
  await new Promise<void>((resolve) => {
    const tick = () => {
      const at = performance.now() - started
      if (at >= seconds * 1000) { resolve(); return }
      drawer(ctx, image, at, schedule, frame); frame += 1
      input.onProgress?.(at / 1000, seconds)
      requestAnimationFrame(tick)
    }
    tick()
  })
  recorder.stop(); await stopped
  const blob = new Blob(chunks, { type: choice.mimeType.split(';')[0] })
  if (!blob.size) throw new Error('Rien n’a été enregistré.')
  return { blob, mimeType: choice.mimeType.split(';')[0], extension: choice.extension, seconds, width, height }
}
