'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'

import AnimatedButtonLabel from '@/components/AnimatedButtonLabel'
import { FactQuizCard } from '@/components/RandomContentRenderer'
import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ShareMenu from '@/components/ShareMenu'
import ShufflePicker from '@/components/ShufflePicker'
import { useI18n } from '@/providers/I18nProvider'
import { useScore } from '@/providers/ScoreProvider'
import { THEMES } from '@/lib/theme'
import { fetchRandom, type RandomTypes } from '@/lib/api'
import type { ItemType } from '@/lib/random/types'
import type {
  FactItem,
  FactQuizItem,
  DisplayItem,
  EncourageItem as EncourageContentItem,
  RandomContentItem,
  SourceInfo,
  VideoItem as VideoContentItem,
} from '@/lib/random/clientTypes'
import { addLike, isLiked, removeLike } from '@/utils/likes'
import { playAgain, playRandom } from '@/utils/sound'

const TYPE_ICONS: Record<ItemType, string> = {
  image: '/icons/image.svg',
  video: '/icons/Video.svg',
  web: '/icons/web.svg',
  quote: '/icons/quote.svg',
  joke: '/icons/joke.svg',
  fact: '/icons/fact.svg',
}

const FIXED_SEQUENCE: ItemType[] = [
  'image',
  'video',
  'joke',
  'video',
  'image',
  'web',
  'quote',
  'image',
  'video',
  'fact',
  'image',
  'video',
  'web',
]

const ENCOURAGE_GROUP_SIZE = 5
const ENCOURAGE_ICON_TOTAL = 30
const ENCOURAGE_INTERVALS = [15, 15, 20, 15, 20, 15]

const PRELOAD_TARGET_PER_TYPE = 4
const RECENT_SESSION_LIMIT = 10
const ALL_ITEM_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']

const FALLBACK_ENCOURAGE_MESSAGES = [
  'Keep exploring forward.',
  'Push beyond the familiar.',
  'The next layer awaits.',
  'Dive further into the odd.',
  'Unlock another surprise.',
]

const GLITCH_COLOR_SETS: Array<[string, string, string]> = [
  ['#22FF9C', '#00E1FF', '#FFFFFF'],
  ['#FF005C', '#FF8A00', '#FFE500'],
  ['#42FF73', '#00B2FF', '#FF3AFB'],
  ['#00E8FF', '#2D6BFF', '#FFFFFF'],
  ['#FF0066', '#FF2FD2', '#00FFE5'],
  ['#ADFF00', '#00FFE3', '#FFFC00'],
]

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

type GlitchBar = {
  id: string
  top: string
  width: string
  left: string
  height: string
  background: string
  delay: number
  duration: number
  shift: string
  opacity: number
}

type GlitchBarStyle = CSSProperties & {
  ['--glitch-bar-shift']?: string
}

type FullscreenVideoPayload = {
  kind: 'youtube' | 'dailymotion'
  src: string
  title?: string | null
}


function parseTypesParam(value: string | string[] | undefined): ItemType[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value.join(',') : value
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is ItemType => ALL_ITEM_TYPES.includes(entry as ItemType))
}

type EncourageItem = EncourageContentItem

type SequenceSlot =
  | { kind: 'content'; itemType: ItemType }
  | { kind: 'encourage'; round: number; encourageIndex: number }

type ThemeStyle = CSSProperties & { ['--theme-cream']?: string }
type EncourageStyle = CSSProperties & { ['--encourage-height']?: string }

type Lang = 'en' | 'fr' | 'de' | 'jp'

const shuffleArray = <T,>(arr: T[]): T[] => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

const randIdx = (max: number) => Math.floor(Math.random() * max)

function randDiffIdx(max: number, not: number) {
  if (max <= 1) return 0
  let i = randIdx(max)
  if (i === not) i = (i + 1 + randIdx(max - 1)) % max
  return i
}

function shortenText(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/)
  const slice = words.slice(0, maxWords)
  const snippet = slice.join(' ')
  const cleaned = snippet.replace(/[.,!?;:–-]+$/, '')
  return words.length > maxWords ? `${cleaned}…` : cleaned
}

function SourceLine({ item }: { item: DisplayItem }) {
  if (item.type === 'encourage') return null
  if (item.type === 'quote' && item.author) return <span>— {item.author}</span>

  const baseSource: SourceInfo = item.source ?? null
  const fallbackSource: SourceInfo = baseSource ?? (item.provider ? { name: item.provider } : null)

  const snippet = item.type === 'video' && item.text ? shortenText(item.text, 5) : null

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

function ImageBlock({
  src,
  alt,
  height,
}: {
  src: string
  alt?: string
  height: string
}) {
  return (
    <div
      className="overflow-hidden"
      style={{ height, width: '100%' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || 'image'}
        className="block h-full w-full object-cover select-none"
        loading="lazy"
        decoding="async"
      />
    </div>
  )
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

  // wait a tick to allow fullscreen state to update
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
  frameHeight,
  fullscreenLabel,
  openExternallyLabel,
  disableFullscreen,
  onOpenFullscreen,
}: {
  item: VideoContentItem
  frameHeight: string
  fullscreenLabel: string
  openExternallyLabel: string
  disableFullscreen: boolean
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
        frameHeight={frameHeight}
        fullscreenLabel={fullscreenLabel}
        openExternallyLabel={openExternallyLabel}
        disableFullscreen={disableFullscreen}
        onFullscreenFallback={onOpenFullscreen}
      />
    )
  }

  if (looksDailymotion) {
    return (
      <DailymotionEmbed
        item={item}
        frameHeight={frameHeight}
        fullscreenLabel={fullscreenLabel}
        openExternallyLabel={openExternallyLabel}
        disableFullscreen={disableFullscreen}
        onFullscreenFallback={onOpenFullscreen}
      />
    )
  }

  return <HtmlVideoEmbed item={item} frameHeight={frameHeight} />
}

