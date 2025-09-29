'use client'

/* eslint-disable @next/next/no-img-element */

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../providers/I18nProvider'
import MonoIcon from './MonoIcon'
import LogoAnimated from './LogoAnimated'
import { addLike, isLiked, removeLike } from '../utils/likes'
import AnimatedButtonLabel from './AnimatedButtonLabel'
import type { ItemType } from '../lib/random/types'
import type {
  DisplayItem,
  SourceInfo,
  VideoItem as VideoContentItem,
} from '../lib/random/clientTypes'
import { getSourceHref, getSourceLabel } from '../lib/random/clientTypes'

type Theme = { bg: string; deep: string; cream: string; text: string }

const TYPE_ICONS: Record<ItemType, string> = {
  image: '/icons/image.svg',
  video: '/icons/Video.svg',
  web: '/icons/web.svg',
  quote: '/icons/quote.svg',
  joke: '/icons/joke.svg',
  fact: '/icons/fact.svg',
}

type Props = {
  open: boolean
  onClose: () => void
  onRandomAgain?: () => void
  trigger?: number
  isSecond?: boolean
  types?: ItemType[]
  lang?: 'en' | 'fr' | 'de' | 'jp'
  theme: Theme
  children?: ReactNode
  forceItem?: DisplayItem | null
}

/* ============ IMAGE plein largeur SANS coins arrondis ============ */
function ImageBlock({
  src,
  alt,
  sourceLabel,
  sourceHref,
  maxHeight,
}: {
  src: string
  alt?: string
  sourceLabel?: string
  sourceHref?: string
  maxHeight?: string
}) {
  return (
    <figure className="-mx-6 w-[calc(100%+3rem)]"> {/* supprime le padding horizontal du corps */}
      <div className="relative w-full overflow-hidden">
        <img
          src={src}
          alt={alt || 'image'}
          className="block w-full object-cover select-none"
          style={{ height: maxHeight ?? 'min(60vh, 640px)' }}
          loading="lazy"
          decoding="async"
        />
      </div>

      {(sourceLabel || sourceHref) && (
        <figcaption className="mt-3 text-center text-sm opacity-80">
          {sourceLabel ? <span>{sourceLabel}</span> : null}
          {sourceHref ? (
            <>
              {sourceLabel ? <span> · </span> : null}
              <a href={sourceHref} target="_blank" rel="noreferrer" className="underline">
                {new URL(sourceHref).hostname.replace(/^www\./, '')}
              </a>
            </>
          ) : null}
        </figcaption>
      )}
    </figure>
  )
}

