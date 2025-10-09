'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'

import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ShareMenu from '@/components/ShareMenu'
import { useI18n } from '@/providers/I18nProvider'
import { THEMES, TEXT_COLORS } from '@/lib/theme'
import { fetchRandom, type RandomTypes } from '@/lib/api'
import type { ItemType } from '@/lib/random/types'
import type { DisplayItem, FactItem, RandomContentItem, WebItem } from '@/lib/random/clientTypes'
import { NOROSCOPE_EXPRESSIONS, type ExpressionLocale, type ExpressionTone } from '@/data/noroscopeExpressions'

type Lang = 'en' | 'fr' | 'de' | 'jp'

const NOROSCOPE_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']
const CACHE_STORAGE_KEY = 'noroscope-cache-v6'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

const TARGET_COUNT = 6
const VIDEO_FILE_REGEX = /\.(mp4|m4v|webm|mov|ogg)(\?.*)?$/i

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
const randIdx = (length: number) => Math.floor(Math.random() * length)

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

function getItemKey(item: RandomContentItem): string {
  switch (item.type) {
    case 'image':
    case 'video':
    case 'web':
      return `${item.type}:${'url' in item && item.url ? item.url : ''}`
    case 'quote':
      return `${item.type}:${item.text || ''}:${item.author || ''}`
    case 'joke':
      return `${item.type}:${item.text || ''}`
    case 'fact':
      return `${item.type}:${item.text || ''}`
    default:
      return `${(item as { type?: string }).type || 'unknown'}:${Math.random()}`
  }
}

function formatSourceLabel(item: RandomContentItem): string | null {
  if ('source' in item && item.source?.name) return item.source.name
  if ('provider' in item && item.provider) return item.provider
  return null
}

function makeGlitchBars(mode: 'normal' | 'boost' = 'boost'): GlitchBar[] {
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
    const opacity = parseFloat(randomBetween(wide ? 0.82 : 0.58, mode === 'boost' ? 0.97 : 0.92).toFixed(2))

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
}

const POSITIVE_SEEDS: readonly string[] = [
  'love',
  'lovely',
  'happy',
  'happiness',
  'joy',
  'joyful',
  'fun',
  'funny',
  'amazing',
  'great',
  'awesome',
  'win',
  'winner',
  'victory',
  'lucky',
  'glad',
  'smile',
  'smiling',
  'peace',
  'calm',
  'bright',
  'sunny',
  'hope',
  'hopeful',
  'kind',
  'cute',
  'sweet',
  'success',
  'celebrate',
  'wow',
  'yay',
  'delight',
  'good',
  'wonderful',
  'brilliant',
  'energize',
  'spark',
  'shine',
  'playful',
  'cozy',
  'uplift',
  'magic',
  'bliss',
  'cheer',
  'amour',
  'heureux',
  'joie',
  'rire',
  'succès',
  'chance',
  'lumineux',
  'positif',
  'génial',
  'liebe',
  'glück',
  'glücklich',
  'freu',
  'lustig',
  'witzig',
  'erfolg',
  'hoffnung',
  'sonnig',
  'toll',
  'super',
  '嬉',
  '楽',
  '幸',
  '笑',
  '良',
  '素敵',
  '最高',
  '平和',
  '明る',
  '希望',
]

const NEGATIVE_SEEDS: readonly string[] = [
  'sad',
  'sorrow',
  'pain',
  'hurt',
  'bad',
  'worse',
  'worst',
  'dark',
  'death',
  'dead',
  'kill',
  'killing',
  'fear',
  'scared',
  'anger',
  'angry',
  'hate',
  'hated',
  'broken',
  'fail',
  'failure',
  'lost',
  'loss',
  'doom',
  'gloom',
  'cry',
  'tears',
  'crash',
  'bleed',
  'bleeding',
  'rage',
  'tired',
  'bored',
  'lonely',
  'void',
  'grim',
  'triste',
  'peur',
  'colère',
  'angoisse',
  'perdu',
  'perte',
  'haine',
  'mort',
  'noir',
  'fatigue',
  'traur',
  'angst',
  'wut',
  'verlust',
  'schmerz',
  'tod',
  'müde',
  'dunkel',
  'hass',
  '悲',
  '辛',
  '怖',
  '恐',
  '死',
  '負け',
  '闇',
  '泣',
  '壊',
  '憂',
  '絶望',
]

