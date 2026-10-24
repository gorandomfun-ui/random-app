'use client'

/**
 * Capture mode. On a computer (Chrome, Edge): the browser films its own tab,
 * cropped to the player when it can, the curator allowing it every time. On
 * a phone: the same bare player, and the phone's own screen recording, then
 * an import. Nothing bypasses what the browser refuses to capture.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { canCaptureTab, CHROME_NOTE, commItem, desktopWithoutTabCapture, uploadMedia, type QueueItemWithMedia } from '@/lib/comm/client'
import { captureEmbedUrl, COVER_SECONDS, formatSeconds, parseStartSeconds, parseYoutubeMessage, pickRecorderType, scoutEmbedUrl, YOUTUBE_PLAYER_ORIGIN, youtubeCommandMessage, youtubeListenMessage } from '@/lib/comm/capture'
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
  const otherBrowser = desktopWithoutTabCapture()
  const maxSeconds = clipMaxSeconds()
  /** The scouting: the player with its controls, a slider under it, the spot found by eye before the capture. */
  const [scouting, setScouting] = useState(false)
  const [scoutTime, setScoutTime] = useState(0)
  const [scoutSrc, setScoutSrc] = useState<{ provider: 'youtube' | 'dailymotion'; src: string } | null>(null)
  const [liveTime, setLiveTime] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const scoutFrame = useRef<HTMLIFrameElement | null>(null)
  const reloadTimer = useRef<number | null>(null)

  useEffect(() => {
    void commItem(queueItemId).then((body) => { if (body.item) setItem(body.item); else setError('Cet élément n’est plus dans la file.') })
  }, [queueItemId])

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const embedFor = useCallback((sec: number) => (item ? captureEmbedUrl(item.snapshot.url, item.snapshot.provider, sec, origin) : null), [item, origin])
  const embed = useMemo(() => embedFor(parseStartSeconds(startText)), [embedFor, startText])
  const coverSeconds = coverText ? Math.max(0, Math.min(15, Number(coverText) || 0)) : embed ? COVER_SECONDS[embed.provider] : 4
  const scoutMax = duration ?? item?.snapshot.durationSec ?? 600

  // The scouting player: YouTube's reports its time and seeks on command; the other reloads at the slider's second.
  const openScout = useCallback(() => {
    if (!item) return
    const sec = parseStartSeconds(startText)
    setScoutTime(sec); setLiveTime(null); setScoutSrc(scoutEmbedUrl(item.snapshot.url, item.snapshot.provider, sec, origin)); setScouting(true)
  }, [item, origin, startText])
  const closeScout = useCallback(() => { setScouting(false); setScoutSrc(null); setLiveTime(null); if (reloadTimer.current) window.clearTimeout(reloadTimer.current) }, [])
  useEffect(() => {
    if (!scouting || scoutSrc?.provider !== 'youtube') return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== YOUTUBE_PLAYER_ORIGIN) return
      const info = parseYoutubeMessage(event.data)
      if (!info) return
      if (info.currentTime != null) { setLiveTime(info.currentTime); setScoutTime(info.currentTime) }
      if (info.duration != null) setDuration(info.duration)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [scouting, scoutSrc])
  const onScoutLoad = useCallback(() => { if (scoutSrc?.provider === 'youtube') scoutFrame.current?.contentWindow?.postMessage(youtubeListenMessage(), YOUTUBE_PLAYER_ORIGIN) }, [scoutSrc])
  const slideTo = useCallback((sec: number) => {
    setScoutTime(sec)
    if (scoutSrc?.provider === 'youtube') { scoutFrame.current?.contentWindow?.postMessage(youtubeCommandMessage('seekTo', [sec, true]), YOUTUBE_PLAYER_ORIGIN); setLiveTime(sec); return }
    if (!item) return
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
    reloadTimer.current = window.setTimeout(() => setScoutSrc(scoutEmbedUrl(item.snapshot.url, item.snapshot.provider, sec, origin)), 400)
  }, [item, origin, scoutSrc])
  /** The second the capture will start at: the player's own time when it tells it, else the slider's. */
  const scoutSecond = Math.floor(liveTime ?? scoutTime)

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
    // 5 Mbit/s at the screen's full size: a third lighter than before (24 October), with no visible loss on the soft old videos the tool captures.
    const recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 5_000_000 } : undefined)
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

  const start = useCallback(async (fromSec?: number) => {
    const target = fromSec == null ? embed : embedFor(fromSec)
    if (fromSec != null) { setStartText(formatSeconds(fromSec)); closeScout() }
    if (!target || !desktop) return
    setError(''); setResult(''); setPhase('asking')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } }, audio: true,
        // Chrome: offer this very tab, keep the picker on tabs, keep the capture here.
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
      } as DisplayMediaStreamOptions)
      const surface = (stream.getVideoTracks()[0]?.getSettings() as { displaySurface?: string }).displaySurface
      if (surface && surface !== 'browser') {
        stream.getTracks().forEach((track) => track.stop())
        setPhase('idle'); setError('Tu as choisi une fenêtre ou l’écran entier. Dans la fenêtre de Chrome, prends l’onglet « Onglet Chrome », puis cette page.')
        return
      }
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
    setPlayerSrc(target.src)
    setPhase('covered'); setCountdown(coverSeconds)
    let left = coverSeconds
    const tick = window.setInterval(() => {
      left -= 1; setCountdown(left)
      if (left <= 0) { window.clearInterval(tick); beginRecording() }
    }, 1000)
    if (coverSeconds === 0) { window.clearInterval(tick); beginRecording() }
  }, [beginRecording, closeScout, coverSeconds, desktop, embed, embedFor, finish])

  // On a phone: the bare player with its cover, the phone's own recorder running.
  const startPhone = useCallback((fromSec?: number) => {
    const target = fromSec == null ? embed : embedFor(fromSec)
    if (fromSec != null) { setStartText(formatSeconds(fromSec)); closeScout() }
    if (!target) return
    setError(''); setResult(''); setPlayerSrc(target.src); setPhase('covered'); setCountdown(coverSeconds)
    let left = coverSeconds
    const tick = window.setInterval(() => {
      left -= 1; setCountdown(left)
      if (left <= 0) { window.clearInterval(tick); setPhase('recording'); startedAtRef.current = performance.now(); timerRef.current = window.setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 250) }
    }, 1000)
  }, [closeScout, coverSeconds, embed, embedFor])

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
            <button className="rounded-full border border-white px-4 py-1.5 font-bold uppercase disabled:opacity-50" disabled={!item || !embed || scouting || phase === 'uploading'} onClick={openScout}>Repérer l’endroit</button>
            <label>Ou commencer à (min:s)<br /><input className="mt-1 w-28 rounded border border-white/40 bg-black px-2 py-1" value={startText} onChange={(e) => setStartText(e.target.value)} placeholder="1:23" aria-label="Commencer à" /></label>
            <label>Cache au départ (s)<br /><input className="mt-1 w-20 rounded border border-white/40 bg-black px-2 py-1" value={coverText} onChange={(e) => setCoverText(e.target.value)} placeholder={String(coverSeconds)} /></label>
            <span className="text-gray-300">jusqu’à {formatSeconds(maxSeconds)} · Échap ou s pour arrêter</span>
          </div>
          {scouting && scoutSrc ? (
            <section className="space-y-2 rounded-lg border border-white/20 p-3" aria-label="Repérage">
              <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
                <iframe ref={scoutFrame} src={scoutSrc.src} title="Repérage" className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media" style={{ border: 0 }} onLoad={onScoutLoad} />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <input type="range" min={0} max={Math.max(1, Math.floor(scoutMax))} step={1} value={Math.min(Math.floor(scoutMax), Math.floor(scoutTime))} className="flex-1" aria-label="Endroit" onChange={(e) => slideTo(Number(e.target.value))} />
                <span className="w-16 text-right tabular-nums">{formatSeconds(scoutSecond)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="rounded-full border border-white bg-white px-5 py-2 font-bold uppercase text-black disabled:opacity-50" disabled={phase === 'asking'} onClick={() => (desktop ? void start(scoutSecond) : startPhone(scoutSecond))}>Démarrer ici</button>
                <button className="text-sm underline" onClick={closeScout}>Fermer le repérage</button>
                <span className="text-xs text-gray-400">{scoutSrc.provider === 'youtube' ? 'Glisse, ou avance dans le lecteur : la seconde suit.' : 'Glisse : le lecteur se recale à cette seconde.'}</span>
              </div>
            </section>
          ) : null}
          {otherBrowser ? (
            <div className="space-y-3">
              <p className="text-amber-200">{CHROME_NOTE}</p>
              <p className="text-sm text-gray-300">Copie l’adresse de cette page dans Chrome, connecte-toi avec la même clé, et lance la capture depuis là. Ou importe ci-dessous un enregistrement fait autrement.</p>
              <button className="rounded-full border border-white px-5 py-2 font-bold uppercase disabled:opacity-50" disabled={phase === 'uploading'} onClick={() => fileInput.current?.click()}>Importer</button>
            </div>
          ) : desktop ? (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300">
                <li>Lance : Chrome demande quoi filmer. Dans sa fenêtre, prends l’onglet <b>« Onglet Chrome »</b>, choisis <b>cette page</b>, et coche <b>Partager l’audio de l’onglet</b>.</li>
                <li>Le lecteur passe en grand, couvert {coverSeconds} s le temps que ses boutons s’effacent, puis l’enregistrement commence.</li>
                <li>Ne touche à rien pendant l’enregistrement. Échap ou s pour arrêter ; l’extrait part dans la file.</li>
              </ol>
              <button className="rounded-full border border-white px-5 py-2 font-bold uppercase disabled:opacity-50" disabled={!embed || phase === 'asking' || phase === 'uploading'} onClick={() => void start()}>{phase === 'asking' ? 'Autorisation…' : 'Lancer la capture'}</button>
            </>
          ) : (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300">
                <li>Démarre l’enregistrement d’écran du téléphone (centre de contrôle).</li>
                <li>Lance : le lecteur passe en grand, couvert {coverSeconds} s, puis joue nu. Ne touche pas l’écran.</li>
                <li>Arrête l’enregistrement du téléphone, reviens ici et <b>Importer</b> le fichier.</li>
              </ol>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full border border-white px-5 py-2 font-bold uppercase disabled:opacity-50" disabled={!embed || phase === 'uploading'} onClick={() => startPhone()}>Lancer le lecteur</button>
                <button className="rounded-full border border-white px-5 py-2 font-bold uppercase disabled:opacity-50" disabled={phase === 'uploading'} onClick={() => fileInput.current?.click()}>Importer</button>
              </div>
            </>
          )}
          {desktop && !otherBrowser ? <button className="text-sm underline" disabled={phase === 'uploading'} onClick={() => fileInput.current?.click()}>Importer un fichier à la place</button> : null}
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
