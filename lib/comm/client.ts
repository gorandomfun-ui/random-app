/**
 * The browser side of the queue: the calls to the tool's routes, the direct
 * upload to Blob (a short token from the server, the file never crossing a
 * function), and what the browser can measure of a file before sending it.
 */

import type { MediaDoc, MediaKind, QueueItem } from './model'

export type QueueItemWithMedia = QueueItem & { media: MediaDoc[] }
export type QueueStatus = { count: number; max: number; blob: boolean }

const headers = { 'Content-Type': 'application/json' }

async function read<T>(response: Response): Promise<T & { status: number }> {
  const body = (await response.json().catch(() => ({}))) as T
  return { ...body, status: response.status }
}

export function commStatusOf(itemId: string) {
  return fetch(`/api/admin/comm/queue?itemId=${encodeURIComponent(itemId)}`, { cache: 'no-store' })
    .then((r) => read<QueueStatus & { inQueue: boolean; item: QueueItemWithMedia | null; error?: string }>(r))
}

export function commAdd(itemId: string) {
  return fetch('/api/admin/comm/queue', { method: 'POST', headers, body: JSON.stringify({ itemId }) })
    .then((r) => read<QueueStatus & { item?: QueueItemWithMedia; error?: string }>(r))
}

export function commRemove(queueItemId: string) {
  return fetch(`/api/admin/comm/queue/${encodeURIComponent(queueItemId)}`, { method: 'DELETE', headers })
    .then((r) => read<QueueStatus & { removed: boolean }>(r))
}

export function commList() {
  return fetch('/api/admin/comm/queue', { cache: 'no-store' }).then((r) => read<QueueStatus & { items: QueueItemWithMedia[]; error?: string }>(r))
}

export function commItem(queueItemId: string) {
  return fetch(`/api/admin/comm/queue/${encodeURIComponent(queueItemId)}`, { cache: 'no-store' }).then((r) => read<{ item?: QueueItemWithMedia }>(r))
}