const ACCENT_REGEX = /[\u0300-\u036f]/g
const NON_ALPHANUM_REGEX = /[^a-z0-9\u3040-\u30ff\u4e00-\u9faf\s]/g

function normalizeForSentiment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .replace(NON_ALPHANUM_REGEX, ' ')
}

function containsSeed(normalizedText: string, seed: string): boolean {
  const normalizedSeed = normalizeForSentiment(seed).trim()
  if (!normalizedSeed) return false
  if (/^[a-z0-9]+$/.test(normalizedSeed)) {
    const pattern = new RegExp(`\\b${normalizedSeed}\\b`, 'i')
    return pattern.test(normalizedText)
  }
  return normalizedText.includes(normalizedSeed)
}

function scoreSegments(segments: string[]): { positive: number; negative: number } {
  const normalized = normalizeForSentiment(segments.filter(Boolean).join(' '))
  if (!normalized.trim()) return { positive: 0, negative: 0 }

  let positive = 0
  let negative = 0

  for (const seed of POSITIVE_SEEDS) {
    if (containsSeed(normalized, seed)) positive += 1
  }
  for (const seed of NEGATIVE_SEEDS) {
    if (containsSeed(normalized, seed)) negative += 1
  }

  return { positive, negative }
}

function scoreItem(item: RandomContentItem): { positive: number; negative: number } {
  const segments: string[] = []

  switch (item.type) {
    case 'image':
      if (item.title) segments.push(item.title)
      if (item.provider) segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'video':
      if (item.text) segments.push(item.text)
      if (item.provider) segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      if (item.url) segments.push(item.url)
      break
    case 'quote':
      segments.push(item.text)
      if (item.author) segments.push(item.author)
      segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'joke':
      segments.push(item.text)
      segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'fact':
      segments.push(item.text)
      if (item.variant === 'quiz') {
        segments.push(item.question)
        segments.push(item.answer)
        segments.push(item.options.join(' '))
      }
      segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'web':
      segments.push(item.text)
      if (item.provider) segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      if (item.url) segments.push(item.url)
      if (item.host) segments.push(item.host)
      break
    default:
      break
  }

  const tags = (item as { tags?: unknown }).tags
  if (Array.isArray(tags)) segments.push(tags.join(' '))

  const keywords = (item as { keywords?: unknown }).keywords
  if (Array.isArray(keywords)) segments.push(keywords.join(' '))

  return scoreSegments(segments)
}

function computeExpressionTone(entries: RandomContentItem[]): ExpressionTone {
  let positive = 0
  let negative = 0

  for (const item of entries) {
    const score = scoreItem(item)
    positive += score.positive
    negative += score.negative
  }

  if (positive === 0 && negative === 0) return 'positiveMedium'
  if (positive === 0) return negative >= 2 ? 'negative' : 'negativeMedium'
  if (negative === 0) return positive >= 2 ? 'positive' : 'positiveMedium'

  const ratio = positive / (negative || 1)
  if (ratio >= 1.6) return 'positive'
  if (ratio <= 1 / 1.6) return 'negative'
  if (positive >= negative) return 'positiveMedium'
  return 'negativeMedium'
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

function AutoPlayingVideo({ src, poster, label }: { src: string; poster?: string | null; label?: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const playSafely = () => {
      const playPromise = video.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          /* ignore autoplay errors */
        })
      }
    }

    playSafely()

    const onVisibility = () => {
      if (!document.hidden) playSafely()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [src])

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster || undefined}
      muted
      loop
      playsInline
      preload="metadata"
      className="absolute inset-0 h-full w-full object-cover"
      aria-label={label || undefined}
    />
  )
}