/* ---------------- SHARE POPOVER (inchangé) ---------------- */
function SharePopover({
  item,
  theme,
  placeAbove,
  onClose,
}: {
  item: DisplayItem | null
  theme: Theme
  placeAbove: boolean
  onClose: () => void
}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gorandom.fun'
  const defaultUrl = typeof window !== 'undefined' ? window.location.href : origin
  let shareUrl = defaultUrl
  let shareText = 'Random — explore random contents. Only useless surprise.'

  if (item) {
    switch (item.type) {
      case 'image':
        shareUrl = item.url || defaultUrl
        shareText = item.title || shareText
        break
      case 'video':
        shareUrl = item.url || defaultUrl
        shareText = item.text || shareText
        break
      case 'web':
        shareUrl = item.url || defaultUrl
        shareText = item.text || item.source?.name || shareText
        break
      case 'quote':
        shareText = item.author ? `“${item.text}” — ${item.author}` : `“${item.text}”`
        break
      case 'joke':
      case 'fact':
        shareText = item.text
        break
      case 'encourage':
        shareText = item.text
        break
    }
  }

  const brandHost = origin.replace(/^https?:\/\//, '')
  const shareMessage = `${shareText} — via Random (${brandHost})`
  const shareMessageWithUrl = shareUrl ? `${shareMessage} ${shareUrl}` : shareMessage
  const u = encodeURIComponent(shareUrl || origin)
  const t = encodeURIComponent(shareMessage)

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Random', text: shareMessageWithUrl, url: shareUrl })
        onClose()
      }
    } catch {}
  }
  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(shareMessageWithUrl)
      onClose()
      alert('Link copied!')
    } catch {}
  }
  async function shareInstagram() {
    try {
      const nav = typeof navigator !== 'undefined'
        ? (navigator as Navigator & { canShare?: (data: ShareData) => boolean })
        : null
      if (nav?.share) {
        const response = await fetch('/elements/logo_black.png')
        if (response.ok) {
          const blob = await response.blob()
          const logoFile = new File([blob], 'random-logo.png', { type: blob.type || 'image/png' })
          const data: ShareData = {
            title: 'Random',
            text: shareMessageWithUrl,
            files: [logoFile],
          }
          if (nav.canShare?.({ files: data.files }) ?? false) {
            await nav.share({ ...data, url: shareUrl })
            onClose()
            return
          }
        }
      }
    } catch (error) {
      console.warn('instagram-share-fallback', error)
    }
    openWindow(`https://www.instagram.com/?url=${u}`)
  }
  function openWindow(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={`absolute ${placeAbove ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 w-[260px] rounded-xl shadow-xl p-3 z-50`}
      style={{ background: theme.deep, color: theme.cream }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide opacity-80">Share</div>
        <button
          className="text-lg leading-none opacity-80 hover:opacity-100"
          onClick={onClose}
          aria-label="Close share"
        >
          ×
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <button className="text-left px-3 py-2 rounded hover:opacity-90" onClick={nativeShare}>
          • Native share (mobile)
        </button>
        <button className="text-left px-3 py-2 rounded hover:opacity-90" onClick={copyLink}>
          • Copy link
        </button>
        <button className="text-left px-3 py-2 rounded hover:opacity-90" onClick={shareInstagram}>
          • Instagram
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://twitter.com/intent/tweet?url=${u}&text=${t}`)}
        >
          • X / Twitter
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://www.facebook.com/sharer/sharer.php?u=${u}`)}
        >
          • Facebook
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://www.reddit.com/submit?url=${u}&title=${t}`)}
        >
          • Reddit
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://www.linkedin.com/sharing/share-offsite/?url=${u}`)}
        >
          • LinkedIn
        </button>
      </div>
    </div>
  )
}