export function commRemoveMedia(mediaId: string) {
  return fetch(`/api/admin/comm/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE', headers }).then((r) => read<{ removed: boolean }>(r))
}

export function commImportSource(queueItemId: string, what: 'image' | 'gif' | 'thumb') {
  return fetch('/api/admin/comm/media/import', { method: 'POST', headers, body: JSON.stringify({ queueItemId, what }) })
    .then((r) => read<{ media?: MediaDoc; error?: string; message?: string }>(r))
}

export type MediaProbe = { width: number | null; height: number | null; durationSec: number | null; animated: boolean }

/** Width, height and length of a file, read by the browser itself; nulls when it cannot. */
/**
 * A video's real length. A WebM the browser just recorded says "infinite"
 * until it is asked to seek past its end: then it knows.
 */
export function videoDuration(video: HTMLVideoElement): Promise<number | null> {
  return new Promise((resolve) => {
    if (Number.isFinite(video.duration) && video.duration > 0) { resolve(Math.round(video.duration * 100) / 100); return }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      video.removeEventListener('durationchange', finish); video.removeEventListener('seeked', finish)
      const d = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 100) / 100 : null
      try { video.currentTime = 0 } catch { /* ignore */ }
      resolve(d)
    }
    video.addEventListener('durationchange', finish); video.addEventListener('seeked', finish)
    setTimeout(finish, 4000)
    try { video.currentTime = 1e7 } catch { finish() }
  })
}

export function probeMedia(file: Blob): Promise<MediaProbe> {
  const type = file.type.toLowerCase()
  const url = URL.createObjectURL(file)
  const done = (probe: MediaProbe) => { URL.revokeObjectURL(url); return probe }
  if (type.startsWith('video/')) {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => { void videoDuration(video).then((durationSec) => resolve(done({ width: video.videoWidth || null, height: video.videoHeight || null, durationSec, animated: true }))) }
      video.onerror = () => resolve(done({ width: null, height: null, durationSec: null, animated: true }))
      video.src = url
    })
  }
  if (type.startsWith('image/')) {
    return new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve(done({ width: image.naturalWidth || null, height: image.naturalHeight || null, durationSec: null, animated: type === 'image/gif' }))
      image.onerror = () => resolve(done({ width: null, height: null, durationSec: null, animated: type === 'image/gif' }))
      image.src = url
    })
  }
  return Promise.resolve(done({ width: null, height: null, durationSec: null, animated: false }))
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }

function randomName(contentType: string): string {
  const bytes = new Uint8Array(12); crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const ext = EXT[contentType] ?? ''
  return ext ? `${hex}.${ext}` : hex
}

export type UploadResult = { media?: MediaDoc; error?: string; message?: string }

/** One frame of a clip, a little after its start, as a JPEG; null when the browser cannot draw it. */
export function posterOf(file: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.preload = 'auto'
    const done = (blob: Blob | null) => { URL.revokeObjectURL(url); resolve(blob) }
    const timer = setTimeout(() => done(null), 8000)
    video.onerror = () => { clearTimeout(timer); done(null) }
    video.onloadeddata = () => {
      void videoDuration(video).then((d) => {
        const at = Math.min(1, (d ?? 1) * 0.1)
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          try {
            const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
            canvas.getContext('2d')!.drawImage(video, 0, 0)
            canvas.toBlob((blob) => { clearTimeout(timer); done(blob) }, 'image/jpeg', 0.9)
          } catch { clearTimeout(timer); done(null) }
        }
        video.addEventListener('seeked', onSeeked)
        video.currentTime = at
      })
    }
    video.src = url
  })
}

/** A clip without its poster gets one, so the engine can draw its slide; fetched from the store when needed. */
export async function ensurePoster(media: MediaDoc, all: MediaDoc[]): Promise<MediaDoc | null> {
  if (!media.contentType.startsWith('video/') || media.kind === 'montage') return null
  if (all.some((m) => m.kind === 'poster' && m.sourceMediaId === media._id)) return null
  try {
    const file = await (await fetch(media.blobUrl, { cache: 'no-store' })).blob()
    const poster = await posterOf(file)
    if (!poster) return null
    const uploaded = await uploadMedia(media.queueItemId, poster, 'poster', undefined, { sourceMediaId: media._id })
    return uploaded.media ?? null
  } catch { return null }
}

/** Sends a file straight to the item's Blob folder, then records it with what the browser measured. */
export type UploadExtra = { trim?: { startSec: number; endSec: number }; crop?: { mode: 'framed' | 'centered'; x: number; y: number; w: number; h: number }; sourceMediaId?: string; templateKey?: string; durationSec?: number }

export async function uploadMedia(queueItemId: string, file: Blob, kind: MediaKind, onProgress?: (fraction: number) => void, extra: UploadExtra = {}): Promise<UploadResult> {
  const contentType = (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  if (!EXT[contentType]) return { error: 'type', message: `Format non pris en charge : ${contentType || 'inconnu'}.` }
  const probe = await probeMedia(file)
  let blobUrl = ''
  try {
    const { upload } = await import('@vercel/blob/client')
    const result = await upload(`comm/${queueItemId}/${randomName(contentType)}`, file, {
      access: 'public', handleUploadUrl: '/api/admin/comm/upload', clientPayload: queueItemId, contentType,
      multipart: file.size > 50 * 1024 * 1024,
      onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage / 100) : undefined,
    })
    blobUrl = result.url
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: 'upload', message: /no-blob|Blob n’est pas configuré|BLOB_READ_WRITE_TOKEN/i.test(message) ? 'Le stockage Blob n’est pas configuré sur le projet.' : `Envoi impossible : ${message}` }
  }
  // A file the browser just recorded may not tell its length yet: the montage knows it.
  const measured = { ...probe, ...(probe.durationSec == null && extra.durationSec ? { durationSec: extra.durationSec } : {}) }
  const registered = await fetch('/api/admin/comm/media', { method: 'POST', headers, body: JSON.stringify({ queueItemId, kind, blobUrl, contentType, bytes: file.size, ...measured, trim: extra.trim, crop: extra.crop, sourceMediaId: extra.sourceMediaId, templateKey: extra.templateKey }) })
    .then((r) => read<{ media?: MediaDoc; error?: string }>(r))
  if (!registered.media) return { error: registered.error ?? 'register', message: 'Le fichier est envoyé mais n’a pas pu être enregistré.' }
  // A clip brought in gets its poster right away: the slide can then be drawn with it.
  if ((kind === 'capture' || kind === 'import') && contentType.startsWith('video/')) {
    try {
      const poster = await posterOf(file)
      if (poster) await uploadMedia(queueItemId, poster, 'poster', undefined, { sourceMediaId: registered.media._id })
    } catch { /* the thumbnail will do */ }
  }
  return { media: registered.media }
}

/** A picture of an element as it shows, for a site, a quiz or a text. */
export async function screenshotOf(element: HTMLElement): Promise<Blob | null> {
  const { toBlob } = await import('html-to-image')
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  try { return await toBlob(element, { pixelRatio: ratio, cacheBust: true, backgroundColor: '#191916' }) } catch { return null }
}

/**
 * True when the browser can film its own tab with its sound: Chrome and Edge
 * on a computer. Safari offers a window or the screen, without the tab's
 * sound, and holds the player back; Firefox has no tab capture either.
 */
export function canCaptureTab(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  if (!navigator.mediaDevices || !('getDisplayMedia' in navigator.mediaDevices)) return false
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) return false
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent) || 'CropTarget' in window
  return chromium
}

/** A computer's browser that is not Chrome: the message names the way out. */
export function desktopWithoutTabCapture(): boolean {
  return typeof navigator !== 'undefined' && !/iPhone|iPad|Android/i.test(navigator.userAgent) && !canCaptureTab()
}

export const CHROME_NOTE = 'La capture d’un extrait filme l’onglet avec son son : seul Chrome (ou Edge) sait le faire. Ouvre cette page dans Chrome, ou importe un enregistrement.'

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '')} Mo`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${bytes} o`
}

export const LICENSE_COLORS: Record<string, string> = { permissif: '#0FC55D', partage: '#E5972B', prudence: '#D90845' }
export const LICENSE_WORDS: Record<string, string> = {
  permissif: 'Licence permissive : usage libre, crédit apprécié.',
  partage: 'Partage avec attribution : la source doit rester visible.',
  prudence: 'Prudence : œuvre d’un créateur, tous droits réservés par défaut. Extrait court, crédit et lien en évidence.',
}
