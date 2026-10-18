'use client'

/**
 * The promo: films and stills about Random, from the site's own things and free stock videos and pictures,
 * in the chosen format with its safe area shown, the composition kept when the format changes.
 * One screen: the film plays live, the controls beside it, Exporter gives the MP4, Image fixe a PNG of the moment.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { downloadBlob } from '@/lib/comm/montageRun'
import { BRAND_MODES, FORMATS, SHOTS, SUBJECTS, beatOf, createPromo, formatOf, planShots, recordPromo, renderStill, type BrandMode, type FormatKey, type PromoIcon, type PromoText, type ShotKind, type Subject } from '@/lib/comm/promoLoop'
import { audioContext, loadTrack, offsetFor, promoHash, renderSoundtrack, soundless } from '@/lib/comm/promoSound'
import { SYNTHS, synthTrack, type SynthKind } from '@/lib/comm/promoSynth'
import type { StockSoundInfo } from '@/lib/comm/stockSound'
import { deleteTrack, listTracks, uploadTrack, type Track } from '@/lib/comm/tracks'

const COLORS = [['#0FC55D', 'vert'], ['#D90845', 'rouge'], ['#E5972B', 'orange'], ['#FF978F', 'rose'], ['#3D42CC', 'bleu'], ['#AF3BF2', 'violet']] as const
const TEXT_SIZES = { S: 60, M: 90, L: 140, XL: 210 } as const
const FONTS = [['Tomorrow', 900, 'Tomorrow'], ['Tomorrow', 700, 'Tomorrow fin'], ['InterTight', 700, 'Inter Tight']] as const
const ICONS: Array<[string, string]> = [['heart', 'Heart.svg'], ['shuffle', 'Shuffle.svg'], ['video', 'Video.svg'], ['image', 'image.svg'], ['web', 'web.svg'], ['wave', 'wave.svg'], ['quote', 'quote.svg'], ['joke', 'joke.svg'], ['fact', 'fact.svg'], ['share', 'share.svg'], ['social', 'social.svg'], ['plus', 'plus.svg'], ['info', 'info.svg'], ['comm', 'comm.svg']]
const chip = 'rounded-full border border-white/40 px-3 py-1.5 text-sm disabled:opacity-40'
const chipOn = 'rounded-full border border-white bg-white px-3 py-1.5 text-sm text-black'
const small = 'rounded-full border border-white/25 px-2 py-1 text-xs text-gray-300 disabled:opacity-40'
/** The moments on at the start: a few, not the whole list. */
const DEFAULT_SHOTS: ShotKind[] = ['blocks', 'mosh', 'split', 'ecto', 'back']

