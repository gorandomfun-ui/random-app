'use client'

/**
 * The journey after the queue: where (step 2), what format (step 3), the
 * slides and the words (step 4), export or publish (step 5). A progress bar
 * on top; back and forth loses nothing, the draft is saved at every change.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DESTINATION_SPECS, formatSpec, type FormatSpec } from '@/lib/comm/destinations'
import { buildCaption, MUSIC_NOTE, suggestHashtags, type Phrase } from '@/lib/comm/caption'
import type { MediaDoc, PostDoc, PostSlide } from '@/lib/comm/model'
import type { Template } from '@/lib/comm/templates'
import { commList, ensurePoster, type QueueItemWithMedia } from '@/lib/comm/client'
import type { Placement } from '@/lib/comm/model'
import { buildExportZip, downloadBlob, type ExportSlide } from '@/lib/comm/exportZip'
import { FAMILY_SIZES } from '@/lib/comm/templates'
import { glitchOf } from '@/lib/comm/templates'
import { areaOf } from '@/lib/comm/montage'
import { clipMaxSeconds } from '@/lib/comm/model'
import dynamic from 'next/dynamic'
import { prepareInstagramAssets, publishInstagram } from '@/lib/comm/publishClient'

/** The montage panel: loaded when a video slide asks for it. */
const MontagePanel = dynamic(() => import('@/components/comm/MontagePanel'), { ssr: false })

const headers = { 'Content-Type': 'application/json' }
const STEPS = ['La file', 'Où', 'Format', 'Composer', 'Publier']
const PALETTE_COLORS = ['#0FC55D', '#D90845', '#E5972B', '#FF978F', '#3D42CC', '#AF3BF2']
const button = 'rounded-full border border-white px-4 py-2 text-sm font-bold uppercase disabled:opacity-40'
const small = 'rounded border border-white/40 px-2 py-1 text-xs disabled:opacity-40'
/** One zone of the editor: a bordered block, its title in the site's typeface. */
const card = 'rounded-xl border border-white/15 bg-[#191916] p-4 text-sm'
const cardTitle = 'mb-3 font-tomorrow text-xs font-black uppercase tracking-[0.18em] text-[#F8F5E6]'

type MediaChoice = { key: string; label: string; itemId: string; mediaId: string | null; media: MediaDoc | null; thumb: string | null }

