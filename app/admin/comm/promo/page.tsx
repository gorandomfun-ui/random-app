'use client'

/**
 * The promo: films and stills about Random, from the site's own things and free stock videos and pictures,
 * in the chosen format with its safe area shown, the composition kept when the format changes.
 * One screen: the film plays live, the controls beside it, Exporter gives the MP4, Image fixe a PNG of the moment.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { downloadBlob } from '@/lib/comm/montageRun'
import { BRAND_MODES, FORMATS, SHOTS, SUBJECTS, createPromo, formatOf, planShots, recordPromo, renderStill, type BrandMode, type FormatKey, type PromoIcon, type PromoText, type ShotKind, type Subject } from '@/lib/comm/promoLoop'
import { audioContext, loadTrack, offsetFor, renderSoundtrack } from '@/lib/comm/promoSound'
import { deleteTrack, listTracks, uploadTrack, type Track } from '@/lib/comm/tracks'

const COLORS = [['#0FC55D', 'vert'], ['#D90845', 'rouge'], ['#E5972B', 'orange'], ['#FF978F', 'rose'], ['#3D42CC', 'bleu'], ['#AF3BF2', 'violet']] as const
const TEXT_SIZES = { S: 60, M: 90, L: 140, XL: 210 } as const
const FONTS = [['Tomorrow', 900, 'Tomorrow'], ['Tomorrow', 700, 'Tomorrow fin'], ['InterTight', 700, 'Inter Tight']] as const
const ICONS: Array<[string, string]> = [['heart', 'Heart.svg'], ['shuffle', 'Shuffle.svg'], ['video', 'Video.svg'], ['image', 'image.svg'], ['web', 'web.svg'], ['wave', 'wave.svg'], ['quote', 'quote.svg'], ['joke', 'joke.svg'], ['fact', 'fact.svg'], ['share', 'share.svg'], ['social', 'social.svg'], ['plus', 'plus.svg'], ['info', 'info.svg'], ['comm', 'comm.svg']]
const chip = 'rounded-full border border-white/40 px-3 py-1.5 text-sm disabled:opacity-40'
const chipOn = 'rounded-full border border-white bg-white px-3 py-1.5 text-sm text-black'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error(url)); img.src = url })
}
async function loadIcon(file: string, color: string): Promise<HTMLImageElement | null> {
  try {
    const svg = (await (await fetch(`/icons/${encodeURIComponent(file)}`)).text()).replace(/<\?xml[^>]*>\s*/, '').replace(/<!--[\s\S]*?-->/g, '')
      .replace(/fill:\s*#[0-9a-fA-F]{3,8}/g, `fill: ${color}`).replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${color}"`).replace(/<svg\b/, `<svg fill="${color}"`)
    return await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
  } catch { return null }
}
/** A stock video as a playing element the canvas can read; null when it will not play. */
function loadVideo(src: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'
    const done = (ok: boolean) => { v.oncanplay = null; v.onerror = null; resolve(ok ? v : null) }
    v.oncanplay = () => { void v.play().catch(() => undefined); done(true) }
    v.onerror = () => done(false)
    v.src = src
    window.setTimeout(() => done(v.readyState >= 2), 20000)
  })
}

type Stock = { id: string; provider: string; page: string; src: string }
type StockVideo = Stock & { author: string; duration: number }
type Assets = { logo: HTMLImageElement; logoVertical: HTMLImageElement; logoDark: HTMLImageElement; logoVerticalDark: HTMLImageElement; icons: HTMLImageElement[]; iconsByName: Record<string, HTMLImageElement>; stock: HTMLImageElement[]; stockInfo: Stock[]; videos: HTMLVideoElement[]; videoInfo: StockVideo[] }

