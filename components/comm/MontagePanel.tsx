'use client'

/**
 * The montage of a video slide, entirely in the browser: two cursors on a
 * filmstrip, the picture framed or recentred into the format, the slide's
 * dressing over it, and the browser recording the result as it plays, to
 * MP4 when it can. Or one frame of it, as a picture. Nothing leaves the
 * browser before the finished file goes to the queue's store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { bandOf, clampTrim, cropRect, expectedSeconds, filmstripTimes, recorderChoice, type CropMode } from '@/lib/comm/montage'
import { uploadMedia, formatBytes, videoDuration } from '@/lib/comm/client'
import { formatSeconds } from '@/lib/comm/capture'
import type { MediaDoc } from '@/lib/comm/model'
import type { Template } from '@/lib/comm/templates'

export type MontagePanelProps = {
  queueItemId: string
  media: MediaDoc
  template: Template
  canvas: { width: number; height: number }
  /** The slide's dressing, transparent, from the engine. */
  overlayUrl: string
  /** The palette's base colour, behind a framed picture. */
  background: string
  maxSeconds: number
  onClose: () => void
  /** The montage or the still is in the queue: the slide switches to it. */
  onDone: (media: MediaDoc) => void
}

type Phase = 'loading' | 'ready' | 'rendering' | 'uploading' | 'error'

