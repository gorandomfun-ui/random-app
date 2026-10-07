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
import { authorMissing, buildCaption, MUSIC_NOTE, suggestHashtags, type Phrase } from '@/lib/comm/caption'
import type { MediaDoc, PostDoc, PostSlide } from '@/lib/comm/model'
import type { Template } from '@/lib/comm/templates'
import type { QueueItemWithMedia } from '@/lib/comm/client'
import { buildExportZip, downloadBlob, type ExportSlide } from '@/lib/comm/exportZip'

const headers = { 'Content-Type': 'application/json' }
const STEPS = ['La file', 'Où', 'Format', 'Composer', 'Publier']
const PALETTE_COLORS = ['#0FC55D', '#D90845', '#E5972B', '#FF978F', '#3D42CC', '#AF3BF2']
const button = 'rounded-full border border-white px-4 py-2 text-sm font-bold uppercase disabled:opacity-40'
const small = 'rounded border border-white/40 px-2 py-1 text-xs disabled:opacity-40'

type MediaChoice = { key: string; label: string; itemId: string; mediaId: string | null; media: MediaDoc | null; thumb: string | null }

export default function ComposeClient({ itemIds, postId }: { itemIds: string[]; postId: string | null }) {
  const router = useRouter()
  const [destination, setDestination] = useState<string>('')
  const [format, setFormat] = useState<string>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [post, setPost] = useState<PostDoc | null>(null)
  const [items, setItems] = useState<QueueItemWithMedia[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [current, setCurrent] = useState(0)
  const [step, setStep] = useState(postId ? 4 : 2)
  const [keep, setKeep] = useState<Set<string>>(new Set())
  const [exported, setExported] = useState<{ number: number } | null>(null)
  const [progress, setProgress] = useState('')
  const [playing, setPlaying] = useState<number | null>(null)
  const [customTag, setCustomTag] = useState('')
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
    void fetch('/api/admin/comm/templates', { cache: 'no-store' }).then((r) => r.json()).then((body) => setTemplates(body.templates ?? [])).catch(() => {})
    void fetch('/api/admin/comm/phrases', { cache: 'no-store' }).then((r) => r.json()).then((body) => setPhrases(body.phrases ?? [])).catch(() => {})
  }, [postId])

  const spec: FormatSpec | null = useMemo(() => (destination && format ? formatSpec(destination, format) : null), [destination, format])
  const destSpec = useMemo(() => DESTINATION_SPECS.find((d) => d.key === destination) ?? null, [destination])

  const createDraft = useCallback(async () => {
    if (!destination || !format || !itemIds.length) return
    setBusy('Création du brouillon'); setError('')
    const response = await fetch('/api/admin/comm/posts', { method: 'POST', headers, body: JSON.stringify({ destination, format, queueItemIds: itemIds }) })
    const body = await response.json().catch(() => ({}))
    setBusy('')
    if (!body.post) { setError(body.error === 'items' ? 'Aucun des éléments choisis n’est dans la file.' : 'Le brouillon n’a pas pu être créé.'); return }
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

  const mediaChoices: MediaChoice[] = useMemo(() => items.flatMap((item) => [
    ...item.media.filter((m) => (spec?.media === 'video' ? m.contentType.startsWith('video/') : spec?.media === 'image' ? m.contentType.startsWith('image/') : true))
      .map((m) => ({ key: m._id, label: `${m.contentType.startsWith('video/') ? 'Extrait' : 'Image'} · ${item.snapshot.title.slice(0, 30)}`, itemId: item._id, mediaId: m._id, media: m, thumb: m.blobUrl })),
    ...(item.snapshot.thumb && spec?.media !== 'video' ? [{ key: `thumb:${item._id}`, label: `Miniature · ${item.snapshot.title.slice(0, 30)}`, itemId: item._id, mediaId: null, media: null, thumb: item.snapshot.thumb }] : []),
  ]), [items, spec])

  const familyTemplates = useMemo(() => (spec ? templates.filter((t) => t.family === spec.family) : []), [templates, spec])
  const slide: PostSlide | null = post?.slides[current] ?? null
  const slideMedia = useMemo(() => (slide?.mediaId ? items.flatMap((i) => i.media).find((m) => m._id === slide.mediaId) ?? null : null), [items, slide])
  const isVideoSlide = Boolean(slideMedia?.contentType.startsWith('video/'))
  const anyVideo = useMemo(() => post?.slides.some((s) => items.flatMap((i) => i.media).find((m) => m._id === s.mediaId)?.contentType.startsWith('video/')) ?? false, [post, items])

  const renderUrl = useCallback((s: PostSlide, index: number, mode: 'full' | 'overlay') => {
    const item = items.find((i) => i._id === s.itemId) ?? items[0]
    const params = new URLSearchParams({ template: s.templateKey, palette: String(s.palette), logo: s.logoVariant, text: s.text, mode, seed: `${post?._id ?? 'x'}-${index}`, glitch: String(s.glitch ?? 0) })
    if (item) params.set('item', item._id)
    if (s.mediaId) params.set('media', s.mediaId); else params.set('thumb', '1')
    if (post?.credit) params.set('credit', post.credit)
    return `/api/admin/comm/render?${params.toString()}`
  }, [items, post])

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

  const firstItem = items[0] ?? null
  const caption = useMemo(() => (post && firstItem ? buildCaption({ destination: post.destination, format: post.format, title: post.captionHead ? '' : firstItem.snapshot.title, phrase: post.captionHead ? post.captionHead : post.phrase, snapshot: firstItem.snapshot, credit: post.credit, number: post.number, hashtags: post.hashtags, homeUrl: post.homeLink ? (typeof window === 'undefined' ? 'https://gorandom.fun/' : window.location.origin) : null }) : null), [post, firstItem])
  useEffect(() => { if (caption && post && caption.text !== post.caption) save({ caption: caption.text }) }, [caption, post, save])

  const suggested = useMemo(() => suggestHashtags(items.flatMap((i) => i.subjects)), [items])
  const missingAuthor = useMemo(() => items.filter((i) => authorMissing(i.snapshot, post?.credit ?? '')), [items, post])
  const canExport = Boolean(post && post.slides.length >= (spec?.slides.min ?? 1) && !missingAuthor.length && caption && !caption.overLimit)

  const doExport = useCallback(async () => {
    if (!post || !canExport || !caption) return
    setBusy('Préparation des fichiers'); setError('')
    try {
      const slides: ExportSlide[] = post.slides.map((s, index) => {
        const media = items.flatMap((i) => i.media).find((m) => m._id === s.mediaId) ?? null
        const video = Boolean(media?.contentType.startsWith('video/'))
        return { index, kind: video ? 'video' : 'image', renderUrl: `${window.location.origin}${renderUrl(s, index, 'full')}`, overlayUrl: video ? `${window.location.origin}${renderUrl(s, index, 'overlay')}` : undefined, videoUrl: video ? media!.blobUrl : undefined, videoType: media?.contentType }
      })
      const zip = await buildExportZip(slides, caption.text, (done, total) => setProgress(`${done} / ${total}`))
      downloadBlob(zip, `random-comm-${String(post.number).padStart(3, '0')}-${post.destination}.zip`)
      const response = await fetch(`/api/admin/comm/posts/${post._id}/exported`, { method: 'POST', headers, body: JSON.stringify({ keep: [...keep] }) })
      if (!response.ok) throw new Error('export')
      setExported({ number: post.number }); setStep(5)
    } catch (cause) { setError(cause instanceof Error && cause.message !== 'export' ? `Export impossible : ${cause.message}` : 'Les fichiers sont téléchargés mais la file n’a pas été mise à jour.') }
    setBusy(''); setProgress('')
  }, [canExport, caption, items, keep, post, renderUrl])

  useEffect(() => {
    if (playing == null || !post) return
    const timer = window.setTimeout(() => setPlaying((p) => (p == null ? null : p + 1 < post.slides.length ? p + 1 : null)), 2200)
    return () => window.clearTimeout(timer)
  }, [playing, post])

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
            {!itemIds.length ? <p className="text-amber-300">Choisis d’abord des éléments dans la file.</p> : <p className="text-sm text-gray-300">{itemIds.length} élément{itemIds.length > 1 ? 's' : ''} choisi{itemIds.length > 1 ? 's' : ''}.</p>}
            <div className="flex flex-wrap gap-3">
              {DESTINATION_SPECS.map((d) => (
                <button key={d.key} className={`${button} ${destination === d.key ? 'bg-white text-black' : ''}`} onClick={() => { setDestination(d.key); setFormat('') }}>
                  {d.name} <span className="ml-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: d.direct ? '#0FC55D' : '#E5972B' }} title={d.direct ? 'publication directe' : 'export de fichiers'} />
                </button>
              ))}
            </div>
            {destSpec ? <p className="text-xs text-gray-300">{destSpec.direct ? 'Publication directe' : 'Export de fichiers'} — {destSpec.directNote}</p> : null}
            <button className={button} disabled={!destination || !itemIds.length} onClick={() => setStep(3)}>Continuer</button>
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
              <div className="flex gap-2"><button className={small} onClick={() => setPlaying(0)}>Lire la séquence</button><button className={small} onClick={() => setStep(5)}>Publier ou exporter →</button></div>
            </header>

            <div className="flex flex-wrap gap-2">
              {post.slides.map((s, i) => (
                /* eslint-disable-next-line @next/next/no-img-element -- the slide as the engine draws it */
                <button key={i} className={`relative h-28 overflow-hidden rounded border ${i === current ? 'border-white' : 'border-white/30'}`} style={{ aspectRatio: spec.family.replace(':', '/') }} onClick={() => setCurrent(i)}><img src={renderUrl(s, i, 'full')} alt={`Slide ${i + 1}`} className="h-full w-full object-cover" /><span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-xs">{i + 1}</span></button>
              ))}
              {post.slides.length < spec.slides.max ? <button className="h-28 rounded border border-dashed border-white/40 px-4 text-sm" onClick={addSlide}>+ slide</button> : null}
            </div>

            {slide ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3 text-sm">
                  <div className="flex gap-2"><button className={small} onClick={() => moveSlide(-1)} disabled={current === 0}>←</button><button className={small} onClick={() => moveSlide(1)} disabled={current === post.slides.length - 1}>→</button><button className={small} onClick={removeSlide} disabled={post.slides.length <= 1}>Retirer la slide</button></div>
                  <label className="block">Média<br />
                    <select className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1" value={slide.mediaId ?? (slide.itemId ? `thumb:${slide.itemId}` : '')} onChange={(e) => { const choice = mediaChoices.find((c) => c.key === e.target.value); updateSlide({ itemId: choice?.itemId ?? slide.itemId, mediaId: choice?.mediaId ?? null }) }}>
                      {mediaChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select></label>
                  {isVideoSlide ? <p className="text-xs text-amber-200">Slide animée : l’extrait tel quel, l’habillage par-dessus ; la découpe et le recadrage viennent avec le montage.</p> : null}
                  <label className="block">Gabarit<br />
                    <select className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1" value={slide.templateKey} onChange={(e) => updateSlide({ templateKey: e.target.value })}>
                      {familyTemplates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                    </select></label>
                  <div>Palette<br />
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {PALETTE_COLORS.map((c, i) => <button key={c} aria-label={`Palette ${i + 1}`} className={`h-7 w-7 rounded-full border-2 ${slide.palette === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => updateSlide({ palette: i })} />)}
                      <button className={small} onClick={() => updateSlide({ palette: Math.floor(Math.random() * 6) })}>Au hasard</button>
                    </div></div>
                  <div>Logo <button className={`${small} ml-2 ${slide.logoVariant === 'white' ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ logoVariant: 'white' })}>blanc</button> <button className={`${small} ${slide.logoVariant === 'black' ? 'bg-white text-black' : ''}`} onClick={() => updateSlide({ logoVariant: 'black' })}>noir</button></div>
                  <label className="block">Phrase<br />
                    <select className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1" value="" onChange={(e) => { if (e.target.value !== '') updateSlide({ text: e.target.value }) }}>
                      <option value="">Choisir une phrase…</option>
                      {phrases.filter((p) => p.text).map((p) => <option key={p._id ?? p.text} value={p.text}>{p.lang} · {p.text}</option>)}
                    </select></label>
                  <label className="block">Texte de la slide<br /><textarea className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1" rows={2} value={slide.text} onChange={(e) => updateSlide({ text: e.target.value })} /></label>
                  <label className="block">Glitch {Math.round((slide.glitch ?? 0) * 100)} %<br /><input type="range" min={0} max={1} step={0.05} value={slide.glitch ?? 0} onChange={(e) => updateSlide({ glitch: Number(e.target.value) })} className="w-full" /></label>
                </div>
                <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded border border-white/30 bg-black" style={{ aspectRatio: spec.family.replace(':', '/') }}>
                  {isVideoSlide && slideMedia ? <video src={slideMedia.blobUrl} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" /> : null}
                  {/* eslint-disable-next-line @next/next/no-img-element -- what you see is what gets exported */}
                  <img src={renderUrl(slide, current, isVideoSlide ? 'overlay' : 'full')} alt="Aperçu" className="absolute inset-0 h-full w-full" />
                </div>
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3 text-sm">
                <h2 className="font-bold">Légende</h2>
                <label className="block">Phrase<br />
                  <select className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1" value={post.phrase} onChange={(e) => save({ phrase: e.target.value })}>
                    <option value="">Aucune</option>
                    {phrases.filter((p) => p.text).map((p) => <option key={p._id ?? p.text} value={p.text}>{p.lang} · {p.text}</option>)}
                  </select></label>
                <label className="block">Texte libre (remplace le titre nettoyé et la phrase)<br /><textarea className="mt-1 w-full rounded border border-white/40 bg-black px-2 py-1" rows={3} value={post.captionHead} onChange={(e) => save({ captionHead: e.target.value })} /></label>
                {caption ? <div className="rounded border border-white/20 p-2 text-xs"><p className="mb-1 text-gray-400">Toujours présent, dans cet ordre :</p>{caption.mandatory.map((line) => <p key={line}>{line}</p>)}</div> : null}
                <label className="flex items-center gap-2"><input type="checkbox" checked={post.homeLink} onChange={(e) => save({ homeLink: e.target.checked })} /> Ajouter la ligne « Découvert sur Random » avec l’accueil</label>
                {missingAuthor.length ? <label className="block text-amber-200">Auteur manquant pour {missingAuthor.map((i) => i.snapshot.title.slice(0, 30)).join(', ')} — saisis-le, sinon rien ne part<br /><input className="mt-1 w-full rounded border border-amber-300 bg-black px-2 py-1 text-white" value={post.credit} onChange={(e) => save({ credit: e.target.value })} /></label> : null}
                {anyVideo ? <p className="text-xs text-amber-200">{MUSIC_NOTE}</p> : null}
              </div>
              <div className="space-y-3 text-sm">
                <h2 className="font-bold">Hashtags <span className="font-normal text-gray-400">{post.hashtags.length} / {spec.hashtags}</span></h2>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...suggested, ...post.hashtags])].map((tag) => <label key={tag} className="flex items-center gap-1 rounded border border-white/30 px-2 py-1"><input type="checkbox" checked={post.hashtags.includes(tag)} onChange={(e) => save({ hashtags: e.target.checked ? [...post.hashtags, tag] : post.hashtags.filter((t) => t !== tag) })} />{tag}</label>)}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const tag = customTag.trim().replace(/^#?/, '#'); if (/^#[\p{L}\p{N}_]{2,40}$/u.test(tag) && !post.hashtags.includes(tag)) save({ hashtags: [...post.hashtags, tag] }); setCustomTag('') }}>
                  <input className="rounded border border-white/40 bg-black px-2 py-1" placeholder="#AutreTag" value={customTag} onChange={(e) => setCustomTag(e.target.value)} /><button className={small} type="submit">Ajouter</button>
                </form>
                {caption ? <>
                  <h2 className="font-bold">Aperçu de la légende <span className={`font-normal ${caption.overLimit ? 'text-red-300' : 'text-gray-400'}`}>{caption.length} / {caption.limit}</span></h2>
                  <pre className="whitespace-pre-wrap rounded border border-white/20 p-2 text-xs">{caption.text}</pre>
                  <button className={small} onClick={() => navigator.clipboard?.writeText(caption.text)}>Copier la légende</button>
                </> : null}
              </div>
            </div>
          </section>
        ) : null}

        {step === 5 && post && spec ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold">Publier ou exporter — n° {post.number}</h1>
            {exported ? (
              <div className="space-y-2">
                <p className="text-green-300">Exporté. La publication porte le n° {exported.number} ; elle figure sur <Link href="/liens" className="underline" target="_blank">/liens</Link> dès sa prochaine construction.</p>
                <Link href="/admin/comm" className={button}>Retour à la file</Link>
              </div>
            ) : (
              <>
                {missingAuthor.length ? <p className="text-amber-300">Un auteur manque : reviens à l’étape 4.</p> : null}
                {caption?.overLimit ? <p className="text-amber-300">La légende dépasse la limite de {destSpec?.name}.</p> : null}
                <div className="text-sm">
                  <p className="mb-1 text-gray-300">Après l’export, les éléments utilisés quittent la file. Garder dans la file :</p>
                  {items.map((i) => <label key={i._id} className="mr-4 inline-flex items-center gap-1"><input type="checkbox" checked={keep.has(i._id)} onChange={(e) => setKeep((k) => { const n = new Set(k); if (e.target.checked) n.add(i._id); else n.delete(i._id); return n })} />{i.snapshot.title.slice(0, 40)}</label>)}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className={button} onClick={() => setStep(4)}>Retour</button>
                  <button className={button} disabled={!canExport || Boolean(busy)} onClick={doExport}>Exporter</button>
                  <button className={button} disabled title={destSpec?.direct ? 'La publication directe arrive avec la phase 10.' : destSpec?.directNote}>Publier sur {destSpec?.name}</button>
                </div>
                <p className="text-xs text-gray-400">L’export : un PNG par slide image, l’extrait et son habillage pour une slide vidéo, et la légende dans caption.txt.</p>
              </>
            )}
          </section>
        ) : null}

        {playing != null && post ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setPlaying(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the sequence, one slide after the other */}
            <img src={renderUrl(post.slides[playing], playing, 'full')} alt={`Slide ${playing + 1}`} className="max-h-full max-w-full" />
            <span className="absolute bottom-4 text-sm">{playing + 1} / {post.slides.length} — toucher pour fermer</span>
          </div>
        ) : null}
      </div>
    </main>
  )
}