/* ---------------- RENDERER (image/quote/fact/joke/web/video) ---------------- */
function ContentRenderer({ item, theme }: { item: DisplayItem; theme: Theme }) {
  if (item.type === 'encourage') {
    return (
      <div className="flex flex-col items-center gap-3 text-center max-w-[58ch]">
        {item.icon ? (
          <div className="encourage-icon-wrapper">
            <img
              src={item.icon}
              alt="Encouragement"
              className="encourage-icon"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}
        {item.text ? (
          <p
            className="font-tomorrow font-bold text-[17px] md:text-[24px] leading-snug"
            style={{ color: theme.cream, letterSpacing: '.01em' }}
          >
            {item.text}
          </p>
        ) : null}
      </div>
    )
  }

  if (item.type === 'image') {
    const src = item.url || item.thumbUrl || ''
    if (!src) return null
    const alt = item.title || 'image'
    const sourceLabel = getSourceLabel(item.source, item.attribution || item.provider || null)
    const sourceHref = getSourceHref(item)

    return (
      <div className="w-full">
        <ImageBlock src={src} alt={alt} sourceLabel={sourceLabel} sourceHref={sourceHref} />
      </div>
    )
  }

  if (item.type === 'quote') {
    return (
      <blockquote
        className="max-w-[80ch] text-center font-tomorrow font-bold text-[22px] md:text-[32px] leading-snug"
        style={{ color: theme.cream, letterSpacing: '.01em' }}
      >
        “{item.text}”
      </blockquote>
    )
  }

  if (item.type === 'fact' || item.type === 'joke') {
    return (
      <p
        className="max-w-[85ch] text-center font-tomorrow font-bold text-[20px] md:text-[28px] leading-snug"
        style={{ color: theme.cream, letterSpacing: '.01em' }}
      >
        {item.text}
      </p>
    )
  }

  if (item.type === 'web') {
    const href = item.url
    let host = item.host || ''
    if (!host && href) {
      try {
        host = new URL(href).hostname.replace(/^www\./, '')
      } catch {}
    }
    const sourceHref = getSourceHref(item)
    return (
      <div className="flex flex-col items-center gap-4 w-full">
        {item.ogImage ? (
          <ImageBlock
            src={item.ogImage}
            alt={item.text || host || 'web'}
            sourceHref={sourceHref}
            maxHeight="min(34vh, 320px)"
          />
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline font-inter text-xl md:text-2xl text-center break-words"
            style={{ color: theme.cream }}
          >
            {item.text || host || href}
          </a>
        ) : (
          <p
            className="font-inter text-lg md:text-xl text-center"
            style={{ color: theme.cream }}
          >
            {item.text}
          </p>
        )}
      </div>
    )
  }

  if (item.type === 'video') {
    return <VideoEmbed item={item} />
  }

  return null
}

function VideoEmbed({ item }: { item: VideoContentItem }) {
  const provider = (item.provider || '').toLowerCase()
  const url = item.url
  if (!url) return null

  const looksYouTube = provider.includes('youtube') || /youtu\.?be/.test(url)
  const looksDailymotion = !looksYouTube && (provider.includes('dailymotion') || /dailymotion\.com|dai\.ly/.test(url))

  if (looksYouTube) {
    return <YouTubeEmbed item={item} />
  }

  if (looksDailymotion) {
    return <DailymotionEmbed item={item} />
  }

  return <HtmlVideoEmbed item={item} />
}

function YouTubeEmbed({ item }: { item: VideoContentItem }) {
  const { url, text } = item
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [originParam, setOriginParam] = useState('')
  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginParam(window.location.origin)
    }
  }, [])

  useEffect(() => {
    setIsMuted(true)
  }, [url])

  const videoId = useMemo(() => {
    try {
      const u = new URL(url)
      if (u.hostname.includes('youtu')) {
        return u.searchParams.get('v') || u.pathname.split('/').pop() || ''
      }
    } catch {}
    return url.split('/').pop() || ''
  }, [url])

  const src = useMemo(() => {
    const params = new URLSearchParams({
      rel: '0',
      autoplay: '1',
      mute: '1',
      controls: '1',
      fs: '1',
      enablejsapi: '1',
      modestbranding: '1',
      iv_load_policy: '3',
      playsinline: '1',
    })
    if (originParam) params.set('origin', originParam)
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  }, [videoId, originParam])

  const unmuteVideo = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
        '*'
      )
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      )
      setIsMuted(false)
    } catch {}
  }

  return (
    <div className="w-full">
      <div className="-mx-6 w-[calc(100%+3rem)]" style={{ aspectRatio: '16 / 9', position: 'relative' }}>
        <iframe
          ref={iframeRef}
          src={src}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          title={text || 'YouTube'}
          style={{ border: 'none' }}
        />
        {isMuted && (
          <button
            type="button"
            onClick={unmuteVideo}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '50%', right: '16px', transform: 'translateY(-50%)', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            Tap to unmute
          </button>
        )}
      </div>
    </div>
  )
}

function extractDailymotionId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('dailymotion.com')) {
      const segments = parsed.pathname.split('/').filter(Boolean)
      const idx = segments.indexOf('video')
      if (idx >= 0 && segments[idx + 1]) return segments[idx + 1].split('_')[0]
    }
    if (parsed.hostname === 'dai.ly') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      if (id) return id
    }
  } catch {}
  return null
}

function DailymotionEmbed({ item }: { item: VideoContentItem }) {
  const { url, text } = item
  const videoId = useMemo(() => extractDailymotionId(url), [url])
  const src = useMemo(() => {
    if (!videoId) return ''
    const params = new URLSearchParams()
    params.set('autoplay', '1')
    params.set('mute', '1')
    params.set('controls', '1')
    params.set('queue-enable', '0')
    params.set('sharing-enable', '0')
    params.set('ui-logo', '0')
    params.set('quality', '480')
    params.set('playsinline', '1')
    return videoId ? `https://www.dailymotion.com/embed/video/${videoId}?${params.toString()}` : ''
  }, [videoId])

  if (!videoId || !src) {
    return <HtmlVideoEmbed item={item} />
  }

  return (
    <div className="w-full">
      <div className="-mx-6 w-[calc(100%+3rem)]" style={{ aspectRatio: '16 / 9', position: 'relative' }}>
        <iframe
          src={src}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title={text || 'Dailymotion'}
          style={{ border: 'none' }}
        />
      </div>
    </div>
  )
}

