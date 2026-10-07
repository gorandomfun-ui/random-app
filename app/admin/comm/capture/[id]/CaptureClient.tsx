'use client'

/**
 * Capture mode. On a computer (Chrome, Edge): the browser films its own tab,
 * cropped to the player when it can, the curator allowing it every time. On
 * a phone: the same bare player, and the phone's own screen recording, then
 * an import. Nothing bypasses what the browser refuses to capture.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { canCaptureTab, commItem, uploadMedia, type QueueItemWithMedia } from '@/lib/comm/client'
import { captureEmbedUrl, COVER_SECONDS, formatSeconds, parseStartSeconds, pickRecorderType } from '@/lib/comm/capture'
import { clipMaxSeconds } from '@/lib/comm/model'

type Phase = 'idle' | 'asking' | 'covered' | 'recording' | 'uploading' | 'done'

export default function CaptureClient({ queueItemId }: { queueItemId: string }) {
  const [item, setItem] = useState<QueueItemWithMedia | null>(null)
  const [error, setError] = useState('')
  const [startText, setStartText] = useState('0:00')
  const [coverText, setCoverText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState('')
  const [playerSrc, setPlayerSrc] = useState<string | null>(null)
  const playerBox = useRef<HTMLDivElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const desktop = canCaptureTab()
  const maxSeconds = clipMaxSeconds()

  useEffect(() => {
    void commItem(queueItemId).then((body) => { if (body.item) setItem(body.item); else setError('Cet élément n’est plus dans la file.') })
  }, [queueItemId])

  const embed = useMemo(() => (item ? captureEmbedUrl(item.snapshot.url, item.snapshot.provider, parseStartSeconds(startText), typeof window === 'undefined' ? '' : window.location.origin) : null), [item, startText])
  const coverSeconds = coverText ? Math.max(0, Math.min(15, Number(coverText) || 0)) : embed ? COVER_SECONDS[embed.provider] : 4

  const stopTracks = useCallback(() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null }, [])

  const finish = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
    recorder.stop()
    await stopped
    stopTracks()
    setPlayerSrc(null)
    const type = recorder.mimeType.split(';')[0] || 'video/webm'
    const blob = new Blob(chunksRef.current, { type })
    chunksRef.current = []
    if (!blob.size) { setPhase('idle'); setError('Rien n’a été enregistré.'); return }
    setPhase('uploading'); setProgress(0)
    const uploaded = await uploadMedia(queueItemId, blob, 'capture', setProgress)
    setProgress(null)
    if (uploaded.media) { setPhase('done'); setResult(`Extrait de ${Math.round(uploaded.media.durationSec ?? elapsed)} s enregistré dans la file (${type}).`) }
    else { setPhase('idle'); setError(uploaded.message ?? 'Envoi impossible.') }
  }, [elapsed, queueItemId, stopTracks])

  const beginRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const type = pickRecorderType((candidate) => MediaRecorder.isTypeSupported(candidate))
    const recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined)
    chunksRef.current = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
    recorderRef.current = recorder
    recorder.start(1000)
    startedAtRef.current = performance.now()
    setElapsed(0); setPhase('recording')
    timerRef.current = window.setInterval(() => {
      const seconds = (performance.now() - startedAtRef.current) / 1000
      setElapsed(seconds)
      if (seconds >= maxSeconds) void finish()
    }, 250)
  }, [finish, maxSeconds])

  const start = useCallback(async () => {
    if (!embed || !desktop) return
    setError(''); setResult(''); setPhase('asking')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } }, audio: true,
        // Chrome: offer this very tab, keep the picker on tabs, keep the capture here.
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
      } as DisplayMediaStreamOptions)
      streamRef.current = stream
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { void finish() })
      const CropTargetApi = (window as unknown as { CropTarget?: { fromElement: (element: Element) => Promise<unknown> } }).CropTarget
      const track = stream.getVideoTracks()[0] as MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> }
      if (CropTargetApi && track?.cropTo && playerBox.current) {
        try { await track.cropTo(await CropTargetApi.fromElement(playerBox.current)) } catch { /* the whole tab then; the crop comes later in the editor */ }
      }
      if (!stream.getAudioTracks().length) setError('Sans le son : coche « Partager l’audio de l’onglet » dans la fenêtre du navigateur la prochaine fois.')
    } catch {
      setPhase('idle'); setError('Capture refusée ou impossible dans ce navigateur (Chrome ou Edge sur ordinateur).')
      return
    }
    setPlayerSrc(embed.src)
    setPhase('covered'); setCountdown(coverSeconds)
    let left = coverSeconds
    const tick = window.setInterval(() => {
      left -= 1; setCountdown(left)
      if (left <= 0) { window.clearInterval(tick); beginRecording() }
    }, 1000)
    if (coverSeconds === 0) { window.clearInterval(tick); beginRecording() }
  }, [beginRecording, coverSeconds, desktop, embed, finish])

  // On a phone: the bare player with its cover, the phone's own recorder running.
  const startPhone = useCallback(() => {
    if (!embed) return
    setError(''); setResult(''); setPlayerSrc(embed.src); setPhase('covered'); setCountdown(coverSeconds)
    let left = coverSeconds
    const tick = window.setInterval(() => {
      left -= 1; setCountdown(left)
      if (left <= 0) { window.clearInterval(tick); setPhase('recording'); startedAtRef.current = performance.now(); timerRef.current = window.setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 250) }
    }, 1000)
  }, [coverSeconds, embed])

  const stopPhone = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    setPlayerSrc(null); setPhase('idle')
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 's') { if (phase === 'recording') { event.preventDefault(); if (desktop) void finish(); else stopPhone() } }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, finish, phase, stopPhone])

  useEffect(() => () => { stopTracks(); if (timerRef.current) window.clearInterval(timerRef.current) }, [stopTracks])

  const onFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = ''
    for (const file of files) {
      setPhase('uploading'); setProgress(0); setError('')
      const uploaded = await uploadMedia(queueItemId, file, 'import', setProgress)
      setProgress(null)
      if (uploaded.media) { setPhase('done'); setResult(`${file.name} est dans la file.`) } else { setPhase('idle'); setError(uploaded.message ?? 'Envoi impossible.') }
    }
  }, [queueItemId])

  const filming = phase === 'covered' || phase === 'recording'

  return (
    <main className="min-h-screen bg-black text-white">
      {!filming ? (
        <div className="mx-auto max-w-2xl space-y-4 px-5 py-8">
          <nav className="text-sm"><Link href="/admin/comm" className="underline">← La file</Link></nav>
          <h1 className="text-2xl font-bold">Capturer un extrait</h1>
          {error ? <p role="alert" className="text-red-300">{error}</p> : null}
          {item ? <p className="text-sm text-gray-300"><span className="font-bold text-white">{item.snapshot.title}</span><br />{item.snapshot.providerLabel}{item.snapshot.author ? ` · ${item.snapshot.author}` : ''}{item.snapshot.durationSec ? ` · ${formatSeconds(item.snapshot.durationSec)}` : ''}</p> : null}
          {item && !embed ? <p className="text-amber-300">Ce lecteur ne se capture pas ici. Importe un enregistrement à la place.</p> : null}
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label>À partir de<br /><input className="mt-1 w-28 rounded border border-white/40 bg-black px-2 py-1" value={startText} onChange={(e) => setStartText(e.target.value)} placeholder="1:23" /></label>
            <label>Cache au départ (s)<br /><input className="mt-1 w-20 rounded border border-white/40 bg-black px-2 py-1" value={coverText} onChange={(e) => setCoverText(e.target.value)} placeholder={String(coverSeconds)} /></label>
            <span className="text-gray-300">{maxSeconds} s au plus · Échap ou s pour arrêter</span>
          </div>
          {desktop ? (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300">
                <li>Lance : le navigateur demande quel onglet filmer. Choisis <b>cet onglet</b> et coche <b>Partager l’audio de l’onglet</b>.</li>
                <li>Le lecteur passe en grand, couvert {coverSeconds} s le temps que ses boutons s’effacent, puis l’enregistrement commence.</li>
                <li>Ne touche à rien pendant l’enregistrement. Échap ou s pour arrêter ; l’extrait part dans la file.</li>
              </ol>
              <button className="rounded-full border border-white px-5 py-2 font-bold uppercase disabled:opacity-50" disabled={!embed || phase === 'asking' || phase === 'uploading'} onClick={start}>{phase === 'asking' ? 'Autorisation…' : 'Lancer la capture'}</button>
            </>
          ) : (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300">
                <li>Démarre l’enregistrement d’écran du téléphone (centre de contrôle).</li>
                <li>Lance : le lecteur passe en grand, couvert {coverSeconds} s, puis joue nu. Ne touche pas l’écran.</li>
                <li>Arrête l’enregistrement du téléphone, reviens ici et <b>Importer</b> le fichier.</li>
              </ol>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full border border-white px-5 py-2 font-bold uppercase disabled:opacity-50" disabled={!embed || phase === 'uploading'} onClick={startPhone}>Lancer le lecteur</button>
                <button className="rounded-full border border-white px-5 py-2 font-bold uppercase disabled:opacity-50" disabled={phase === 'uploading'} onClick={() => fileInput.current?.click()}>Importer</button>
              </div>
            </>
          )}
          {desktop ? <button className="text-sm underline" disabled={phase === 'uploading'} onClick={() => fileInput.current?.click()}>Importer un fichier à la place</button> : null}
          <input ref={fileInput} type="file" accept="video/*" multiple hidden onChange={onFiles} />
          {phase === 'uploading' ? <p role="status">Envoi… {progress != null ? `${Math.round(progress * 100)} %` : ''}</p> : null}
          {result ? <p role="status" className="text-green-300">{result} <Link href="/admin/comm" className="underline">Voir la file</Link></p> : null}
        </div>
      ) : null}

      {/* The capture stage: the bare player, full width, 16:9, and the cover over it. */}
      <div className={filming ? 'fixed inset-0 flex items-center justify-center bg-black' : 'hidden'}>
        <div ref={playerBox} className="relative w-full" style={{ aspectRatio: '16 / 9', maxHeight: '100vh', maxWidth: 'calc(100vh * 16 / 9)' }}>
          {playerSrc ? <iframe src={playerSrc} title="Capture" className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media" style={{ pointerEvents: 'none', border: 0 }} /> : null}
          {phase === 'covered' ? <div className="absolute inset-0 flex items-center justify-center bg-black text-6xl font-black">{countdown}</div> : null}
        </div>
        {phase === 'recording' ? (
          <div className="pointer-events-none fixed left-2 top-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> {formatSeconds(elapsed)} / {formatSeconds(maxSeconds)}
          </div>
        ) : null}
        {phase === 'recording' ? <button className="fixed bottom-3 right-3 rounded-full border border-white bg-black/70 px-4 py-2 text-xs font-bold uppercase" onClick={() => (desktop ? void finish() : stopPhone())}>Stop</button> : null}
      </div>
    </main>
  )
}