export default function PromoPage() {
  const [format, setFormat] = useState<FormatKey>('tiktok')
  const [accent, setAccent] = useState(0)
  const [second, setSecond] = useState(-1)
  const [third, setThird] = useState(-1)
  const [intensity, setIntensity] = useState(0.6)
  const [seconds, setSeconds] = useState(8)
  const [seed, setSeed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  const [assets, setAssets] = useState<Assets | null>(null)
  const [withStock, setWithStock] = useState(true)
  const [withVideos, setWithVideos] = useState(true)
  const [shots, setShots] = useState<ShotKind[]>(SHOTS.map((s) => s.key))
  const [brandMode, setBrandMode] = useState<BrandMode>('center')
  const [subjects, setSubjects] = useState<Subject[]>(SUBJECTS.map((x) => x.key))
  const [recognition, setRecognition] = useState(0.3)
  const [guide, setGuide] = useState(true)
  const [text, setText] = useState('')
  const [size, setSize] = useState<keyof typeof TEXT_SIZES>('M')
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left')
  const [fontIndex, setFontIndex] = useState(0)
  const [place, setPlace] = useState<{ x: number; y: number; width: number } | null>(null)
  const [iconName, setIconName] = useState('')
  const [iconPlace, setIconPlace] = useState({ x: 0.78, y: 0.08, size: 120 })
  /** The moment held in the preview (ms), or null while the film plays. */
  const [hold, setHold] = useState<number | null>(null)
  /** The sound: the curator's tracks, the one chosen (or drawn by the seed), its decoded file, and the film's own glitched render of it. */
  const [tracks, setTracks] = useState<Track[]>([])
  const [trackChoice, setTrackChoice] = useState('')
  const [withSound, setWithSound] = useState(true)
  const [glitch, setGlitch] = useState(0.5)
  const [trackBuffer, setTrackBuffer] = useState<{ url: string; buffer: AudioBuffer } | null>(null)
  const [sound, setSound] = useState<AudioBuffer | null>(null)
  const [uploading, setUploading] = useState(false)
  /** True once the browser lets sound play: after a first click on the page. */
  const [awake, setAwake] = useState(false)
  const preview = useRef<HTMLCanvasElement | null>(null)
  const fmt = formatOf(format)
  const fonts = useMemo(() => { if (typeof window === 'undefined') return { tomorrow: 'Tomorrow, sans-serif', inter: '"Inter Tight", sans-serif' }; const s = getComputedStyle(document.body); return { tomorrow: s.getPropertyValue('--font-tomorrow').trim() || 'Tomorrow, sans-serif', inter: s.getPropertyValue('--font-inter-tight').trim() || '"Inter Tight", sans-serif' } }, [])
  useEffect(() => { setSeed(Math.floor(Math.random() * 100000)) }, [])
  useEffect(() => { void listTracks().then((r) => setTracks(r.tracks)) }, [])
  // Chrome plays sound only after a first touch of the page: the first click wakes the audio.
  const wake = useCallback(() => { void audioContext().resume().then(() => setAwake(true)).catch(() => undefined) }, [])
  useEffect(() => {
    // Any click wakes it — except the Son button's own, which wakes it itself and must not find it awake already and mute instead.
    const onDown = (event: PointerEvent) => { if (!(event.target instanceof Element && event.target.closest('button[aria-label="Son"]'))) wake() }
    document.addEventListener('pointerdown', onDown); return () => document.removeEventListener('pointerdown', onDown)
  }, [wake])

  /** The site's things, a handful of stock pictures and a few stock videos. */
  const load = useCallback(async (orientation: 'portrait' | 'landscape' | 'square') => {
    setError('')
    try {
      const [logo, logoVertical, logoDark, logoVerticalDark, icons, stockList, videoList] = await Promise.all([
        loadImage(`/api/admin/comm/brand?variant=horizontal&color=${encodeURIComponent('#F8F5E6')}`),
        loadImage(`/api/admin/comm/brand?variant=vertical&color=${encodeURIComponent('#F8F5E6')}`),
        loadImage(`/api/admin/comm/brand?variant=horizontal&color=${encodeURIComponent('#121210')}`),
        loadImage(`/api/admin/comm/brand?variant=vertical&color=${encodeURIComponent('#121210')}`),
        Promise.all(ICONS.map(([name, file]) => loadIcon(file, '#F8F5E6').then((img) => [name, img] as const))),
        fetch('/api/admin/comm/stock?n=6', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ pictures: [] })) as Promise<{ pictures?: Stock[] }>,
        fetch(`/api/admin/comm/stockvideo?n=3&orientation=${orientation}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ videos: [] })) as Promise<{ videos?: StockVideo[] }>,
      ])
      const iconsByName: Record<string, HTMLImageElement> = {}
      for (const [name, img] of icons) if (img) iconsByName[name] = img
      const stockInfo = stockList.pictures ?? []
      const stock = (await Promise.all(stockInfo.map((p) => loadImage(p.src).catch(() => null)))).filter((i): i is HTMLImageElement => Boolean(i))
      const videoInfo = videoList.videos ?? []
      const videos = (await Promise.all(videoInfo.map((v) => loadVideo(v.src)))).filter((v): v is HTMLVideoElement => Boolean(v))
      await document.fonts.ready
      setAssets({ logo, logoVertical, logoDark, logoVerticalDark, icons: Object.values(iconsByName), iconsByName, stock, stockInfo, videos, videoInfo })
    } catch (cause) { setError(cause instanceof Error ? `Chargement impossible : ${cause.message}` : 'Chargement impossible.') }
  }, [])
  const orientation = fmt.w > fmt.h ? 'landscape' : fmt.w === fmt.h ? 'square' : 'portrait'
  useEffect(() => { void load(orientation) }, [load, orientation])

  const textInput = useMemo<PromoText | null>(() => text.trim() ? { lines: text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4), size: TEXT_SIZES[size], align, font: FONTS[fontIndex][0] === 'Tomorrow' ? fonts.tomorrow : fonts.inter, weight: FONTS[fontIndex][1], x: place?.x ?? null, y: place?.y ?? null, width: place?.width ?? 0.88 } : null, [text, size, align, fontIndex, fonts, place])
  const iconInput = useMemo<PromoIcon | null>(() => assets && iconName && assets.iconsByName[iconName] ? { image: assets.iconsByName[iconName], x: iconPlace.x, y: iconPlace.y, size: iconPlace.size } : null, [assets, iconName, iconPlace])
  const input = useMemo(() => assets ? { format, seconds, intensity, seed, accent: COLORS[accent][0], palette: [second, third].filter((i) => i >= 0 && i !== accent).map((i) => COLORS[i][0]), shots, brandMode, subjects, recognition, logo: assets.logo, logoVertical: assets.logoVertical, logoDark: assets.logoDark, logoVerticalDark: assets.logoVerticalDark, icons: assets.icons, stock: withStock ? assets.stock : [], videos: withVideos ? assets.videos : [], titleFont: fonts.tomorrow, text: textInput, icon: iconInput } : null, [assets, format, seconds, intensity, seed, accent, second, third, shots, brandMode, subjects, recognition, withStock, withVideos, fonts, textInput, iconInput])

  // The track: the chosen one, or one drawn by the seed; decoded once per address; then rendered glitched from the film's plan.
  const track = useMemo(() => tracks.length ? (tracks.find((t) => t.url === trackChoice) ?? tracks[seed % tracks.length]) : null, [tracks, trackChoice, seed])
  const trackUrl = track?.url ?? ''
  useEffect(() => {
    if (!trackUrl) { setTrackBuffer(null); return }
    let gone = false
    loadTrack(trackUrl).then((buffer) => { if (!gone) setTrackBuffer({ url: trackUrl, buffer }) }).catch(() => { if (!gone) setError('La piste ne se lit pas.') })
    return () => { gone = true }
  }, [trackUrl])
  useEffect(() => {
    if (!input || !withSound || !trackBuffer || fmt.kind !== 'video') { setSound(null); return }
    let gone = false
    const { shots, beat } = planShots(input, input.videos.length, input.stock.length, input.icons.length)
    renderSoundtrack(trackBuffer.buffer, { shots, beat, seconds: input.seconds, seed, glitch, offsetSec: offsetFor(trackBuffer.buffer, input.seconds, seed) }).then((b) => { if (!gone) setSound(b) }).catch(() => { if (!gone) setSound(null) })
    return () => { gone = true }
  }, [input, withSound, trackBuffer, glitch, seed, fmt.kind])

  // The film plays live at a reduced size, over and over — or holds the chosen moment — until the export takes the canvas; its sound restarts with each loop.
  const previewScale = Math.min(300 / fmt.w, 540 / fmt.h)
  const pw = Math.round(fmt.w * previewScale * 2), ph = Math.round(fmt.h * previewScale * 2)
  useEffect(() => {
    const canvas = preview.current
    if (!canvas || !input || busy) return
    const ctx = canvas.getContext('2d')!
    const promo = createPromo(input, canvas.width, canvas.height)
    let stopped = false, handle = 0, frameNo = 0
    const started = performance.now()
    const debug = new URLSearchParams(window.location.search).has('debug')
    const ac = sound && hold === null ? audioContext() : null
    let source: AudioBufferSourceNode | null = null, loopNo = -1
    const play = (atMs: number) => {
      if (!ac || !sound || ac.state !== 'running') return
      try { source?.stop() } catch { /* ended */ }
      source = ac.createBufferSource(); source.buffer = sound
      const gain = ac.createGain(); gain.gain.value = 0.8; source.connect(gain); gain.connect(ac.destination)
      source.start(0, Math.min(Math.max(0, sound.duration - 0.01), atMs / 1000))
    }
    const tick = () => {
      if (stopped) return
      const elapsed = performance.now() - started
      const at = hold ?? elapsed % (input.seconds * 1000)
      if (ac) { const loop = Math.floor(elapsed / (input.seconds * 1000)); if (loop !== loopNo || (!source && ac.state === 'running')) { loopNo = loop; play(at) } }
      promo.frame(ctx, at, frameNo)
      if (debug) { const sh = promo.shotAt(at); ctx.fillStyle = '#000'; ctx.fillRect(0, canvas.height - 26, canvas.width, 26); ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${sh.phase}:${sh.kind} g=${sh.g.toFixed(2)} ${sh.treat}${sh.huge ? ' huge' : ''} ${sh.residue.join('+')} ${(at / 1000).toFixed(2)}s`, 6, canvas.height - 13) }
      frameNo += 1; handle = requestAnimationFrame(tick)
    }
    tick()
    return () => { stopped = true; cancelAnimationFrame(handle); try { source?.stop() } catch { /* ended */ } }
  }, [input, busy, hold, pw, ph, sound, awake])
  /** What the Son button says: no track, muted, the track being read or prepared, waiting for a click, held, or playing. */
  const soundState = !track || fmt.kind !== 'video' ? 'none' : !withSound ? 'muted' : trackBuffer?.url !== track.url ? 'loading' : !sound ? 'rendering' : !awake ? 'asleep' : hold !== null ? 'held' : 'playing'
  const soundLabel = { none: fmt.kind !== 'video' ? 'Son : format d’image' : 'Son : aucune piste', muted: 'Son : coupé', loading: 'Son : lecture de la piste…', rendering: 'Son : préparation…', asleep: 'Son : clique pour l’entendre', held: 'Son : tenu', playing: 'Son : joue' }[soundState]

  const addTracks = useCallback(async (files: File[]) => {
    if (!files.length) return
    setUploading(true); setError('')
    for (const file of files) {
      const out = await uploadTrack(file)
      if ('error' in out) setError(out.message); else setTracks((list) => [...list.filter((t) => t.url !== out.url), out].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setUploading(false)
  }, [])
  const removeTrack = useCallback(async (url: string) => {
    const t = tracks.find((x) => x.url === url)
    if (!t || !window.confirm(`Retirer la piste « ${t.name} » ?`)) return
    setUploading(true)
    const ok = await deleteTrack(url)
    setUploading(false)
    if (ok) { setTracks((list) => list.filter((x) => x.url !== url)); setTrackChoice('') } else setError('La piste n’a pas pu être retirée.')
  }, [tracks])

  const exportFilm = useCallback(async () => {
    if (!input) return
    setBusy(true); setError(''); setResult(null); setProgress(0)
    try {
      const out = await recordPromo(input, preview.current, setProgress, sound)
      const name = `random-promo-${format}-${seconds}s-${seed}.${out.extension}`
      setResult({ url: URL.createObjectURL(out.blob), name })
      downloadBlob(out.blob, name)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export impossible.') }
    setBusy(false)
  }, [input, format, seconds, seed, sound])
  const exportStill = useCallback(async () => {
    if (!input) return
    setBusy(true); setError(''); setResult(null)
    try {
      const at = hold ?? Math.round(input.seconds * 1000 * 0.6)
      const blob = await renderStill(input, at)
      const name = `random-${format}-${fmt.w}x${fmt.h}-${seed}-${Math.round(at)}ms.png`
      setResult({ url: URL.createObjectURL(blob), name })
      downloadBlob(blob, name)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Image impossible.') }
    setBusy(false)
  }, [input, hold, format, fmt, seed])

  const safe = fmt.safe
  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-5">
        <nav className="text-sm"><Link href="/admin/comm" className="underline">← La file</Link></nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Promo</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button className={chip} disabled={busy || !input} onClick={exportStill}>Image fixe {fmt.w}×{fmt.h}</button>
            {fmt.kind === 'video' ? <button className="rounded-full border border-white bg-white px-5 py-2.5 text-sm font-bold uppercase text-black disabled:opacity-40" disabled={busy || !input} onClick={exportFilm}>{busy ? `Export ${Math.round(progress * 100)} %` : 'Exporter la vidéo'}</button> : null}
          </div>
        </div>
        <p className="text-sm text-gray-300">Un film sur Random, à la forme des refs : la marque propre, une amorce, une rafale, puis une longue retombée où des résidus restent — barres de couleur, un bloc, des confettis — et la marque bouge à peine. En continu, le lit de la Home : des centaines de lignes fines, des déchirures et des blocs où l’image passe très zoomée, qui sautent par pas. Les images Pexels et Pixabay ne sont jamais montrées telles quelles : posterisées dans ta palette, en gros pixels — le moment Fond les met plein cadre, dans leurs couleurs mais par paliers, voilées, déchirées. Le son : une de tes pistes, glitchée par le film lui-même. Change de format : la composition suit sa zone sûre. Chrome ou Edge sur ordinateur pour l’export vidéo.</p>
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        {result ? <p className="rounded border border-green-400/50 p-2 text-sm text-green-300">Exporté : {result.name} est téléchargé. <a href={result.url} download={result.name} className="underline">Télécharger à nouveau</a>.</p> : null}
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div>
            <div className="relative mx-auto" style={{ width: Math.round(fmt.w * previewScale), height: Math.round(fmt.h * previewScale) }}>
              <canvas ref={preview} width={pw} height={ph} className="h-full w-full rounded border border-white/20 bg-[#191916]" aria-label="Aperçu" />
              {guide ? <div className="pointer-events-none absolute border border-dashed border-amber-200/40" style={{ left: `${safe.l * 100}%`, top: `${safe.t * 100}%`, right: `${safe.r * 100}%`, bottom: `${safe.b * 100}%`, borderRadius: fmt.round ? '50%' : 0 }} aria-label="Zone sûre" /> : null}
              {textInput && place ? <DragBox rect={{ x: place.x, y: place.y, w: place.width, h: 0.12 }} label="texte" onMove={(x, y) => setPlace((p) => ({ ...(p ?? { width: 0.88 }), x, y }))} /> : null}
              {iconInput ? <DragBox rect={{ x: iconPlace.x, y: iconPlace.y, w: iconPlace.size / fmt.w, h: iconPlace.size / fmt.h }} label="icône" onMove={(x, y) => setIconPlace((p) => ({ ...p, x, y }))} /> : null}
              {!assets ? <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">Chargement…</p> : null}
            </div>
            <div className="mx-auto mt-2 flex items-center gap-2 text-xs text-gray-300" style={{ width: Math.round(fmt.w * previewScale) }}>
              <span>Moment</span>
              <input type="range" min={0} max={seconds * 1000} step={50} value={hold ?? 0} className="flex-1" aria-label="Moment du film" onChange={(e) => setHold(Number(e.target.value))} />
              <span className="w-10 text-right">{((hold ?? 0) / 1000).toFixed(1)} s</span>
              <button className={chip} onClick={() => setHold(null)} disabled={hold === null}>Lire</button>
              <button className={soundState === 'playing' ? chipOn : chip} aria-label="Son" disabled={soundState === 'none'} onClick={() => { if (!awake) { wake(); setWithSound(true) } else setWithSound(!withSound) }}>{soundLabel}</button>
            </div>
            <p className="mx-auto mt-1 text-[11px] text-gray-500" style={{ width: Math.round(fmt.w * previewScale) }}>Tire la glissière pour tenir un moment (pour l’image fixe) ; Lire relance le film ; Son lance ou coupe la piste. Le cadre jaune en pointillé est la zone sûre, celle que l’interface ne cache pas ({fmt.note}) : un repère, jamais exporté.</p>
          </div>
          <div className="space-y-4 text-sm">
            <section className="rounded border border-white/15 p-3">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-400">Format</h2>
              <div className="flex flex-wrap items-center gap-2">{FORMATS.map((f) => <button key={f.key} title={`${f.w}×${f.h} — ${f.note}`} className={format === f.key ? chipOn : chip} onClick={() => setFormat(f.key)}>{f.name}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />montrer la zone sûre</label><span className="text-xs text-gray-500">{fmt.kind === 'image' ? 'format d’image : le bouton Image fixe prend le moment tenu' : 'format vidéo : Exporter la vidéo, ou Image fixe pour une couverture'}</span></div>
            </section>
            <section className="rounded border border-white/15 p-3">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-400">Film</h2>
              <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Couleur 1</span>{COLORS.map(([c, name], i) => <button key={c} aria-label={`${name} principale`} className={`h-8 w-8 rounded-full border-2 ${accent === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => setAccent(i)} />)}<span className="text-xs text-gray-500">la dominante</span></div>
              {([['Couleur 2', second, setSecond], ['Couleur 3', third, setThird]] as const).map(([label, value, set]) => <div key={label} className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">{label}</span>{COLORS.map(([c, name], i) => <button key={c} aria-label={`${name} ${label}`} disabled={i === accent} className={`h-7 w-7 rounded-full border-2 disabled:opacity-20 ${value === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => set(value === i ? -1 : i)} />)}<span className="text-xs text-gray-500">{value < 0 ? 'aucune' : 'secondaire'}</span></div>)}
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Force</span><input type="range" min={0.2} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-48" aria-label="Force" /><span className="text-xs">{Math.round(intensity * 100)} %</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Durée</span>{[3, 5, 8, 10, 15].map((s) => <button key={s} className={seconds === s ? chipOn : chip} onClick={() => { setSeconds(s); setHold(null) }}>{s === 3 ? 'Bumper 3 s' : `${s} s`}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Moments</span>{SHOTS.map((s) => <button key={s.key} title={s.hint} className={shots.includes(s.key) ? chipOn : chip} onClick={() => setShots(shots.includes(s.key) ? shots.filter((x) => x !== s.key) : [...shots, s.key])}>{s.name}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Sujets</span>{SUBJECTS.map((x) => <button key={x.key} title={x.hint} className={subjects.includes(x.key) ? chipOn : chip} onClick={() => setSubjects(subjects.includes(x.key) ? subjects.filter((k) => k !== x.key) : [...subjects, x.key])}>{x.name}</button>)}<span className="text-xs text-gray-500">un par cycle, parfois deux ensemble</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Marque</span>{BRAND_MODES.map((m) => <button key={m.key} title={m.hint} className={brandMode === m.key ? chipOn : chip} onClick={() => setBrandMode(m.key)}>{m.name}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Reconnaissance</span><input type="range" min={0.15} max={0.7} step={0.05} value={recognition} onChange={(e) => setRecognition(Number(e.target.value))} className="w-48" aria-label="Reconnaissance de l’image" /><span className="text-xs">{Math.round(recognition * 100)} %</span><span className="text-xs text-gray-500">à 15 % l’image n’est que matière ; à 70 % on la devine, et ses couleurs prennent</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Sources</span><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withVideos} onChange={(e) => setWithVideos(e.target.checked)} />vidéos libres</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withStock} onChange={(e) => setWithStock(e.target.checked)} />images libres</label><button className={chip} disabled={busy} onClick={() => void load(orientation)}>D’autres</button></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Tirage</span><button className={chip} disabled={busy} onClick={() => { setSeed(Math.floor(Math.random() * 100000)); setHold(null) }}>Autre tirage (n° {seed})</button></div>
              {assets ? <p className="mt-2 text-[11px] text-gray-500">Vidéos : {assets.videoInfo.length ? assets.videoInfo.map((v, i) => <span key={v.id}>{i ? ' · ' : ''}<a href={v.page} target="_blank" rel="noreferrer" className="underline">{v.author}</a> ({v.duration} s)</span>) : 'aucune'} — Images : {assets.stockInfo.map((p, i) => <span key={p.id}>{i ? ' · ' : ''}<a href={p.page} target="_blank" rel="noreferrer" className="underline">{p.provider}</a></span>)}</p> : null}
            </section>
            <section className="rounded border border-white/15 p-3">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-400">Son</h2>
              <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Pistes</span>
                <button className={!trackChoice ? chipOn : chip} disabled={!tracks.length} onClick={() => setTrackChoice('')}>Au hasard</button>
                {tracks.map((t) => <button key={t.url} title={`${Math.round(t.bytes / 1024 / 1024 * 10) / 10} Mo`} className={trackChoice === t.url ? chipOn : chip} onClick={() => setTrackChoice(t.url)}>{t.name}</button>)}
                <label className={`${chip} cursor-pointer ${uploading ? 'opacity-40' : ''}`}>{uploading ? 'Envoi…' : 'Déposer des pistes'}<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" multiple className="hidden" disabled={uploading} aria-label="Déposer des pistes" onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void addTracks(files) }} /></label>
                {trackChoice ? <button className={chip} disabled={uploading} onClick={() => void removeTrack(trackChoice)}>Retirer</button> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><label className="flex w-16 items-center gap-2 text-xs"><input type="checkbox" checked={withSound} onChange={(e) => setWithSound(e.target.checked)} aria-label="Son" />son</label><span className="text-xs text-gray-400">Glitch</span><input type="range" min={0} max={1} step={0.05} value={glitch} onChange={(e) => setGlitch(Number(e.target.value))} className="w-48" aria-label="Glitch du son" /><span className="text-xs">{Math.round(glitch * 100)} %</span><span className="text-xs text-gray-500">{track ? `piste : ${track.name}${trackBuffer?.url === track.url ? `, départ à ${offsetFor(trackBuffer.buffer, seconds, seed).toFixed(1)} s` : ''}` : 'aucune piste'}</span></div>
              <p className="mt-2 text-[11px] text-gray-500">{tracks.length ? 'Au hasard : Autre tirage change la piste et le départ. ' : 'Dépose tes fichiers libres de droits (mp3, m4a, wav, ogg, flac) : Pixabay Musique, la bibliothèque audio YouTube. '}Le film glitche la piste lui-même : bégaiements aux amorces et aux rafales, trous sur les pas forts, grain écrasé pendant les rafales, son étouffé pendant les retombées, un trou à chaque carton ; dessous, la piste garde son rythme. Le bouton Son sous l’aperçu dit où il en est ; le navigateur ne laisse rien jouer avant un premier clic sur la page ; pas de son sur les formats d’image.</p>
            </section>
            <section className="rounded border border-white/15 p-3">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-400">Texte</h2>
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} rows={3} placeholder={'Une ligne = un carton, dans l’ordre'} className="w-full rounded border border-white/30 bg-black p-2 text-sm" aria-label="Texte" />
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Taille</span>{(Object.keys(TEXT_SIZES) as Array<keyof typeof TEXT_SIZES>).map((k) => <button key={k} className={size === k ? chipOn : chip} onClick={() => setSize(k)}>{k}</button>)}
                {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={align === a ? chipOn : chip} onClick={() => setAlign(a)}>{a === 'left' ? 'Gauche' : a === 'center' ? 'Centré' : 'Droite'}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Police</span>{FONTS.map(([, , name], i) => <button key={name} className={fontIndex === i ? chipOn : chip} onClick={() => setFontIndex(i)}>{name}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Place</span><button className={!place ? chipOn : chip} onClick={() => setPlace(null)}>Dans la zone sûre</button><button className={place ? chipOn : chip} onClick={() => setPlace({ x: 0.06, y: 0.6, width: 0.88 })}>À la main</button>{place ? <span className="text-xs text-gray-500">glisse le cadre « texte » sur l’aperçu</span> : null}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Icône</span>
                <select value={iconName} onChange={(e) => setIconName(e.target.value)} className="rounded border border-white/30 bg-black px-2 py-1 text-sm" aria-label="Icône"><option value="">aucune</option>{ICONS.map(([name]) => <option key={name} value={name}>{name}</option>)}</select>
                {iconName ? <><input type="range" min={48} max={400} step={8} value={iconPlace.size} onChange={(e) => setIconPlace((p) => ({ ...p, size: Number(e.target.value) }))} className="w-32" aria-label="Taille de l’icône" /><span className="text-xs text-gray-400">glisse-la sur le film</span></> : null}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">Chaque ligne devient un carton qui arrive à son tour, lettre par lettre ; une seule ligne placée à la main reste sur tout le film.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}

/** A box the curator drags over the preview; the position comes back as shares of the width and the height. */
function DragBox({ rect, label, onMove }: { rect: { x: number; y: number; w: number; h: number }; label: string; onMove: (x: number, y: number) => void }) {
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null)
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const parent = event.currentTarget.parentElement!
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: rect.x, y: rect.y, w: parent.clientWidth, h: parent.clientHeight }
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation()
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    onMove(Math.round(Math.max(-0.3, Math.min(0.97, drag.x + (event.clientX - drag.startX) / drag.w)) * 1000) / 1000, Math.round(Math.max(-0.3, Math.min(0.97, drag.y + (event.clientY - drag.startY) / drag.h)) * 1000) / 1000)
  }
  const onPointerUp = () => { dragRef.current = null }
  return (
    <div role="button" tabIndex={0} aria-label={`Déplacer : ${label}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      className="absolute cursor-move touch-none rounded border border-dashed border-white/60" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}>
      <span className="absolute -top-4 left-0 rounded bg-black/70 px-1 text-[10px] text-white">{label}</span>
    </div>
  )
}