export default function NoroscopePage() {
  const { t, locale, locales, setLocale } = useI18n()

  const [themeIdx] = useState(() => Math.floor(Math.random() * THEMES.length))
  const theme = THEMES[themeIdx]

  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const [entries, setEntries] = useState<RandomContentItem[]>([])
  const [revealedTiles, setRevealedTiles] = useState<boolean[]>(() => Array(TARGET_COUNT).fill(false))
  const [globalGlitches, setGlobalGlitches] = useState<Array<{ id: string; bars: GlitchBar[]; rect: { top: number; left: number; width: number; height: number } }>>([])
  const glitchTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const tileRefs = useRef<Array<HTMLDivElement | null>>([])
  const fetchLangRef = useRef<Lang>((locale || 'en') as Lang)
  const initialLoadRef = useRef(false)
const [loadErrorFlag, setLoadErrorFlag] = useState<boolean>(false)
const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    }
  }, [])

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    burgerTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 360)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) setLanguagesOpen(false)
  }, [menuOpen])

  useEffect(() => {
    return () => {
      Object.values(glitchTimeoutsRef.current).forEach((timeout) => {
        if (timeout) clearTimeout(timeout)
      })
    }
  }, [])

  const applyLangOut = useCallback((next: Lang) => {
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
  }, [])

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth)
    }
    onResize()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const adFormat = useMemo(() => {
    if (vw >= 768) return { width: 728, height: 90 }
    return { width: 320, height: 50 }
  }, [vw])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--ad-bar-height', `${adFormat.height}px`)
    return () => {
      document.documentElement.style.removeProperty('--ad-bar-height')
    }
  }, [adFormat.height])

  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp']) as Lang[]

  type ThemeStyle = CSSProperties & { ['--theme-cream']?: string }
  const mainStyle = useMemo<ThemeStyle>(() => ({
    background: theme.bg,
    color: theme.cream,
    '--theme-cream': theme.cream,
  }), [theme.bg, theme.cream])

  const navLabels = useMemo<Record<ItemType, string>>(
    () => ({
      image: t('nav.images', 'images'),
      video: t('nav.videos', 'videos'),
      quote: t('nav.quotes', 'quotes'),
      joke: t('nav.jokes', 'funny jokes'),
      fact: t('nav.facts', 'facts'),
      web: t('nav.web', 'web'),
    }),
    [t]
  )

  const tileMeta = useMemo(
    () =>
      [
        { key: 'weirdDrop', label: t('noroscope.tiles.weirdDrop', '1. Weird Drop') },
        { key: 'luckyMess', label: t('noroscope.tiles.luckyMess', '2. Lucky Mess') },
        { key: 'dumbSpark', label: t('noroscope.tiles.dumbSpark', '3. Dumb Spark') },
        { key: 'randomVibe', label: t('noroscope.tiles.randomVibe', '4. Random Vibe') },
        { key: 'lostThought', label: t('noroscope.tiles.lostThought', '5. Lost Thought') },
        { key: 'secretUselessness', label: t('noroscope.tiles.secretUselessness', '6. Secret Uselessness') },
      ].map((entry, index) => ({ ...entry, color: TEXT_COLORS[index % TEXT_COLORS.length] })),
    [t]
  )

  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const noroscopeMenuLabel = useMemo(() => t('noroscope.menu', 'Noroscope'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const shareLabel = useMemo(() => t('noroscope.shareAction', 'Share this Noroscope'), [t])
  const shareTitle = useMemo(() => t('noroscope.shareTitle', 'Share your Noroscope'), [t])
  const titleBar = useMemo(() => t('noroscope.titleBar', 'Here is your Noroscope for today.'), [t])
  const loadingLabel = useMemo(() => t('noroscope.loading', "Aligning today's Noroscope..."), [t])
  const errorLabel = useMemo(() => t('noroscope.error', "Couldn't load everything. Give it another try."), [t])
  const retryLabel = useMemo(() => t('noroscope.retry', 'Try again'), [t])
  const emptyLabel = useMemo(() => t('noroscope.empty', 'No content available yet.'), [t])
  const expressionFallback = useMemo(() => t('noroscope.expressionFallback', 'The vibes are undecided today.'), [t])
  const revealActionLabel = useMemo(() => t('noroscope.revealAction', 'Reveal this vibe'), [t])
  const revealUnavailableLabel = useMemo(() => t('noroscope.revealUnavailable', 'Content still loading'), [t])
  const tileFallbackLabel = useMemo(() => t('noroscope.tileFallback', 'Reveal me'), [t])
  const instructionsLabel = useMemo(
    () => t('noroscope.instructions', 'Tap the squares and uncover your vibe of the day.'),
    [t]
  )
  const progressNoneLabel = useMemo(
    () => t('noroscope.progress.none', 'Nothing revealed yet. Pick a square to start.'),
    [t]
  )
  const progressPartialLabel = useMemo(
    () => t('noroscope.progress.partial', '{count}/{total} vibes revealed. Keep going.'),
    [t]
  )
  const progressFullLabel = useMemo(
    () => t('noroscope.progress.full', 'All vibes revealed. Screenshot the chaos!'),
    [t]
  )
  const aiDisclaimerTemplate = useMemo(() => t('noroscope.aiDisclaimer', 'Generated by AI – {source}'), [t])

  const formatAiDisclaimer = useCallback(
    (source?: string | null) => {
      if (!source) return null
      return aiDisclaimerTemplate.replace('{source}', source)
    },
    [aiDisclaimerTemplate]
  )

  const spawnGlobalGlitch = useCallback((index: number, mode: 'normal' | 'boost' = 'boost') => {
    const node = tileRefs.current[index]
    if (!node) return
    const rect = node.getBoundingClientRect()
    const bars = makeGlitchBars(mode)
    const id = `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`
    setGlobalGlitches((prev) => [...prev, { id, bars, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } }])

    const longest = bars.reduce((max, bar) => Math.max(max, bar.duration + bar.delay), 0)
    const base = mode === 'boost' ? 420 : 320
    const tail = mode === 'boost' ? 180 : 120
    const total = Math.max(base, (longest || base) + tail)
    glitchTimeoutsRef.current[id] = setTimeout(() => {
      setGlobalGlitches((prev) => prev.filter((entry) => entry.id !== id))
      delete glitchTimeoutsRef.current[id]
    }, total)
  }, [])

  const expressionData = useMemo(() => {
    if (!entries.length) {
      return { tone: 'positiveMedium' as ExpressionTone, text: expressionFallback }
    }
    const tone = computeExpressionTone(entries)
    const localeKey = (locale || 'en') as ExpressionLocale
    const pool = NOROSCOPE_EXPRESSIONS[tone]?.[localeKey] ?? []
    if (!pool || pool.length === 0) {
      return { tone, text: expressionFallback }
    }
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? expressionFallback
    return { tone, text: pick }
  }, [entries, locale, expressionFallback])

  const shareSummary = useMemo(() => {
    if (!entries.length) return null

    const lines = entries.map((item) => {
      const labelType = item.type as ItemType
      const label = navLabels[labelType] || labelType
      switch (item.type) {
        case 'image':
          return `${label}: ${item.title || item.provider || item.source?.name || item.url || ''}`.trim()
        case 'video':
        case 'web':
          return `${label}: ${item.text || item.source?.name || item.provider || item.url || ''}`.trim()
        case 'quote':
          return `${label}: ${item.text}${item.author ? ` — ${item.author}` : ''}`.trim()
        case 'joke':
        case 'fact':
          return `${label}: ${item.text}`.trim()
        default:
          return label
      }
    }).filter(Boolean)

    if (!lines.length) return null

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gorandom.fun'
    return [`NOROSCOPE`, ...lines, origin.replace(/\/$/, '') + '/noroscope'].join('\n')
  }, [entries, navLabels])

  const shareItem = useMemo<DisplayItem | null>(() => {
    if (!shareSummary) return null
    return { type: 'encourage', text: shareSummary, icon: '' }
  }, [shareSummary])

  const revealedCount = useMemo(
    () => revealedTiles.reduce((acc, flag) => (flag ? acc + 1 : acc), 0),
    [revealedTiles]
  )

  const progressText = useMemo(() => {
    if (revealedCount === 0) return progressNoneLabel
    if (revealedCount >= TARGET_COUNT) return progressFullLabel
    return progressPartialLabel.replace('{count}', `${revealedCount}`).replace('{total}', `${TARGET_COUNT}`)
  }, [progressFullLabel, progressNoneLabel, progressPartialLabel, revealedCount])

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[noroscope] entries update', entries)
    }
  }, [entries])

  useEffect(() => {
    if (!shareItem && shareOpen) {
      setShareOpen(false)
    }
  }, [shareItem, shareOpen])

  const loadNoroscope = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const currentLang = force ? ((locale || 'en') as Lang) : fetchLangRef.current
    fetchLangRef.current = currentLang
    const lang = currentLang
    const storageKey = CACHE_STORAGE_KEY

    setLoading(true)
    setLoadErrorFlag(false)

    if (force) {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
    }

    if (!force) {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw) as { timestamp?: number; entries?: RandomContentItem[]; revealed?: number[] }
          const cached = Array.isArray(parsed?.entries) ? parsed.entries : []
          const isFresh = typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp <= CACHE_TTL_MS
          const isComplete = cached.length === TARGET_COUNT && cached.every((item) => item && typeof item.type === 'string')
          if (isFresh && isComplete) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[noroscope] cache hit', parsed)
            }
            setEntries(cached)
            fetchLangRef.current = lang
            if (Array.isArray(parsed?.revealed) && parsed.revealed.length === TARGET_COUNT) {
              setRevealedTiles(parsed.revealed.map((value) => value === 1))
            } else {
              setRevealedTiles(Array(TARGET_COUNT).fill(false))
            }
            setGlobalGlitches([])
            glitchTimeoutsRef.current = {}
            setLoading(false)
            setLoadErrorFlag(false)
            return
          }
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const results: RandomContentItem[] = []
      const seen = new Set<string>()
      let attempts = 0
      const MAX_ATTEMPTS = 48

      while (results.length < TARGET_COUNT && attempts < MAX_ATTEMPTS) {
        attempts += 1
        try {
          const requested = NOROSCOPE_TYPES[Math.floor(Math.random() * NOROSCOPE_TYPES.length)]
          const response = await fetchRandom({ types: [requested] as RandomTypes, lang })
          const candidate = response?.item ?? null
          if (!candidate) continue

          const candidateType = candidate.type as ItemType | 'encourage'
          if (candidateType === 'encourage') continue
          if (!NOROSCOPE_TYPES.includes(candidateType)) continue
          if (candidateType === 'fact' && (candidate as FactItem).variant === 'quiz') continue
          if (candidateType === 'web') {
            const webItem = candidate as WebItem
            if (!webItem.ogImage) continue
          }

          const key = getItemKey(candidate)
          const allowDuplicate = attempts > 24
          if (!allowDuplicate && key && seen.has(key)) continue
          if (key) seen.add(key)

          results.push(candidate)
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[noroscope] fetchRandom failed', error)
          }
        }
      }

      const hadError = results.length < TARGET_COUNT
      if (hadError && results.length > 0) {
        const pool = [...results]
        while (results.length < TARGET_COUNT) {
          results.push(pool[results.length % pool.length])
        }
      }

      if (!isMountedRef.current) return

      if (process.env.NODE_ENV === 'development') {
        console.log('[noroscope] fetched entries', results)
      }

      setEntries(results)
      fetchLangRef.current = lang
      setLoading(false)
      setRevealedTiles(Array(TARGET_COUNT).fill(false))
      setGlobalGlitches([])
      glitchTimeoutsRef.current = {}
      if (process.env.NODE_ENV === 'development') {
        console.log('[noroscope] loading -> false')
      }
      setLoadErrorFlag(hadError)

      const canPersist = !hadError && results.length === TARGET_COUNT
      if (canPersist) {
        try {
          const payload = { timestamp: Date.now(), entries: results, revealed: Array(TARGET_COUNT).fill(0) }
          localStorage.setItem(storageKey, JSON.stringify(payload))
        } catch {
          /* ignore cache write errors */
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[noroscope] loadNoroscope failed', error)
      }
      if (!isMountedRef.current) return
      setEntries([])
      setLoading(false)
      setRevealedTiles(Array(TARGET_COUNT).fill(false))
      setGlobalGlitches([])
      glitchTimeoutsRef.current = {}
      setLoadErrorFlag(true)
      return
    }
  }, [locale])

  useEffect(() => {
    setFetchError(loadErrorFlag ? errorLabel : null)
  }, [errorLabel, loadErrorFlag])

  useEffect(() => {
    if (!initialLoadRef.current) {
      fetchLangRef.current = (locale || 'en') as Lang
    }
  }, [locale])

  useEffect(() => {
    if (initialLoadRef.current) return
    loadNoroscope({ force: false })
    initialLoadRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const adBar = (
    <div
      className="fixed bottom-0 left-0 right-0 flex items-center justify-center"
      style={{
        height: adFormat.height,
        backgroundColor: '#ffffff',
        color: '#111',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 60,
      }}
    >
      <div
        className="flex items-center justify-center border border-dashed border-neutral-300 rounded"
        style={{ width: adFormat.width, height: adFormat.height }}
      >
        <span className="font-inter font-semibold opacity-70">Ad space</span>
      </div>
    </div>
  )

  const TEXT_TILE_VARIANTS: Array<(theme: typeof THEMES[number]) => { backgroundColor: string; color: string }> = [
    (theme) => ({ backgroundColor: theme.deep, color: theme.cream }),
    (theme) => ({ backgroundColor: theme.cream, color: '#191916' }),
    (theme) => ({ backgroundColor: theme.text, color: '#191916' }),
  ]

  const renderTileContent = (item: RandomContentItem | null, index: number) => {
    if (!item) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-3 text-center" style={{ backgroundColor: 'rgba(248,245,230,0.06)', color: theme.cream }}>
          <span className="font-inter text-xs sm:text-sm opacity-80">{loading ? loadingLabel : emptyLabel}</span>
        </div>
      )
    }

    if (item.type === 'image') {
      return (
        <img src={item.thumbUrl || item.url} alt={item.title || item.provider || 'Image'} className="absolute inset-0 h-full w-full object-cover" />
      )
    }

    if (item.type === 'video') {
      const badgeText = (navLabels.video || 'video').toUpperCase()
      const badge = (
        <span
          className="absolute top-3 left-3 px-3 py-1 text-[10px] font-inter uppercase tracking-[0.24em]"
          style={{ backgroundColor: 'rgba(25,25,22,0.8)', color: theme.cream }}
        >
          {badgeText}
        </span>
      )

      const url = item.url || ''
      const lowerUrl = url.toLowerCase()
      const isDirectFile = typeof url === 'string' && VIDEO_FILE_REGEX.test(url)
      const isYouTube = lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')
      const isDailymotion = lowerUrl.includes('dailymotion.com')

      if (isDirectFile) {
        return (
          <>
            <AutoPlayingVideo src={url} poster={item.thumbUrl} label={item.text || badgeText} />
            {badge}
            {item.source?.url ? (
              <a
                href={item.source.url}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0"
                aria-label={`${badgeText}: ${item.text || item.source.url}`}
              />
            ) : null}
          </>
        )
      }

      if (isYouTube || isDailymotion) {
        const embedUrl = (() => {
          if (isYouTube) {
            const match = url.match(/(?:v=|youtu\.be\/)([\w-]{6,})/)
            const id = match ? match[1] : null
            if (!id) return null
            return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1`
          }
          const match = url.match(/video\/([\w-]+)/)
          const id = match ? match[1] : null
          if (!id) return null
          return `https://www.dailymotion.com/embed/video/${id}?autoplay=1&mute=1`
        })()

        if (embedUrl) {
          return (
            <div className="absolute inset-0">
              <iframe
                src={embedUrl}
                title={item.text || badgeText}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
              {badge}
            </div>
          )
        }
      }

      if (item.thumbUrl) {
        return (
          <>
            <img src={item.thumbUrl} alt={item.text || 'Video'} className="absolute inset-0 h-full w-full object-cover" />
            {badge}
          </>
        )
      }

      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <MonoIcon src="/icons/Video.svg" color={theme.cream} size={36} />
          {badge}
        </div>
      )
    }

    if (item.type === 'web') {
      const badgeText = (navLabels.web || 'web').toUpperCase()
      const badge = (
        <span
          className="absolute top-3 left-3 px-3 py-1 text-[10px] font-inter uppercase tracking-[0.24em]"
          style={{ backgroundColor: 'rgba(25,25,22,0.8)', color: theme.cream }}
        >
          {badgeText}
        </span>
      )

      const content = item.ogImage ? (
        <img src={item.ogImage} alt={item.text || 'Web'} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(248,245,230,0.08)]">
          <MonoIcon src="/icons/web.svg" color={theme.cream} size={32} />
        </div>
      )

      return item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="absolute inset-0">
          {content}
          {badge}
        </a>
      ) : (
        <div className="absolute inset-0">
          {content}
          {badge}
        </div>
      )
    }

    const variant = TEXT_TILE_VARIANTS[index % TEXT_TILE_VARIANTS.length](theme)
    const wrapperStyle: CSSProperties = {
      backgroundColor: variant.backgroundColor,
      color: variant.color,
    }

    if (item.type === 'quote') {
      const sourceLabel = formatSourceLabel(item)
      const disclaimer = item.disclaimer || formatAiDisclaimer(item.ai?.source)
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            “{item.text}”
          </p>
          {item.author ? (
            <p className="text-[11px] font-inter uppercase tracking-[0.2em]" style={{ opacity: 0.75 }}>
              — {item.author}
            </p>
          ) : null}
          {sourceLabel ? (
            <p className="noroscope-tile-source" style={{ color: theme.cream }}>
              {sourceLabel}
            </p>
          ) : null}
          {disclaimer ? (
            <p className="noroscope-tile-disclaimer">{disclaimer}</p>
          ) : null}
        </div>
      )
    }

    if (item.type === 'joke') {
      const sourceLabel = formatSourceLabel(item)
      const disclaimer = item.disclaimer || formatAiDisclaimer(item.ai?.source)
      return (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            {item.text}
          </p>
          <div className="absolute inset-x-4 bottom-4 flex flex-col items-center gap-2">
            {sourceLabel ? (
              <p className="noroscope-tile-source" style={{ color: theme.cream }}>
                {sourceLabel}
              </p>
            ) : null}
            {disclaimer ? <p className="noroscope-tile-disclaimer">{disclaimer}</p> : null}
          </div>
        </div>
      )
    }

    if (item.type === 'fact') {
      const fact = item as FactItem
      if (fact.variant === 'quiz') {
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={wrapperStyle}>
            <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
              {fact.text}
            </p>
            {fact.source?.name ? (
              <p className="noroscope-tile-source" style={{ color: theme.cream }}>
                {fact.source.name}
              </p>
            ) : null}
          </div>
        )
      }

      const sourceLabel = formatSourceLabel(fact)
      const disclaimer = fact.disclaimer || formatAiDisclaimer(fact.ai?.source)

      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            {fact.text}
          </p>
          {sourceLabel ? (
            <p className="noroscope-tile-source" style={{ color: theme.cream }}>
              {sourceLabel}
            </p>
          ) : null}
          {disclaimer ? <p className="noroscope-tile-disclaimer">{disclaimer}</p> : null}
        </div>
      )
    }

    const fallbackText = (item as { text?: string }).text || ''
    if (!fallbackText) {
      return (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={wrapperStyle}>
          <MonoIcon src="/icons/info.svg" color={variant.color} size={28} />
        </div>
      )
    }

    return (
      <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={wrapperStyle}>
        <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
          {fallbackText}
        </p>
      </div>
    )
  }

  const renderGrid = () => {
    return Array.from({ length: TARGET_COUNT }).map((_, index) => {
      const item = entries[index] ?? null
      const key = item ? `${getItemKey(item)}-${index}` : `placeholder-${index}`
      const isRevealed = revealedTiles[index]
      const hasContent = !!item
      const info = tileMeta[index]
      const label = info?.label ?? tileFallbackLabel
      const labelColor = info?.color ?? theme.text
      const backgroundColor = isRevealed && item && item.type === 'image' ? 'rgba(0,0,0,0.55)' : theme.deep

      const handleReveal = () => {
        if (!hasContent || loading || revealedTiles[index]) return
        setRevealedTiles((prev) => {
          if (prev[index]) return prev
          const next = [...prev]
          next[index] = true
          return next
        })
        spawnGlobalGlitch(index, 'boost')
        try {
          const storageKey = CACHE_STORAGE_KEY
          const raw = localStorage.getItem(storageKey)
          if (raw) {
            const parsed = JSON.parse(raw) as { timestamp?: number; entries?: RandomContentItem[]; revealed?: number[] }
            if (Array.isArray(parsed?.revealed) && parsed.revealed.length === TARGET_COUNT) {
              parsed.revealed[index] = 1
              localStorage.setItem(storageKey, JSON.stringify(parsed))
            }
          }
        } catch {
          /* ignore storage errors */
        }
      }

      return (
        <div
          key={key}
          className="relative aspect-[1/1]"
          ref={(node) => {
            tileRefs.current[index] = node
          }}
        >
          <div
            className="noroscope-tile-surface relative h-full w-full overflow-hidden border"
            style={{ borderColor: 'rgba(248,245,230,0.18)', backgroundColor }}
          >
            {!isRevealed ? (
              <button
                type="button"
                className="noroscope-tile-trigger"
                disabled={!hasContent || loading}
                onClick={handleReveal}
                aria-label={!hasContent || loading ? revealUnavailableLabel : revealActionLabel}
                data-tile-key={info?.key ?? `tile-${index}`}
              >
                <span
                  className="noroscope-tile-label"
                  style={{ color: labelColor }}
                >
                  {label}
                </span>
                {!hasContent || loading ? (
                  <span className="noroscope-tile-hint">{loading ? loadingLabel : emptyLabel}</span>
                ) : null}
              </button>
            ) : (
              <div className="absolute inset-0 noroscope-tile-content noroscope-glitch" data-tile-key={info?.key ?? `tile-${index}`}>
                {renderTileContent(item, index)}
              </div>
            )}
          </div>
        </div>
      )
    })
  }

  return (
    <main className="min-h-screen flex flex-col" style={mainStyle}>
      {globalGlitches.map((glitch) => {
        const width = glitch.rect.width * 2
        const height = glitch.rect.height * 2
        const top = glitch.rect.top - glitch.rect.height * 0.5
        const left = glitch.rect.left - glitch.rect.width * 0.5

        return (
          <div
            key={glitch.id}
            className="noroscope-glitch-overlay noroscope-glitch-overlay--active"
            aria-hidden
            style={{ top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` }}
          >
            <span className="noroscope-glitch-overlay__veil" />
            <div className="noroscope-glitch-overlay__bars">
              {glitch.bars.map((bar) => {
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

                return <span key={bar.id} className="noroscope-glitch-overlay__bar" style={style} />
              })}
            </div>
          </div>
        )
      })}

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
            trigger={1}
            toSecond={false}
            fitToWidth
            vhMobile={8}
            vhDesktop={9}
            gapMobile={1}
            gapDesktop={1}
          />
        </div>

        <button
          type="button"
          aria-label={shareLabel}
          onClick={() => setShareOpen(true)}
          className="p-3 disabled:opacity-40 disabled:pointer-events-none"
          disabled={!shareItem}
        >
          <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
        </button>
      </header>

      <div className="px-4 sm:px-6">
        <div className="mx-auto w-full">
          <div
            className="px-4 py-3 text-center text-base sm:text-xl uppercase tracking-wide"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              letterSpacing: '0.12em',
              fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
              fontWeight: 400,
            }}
          >
            {titleBar}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 mt-3">
        <div className="mx-auto max-w-2xl text-center">
          <p
            className="font-tomorrow text-sm sm:text-base leading-relaxed"
            style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700, color: theme.cream }}
          >
            {instructionsLabel}
          </p>
          {progressText ? (
            <p
              className="mt-2 font-inter text-[11px] sm:text-xs uppercase tracking-[0.24em]"
              style={{ color: theme.text }}
            >
              {progressText}
            </p>
          ) : null}
        </div>
      </div>

      {fetchError ? (
        <div className="px-4 sm:px-6 mt-4">
          <div
            className="px-4 py-3 rounded-2xl border text-sm font-inter"
            style={{
              borderColor: 'rgba(248,245,230,0.25)',
              backgroundColor: 'rgba(25,25,22,0.55)',
              color: theme.cream,
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{fetchError}</span>
              <button
                type="button"
                onClick={() => loadNoroscope({ force: true })}
                className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-inter font-semibold uppercase tracking-wide"
                style={{ backgroundColor: theme.text, color: theme.cream }}
              >
                {retryLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section
        className="flex-1"
        style={{ paddingBottom: `calc(${adFormat.height}px + 72px + env(safe-area-inset-bottom, 0px))` }}
      >
        <div className="px-4 sm:px-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mx-auto w-full">
            {renderGrid()}
          </div>
          {loading ? (
            <p className="mt-4 text-center font-inter text-sm" style={{ color: theme.cream, opacity: 0.75 }}>
              {loadingLabel}
            </p>
          ) : null}
          {!loading ? (
            <div className="mt-6">
              <div
                className="mx-auto w-full px-4 py-3 text-center font-tomorrow text-base sm:text-lg leading-snug"
                style={{
                  border: `2px solid ${theme.text}`,
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
                  fontWeight: 700,
                }}
              >
                {expressionData.text}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {adBar}

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
                href="/noroscope"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream, opacity: 0.7 }}
              >
                <span>{noroscopeMenuLabel}</span>
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
                  onClick={() => setLanguagesOpen((open) => !open)}
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

      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={shareTitle}
        url="/noroscope"
        theme={theme}
        item={shareItem ?? undefined}
      />
    </main>
  )
}
