'use client'

/** The brand loops: one accent, one intensity, five seconds, an MP4 built like the reference. */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { recordBrandLoop } from '@/lib/comm/brandLoop'
import { downloadBlob } from '@/lib/comm/montageRun'

const COLORS = [['#0FC55D', 'vert'], ['#D90845', 'rouge'], ['#E5972B', 'orange'], ['#FF978F', 'rose'], ['#3D42CC', 'bleu'], ['#AF3BF2', 'violet']] as const
const chip = 'rounded-full border border-white/40 px-3 py-1.5 text-sm disabled:opacity-40'
const chipOn = 'rounded-full border border-white bg-white px-3 py-1.5 text-sm text-black'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('logo')); img.src = url })
}

export default function FondsPage() {
  const [accent, setAccent] = useState(0)
  const [intensity, setIntensity] = useState(0.7)
  const [seconds, setSeconds] = useState(5)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  const [seed, setSeed] = useState(0)
  const preview = useRef<HTMLCanvasElement | null>(null)
  // The first draw of the seed happens in the browser only, so the server's page and the browser's agree.
  useEffect(() => { setSeed(Math.floor(Math.random() * 100000)) }, [])

  const generate = useCallback(async () => {
    setBusy(true); setError(''); setResult(null); setProgress(0)
    try {
      const color = COLORS[accent][0]
      const [vertical, horizontal, verticalAccent, verticalDark] = await Promise.all([
        loadImage(`/api/admin/comm/brand?variant=vertical&color=${encodeURIComponent('#F8F5E6')}`),
        loadImage(`/api/admin/comm/brand?variant=horizontal&color=${encodeURIComponent('#F8F5E6')}`),
        loadImage(`/api/admin/comm/brand?variant=vertical&color=${encodeURIComponent(color)}`),
        loadImage(`/api/admin/comm/brand?variant=vertical&color=${encodeURIComponent('#121210')}`),
      ])
      const styles = getComputedStyle(document.body)
      const pillFont = styles.getPropertyValue('--font-inter-tight').trim() || '"Inter Tight", sans-serif'
      const titleFont = styles.getPropertyValue('--font-inter-tight').trim() || '"Inter Tight", sans-serif'
      const out = await recordBrandLoop({ accent: color, intensity, seconds, seed, vertical, horizontal, verticalAccent, verticalDark, pillFont, titleFont, preview: preview.current, onProgress: setProgress })
      const name = `random-fond-${COLORS[accent][1]}-${Math.round(intensity * 100)}-${seed}.${out.extension}`
      const url = URL.createObjectURL(out.blob)
      setResult({ url, name })
      downloadBlob(out.blob, name)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Génération impossible.') }
    setBusy(false)
  }, [accent, intensity, seconds, seed])

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-5">
        <nav className="text-sm"><Link href="/admin/comm" className="underline">← La file</Link></nav>
        <h1 className="text-2xl font-bold">Fonds vidéo</h1>
        <p className="text-sm text-gray-300">Une suite de scènes tirées au sort : la carte, les lettres en couleur, les lettres ouvertes sur des ectoplasmes, un sticker déchiré, l’autre typo, les lettres zoomées à franges, des bandes VHS, des mosaïques, le vide ; des coupes brutales entre elles, l’interface de caméra, du grain et des rayures. Chaque tirage est un autre film. Chrome ou Edge sur ordinateur.</p>
        <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Couleur</span>{COLORS.map(([c, name], i) => <button key={c} aria-label={name} className={`h-8 w-8 rounded-full border-2 ${accent === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => setAccent(i)} />)}</div>
        <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Force</span><input type="range" min={0.2} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-48" /><span className="text-xs">{Math.round(intensity * 100)} %</span></div>
        <div className="flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Durée</span>{[5, 8, 10].map((s) => <button key={s} className={seconds === s ? chipOn : chip} onClick={() => setSeconds(s)}>{s} s</button>)}</div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-full border border-white bg-white px-5 py-2.5 text-sm font-bold uppercase text-black disabled:opacity-40" disabled={busy} onClick={generate}>{busy ? `Génération ${Math.round(progress * 100)} %` : 'Générer'}</button>
          <button className={chip} disabled={busy} onClick={() => setSeed(Math.floor(Math.random() * 100000))}>Autre tirage (n° {seed})</button>
          {result ? <a href={result.url} download={result.name} className="text-sm underline">Télécharger {result.name}</a> : null}
        </div>
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div><p className="mb-1 text-xs text-gray-400">Pendant la génération</p><canvas ref={preview} width={270} height={480} className="rounded border border-white/20 bg-[#191916]" /></div>
          {result ? <div><p className="mb-1 text-xs text-gray-400">Le résultat</p><video src={result.url} controls loop autoPlay muted playsInline className="w-[270px] rounded border border-white/20" /></div> : null}
        </div>
      </div>
    </main>
  )
}
