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
  EncourageItem,
  MiniGameItem,
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
const MINIGAME_ICON = '/icons/Game.svg'

type LikeableDisplayItem = Exclude<DisplayItem, EncourageItem | MiniGameItem>

function isLikeableItem(item: DisplayItem | null | undefined): item is LikeableDisplayItem {
  return !!item && item.type !== 'encourage' && item.type !== 'minigame'
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

type FullscreenVideoPayload = {
  kind: 'youtube' | 'dailymotion'
  src: string
  title?: string | null
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
function ContentRenderer({
  item,
  theme,
  fullscreenLabel,
  onOpenFullscreen,
}: {
  item: DisplayItem
  theme: Theme
  fullscreenLabel: string
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
}) {
  if (item.type === 'encourage') {
    return (
      <div key={item.text} className="encourage-modal flex flex-col items-center gap-3 text-center max-w-[58ch]">
        {item.icon ? (
          <div className="encourage-icon-wrapper encourage-icon-glitch">
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
    return (
      <VideoEmbed
        item={item}
        fullscreenLabel={fullscreenLabel}
        onOpenFullscreen={onOpenFullscreen}
      />
    )
  }

  return null
}

const getFullscreenElement = () => {
  if (typeof document === 'undefined') return null
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null
    mozFullScreenElement?: Element | null
    msFullscreenElement?: Element | null
  }
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement || null
}

async function attemptFullscreen(element: HTMLElement | null): Promise<boolean> {
  if (!element) return false
  const anyEl = element as HTMLElement & {
    requestFullscreen?: () => Promise<void>
    webkitRequestFullscreen?: () => void
    msRequestFullscreen?: () => void
    webkitEnterFullscreen?: () => void
  }
  let invoked = false
  try {
    if (typeof anyEl.requestFullscreen === 'function') {
      await anyEl.requestFullscreen()
      invoked = true
    } else if (typeof anyEl.webkitRequestFullscreen === 'function') {
      anyEl.webkitRequestFullscreen()
      invoked = true
    } else if (typeof anyEl.msRequestFullscreen === 'function') {
      anyEl.msRequestFullscreen()
      invoked = true
    } else if (typeof anyEl.webkitEnterFullscreen === 'function') {
      anyEl.webkitEnterFullscreen()
      invoked = true
    }
  } catch {
    invoked = false
  }

  if (!invoked) return false

  await new Promise((resolve) => setTimeout(resolve, 150))
  const fs = getFullscreenElement()
  if (!fs) return false
  if (fs === element) return true
  if (Boolean(fs.contains(element)) || Boolean(element.contains(fs))) return true
  return false
}

function openProviderUrl(url?: string | null) {
  if (!url || typeof window === 'undefined') return
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    /* ignore */
  }
}

const shouldBypassNativeFullscreen = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || navigator.vendor || ''
  const isiOS = /iP(ad|hone|od)/.test(ua)
  const isIpadOnMac = /Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1
  return isiOS || isIpadOnMac
}

function VideoEmbed({
  item,
  fullscreenLabel,
  onOpenFullscreen,
}: {
  item: VideoContentItem
  fullscreenLabel: string
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
}) {
  const provider = (item.provider || '').toLowerCase()
  const url = item.url
  if (!url) return null

  const looksYouTube = provider.includes('youtube') || /youtu\.?be/.test(url)
  const looksDailymotion = !looksYouTube && (provider.includes('dailymotion') || /dailymotion\.com|dai\.ly/.test(url))

  if (looksYouTube) {
    return (
      <YouTubeEmbed
        item={item}
        fullscreenLabel={fullscreenLabel}
        onOpenFullscreen={onOpenFullscreen}
      />
    )
  }

  if (looksDailymotion) {
    return (
      <DailymotionEmbed
        item={item}
        fullscreenLabel={fullscreenLabel}
        onOpenFullscreen={onOpenFullscreen}
      />
    )
  }

  return <HtmlVideoEmbed item={item} />
}

function YouTubeEmbed({
  item,
  fullscreenLabel,
  onOpenFullscreen,
}: {
  item: VideoContentItem
  fullscreenLabel: string
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
}) {
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

  const handleFullscreen = async () => {
    const bypassNative = shouldBypassNativeFullscreen()
    let ok = false
    if (!bypassNative) {
      ok = await attemptFullscreen(iframeRef.current)
    }
    if (ok) return
    if (onOpenFullscreen) {
      onOpenFullscreen({ kind: 'youtube', src, title: text })
    } else {
      openProviderUrl(item.url)
    }
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
        <button
          type="button"
          onClick={handleFullscreen}
          className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
          style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
        >
          {fullscreenLabel}
        </button>
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

function DailymotionEmbed({
  item,
  fullscreenLabel,
  onOpenFullscreen,
}: {
  item: VideoContentItem
  fullscreenLabel: string
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
}) {
  const { url, text } = item
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
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

  const handleFullscreen = async () => {
    const bypassNative = shouldBypassNativeFullscreen()
    let ok = false
    if (!bypassNative) {
      const iframe = iframeRef.current
      ok = (await attemptFullscreen(iframe)) || (await attemptFullscreen(iframe?.parentElement ?? null))
    }

    if (ok) return

    if (onOpenFullscreen) {
      onOpenFullscreen({ kind: 'dailymotion', src, title: text })
    } else {
      openProviderUrl(item.url)
    }
  }

  return (
    <div className="w-full">
      <div className="-mx-6 w-[calc(100%+3rem)]" style={{ aspectRatio: '16 / 9', position: 'relative' }}>
        <iframe
          ref={iframeRef}
          src={src}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title={text || 'Dailymotion'}
          style={{ border: 'none' }}
        />
        <button
          type="button"
          onClick={handleFullscreen}
          className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
          style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
        >
          {fullscreenLabel}
        </button>
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
    const video = videoRef.current
    if (video) {
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      video.setAttribute('x5-playsinline', 'true')
    }
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
          controlsList="nodownload"
          disablePictureInPicture
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
  if (item.type === 'encourage' || item.type === 'minigame') return null
  if (item.type === 'quote' && item.author) return <span>— {item.author}</span>

  const baseSource: SourceInfo =
    'source' in item && item.source ? item.source : null
  const providerName = 'provider' in item && item.provider ? item.provider : null
  const fallbackSource: SourceInfo = baseSource ?? (providerName ? { name: providerName } : null)

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
  const [fullscreenVideo, setFullscreenVideo] = useState<FullscreenVideoPayload | null>(null)

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
    if (isLikeableItem(current)) setLiked(isLiked(current))
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
  const isMiniGame = viewItem?.type === 'minigame'
  const showChildren = !viewItem && !!children
  const randomAgainLabel = t('modal.randomAgain', 'RANDOM AGAIN')
  const fullscreenLabel = t('video.fullscreen', 'Fullscreen')

  const fullscreenSrc = useMemo(() => {
    if (!fullscreenVideo) return ''
    try {
      const base = fullscreenVideo.src.startsWith('http')
        ? fullscreenVideo.src
        : typeof window !== 'undefined'
          ? new URL(fullscreenVideo.src, window.location.origin).toString()
          : fullscreenVideo.src
      const nextUrl = new URL(base)
      if (fullscreenVideo.kind === 'youtube') {
        nextUrl.searchParams.set('autoplay', '1')
        nextUrl.searchParams.set('mute', '0')
      }
      if (fullscreenVideo.kind === 'dailymotion') {
        nextUrl.searchParams.set('autoplay', '1')
        nextUrl.searchParams.set('mute', '0')
      }
      return nextUrl.toString()
    } catch {
      if (fullscreenVideo.kind === 'youtube' && !/mute=0/.test(fullscreenVideo.src)) {
        return fullscreenVideo.src.replace('mute=1', 'mute=0')
      }
      if (fullscreenVideo.kind === 'dailymotion' && !/autoplay=/.test(fullscreenVideo.src)) {
        return fullscreenVideo.src.includes('?')
          ? `${fullscreenVideo.src}&autoplay=1&mute=0`
          : `${fullscreenVideo.src}?autoplay=1&mute=0`
      }
      if (fullscreenVideo.kind === 'dailymotion' && !/mute=0/.test(fullscreenVideo.src)) {
        return fullscreenVideo.src.includes('?')
          ? `${fullscreenVideo.src}&mute=0`
          : `${fullscreenVideo.src}?mute=0`
      }
      return fullscreenVideo.src
    }
  }, [fullscreenVideo])

  const openFullscreen = (payload: FullscreenVideoPayload) => {
    setFullscreenVideo(payload)
  }

  const closeFullscreen = () => {
    setFullscreenVideo(null)
  }

  useEffect(() => {
    if (!fullscreenVideo) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFullscreen()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [fullscreenVideo])

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
              src={viewItem.type === 'minigame' ? MINIGAME_ICON : TYPE_ICONS[viewItem.type as ItemType]}
              color={theme.cream}
              size={30}
            />
            <span style={{ letterSpacing: '.02em' }}>{viewItem.type}</span>
          </div>
        )}

        {/* corps */}
        <div className="px-6 py-5 flex items-center justify-center min-h-[320px] md:min-h-[360px] overflow-y-auto overflow-x-hidden flex-1">
          {viewItem ? (
            <ContentRenderer
              item={viewItem}
              theme={theme}
              fullscreenLabel={fullscreenLabel}
              onOpenFullscreen={openFullscreen}
            />
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
              {!isEncourage && !isMiniGame && (
                <button
                  className={`like-button p-2 rounded-full ${liked ? 'liked' : ''}`}
                  aria-label="Like"
                  onClick={() => {
                    if (!viewItem || !isLikeableItem(viewItem)) return
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

    {fullscreenVideo && (
      <div className="video-fullscreen-overlay" role="dialog" aria-modal="true">
        <div className="video-fullscreen-backdrop" onClick={closeFullscreen} />
        <div className="video-fullscreen-frame">
          <button
            type="button"
            aria-label="Close video"
            className="video-fullscreen-close"
            onClick={closeFullscreen}
          >
            ×
          </button>
          <div className="video-fullscreen-player">
            {fullscreenVideo.kind === 'youtube' ? (
              <iframe
                key={`yt-${fullscreenSrc}`}
                src={fullscreenSrc || fullscreenVideo.src}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                title={fullscreenVideo.title || 'Video'}
              />
            ) : (
              <iframe
                key={`dm-${fullscreenSrc}`}
                src={fullscreenSrc || fullscreenVideo.src}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                title={fullscreenVideo.title || 'Video'}
              />
            )}
          </div>
        </div>
      </div>
    )}

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
        padding-block: clamp(4px, 1vh, 12px);
        min-height: clamp(110px, 26vh, 230px);
        position: relative;
        overflow: visible;
      }
      .encourage-icon {
        width: auto;
        max-width: clamp(190px, 60vw, 320px);
        height: clamp(160px, 38vh, 280px);
        object-fit: contain;
        filter: drop-shadow(0 36px 48px rgba(0, 0, 0, 0.45));
        transform-origin: center;
        position: relative;
        z-index: 5;
      }
      .encourage-icon-wrapper::before,
      .encourage-icon-wrapper::after {
        content: '';
        position: absolute;
        inset: -16%;
        border-radius: 30px;
        mix-blend-mode: screen;
        pointer-events: none;
        opacity: 0;
        z-index: 4;
      }
      .encourage-icon-wrapper::before {
        background: repeating-linear-gradient(90deg, rgba(0, 255, 255, 0.92) 0 12px, rgba(0, 255, 255, 0) 12px 24px);
      }
      .encourage-icon-wrapper::after {
        background: repeating-linear-gradient(0deg, rgba(255, 0, 150, 0.88) 0 16px, rgba(123, 104, 238, 0) 16px 32px);
      }
      @media (min-width: 768px) {
        .encourage-icon-wrapper {
          min-height: clamp(180px, 24vh, 320px);
        }
        .encourage-icon {
          max-width: clamp(300px, 46vw, 420px);
          height: clamp(260px, 36vh, 380px);
        }
        .encourage-icon-wrapper::before,
        .encourage-icon-wrapper::after {
          inset: -18%;
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
      .encourage-modal .encourage-icon-wrapper::before {
        animation: encourage-glitch-before 2200ms steps(8, end);
      }
      .encourage-modal .encourage-icon-wrapper::after {
        animation: encourage-glitch-after 2200ms steps(8, end);
      }
      .encourage-modal .encourage-icon {
        animation: encourage-pop 520ms cubic-bezier(0.18, 0.89, 0.32, 1.28), encourage-shift 2200ms steps(8, end), encourage-flicker 2200ms linear;
      }
      @keyframes encourage-glitch-before {
        0% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
        10% { opacity: 1; transform: translate(-38px, 24px) scale(1.14) skewX(-10deg); filter: blur(4.4px) saturate(2.2); }
        26% { opacity: 0.85; transform: translate(32px, -22px) scale(0.92) skewX(8deg); filter: blur(3.4px); }
        44% { opacity: 0.6; transform: translate(-26px, 18px) scale(1.08) skewX(-6deg); filter: blur(2.6px); }
        64% { opacity: 0.38; transform: translate(20px, -14px) scale(0.96) skewX(4deg); filter: blur(1.9px); }
        84% { opacity: 0.24; transform: translate(-16px, 10px) scale(1.04) skewX(-3deg); filter: blur(1.3px); }
        100% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
      }
      @keyframes encourage-glitch-after {
        0% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
        14% { opacity: 0.95; transform: translate(44px, -30px) scale(1.12) skewX(11deg); filter: blur(4px) saturate(2.2); }
        32% { opacity: 0.72; transform: translate(-34px, 26px) scale(0.9) skewX(-9deg); filter: blur(3.2px); }
        52% { opacity: 0.48; transform: translate(26px, -20px) scale(1.08) skewX(6deg); filter: blur(2.3px); }
        74% { opacity: 0.3; transform: translate(-20px, 14px) scale(0.95) skewX(-4deg); filter: blur(1.6px); }
        92% { opacity: 0.18; transform: translate(16px, -10px) scale(1.05) skewX(3deg); filter: blur(1.1px); }
        100% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
      }
      @keyframes encourage-shift {
        0% { transform: translate3d(0,0,0); }
        20% { transform: translate3d(-32px, 22px, 0); }
        40% { transform: translate3d(26px, -18px, 0); }
        60% { transform: translate3d(-22px, 16px, 0); }
        80% { transform: translate3d(18px, -13px, 0); }
        100% { transform: translate3d(0,0,0); }
      }
      @keyframes encourage-flicker {
        0%, 100% { filter: drop-shadow(0 36px 48px rgba(0, 0, 0, 0.45)) brightness(1); }
        14% { filter: drop-shadow(0 42px 56px rgba(0, 0, 0, 0.52)) brightness(1.95); }
        32% { filter: drop-shadow(0 34px 46px rgba(0, 0, 0, 0.42)) brightness(1.35); }
        54% { filter: drop-shadow(0 44px 60px rgba(0, 0, 0, 0.55)) brightness(1.75); }
        76% { filter: drop-shadow(0 38px 52px rgba(0, 0, 0, 0.48)) brightness(1.4); }
        92% { filter: drop-shadow(0 32px 44px rgba(0, 0, 0, 0.38)) brightness(1.85); }
      }
      .video-fullscreen-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .video-fullscreen-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(4, 5, 16, 0.92);
      }
      .video-fullscreen-frame {
        position: relative;
        width: min(960px, 96vw);
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
        z-index: 1;
        display: flex;
        align-items: stretch;
        justify-content: center;
      }
      .video-fullscreen-player {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .video-fullscreen-player iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
      .video-fullscreen-close {
        position: absolute;
        top: 12px;
        right: 16px;
        height: 36px;
        width: 36px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        font-size: 26px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        border: none;
        cursor: pointer;
      }
      .video-fullscreen-close:hover {
        background: rgba(0, 0, 0, 0.8);
      }
      @media (max-width: 768px) {
        .video-fullscreen-frame {
          width: 100vw;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
        .video-fullscreen-close {
          top: 16px;
          right: 18px;
          background: rgba(0, 0, 0, 0.75);
        }
      }
    `}</style>
    </>
  )
}
