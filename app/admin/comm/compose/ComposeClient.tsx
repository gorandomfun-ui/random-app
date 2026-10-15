'use client'

/**
 * One screen, three tools, one button. The media from the queue, full
 * screen; a clip plays at once; Couper, Texte, Style; Exporter gives the
 * finished file, MP4 or JPEG, with the caption copied. When Instagram is
 * connected, the same place publishes.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DESTINATION_SPECS, formatSpec, type FormatSpec } from '@/lib/comm/destinations'
import { buildCaption, MUSIC_NOTE, suggestHashtags, type Phrase } from '@/lib/comm/caption'
import type { MediaDoc, Placement, PostDoc, PostSlide } from '@/lib/comm/model'
import { clipMaxSeconds } from '@/lib/comm/model'
import { FAMILY_SIZES, type Family } from '@/lib/comm/templates'
import { commImportSource, commList, uploadMedia, type QueueItemWithMedia } from '@/lib/comm/client'
import { downloadBlob, recordMontage, renderJpeg } from '@/lib/comm/montageRun'
import { burstSchedule, createDrawer, GLITCH_STYLES, type GlitchStyle } from '@/lib/comm/montageDraw'
import { cropRect, cropRectIn } from '@/lib/comm/montage'
import { ICON_NAMES } from '@/lib/comm/templates'
import { publishInstagram } from '@/lib/comm/publishClient'
import type { PublishAsset } from '@/lib/comm/publish'

const headers = { 'Content-Type': 'application/json' }
const PALETTE_COLORS = ['#0FC55D', '#D90845', '#E5972B', '#FF978F', '#3D42CC', '#AF3BF2']
const TEMPLATE_OF: Record<Family, string> = { '9:16': 'story-plein', '4:5': 'post-plein', '1:1': 'carre', '16:9': 'paysage' }
const TEXT_SIZES = { S: 44, M: 64, L: 96 } as const
/** The credit's size; the source line under it follows at 0.87. Readable on a phone from M. */
const SOURCE_SIZES = { S: 30, M: 48, L: 72 } as const
const LOGO_SIZE = 300
const FONTS = [['Tomorrow', 900, 'Tomorrow'], ['Tomorrow', 700, 'Tomorrow fin'], ['InterTight', 700, 'Inter Tight']] as const
const chip = 'rounded-full border border-white/40 px-3 py-1.5 text-sm disabled:opacity-40'
const chipOn = 'rounded-full border border-white bg-white px-3 py-1.5 text-sm text-black'
const primary = 'rounded-full border border-white bg-white px-5 py-2.5 text-sm font-bold uppercase text-black disabled:opacity-40'
const secondary = 'rounded-full border border-white px-5 py-2.5 text-sm font-bold uppercase disabled:opacity-40'
const section = 'rounded-xl border border-white/15 bg-[#191916] p-4'
const title = 'mb-3 font-tomorrow text-xs font-black uppercase tracking-[0.18em] text-[#F8F5E6]'

type MediaChoice = { key: string; label: string; itemId: string; mediaId: string | null; media: MediaDoc | null; thumb: string | null; video: boolean; poster?: string | null; seconds?: number | null }
type Tool = 'text' | 'style'

function logoPlaceOf(corner: PostSlide['logoCorner'], family: Family): Placement | null {
  if (!corner || corner === 'none') return null
  const { width, height } = FAMILY_SIZES[family]
  const w = LOGO_SIZE / 1080, h = (LOGO_SIZE * 135 / 584) / height * (width / 1080)
  const x = corner.endsWith('l') ? 0.06 : 0.94 - w * (1080 / width)
  const y = corner.startsWith('t') ? 0.035 : 0.965 - h
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, size: LOGO_SIZE }
}