function HtmlVideoEmbed({ item }: { item: VideoContentItem }) {
  const { url, thumbUrl, provider } = item
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setIsMuted(true)
    setHasError(false)
  }, [url])

  const unmute = () => {
    const video = videoRef.current
    if (!video) return
    try {
      video.muted = false
      const playPromise = video.play()
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {})
      }
      setIsMuted(false)
    } catch {}
  }

  return (
    <div className="w-full">
      <div className="-mx-6 w-[calc(100%+3rem)]" style={{ aspectRatio: '16 / 9', position: 'relative', backgroundColor: '#000' }}>
        <video
          key={url}
          ref={videoRef}
          className="w-full h-full"
          src={url}
          poster={thumbUrl || undefined}
          playsInline
          controls
          autoPlay
          loop
          muted={isMuted}
          preload="metadata"
          onError={() => setHasError(true)}
        />

        {isMuted && !hasError && (
          <button
            type="button"
            onClick={unmute}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '50%', right: '16px', transform: 'translateY(-50%)', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            Tap to unmute
          </button>
        )}

        {hasError && (
          <div
            className="absolute inset-0 flex items-center justify-center text-center px-6 text-sm sm:text-base font-semibold"
            style={{ color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)' }}
          >
            Impossible de lire cette vidéo ({provider || 'video'}).
          </div>
        )}
      </div>
    </div>
  )
}

function SourceLine({ item }: { item: DisplayItem }) {
  if (item.type === 'encourage') return null
  if (item.type === 'quote' && item.author) return <span>— {item.author}</span>

  const baseSource: SourceInfo = item.source ?? null
  const fallbackSource: SourceInfo = baseSource ?? (item.provider ? { name: item.provider } : null)

  const snippet = item.type === 'video' && item.text ? shortenText(item.text, 4) : null

  const parts: ReactNode[] = []

  if (fallbackSource?.url) {
    try {
      const host = new URL(fallbackSource.url).host.replace(/^www\./, '')
      parts.push(
        <span key="source-link">
          {fallbackSource.name ? `${fallbackSource.name} · ` : ''}
          <a href={fallbackSource.url} target="_blank" rel="noreferrer" className="underline">
            {host}
          </a>
        </span>
      )
    } catch {
      parts.push(
        <span key="source-fallback">{fallbackSource.name || fallbackSource.url}</span>
      )
    }
  } else if (fallbackSource?.name) {
    parts.push(<span key="source-name">{fallbackSource.name}</span>)
  }

  if (snippet) {
    parts.push(<span key="snippet">{snippet}</span>)
  }

  if (!parts.length) return null

  const rendered: ReactNode[] = []
  parts.forEach((part, idx) => {
    if (idx > 0) rendered.push(<span key={`dot-${idx}`} className="opacity-60">·</span>)
    rendered.push(part)
  })

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-[6px]">
      {rendered}
    </span>
  )
}

function shortenText(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/)
  const slice = words.slice(0, maxWords)
  const snippet = slice.join(' ')
  const cleaned = snippet.replace(/[.,!?;:–-]+$/,'')
  return words.length > maxWords ? `${cleaned}…` : cleaned
}

