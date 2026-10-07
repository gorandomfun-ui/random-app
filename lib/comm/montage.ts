/**
 * The montage, in the browser: the clip cut between two cursors, framed or
 * recentred into the format's canvas, the slide's dressing drawn over it,
 * recorded straight to MP4 by the browser itself. Pure helpers here: the
 * geometry and the plan; the panel drives the elements.
 */

export type CropMode = 'framed' | 'centered'

export type Band = { top: number; height: number }

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * Where the video goes on the canvas. Framed: the whole picture, centred in
 * the band the template leaves it (letterboxed in the palette's base).
 * Centred: the picture covers the band, and the offset (−1…1) slides the
 * visible part sideways or up and down.
 */
export function cropRect(video: { width: number; height: number }, canvas: { width: number; height: number }, band: Band, mode: CropMode, offset: { x: number; y: number } = { x: 0, y: 0 }): Rect {
  const areaTop = Math.round(band.top * canvas.height), areaHeight = Math.round(band.height * canvas.height)
  const areaWidth = canvas.width
  if (!video.width || !video.height) return { x: 0, y: areaTop, w: areaWidth, h: areaHeight }
  const scale = mode === 'framed' ? Math.min(areaWidth / video.width, areaHeight / video.height) : Math.max(areaWidth / video.width, areaHeight / video.height)
  const w = Math.round(video.width * scale), h = Math.round(video.height * scale)
  const slackX = w - areaWidth, slackY = h - areaHeight
  const ox = Math.max(-1, Math.min(1, offset.x)), oy = Math.max(-1, Math.min(1, offset.y))
  // Framed: centred, the slack is negative (bars); centred: the offset moves within the positive slack.
  const x = Math.round((areaWidth - w) / 2 - (slackX > 0 ? ox * slackX / 2 : 0))
  const y = Math.round(areaTop + (areaHeight - h) / 2 - (slackY > 0 ? oy * slackY / 2 : 0))
  return { x, y, w, h }
}

/** The band a template leaves to its media: its media layer's top and height, or the whole canvas. */
export function bandOf(layers: Array<{ type: string; top?: number; height?: number }>): Band {
  const media = layers.find((layer) => layer.type === 'media')
  return { top: media?.top ?? 0, height: media?.height ?? 1 }
}

/** The instants of the filmstrip: `count` frames spread over the clip. */
export function filmstripTimes(duration: number, count = 12): number[] {
  if (!(duration > 0)) return []
  const n = Math.max(1, Math.min(60, Math.floor(count)))
  return Array.from({ length: n }, (_, i) => Math.min(duration - 0.05, (i + 0.5) * duration / n)).map((t) => Math.max(0, Math.round(t * 100) / 100))
}

/** The cut, kept inside the clip and under the longest extract allowed. */
export function clampTrim(start: number, end: number, duration: number, maxSeconds: number): { startSec: number; endSec: number } {
  const total = Math.max(0, duration)
  let s = Math.max(0, Math.min(start, total))
  let e = Math.max(s, Math.min(end, total))
  if (e - s < 0.5) e = Math.min(total, s + 0.5)
  if (e - s > maxSeconds) e = s + maxSeconds
  if (e - s < 0.5 && total >= 0.5) s = Math.max(0, e - 0.5)
  return { startSec: Math.round(s * 100) / 100, endSec: Math.round(e * 100) / 100 }
}

/** The recorder's format, mp4 first; the file name follows. */
export function recorderChoice(isSupported: (type: string) => boolean): { mimeType: string; extension: 'mp4' | 'webm' } | null {
  for (const mimeType of ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']) if (isSupported(mimeType)) return { mimeType, extension: 'mp4' }
  for (const mimeType of ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm']) if (isSupported(mimeType)) return { mimeType, extension: 'webm' }
  return null
}

/** How long the montage will take: it plays in real time, plus a moment to start and finish. */
export function expectedSeconds(startSec: number, endSec: number): number {
  return Math.ceil(endSec - startSec + 2)
}