function YouTubeEmbed({
  item,
  frameHeight,
  fullscreenLabel,
  openExternallyLabel,
  disableFullscreen,
  onFullscreenFallback,
}: {
  item: VideoContentItem
  frameHeight: string
  fullscreenLabel: string
  openExternallyLabel: string
  disableFullscreen: boolean
  onFullscreenFallback?: (payload: FullscreenVideoPayload) => void
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
      playsinline: '1',
      modestbranding: '1',
      enablejsapi: '1',
    })
    if (originParam) params.set('origin', originParam)
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
  }, [videoId, originParam])

  const unmute = () => {
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
    if (disableFullscreen) {
      openProviderUrl(item.url)
      return
    }
    const bypassNative = shouldBypassNativeFullscreen()
    let ok = false
    if (!bypassNative) {
      ok = await attemptFullscreen(iframeRef.current)
    }
    if (ok) return
    if (onFullscreenFallback) {
      onFullscreenFallback({ kind: 'youtube', src, title: text })
    } else {
      openProviderUrl(item.url)
    }
  }

  return (
    <div className="w-full h-full" style={{ position: 'relative', height: frameHeight }}>
      <div
        className="w-full h-full"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: frameHeight,
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          className="absolute top-1/2 left-1/2"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          title={text || 'Video'}
          style={{
            border: 'none',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {!disableFullscreen ? (
          <button
            type="button"
            onClick={handleFullscreen}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            {fullscreenLabel}
          </button>
        ) : null}
        {disableFullscreen ? (
          <button
            type="button"
            onClick={handleFullscreen}
            className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 hover:bg-white/25"
            style={{ pointerEvents: 'auto' }}
          >
            {openExternallyLabel}
          </button>
        ) : null}
        {isMuted ? (
          <button
            type="button"
            onClick={unmute}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '12px', right: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            Tap to unmute
          </button>
        ) : null}
      </div>
    </div>
  )
}

function DailymotionEmbed({
  item,
  frameHeight,
  fullscreenLabel,
  openExternallyLabel,
  disableFullscreen,
  onFullscreenFallback,
}: {
  item: VideoContentItem
  frameHeight: string
  fullscreenLabel: string
  openExternallyLabel: string
  disableFullscreen: boolean
  onFullscreenFallback?: (payload: FullscreenVideoPayload) => void
}) {
  const { url, text } = item
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const embedUrl = useMemo(() => {
    try {
      const u = new URL(url)
      let videoId = u.pathname.split('/').pop() || ''
      if (!videoId && u.hostname === 'dai.ly') {
        videoId = u.pathname.replace('/', '')
      }
      const params = new URLSearchParams()
      params.set('autoplay', '1')
      params.set('mute', '1')
      params.set('controls', '1')
      params.set('queue-enable', '0')
      params.set('sharing-enable', '0')
      params.set('ui-logo', '0')
      params.set('quality', '480')
      params.set('playsinline', '1')
      if (disableFullscreen) {
        params.set('fullscreen-enable', '0')
        params.set('fullscreen-action', 'app')
      }
      return videoId
        ? `https://www.dailymotion.com/embed/video/${videoId}?${params.toString()}`
        : url
    } catch {
      return url
    }
  }, [disableFullscreen, url])

  const handleFullscreen = async () => {
    if (disableFullscreen) {
      openProviderUrl(item.url)
      return
    }
    const bypassNative = shouldBypassNativeFullscreen()
    let ok = false
    if (!bypassNative) {
      const iframe = iframeRef.current
      ok = (await attemptFullscreen(iframe)) || (await attemptFullscreen(iframe?.parentElement ?? null))
    }
    if (ok) return
    if (onFullscreenFallback) {
      onFullscreenFallback({ kind: 'dailymotion', src: embedUrl, title: text })
    } else {
      openProviderUrl(item.url)
    }
  }

  return (
    <div className="w-full h-full" style={{ position: 'relative', height: frameHeight }}>
      <div
        className="w-full h-full"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: frameHeight,
        }}
      >
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="absolute top-1/2 left-1/2"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title={text || 'Video'}
          style={{
            border: 'none',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {!disableFullscreen ? (
          <button
            type="button"
            onClick={handleFullscreen}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            {fullscreenLabel}
          </button>
        ) : null}
        {disableFullscreen ? (
          <button
            type="button"
            onClick={handleFullscreen}
            className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 hover:bg-white/25"
            style={{ pointerEvents: 'auto' }}
          >
            {openExternallyLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function HtmlVideoEmbed({ item, frameHeight }: { item: VideoContentItem; frameHeight: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const shouldAutoPlay = useMemo(() => {
    const provider = (item.provider || '').toLowerCase()
    return provider.includes('pixabay') || provider.includes('pexels')
  }, [item.provider])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.setAttribute('x5-playsinline', 'true')
    if (shouldAutoPlay) {
      video.muted = true
      const playPromise = video.play()
      if (playPromise) playPromise.catch(() => undefined)
    } else {
      video.pause()
    }
  }, [item.url, shouldAutoPlay])

  return (
    <div className="w-full h-full" style={{ position: 'relative', height: frameHeight }}>
      <div
        className="w-full h-full"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: frameHeight,
        }}
      >
        <video
          ref={videoRef}
          controls
          playsInline
          autoPlay={shouldAutoPlay}
          muted={shouldAutoPlay}
          className="absolute top-1/2 left-1/2"
          style={{
            backgroundColor: '#000',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
          }}
          poster={item.thumbUrl ?? undefined}
          controlsList="nodownload"
          disablePictureInPicture
        >
          <source src={item.url} />
        </video>
      </div>
    </div>
  )
}

function ContentRenderer({
  item,
  theme,
  frameHeight,
  viewportWidth,
  fullscreenLabel,
  openExternallyLabel,
  disableFullscreen,
  onOpenFullscreen,
}: {
  item: DisplayItem
  theme: { cream: string; text: string; deep: string; bg: string }
  frameHeight: string
  viewportWidth: number | null
  fullscreenLabel: string
  openExternallyLabel: string
  disableFullscreen: boolean
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
}) {
  if (item.type === 'encourage') {
    const encourageStyle: EncourageStyle = {
      height: '100%',
      '--encourage-height': frameHeight,
    }
    const desktop = viewportWidth != null && viewportWidth >= 1024
    const tablet = viewportWidth != null && viewportWidth >= 768 && viewportWidth < 1024
    const iconMaxHeight = desktop ? '60vh' : tablet ? '32vh' : '33vh'
    const iconMaxWidth = desktop
      ? 'min(780px, 60vw)'
      : tablet
        ? 'min(320px, 50vw)'
        : 'min(280px, 70vw)'
    return (
      <div key={item.text} className="h-full w-full px-5 sm:px-8" style={encourageStyle}>
        <div className="encourage-layout encourage-active flex h-full w-full flex-col items-center justify-center gap-4 text-center md:flex-row md:items-center md:justify-center">
          {item.icon ? (
            <div
              className="encourage-icon-wrapper encourage-icon-glitch"
              style={{
                maxWidth: iconMaxWidth,
                width: iconMaxWidth,
                height: iconMaxHeight,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.icon}
                alt="Encouragement"
                className="encourage-icon"
                loading="lazy"
                decoding="async"
                style={{
                  height: '100%',
                  width: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : null}
          {item.text ? (
            <div className="encourage-copy-wrapper">
              <p
                className="encourage-copy font-tomorrow font-bold leading-snug"
                style={{ color: theme.cream, letterSpacing: '.01em' }}
              >
                {item.text}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (item.type === 'image') {
    const src = item.url || item.thumbUrl || ''
    if (!src) return null
    const alt = item.title || 'image'

    return (
      <div className="h-full w-full flex items-center justify-center" style={{ height: '100%' }}>
        <ImageBlock src={src} alt={alt} height={frameHeight} />
      </div>
    )
  }

  if (item.type === 'quote') {
    const disclaimer = item.disclaimer || (item.ai?.source ? `Généré par IA – ${item.ai.source}` : null)
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center" style={{ height: '100%' }}>
        <blockquote
          className="max-w-[80ch] font-tomorrow font-bold text-[22px] md:text-[32px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          “{item.text}”
        </blockquote>
        {item.author ? (
          <p className="mt-3 text-sm font-inter opacity-80" style={{ color: theme.cream }}>
            — {item.author}
          </p>
        ) : null}
        {disclaimer ? (
          <p className="mt-3 text-xs font-inter opacity-75" style={{ color: theme.cream }}>
            {disclaimer}
          </p>
        ) : null}
      </div>
    )
  }

  if (item.type === 'fact') {
    const fact = item as FactItem
    if (fact.variant === 'quiz') {
      return (
        <div
          className="h-full w-full px-4"
          style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <FactQuizCard item={fact as FactQuizItem} theme={theme} />
        </div>
      )
    }
    const disclaimer = fact.disclaimer || (fact.ai?.source ? `Généré par IA – ${fact.ai.source}` : null)
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center" style={{ height: '100%' }}>
        <p
          className="max-w-[85ch] font-tomorrow font-bold text-[20px] md:text-[28px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          {fact.text}
        </p>
        {disclaimer ? (
          <p className="mt-3 text-xs font-inter opacity-75" style={{ color: theme.cream }}>
            {disclaimer}
          </p>
        ) : null}
      </div>
    )
  }

  if (item.type === 'joke') {
    const disclaimer = item.disclaimer || (item.ai?.source ? `Généré par IA – ${item.ai.source}` : null)
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center" style={{ height: '100%' }}>
        <p
          className="max-w-[85ch] font-tomorrow font-bold text-[20px] md:text-[28px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          {item.text}
        </p>
        {disclaimer ? (
          <div
            className="mt-3 max-w-sm px-3 py-2 text-xs"
            style={{
              backgroundColor: '#b1001f',
              color: '#fff5f5',
              fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {disclaimer}
          </div>
        ) : null}
      </div>
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
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ height: '100%' }}
      >
        {item.ogImage ? (
          <ImageBlock src={item.ogImage} alt={item.text || host || 'web'} height={frameHeight} />
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline font-inter text-xl md:text-2xl break-words"
            style={{ color: theme.cream }}
          >
            {item.text || host || href}
          </a>
        ) : (
          <p
            className="font-inter text-lg md:text-xl"
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
        frameHeight={frameHeight}
        fullscreenLabel={fullscreenLabel}
        openExternallyLabel={openExternallyLabel}
        disableFullscreen={disableFullscreen}
        onOpenFullscreen={onOpenFullscreen}
      />
    )
  }

  return null
}

function BurgerIcon({ color, glitch = false }: { color: string; glitch?: boolean }) {
  return (
    <span
      className={`inline-flex flex-col justify-between h-5 w-7 burger-icon${glitch ? ' burger-icon--glitch' : ''}`}
      aria-hidden
    >
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
    </span>
  )
}

export default function RandomExperiencePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { dict, locale, locales, setLocale, t } = useI18n()
  const { addAction, maybeSpawnDiamond } = useScore()

  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [shuffleOpen, setShuffleOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const typesFromParams = parseTypesParam(searchParams?.types)
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>(
    typesFromParams.length ? typesFromParams : ALL_ITEM_TYPES
  )
  const [sequenceVersion, setSequenceVersion] = useState(0)
  const [themeIdx, setThemeIdx] = useState(() => randIdx(THEMES.length))
  const [currentItem, setCurrentItem] = useState<DisplayItem | null>(null)
  const [trigger, setTrigger] = useState(0)
  const [isSecond, setIsSecond] = useState(false)
  const [liked, setLiked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const [heartGlitch, setHeartGlitch] = useState(false)
  const [pageGlitchActive, setPageGlitchActive] = useState(false)
  const [pageGlitchBars, setPageGlitchBars] = useState<GlitchBar[]>(() => [])
  const [fullscreenVideo, setFullscreenVideo] = useState<FullscreenVideoPayload | null>(null)
  const [disableFullscreenButton, setDisableFullscreenButton] = useState(false)
  const shouldForceMutedAutoplay = useMemo(() => {
    if (typeof window === 'undefined') return false
    const ua = (navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || '').toString()
    const isIOS = /iPad|iPhone|iPod/.test(ua)
    const isAndroid = /Android/i.test(ua)
    // Autoplay with sound is blocked on most mobile browsers; mute to allow auto-play.
    return isIOS || isAndroid
  }, [])
  const fullscreenSrc = useMemo(() => {
    if (!fullscreenVideo) return ''
    const muteValue = shouldForceMutedAutoplay ? '1' : '0'
    try {
      const base = fullscreenVideo.src.startsWith('http')
        ? fullscreenVideo.src
        : typeof window !== 'undefined'
          ? new URL(fullscreenVideo.src, window.location.origin).toString()
          : fullscreenVideo.src
      const url = new URL(base)
      if (fullscreenVideo.kind === 'youtube') {
        url.searchParams.set('autoplay', '1')
        url.searchParams.set('playsinline', '1')
        url.searchParams.set('mute', muteValue)
      }
      if (fullscreenVideo.kind === 'dailymotion') {
        url.searchParams.set('autoplay', '1')
        url.searchParams.set('mute', muteValue)
        url.searchParams.set('playsinline', '1')
      }
      return url.toString()
    } catch {
      if (fullscreenVideo.kind === 'youtube') {
        let src = fullscreenVideo.src
        if (!/autoplay=/.test(src)) {
          src = src.includes('?') ? `${src}&autoplay=1` : `${src}?autoplay=1`
        }
        if (!/playsinline=/.test(src)) {
          src = src.includes('?') ? `${src}&playsinline=1` : `${src}?playsinline=1`
        }
        if (shouldForceMutedAutoplay) {
          if (/mute=0/.test(src)) src = src.replace('mute=0', 'mute=1')
          else if (!/mute=/.test(src)) src = `${src}&mute=1`
        } else {
          if (/mute=1/.test(src)) src = src.replace('mute=1', 'mute=0')
          else if (!/mute=/.test(src)) src = `${src}&mute=0`
        }
        return src
      }
      if (fullscreenVideo.kind === 'dailymotion') {
        let src = fullscreenVideo.src
        if (!/autoplay=/.test(src)) src = src.includes('?') ? `${src}&autoplay=1` : `${src}?autoplay=1`
        if (!/playsinline=/.test(src)) src = src.includes('?') ? `${src}&playsinline=1` : `${src}?playsinline=1`
        if (shouldForceMutedAutoplay) {
          if (/mute=0/.test(src)) src = src.replace('mute=0', 'mute=1')
          else if (!/mute=/.test(src)) src = `${src}&mute=1`
        } else {
          if (/mute=1/.test(src)) src = src.replace('mute=1', 'mute=0')
          else if (!/mute=/.test(src)) src = `${src}&mute=0`
        }
        return src
      }
      return fullscreenVideo.src
    }
  }, [fullscreenVideo, shouldForceMutedAutoplay])

  const theme = THEMES[themeIdx]
  const contentHeight = useMemo(() => {
    const base = 'clamp(260px, 45vh, 560px)'
    if (viewportWidth == null) return base
    if (viewportWidth >= 1400) return 'clamp(357px, 61vh, 697px)'
    if (viewportWidth >= 1200) return 'clamp(323px, 57.8vh, 646px)'
    if (viewportWidth >= 992) return 'clamp(289px, 53vh, 595px)'
    if (viewportWidth >= 768) return 'clamp(300px, 55vh, 640px)'
    return base
  }, [viewportWidth])

  const contentFrameStyle = useMemo(() => ({
    height: contentHeight,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: theme.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }), [contentHeight, theme.bg])

  useEffect(() => {
    setDisableFullscreenButton(shouldBypassNativeFullscreen())
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setViewportWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  useEffect(() => {
    if (typesFromParams.length) return
    try {
      const stored = localStorage.getItem('random:selectedTypes')
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      const filtered = parsed.filter((entry: unknown): entry is ItemType => ALL_ITEM_TYPES.includes(entry as ItemType))
      if (filtered.length) setSelectedTypes(filtered)
    } catch {
      /* ignore */
    }
  }, [typesFromParams.length])

  useEffect(() => {
    try {
      localStorage.setItem('random:selectedTypes', JSON.stringify(selectedTypes))
    } catch {
      /* ignore */
    }
  }, [selectedTypes])

  const navLabels = useMemo(() => ({
    images: t('nav.images', 'images'),
    videos: t('nav.videos', 'videos'),
    web: t('nav.web', 'web'),
    quotes: t('nav.quotes', 'quotes'),
    jokes: t('nav.jokes', 'funny jokes'),
    facts: t('nav.facts', 'facts'),
    encourage: t('nav.encourage', 'keep going'),
  }), [t])

  const shareLabel = useMemo(() => t('modal.share', 'Share'), [t])
  const likeLabel = useMemo(() => t('modal.like', 'Like'), [t])
  const randomAgainLabel = useMemo(() => t('modal.randomAgain', 'RANDOM AGAIN'), [t])
  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const fullscreenLabel = useMemo(() => t('video.fullscreen', 'Fullscreen'), [t])
  const openExternallyLabel = useMemo(() => t('video.openExternally', 'Open in app'), [t])

  const langVersionRef = useRef(0)
  const encourageQueueRef = useRef<string[]>([])
const sequenceStateRef = useRef({
  step: 0,
  round: 0,
  encourage: 0,
  draws: 0,
  sinceEncourage: 0,
  currentInterval: ENCOURAGE_INTERVALS[0] ?? 15,
  intervalIndex: 0,
})
  const burgerGlitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartGlitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageGlitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const makePageGlitchBars = useCallback((mode: 'normal' | 'boost' = 'normal'): GlitchBar[] => {
    const count = mode === 'boost' ? randomInt(18, 28) : randomInt(5, 9)
    const stamp = Date.now()

    const gradientForSet = (colors: [string, string, string]) => {
      const [c1, c2, c3] = colors
      const stopA = randomBetween(22, 38)
      const stopB = randomBetween(stopA + 8, 88)
      return `linear-gradient(90deg, ${c1} 0% ${stopA.toFixed(0)}%, ${c2} ${stopA.toFixed(0)}% ${stopB.toFixed(0)}%, ${c3} ${stopB.toFixed(0)}% 100%)`
    }

    return Array.from({ length: count }, (_, index) => {
      const palette = GLITCH_COLOR_SETS[randIdx(GLITCH_COLOR_SETS.length)]
      const wideThreshold = mode === 'boost' ? 4 : 2
      const wideChance = mode === 'boost' ? 0.7 : 0.45
      const wide = index < wideThreshold || Math.random() < wideChance
      const widthValue = wide
        ? randomBetween(mode === 'boost' ? 64 : 58, mode === 'boost' ? 112 : 98)
        : randomBetween(14, mode === 'boost' ? 58 : 46)
      const maxLeft = Math.max(-6, 100 - widthValue)
      const leftValue = randomBetween(-6, maxLeft)
      const topValue = randomBetween(4, 94)
      const heightValue = wide
        ? randomBetween(mode === 'boost' ? 8 : 6, mode === 'boost' ? 12 : 9)
        : randomBetween(1.6, mode === 'boost' ? 5.2 : 4.4)
      const delay = Math.round(randomBetween(0, mode === 'boost' ? 160 : 120))
      const duration = Math.round(randomBetween(mode === 'boost' ? 260 : 220, mode === 'boost' ? 380 : 340))
      const shiftValue = mode === 'boost'
        ? randomBetween(wide ? 18 : 10, wide ? 30 : 18)
        : randomBetween(wide ? 12 : 6, wide ? 20 : 14)
      const opacity = parseFloat(
        randomBetween(wide ? 0.82 : 0.58, mode === 'boost' ? 0.97 : 0.92).toFixed(2)
      )

      return {
        id: `${stamp}-${index}-${Math.random().toString(16).slice(2, 6)}`,
        top: `${topValue.toFixed(2)}%`,
        width: `${widthValue.toFixed(2)}%`,
        left: `${leftValue.toFixed(2)}%`,
        height: `${heightValue.toFixed(1)}px`,
        background: gradientForSet(palette),
        delay,
        duration,
        shift: `${shiftValue.toFixed(1)}px`,
        opacity,
      }
    })
  }, [])

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerGlitchTimeoutRef.current) clearTimeout(burgerGlitchTimeoutRef.current)
    burgerGlitchTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 380)
  }, [])

  const triggerHeartGlitch = useCallback(() => {
    setHeartGlitch(true)
    if (heartGlitchTimeoutRef.current) clearTimeout(heartGlitchTimeoutRef.current)
    heartGlitchTimeoutRef.current = setTimeout(() => setHeartGlitch(false), 420)
  }, [])

  const triggerPageGlitch = useCallback((mode: 'normal' | 'boost' = 'normal') => {
    const bars = makePageGlitchBars(mode)
    setPageGlitchBars(bars)
    setPageGlitchActive(true)
    if (pageGlitchTimeoutRef.current) clearTimeout(pageGlitchTimeoutRef.current)
    const longest = bars.reduce((max, bar) => Math.max(max, bar.duration + bar.delay), 0)
    const base = mode === 'boost' ? 420 : 320
    const tail = mode === 'boost' ? 180 : 120
    const total = Math.max(base, (longest || base) + tail)
    pageGlitchTimeoutRef.current = setTimeout(() => setPageGlitchActive(false), total)
  }, [makePageGlitchBars])

  const openFullscreen = useCallback((payload: FullscreenVideoPayload) => {
    setFullscreenVideo(payload)
  }, [])

  const closeFullscreen = useCallback(() => setFullscreenVideo(null), [])

  useEffect(() => {
    const initial = randIdx(THEMES.length)
    setThemeIdx(initial)
  }, [])

  useEffect(() => {
    return () => {
      if (burgerGlitchTimeoutRef.current) clearTimeout(burgerGlitchTimeoutRef.current)
      if (heartGlitchTimeoutRef.current) clearTimeout(heartGlitchTimeoutRef.current)
      if (pageGlitchTimeoutRef.current) clearTimeout(pageGlitchTimeoutRef.current)
    }
  }, [])

  const encourageMessages = useMemo(() => {
    const fallback = FALLBACK_ENCOURAGE_MESSAGES
    if (!dict || typeof dict !== 'object') return fallback
    const dictionary = dict as Record<string, unknown>
    const encourageBlock = dictionary.encourage as { messages?: unknown }
    const candidate = encourageBlock?.messages
    if (!Array.isArray(candidate)) return fallback
    const cleaned = candidate.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    return cleaned.length ? cleaned : fallback
  }, [dict])

  useEffect(() => {
    encourageQueueRef.current = shuffleArray(encourageMessages)
  }, [encourageMessages])

  useEffect(() => {
    if (!fullscreenVideo) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [closeFullscreen, fullscreenVideo])

  useEffect(() => {
    if (fullscreenVideo) closeFullscreen()
  }, [closeFullscreen, fullscreenVideo, trigger])

  const pickEncourageMessage = useCallback(() => {
    if (!encourageQueueRef.current.length) {
      encourageQueueRef.current = shuffleArray(encourageMessages)
    }
    return encourageQueueRef.current.shift() ?? FALLBACK_ENCOURAGE_MESSAGES[0]
  }, [encourageMessages])

  const pickEncourageIcon = useCallback((encourageIndex: number) => {
    const groups = Math.max(1, Math.ceil(ENCOURAGE_ICON_TOTAL / ENCOURAGE_GROUP_SIZE))
    const bucket = Math.min(encourageIndex - 1, groups - 1)
    const start = bucket * ENCOURAGE_GROUP_SIZE + 1
    const end = Math.min(start + ENCOURAGE_GROUP_SIZE - 1, ENCOURAGE_ICON_TOTAL)
    const span = Math.max(1, end - start + 1)
    return `/encourage/${start + Math.floor(Math.random() * span)}.png`
  }, [])

  const buildEncourageItem = useCallback((encourageIndex: number): EncourageItem => ({
    type: 'encourage',
    text: pickEncourageMessage(),
    icon: pickEncourageIcon(encourageIndex),
  }), [pickEncourageIcon, pickEncourageMessage])

  const filteredSequence = useMemo(() => {
    return FIXED_SEQUENCE.filter((type) => selectedTypes.includes(type))
  }, [selectedTypes])

  const resetSequence = useCallback(() => {
    sequenceStateRef.current = {
      step: 0,
      round: 0,
      encourage: 0,
      draws: 0,
      sinceEncourage: 0,
      currentInterval: ENCOURAGE_INTERVALS[0] ?? 15,
      intervalIndex: 0,
    }
    setSequenceVersion((v) => v + 1)
  }, [])

  const getNextSlot = useCallback((): SequenceSlot => {
    const seq = filteredSequence
    if (!seq.length) return { kind: 'content', itemType: 'image' }

    const state = sequenceStateRef.current
    const currentInterval = state.currentInterval ?? (ENCOURAGE_INTERVALS[0] ?? 15)
    const progress = state.sinceEncourage ?? 0
    const currentDraws = state.draws ?? 0
    const shouldEncourage = progress >= currentInterval

    if (shouldEncourage) {
      const round = state.round + 1
      const encourage = state.encourage + 1
      const normalizedStep = state.step % seq.length

      const nextIndex = state.intervalIndex != null ? state.intervalIndex + 1 : 1
      const nextInterval = ENCOURAGE_INTERVALS[nextIndex % ENCOURAGE_INTERVALS.length] ?? currentInterval

      sequenceStateRef.current = {
        step: normalizedStep,
        round,
        encourage,
        draws: 0,
        sinceEncourage: 0,
        currentInterval: nextInterval,
        intervalIndex: nextIndex,
      }
      return { kind: 'encourage', round, encourageIndex: encourage }
    }

    const normalizedStep = state.step % seq.length
    const itemType = seq[normalizedStep]
    const nextStep = (normalizedStep + 1) % seq.length
    sequenceStateRef.current = {
      step: nextStep,
      round: state.round,
      encourage: state.encourage,
      draws: currentDraws + 1,
      sinceEncourage: progress + 1,
      currentInterval,
      intervalIndex: state.intervalIndex ?? 0,
    }
    return { kind: 'content', itemType }
  }, [filteredSequence])

  const preloadQueuesRef = useRef<Record<ItemType, RandomContentItem[]>>({
    image: [],
    video: [],
    joke: [],
    fact: [],
    quote: [],
    web: [],
  })
  const preloadPromisesRef = useRef<Record<ItemType, Promise<void> | null>>({
    image: null,
    video: null,
    joke: null,
    fact: null,
    quote: null,
    web: null,
  })
  const prefetchLoadedRef = useRef(new Set<ItemType>())
  const recentKeysRef = useRef<string[]>([])
  const recentKeySetRef = useRef<Set<string>>(new Set())

  const clearPreloadedCaches = useCallback(() => {
    for (const type of ALL_ITEM_TYPES) {
      preloadQueuesRef.current[type] = []
      preloadPromisesRef.current[type] = null
    }
    recentKeysRef.current = []
    recentKeySetRef.current = new Set()
    prefetchLoadedRef.current = new Set()
  }, [])

  const getContentKey = useCallback((item: RandomContentItem): string => {
    if (item.type === 'image') return ['image', item.url, item.pageUrl, item.link, item.thumbUrl].filter(Boolean).join('|')
    if (item.type === 'video') return ['video', item.url, item.provider, item.source?.url].filter(Boolean).join('|')
    if (item.type === 'quote') return ['quote', item.text, item.author, item.provider].filter(Boolean).join('|')
    if (item.type === 'joke') return ['joke', item.text, item.provider].filter(Boolean).join('|')
    if (item.type === 'fact') return ['fact', item.text, item.provider].filter(Boolean).join('|')
    if (item.type === 'web') return ['web', item.url, item.text, item.host].filter(Boolean).join('|')
    return `other:${JSON.stringify(item)}`
  }, [])

  const registerRecentKey = useCallback((key: string) => {
    if (!key) return
    const list = recentKeysRef.current
    const set = recentKeySetRef.current
    if (set.has(key)) {
      const idx = list.indexOf(key)
      if (idx >= 0) list.splice(idx, 1)
    }
    list.push(key)
    set.add(key)
    while (list.length > RECENT_SESSION_LIMIT) {
      const removed = list.shift()
      if (removed) set.delete(removed)
    }
  }, [])

  const isRecentKey = useCallback((key: string) => {
    if (!key) return false
    return recentKeySetRef.current.has(key)
  }, [])

  const purgeKeyFromQueue = useCallback((type: ItemType, key: string) => {
    if (!key) return
    const queue = preloadQueuesRef.current[type]
    if (!queue.length) return
    preloadQueuesRef.current[type] = queue.filter((entry) => getContentKey(entry) !== key)
  }, [getContentKey])

  const ensureQueue = useCallback(async (type: ItemType, target = PRELOAD_TARGET_PER_TYPE) => {
    const queue = preloadQueuesRef.current[type]
    if (!prefetchLoadedRef.current.has(type) && typeof window !== 'undefined') {
      prefetchLoadedRef.current.add(type)
      try {
        const key = `random-prefetch-${type}`
        const raw = sessionStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw) as RandomContentItem
          if (parsed && parsed.type === type) {
            const keyValue = getContentKey(parsed)
            const exists = preloadQueuesRef.current[type].some((entry) => getContentKey(entry) === keyValue)
            if (!exists) {
              preloadQueuesRef.current[type].push(parsed)
            }
          }
          sessionStorage.removeItem(key)
        }
      } catch {
        /* ignore */
      }
    }
    if (queue.length >= target) return

    if (target === 1) {
      const existingPromise = preloadPromisesRef.current[type]
      if (existingPromise) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        try {
          await Promise.race([
            existingPromise,
            new Promise<void>((resolve) => {
              timeoutId = setTimeout(() => {
                timeoutId = null
                resolve()
              }, 350)
            }),
          ])
        } catch {
          /* ignore */
        } finally {
          if (timeoutId != null) clearTimeout(timeoutId)
        }
        if (queue.length >= 1) return
      }

      let tries = 0
      const maxTries = 6
      while (queue.length < 1 && tries < maxTries) {
        tries += 1
        try {
          const res = await fetchRandom({ types: [type] as RandomTypes, lang: (locale || 'en') as Lang })
          const item = res?.item
          if (!item || item.type !== type) continue
          const key = getContentKey(item)
          if (!key || isRecentKey(key)) continue
          const duplicate = preloadQueuesRef.current[type].some((entry) => getContentKey(entry) === key)
          if (duplicate) continue
          preloadQueuesRef.current[type].push(item)
        } catch {
          /* try again */
        }
      }
      return
    }

    const existing = preloadPromisesRef.current[type]
    if (existing) {
      try {
        await existing
      } catch {
        /* ignore */
      }
      if (preloadQueuesRef.current[type].length >= target) return
    }

    const version = langVersionRef.current

    const runner = (async () => {
      const maxAttempts = Math.max(target, 1) * 6
      let attempts = 0
      while (preloadQueuesRef.current[type].length < target && attempts < maxAttempts) {
        if (version !== langVersionRef.current) break
        attempts += 1
        try {
          const res = await fetchRandom({ types: [type] as RandomTypes, lang: (locale || 'en') as Lang })
          const item = res?.item
          if (!item || item.type !== type) continue
          const key = getContentKey(item)
          if (!key) continue
          if (isRecentKey(key)) continue
          const duplicate = preloadQueuesRef.current[type].some((entry) => getContentKey(entry) === key)
          if (duplicate) continue
          preloadQueuesRef.current[type].push(item)
          if (preloadQueuesRef.current[type].length >= target) break
        } catch {
          /* continue */
        }
      }
    })()

    preloadPromisesRef.current[type] = runner
    try {
      await runner
    } finally {
      if (preloadPromisesRef.current[type] === runner) {
        preloadPromisesRef.current[type] = null
      }
    }
  }, [getContentKey, isRecentKey, locale])

  const acquireItem = useCallback(async (type: ItemType): Promise<RandomContentItem | null> => {
    await ensureQueue(type, 1)

    let candidate: RandomContentItem | undefined
    let attempts = 0

    while (preloadQueuesRef.current[type].length) {
      const next = preloadQueuesRef.current[type].shift()
      if (!next) break
      const key = getContentKey(next)
      if (key && isRecentKey(key)) {
        attempts += 1
        if (attempts >= PRELOAD_TARGET_PER_TYPE * 2) break
        continue
      }
      candidate = next
      break
    }

    let fallbackAttempts = 0
    while (!candidate && fallbackAttempts < PRELOAD_TARGET_PER_TYPE * 3) {
      fallbackAttempts += 1
      try {
        const res = await fetchRandom({ types: [type] as RandomTypes, lang: (locale || 'en') as Lang })
        const item = res?.item
        if (!item || item.type !== type) continue
        const key = getContentKey(item)
        if (key && isRecentKey(key)) continue
        candidate = item
        break
      } catch {
        /* retry */
      }
    }

    if (!candidate) return null

    const key = getContentKey(candidate)
    registerRecentKey(key)
    purgeKeyFromQueue(type, key)
    ensureQueue(type).catch(() => undefined)
    return candidate
  }, [ensureQueue, getContentKey, isRecentKey, locale, purgeKeyFromQueue, registerRecentKey])

  useEffect(() => {
    langVersionRef.current += 1
    clearPreloadedCaches()
  }, [clearPreloadedCaches, locale])

  useEffect(() => {
    let cancelled = false
    const prime = async () => {
      for (const type of selectedTypes) {
        if (cancelled) return
        try {
          await ensureQueue(type, 1)
          ensureQueue(type).catch(() => undefined)
        } catch {
          /* ignore */
        }
      }
    }
    prime()
    return () => {
      cancelled = true
    }
  }, [ensureQueue, selectedTypes])

  const updateTheme = useCallback(() => {
    setThemeIdx((idx) => randDiffIdx(THEMES.length, idx))
  }, [])

  const loadNext = useCallback(async (reward = false) => {
    setLoading(true)
    setIsSecond((prev) => !prev)
    setTrigger((t) => t + 1)

    try {
      const slot = getNextSlot()
      triggerPageGlitch(slot.kind === 'encourage' ? 'boost' : 'normal')
      let outcome: 'none' | 'content' | 'encourage' = 'none'
      if (slot.kind === 'encourage') {
        const encourageItem = buildEncourageItem(slot.encourageIndex)
        setCurrentItem(encourageItem)
        setLiked(false)
        outcome = 'encourage'
      } else {
        const item = await acquireItem(slot.itemType)
        setCurrentItem(item)
        setLiked(item ? isLiked(item) : false)
        if (item) outcome = 'content'
      }
      updateTheme()
      playRandom()

      if (reward && outcome !== 'none') {
        addAction('random')
        if (outcome === 'encourage') {
          addAction('encourage')
        }
        maybeSpawnDiamond()
      }
    } catch {
      setCurrentItem(null)
    } finally {
      setLoading(false)
    }
  }, [acquireItem, addAction, buildEncourageItem, getNextSlot, maybeSpawnDiamond, triggerPageGlitch, updateTheme])

  useEffect(() => {
    loadNext(false).catch(() => setLoading(false))
  }, [loadNext])

  useEffect(() => {
    const current = currentItem
    if (current && current.type !== 'encourage') {
      setLiked(isLiked(current))
    } else {
      setLiked(false)
    }
  }, [currentItem])

  const handleRandomAgain = useCallback(() => {
    loadNext(true).catch(() => undefined)
    playAgain()
  }, [loadNext])

  function applyLangOut(next: Lang) {
    try {
      document.documentElement.setAttribute('lang', next)
      const globalWindow = window as Window & { __APP_LANG?: Lang }
      globalWindow.__APP_LANG = next
      const maxAge = 60 * 60 * 24 * 365
      document.cookie = `lang=${next}; path=/; max-age=${maxAge}`
      globalWindow.dispatchEvent(new CustomEvent('i18n:changed', { detail: next }))
    } catch {
      /* ignore */
    }
  }

  const langs = (Array.isArray(locales) && locales.length
    ? locales
    : ['en', 'fr', 'de', 'jp']) as Lang[]

  const mainStyle = useMemo<ThemeStyle>(() => ({
    backgroundColor: theme.bg,
    color: theme.cream,
    '--theme-cream': theme.cream,
    '--theme-text': theme.text,
  }), [theme.bg, theme.cream, theme.text])

  const viewItem = currentItem
  const isEncourage = viewItem?.type === 'encourage'
  const categoryType: ItemType | null =
    viewItem && viewItem.type !== 'encourage' ? viewItem.type : null

  useEffect(() => {
    if (isEncourage && shareOpen) setShareOpen(false)
  }, [isEncourage, shareOpen])

  const categoryLabel = useMemo(() => {
    if (!categoryType) return null
    const labelMap: Record<ItemType, string> = {
      image: navLabels.images,
      video: navLabels.videos,
      web: navLabels.web,
      quote: navLabels.quotes,
      joke: navLabels.jokes,
      fact: navLabels.facts,
    }
    return labelMap[categoryType]
  }, [categoryType, navLabels])

  const categoryIcon = categoryType ? TYPE_ICONS[categoryType] : null
  const adHeight = viewportWidth && viewportWidth >= 768 ? 90 : 50
  const adWidth = viewportWidth && viewportWidth >= 768 ? 728 : 320

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <main className="min-h-screen flex flex-col" style={mainStyle}>
      <div
        className={`page-glitch-overlay${pageGlitchActive ? ' page-glitch-overlay--active' : ''}`}
        aria-hidden="true"
      >
        <div className="page-glitch-overlay__bars">
          {pageGlitchBars.map((bar) => {
            const style: GlitchBarStyle = {
              top: bar.top,
              height: bar.height,
              width: bar.width,
              left: bar.left,
              background: bar.background,
              animationDelay: `${bar.delay}ms`,
              animationDuration: `${bar.duration}ms`,
              '--glitch-bar-shift': bar.shift,
              opacity: bar.opacity,
            }

            return <span key={bar.id} className="page-glitch-overlay__bar" style={style} />
          })}
        </div>
      </div>
      <header className="flex items-center justify-between px-4 sm:px-6 pt-6 pb-4">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => {
            triggerBurgerGlitch()
            setMenuOpen(true)
          }}
          className="flex items-center"
        >
          <BurgerIcon color={theme.text} glitch={burgerGlitch} />
        </button>

        <div className="flex-1 flex justify-center">
          <LogoAnimated
            trigger={trigger}
            toSecond={isSecond}
            vhMobile={8}
            vhDesktop={8}
            gapMobile={4}
            gapDesktop={4}
          />
        </div>

        <button
          type="button"
          aria-label="Shuffle"
          onClick={() => setShuffleOpen(true)}
          className="p-2"
        >
          <MonoIcon src="/icons/Shuffle.svg" color={theme.cream} size={28} />
        </button>
      </header>

      <div className="px-4 sm:px-6" style={{ marginBottom: '10px' }}>
        {categoryLabel ? (
          <div
            className="px-4 font-semibold uppercase tracking-wide flex items-center justify-center gap-3 text-center"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
              height: '40px',
            }}
          >
            {categoryIcon ? <MonoIcon src={categoryIcon} color={theme.cream} size={20} /> : null}
            <span>{categoryLabel}</span>
          </div>
        ) : (
          <div style={{ height: '40px' }} />
        )}
      </div>

      <section className="flex flex-col items-center px-4 sm:px-6" style={{ gap: '10px' }}>
        <div className="w-full" style={contentFrameStyle}>
          {loading ? (
            <div className="flex items-center justify-center w-full h-full">
              <span className="font-inter opacity-70">Loading…</span>
            </div>
          ) : viewItem ? (
            <ContentRenderer
              item={viewItem}
              theme={theme}
              frameHeight={contentHeight}
              viewportWidth={viewportWidth}
              fullscreenLabel={fullscreenLabel}
              openExternallyLabel={openExternallyLabel}
              disableFullscreen={disableFullscreenButton}
              onOpenFullscreen={openFullscreen}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <span className="font-inter opacity-70">No content</span>
            </div>
          )}
        </div>

        {viewItem && viewItem.type !== 'encourage' ? (
          <div className="text-center text-sm md:text-base font-inter opacity-80" style={{ color: theme.text }}>
            <SourceLine item={viewItem} />
          </div>
        ) : null}
      </section>

      <section className="px-4 sm:px-6" style={{ margin: '10px 0', paddingBottom: adHeight + 16 }}>
        <div className="flex items-center justify-between gap-4 w-full" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            aria-label={likeLabel}
            onClick={() => {
              if (!viewItem || viewItem.type === 'encourage') return
              if (liked) {
                removeLike(viewItem)
                setLiked(false)
              } else {
                addLike(viewItem, theme)
                setLiked(true)
                triggerHeartGlitch()
              }
              try {
                window.dispatchEvent(new StorageEvent('storage', { key: 'likes' }))
              } catch {
                /* ignore */
              }
            }}
            className="p-3"
            disabled={!viewItem || viewItem.type === 'encourage'}
          >
            <MonoIcon
              src="/icons/Heart.svg"
              color={liked ? '#FF4D78' : theme.cream}
              size={30}
              className={`heart-icon${liked ? ' heart-icon--liked' : ''}${heartGlitch ? ' heart-icon--glitch' : ''}`}
            />
          </button>

          <div className="flex-1 flex justify-center" style={{ minWidth: '160px', maxWidth: '260px' }}>
            <button
              type="button"
              onClick={handleRandomAgain}
              className="w-full px-6 py-3 rounded-[28px] shadow-md transition-transform uppercase font-tomorrow font-bold"
              style={{
                backgroundColor: theme.text,
                color: theme.cream,
                fontWeight: 700,
              }}
            >
              <AnimatedButtonLabel text={randomAgainLabel} color={theme.cream} trigger={trigger} toSecond={isSecond} />
            </button>
          </div>

          <button
            type="button"
            aria-label={shareLabel}
            onClick={() => setShareOpen(true)}
            className="p-3"
            disabled={!viewItem || viewItem.type === 'encourage'}
          >
            <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
          </button>
        </div>
      </section>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
          <div
            className="relative w-[min(360px,92vw)] rounded-3xl px-6 pt-4 pb-6 flex flex-col gap-3 shadow-2xl"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              fontFamily: 'var(--font-inter-tight), sans-serif',
            }}
          >
            <div className="flex items-center justify-end">
              <button type="button" aria-label="Close" onClick={() => setMenuOpen(false)} className="text-2xl" style={{ color: theme.cream }}>
                ×
              </button>
            </div>

            <nav
              className="flex flex-col text-lg font-semibold uppercase"
              style={{ gap: '10px' }}
            >
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream }}
              >
                <span>Home</span>
              </Link>

              <Link
                href="/random"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream }}
              >
                <span>Random</span>
              </Link>

              <Link
                href="/likes"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2"
                style={{ color: theme.cream }}
              >
                <span>{likesLabel}</span>
                <MonoIcon src="/icons/Heart.svg" color={theme.cream} size={18} />
              </Link>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setLanguagesOpen((o) => !o)}
                  className="w-full flex items-center justify-between"
                  style={{ color: theme.cream }}
                >
                  <span className="uppercase">{languageLabel}</span>
                  <span>{(locale || 'en').toUpperCase()}</span>
                </button>
                {languagesOpen ? (
                  <ul className="space-y-2 text-base font-semibold">
                    {langs.map((lang) => {
                      const active = (locale || 'en') === lang
                      return (
                        <li key={lang}>
                          <button
                            type="button"
                            onClick={() => {
                              setLocale(lang)
                              applyLangOut(lang)
                              setLanguagesOpen(false)
                              setMenuOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl"
                            style={{
                              backgroundColor: active ? 'rgba(25,25,22,0.25)' : 'rgba(25,25,22,0.12)',
                              color: theme.cream,
                            }}
                          >
                            {lang.toUpperCase()}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>

              <Link
                href="/legal"
                onClick={() => setMenuOpen(false)}
                className="text-lg font-semibold"
                style={{ color: theme.cream }}
              >
                {legalLabel}
              </Link>

              <Link
                href="/add"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2"
                style={{ color: theme.cream }}
              >
                <span>Add</span>
                <MonoIcon src="/icons/plus.svg" color={theme.cream} size={18} />
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <ShufflePicker
        open={shuffleOpen}
        onClose={() => setShuffleOpen(false)}
        selected={selectedTypes}
        onChange={(next) => {
          setSelectedTypes(next)
          resetSequence()
        }}
        theme={theme}
        key={sequenceVersion}
      />

      {fullscreenVideo ? (
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
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  title={fullscreenVideo.title || 'Video'}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        theme={theme}
        item={viewItem}
      />

      <div
        className="fixed bottom-0 left-0 right-0 flex items-center justify-center"
        style={{
          height: adHeight,
          backgroundColor: '#ffffff',
          color: '#111',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          zIndex: 60,
        }}
      >
        <div
          className="flex items-center justify-center border border-dashed border-neutral-300 rounded"
          style={{ width: adWidth, height: adHeight }}
        >
          <span className="font-inter font-semibold opacity-70">Ad space</span>
        </div>
      </div>

      <style jsx>{`
        .encourage-layout {
          height: 100%;
          width: 100%;
          gap: clamp(12px, 4vw, 18px);
        }
        .encourage-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          padding-block: clamp(4px, 1.2vh, 12px);
          width: clamp(140px, 60vw, 280px);
          height: clamp(170px, 35vh, 320px);
          position: relative;
          overflow: visible;
        }
        .encourage-icon {
          width: 100%;
          height: 100%;
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
          inset: -14%;
          border-radius: 28px;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0;
          z-index: 4;
        }
        .encourage-icon-wrapper::before {
          background: repeating-linear-gradient(90deg, rgba(0, 255, 255, 0.9) 0 10px, rgba(0, 255, 255, 0) 10px 20px);
        }
        .encourage-icon-wrapper::after {
          background: repeating-linear-gradient(0deg, rgba(255, 0, 150, 0.85) 0 14px, rgba(123, 104, 238, 0) 14px 28px);
        }
        .encourage-copy-wrapper {
          flex: 1 1 auto;
          width: 100%;
          max-width: min(320px, 82vw);
          display: flex;
          align-items: center;
          justify-content: center;
          padding-inline: clamp(6px, 2vw, 14px);
        }
        .encourage-copy {
          max-width: 56ch;
          text-align: center;
          font-size: clamp(19px, 4.6vw, 24px);
          line-height: 1.34;
        }
        @media (min-width: 768px) {
          .encourage-layout {
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: clamp(18px, 3.6vw, 26px);
          }
          .encourage-icon-wrapper {
            width: clamp(360px, 52vw, 540px);
            height: clamp(320px, 48vh, 520px);
            border-radius: 26px;
          }
          .encourage-copy-wrapper {
            flex: 1 1 clamp(320px, 44vw, 500px);
            max-width: clamp(320px, 44vw, 500px);
          }
          .encourage-copy {
            font-size: clamp(26px, 2.5vw, 34px);
          }
        }
        @media (min-width: 1024px) {
          .encourage-layout {
            justify-content: center;
            gap: clamp(22px, 3vw, 32px);
          }
          .encourage-icon-wrapper {
            width: clamp(630px, 64vw, 900px);
            height: clamp(570px, 60vh, 840px);
          }
          .encourage-copy-wrapper {
            flex: 1 1 clamp(420px, 46vw, 620px);
            max-width: clamp(420px, 46vw, 620px);
            justify-content: center;
            padding-inline: clamp(12px, 2vw, 18px);
          }
          .encourage-copy {
            font-size: clamp(36px, 3vw, 48px);
            line-height: 1.35;
          }
          .encourage-icon {
            height: auto;
          }
          .encourage-icon-wrapper::before,
          .encourage-icon-wrapper::after {
            inset: -14%;
          }
        }
        @keyframes encourage-pop {
          0% { transform: scale(0.82) rotate(-4deg); }
          54% { transform: scale(1.06) rotate(1.5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .encourage-layout.encourage-active .encourage-icon-wrapper::before {
          animation: encourage-glitch-before 2200ms steps(8, end);
        }
        .encourage-layout.encourage-active .encourage-icon-wrapper::after {
          animation: encourage-glitch-after 2200ms steps(8, end);
        }
        .encourage-layout.encourage-active .encourage-icon {
          animation: encourage-pop 520ms cubic-bezier(0.18, 0.89, 0.32, 1.28), encourage-shift 2200ms steps(8, end), encourage-flicker 2200ms linear;
        }
        @keyframes encourage-glitch-before {
          0% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
          10% { opacity: 1; transform: translate(-42px, 26px) scale(1.14) skewX(-9deg); filter: blur(4.2px) saturate(2.2); }
          25% { opacity: 0.85; transform: translate(30px, -22px) scale(0.94) skewX(7deg); filter: blur(3.2px); }
          42% { opacity: 0.6; transform: translate(-22px, 16px) scale(1.06) skewX(-5deg); filter: blur(2.4px); }
          60% { opacity: 0.38; transform: translate(18px, -12px) scale(0.97) skewX(4deg); filter: blur(1.8px); }
          80% { opacity: 0.22; transform: translate(-14px, 9px) scale(1.04) skewX(-3deg); filter: blur(1.2px); }
          100% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
        }
        @keyframes encourage-glitch-after {
          0% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
          12% { opacity: 0.95; transform: translate(40px, -28px) scale(1.12) skewX(10deg); filter: blur(3.8px) saturate(2.2); }
          30% { opacity: 0.75; transform: translate(-32px, 24px) scale(0.92) skewX(-8deg); filter: blur(3px); }
          50% { opacity: 0.5; transform: translate(24px, -18px) scale(1.08) skewX(6deg); filter: blur(2.2px); }
          72% { opacity: 0.3; transform: translate(-18px, 12px) scale(0.95) skewX(-4deg); filter: blur(1.6px); }
          90% { opacity: 0.18; transform: translate(14px, -9px) scale(1.05) skewX(3deg); filter: blur(1.1px); }
          100% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
        }
        @keyframes encourage-shift {
          0% { transform: translate3d(0,0,0); }
          18% { transform: translate3d(-34px, 24px, 0); }
          36% { transform: translate3d(28px, -20px, 0); }
          54% { transform: translate3d(-24px, 17px, 0); }
          72% { transform: translate3d(20px, -13px, 0); }
          90% { transform: translate3d(-15px, 9px, 0); }
          100% { transform: translate3d(0,0,0); }
        }
        @keyframes encourage-flicker {
          0%, 100% { filter: drop-shadow(0 36px 48px rgba(0, 0, 0, 0.45)) brightness(1); }
          12% { filter: drop-shadow(0 42px 56px rgba(0, 0, 0, 0.5)) brightness(1.9); }
          30% { filter: drop-shadow(0 34px 46px rgba(0, 0, 0, 0.4)) brightness(1.3); }
          48% { filter: drop-shadow(0 44px 60px rgba(0, 0, 0, 0.52)) brightness(1.7); }
          68% { filter: drop-shadow(0 38px 52px rgba(0, 0, 0, 0.46)) brightness(1.4); }
          86% { filter: drop-shadow(0 32px 44px rgba(0, 0, 0, 0.38)) brightness(1.8); }
        }
      `}</style>

      <style jsx global>{`
        .page-glitch-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 60;
          opacity: 0;
          background-color: transparent;
          overflow: hidden;
        }
        .page-glitch-overlay__bars {
          position: absolute;
          inset: 0;
        }
        .page-glitch-overlay__bar {
          position: absolute;
          opacity: 0;
          border-radius: 0;
          will-change: transform, opacity;
          --glitch-bar-shift: 12px;
        }
        .video-fullscreen-overlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .video-fullscreen-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(4, 5, 16, 0.86);
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
        .page-glitch-overlay--active {
          animation: page-glitch-fade 320ms ease-out forwards;
        }
        .page-glitch-overlay--active .page-glitch-overlay__bar {
          animation-name: page-glitch-bar;
          animation-timing-function: steps(4, jump-start);
          animation-fill-mode: forwards;
        }
        @keyframes page-glitch-fade {
          0% { opacity: 0; }
          15% { opacity: 0.92; }
          55% { opacity: 0.64; }
          100% { opacity: 0; }
        }
        @keyframes page-glitch-bar {
          0% {
            opacity: 0;
            transform: translate3d(calc(-0.6 * var(--glitch-bar-shift, 12px)), 0, 0);
          }
          25% {
            opacity: 1;
            transform: translate3d(calc(0.45 * var(--glitch-bar-shift, 12px)), 0, 0);
          }
          55% {
            opacity: 0.8;
            transform: translate3d(calc(-0.3 * var(--glitch-bar-shift, 12px)), 0, 0);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
        }
        .burger-icon {
          position: relative;
        }
        .burger-icon .burger-line {
          width: 100%;
          border-radius: 9999px;
          transition: transform 140ms ease, opacity 140ms ease;
        }
        .burger-icon--glitch .burger-line {
          animation: burger-glitch 360ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .burger-icon--glitch .burger-line:nth-child(2) {
          animation-delay: 40ms;
        }
        .burger-icon--glitch .burger-line:nth-child(3) {
          animation-delay: 80ms;
        }
        @keyframes burger-glitch {
          0% {
            transform: translateX(0) skewX(0deg) scaleX(1);
            opacity: 1;
            box-shadow: none;
            filter: none;
          }
          20% {
            transform: translateX(-6px) skewX(-8deg) scaleX(1.06);
            opacity: 0.7;
            box-shadow: 4px 0 currentColor, -4px 0 rgba(255, 255, 255, 0.75);
            filter: hue-rotate(-10deg) saturate(1.45);
          }
          48% {
            transform: translateX(6px) skewX(7deg) scaleX(0.94);
            opacity: 0.6;
            box-shadow: -4px 0 currentColor, 4px 0 rgba(255, 255, 255, 0.55);
            filter: hue-rotate(9deg) saturate(1.35);
          }
          72% {
            transform: translateX(-3px) skewX(-5deg) scaleX(1.08);
            opacity: 0.85;
            box-shadow: 2px 0 currentColor, -2px 0 rgba(255, 255, 255, 0.4);
            filter: hue-rotate(-6deg) saturate(1.25);
          }
          100% {
            transform: translateX(0) skewX(0deg) scaleX(1);
            opacity: 1;
            box-shadow: none;
            filter: none;
          }
        }

        .heart-icon {
          transition: transform 200ms ease, filter 200ms ease;
        }
        .heart-icon--liked {
          transform: scale(1.05);
        }
        .heart-icon--glitch {
          animation: heart-glitch 420ms steps(4, jump-start) forwards;
        }
        @keyframes heart-glitch {
          0% {
            transform: scale(1) translate(0, 0);
            filter: none;
          }
          18% {
            transform: scale(1.2) translate(-4px, 2px);
            filter: hue-rotate(-18deg) saturate(1.55) drop-shadow(0 0 10px rgba(255, 255, 255, 0.35));
          }
          38% {
            transform: scale(0.9) translate(4px, -3px);
            filter: hue-rotate(14deg) saturate(1.6) drop-shadow(0 0 12px rgba(255, 77, 120, 0.45));
          }
          58% {
            transform: scale(1.24) translate(-3px, 3px);
            filter: hue-rotate(-12deg) saturate(1.7) drop-shadow(0 0 16px rgba(255, 255, 255, 0.4));
          }
          82% {
            transform: scale(0.92) translate(3px, -2px);
            filter: hue-rotate(10deg) saturate(1.45) drop-shadow(0 0 10px rgba(255, 77, 120, 0.35));
          }
          100% {
            transform: scale(1) translate(0, 0);
            filter: none;
          }
        }
      `}</style>
    </main>
  )
}