export default function ComposeClient({ itemIds, postId }: { itemIds: string[]; postId: string | null }) {
  const router = useRouter()
  const [destination, setDestination] = useState<string>('')
  const [format, setFormat] = useState<string>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [post, setPost] = useState<PostDoc | null>(null)
  const [items, setItems] = useState<QueueItemWithMedia[]>([])
  /** Every item of the queue: a slide may take any of them. */
  const [queue, setQueue] = useState<QueueItemWithMedia[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [current, setCurrent] = useState(0)
  const [step, setStep] = useState(postId ? 4 : 2)
  const [keep] = useState<Set<string>>(new Set())
  const [exported, setExported] = useState<{ number: number } | null>(null)
  const [progress, setProgress] = useState('')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [customTag, setCustomTag] = useState('')
  const [montageOpen, setMontageOpen] = useState(false)
  const [published, setPublished] = useState<{ remoteUrl: string | null; commented: boolean } | null>(null)
  const [publishError, setPublishError] = useState('')
  const [config, setConfig] = useState<{ instagram: boolean } | null>(null)
  const saveTimer = useRef<number | null>(null)
  const dirty = useRef<Partial<PostDoc>>({})

  // The draft and its items, the templates, the phrases. A draft just born moves the journey to step 4.
  useEffect(() => {
    if (!postId) return
    setStep((current) => (current < 4 ? 4 : current))
    void fetch(`/api/admin/comm/posts/${postId}`, { cache: 'no-store' }).then((r) => r.json()).then((body) => {
      if (!body.post) { setError('Ce brouillon est introuvable.'); return }
      setPost(body.post); setItems(body.items ?? []); setDestination(body.post.destination); setFormat(body.post.format)
      if (body.post.status === 'exported' || body.post.status === 'published') setExported({ number: body.post.number })
    }).catch(() => setError('Le brouillon est indisponible.'))
    void commList().then((body) => { if (body.items) setQueue(body.items) }).catch(() => {})
    void fetch('/api/admin/comm/templates', { cache: 'no-store' }).then((r) => r.json()).then((body) => setTemplates(body.templates ?? [])).catch(() => {})
    void fetch('/api/admin/comm/phrases', { cache: 'no-store' }).then((r) => r.json()).then((body) => setPhrases(body.phrases ?? [])).catch(() => {})
    void fetch('/api/admin/comm/config', { cache: 'no-store' }).then((r) => r.json()).then((body) => setConfig({ instagram: body.instagram?.configured === true })).catch(() => setConfig({ instagram: false }))
  }, [postId])

  const spec: FormatSpec | null = useMemo(() => (destination && format ? formatSpec(destination, format) : null), [destination, format])
  const destSpec = useMemo(() => DESTINATION_SPECS.find((d) => d.key === destination) ?? null, [destination])

  const createDraft = useCallback(async () => {
    if (!destination || !format) return
    setBusy('Création du brouillon'); setError('')
    const response = await fetch('/api/admin/comm/posts', { method: 'POST', headers, body: JSON.stringify({ destination, format, queueItemIds: itemIds }) })
    const body = await response.json().catch(() => ({}))
    setBusy('')
    if (!body.post) { setError('Le brouillon n’a pas pu être créé.'); return }
    router.replace(`/admin/comm/compose?post=${body.post._id}`)
  }, [destination, format, itemIds, router])

  // Every change is saved a moment later; the draft survives a reload at any step.
  const save = useCallback((patch: Partial<PostDoc>) => {
    if (!post) return
    setPost((current) => (current ? { ...current, ...patch } : current))
    dirty.current = { ...dirty.current, ...patch }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const pending = dirty.current; dirty.current = {}
      const response = await fetch(`/api/admin/comm/posts/${post._id}`, { method: 'PATCH', headers, body: JSON.stringify(pending) })
      if (!response.ok) setError('La sauvegarde du brouillon a échoué.')
    }, 600)
  }, [post])

  const material = useMemo(() => { const byId = new Map<string, QueueItemWithMedia>(); for (const item of [...queue, ...items]) byId.set(item._id, item); return Array.from(byId.values()) }, [queue, items])
  const allMedia = useMemo(() => material.flatMap((i) => i.media), [material])
  const mediaChoices: MediaChoice[] = useMemo(() => material.flatMap((item) => [
    ...item.media.filter((m) => m.kind !== 'render' && m.kind !== 'poster').filter((m) => (spec?.media === 'video' ? m.contentType.startsWith('video/') : spec?.media === 'image' ? m.contentType.startsWith('image/') : true))
      .map((m) => ({ key: m._id, label: `${m.kind === 'montage' ? 'Montage' : m.contentType.startsWith('video/') ? 'Extrait' : m.kind === 'still' ? 'Image fixe' : 'Image'} · ${item.snapshot.title.slice(0, 36)}`, itemId: item._id, mediaId: m._id, media: m, thumb: m.blobUrl })),
    ...(item.snapshot.thumb && spec?.media !== 'video' ? [{ key: `thumb:${item._id}`, label: `Miniature · ${item.snapshot.title.slice(0, 36)}`, itemId: item._id, mediaId: null, media: null, thumb: item.snapshot.thumb }] : []),
  ]), [material, spec])

  const familyTemplates = useMemo(() => (spec ? templates.filter((t) => t.family === spec.family) : []), [templates, spec])
  const slide: PostSlide | null = post?.slides[current] ?? null
  const slideMedia = useMemo(() => (slide?.mediaId ? allMedia.find((m) => m._id === slide.mediaId) ?? null : null), [allMedia, slide])
  const isVideoSlide = Boolean(slideMedia?.contentType.startsWith('video/'))

  // A clip on a slide needs its poster for the engine to draw it; made once, here, when missing.
  useEffect(() => {
    if (!slideMedia || !isVideoSlide || slideMedia.kind === 'montage') return
    let cancelled = false
    void ensurePoster(slideMedia, allMedia).then((poster) => {
      if (!poster || cancelled) return
      const add = (list: QueueItemWithMedia[]) => list.map((i) => (i._id === poster.queueItemId ? { ...i, media: [...i.media, poster] } : i))
      setQueue(add); setItems(add)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per clip
  }, [slideMedia?._id])
  // A montage carries its dressing already: the preview shows the clip alone.
  const isBaked = slideMedia?.kind === 'montage'
  const slideTemplate = useMemo(() => familyTemplates.find((t) => t.key === slide?.templateKey) ?? familyTemplates[0] ?? null, [familyTemplates, slide])

  /** A montage or a still just made: into the item's media, and onto the slide. */
  const onMontageDone = useCallback((made: MediaDoc) => {
    setItems((current) => current.map((item) => (item._id === made.queueItemId ? { ...item, media: [...item.media, made] } : item)))
    setMontageOpen(false)
    if (post) save({ slides: post.slides.map((s, i) => (i === current ? { ...s, mediaId: made._id } : s)) })
  }, [current, post, save])
  const anyVideo = useMemo(() => post?.slides.some((s) => allMedia.find((m) => m._id === s.mediaId)?.contentType.startsWith('video/')) ?? false, [post, allMedia])

  const renderUrl = useCallback((s: PostSlide, index: number, mode: 'full' | 'overlay', scale?: number) => {
    const item = material.find((i) => i._id === s.itemId) ?? items[0]
    const params = new URLSearchParams({ template: s.templateKey, palette: String(s.palette), logo: s.logoVariant, text: s.text, mode, seed: `${post?._id ?? 'x'}-${index}` })
    if (scale) params.set('scale', String(scale))
    // The slide's own glitch overrides the template's; without one, the template decides.
    if (s.glitch != null) params.set('glitch', String(s.glitch))
    if (s.fit) params.set('fit', s.fit)
    if (s.textPosition) params.set('textpos', s.textPosition)
    const placeParam = (p: Placement) => [p.x, p.y, p.size, p.align ?? '', p.width ?? ''].join(',')
    if (s.textPlace) params.set('textplace', placeParam(s.textPlace))
    if (s.sourcePlace) params.set('sourceplace', placeParam(s.sourcePlace))
    if (s.logoPlace) params.set('logoplace', placeParam(s.logoPlace))
    if (s.mediaPlace) params.set('mediaplace', [s.mediaPlace.x, s.mediaPlace.y, s.mediaPlace.w, s.mediaPlace.h].join(','))
    if (item) params.set('item', item._id)
    if (s.mediaId) params.set('media', s.mediaId); else params.set('thumb', '1')
    if (post?.credit) params.set('credit', post.credit)
    return `/api/admin/comm/render?${params.toString()}`
  }, [items, material, post])

  // The pictures follow the slides half a second after the last change, not at every keystroke or pixel of a drag.
  const [settled, setSettled] = useState<PostSlide[] | null>(null)
  useEffect(() => {
    if (!post) return
    const timer = window.setTimeout(() => setSettled(post.slides), 500)
    return () => window.clearTimeout(timer)
  }, [post])
  const settledSlide = (index: number): PostSlide | null => settled?.[index] ?? post?.slides[index] ?? null

  const updateSlide = useCallback((patch: Partial<PostSlide>) => {
    if (!post) return
    const slides = post.slides.map((s, i) => (i === current ? { ...s, ...patch } : s))
    save({ slides })
  }, [current, post, save])

  const addSlide = useCallback(() => {
    if (!post || !spec || post.slides.length >= spec.slides.max) return
    const base = post.slides[current] ?? post.slides[0]
    save({ slides: [...post.slides, { ...base, text: '' }] }); setCurrent(post.slides.length)
  }, [current, post, save, spec])

  const removeSlide = useCallback(() => {
    if (!post || post.slides.length <= 1) return
    const slides = post.slides.filter((_, i) => i !== current)
    save({ slides }); setCurrent(Math.max(0, current - 1))
  }, [current, post, save])

  const moveSlide = useCallback((delta: number) => {
    if (!post) return
    const target = current + delta
    if (target < 0 || target >= post.slides.length) return
    const slides = [...post.slides]; const [moved] = slides.splice(current, 1); slides.splice(target, 0, moved)
    save({ slides }); setCurrent(target)
  }, [current, post, save])

  const firstItem = useMemo(() => { const id = post?.slides.find((s) => s.itemId)?.itemId; return (id ? material.find((i) => i._id === id) : null) ?? items[0] ?? null }, [post, material, items])
  const caption = useMemo(() => (post && firstItem ? buildCaption({ destination: post.destination, format: post.format, title: post.captionHead ? '' : firstItem.snapshot.title, phrase: post.captionHead ? post.captionHead : post.phrase, snapshot: firstItem.snapshot, credit: post.credit, number: post.number, hashtags: post.hashtags, homeUrl: post.homeLink ? (typeof window === 'undefined' ? 'https://gorandom.fun/' : window.location.origin) : null }) : null), [post, firstItem])
  useEffect(() => { if (caption && post && caption.text !== post.caption) save({ caption: caption.text }) }, [caption, post, save])

  const suggested = useMemo(() => suggestHashtags(items.flatMap((i) => i.subjects)), [items])
  const unknownAuthor = useMemo(() => items.filter((i) => !i.snapshot.author.trim() && !(post?.credit ?? '').trim()), [items, post])
  const canExport = Boolean(post && post.slides.length >= (spec?.slides.min ?? 1) && caption && !caption.overLimit)

  const doExport = useCallback(async () => {
    if (!post || !canExport || !caption) return
    setBusy('Préparation des fichiers'); setError('')
    try {
      const slides: ExportSlide[] = post.slides.map((s, index) => {
        const media = items.flatMap((i) => i.media).find((m) => m._id === s.mediaId) ?? null
        const video = Boolean(media?.contentType.startsWith('video/'))
        const baked = media?.kind === 'montage'
        return { index, kind: video ? 'video' : 'image', renderUrl: `${window.location.origin}${renderUrl(s, index, 'full')}`, overlayUrl: video && !baked ? `${window.location.origin}${renderUrl(s, index, 'overlay')}` : undefined, videoUrl: video ? media!.blobUrl : undefined, videoType: media?.contentType }
      })
      const zip = await buildExportZip(slides, caption.text, (done, total) => setProgress(`${done} / ${total}`))
      downloadBlob(zip, `random-comm-${String(post.number).padStart(3, '0')}-${post.destination}.zip`)
      const response = await fetch(`/api/admin/comm/posts/${post._id}/exported`, { method: 'POST', headers, body: JSON.stringify({ keep: [...keep] }) })
      if (!response.ok) throw new Error('export')
      setExported({ number: post.number }); setStep(5)
    } catch (cause) { setError(cause instanceof Error && cause.message !== 'export' ? `Export impossible : ${cause.message}` : 'Les fichiers sont téléchargés mais la file n’a pas été mise à jour.') }
    setBusy(''); setProgress('')
  }, [canExport, caption, items, keep, post, renderUrl])

  const doPublish = useCallback(async () => {
    if (!post || !canExport || !caption || post.destination !== 'instagram') return
    setBusy('Préparation de la publication'); setError(''); setPublishError('')
    const mediaById = new Map(items.flatMap((i) => i.media).map((m) => [m._id, m]))
    const prepared = await prepareInstagramAssets(post, mediaById, (index) => `${window.location.origin}${renderUrl(post.slides[index], index, 'full')}`, setProgress)
    if (!prepared.ok) { setBusy(''); setProgress(''); setPublishError(prepared.reason); return }
    setBusy('Publication sur Instagram')
    const outcome = await publishInstagram(post._id, prepared.assets, [...keep], setProgress)
    setBusy(''); setProgress('')
    if (outcome.state === 'published') { setPublished({ remoteUrl: outcome.remoteUrl, commented: outcome.commented }); setPost((current) => (current ? { ...current, status: 'published', remoteUrl: outcome.remoteUrl } : current)); setStep(5) }
    else setPublishError(outcome.reason)
  }, [canExport, caption, items, keep, post, renderUrl])

  // The framing of a video in the preview: the slide's own, else the template's mode; inside the template's band.
  const templateGlitch = useMemo(() => (slideTemplate ? glitchOf(slideTemplate.layers)?.intensity ?? 0 : 0), [slideTemplate])
  const slideGlitch = slide?.glitch ?? templateGlitch
  /** The two faces of a family: full screen, or the Random glitch around the picture. */
  const marginTemplates = useMemo(() => {
    const plain = familyTemplates.find((t) => t.mode === 'full' && !t.key.endsWith('-glitch')) ?? familyTemplates[0]
    const glitch = familyTemplates.find((t) => t.key.endsWith('-glitch')) ?? plain
    return { none: plain?.key ?? '', glitch: glitch?.key ?? '' }
  }, [familyTemplates])
  const margin: 'none' | 'glitch' = slide?.templateKey.endsWith('-glitch') ? 'glitch' : 'none'
  const defaultTextPlace = (): Placement => ({ x: 0.06, y: slide?.textPosition === 'middle' ? 0.42 : slide?.textPosition === 'bottom' ? 0.74 : 0.1, size: 64, align: 'left', width: 0.88 })
  const defaultSourcePlace = (): Placement => ({ x: 0.06, y: spec?.family === '16:9' ? 0.86 : spec?.family === '9:16' ? 0.905 : 0.9, size: 30, align: 'left', width: 0.88 })
  const defaultLogoPlace = (): Placement => ({ x: 0.06, y: 0.035, size: slideTemplate?.key.endsWith('-glitch') ? 280 : 300 })
  const templateArea = slideTemplate ? areaOf(slideTemplate.layers) : { left: 0, top: 0, width: 1, height: 1 }
  const defaultMediaPlace = () => ({ x: templateArea.left, y: templateArea.top, w: templateArea.width, h: templateArea.height })
  const mediaRect = slide?.mediaPlace ?? defaultMediaPlace()

  useEffect(() => {
    if (previewIndex == null) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewIndex(null); if (event.key === 'ArrowRight' && post) setPreviewIndex((i) => (i == null ? i : Math.min(post.slides.length - 1, i + 1))); if (event.key === 'ArrowLeft') setPreviewIndex((i) => (i == null ? i : Math.max(0, i - 1))) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [previewIndex, post])

  const bar = (
    <ol className="flex flex-wrap gap-2 text-xs">
      {STEPS.map((name, i) => { const n = i + 1; const active = n === step; const done = n < step
        return <li key={name} className={`rounded-full px-3 py-1 ${active ? 'bg-white text-black' : done ? 'border border-white' : 'border border-white/30 text-white/50'}`}>{n}. {name}</li> })}
    </ol>
  )

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-5">
        <nav className="text-sm"><Link href="/admin/comm" className="underline">← La file</Link></nav>
        {bar}
        {error ? <p role="alert" className="text-red-300">{error}</p> : null}
        {busy ? <p role="status">{busy}… {progress}</p> : null}

        {step === 2 ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">Où on publie</h1>
            <p className="text-sm text-gray-300">{itemIds.length ? `${itemIds.length} élément${itemIds.length > 1 ? 's' : ''} de la file pour commencer ; tu pourras en ajouter d’autres.` : 'Un post vide : tu ajouteras les médias de la file slide par slide.'}</p>
            <div className="flex flex-wrap gap-3">
              {DESTINATION_SPECS.map((d) => (
                <button key={d.key} className={`${button} ${destination === d.key ? 'bg-white text-black' : ''}`} onClick={() => { setDestination(d.key); setFormat('') }}>
                  {d.name} <span className="ml-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: d.direct ? '#0FC55D' : '#E5972B' }} title={d.direct ? 'publication directe' : 'export de fichiers'} />
                </button>
              ))}
            </div>
            {destSpec ? <p className="text-xs text-gray-300">{destSpec.direct ? 'Publication directe' : 'Export de fichiers'} — {destSpec.directNote}</p> : null}
            <button className={button} disabled={!destination} onClick={() => setStep(3)}>Continuer</button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">Quel format</h1>
            <div className="flex flex-wrap gap-3">
              {destSpec?.formats.map((f) => (
                <button key={f.key} className={`${button} ${format === f.key ? 'bg-white text-black' : ''}`} onClick={() => setFormat(f.key)}>{f.name}</button>
              ))}
            </div>
            {spec ? <p className="text-xs text-gray-300">{spec.family} · {spec.slides.min === spec.slides.max ? `${spec.slides.max} slide` : `${spec.slides.min} à ${spec.slides.max} slides`} · {spec.media === 'both' ? 'images et vidéos' : spec.media === 'video' ? 'vidéo' : 'images'}{spec.maxSeconds ? ` · ${spec.maxSeconds} s au plus` : ''} · légende {spec.caption} caractères</p> : null}
            <div className="flex gap-3">
              <button className={button} onClick={() => setStep(2)}>Retour</button>
              <button className={button} disabled={!format || Boolean(busy)} onClick={createDraft}>Composer</button>
            </div>
          </section>
        ) : null}

        {step === 4 && post && spec ? (
          <section className="space-y-5">
            <header className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-2xl font-bold">Composer — n° {post.number} · {destSpec?.name} · {spec.name}</h1>
              <div className="flex gap-2"><button className={small} onClick={() => setPreviewIndex(current)}>Aperçu</button><button className={`${small} border-white bg-white text-black`} onClick={() => setStep(5)}>Publier ou exporter →</button></div>
            </header>

            <div className={card}>
              <h2 className={cardTitle}>Slides</h2>
              <div className="flex flex-wrap items-center gap-2">
                {post.slides.map((s, i) => (
                  /* eslint-disable-next-line @next/next/no-img-element -- the slide as the engine draws it */
                  <button key={i} className={`relative h-24 overflow-hidden rounded border ${i === current ? 'border-white' : 'border-white/30'}`} style={{ aspectRatio: spec.family.replace(':', '/') }} onClick={() => setCurrent(i)}><img src={renderUrl(settledSlide(i) ?? s, i, 'full', 0.2)} alt={`Slide ${i + 1}`} className="h-full w-full object-cover" /><span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-xs">{i + 1}</span></button>
                ))}
                {post.slides.length < spec.slides.max ? <button className="h-24 rounded border border-dashed border-white/40 px-4 text-sm" onClick={addSlide}>+ slide</button> : null}
                {post.slides.length > 1 ? <span className="ml-2 flex gap-1"><button className={small} onClick={() => moveSlide(-1)} disabled={current === 0}>←</button><button className={small} onClick={() => moveSlide(1)} disabled={current === post.slides.length - 1}>→</button><button className={small} onClick={removeSlide}>Retirer</button></span> : null}
              </div>
              {spec.slides.max > 1 ? <p className="mt-2 text-xs text-gray-400">Chaque slide peut montrer n’importe quel élément de la file : choisis-le dans Média.</p> : null}
            </div>

            {slide ? (
              <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                <div className="md:sticky md:top-4 md:self-start">
                  <div className="relative mx-auto w-full max-w-md select-none overflow-hidden rounded-xl border border-white/20 bg-[#191916]" style={{ aspectRatio: spec.family.replace(':', '/') }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- what you see is what gets exported */}
                    <img src={renderUrl(settledSlide(current) ?? slide, current, 'full', 0.5)} alt="Aperçu" className="absolute inset-0 h-full w-full" draggable={false} />
                    <DragBox rect={{ x: mediaRect.x, y: mediaRect.y, w: mediaRect.w, h: mediaRect.h }} label="média" onMove={(x, y) => updateSlide({ mediaPlace: { ...mediaRect, x, y } })} />
                    {(() => { const lp = slide.logoPlace ?? defaultLogoPlace(); return <DragBox rect={{ x: lp.x, y: lp.y, w: lp.size / 1080, h: (lp.size / 1080) * (135 / 584) * ((spec ? FAMILY_SIZES[spec.family].width / FAMILY_SIZES[spec.family].height : 0.5625)) }} label="logo" onMove={(x, y) => updateSlide({ logoPlace: { ...lp, x, y } })} /> })()}
                    {slide.text.trim() ? (() => { const tp = slide.textPlace ?? defaultTextPlace(); return <DragBox rect={{ x: tp.x, y: tp.y, w: tp.width ?? 0.88, h: (tp.size * 2.4 / 1080) * ((spec ? FAMILY_SIZES[spec.family].width / FAMILY_SIZES[spec.family].height : 0.5625)) }} label="texte" onMove={(x, y) => updateSlide({ textPlace: { ...tp, x, y } })} /> })() : null}
                    {(() => { const sp = slide.sourcePlace ?? defaultSourcePlace(); return <DragBox rect={{ x: sp.x, y: sp.y, w: sp.width ?? 0.88, h: (sp.size * 2.6 / 1080) * ((spec ? FAMILY_SIZES[spec.family].width / FAMILY_SIZES[spec.family].height : 0.5625)) }} label="source" onMove={(x, y) => updateSlide({ sourcePlace: { ...sp, x, y } })} /> })()}
                  </div>
                  <p className="mt-2 text-center text-xs text-gray-400">Slide {current + 1}{isVideoSlide && !isBaked ? ' · un clip : le montage le fait bouger' : ''}{isBaked ? ' · montage figé' : ''} · glisse le média, le logo, le texte et la source où tu veux</p>
                </div>

                <div className="space-y-4">
                  <div className={card}>
                    <h2 className={cardTitle}>Média</h2>
                    {!mediaChoices.length ? <p className="text-xs text-amber-200">La file est vide : depuis la curation, le bouton Comm y met des contenus.</p> : null}
                    <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                      {mediaChoices.map((c) => { const active = c.key === (slide.mediaId ?? (slide.itemId ? `thumb:${slide.itemId}` : ''))
                        return (
                          <button key={c.key} title={c.label} className={`relative h-20 w-20 overflow-hidden rounded border ${active ? 'border-white' : 'border-white/20'}`} onClick={() => updateSlide({ itemId: c.itemId, mediaId: c.mediaId })}>
                            {c.media?.contentType.startsWith('video/') ? <video src={c.media.blobUrl} muted playsInline className="h-full w-full object-cover" /> : c.thumb ? (
                              /* eslint-disable-next-line @next/next/no-img-element -- a thumbnail of the queue */
                              <img src={c.thumb} alt="" className="h-full w-full object-cover" />
                            ) : null}
                            <span className="absolute bottom-0 left-0 right-0 truncate bg-black/70 px-1 text-left text-[10px]">{c.label.split(' · ')[0]}</span>
                          </button>
                        ) })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="w-16 text-xs text-gray-400">Largeur</span><input type="range" min={0.2} max={1} step={0.02} value={mediaRect.w} onChange={(e) => updateSlide({ mediaPlace: { ...mediaRect, w: Number(e.target.value) } })} className="flex-1" /><span className="w-10 text-right text-xs">{Math.round(mediaRect.w * 100)} %</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="w-16 text-xs text-gray-400">Hauteur</span><input type="range" min={0.2} max={1} step={0.02} value={mediaRect.h} onChange={(e) => updateSlide({ mediaPlace: { ...mediaRect, h: Number(e.target.value) } })} className="flex-1" /><span className="w-10 text-right text-xs">{Math.round(mediaRect.h * 100)} %</span>
                      <button className={small} onClick={() => updateSlide({ mediaPlace: null })}>Remettre</button>
                    </div>
                    {isVideoSlide && !isBaked ? <div className="mt-3 flex flex-wrap items-center gap-2"><button className={small} disabled={!slideTemplate} onClick={() => setMontageOpen(true)}>Couper l’extrait</button><span className="text-xs text-gray-400">le début et la fin ; la marge, le texte et le glitch suivent</span></div> : null}
                    {isBaked ? <p className="mt-2 text-xs text-gray-300">Montage figé{slideMedia?.trim ? `, ${Math.round(slideMedia.trim.endSec - slideMedia.trim.startSec)} s` : ''}. Pour changer son habillage, repars de l’extrait d’origine ci-dessus.</p> : null}
                  </div>

                  <div className={card}>
                    <h2 className={cardTitle}>Marge</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className={`${small} ${margin === 'none' ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ templateKey: marginTemplates.none, glitch: undefined, fit: 'cover' })}>Aucune, plein écran</button>
                      <button className={`${small} ${margin === 'glitch' ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ templateKey: marginTemplates.glitch, glitch: undefined, fit: 'cover' })}>Glitch Random</button>
                    </div>
                    <label className="mt-3 flex items-center gap-2"><span className="w-16 text-xs text-gray-400">Glitch</span><input type="range" min={0} max={1} step={0.05} value={slideGlitch} onChange={(e) => updateSlide({ glitch: Number(e.target.value) })} className="flex-1" /><span className="w-10 text-right text-xs">{Math.round(slideGlitch * 100)} %</span></label>
                    <p className="mt-2 text-xs text-gray-400">Avec la marge, l’image est dans un cadre où le glitch de Random court, sur un fond fait de l’image. Une vidéo de fond pourra prendre la place quand tu les auras.</p>
                  </div>

                  <div className={card}>
                    <h2 className={cardTitle}>Texte sur l’image</h2>
                    <textarea className="w-full rounded border border-white/40 bg-black px-2 py-1" rows={2} value={slide.text} placeholder="Une phrase, ou rien" onChange={(e) => updateSlide({ text: e.target.value })} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select className="rounded border border-white/40 bg-black px-2 py-1 text-xs" value="" onChange={(e) => { if (e.target.value !== '') updateSlide({ text: e.target.value }) }}>
                        <option value="">Phrase prête…</option>
                        {phrases.filter((p) => p.text).map((p) => <option key={p._id ?? p.text} value={p.text}>{p.lang} · {p.text}</option>)}
                      </select>
                      {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={`${small} ${(slide.textPlace?.align ?? 'left') === a ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ textPlace: { ...(slide.textPlace ?? defaultTextPlace()), align: a } })}>{a === 'left' ? 'Gauche' : a === 'center' ? 'Centré' : 'Droite'}</button>)}
                    </div>
                    <label className="mt-2 flex items-center gap-2"><span className="w-16 text-xs text-gray-400">Taille</span><input type="range" min={24} max={180} step={2} value={slide.textPlace?.size ?? 64} onChange={(e) => updateSlide({ textPlace: { ...(slide.textPlace ?? defaultTextPlace()), size: Number(e.target.value) } })} className="flex-1" /><span className="w-10 text-right text-xs">{slide.textPlace?.size ?? 64}</span></label>
                    <label className="mt-1 flex items-center gap-2"><span className="w-16 text-xs text-gray-400">Largeur</span><input type="range" min={0.3} max={1} step={0.02} value={slide.textPlace?.width ?? 0.88} onChange={(e) => updateSlide({ textPlace: { ...(slide.textPlace ?? defaultTextPlace()), width: Number(e.target.value) } })} className="flex-1" /><span className="w-10 text-right text-xs">{Math.round((slide.textPlace?.width ?? 0.88) * 100)} %</span></label>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">Place rapide {(['top', 'middle', 'bottom'] as const).map((pos) => <button key={pos} className={small} onClick={() => updateSlide({ textPosition: pos, textPlace: { ...(slide.textPlace ?? defaultTextPlace()), y: pos === 'top' ? 0.1 : pos === 'middle' ? 0.42 : 0.74 } })}>{pos === 'top' ? 'Haut' : pos === 'middle' ? 'Milieu' : 'Bas'}</button>)} ou glisse-le sur l’aperçu</div>
                  </div>

                  <div className={card}>
                    <h2 className={cardTitle}>Source</h2>
                    <p className="text-xs text-gray-300">Le crédit et le lien restent sur l’image ; tu choisis où et à quelle taille.</p>
                    <label className="mt-2 flex items-center gap-2"><span className="w-16 text-xs text-gray-400">Taille</span><input type="range" min={16} max={72} step={2} value={slide.sourcePlace?.size ?? 30} onChange={(e) => updateSlide({ sourcePlace: { ...(slide.sourcePlace ?? defaultSourcePlace()), size: Number(e.target.value) } })} className="flex-1" /><span className="w-10 text-right text-xs">{slide.sourcePlace?.size ?? 30}</span></label>
                    <div className="mt-2 flex flex-wrap gap-2">{(['left', 'center', 'right'] as const).map((a) => <button key={a} className={`${small} ${(slide.sourcePlace?.align ?? 'left') === a ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ sourcePlace: { ...(slide.sourcePlace ?? defaultSourcePlace()), align: a } })}>{a === 'left' ? 'Gauche' : a === 'center' ? 'Centré' : 'Droite'}</button>)}<button className={small} onClick={() => updateSlide({ sourcePlace: null })}>Remettre en bas</button></div>
                  </div>

                  <div className={card}>
                    <h2 className={cardTitle}>Style</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-16 text-xs text-gray-400">Couleur</span>
                      {PALETTE_COLORS.map((c, i) => <button key={c} aria-label={`Palette ${i + 1}`} className={`h-7 w-7 rounded-full border-2 ${slide.palette === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => updateSlide({ palette: i })} />)}
                      <button className={small} onClick={() => updateSlide({ palette: Math.floor(Math.random() * 6) })}>Au hasard</button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2"><span className="w-16 text-xs text-gray-400">Logo</span><button className={`${small} ${slide.logoVariant === 'white' ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ logoVariant: 'white' })}>blanc</button><button className={`${small} ${slide.logoVariant === 'black' ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ logoVariant: 'black' })}>noir</button>
                      {([['haut gauche', 0.06, 0.035], ['haut centre', null, 0.035], ['haut droite', null, 0.035], ['bas gauche', 0.06, 0.93], ['bas centre', null, 0.93], ['bas droite', null, 0.93]] as const).map(([name, x, y]) => { const lp = slide.logoPlace ?? defaultLogoPlace(); const w = lp.size / 1080; const nx = x ?? (name.endsWith('centre') ? (1 - w) / 2 : 0.94 - w); const ny = name.startsWith('bas') ? 0.96 - w * (135 / 584) * (spec ? FAMILY_SIZES[spec.family].width / FAMILY_SIZES[spec.family].height : 0.56) : y
                        return <button key={name} className={small} onClick={() => updateSlide({ logoPlace: { ...lp, x: Math.round(nx * 1000) / 1000, y: Math.round(ny * 1000) / 1000 } })}>{name}</button> })}
                    </div>
                    <label className="mt-2 flex items-center gap-2"><span className="w-16 text-xs text-gray-400">Taille</span><input type="range" min={120} max={900} step={10} value={slide.logoPlace?.size ?? defaultLogoPlace().size} onChange={(e) => updateSlide({ logoPlace: { ...(slide.logoPlace ?? defaultLogoPlace()), size: Number(e.target.value) } })} className="flex-1" /><span className="w-10 text-right text-xs">{slide.logoPlace?.size ?? defaultLogoPlace().size}</span><button className={small} onClick={() => updateSlide({ logoPlace: null })}>Remettre</button></label>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className={card}>
                <h2 className={cardTitle}>Légende</h2>
                <textarea className="w-full rounded border border-white/40 bg-black px-2 py-1" rows={3} value={post.captionHead} placeholder="Ton texte. Sinon : le titre, et la phrase choisie dessous" onChange={(e) => save({ captionHead: e.target.value })} />
                <select className="mt-2 w-full rounded border border-white/40 bg-black px-2 py-1" value={post.phrase} onChange={(e) => save({ phrase: e.target.value })}>
                  <option value="">Sans phrase</option>
                  {phrases.filter((p) => p.text).map((p) => <option key={p._id ?? p.text} value={p.text}>{p.lang} · {p.text}</option>)}
                </select>
                {caption ? <div className="mt-3 rounded border border-white/15 p-2 text-xs"><p className="mb-1 text-gray-400">Ajouté automatiquement, toujours :</p>{caption.mandatory.map((line) => <p key={line}>{line}</p>)}</div> : null}
                <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={post.homeLink} onChange={(e) => save({ homeLink: e.target.checked })} /> Ajouter « Découvert sur Random » avec l’adresse du site</label>
                {unknownAuthor.length ? <label className="mt-2 block text-xs text-gray-300">Auteur inconnu pour « {unknownAuthor[0].snapshot.title.slice(0, 40)} » : le crédit dira {unknownAuthor[0].snapshot.providerLabel}. Si tu le connais (facultatif)<br /><input className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1 text-sm text-white" value={post.credit} onChange={(e) => save({ credit: e.target.value })} /></label> : null}
                {anyVideo ? <p className="mt-2 text-xs text-amber-200">{MUSIC_NOTE}</p> : null}
              </div>
              <div className={card}>
                <h2 className={cardTitle}>Hashtags <span className="font-normal normal-case tracking-normal text-gray-400">{post.hashtags.length} / {spec.hashtags}</span></h2>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...suggested, ...post.hashtags])].map((tag) => <label key={tag} className="flex items-center gap-1 rounded border border-white/30 px-2 py-1 text-xs"><input type="checkbox" checked={post.hashtags.includes(tag)} onChange={(e) => save({ hashtags: e.target.checked ? [...post.hashtags, tag] : post.hashtags.filter((t) => t !== tag) })} />{tag}</label>)}
                </div>
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const tag = customTag.trim().replace(/^#?/, '#'); if (/^#[\p{L}\p{N}_]{2,40}$/u.test(tag) && !post.hashtags.includes(tag)) save({ hashtags: [...post.hashtags, tag] }); setCustomTag('') }}>
                  <input className="rounded border border-white/40 bg-black px-2 py-1 text-xs" placeholder="#AutreTag" value={customTag} onChange={(e) => setCustomTag(e.target.value)} /><button className={small} type="submit">Ajouter</button>
                </form>
                {caption ? <>
                  <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">La légende telle qu’elle partira <span className={caption.overLimit ? 'text-red-300' : ''}>{caption.length} / {caption.limit}</span></h3>
                  <pre className="mt-1 whitespace-pre-wrap rounded border border-white/15 p-2 text-xs">{caption.text}</pre>
                  <button className={`${small} mt-2`} onClick={() => navigator.clipboard?.writeText(caption.text)}>Copier la légende</button>
                </> : null}
              </div>
            </div>
          </section>
        ) : null}

        {step === 5 && post && spec ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold">Publier ou exporter — n° {post.number}</h1>
            {published ? (
              <div className="space-y-2">
                <p className="text-green-300">Publié sur Instagram. {published.remoteUrl ? <a href={published.remoteUrl} target="_blank" rel="noreferrer" className="underline">Voir le post</a> : 'Le lien du post arrivera dans les stats.'} {published.commented ? 'Le lien de la source est en premier commentaire.' : 'Le premier commentaire n’a pas pu être posté : ajoute le lien à la main.'}</p>
                <p className="text-sm text-gray-300">La publication porte le n° {post.number} et figure sur <Link href="/liens" className="underline" target="_blank">/liens</Link> dès sa prochaine construction.</p>
                <Link href="/admin/comm" className={button}>Retour à la file</Link>
              </div>
            ) : exported ? (
              <div className="space-y-2">
                <p className="text-green-300">Exporté. La publication porte le n° {exported.number} ; elle figure sur <Link href="/liens" className="underline" target="_blank">/liens</Link> dès sa prochaine construction.</p>
                <Link href="/admin/comm" className={button}>Retour à la file</Link>
              </div>
            ) : (
              <>
                {caption?.overLimit ? <p className="text-amber-300">La légende dépasse la limite de {destSpec?.name}.</p> : null}
                <p className="text-sm text-gray-300">Les éléments restent dans la file, marqués « utilisé » : supprime-les toi-même quand tu as fini avec, pour libérer une place.</p>
                <div className="flex flex-wrap gap-3">
                  <button className={button} onClick={() => setStep(4)}>Retour</button>
                  <button className={button} disabled={!canExport || Boolean(busy)} onClick={doExport}>Exporter</button>
                  <button className={button} disabled={!destSpec?.direct || !config?.instagram || !canExport || Boolean(busy)} title={!destSpec?.direct ? destSpec?.directNote : !config?.instagram ? 'Instagram n’est pas configuré : voir la page Configuration.' : 'Publication directe'} onClick={doPublish}>Publier sur {destSpec?.name}</button>
                </div>
                {publishError ? <p role="alert" className="text-red-300">{publishError} <button className="underline" onClick={doPublish}>Réessayer</button></p> : null}
                {destSpec?.direct && config && !config.instagram ? <p className="text-xs text-amber-200">Instagram n’est pas configuré. <Link href="/admin/comm/config" className="underline">Configuration</Link></p> : null}
                {destSpec?.key === 'instagram' && spec.key === 'story' && post.slides.length > 1 ? <p className="text-xs text-amber-200">L’API publie une story à la fois : une story de plusieurs slides se publie slide par slide, ou s’exporte.</p> : null}
                <p className="text-xs text-gray-400">L’export : un PNG par slide image, l’extrait et son habillage pour une slide vidéo, et la légende dans caption.txt.</p>
              </>
            )}
          </section>
        ) : null}

        {montageOpen && post && spec && slide && slideMedia && slideTemplate ? (
          <MontagePanel
            queueItemId={slideMedia.queueItemId}
            media={slideMedia}
            template={slideTemplate}
            canvas={FAMILY_SIZES[spec.family]}
            overlayUrl={renderUrl(slide, current, 'overlay')}
            background="#191916"
            maxSeconds={Math.min(spec.maxSeconds ?? clipMaxSeconds(), clipMaxSeconds())}
            defaultMode="centered"
            glitch={slide.glitch ?? null}
            mediaPlace={slide.mediaPlace ?? null}
            onClose={() => setMontageOpen(false)}
            onDone={onMontageDone}
          />
        ) : null}

        {previewIndex != null && post ? (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/95 p-4" onClick={() => setPreviewIndex(null)}>
            <div className="relative max-h-[85vh] max-w-full" style={{ aspectRatio: spec?.family.replace(':', '/') }} onClick={(e) => e.stopPropagation()}>
              {(() => { const s = post.slides[previewIndex]; const m = s.mediaId ? allMedia.find((x) => x._id === s.mediaId) ?? null : null
                return m?.kind === 'montage'
                  ? <video src={m.blobUrl} controls autoPlay playsInline className="max-h-[85vh] max-w-full" />
                  /* eslint-disable-next-line @next/next/no-img-element -- the slide, large */
                  : <img src={renderUrl(s, previewIndex, 'full')} alt={`Slide ${previewIndex + 1}`} className="max-h-[85vh] max-w-full" />
              })()}
            </div>
            <div className="flex items-center gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
              <button className={small} disabled={previewIndex === 0} onClick={() => setPreviewIndex(previewIndex - 1)}>←</button>
              <span>{previewIndex + 1} / {post.slides.length}</span>
              <button className={small} disabled={previewIndex >= post.slides.length - 1} onClick={() => setPreviewIndex(previewIndex + 1)}>→</button>
              <button className={small} onClick={() => setPreviewIndex(null)}>Fermer (Échap)</button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}

/** A block the curator drags over the preview: its corner is saved as shares of the picture. */
function DragBox({ rect, label, onMove }: { rect: { x: number; y: number; w: number; h: number }; label: string; onMove: (x: number, y: number) => void }) {
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null)
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const parent = event.currentTarget.parentElement!
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: rect.x, y: rect.y, w: parent.clientWidth, h: parent.clientHeight }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault(); event.stopPropagation()
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const x = Math.max(-0.3, Math.min(0.97, drag.x + (event.clientX - drag.startX) / drag.w))
    const y = Math.max(-0.3, Math.min(0.97, drag.y + (event.clientY - drag.startY) / drag.h))
    onMove(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000)
  }
  const onPointerUp = () => { dragRef.current = null }
  return (
    <div
      role="button" aria-label={`Déplacer : ${label}`}
      className="absolute cursor-move touch-none rounded border border-dashed border-white/40 hover:border-white"
      style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, minHeight: 14 }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    >
      <span className="absolute -top-4 left-0 rounded bg-black/70 px-1 text-[10px] text-white/80">{label}</span>
    </div>
  )
}
