'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'

import AnimatedButtonLabel from '@/components/AnimatedButtonLabel'
import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ShareMenu from '@/components/ShareMenu'
import ShufflePicker from '@/components/ShufflePicker'
import { useI18n } from '@/providers/I18nProvider'
import { THEMES } from '@/lib/theme'
import { fetchRandom, type RandomTypes } from '@/lib/api'
import type { ItemType } from '@/lib/random/types'
import type {
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
const ENCOURAGE_TRIGGER_COUNT = 13

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

const CONTENT_HEIGHT = 'clamp(260px, 45vh, 560px)'

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

function VideoEmbed({ item, frameHeight }: { item: VideoContentItem; frameHeight: string }) {
  const provider = (item.provider || '').toLowerCase()
  const url = item.url
  if (!url) return null

  const looksYouTube = provider.includes('youtube') || /youtu\.?be/.test(url)
  const looksDailymotion = !looksYouTube && (provider.includes('dailymotion') || /dailymotion\.com|dai\.ly/.test(url))

  if (looksYouTube) {
    return <YouTubeEmbed item={item} frameHeight={frameHeight} />
  }

  if (looksDailymotion) {
    return <DailymotionEmbed item={item} frameHeight={frameHeight} />
  }

  return <HtmlVideoEmbed item={item} frameHeight={frameHeight} />
}

function YouTubeEmbed({ item, frameHeight }: { item: VideoContentItem; frameHeight: string }) {
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
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={text || 'Video'}
          style={{
            border: 'none',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
          }}
        />
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

function DailymotionEmbed({ item, frameHeight }: { item: VideoContentItem; frameHeight: string }) {
  const { url } = item
  const embedUrl = useMemo(() => {
    try {
      const u = new URL(url)
      const videoId = u.pathname.split('/').pop()
      return `https://www.dailymotion.com/embed/video/${videoId}`
    } catch {
      return url
    }
  }, [url])

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
          src={embedUrl}
          className="absolute top-1/2 left-1/2"
          allow="autoplay; fullscreen"
          allowFullScreen
          title={item.text || 'Video'}
          style={{
            border: 'none',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    </div>
  )
}

function HtmlVideoEmbed({ item, frameHeight }: { item: VideoContentItem; frameHeight: string }) {
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
          controls
          className="absolute top-1/2 left-1/2"
          style={{
            backgroundColor: '#000',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
          }}
          poster={item.thumbUrl ?? undefined}
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
}: {
  item: DisplayItem
  theme: { cream: string }
  frameHeight: string
}) {
  if (item.type === 'encourage') {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center gap-3 text-center px-6"
        style={{ height: '100%' }}
      >
        {item.icon ? (
          <div className="encourage-icon-wrapper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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

    return (
      <div className="h-full w-full flex items-center justify-center" style={{ height: '100%' }}>
        <ImageBlock src={src} alt={alt} height={frameHeight} />
      </div>
    )
  }

  if (item.type === 'quote') {
    return (
      <div className="h-full w-full flex items-center justify-center px-6" style={{ height: '100%' }}>
        <blockquote
          className="max-w-[80ch] text-center font-tomorrow font-bold text-[22px] md:text-[32px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          “{item.text}”
        </blockquote>
      </div>
    )
  }

  if (item.type === 'fact' || item.type === 'joke') {
    return (
      <div className="h-full w-full flex items-center justify-center px-6" style={{ height: '100%' }}>
        <p
          className="max-w-[85ch] text-center font-tomorrow font-bold text-[20px] md:text-[28px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          {item.text}
        </p>
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
    return <VideoEmbed item={item} frameHeight={frameHeight} />
  }

  return null
}

function BurgerIcon({ color }: { color: string }) {
  return (
    <span className="inline-flex flex-col justify-between h-5 w-7" aria-hidden>
      <span className="block h-[3px]" style={{ backgroundColor: color }} />
      <span className="block h-[3px]" style={{ backgroundColor: color }} />
      <span className="block h-[3px]" style={{ backgroundColor: color }} />
    </span>
  )
}

export default function RandomExperiencePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { dict, locale, locales, setLocale, t } = useI18n()

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

  const theme = THEMES[themeIdx]
  const contentFrameStyle = useMemo(() => ({
    height: CONTENT_HEIGHT,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: theme.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }), [theme.bg])

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

  const langVersionRef = useRef(0)
  const encourageQueueRef = useRef<string[]>([])
  const sequenceStateRef = useRef({ step: 0, round: 0, encourage: 0, draws: 0 })

  useEffect(() => {
    const initial = randIdx(THEMES.length)
    setThemeIdx(initial)
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
    sequenceStateRef.current = { step: 0, round: 0, encourage: 0, draws: 0 }
    setSequenceVersion((v) => v + 1)
  }, [])

  const getNextSlot = useCallback((): SequenceSlot => {
    const seq = filteredSequence
    if (!seq.length) return { kind: 'content', itemType: 'image' }

    const state = sequenceStateRef.current
    const draws = state.draws ?? 0
    const shouldEncourage = draws >= ENCOURAGE_TRIGGER_COUNT - 1

    if (shouldEncourage) {
      const round = state.round + 1
      const encourage = state.encourage + 1
      const normalizedStep = state.step % seq.length
      sequenceStateRef.current = {
        step: normalizedStep,
        round,
        encourage,
        draws: 0,
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
      draws: draws + 1,
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
  const recentKeysRef = useRef<string[]>([])
  const recentKeySetRef = useRef<Set<string>>(new Set())

  const clearPreloadedCaches = useCallback(() => {
    for (const type of ALL_ITEM_TYPES) {
      preloadQueuesRef.current[type] = []
      preloadPromisesRef.current[type] = null
    }
    recentKeysRef.current = []
    recentKeySetRef.current = new Set()
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

  const ensureQueue = useCallback(async (type: ItemType) => {
    const queue = preloadQueuesRef.current[type]
    if (queue.length >= PRELOAD_TARGET_PER_TYPE) return

    const existing = preloadPromisesRef.current[type]
    if (existing) {
      try {
        await existing
      } catch {
        /* ignore */
      }
      return
    }

    const version = langVersionRef.current

    const runner = (async () => {
      const maxAttempts = PRELOAD_TARGET_PER_TYPE * 6
      let attempts = 0
      while (preloadQueuesRef.current[type].length < PRELOAD_TARGET_PER_TYPE && attempts < maxAttempts) {
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
    await ensureQueue(type)

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
          await ensureQueue(type)
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

  const loadNext = useCallback(async () => {
    setLoading(true)
    setIsSecond((prev) => !prev)
    setTrigger((t) => t + 1)

    try {
      const slot = getNextSlot()
      if (slot.kind === 'encourage') {
        const encourageItem = buildEncourageItem(slot.encourageIndex)
        setCurrentItem(encourageItem)
        setLiked(false)
      } else {
        const item = await acquireItem(slot.itemType)
        setCurrentItem(item)
        setLiked(item ? isLiked(item) : false)
      }
      updateTheme()
      playRandom()
    } catch {
      setCurrentItem(null)
    } finally {
      setLoading(false)
    }
  }, [acquireItem, buildEncourageItem, getNextSlot, updateTheme])

  useEffect(() => {
    loadNext().catch(() => setLoading(false))
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
    loadNext().catch(() => undefined)
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
  }), [theme.bg, theme.cream])

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
      <header className="flex items-center justify-between px-4 sm:px-6 pt-6 pb-4">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setMenuOpen(true)}
          className="flex items-center"
        >
          <BurgerIcon color={theme.text} />
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

      {categoryLabel ? (
        <div className="px-4 sm:px-6" style={{ marginBottom: '10px' }}>
          <div
            className="px-4 py-2 font-semibold uppercase tracking-wide flex items-center justify-center gap-3 text-center"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              borderRadius: 0,
              fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
            }}
          >
            {categoryIcon ? <MonoIcon src={categoryIcon} color={theme.cream} size={20} /> : null}
            <span>{categoryLabel}</span>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col items-center px-4 sm:px-6" style={{ gap: '10px' }}>
        <div className="w-full" style={contentFrameStyle}>
          {loading ? (
            <div className="flex items-center justify-center w-full h-full">
              <span className="font-inter opacity-70">Loading…</span>
            </div>
          ) : viewItem ? (
            <ContentRenderer item={viewItem} theme={theme} frameHeight={CONTENT_HEIGHT} />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <span className="font-inter opacity-70">No content</span>
            </div>
          )}
        </div>

        {viewItem && viewItem.type !== 'encourage' ? (
          <div className="text-center text-sm md:text-base font-inter opacity-80">
            <SourceLine item={viewItem} />
          </div>
        ) : null}
      </section>

      <section className="px-4 sm:px-6" style={{ margin: '10px 0' }}>
        <div className="flex items-center justify-between gap-4 w-full" style={{ flexWrap: 'wrap', marginBottom: '10px' }}>
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
            <MonoIcon src="/icons/Heart.svg" color={liked ? '#FF4D78' : theme.cream} size={30} />
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

      <div
        className="mt-auto w-full flex items-center justify-center"
        style={{
          height: adHeight + 4,
          backgroundColor: '#ffffff',
          color: '#111',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div
          className="flex items-center justify-center border border-dashed border-neutral-400 rounded"
          style={{ width: adWidth, height: adHeight }}
        >
          <span className="font-inter font-semibold opacity-70">Ad space</span>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
          <div
            className="relative w-[min(360px,92vw)] rounded-3xl px-6 py-7 flex flex-col gap-6 shadow-2xl"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              fontFamily: 'var(--font-inter-tight), sans-serif',
            }}
          >
            <div className="flex items-center justify-between uppercase tracking-wide">
              <span className="text-lg font-semibold">Menu</span>
              <button type="button" aria-label="Close" onClick={() => setMenuOpen(false)} className="text-2xl" style={{ color: theme.cream }}>
                ×
              </button>
            </div>

            <nav className="flex flex-col gap-5 text-lg font-semibold uppercase">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3"
                style={{ color: theme.cream }}
              >
                <MonoIcon src="/icons/return.svg" color={theme.cream} size={20} />
                <span>Home</span>
              </Link>

              <Link
                href="/likes"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3"
                style={{ color: theme.cream }}
              >
                <MonoIcon src="/icons/Heart.svg" color={theme.cream} size={24} />
                <span>{likesLabel}</span>
              </Link>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setLanguagesOpen((o) => !o)}
                  className="w-full flex items-center justify-between"
                  style={{ color: theme.cream }}
                >
                  <span>{languageLabel}</span>
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

      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        theme={theme}
        item={viewItem}
      />

      <div
        className="fixed bottom-0 left-0 right-0 flex items-center justify-center"
        style={{
          height: 108,
          backgroundColor: '#ffffff',
          color: '#111',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          zIndex: 60,
        }}
      >
        <div
          className="flex items-center justify-center border border-dashed border-neutral-300 rounded"
          style={{ width: 320, height: 50 }}
        >
          <span className="font-inter font-semibold opacity-70">Ad space</span>
        </div>
      </div>

      <style jsx>{`
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
        @keyframes encourage-pop {
          0% { transform: scale(0.82) rotate(-4deg); }
          54% { transform: scale(1.06) rotate(1.5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </main>
  )
}