/** A labelled row of controls. */
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="flex flex-wrap items-center gap-2 py-1"><span className="w-20 shrink-0 text-xs text-gray-400">{label}</span>{children}{hint ? <span className="text-xs text-gray-500">{hint}</span> : null}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"><h2 className="mb-1 font-mono text-[11px] uppercase tracking-widest text-gray-500">{title}</h2>{children}</section>
}
const PlayIcon = ({ playing }: { playing: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{playing ? <><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></> : <path d="M7 4l13 8-13 8z" />}</svg>
)
const RedrawIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>
)
const SpeakerIcon = ({ off }: { off: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
    {off ? <path d="M22 9l-6 6M16 9l6 6" /> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
  </svg>
)

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
/** Where the film's sound comes from: any source by the seed, the curator's tracks, the sounds of stock videos, the made ones — or one track by its address. */
type SoundSource = 'any' | 'tracks' | 'videos' | 'synth' | (string & {})
type Chosen = { kind: 'track' | 'video' | 'synth'; key: string; label: string; url?: string; synth?: SynthKind; credit?: StockSoundInfo }

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
  const [shots, setShots] = useState<ShotKind[]>(DEFAULT_SHOTS)
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
  /** The moment held in the preview (ms), or null while the film plays; and the moment the preview is at, for a pause. */
  const [hold, setHold] = useState<number | null>(null)
  const atRef = useRef(0)
  /** The sound: the curator's tracks, the one chosen (or drawn by the seed), its decoded file, and the film's own glitched render of it. */
  const [tracks, setTracks] = useState<Track[]>([])
  const [soundSource, setSoundSource] = useState<SoundSource>('any')
  const [withSound, setWithSound] = useState(true)
  const [glitch, setGlitch] = useState(0.5)
  const [trackBuffer, setTrackBuffer] = useState<{ key: string; buffer: AudioBuffer } | null>(null)
  const [sound, setSound] = useState<AudioBuffer | null>(null)
  const [uploading, setUploading] = useState(false)
  /** True once the browser lets sound play: after a first click on the page. */
  const [awake, setAwake] = useState(false)
  /** The sounds of stock videos heard loud here, and whether the page is still listening to candidates. */
  const [soundPool, setSoundPool] = useState<StockSoundInfo[]>([])
  const [soundBusy, setSoundBusy] = useState(false)
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

  /**
   * The sounds of stock videos, listened to here before being offered: the server's finds are decoded one by one
   * until two are heard loud, each verdict told back so the server draws the loud ones first and sets the silent aside.
   * Their decoded files are kept for the film. Runs after the page is up, never holding it.
   */
  const soundPoolBuffers = useRef(new Map<string, AudioBuffer>())
  const listenSounds = useCallback(async () => {
    setSoundBusy(true)
    try {
      const list = ((await (await fetch('/api/admin/comm/stocksound?n=4', { cache: 'no-store' })).json()) as { sounds?: StockSoundInfo[] }).sounds ?? []
      const loud: StockSoundInfo[] = []
      for (const s of list) {
        if (loud.length >= 2) break
        try {
          const buffer = await loadTrack(s.src)
          const quiet = soundless(buffer)
          void fetch('/api/admin/comm/stocksound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, loud: !quiet }) }).catch(() => undefined)
          if (!quiet) { soundPoolBuffers.current.set(s.src, buffer); loud.push(s) }
        } catch { /* the next one */ }
      }
      setSoundPool(loud)
    } catch { setSoundPool([]) }
    setSoundBusy(false)
  }, [])

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
    void listenSounds()
  }, [listenSounds])
  const orientation = fmt.w > fmt.h ? 'landscape' : fmt.w === fmt.h ? 'square' : 'portrait'
  useEffect(() => { void load(orientation) }, [load, orientation])

  const textInput = useMemo<PromoText | null>(() => text.trim() ? { lines: text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4), size: TEXT_SIZES[size], align, font: FONTS[fontIndex][0] === 'Tomorrow' ? fonts.tomorrow : fonts.inter, weight: FONTS[fontIndex][1], x: place?.x ?? null, y: place?.y ?? null, width: place?.width ?? 0.88 } : null, [text, size, align, fontIndex, fonts, place])
  const iconInput = useMemo<PromoIcon | null>(() => assets && iconName && assets.iconsByName[iconName] ? { image: assets.iconsByName[iconName], x: iconPlace.x, y: iconPlace.y, size: iconPlace.size } : null, [assets, iconName, iconPlace])
  const input = useMemo(() => assets ? { format, seconds, intensity, seed, accent: COLORS[accent][0], palette: [second, third].filter((i) => i >= 0 && i !== accent).map((i) => COLORS[i][0]), shots, brandMode, subjects, recognition, logo: assets.logo, logoVertical: assets.logoVertical, logoDark: assets.logoDark, logoVerticalDark: assets.logoVerticalDark, icons: assets.icons, stock: withStock ? assets.stock : [], videos: withVideos ? assets.videos : [], titleFont: fonts.tomorrow, text: textInput, icon: iconInput } : null, [assets, format, seconds, intensity, seed, accent, second, third, shots, brandMode, subjects, recognition, withStock, withVideos, fonts, textInput, iconInput])

  // The sound's source for this draw: by the seed among what is at hand — the curator's tracks first, the sounds of stock videos, the made ones — or what he chose.
  const chosen = useMemo<Chosen | null>(() => {
    const sounds = soundPool
    const asTrack = (t: Track): Chosen => ({ kind: 'track', key: t.url, label: `piste : ${t.name}`, url: t.url })
    const asVideo = (v: StockSoundInfo): Chosen => ({ kind: 'video', key: v.src, label: `son d’une vidéo de ${v.author} (${v.provider})`, url: v.src, credit: v })
    const asSynth = (k: SynthKind): Chosen => ({ kind: 'synth', key: `synth:${k}`, label: `généré : ${SYNTHS.find((s) => s.key === k)?.name ?? k}`, synth: k })
    const pick = <T,>(list: T[], salt: number) => list[Math.floor(promoHash(seed, salt) * list.length)]
    const made = () => asSynth(pick(SYNTHS, 11).key)
    if (soundSource === 'synth') return made()
    if (soundSource === 'videos') return sounds.length ? asVideo(pick(sounds, 12)) : made()
    if (soundSource === 'tracks') return tracks.length ? asTrack(pick(tracks, 13)) : made()
    if (soundSource !== 'any') { const t = tracks.find((x) => x.url === soundSource); return t ? asTrack(t) : null }
    const q = promoHash(seed, 14)
    if (tracks.length && q < (sounds.length ? 0.5 : 0.7)) return asTrack(pick(tracks, 13))
    if (sounds.length && q < 0.8) return asVideo(pick(sounds, 12))
    return made()
  }, [soundPool, tracks, soundSource, seed])
  // The source prepared once per key: a file fetched and decoded, or a bed made for this length and seed; then rendered glitched from the film's plan.
  const prepKey = chosen ? (chosen.kind === 'synth' ? `${chosen.key}:${seconds}:${seed}` : chosen.key) : ''
  const latest = useRef({ chosen, seconds, seed }); latest.current = { chosen, seconds, seed }
  useEffect(() => {
    const { chosen: c, seconds: s, seed: sd } = latest.current
    if (!c || !prepKey) { setTrackBuffer(null); return }
    let gone = false
    const kept = c.url ? soundPoolBuffers.current.get(c.url) : undefined
    const job = kept ? Promise.resolve(kept) : c.kind === 'synth' && c.synth ? synthTrack(c.synth, s + 1, sd, beatOf(sd)) : loadTrack(c.url ?? '')
    job.then((buffer) => { if (!gone) setTrackBuffer({ key: prepKey, buffer }) }).catch(() => { if (!gone) { setTrackBuffer(null); setError(c.kind === 'video' ? 'Le son de cette vidéo ne se lit pas ; Autre tirage en prend un autre.' : c.kind === 'track' ? 'La piste ne se lit pas.' : 'Le son n’a pas pu être fabriqué.') } })
    return () => { gone = true }
  }, [prepKey])
  useEffect(() => {
    if (!input || !withSound || !trackBuffer || trackBuffer.key !== prepKey || fmt.kind !== 'video') { setSound(null); return }
    let gone = false
    const { shots, beat } = planShots(input, input.videos.length, input.stock.length, input.icons.length)
    const offsetSec = chosen?.kind === 'synth' ? 0 : offsetFor(trackBuffer.buffer, input.seconds, seed)
    renderSoundtrack(trackBuffer.buffer, { shots, beat, seconds: input.seconds, seed, glitch, offsetSec }).then((b) => { if (!gone) setSound(b) }).catch(() => { if (!gone) setSound(null) })
    return () => { gone = true }
  }, [input, withSound, trackBuffer, prepKey, chosen, glitch, seed, fmt.kind])

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
      atRef.current = at
      if (ac) { const loop = Math.floor(elapsed / (input.seconds * 1000)); if (loop !== loopNo || (!source && ac.state === 'running')) { loopNo = loop; play(at) } }
      promo.frame(ctx, at, frameNo)
      if (debug) { const sh = promo.shotAt(at); ctx.fillStyle = '#000'; ctx.fillRect(0, canvas.height - 26, canvas.width, 26); ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${sh.phase}:${sh.kind} g=${sh.g.toFixed(2)} ${sh.treat}${sh.huge ? ' huge' : ''} ${sh.residue.join('+')} ${(at / 1000).toFixed(2)}s`, 6, canvas.height - 13) }
      frameNo += 1; handle = requestAnimationFrame(tick)
    }
    tick()
    return () => { stopped = true; cancelAnimationFrame(handle); try { source?.stop() } catch { /* ended */ } }
  }, [input, busy, hold, pw, ph, sound, awake])
  /** What the Son button says: no track, muted, the track being read or prepared, waiting for a click, held, or playing. */
  const soundState = !chosen || fmt.kind !== 'video' ? 'none' : !withSound ? 'muted' : trackBuffer?.key !== prepKey ? 'loading' : !sound ? 'rendering' : !awake ? 'asleep' : hold !== null ? 'held' : 'playing'
  const soundLabel = { none: fmt.kind !== 'video' ? 'pas de son sur un format d’image' : 'aucune source de son', muted: 'son coupé', loading: chosen?.kind === 'synth' ? 'son en fabrication…' : chosen?.kind === 'video' ? 'lecture de la vidéo…' : 'lecture de la piste…', rendering: 'son en préparation…', asleep: 'clique sur le haut-parleur pour entendre', held: 'son tenu avec l’image', playing: 'son' }[soundState]

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
    if (ok) { setTracks((list) => list.filter((x) => x.url !== url)); setSoundSource('any') } else setError('La piste n’a pas pu être retirée.')
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
  const previewW = Math.round(fmt.w * previewScale)
  const toggleSecondary = (i: number) => { if (second === i) { setSecond(third); setThird(-1) } else if (third === i) setThird(-1); else if (second < 0) setSecond(i); else setThird(i) }
  const soundOff = soundState === 'muted' || soundState === 'asleep' || soundState === 'none'
  return (
    <main className="min-h-screen bg-black px-5 py-6 text-white">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-4"><h1 className="text-2xl font-bold">Promo</h1><Link href="/admin/comm" className="text-sm text-gray-400 underline">← La file</Link></div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={chip} disabled={busy || !input} onClick={exportStill}>Image fixe {fmt.w}×{fmt.h}</button>
            {fmt.kind === 'video' ? <button className="rounded-full border border-white bg-white px-5 py-2.5 text-sm font-bold uppercase text-black disabled:opacity-40" disabled={busy || !input} onClick={exportFilm}>{busy ? `Export ${Math.round(progress * 100)} %` : 'Exporter la vidéo'}</button> : null}
          </div>
        </div>
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        {result ? <p className="rounded border border-green-400/50 p-2 text-sm text-green-300">Exporté : {result.name} est téléchargé. <a href={result.url} download={result.name} className="underline">Télécharger à nouveau</a>.</p> : null}
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="mx-auto" style={{ width: previewW }}>
            <div className="relative" style={{ width: previewW, height: Math.round(fmt.h * previewScale) }}>
              <canvas ref={preview} width={pw} height={ph} className="h-full w-full rounded border border-white/20 bg-[#191916]" aria-label="Aperçu" />
              {guide ? <div className="pointer-events-none absolute border border-dashed border-amber-200/40" style={{ left: `${safe.l * 100}%`, top: `${safe.t * 100}%`, right: `${safe.r * 100}%`, bottom: `${safe.b * 100}%`, borderRadius: fmt.round ? '50%' : 0 }} aria-label="Zone sûre" title={`Zone sûre : ${fmt.note}. Un repère, jamais exporté.`} /> : null}
              {textInput && place ? <DragBox rect={{ x: place.x, y: place.y, w: place.width, h: 0.12 }} label="texte" onMove={(x, y) => setPlace((p) => ({ ...(p ?? { width: 0.88 }), x, y }))} /> : null}
              {iconInput ? <DragBox rect={{ x: iconPlace.x, y: iconPlace.y, w: iconPlace.size / fmt.w, h: iconPlace.size / fmt.h }} label="icône" onMove={(x, y) => setIconPlace((p) => ({ ...p, x, y }))} /> : null}
              {!assets ? <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">Chargement…</p> : null}
            </div>
            {/* The transport: play or hold, the moment, the sound, another draw, the guide. */}
            <div className="mt-2 flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-2 py-1 text-xs text-gray-300">
              <button className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10" aria-label={hold === null ? 'Tenir' : 'Lire'} title={hold === null ? 'Tenir ce moment (pour l’image fixe)' : 'Lire'} onClick={() => setHold(hold === null ? Math.round(atRef.current) : null)}><PlayIcon playing={hold === null} /></button>
              <input type="range" min={0} max={seconds * 1000} step={50} value={hold ?? 0} className="min-w-0 flex-1" aria-label="Moment du film" onChange={(e) => setHold(Number(e.target.value))} />
              <span className="w-9 text-right tabular-nums">{((hold ?? 0) / 1000).toFixed(1)} s</span>
              <button className={`flex h-7 w-7 items-center justify-center rounded-full ${soundState === 'playing' || soundState === 'held' ? 'bg-white text-black' : 'hover:bg-white/10'} disabled:opacity-30`} aria-label="Son" title={soundLabel} disabled={soundState === 'none'} onClick={() => { if (!awake) { wake(); setWithSound(true) } else setWithSound(!withSound) }}><SpeakerIcon off={soundOff} /></button>
              <button className="flex h-7 items-center gap-1 rounded-full px-2 hover:bg-white/10 disabled:opacity-30" title={`Autre tirage (n° ${seed})`} aria-label="Autre tirage" disabled={busy} onClick={() => { setSeed(Math.floor(Math.random() * 100000)); setHold(null) }}><RedrawIcon /> <span className="tabular-nums">{seed}</span></button>
            </div>
            <div className="mt-1 flex items-center justify-between px-2 text-[11px] text-gray-500">
              <span>{soundState === 'playing' ? (chosen?.label ?? '') : soundLabel}</span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />zone sûre</label>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <Section title="Format">
              <Row label="Vidéo">{FORMATS.filter((f) => f.kind === 'video').map((f) => <button key={f.key} title={`${f.w}×${f.h} — ${f.note}`} className={format === f.key ? chipOn : chip} onClick={() => setFormat(f.key)}>{f.name}</button>)}</Row>
              <Row label="Image">{FORMATS.filter((f) => f.kind === 'image').map((f) => <button key={f.key} title={`${f.w}×${f.h} — ${f.note}`} className={format === f.key ? chipOn : chip} onClick={() => setFormat(f.key)}>{f.name}</button>)}</Row>
            </Section>
            <Section title="Film">
              <Row label="Durée">{[3, 5, 8, 10, 15].map((s) => <button key={s} className={seconds === s ? chipOn : chip} onClick={() => { setSeconds(s); setHold(null) }}>{s === 3 ? 'Bumper 3 s' : `${s} s`}</button>)}</Row>
              <Row label="Force"><input type="range" min={0.2} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-48" aria-label="Force" /><span className="text-xs tabular-nums">{Math.round(intensity * 100)} %</span></Row>
              <Row label="Couleur 1" hint="la dominante">{COLORS.map(([c, name], i) => <button key={c} aria-label={`${name} principale`} title={name} className={`h-8 w-8 rounded-full border-2 ${accent === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => setAccent(i)} />)}</Row>
              <Row label="Couleurs 2–3" hint={second < 0 && third < 0 ? 'aucune : la dominante seule' : 'jusqu’à deux secondaires'}>{COLORS.map(([c, name], i) => <button key={c} aria-label={`${name} secondaire`} title={name} disabled={i === accent} className={`h-7 w-7 rounded-full border-2 disabled:opacity-20 ${second === i || third === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => toggleSecondary(i)} />)}</Row>
            </Section>
            <Section title="Effets">
              <Row label="Moments">{SHOTS.map((s) => <button key={s.key} title={s.hint} className={shots.includes(s.key) ? chipOn : chip} onClick={() => setShots(shots.includes(s.key) ? shots.filter((x) => x !== s.key) : [...shots, s.key])}>{s.name}</button>)}<span className="ml-1 flex gap-1"><button className={small} onClick={() => setShots(SHOTS.map((s) => s.key))}>tous</button><button className={small} onClick={() => setShots(DEFAULT_SHOTS)}>de base</button><button className={small} onClick={() => setShots([])}>aucun</button></span></Row>
              <Row label="Sujets" hint="un par cycle, parfois deux">{SUBJECTS.map((x) => <button key={x.key} title={x.hint} className={subjects.includes(x.key) ? chipOn : chip} onClick={() => setSubjects(subjects.includes(x.key) ? subjects.filter((k) => k !== x.key) : [...subjects, x.key])}>{x.name}</button>)}</Row>
              <Row label="Marque">{BRAND_MODES.map((m) => <button key={m.key} title={m.hint} className={brandMode === m.key ? chipOn : chip} onClick={() => setBrandMode(m.key)}>{m.name}</button>)}</Row>
            </Section>
            <Section title="Image">
              <Row label="Sources"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withVideos} onChange={(e) => setWithVideos(e.target.checked)} />vidéos libres</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withStock} onChange={(e) => setWithStock(e.target.checked)} />images libres</label><button className={small} disabled={busy} onClick={() => void load(orientation)}>d’autres</button></Row>
              <Row label="Reconnaissance" hint="à 15 % l’image n’est que matière ; à 70 % on la devine"><input type="range" min={0.15} max={0.7} step={0.05} value={recognition} onChange={(e) => setRecognition(Number(e.target.value))} className="w-48" aria-label="Reconnaissance de l’image" /><span className="text-xs tabular-nums">{Math.round(recognition * 100)} %</span></Row>
              {assets ? <p className="px-0 py-1 text-[11px] text-gray-500">Vidéos : {assets.videoInfo.length ? assets.videoInfo.map((v, i) => <span key={v.id}>{i ? ' · ' : ''}<a href={v.page} target="_blank" rel="noreferrer" className="underline">{v.author}</a> ({v.duration} s)</span>) : 'aucune'} — Images : {assets.stockInfo.map((p, i) => <span key={p.id}>{i ? ' · ' : ''}<a href={p.page} target="_blank" rel="noreferrer" className="underline">{p.provider}</a></span>)}</p> : null}
            </Section>
            <Section title="Son">
              <Row label="Source" hint={soundBusy ? 'écoute des vidéos…' : `${soundPool.length} son${soundPool.length > 1 ? 's' : ''} de vidéos entendu${soundPool.length > 1 ? 's' : ''}`}>{([['any', 'Au hasard'], ['tracks', 'Mes pistes'], ['videos', 'Sons de vidéos'], ['synth', 'Généré']] as const).map(([k, name]) => <button key={k} className={soundSource === k ? chipOn : chip} disabled={(k === 'tracks' && !tracks.length) || (k === 'videos' && !soundPool.length)} onClick={() => setSoundSource(k)}>{name}</button>)}</Row>
              <Row label="Pistes">
                {tracks.map((t) => <button key={t.url} title={`${Math.round(t.bytes / 1024 / 1024 * 10) / 10} Mo`} className={soundSource === t.url ? chipOn : chip} onClick={() => setSoundSource(t.url)}>{t.name}</button>)}
                <label className={`${chip} cursor-pointer ${uploading ? 'opacity-40' : ''}`}>{uploading ? 'Envoi…' : 'Déposer des pistes'}<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" multiple className="hidden" disabled={uploading} aria-label="Déposer des pistes" onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void addTracks(files) }} /></label>
                {tracks.some((t) => t.url === soundSource) ? <button className={small} disabled={uploading} onClick={() => void removeTrack(soundSource)}>retirer</button> : null}
              </Row>
              <Row label="Glitch"><input type="range" min={0} max={1} step={0.05} value={glitch} onChange={(e) => setGlitch(Number(e.target.value))} className="w-48" aria-label="Glitch du son" /><span className="text-xs tabular-nums">{Math.round(glitch * 100)} %</span>
                <span className="text-xs text-gray-500">{chosen ? <>{chosen.label}{chosen.credit ? <> — <a href={chosen.credit.page} target="_blank" rel="noreferrer" className="underline">la vidéo</a></> : null}{trackBuffer?.key === prepKey && chosen.kind !== 'synth' ? `, départ à ${offsetFor(trackBuffer.buffer, seconds, seed).toFixed(1)} s` : ''}</> : 'aucune source'}</span></Row>
            </Section>
            <Section title="Texte">
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} rows={2} placeholder={'Une ligne reste sur tout le film ; plusieurs lignes = des cartons, dans l’ordre'} className="my-1 w-full rounded border border-white/20 bg-black p-2 text-sm" aria-label="Texte" />
              <Row label="Taille">{(Object.keys(TEXT_SIZES) as Array<keyof typeof TEXT_SIZES>).map((k) => <button key={k} className={size === k ? chipOn : chip} onClick={() => setSize(k)}>{k}</button>)}<span className="ml-2 flex gap-2">{(['left', 'center', 'right'] as const).map((a) => <button key={a} className={align === a ? chipOn : chip} onClick={() => setAlign(a)}>{a === 'left' ? 'Gauche' : a === 'center' ? 'Centré' : 'Droite'}</button>)}</span></Row>
              <Row label="Police">{FONTS.map(([, , name], i) => <button key={name} className={fontIndex === i ? chipOn : chip} onClick={() => setFontIndex(i)}>{name}</button>)}</Row>
              <Row label="Place" hint={place ? 'glisse le cadre « texte » sur l’aperçu' : undefined}><button className={!place ? chipOn : chip} onClick={() => setPlace(null)}>Dans la zone sûre</button><button className={place ? chipOn : chip} onClick={() => setPlace({ x: 0.06, y: 0.6, width: 0.88 })}>À la main</button></Row>
              <Row label="Icône" hint={iconName ? 'glisse-la sur le film' : undefined}>
                <select value={iconName} onChange={(e) => setIconName(e.target.value)} className="rounded border border-white/30 bg-black px-2 py-1 text-sm" aria-label="Icône"><option value="">aucune</option>{ICONS.map(([name]) => <option key={name} value={name}>{name}</option>)}</select>
                {iconName ? <input type="range" min={48} max={400} step={8} value={iconPlace.size} onChange={(e) => setIconPlace((p) => ({ ...p, size: Number(e.target.value) }))} className="w-32" aria-label="Taille de l’icône" /> : null}
              </Row>
            </Section>
            <details className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-400">
              <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-widest text-gray-500">Comment ça marche</summary>
              <div className="mt-2 space-y-2">
                <p>Un film sur Random, à la forme des refs : la marque propre, une amorce, une rafale, puis une longue retombée où des résidus restent, et la marque bouge à peine. En continu, le lit de la Home : lignes fines, déchirures et blocs où l’image passe très zoomée, qui sautent par pas. Les images et vidéos libres (Pexels, Pixabay) ne sont jamais montrées telles quelles : matière posterisée en gros pixels ; le moment Fond les met plein cadre, dans leurs couleurs par paliers, voilées, déchirées — jamais propres. Le texte reste toujours lisible ; la marque passe derrière lui dans un autre traitement.</p>
                <p>Le son : au hasard, tes pistes d’abord quand il y en a, puis le son pris dans une vidéo libre (sans rapport avec l’image), puis un des cinq sons que le film fabrique (Pulsation, Modem, Statique, Nappe, Arpège). Le film le glitche lui-même : bégaiements aux amorces et aux rafales, trous sur les pas forts, grain écrasé, étouffement dans les retombées, un trou à chaque carton. Le navigateur ne laisse rien jouer avant un premier clic ; pas de son sur les formats d’image. Pistes : tes fichiers libres de droits (mp3, m4a, wav, ogg, flac — Pixabay Musique, bibliothèque audio YouTube).</p>
                <p>Le cadre jaune en pointillé est la zone sûre, celle que l’interface de la plateforme ne cache pas : un repère, jamais exporté ; change de format, la composition suit. Sous l’aperçu : pause tient un moment (pour une image fixe), la flèche ronde tire un autre film, le haut-parleur lance ou coupe le son. Chrome ou Edge sur ordinateur pour l’export vidéo.</p>
              </div>
            </details>
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