export default function ComposeClient({ itemIds, postId }: { itemIds: string[]; postId: string | null }) {
  const router = useRouter()
  const [destination, setDestination] = useState('instagram')
  const [format, setFormat] = useState('story')
  const [post, setPost] = useState<PostDoc | null>(null)
  const [queue, setQueue] = useState<QueueItemWithMedia[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [instagramReady, setInstagramReady] = useState(false)
  const [current, setCurrent] = useState(0)
  const [tool, setTool] = useState<Tool>('text')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [done, setDone] = useState<{ kind: 'exported' | 'exported-story' | 'published'; url?: string | null } | null>(null)
  const [customTag, setCustomTag] = useState('')
  const [clipDuration, setClipDuration] = useState<number | null>(null)
  /** Where the clip is, for the position slider; while the curator drags it, the clip waits and shows the frame. */
  const [position, setPosition] = useState(0)
  const scrubbing = useRef(false)
  const [lastFile, setLastFile] = useState<{ url: string; name: string } | null>(null)
  const [logoReady, setLogoReady] = useState(false)
  /** The preview's sound: on, unless the browser refuses to start it, then the button turns it on. */
  const [sound, setSound] = useState(true)
  const imageRef = useRef<HTMLImageElement | null>(null)
  /** The wordmark, for the letters' filter. */
  const logoRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => { const img = new Image(); img.onload = () => { logoRef.current = img; setLogoReady(true) }; img.src = `/api/admin/comm/brand?variant=horizontal&color=${encodeURIComponent('#F8F5E6')}` }, [])
  const titleFont = typeof window !== 'undefined' ? (getComputedStyle(document.body).getPropertyValue('--font-tomorrow').trim() || 'Tomorrow, sans-serif') : 'Tomorrow, sans-serif'
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const liveRef = useRef<HTMLCanvasElement | null>(null)
  const saveTimer = useRef<number | null>(null)
  const dirty = useRef<Partial<PostDoc>>({})

  // The draft, the queue, the phrases, the configuration.
  useEffect(() => {
    if (!postId) return
    void fetch(`/api/admin/comm/posts/${postId}`, { cache: 'no-store' }).then((r) => r.json()).then((body) => {
      if (!body.post) { setError('Ce brouillon est introuvable.'); return }
      setPost(body.post); setDestination(body.post.destination); setFormat(body.post.format)
      if (body.post.status === 'exported') setDone({ kind: 'exported' })
      if (body.post.status === 'published') setDone({ kind: 'published', url: body.post.remoteUrl })
    }).catch(() => setError('Le brouillon est indisponible.'))
    void commList().then((body) => { if (body.items) setQueue(body.items) }).catch(() => {})
    void fetch('/api/admin/comm/phrases', { cache: 'no-store' }).then((r) => r.json()).then((body) => setPhrases(body.phrases ?? [])).catch(() => {})
    void fetch('/api/admin/comm/config', { cache: 'no-store' }).then((r) => r.json()).then((body) => setInstagramReady(body.instagram?.configured === true)).catch(() => {})
  }, [postId])

  const spec: FormatSpec | null = useMemo(() => formatSpec(destination, format), [destination, format])
  const destSpec = useMemo(() => DESTINATION_SPECS.find((d) => d.key === destination) ?? null, [destination])
  const family: Family = spec?.family ?? '9:16'
  const canvas = FAMILY_SIZES[family]
  const maxSeconds = Math.min(spec?.maxSeconds ?? clipMaxSeconds(), clipMaxSeconds())

  const start = useCallback(async () => {
    if (!spec) return
    setBusy('Création'); setError('')
    const response = await fetch('/api/admin/comm/posts', { method: 'POST', headers, body: JSON.stringify({ destination, format, queueItemIds: itemIds }) })
    const body = await response.json().catch(() => ({}))
    setBusy('')
    if (!body.post) { setError('Le post n’a pas pu être créé.'); return }
    router.replace(`/admin/comm/compose?post=${body.post._id}`)
  }, [destination, format, itemIds, router, spec])

  // Every change is saved a moment later.
  const save = useCallback((patch: Partial<PostDoc>) => {
    if (!post) return
    setPost((c) => (c ? { ...c, ...patch } : c))
    dirty.current = { ...dirty.current, ...patch }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const pending = dirty.current; dirty.current = {}
      const response = await fetch(`/api/admin/comm/posts/${post._id}`, { method: 'PATCH', headers, body: JSON.stringify(pending) })
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; setError(body.error === 'published' ? 'Ce post est publié : il ne change plus. Crée un nouveau post.' : 'La sauvegarde a échoué.') }
    }, 500)
  }, [post])

  const allMedia = useMemo(() => queue.flatMap((i) => i.media), [queue])
  const choices: MediaChoice[] = useMemo(() => queue.flatMap((item) => [
    ...item.media.filter((m) => ['capture', 'import', 'gif', 'image', 'screenshot', 'montage'].includes(m.kind)).filter((m) => (spec?.media === 'video' ? m.contentType.startsWith('video/') : spec?.media === 'image' ? m.contentType.startsWith('image/') : true))
      .map((m) => ({ key: m._id, label: item.snapshot.title, itemId: item._id, mediaId: m._id, media: m, thumb: m.blobUrl, video: m.contentType.startsWith('video/'), poster: item.media.find((q) => q.kind === 'poster' && q.sourceMediaId === m._id)?.blobUrl ?? null, seconds: m.durationSec ?? null })),
    ...(item.snapshot.thumb && spec?.media !== 'video' && !item.media.some((m) => ['image', 'gif', 'screenshot'].includes(m.kind)) ? [{ key: `thumb:${item._id}`, label: `${item.snapshot.title} (miniature)`, itemId: item._id, mediaId: null, media: null, thumb: item.snapshot.thumb, video: false }] : []),
  ]), [queue, spec])

  const slide: PostSlide | null = post?.slides[current] ?? null
  const slideMedia = useMemo(() => (slide?.mediaId ? allMedia.find((m) => m._id === slide.mediaId) ?? null : null), [allMedia, slide])
  const isVideo = Boolean(slideMedia?.contentType.startsWith('video/'))
  const firstItem = useMemo(() => { const id = post?.slides.find((s) => s.itemId)?.itemId; return id ? queue.find((i) => i._id === id) ?? null : null }, [post, queue])

  const updateSlide = useCallback((patch: Partial<PostSlide>) => {
    if (!post) return
    save({ slides: post.slides.map((s, i) => (i === current ? { ...s, ...patch } : s)) })
  }, [current, post, save])

  // The slides' pictures follow half a second after the last change, not every keystroke.
  const [settled, setSettled] = useState<PostSlide[] | null>(null)
  useEffect(() => { if (!post) return; const t = window.setTimeout(() => setSettled(post.slides), 500); return () => window.clearTimeout(t) }, [post])

  const renderUrl = useCallback((s: PostSlide, index: number, mode: 'full' | 'overlay', scale?: number, seed?: string) => {
    const params = new URLSearchParams({ template: TEMPLATE_OF[family], palette: String(s.palette), logo: s.logoCorner === 'none' ? 'none' : s.logoVariant, text: s.text, mode, seed: seed ?? `${post?._id ?? 'x'}-${index}`, glitch: String(s.glitch ?? 0), gstyle: s.glitchStyle ?? 'random' })
    if (s.iconPlace) params.set('iconplace', [s.iconPlace.name, s.iconPlace.x, s.iconPlace.y, s.iconPlace.size].join(','))
    if (s.mediaPlace) params.set('mediaplace', [s.mediaPlace.x, s.mediaPlace.y, s.mediaPlace.w, s.mediaPlace.h].join(','))
    if (scale) params.set('scale', String(scale))
    if (s.itemId) params.set('item', s.itemId)
    if (s.mediaId) params.set('media', s.mediaId); else params.set('thumb', '1')
    if (post?.credit) params.set('credit', post.credit)
    const place = (p: Placement) => [p.x, p.y, p.size, p.align ?? '', p.width ?? '', p.font ?? '', p.weight ?? ''].join(',')
    params.set('textplace', place(s.textPlace ?? { x: 0.06, y: 0.72, size: TEXT_SIZES.M, align: 'left', width: 0.88 }))
    if (s.sourcePlace) params.set('sourceplace', place(s.sourcePlace))
    const logo = logoPlaceOf(s.logoCorner ?? 'tl', family)
    if (logo) params.set('logoplace', place(logo))
    return `/api/admin/comm/render?${params.toString()}`
  }, [family, post])

  // The clip plays the chosen part, over and over.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideo) return
    const onMeta = () => { setClipDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : slideMedia?.durationSec ?? null) }
    // With sound when the browser allows it (the curator has clicked around); muted otherwise, and the button says so.
    video.muted = !sound
    video.play().catch(() => { if (!video.muted) { setSound(false); video.muted = true; void video.play().catch(() => undefined) } })
    // At the cut's end the clip returns to its start; before the start it plays on, so the curator can look around the cut.
    const onTime = () => { setPosition(video.currentTime); const t = slide?.trim; if (t && !scrubbing.current && video.currentTime >= t.endSec) video.currentTime = t.startSec }
    video.addEventListener('loadedmetadata', onMeta); video.addEventListener('timeupdate', onTime)
    if (video.readyState >= 1) onMeta()
    return () => { video.removeEventListener('loadedmetadata', onMeta); video.removeEventListener('timeupdate', onTime) }
  }, [isVideo, slide?.trim, slideMedia, sound])

  // The live preview: the same drawer as the export, on a half-size canvas, following the clip as it plays.
  const animated = Boolean(slide && (slide.glitchStyle ?? 'random') !== 'random')
  const liveOn = Boolean(slide?.itemId && (isVideo || animated))
  const overlayKey = slide ? renderUrl(settled?.[current] ?? slide, current, 'overlay', 0.5) : ''
  useEffect(() => {
    const live = liveRef.current
    if (!live || !liveOn || !slide) return
    let stopped = false, handle = 0, frame = 0
    const video = videoRef.current
    const stillUrl = !isVideo && slideMedia?.contentType.startsWith('image/') ? slideMedia.blobUrl : null
    if (!isVideo && !stillUrl) return
    const w = Math.round(canvas.width / 2), h = Math.round(canvas.height / 2)
    live.width = w; live.height = h
    const ctx = live.getContext('2d')!
    const calm = `${window.location.origin}${renderUrl({ ...slide, glitch: 0 }, current, 'overlay', 0.5)}`
    const urls = [calm, ...[1, 2, 3, 4].map((k) => `${window.location.origin}${renderUrl(slide, current, 'overlay', 0.5, `${post?._id}-${current}-g${k}`)}`)]
    const load = (url: string) => new Promise<HTMLImageElement | null>((resolve) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url })
    const stillLoad = stillUrl ? new Promise<HTMLImageElement | null>((resolve) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = stillUrl }) : Promise.resolve(null)
    void Promise.all([Promise.all(urls.map(load)), stillLoad]).then(([loaded, still]) => {
      if (stopped) return
      const source: CanvasImageSource | null = isVideo ? video : still
      if (!source) return
      imageRef.current = still
      const overlays = loaded.filter((img): img is HTMLImageElement => Boolean(img))
      const size = isVideo && video ? { width: video.videoWidth || 16, height: video.videoHeight || 9 } : { width: still?.naturalWidth || 16, height: still?.naturalHeight || 9 }
      const mp = slide.mediaPlace
      const rect = mp ? cropRectIn(size, { width: w, height: h }, { left: mp.x, top: mp.y, width: mp.w, height: mp.h }, 'centered') : cropRect(size, { width: w, height: h }, { top: 0, height: 1 }, 'centered')
      const clip = mp ? { x: Math.round(mp.x * w), y: Math.round(mp.y * h), w: Math.round(mp.w * w), h: Math.round(mp.h * h) } : null
      const drawer = createDrawer({ width: w, height: h, background: '#191916', rect, clip, overlays, intensity: slide.glitch ?? 0, style: (slide.glitchStyle ?? 'random') as GlitchStyle, accent: PALETTE_COLORS[slide.palette] ?? '#F8F5E6', ground: Boolean(mp), text: slide.text, titleFont, cleanOnTop: Boolean(slide.mediaOnTop), zoom: slide.mediaZoom ?? 1, logo: logoRef.current, letterAlpha: slide.letterAlpha ?? 0.7 })
      const schedule = burstSchedule(60_000, slide.glitch ?? 0, overlays.length)
      const started = performance.now()
      const tick = () => { if (stopped) return; drawer(ctx, source, (performance.now() - started) % 60_000, schedule, frame); frame += 1; handle = requestAnimationFrame(tick) }
      tick()
    })
    return () => { stopped = true; if (handle) cancelAnimationFrame(handle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redrawn when the dressing changes
  }, [overlayKey, isVideo, liveOn, slide?.glitch, slide?.glitchStyle, slide?.mediaPlace, slide?.palette, slide?.text, slide?.mediaOnTop, slide?.mediaZoom, slide?.letterAlpha, logoReady])

  const trim = slide?.trim ?? { startSec: 0, endSec: Math.min(clipDuration ?? slideMedia?.durationSec ?? maxSeconds, maxSeconds) }
  const setTrim = (startSec: number, endSec: number) => {
    const total = clipDuration ?? slideMedia?.durationSec ?? maxSeconds
    const s = Math.max(0, Math.min(startSec, total)); let e = Math.max(s + 0.5, Math.min(endSec, total)); if (e - s > maxSeconds) e = s + maxSeconds
    updateSlide({ trim: { startSec: Math.round(s * 10) / 10, endSec: Math.round(e * 10) / 10 } })
    const video = videoRef.current; if (video) video.currentTime = s
  }

  const caption = useMemo(() => (post && firstItem ? buildCaption({ destination: post.destination, format: post.format, title: post.captionHead ? '' : firstItem.snapshot.title, phrase: post.captionHead ? post.captionHead : post.phrase, snapshot: firstItem.snapshot, credit: post.credit, number: post.number, hashtags: post.hashtags, homeUrl: post.homeLink ? window.location.origin : null }) : null), [post, firstItem])
  useEffect(() => { if (caption && post && caption.text !== post.caption) save({ caption: caption.text }) }, [caption, post, save])
  const suggested = useMemo(() => suggestHashtags(queue.filter((i) => post?.queueItemIds.includes(i._id)).flatMap((i) => i.subjects)), [queue, post])

  const ready = Boolean(post && spec && post.slides.length >= spec.slides.min && post.slides.every((s) => s.itemId) && caption && !caption.overLimit)

  /** One slide to a file: a clip through the montage, a picture through the engine. */
  /** Started inside the click, so the browser lets each clip play again later, sound on, once the dressing is loaded. */
  const activateClips = useCallback((): Map<number, HTMLVideoElement> => {
    const map = new Map<number, HTMLVideoElement>()
    for (const [index, s] of (post?.slides ?? []).entries()) {
      const media = s.mediaId ? allMedia.find((m) => m._id === s.mediaId) ?? null : null
      if (!media?.contentType.startsWith('video/')) continue
      const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.playsInline = true; v.muted = false; v.volume = 0.001; v.src = media.blobUrl
      v.play().then(() => v.pause()).catch(() => { /* then the recording plays it muted */ })
      map.set(index, v)
    }
    return map
  }, [allMedia, post])

  const fileOf = useCallback(async (s: PostSlide, index: number, clips: Map<number, HTMLVideoElement>): Promise<{ blob: Blob; extension: string; video: boolean }> => {
    const media = s.mediaId ? allMedia.find((m) => m._id === s.mediaId) ?? null : null
    const overlays = [renderUrl({ ...s, glitch: 0 }, index, 'overlay'), ...[1, 2, 3, 4].map((k) => renderUrl(s, index, 'overlay', undefined, `${post?._id}-${index}-g${k}`))].map((u) => `${window.location.origin}${u}`)
    const common = { canvas, overlayUrls: overlays, intensity: s.glitch ?? 0, style: (s.glitchStyle ?? 'random') as GlitchStyle, accent: PALETTE_COLORS[s.palette] ?? '#F8F5E6', mediaPlace: s.mediaPlace ?? null, background: '#191916', text: s.text, titleFont, mediaOnTop: Boolean(s.mediaOnTop), mediaZoom: s.mediaZoom ?? 1, logo: logoRef.current, letterAlpha: s.letterAlpha ?? 0.7, onProgress: (sec: number, total: number) => setProgress(total ? sec / total : null) }
    if (media?.contentType.startsWith('video/')) {
      const out = await recordMontage({ ...common, src: media.blobUrl, video: clips.get(index) ?? null, trim: s.trim ?? { startSec: 0, endSec: Math.min(media.durationSec ?? maxSeconds, maxSeconds) } })
      return { blob: out.blob, extension: out.extension, video: true }
    }
    if ((s.glitchStyle ?? 'random') !== 'random' && media?.contentType.startsWith('image/')) {
      // A picture with an animation leaves as a clip of a few seconds.
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('image')); img.src = media.blobUrl })
      const out = await recordMontage({ ...common, src: media.blobUrl, image, seconds: s.animSeconds ?? 5, trim: { startSec: 0, endSec: s.animSeconds ?? 5 } })
      return { blob: out.blob, extension: out.extension, video: true }
    }
    const blob = await renderJpeg(`${window.location.origin}${renderUrl(s, index, 'full')}`)
    return { blob, extension: 'jpg', video: false }
  }, [allMedia, canvas, maxSeconds, post, renderUrl, titleFont])

  /** The source's address, from the first slide's item: the post's own copy only follows after a save. */
  const sourceUrl = useMemo(() => { const item = queue.find((i) => i._id === post?.slides[0]?.itemId); return item?.snapshot.sourceUrl || item?.snapshot.url || post?.sourceUrl || '' }, [post, queue])
  const doExport = useCallback(async () => {
    if (!post || !ready || !caption) return
    const clips = activateClips()
    setError(''); setBusy('Export'); setProgress(null)
    try {
      for (const [index, s] of post.slides.entries()) {
        setBusy(post.slides.length > 1 ? `Export ${index + 1} / ${post.slides.length}` : 'Export')
        const file = await fileOf(s, index, clips)
        const name = `random-${String(post.number).padStart(3, '0')}${post.slides.length > 1 ? `-${index + 1}` : ''}.${file.extension}`
        setLastFile({ url: URL.createObjectURL(file.blob), name })
        downloadBlob(file.blob, name)
      }
      // A story carries no caption: the source's address is what goes into Instagram's link sticker.
      const story = post.format === 'story'
      try { await navigator.clipboard?.writeText(story ? sourceUrl : caption.text) } catch { /* the text stays on screen */ }
      await fetch(`/api/admin/comm/posts/${post._id}/exported`, { method: 'POST', headers, body: JSON.stringify({}) })
      setDone({ kind: story ? 'exported-story' : 'exported' })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export impossible.') }
    setBusy(''); setProgress(null)
  }, [activateClips, caption, fileOf, post, ready, sourceUrl])

  const doPublish = useCallback(async () => {
    if (!post || !ready || !caption || !instagramReady) return
    const clips = activateClips()
    setError(''); setBusy('Préparation'); setProgress(null)
    try {
      const assets: PublishAsset[] = []
      for (const [index, s] of post.slides.entries()) {
        setBusy(`Préparation ${index + 1} / ${post.slides.length}`)
        const file = await fileOf(s, index, clips)
        const media = s.mediaId ? allMedia.find((m) => m._id === s.mediaId) ?? null : null
        const uploaded = await uploadMedia(s.itemId ?? post.queueItemIds[0], file.blob, file.video ? 'montage' : 'render', (f) => setProgress(f), file.video ? { trim: s.trim ?? undefined, sourceMediaId: media?._id, templateKey: TEMPLATE_OF[family] } : {})
        if (!uploaded.media) throw new Error(uploaded.message ?? 'Envoi impossible.')
        assets.push({ slideIndex: index, url: uploaded.media.blobUrl, kind: file.video ? 'video' : 'image' })
      }
      setBusy('Publication'); setProgress(null)
      const outcome = await publishInstagram(post._id, assets, [], (text) => setBusy(text))
      if (outcome.state === 'published') setDone({ kind: 'published', url: outcome.remoteUrl })
      else setError(outcome.reason)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Publication impossible.') }
    setBusy(''); setProgress(null)
  }, [activateClips, allMedia, caption, family, fileOf, instagramReady, post, ready])

  const textPlace = slide?.textPlace ?? { x: 0.06, y: 0.72, size: TEXT_SIZES.M, align: 'left' as const, width: 0.88 }
  const sourcePlace = slide?.sourcePlace ?? { x: 0.06, y: family === '16:9' ? 0.84 : family === '9:16' ? 0.89 : 0.88, size: SOURCE_SIZES.M, align: 'left' as const, width: 0.88 }
  const aspect = `${canvas.width} / ${canvas.height}`
  const textHeight = (textPlace.size * 2.4 / 1080) * (canvas.width / canvas.height)
  const sourceHeight = (sourcePlace.size * 2.6 / 1080) * (canvas.width / canvas.height)

  // ----- Before the draft: where, and what format.
  if (!postId) {
    return (
      <main className="min-h-screen bg-black px-5 py-8 text-white">
        <div className="mx-auto max-w-xl space-y-6">
          <nav className="text-sm"><Link href="/admin/comm" className="underline">← La file</Link></nav>
          <h1 className="text-2xl font-bold">Nouveau post</h1>
          <div className="flex flex-wrap gap-2">{DESTINATION_SPECS.map((d) => <button key={d.key} className={destination === d.key ? chipOn : chip} onClick={() => { setDestination(d.key); setFormat(d.formats[0].key) }}>{d.name}{!d.direct ? ' · export' : ''}</button>)}</div>
          <div className="flex flex-wrap gap-2">{destSpec?.formats.map((f) => <button key={f.key} className={format === f.key ? chipOn : chip} onClick={() => setFormat(f.key)}>{f.name}</button>)}</div>
          {spec ? <p className="text-xs text-gray-400">{spec.family}{spec.slides.max > 1 ? ` · jusqu’à ${spec.slides.max} slides` : ''}{spec.maxSeconds ? ` · ${Math.min(spec.maxSeconds, clipMaxSeconds())} s de vidéo au plus` : ''}</p> : null}
          {error ? <p role="alert" className="text-red-300">{error}</p> : null}
          <button className={primary} disabled={!spec || Boolean(busy)} onClick={start}>Commencer</button>
        </div>
      </main>
    )
  }

  if (!post || !spec) return <main className="min-h-screen bg-black px-5 py-8 text-white"><p role="status">{error || 'Chargement…'}</p></main>

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><Link href="/admin/comm" className="text-sm underline">← La file</Link><h1 className="text-xl font-bold">n° {post.number} · {destSpec?.name} · {spec.name}</h1></div>
          <div className="flex flex-wrap items-center gap-2">
            {destSpec?.direct ? <button className={secondary} disabled={!ready || !instagramReady || Boolean(busy)} title={instagramReady ? 'Publier sur Instagram' : 'Instagram n’est pas connecté : Configuration'} onClick={doPublish}>Publier</button> : null}
            <button className={primary} disabled={!ready || Boolean(busy)} onClick={doExport}>Exporter</button>
          </div>
        </header>
        {busy ? <div className="rounded border border-white/20 p-2 text-sm"><span role="status">{busy}…</span>{progress != null ? <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-white/10"><div className="h-full bg-white" style={{ width: `${Math.round(progress * 100)}%` }} /></div> : null}</div> : null}
        {error ? <p role="alert" className="rounded border border-red-400/50 p-2 text-sm text-red-300">{error}</p> : null}
        {done ? <p className="rounded border border-green-400/50 p-2 text-sm text-green-300">{done.kind === 'published' ? <>Publié sur Instagram. {done.url ? <a href={done.url} target="_blank" rel="noreferrer" className="underline">Voir le post</a> : null}</> : <>{done.kind === 'exported-story' ? <>Exporté : le fichier est téléchargé, l’adresse de la source est copiée — dans Instagram, ajoute le <b>sticker Lien</b> à la story et colle-la ({sourceUrl}).</> : <>Exporté : le fichier est téléchargé, la légende est copiée.</>}{lastFile ? <> Pas de téléchargement ? <a href={lastFile.url} download={lastFile.name} className="underline">Télécharger {lastFile.name}</a>.</> : null}</>} La publication porte le n° {post.number}.</p> : null}

        <section className={section}>
          <h2 className={title}>Média{spec.slides.max > 1 ? ' · slides' : ''}</h2>
          {spec.slides.max > 1 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {post.slides.map((s, i) => (
                /* eslint-disable-next-line @next/next/no-img-element -- the slide as the engine draws it */
                <button key={i} className={`relative h-16 overflow-hidden rounded border ${i === current ? 'border-white' : 'border-white/30'}`} style={{ aspectRatio: aspect }} onClick={() => setCurrent(i)}>{s.itemId ? <img src={renderUrl(settled?.[i] ?? s, i, 'full', 0.2)} alt="" className="h-full w-full object-cover" /> : null}<span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">{i + 1}</span></button>
              ))}
              {post.slides.length < spec.slides.max ? <button className={chip} onClick={() => { save({ slides: [...post.slides, { itemId: null, mediaId: null, templateKey: TEMPLATE_OF[family], text: '', palette: post.slides[current]?.palette ?? 0, logoVariant: 'white', glitch: post.slides[current]?.glitch ?? 0, logoCorner: post.slides[current]?.logoCorner ?? 'tl' }] }); setCurrent(post.slides.length) }}>+ slide</button> : null}
              {post.slides.length > 1 ? <button className={chip} onClick={() => { save({ slides: post.slides.filter((_, i) => i !== current) }); setCurrent(Math.max(0, current - 1)) }}>Retirer</button> : null}
            </div>
          ) : null}
          {!choices.length ? <p className="text-sm text-amber-200">La file est vide. Depuis la curation, le bouton Comm y met des contenus.</p> : null}
          <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
            {choices.map((c) => { const active = slide?.mediaId ? c.mediaId === slide.mediaId : c.mediaId === null && c.itemId === slide?.itemId
              return (
                <button key={c.key} title={c.label} className={`relative h-20 w-20 overflow-hidden rounded border ${active ? 'border-white' : 'border-white/20'}`} onClick={async () => {
                  if (c.mediaId) { updateSlide({ itemId: c.itemId, mediaId: c.mediaId, trim: null }); return }
                  // A thumbnail from another site: brought into the store first, so the animations can read it.
                  setBusy('Récupération de l’image')
                  const imported = await commImportSource(c.itemId, 'thumb')
                  setBusy('')
                  if (!imported.media) { setError(imported.message ?? 'Image introuvable.'); return }
                  const media = imported.media
                  setQueue((q) => q.map((i) => (i._id === c.itemId ? { ...i, media: [...i.media, media] } : i)))
                  updateSlide({ itemId: c.itemId, mediaId: media._id, trim: null })
                }}>
                  {c.video && c.media && !c.poster ? <video src={c.media.blobUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : (c.poster ?? c.thumb) ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- a clip's poster or a thumbnail of the queue */
                    <img src={c.poster ?? c.thumb ?? ''} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  {c.video ? <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px]">▶ {c.seconds ? `${Math.round(c.seconds)} s` : 'clip'}</span> : null}
                </button>
              ) })}
          </div>
        </section>

        {slide?.itemId ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="md:sticky md:top-4 md:self-start">
              <div className="relative mx-auto w-full max-w-sm select-none overflow-hidden rounded-xl border border-white/20 bg-[#191916]" style={{ aspectRatio: aspect }}>
                {!liveOn ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- the slide as it will leave */
                  <img src={renderUrl(settled?.[current] ?? slide, current, 'full', 0.5)} alt="Aperçu" className="absolute inset-0 h-full w-full" draggable={false} />
                ) : null}
                {isVideo && slideMedia ? <video ref={videoRef} src={slideMedia.blobUrl} crossOrigin="anonymous" muted={!sound} loop autoPlay playsInline className="absolute h-px w-px opacity-0" /> : null}
                {liveOn ? <canvas ref={liveRef} className="absolute inset-0 h-full w-full" aria-label="Aperçu" /> : null}
                {isVideo ? <button type="button" className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-1 text-xs text-white" aria-label={sound ? 'Couper le son de l’aperçu' : 'Mettre le son de l’aperçu'} onClick={() => { const v = videoRef.current; const next = !sound; setSound(next); if (v) { v.muted = !next; void v.play().catch(() => setSound(false)) } }}>{sound ? '🔊 son' : '🔇 muet'}</button> : null}
                {slide.mediaPlace ? <DragBox rect={slide.mediaPlace} label="média" onMove={(x, y) => updateSlide({ mediaPlace: { ...slide.mediaPlace!, x, y } })} /> : null}
                {slide.iconPlace ? <DragBox rect={{ x: slide.iconPlace.x, y: slide.iconPlace.y, w: slide.iconPlace.size / 1080 * (1080 / canvas.width), h: (slide.iconPlace.size * 22 / 24) / canvas.height * (canvas.width / 1080) }} label="icône" onMove={(x, y) => updateSlide({ iconPlace: { ...slide.iconPlace!, x, y } })} /> : null}
                {slide.text.trim() ? <DragBox rect={{ x: textPlace.x, y: textPlace.y, w: textPlace.width ?? 0.88, h: textHeight }} label="texte" onMove={(x, y) => updateSlide({ textPlace: { ...textPlace, x, y } })} /> : null}
                <DragBox rect={{ x: sourcePlace.x, y: sourcePlace.y, w: sourcePlace.width ?? 0.88, h: sourceHeight }} label="source" onMove={(x, y) => updateSlide({ sourcePlace: { ...sourcePlace, x, y } })} />
              </div>
              {isVideo ? (
                <div className="mx-auto mt-3 w-full max-w-sm">
                  <div className="flex items-center gap-2 text-xs text-gray-300"><span>Position</span>
                    <input type="range" min={0} max={clipDuration ?? maxSeconds} step={0.1} value={Math.min(position, clipDuration ?? maxSeconds)} className="flex-1" aria-label="Position dans le clip"
                      onPointerDown={() => { scrubbing.current = true; videoRef.current?.pause() }}
                      onChange={(e) => { const v = videoRef.current; const t = Number(e.target.value); setPosition(t); if (v) v.currentTime = t }}
                      onPointerUp={() => { scrubbing.current = false; void videoRef.current?.play().catch(() => undefined) }}
                      onKeyUp={() => { scrubbing.current = false; void videoRef.current?.play().catch(() => undefined) }} />
                    <span className="w-12 text-right">{position.toFixed(1)} s</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-300"><span>Couper</span><span>{trim.startSec.toFixed(1)} s → {trim.endSec.toFixed(1)} s · {(trim.endSec - trim.startSec).toFixed(1)} s{clipDuration ? ` sur ${clipDuration.toFixed(1)}` : ''}</span></div>
                  <input type="range" min={0} max={clipDuration ?? maxSeconds} step={0.1} value={trim.startSec} onChange={(e) => setTrim(Number(e.target.value), Math.max(Number(e.target.value) + 0.5, trim.endSec))} className="w-full" aria-label="Début" />
                  <input type="range" min={0} max={clipDuration ?? maxSeconds} step={0.1} value={trim.endSec} onChange={(e) => setTrim(trim.startSec, Number(e.target.value))} className="w-full" aria-label="Fin" />
                  <p className="text-[11px] text-gray-500">Début en haut, fin en bas, {maxSeconds} s au plus. {MUSIC_NOTE}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="flex gap-2"><button className={tool === 'text' ? chipOn : chip} onClick={() => setTool('text')}>Texte</button><button className={tool === 'style' ? chipOn : chip} onClick={() => setTool('style')}>Style</button></div>

              {tool === 'text' ? (
                <section className={section}>
                  <h2 className={title}>Texte</h2>
                  <textarea className="w-full rounded border border-white/40 bg-black px-2 py-1" rows={2} value={slide.text} placeholder="Une phrase, ou rien. Glisse-la sur l’image." onChange={(e) => updateSlide({ text: e.target.value })} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select className="rounded border border-white/40 bg-black px-2 py-1 text-xs" value="" onChange={(e) => { if (e.target.value) updateSlide({ text: e.target.value }) }}><option value="">Phrase prête…</option>{phrases.filter((p) => p.text).map((p) => <option key={p._id ?? p.text} value={p.text}>{p.lang} · {p.text}</option>)}</select>
                    {(Object.keys(TEXT_SIZES) as Array<keyof typeof TEXT_SIZES>).map((k) => <button key={k} className={textPlace.size === TEXT_SIZES[k] ? chipOn : chip} onClick={() => updateSlide({ textPlace: { ...textPlace, size: TEXT_SIZES[k] } })}>{k}</button>)}
                    {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={(textPlace.align ?? 'left') === a ? chipOn : chip} onClick={() => updateSlide({ textPlace: { ...textPlace, align: a } })}>{a === 'left' ? 'Gauche' : a === 'center' ? 'Centré' : 'Droite'}</button>)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Source</span>
                    {(Object.keys(SOURCE_SIZES) as Array<keyof typeof SOURCE_SIZES>).map((k) => <button key={k} className={sourcePlace.size === SOURCE_SIZES[k] ? chipOn : chip} onClick={() => updateSlide({ sourcePlace: { ...sourcePlace, size: SOURCE_SIZES[k] } })}>{k}</button>)}
                    <span className="text-xs text-gray-500">la plateforme et le lien, avec la marque de la plateforme ; glisse-la sur l’image</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Police</span>{FONTS.map(([font, weight, name]) => <button key={name} className={(textPlace.font ?? 'Tomorrow') === font && (textPlace.weight ?? 900) === weight ? chipOn : chip} onClick={() => updateSlide({ textPlace: { ...textPlace, font, weight } })}>{name}</button>)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Icône</span>
                    <select className="rounded border border-white/40 bg-black px-2 py-1 text-xs" value={slide.iconPlace?.name ?? ''} onChange={(e) => updateSlide({ iconPlace: e.target.value ? { name: e.target.value, x: slide.iconPlace?.x ?? 0.8, y: slide.iconPlace?.y ?? 0.06, size: slide.iconPlace?.size ?? 120 } : null })}><option value="">Aucune</option>{ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                    {slide.iconPlace ? <><input type="range" min={48} max={400} step={8} value={slide.iconPlace.size} onChange={(e) => updateSlide({ iconPlace: { ...slide.iconPlace!, size: Number(e.target.value) } })} className="w-32" aria-label="Taille de l’icône" /><span className="text-xs text-gray-400">glisse-la sur l’image</span></> : null}
                  </div>
                </section>
              ) : (
                <section className={section}>
                  <h2 className={title}>Style</h2>
                  <div className="flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Couleur</span>{PALETTE_COLORS.map((c, i) => <button key={c} aria-label={`Couleur ${i + 1}`} className={`h-7 w-7 rounded-full border-2 ${slide.palette === i ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => updateSlide({ palette: i })} />)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Logo</span>{([['tl', 'haut gauche'], ['tr', 'haut droite'], ['bl', 'bas gauche'], ['br', 'bas droite'], ['none', 'aucun']] as const).map(([k, name]) => <button key={k} className={(slide.logoCorner ?? 'tl') === k ? chipOn : chip} onClick={() => updateSlide({ logoCorner: k })}>{name}</button>)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Animation</span>
                    {GLITCH_STYLES.map((g) => <button key={g.key} title={g.hint} className={(slide.glitchStyle ?? 'random') === g.key ? chipOn : chip} onClick={() => updateSlide({ glitchStyle: g.key, glitch: (slide.glitch ?? 0) > 0 ? slide.glitch : 0.6 })}>{g.name}</button>)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Force</span><input type="range" min={0} max={1} step={0.05} value={slide.glitch ?? 0} onChange={(e) => updateSlide({ glitch: Number(e.target.value) })} className="w-40" aria-label="Intensité du glitch" /><span className="w-10 text-xs">{Math.round((slide.glitch ?? 0) * 100)} %</span></div>
                  <p className="mt-1 text-xs text-gray-500">{GLITCH_STYLES.find((g) => g.key === (slide.glitchStyle ?? 'random'))?.hint}. L’aperçu montre le vrai résultat ; seul ton média est dessiné, jamais une autre image.</p>
                  {(slide.glitchStyle ?? 'random') === 'letters' ? <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Filtre</span><input type="range" min={0.1} max={1} step={0.05} value={slide.letterAlpha ?? 0.7} onChange={(e) => updateSlide({ letterAlpha: Number(e.target.value) })} className="w-40" aria-label="Intensité du texte-filtre" /><span className="w-10 text-xs">{Math.round((slide.letterAlpha ?? 0.7) * 100)} %</span><span className="text-xs text-gray-500">les lettres couvrent plus ou moins l’image</span></div> : null}
                  {isVideo || animated ? <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(slide.mediaOnTop)} onChange={(e) => {
                    // The ground needs room: the picture shrinks when it fills the frame.
                    // On: the picture in a window of the screen's shape, a margin around it. Off: the picture fills the frame again.
                    updateSlide(e.target.checked ? { mediaOnTop: true, mediaPlace: { x: 0.12, y: 0.12, w: 0.76, h: 0.76 }, mediaZoom: slide.mediaZoom ?? 1 } : { mediaOnTop: null, mediaPlace: null })
                  }} />Animation en fond, média propre par-dessus<span className="text-gray-500">(le média dans une fenêtre à la forme de l’écran, une marge autour)</span></label> : null}
                  {slide.mediaOnTop ? <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Marge</span><input type="range" min={0.03} max={0.2} step={0.01} value={slide.mediaPlace?.x ?? 0.12} onChange={(e) => { const m = Number(e.target.value); updateSlide({ mediaPlace: { x: m, y: m, w: Math.round((1 - 2 * m) * 1000) / 1000, h: Math.round((1 - 2 * m) * 1000) / 1000 } }) }} className="w-36" aria-label="Marge autour du média" /><span className="w-10 text-xs">{Math.round((slide.mediaPlace?.x ?? 0.12) * 100)} %</span>
                    <span className="w-14 text-xs text-gray-400">Zoom</span><input type="range" min={1} max={2.5} step={0.05} value={slide.mediaZoom ?? 1} onChange={(e) => updateSlide({ mediaZoom: Number(e.target.value) })} className="w-36" aria-label="Zoom du média dans sa fenêtre" /><span className="w-10 text-xs">{Math.round((slide.mediaZoom ?? 1) * 100)} %</span></div> : null}
                  {!isVideo && animated ? <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Durée</span>{[3, 5, 8, 10].map((n) => <button key={n} className={(slide.animSeconds ?? 5) === n ? chipOn : chip} onClick={() => updateSlide({ animSeconds: n })}>{n} s</button>)}<span className="text-xs text-gray-500">l’image devient un clip</span></div> : null}
                  {!slide.mediaOnTop ? <div className="mt-3 flex flex-wrap items-center gap-2"><span className="w-14 text-xs text-gray-400">Vidéo</span>
                    <button className={!slide.mediaPlace ? chipOn : chip} onClick={() => updateSlide({ mediaPlace: null })}>Plein écran</button>
                    <input type="range" min={0.3} max={1} step={0.02} value={slide.mediaPlace?.w ?? 1} onChange={(e) => { const w = Number(e.target.value); const v = videoRef.current; const ratio = v && v.videoWidth && v.videoHeight ? v.videoHeight / v.videoWidth : 9 / 16; const h = Math.min(1, Math.round(w * (canvas.width / canvas.height) * ratio * 1000) / 1000); updateSlide({ mediaPlace: w >= 1 ? null : { x: Math.round((1 - w) / 2 * 1000) / 1000, y: slide.mediaPlace?.y ?? Math.round((1 - h) / 2 * 1000) / 1000, w, h } }) }} className="w-36" aria-label="Taille de la vidéo" /><span className="w-10 text-xs">{Math.round((slide.mediaPlace?.w ?? 1) * 100)} %</span>
                    {slide.mediaPlace ? <span className="text-xs text-gray-400">glisse-la ; le fond est l’image agrandie</span> : null}
                  </div> : null}
                </section>
              )}

              <section className={section}>
                <h2 className={title}>Légende</h2>
                <textarea className="w-full rounded border border-white/40 bg-black px-2 py-1 text-sm" rows={2} value={post.captionHead} placeholder={`Sinon : « ${firstItem?.snapshot.title.slice(0, 50) ?? ''} »`} onChange={(e) => save({ captionHead: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-2">{[...new Set([...suggested, ...post.hashtags])].map((tag) => <label key={tag} className="flex items-center gap-1 rounded border border-white/30 px-2 py-1 text-xs"><input type="checkbox" checked={post.hashtags.includes(tag)} onChange={(e) => save({ hashtags: e.target.checked ? [...post.hashtags, tag] : post.hashtags.filter((t) => t !== tag) })} />{tag}</label>)}
                  <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const tag = customTag.trim().replace(/^#?/, '#'); if (/^#[\p{L}\p{N}_]{2,40}$/u.test(tag) && !post.hashtags.includes(tag)) save({ hashtags: [...post.hashtags, tag] }); setCustomTag('') }}><input className="w-28 rounded border border-white/40 bg-black px-2 py-1 text-xs" placeholder="#Autre" value={customTag} onChange={(e) => setCustomTag(e.target.value)} /><button className={chip} type="submit">+</button></form>
                </div>
                {caption ? <pre className="mt-2 whitespace-pre-wrap rounded border border-white/15 p-2 text-xs text-gray-300">{caption.text}</pre> : null}
                {caption ? <p className={`mt-1 text-[11px] ${caption.overLimit ? 'text-red-300' : 'text-gray-500'}`}>{caption.length} / {caption.limit} · crédit et source toujours inclus · <button className="underline" onClick={() => navigator.clipboard?.writeText(caption.text)}>copier</button></p> : null}
              </section>
            </div>
          </div>
        ) : <p className="text-sm text-gray-300">Choisis un média ci-dessus{spec.slides.max > 1 ? ' pour cette slide' : ''}.</p>}
        {!ready && slide?.itemId && spec.slides.min > post.slides.filter((s) => s.itemId).length ? <p className="text-xs text-amber-200">Un {spec.name.toLowerCase()} demande au moins {spec.slides.min} slides avec un média.</p> : null}
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
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation()
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
    <div role="button" aria-label={`Déplacer : ${label}`} className="absolute cursor-move touch-none rounded border border-dashed border-white/40 hover:border-white" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, minHeight: 14 }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <span className="absolute -top-4 left-0 rounded bg-black/70 px-1 text-[10px] text-white/80">{label}</span>
    </div>
  )
}