/* ---------------- MODALE principale ---------------- */
export default function RandomModal({
  open,
  onClose,
  onRandomAgain,
  trigger = 0,
  isSecond = false,
  types,
  lang,
  theme,
  children,
  forceItem = null,
}: Props) {
  const { t } = useI18n()
  const [item, setItem] = useState<DisplayItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)

  // Share popover
  const [shareOpen, setShareOpen] = useState(false)
  const [shareAbove, setShareAbove] = useState(false)
  const shareBtnRef = useRef<HTMLButtonElement | null>(null)
  const [buttonBurst, setButtonBurst] = useState(false)
  const burstRef = useRef(true)

  const effectiveTypes = useMemo<ItemType[]>(
    () => (types && types.length ? types : ['image', 'quote', 'fact']),
    [types]
  )

  useEffect(() => {
    if (!open) return
    if (forceItem) {
      setItem(forceItem)
      setError(null)
      setLoading(false)
      return
    }
    if (children) return

    let aborted = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        setItem(null)
        const qs = new URLSearchParams({
          types: effectiveTypes.join(','),
          lang: (lang as string) || 'en',
          t: String(Date.now()),
        })
        const res = await fetch(`/api/random?${qs.toString()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (aborted) return
        setItem(data?.item || null)
      } catch (err: unknown) {
        if (!aborted) {
          const message = err instanceof Error ? err.message : 'error'
          setError(message)
        }
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    load()
    return () => {
      aborted = true
    }
  }, [open, trigger, children, lang, forceItem, effectiveTypes])

  useEffect(() => {
    const current = forceItem ?? item ?? null
    if (current && current.type !== 'encourage') setLiked(isLiked(current))
    else setLiked(false)
  }, [forceItem, item, open])

  useEffect(() => {
    if (!open) {
      burstRef.current = true
      setButtonBurst(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (burstRef.current) {
      burstRef.current = false
      return
    }
    setButtonBurst(true)
    const timer = setTimeout(() => setButtonBurst(false), 520)
    return () => clearTimeout(timer)
  }, [trigger, open])

  // Position dynamique du menu Share
  useEffect(() => {
    if (!shareOpen || !shareBtnRef.current) return
    const rect = shareBtnRef.current.getBoundingClientRect()
    const POPOVER_H = 240 // hauteur estimée
    setShareAbove(rect.bottom + POPOVER_H > window.innerHeight - 16)
  }, [shareOpen])

  function handleRandomAgain() {
    setShareOpen(false)
    if (onRandomAgain) return onRandomAgain()
    setItem((prev) => (prev ? { ...prev } : prev))
  }

  const viewItem: DisplayItem | null = forceItem ?? item ?? null
  const isEncourage = viewItem?.type === 'encourage'
  const showChildren = !viewItem && !!children
  const randomAgainLabel = t('modal.randomAgain', 'RANDOM AGAIN')

  useEffect(() => {
    if (isEncourage && shareOpen) setShareOpen(false)
  }, [isEncourage, shareOpen])

  if (!open) return null

  const LOGO_GAP_MOBILE = 2
  const LOGO_GAP_DESKTOP = 2

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', paddingBottom: 'calc(var(--ad-bar-height, 0px) + 16px)' }}
    >
      <div
        className="relative w-[min(95vw,1000px)] max-h-[80dvh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: theme.bg, color: theme.cream, marginTop: 'clamp(24px, 12vh, 120px)', marginBottom: 'calc(var(--ad-bar-height, 0px) + 24px)' }}
      >
        {/* header */}
        <div className="px-4 py-3 border-b border-white/20 shrink-0">
          <div className="relative flex items-center justify-center">
            <button
              onClick={() => {
                setShareOpen(false)
                onClose()
              }}
              aria-label="Close"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-2xl leading-none"
            >
              ×
            </button>

            <div className="max-w-[calc(100%-48px)]">
              <LogoAnimated
                trigger={trigger}
                toSecond={isSecond}
                fitToWidth
                vhMobile={6}
                vhDesktop={6}
                gapMobile={LOGO_GAP_MOBILE}
                gapDesktop={LOGO_GAP_DESKTOP}
              />
            </div>
          </div>
        </div>

        {/* type / titre */}
        {viewItem && viewItem.type !== 'encourage' && (
          <div className="px-6 pt-2 text-[28px] md:text-[30px] font-inter font-semibold flex items-center justify-center gap-2 shrink-0">
            <MonoIcon
              src={TYPE_ICONS[viewItem.type]}
              color={theme.cream}
              size={30}
            />
            <span style={{ letterSpacing: '.02em' }}>{viewItem.type}</span>
          </div>
        )}

        {/* corps */}
        <div className="px-6 py-5 flex items-center justify-center min-h-[320px] md:min-h-[360px] overflow-y-auto overflow-x-hidden flex-1">
          {viewItem ? (
            <ContentRenderer item={viewItem} theme={theme} />
          ) : showChildren ? (
            children
          ) : loading ? (
            <div className="opacity-80 font-inter">Loading...</div>
          ) : error ? (
            <div className="opacity-80 font-inter">Error</div>
          ) : null}
        </div>

        {/* source */}
        {viewItem && (
          <div className="px-6 pb-3 text-center font-inter italic opacity-90 shrink-0 text-xs md:text-sm leading-relaxed">
            <SourceLine item={viewItem} />
          </div>
        )}

        {/* footer */}
        <div className="border-t border-white/20 px-4 py-4 shrink-0">
          <div className="grid grid-cols-3 items-center">
            <div className="flex items-center gap-4 justify-start">
              {!isEncourage && (
                <button
                  className={`like-button p-2 rounded-full ${liked ? 'liked' : ''}`}
                  aria-label="Like"
                  onClick={() => {
                    if (!viewItem) return
                    if (liked) {
                      removeLike(viewItem)
                      setLiked(false)
                    } else {
                      addLike(viewItem, theme)
                      setLiked(true)
                    }
                    try {
                      window.dispatchEvent(new StorageEvent('storage', { key: 'likes' }))
                    } catch {}
                  }}
                >
                  <MonoIcon
                    src="/icons/Heart.svg"
                    color={liked ? '#ff4d78' : theme.cream}
                    size={28}
                    className="transition-[background-color] duration-300"
                  />
                </button>
              )}

            </div>

            <div className="flex justify-center">
              <button
                className={`px-10 md:px-14 py-2 rounded-[28px] shadow-md hover:scale-[1.03] transition uppercase whitespace-nowrap flex items-center justify-center ${buttonBurst ? 'btn-energized' : ''}`}
                style={{
                  backgroundColor: theme.text,
                  color: theme.cream,
                  fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
                  fontWeight: 700,
                }}
                onClick={handleRandomAgain}
              >
                <span className="sr-only">{randomAgainLabel}</span>
                <AnimatedButtonLabel
                  text={randomAgainLabel}
                  color={theme.cream}
                  trigger={trigger}
                  toSecond={isSecond}
                />
              </button>
            </div>

            <div className="relative flex justify-end">
              {!isEncourage && (
                <>
                  <button
                    ref={shareBtnRef}
                    className="p-2 rounded-full hover:opacity-90"
                    aria-label="Share"
                    onClick={() => setShareOpen((s) => !s)}
                  >
                    <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
                  </button>

                  {shareOpen && (
                    <SharePopover
                      theme={theme}
                      item={viewItem}
                      placeAbove={shareAbove}
                      onClose={() => setShareOpen(false)}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    <style jsx>{`
      .like-button {
        transition: transform 0.3s ease;
      }
      .like-button:hover {
        transform: scale(1.05);
      }
      .like-button.liked {
        transform: scale(1.1);
        animation: heartPulse 0.45s ease;
      }
      .encourage-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: clamp(70px, 16vh, 140px);
        padding-block: clamp(2px, 1.2vh, 12px);
      }
      .encourage-icon {
        width: clamp(70px, 12vw, 140px);
        max-height: clamp(70px, 16vh, 150px);
        max-width: 150px;
        object-fit: contain;
        filter: drop-shadow(0 22px 32px rgba(0, 0, 0, 0.32));
        animation: encourage-pop 520ms cubic-bezier(0.18, 0.89, 0.32, 1.28);
        transform-origin: center;
      }
      @media (min-width: 768px) {
        .encourage-icon-wrapper {
          min-height: clamp(90px, 14vh, 170px);
        }
        .encourage-icon {
          width: clamp(100px, 10vw, 160px);
          max-height: clamp(90px, 14vh, 170px);
          max-width: 170px;
        }
      }
      @keyframes heartPulse {
        0% { transform: scale(1); }
        30% { transform: scale(1.25); }
        60% { transform: scale(0.95); }
        100% { transform: scale(1.1); }
      }
      @keyframes encourage-pop {
        0% {
          opacity: 0;
          transform: scale(0.6) rotate(-6deg);
        }
        60% {
          opacity: 1;
          transform: scale(1.08) rotate(2deg);
        }
        100% {
          opacity: 1;
          transform: scale(1) rotate(0deg);
        }
      }
    `}</style>
    </>
  )
}
