'use client'

/**
 * The promo: short films about Random itself, from the site's own things and stock pictures,
 * with the curator's words on top. One screen: the film plays live, the controls beside it,
 * Exporter gives the MP4.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { downloadBlob } from '@/lib/comm/montageRun'
import { BURSTS, createPromo, recordPromo, type BurstKind, type PromoIcon, type PromoText } from '@/lib/comm/promoLoop'

const COLORS = [['#0FC55D', 'vert'], ['#D90845', 'rouge'], ['#E5972B', 'orange'], ['#FF978F', 'rose'], ['#3D42CC', 'bleu'], ['#AF3BF2', 'violet']] as const
const TEXT_SIZES = { S: 44, M: 64, L: 96 } as const
const FONTS = [['Tomorrow', 900, 'Tomorrow'], ['Tomorrow', 700, 'Tomorrow fin'], ['InterTight', 700, 'Inter Tight']] as const
/** The site's icons, from public/icons, drawn cream. */
const ICONS: Array<[string, string]> = [['heart', 'Heart.svg'], ['shuffle', 'Shuffle.svg'], ['video', 'Video.svg'], ['image', 'image.svg'], ['web', 'web.svg'], ['wave', 'wave.svg'], ['quote', 'quote.svg'], ['joke', 'joke.svg'], ['fact', 'fact.svg'], ['share', 'share.svg'], ['social', 'social.svg'], ['plus', 'plus.svg'], ['info', 'info.svg'], ['comm', 'comm.svg']]
const chip = 'rounded-full border border-white/40 px-3 py-1.5 text-sm disabled:opacity-40'
const chipOn = 'rounded-full border border-white bg-white px-3 py-1.5 text-sm text-black'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error(url)); img.src = url })
}
/** An icon file recoloured and made an image. */
async function loadIcon(file: string, color: string): Promise<HTMLImageElement | null> {
  try {
    const svg = (await (await fetch(`/icons/${encodeURIComponent(file)}`)).text()).replace(/<\?xml[^>]*>\s*/, '').replace(/<!--[\s\S]*?-->/g, '')
      .replace(/fill:\s*#[0-9a-fA-F]{3,8}/g, `fill: ${color}`).replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${color}"`).replace(/<svg\b/, `<svg fill="${color}"`)
    return await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
  } catch { return null }
}

type Stock = { id: string; provider: string; page: string; src: string }
type Assets = { logo: HTMLImageElement; logoVertical: HTMLImageElement; logoDark: HTMLImageElement; logoVerticalDark: HTMLImageElement; icons: HTMLImageElement[]; iconsByName: Record<string, HTMLImageElement>; stock: HTMLImageElement[]; stockInfo: Stock[] }

export default function PromoPage() {
  const [accent, setAccent] = useState(0)
  const [intensity, setIntensity] = useState(0.7)
  const [seconds, setSeconds] = useState(8)
  const [seed, setSeed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  const [assets, setAssets] = useState<Assets | null>(null)
  const [withStock, setWithStock] = useState(true)
  /** The bursts the film may use. */
  const [bursts, setBursts] = useState<BurstKind[]>(BURSTS.map((b) => b.key))
  const [text, setText] = useState('')
  const [size, setSize] = useState<keyof typeof TEXT_SIZES>('M')
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left')
  const [fontIndex, setFontIndex] = useState(0)
  const [place, setPlace] = useState({ x: 0.06, y: 0.68, width: 0.88 })
  const [iconName, setIconName] = useState('')
  const [iconPlace, setIconPlace] = useState({ x: 0.78, y: 0.08, size: 120 })
  const preview = useRef<HTMLCanvasElement | null>(null)
  const fonts = useMemo(() => { if (typeof window === 'undefined') return { tomorrow: 'Tomorrow, sans-serif', inter: '"Inter Tight", sans-serif' }; const s = getComputedStyle(document.body); return { tomorrow: s.getPropertyValue('--font-tomorrow').trim() || 'Tomorrow, sans-serif', inter: s.getPropertyValue('--font-inter-tight').trim() || '"Inter Tight", sans-serif' } }, [])
  // The first draw of the seed happens in the browser only, so the server's page and the browser's agree.
  useEffect(() => { setSeed(Math.floor(Math.random() * 100000)) }, [])

  /** The site's things and a fresh handful of stock pictures. */
  const load = useCallback(async () => {
    setError('')
    try {
      const [logo, logoVertical, logoDark, logoVerticalDark, icons, stockList] = await Promise.all([
        loadImage(`/api/admin/comm/brand?variant=horizontal&color=${encodeURIComponent('#F8F5E6')}`),
        loadImage(`/api/admin/comm/brand?variant=vertical&color=${encodeURIComponent('#F8F5E6')}`),
        loadImage(`/api/admin/comm/brand?variant=horizontal&color=${encodeURIComponent('#121210')}`),
        loadImage(`/api/admin/comm/brand?variant=vertical&color=${encodeURIComponent('#121210')}`),
        Promise.all(ICONS.map(([name, file]) => loadIcon(file, '#F8F5E6').then((img) => [name, img] as const))),
        fetch('/api/admin/comm/stock?n=8', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ pictures: [] })) as Promise<{ pictures?: Stock[] }>,
      ])
      const iconsByName: Record<string, HTMLImageElement> = {}
      for (const [name, img] of icons) if (img) iconsByName[name] = img
      const stockInfo = stockList.pictures ?? []
      const stock = (await Promise.all(stockInfo.map((p) => loadImage(p.src).catch(() => null)))).filter((i): i is HTMLImageElement => Boolean(i))
      await document.fonts.ready
      setAssets({ logo, logoVertical, logoDark, logoVerticalDark, icons: Object.values(iconsByName), iconsByName, stock, stockInfo })
    } catch (cause) { setError(cause instanceof Error ? `Chargement impossible : ${cause.message}` : 'Chargement impossible.') }
  }, [])
  useEffect(() => { void load() }, [load])

  const textInput = useMemo<PromoText | null>(() => text.trim() ? { value: text, size: TEXT_SIZES[size], align, font: FONTS[fontIndex][0] === 'Tomorrow' ? fonts.tomorrow : fonts.inter, weight: FONTS[fontIndex][1], x: place.x, y: place.y, width: place.width } : null, [text, size, align, fontIndex, fonts, place])
  const iconInput = useMemo<PromoIcon | null>(() => assets && iconName && assets.iconsByName[iconName] ? { image: assets.iconsByName[iconName], x: iconPlace.x, y: iconPlace.y, size: iconPlace.size } : null, [assets, iconName, iconPlace])
  const input = useMemo(() => assets ? { seconds, intensity, seed, accent: COLORS[accent][0], bursts, logo: assets.logo, logoVertical: assets.logoVertical, logoDark: assets.logoDark, logoVerticalDark: assets.logoVerticalDark, icons: assets.icons, stock: withStock ? assets.stock : [], titleFont: fonts.tomorrow, text: textInput, icon: iconInput } : null, [assets, seconds, intensity, seed, accent, bursts, withStock, fonts, textInput, iconInput])

  // The film plays live at half size, over and over, until the export takes the canvas.
  useEffect(() => {
    const canvas = preview.current
    if (!canvas || !input || busy) return
    const ctx = canvas.getContext('2d')!
    const promo = createPromo(input, canvas.width, canvas.height)
    let stopped = false, handle = 0, frameNo = 0
    const started = performance.now()
    const debug = new URLSearchParams(window.location.search).has('debug')
    const tick = () => {
      if (stopped) return
      const at = (performance.now() - started) % (input.seconds * 1000)
      promo.frame(ctx, at, frameNo)
      // With ?debug the scene's name and the moment, to read what the film is doing.
      if (debug) { const st = promo.stateAt(at); ctx.fillStyle = '#000'; ctx.fillRect(0, canvas.height - 28, canvas.width, 28); ctx.fillStyle = '#fff'; ctx.font = '15px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${st.kind}${st.kind === 'burst' ? ':' + st.burst : ''} ${st.treat} ${st.stacked ? 'stacked' : 'across'}${st.hud ? ' hud' : ''}${st.line ? ' line' : ''}${st.icon ? ' icon' : ''} ${(at / 1000).toFixed(2)}s`, 8, canvas.height - 14) }
      frameNo += 1; handle = requestAnimationFrame(tick)
    }
    tick()
    return () => { stopped = true; cancelAnimationFrame(handle) }
  }, [input, busy])

  const generate = useCallback(async () => {
    if (!input) return
    setBusy(true); setError(''); setResult(null); setProgress(0)
    try {
      const out = await recordPromo(input, preview.current, setProgress)
      const name = `random-promo-${COLORS[accent][1]}-${seconds}s-${seed}.${out.extension}`
      setResult({ url: URL.createObjectURL(out.blob), name })
      downloadBlob(out.blob, name)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export impossible.') }
    setBusy(false)
  }, [input, accent, seconds, seed])

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-5">
        <nav className="text-sm"><Link href="/admin/comm" className="underline">← La file</Link></nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Promo</h1>
          <button className="rounded-full border border-white bg-white px-5 py-2.5 text-sm font-bold uppercase text-black disabled:opacity-40" disabled={busy || !input} onClick={generate}>{busy ? `Export ${Math.round(progress * 100)} %` : 'Exporter'}</button>
        </div>
        <p className="text-sm text-gray-300">Un court film sur Random, à la grammaire des refs : la marque propre, dans un traitement qui change (crème, couleur, panneau, tramée, contour, fendue) ; des rafales courtes où tout l’écran devient de la matière cassée — l’image libre (Pexels / Pixabay, jamais montrée telle quelle) et les lettres ensemble ; des résidus entre deux (une lettre remplie d’image, des blocs qui restent) ; une interface caméra minuscule, parfois ; une icône au plus, déchirée avec le reste. À forte intensité, un champ de fragments au lieu du noir. Chrome ou Edge sur ordinateur pour l’export.</p>
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        {result ? <p className="rounded border border-green-400/50 p-2 text-sm text-green-300">Exporté : {result.name} est téléchargé. <a href={result.url} download={result.name} className="underline">Télécharger à nouveau</a>.</p> : null}
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="relative mx-auto w-[300px]" style={{ aspectRatio: '9 / 16' }}>
            <canvas ref={preview} width={540} height={960} className="h-full w-full rounded border border-white/20 bg-[#191916]" aria-label="Aperçu" />
            {textInput ? <DragBox rect={{ x: place.x, y: place.y, w: place.width, h: 0.12 }} label="texte" onMove={(x, y) => setPlace((p) => ({ ...p, x, y }))} /> : null}
            {iconInput ? <DragBox rect={{ x: iconPlace.x, y: iconPlace.y, w: iconPlace.size / 1080, h: iconPlace.size / 1920 }} label="icône" onMove={(x, y) => setIconPlace((p) => ({ ...p, x, y }))} /> : null}
            {!assets ? <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">Chargement…</p> : null}
          </div>
          <div className="space-y-4 text-sm">
            <section className="rounded border border-white/15 p-3">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-400">Film</h2>
              <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Couleur</span>{COLORS.map(([c, name], i) => <button key={c} aria-label={name} className={`h-8 w-8 rounded-full border-2 ${accent === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => setAccent(i)} />)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Force</span><input type="range" min={0.2} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-48" aria-label="Force" /><span className="text-xs">{Math.round(intensity * 100)} %</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Durée</span>{[5, 8, 10, 15].map((s) => <button key={s} className={seconds === s ? chipOn : chip} onClick={() => setSeconds(s)}>{s} s</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Rafales</span>{BURSTS.map((b) => <button key={b.key} title={b.hint} className={bursts.includes(b.key) ? chipOn : chip} onClick={() => setBursts(bursts.includes(b.key) ? bursts.filter((x) => x !== b.key) : [...bursts, b.key])}>{b.name}</button>)}</div>
              <p className="mt-1 text-[11px] text-gray-500">Allume ou éteins les rafales que le film peut tirer.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Images</span><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withStock} onChange={(e) => setWithStock(e.target.checked)} />images libres au hasard</label><button className={chip} disabled={busy} onClick={() => void load()}>D’autres images</button></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Tirage</span><button className={chip} disabled={busy} onClick={() => setSeed(Math.floor(Math.random() * 100000))}>Autre tirage (n° {seed})</button></div>
              {assets?.stockInfo.length ? <p className="mt-2 text-[11px] text-gray-500">Images : {assets.stockInfo.map((p, i) => <span key={p.id}>{i ? ' · ' : ''}<a href={p.page} target="_blank" rel="noreferrer" className="underline">{p.provider}</a></span>)}</p> : null}
            </section>
            <section className="rounded border border-white/15 p-3">
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-400">Texte</h2>
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} rows={2} placeholder="Tes mots, par-dessus le film" className="w-full rounded border border-white/30 bg-black p-2 text-sm" aria-label="Texte" />
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Taille</span>{(Object.keys(TEXT_SIZES) as Array<keyof typeof TEXT_SIZES>).map((k) => <button key={k} className={size === k ? chipOn : chip} onClick={() => setSize(k)}>{k}</button>)}
                {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={align === a ? chipOn : chip} onClick={() => setAlign(a)}>{a === 'left' ? 'Gauche' : a === 'center' ? 'Centré' : 'Droite'}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Police</span>{FONTS.map(([, , name], i) => <button key={name} className={fontIndex === i ? chipOn : chip} onClick={() => setFontIndex(i)}>{name}</button>)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Icône</span>
                <select value={iconName} onChange={(e) => setIconName(e.target.value)} className="rounded border border-white/30 bg-black px-2 py-1 text-sm" aria-label="Icône"><option value="">aucune</option>{ICONS.map(([name]) => <option key={name} value={name}>{name}</option>)}</select>
                {iconName ? <><input type="range" min={48} max={400} step={8} value={iconPlace.size} onChange={(e) => setIconPlace((p) => ({ ...p, size: Number(e.target.value) }))} className="w-32" aria-label="Taille de l’icône" /><span className="text-xs text-gray-400">glisse-la sur le film</span></> : null}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">Le texte se glisse sur le film ; il reste net par-dessus toutes les scènes.</p>
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