export default function MontagePanel({ queueItemId, media, template, canvas, overlayUrl, background, maxSeconds, onClose, onDone }: MontagePanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLImageElement | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(0)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [trim, setTrim] = useState(media.trim ?? { startSec: 0, endSec: 0 })
  const [mode, setMode] = useState<CropMode>(media.crop?.mode ?? (template.mode === 'framed' ? 'framed' : 'centered'))
  const [offset, setOffset] = useState({ x: media.crop?.x ?? 0, y: media.crop?.y ?? 0 })
  const [strip, setStrip] = useState<string[]>([])
  const [progress, setProgress] = useState('')
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const band = useMemo(() => bandOf(template.layers), [template])

  // The video, from the queue's store; its length and size once known.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onMeta = () => {
      void videoDuration(video).then((known) => {
        const d = known ?? media.durationSec ?? 0
        setDuration(d); setSize({ width: video.videoWidth, height: video.videoHeight })
        setTrim((current) => (current.endSec > 0 ? clampTrim(current.startSec, current.endSec, d, maxSeconds) : clampTrim(0, d, d, maxSeconds)))
        setPhase('ready')
      })
    }
    const onError = () => { setPhase('error'); setError('Le navigateur ne lit pas ce fichier. Sur téléphone, termine le montage sur l’ordinateur.') }
    video.addEventListener('loadedmetadata', onMeta); video.addEventListener('error', onError)
    video.crossOrigin = 'anonymous'; video.preload = 'auto'; video.muted = true; video.playsInline = true
    video.src = media.blobUrl
    return () => { video.removeEventListener('loadedmetadata', onMeta); video.removeEventListener('error', onError) }
  }, [media.blobUrl, media.durationSec, maxSeconds])

  const seek = useCallback((video: HTMLVideoElement, time: number) => new Promise<void>((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); resolve() }
    video.addEventListener('seeked', done); video.currentTime = time
  }), [])

  // The filmstrip: a dozen frames across the clip, drawn small.
  useEffect(() => {
    const video = videoRef.current
    if (phase !== 'ready' || !video || !duration || strip.length) return
    let cancelled = false
    void (async () => {
      const frames: string[] = []
      const canvasEl = document.createElement('canvas'); canvasEl.width = 160; canvasEl.height = Math.round(160 * (size.height || 9) / (size.width || 16))
      const ctx = canvasEl.getContext('2d')!
      for (const time of filmstripTimes(duration, 12)) {
        if (cancelled) return
        await seek(video, time)
        ctx.drawImage(video, 0, 0, canvasEl.width, canvasEl.height)
        frames.push(canvasEl.toDataURL('image/jpeg', 0.6))
      }
      if (!cancelled) { setStrip(frames); await seek(video, trim.startSec) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the metadata is known
  }, [phase, duration])

  const rect = useMemo(() => cropRect(size, canvas, band, mode, offset), [size, canvas, band, mode, offset])

  /** Draws one frame: the base, the video where the crop puts it, the dressing over it. */
  const draw = useCallback((ctx: CanvasRenderingContext2D, video: HTMLVideoElement) => {
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (mode === 'centered') { ctx.save(); ctx.beginPath(); ctx.rect(0, Math.round(band.top * canvas.height), canvas.width, Math.round(band.height * canvas.height)); ctx.clip() }
    ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h)
    if (mode === 'centered') ctx.restore()
    const overlay = overlayRef.current
    if (overlay && overlay.complete && overlay.naturalWidth) ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height)
  }, [background, band, canvas, mode, rect])

  // The preview follows the cursors and the crop.
  useEffect(() => {
    const video = videoRef.current, preview = previewRef.current
    if (phase !== 'ready' || !video || !preview) return
    let cancelled = false
    void (async () => { await seek(video, trim.startSec); if (!cancelled) draw(preview.getContext('2d')!, video) })()
    return () => { cancelled = true }
  }, [phase, trim.startSec, draw, seek])

  const onPointerDown = (event: React.PointerEvent) => { if (mode !== 'centered') return; dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; (event.target as Element).setPointerCapture(event.pointerId) }
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current; if (!drag) return
    const el = event.currentTarget as HTMLElement
    const dx = (event.clientX - drag.x) / el.clientWidth * 2, dy = (event.clientY - drag.y) / el.clientHeight * 2
    setOffset({ x: Math.max(-1, Math.min(1, drag.ox - dx)), y: Math.max(-1, Math.min(1, drag.oy - dy)) })
  }
  const onPointerUp = () => { dragRef.current = null }

  /** The montage: the clip plays between the cursors, each frame drawn and recorded; the file goes to the queue. */
  const render = useCallback(async () => {
    const video = videoRef.current
    if (!video || phase !== 'ready') return
    const choice = recorderChoice((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
    if (!choice) { setError('Ce navigateur n’enregistre pas de vidéo. Termine sur Chrome ou Edge, sur ordinateur.'); return }
    setPhase('rendering'); setError(''); setProgress(`0 / ${formatSeconds(trim.endSec - trim.startSec)}`)
    const work = document.createElement('canvas'); work.width = canvas.width; work.height = canvas.height
    const ctx = work.getContext('2d')!
    const stream = work.captureStream(30)
    // The sound: the clip's own, routed to the recording and not to the speakers.
    let audio: AudioContext | null = null
    try {
      audio = new AudioContext()
      const source = audio.createMediaElementSource(video)
      const sink = audio.createMediaStreamDestination()
      source.connect(sink)
      for (const track of sink.stream.getAudioTracks()) stream.addTrack(track)
      video.muted = false; video.volume = 1
    } catch { /* no sound track then */ }
    const recorder = new MediaRecorder(stream, { mimeType: choice.mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
    await seek(video, trim.startSec)
    draw(ctx, video)
    recorder.start(1000)
    const started = performance.now()
    let frameHandle = 0
    const tick = () => {
      draw(ctx, video)
      setProgress(`${formatSeconds(video.currentTime - trim.startSec)} / ${formatSeconds(trim.endSec - trim.startSec)}`)
      if (video.currentTime >= trim.endSec - 0.04 || video.ended) { finish(); return }
      frameHandle = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.(tick) ?? requestAnimationFrame(tick)
    }
    let finished = false
    const finish = () => {
      if (finished) return; finished = true
      video.pause(); if (frameHandle) cancelAnimationFrame(frameHandle)
      recorder.stop()
    }
    const guard = window.setTimeout(finish, (expectedSeconds(trim.startSec, trim.endSec) + 5) * 1000)
    try { await video.play() } catch { finish() }
    tick()
    await stopped
    window.clearTimeout(guard)
    video.muted = true
    try { await audio?.close() } catch { /* ignore */ }
    const blob = new Blob(chunks, { type: choice.mimeType.split(';')[0] })
    const seconds = Math.round(((performance.now() - started) / 1000) * 100) / 100
    if (!blob.size) { setPhase('ready'); setError('Rien n’a été enregistré.'); return }
    setPhase('uploading'); setProgress(`Envoi de ${formatBytes(blob.size)}`)
    const uploaded = await uploadMedia(queueItemId, blob, 'montage', (f) => setProgress(`Envoi ${Math.round(f * 100)} %`), {
      trim, crop: { mode, x: offset.x, y: offset.y, w: rect.w, h: rect.h }, sourceMediaId: media._id, templateKey: template.key, durationSec: Math.min(seconds, trim.endSec - trim.startSec),
    })
    if (!uploaded.media) { setPhase('ready'); setError(uploaded.message ?? 'Envoi impossible. Le média d’origine reste dans la file.'); return }
    onDone(uploaded.media)
  }, [canvas, draw, media._id, mode, offset, onDone, phase, queueItemId, rect, seek, template.key, trim])

  /** One frame, as a picture, at the start cursor. */
  const still = useCallback(async () => {
    const video = videoRef.current
    if (!video || phase !== 'ready') return
    setPhase('uploading'); setError(''); setProgress('Image fixe')
    await seek(video, trim.startSec)
    const work = document.createElement('canvas'); work.width = size.width || canvas.width; work.height = size.height || canvas.height
    work.getContext('2d')!.drawImage(video, 0, 0, work.width, work.height)
    const blob = await new Promise<Blob | null>((resolve) => work.toBlob(resolve, 'image/png'))
    if (!blob) { setPhase('ready'); setError('L’image n’a pas pu être extraite (vidéo d’un autre site ?).'); return }
    const uploaded = await uploadMedia(queueItemId, blob, 'still', (f) => setProgress(`Envoi ${Math.round(f * 100)} %`), { sourceMediaId: media._id, trim: { startSec: trim.startSec, endSec: trim.startSec + 0.04 } })
    if (!uploaded.media) { setPhase('ready'); setError(uploaded.message ?? 'Envoi impossible.'); return }
    onDone(uploaded.media)
  }, [canvas, media._id, onDone, phase, queueItemId, seek, size, trim.startSec])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && phase !== 'rendering' && phase !== 'uploading') onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [onClose, phase])

  const small = 'rounded border border-white/40 px-2 py-1 text-xs disabled:opacity-40'
  const busy = phase === 'rendering' || phase === 'uploading'
  const length = Math.max(0, trim.endSec - trim.startSec)

  return (
    <div role="dialog" aria-modal="true" aria-label="Montage" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3" onClick={() => { if (!busy) onClose() }}>
      <div className="w-full max-w-4xl rounded-2xl border border-white/30 bg-[#191916] p-4 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <header className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Montage de l’extrait</h2><button className={small} disabled={busy} onClick={onClose}>Fermer (Échap)</button></header>
        <video ref={videoRef} className="hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element -- the dressing drawn over each frame */}
        <img ref={overlayRef} src={overlayUrl} alt="" crossOrigin="anonymous" className="hidden" />
        {phase === 'loading' ? <p role="status">Lecture du fichier…</p> : null}
        {error ? <p role="alert" className="mb-2 text-red-300">{error}</p> : null}
        {phase !== 'loading' && phase !== 'error' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex gap-1 overflow-x-auto">{strip.map((src, i) => (
                /* eslint-disable-next-line @next/next/no-img-element -- the filmstrip */
                <img key={i} src={src} alt="" className="h-12 flex-none cursor-pointer rounded" onClick={() => setTrim((t) => clampTrim(filmstripTimes(duration, 12)[i], t.endSec, duration, maxSeconds))} />
              ))}</div>
              <label className="block">Début {formatSeconds(trim.startSec)}<input type="range" min={0} max={duration} step={0.1} value={trim.startSec} disabled={busy} onChange={(e) => setTrim((t) => clampTrim(Number(e.target.value), Math.max(Number(e.target.value) + 0.5, t.endSec), duration, maxSeconds))} className="w-full" /></label>
              <label className="block">Fin {formatSeconds(trim.endSec)} · {formatSeconds(length)} au total, {maxSeconds} s au plus<input type="range" min={0} max={duration} step={0.1} value={trim.endSec} disabled={busy} onChange={(e) => setTrim((t) => clampTrim(t.startSec, Number(e.target.value), duration, maxSeconds))} className="w-full" /></label>
              <div>Cadrage <button className={`${small} ml-2 ${mode === 'framed' ? 'bg-white text-black' : ''}`} disabled={busy} onClick={() => setMode('framed')}>encadré</button> <button className={`${small} ${mode === 'centered' ? 'bg-white text-black' : ''}`} disabled={busy} onClick={() => setMode('centered')}>recentré</button>{mode === 'centered' ? <span className="ml-2 text-xs text-gray-300">glisse l’aperçu pour choisir la zone visible</span> : null}</div>
              <p className="text-xs text-gray-300">Le montage joue l’extrait une fois, en temps réel : environ {expectedSeconds(trim.startSec, trim.endSec)} s. Ne change pas d’onglet pendant ce temps.</p>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border border-white px-4 py-2 text-sm font-bold uppercase disabled:opacity-40" disabled={busy || !length} onClick={render}>Monter l’extrait</button>
                <button className="rounded-full border border-white px-4 py-2 text-sm font-bold uppercase disabled:opacity-40" disabled={busy} onClick={still}>Image fixe à {formatSeconds(trim.startSec)}</button>
              </div>
              {busy ? <p role="status">{phase === 'rendering' ? 'Montage' : 'Envoi'}… {progress}</p> : null}
            </div>
            <div className="mx-auto w-full max-w-xs touch-none select-none" style={{ aspectRatio: `${canvas.width} / ${canvas.height}`, cursor: mode === 'centered' ? 'grab' : 'default' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              <canvas ref={previewRef} width={canvas.width} height={canvas.height} className="h-full w-full rounded border border-white/30" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
