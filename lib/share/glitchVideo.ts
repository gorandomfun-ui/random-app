/**
 * The story card, animated: three seconds of the branded card with the
 * site's glitch — slices shifted sideways, a ghost of the image, the cyan
 * and pink bars — in three short hits, the card clean the rest of the time.
 *
 * Drawn on a canvas in the browser and recorded by the browser itself: an
 * MP4 where the browser records MP4 (iPhone, Safari), a WebM elsewhere.
 * The server has no video tool, and a GIF is no story.
 */

export type GlitchOptions = { seconds?: number; fps?: number; width?: number; height?: number }
export const STORY_VIDEO = { seconds: 3, fps: 30, width: 1080, height: 1920 } as const

/** Where the hits fall, in seconds: a clean start, three hits, a clean end. */
export const BURSTS: ReadonlyArray<readonly [number, number]> = [[0.35, 0.6], [1.25, 1.5], [2.15, 2.45]]

/** How hard the glitch hits at this second: 0 clean, 1 at the middle of a hit. */
export function burstIntensity(t: number): number {
  for (const [start, end] of BURSTS) {
    if (t < start || t >= end) continue
    const middle = (start + end) / 2
    const half = (end - start) / 2
    return Math.max(0, 1 - Math.abs(t - middle) / half) * 0.7 + 0.3
  }
  return 0
}

/** The recording formats, the ones the story apps take first: MP4 before WebM. */
export const MIME_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const

export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  for (const type of MIME_TYPES) {
    try { if (isSupported(type)) return type } catch { /* An older browser throws on an unknown type. */ }
  }
  return null
}

export function fileNameFor(mimeType: string): string {
  return mimeType.startsWith('video/mp4') ? 'gorandom-story.mp4' : 'gorandom-story.webm'
}

export function canRenderGlitchStory(): boolean {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return false
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false
  return pickMimeType((type) => MediaRecorder.isTypeSupported(type)) != null
}

type Rng = () => number

/** One frame: the card, and on a hit, its slices shifted, a ghost, the bars. */
export function drawGlitchFrame(ctx: CanvasRenderingContext2D, image: CanvasImageSource, t: number, width: number, height: number, random: Rng = Math.random): void {
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  const hit = burstIntensity(t)
  if (!hit) return

  // A ghost of the card, a few pixels off.
  ctx.globalAlpha = 0.28 * hit
  ctx.drawImage(image, Math.round((random() - 0.5) * 24 * hit), Math.round((random() - 0.5) * 6), width, height)
  ctx.globalAlpha = 1

  // Slices of the card shifted sideways.
  const slices = 4 + Math.floor(random() * 8 * hit)
  for (let index = 0; index < slices; index += 1) {
    const sliceHeight = 8 + Math.floor(random() * 90)
    const y = Math.floor(random() * (height - sliceHeight))
    const shift = Math.round((random() - 0.5) * 140 * hit)
    ctx.drawImage(image, 0, y, width, sliceHeight, shift, y, width, sliceHeight)
  }

  // The site's bars: cyan and pink, thin, translucent.
  const bars = 1 + Math.floor(random() * 3)
  for (let index = 0; index < bars; index += 1) {
    ctx.globalAlpha = 0.25 + random() * 0.25
    ctx.fillStyle = random() < 0.5 ? '#00eaff' : '#ff006f'
    const barHeight = 3 + Math.floor(random() * 12)
    const barWidth = Math.floor(width * (0.4 + random() * 0.7))
    ctx.fillRect(Math.floor((random() - 0.6) * width * 0.5), Math.floor(random() * height), barWidth, barHeight)
  }
  ctx.globalAlpha = 1
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('card not loaded'))
    image.src = url
  })
}

/**
 * Renders the animated story from the card and hands back the video file,
 * or null when this browser cannot record one.
 */
export async function renderGlitchStory(cardUrl: string, options: GlitchOptions = {}): Promise<File | null> {
  if (!canRenderGlitchStory()) return null
  const { seconds, fps, width, height } = { ...STORY_VIDEO, ...options }
  const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
  if (!mimeType) return null
  const image = await loadImage(cardUrl)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawGlitchFrame(ctx, image, 0, width, height)

  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const finished = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  recorder.start(250)

  const startedAt = performance.now()
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - startedAt) / 1000
      if (t >= seconds) { resolve(); return }
      drawGlitchFrame(ctx, image, t, width, height)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  recorder.stop()
  await finished
  for (const track of stream.getTracks()) track.stop()
  if (!chunks.length) return null
  const type = mimeType.split(';')[0]
  return new File(chunks, fileNameFor(mimeType), { type })
}
