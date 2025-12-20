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
import type { FactItem, RandomContentItem, WebItem } from '@/lib/random/clientTypes'
import funPhrasesEn from '@/data/funPhrases/en.json'
import funPhrasesFr from '@/data/funPhrases/fr.json'
import funPhrasesDe from '@/data/funPhrases/de.json'
import funPhrasesJp from '@/data/funPhrases/jp.json'
import { addLike, isLiked, removeLike } from '@/utils/likes'
import { useEzoicFooterAd, EZOIC_PLACEHOLDER_ID } from '@/hooks/useEzoicFooterAd'

type Lang = 'en' | 'fr' | 'de' | 'jp'

const CACHE_STORAGE_KEY = 'noroscope-cache-v6'
const CACHE_TTL_MS = 60 * 60 * 1000

const TARGET_COUNT = 6
const VIDEO_FILE_REGEX = /\.(mp4|m4v|webm|mov|ogg)(\?.*)?$/i
type PlanType = 'image' | 'video' | 'web' | 'text'
const MIX_TEMPLATE: PlanType[] = ['image', 'image', 'video', 'video', 'web', 'text']
const TEXT_TYPES: ItemType[] = ['quote', 'joke', 'fact']
const FUN_PHRASES: Record<Lang, readonly string[]> = {
  en: funPhrasesEn,
  fr: funPhrasesFr,
  de: funPhrasesDe,
  jp: funPhrasesJp,
}
const GIPHY_ATTRIBUTION_BADGE = '/PoweredBy_640_Horizontal_Light-Backgrounds_With_Logo.gif'
const AUTO_REVEAL_DELAY_MS = 700

type TileKey = 'weirdDrop' | 'luckyMess' | 'dumbSpark' | 'randomVibe' | 'lostThought' | 'secretUselessness'

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

type LikeableRandomItem = Exclude<RandomContentItem, { type: 'minigame' }>

const isLikeableRandomItem = (item: RandomContentItem): item is LikeableRandomItem =>
  item.type !== 'minigame'

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

function shuffleArray<T>(input: T[]): T[] {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
}

function pickFunPhraseForLang(lang: Lang): string {
  const list = FUN_PHRASES[lang] ?? FUN_PHRASES.en
  if (!list.length) return ''
  return list[Math.floor(Math.random() * list.length)] ?? ''
}

async function fetchPlanItem(planType: PlanType, lang: Lang, seen: Set<string>): Promise<RandomContentItem | null> {
  const planTypes = planType === 'text' ? TEXT_TYPES : [planType as ItemType]
  const maxAttempts = 14
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const requestType = planType === 'text'
      ? planTypes[Math.floor(Math.random() * planTypes.length)]
      : planTypes[0]
    const response = await fetchRandom({ types: [requestType] as RandomTypes, lang })
    const candidate = response?.item ?? null
    if (!candidate) continue
    if (planType === 'image' && candidate.type !== 'image') continue
    if (planType === 'video' && candidate.type !== 'video') continue
    if (planType === 'web') {
      if (candidate.type !== 'web') continue
      if (!(candidate as WebItem).ogImage) continue
    }
    if (candidate.type === 'fact' && (candidate as FactItem).variant === 'quiz') continue
    if (planType === 'text' && !TEXT_TYPES.includes(candidate.type as ItemType)) continue
    const key = getItemKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    return candidate
  }
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

const TILE_KEYS: readonly TileKey[] = [
  'weirdDrop',
  'luckyMess',
  'dumbSpark',
  'randomVibe',
  'lostThought',
  'secretUselessness',
] as const

const TILE_LABELS: Record<Lang, Record<TileKey, string>> = {
  en: {
    weirdDrop: 'Open this one',
    luckyMess: 'Take a peek',
    dumbSpark: 'A small surprise',
    randomVibe: 'One more hint',
    lostThought: 'Keep going',
    secretUselessness: 'Reveal now',
  },
  fr: {
    weirdDrop: 'Ouvrir ici',
    luckyMess: 'Jeter un oeil',
    dumbSpark: 'Petite surprise',
    randomVibe: 'Un indice de plus',
    lostThought: 'On continue',
    secretUselessness: 'Reveler maintenant',
  },
  de: {
    weirdDrop: 'Oeffnen',
    luckyMess: 'Kurz reinschauen',
    dumbSpark: 'Kleine Ueberraschung',
    randomVibe: 'Noch ein Hinweis',
    lostThought: 'Weiter gehts',
    secretUselessness: 'Jetzt aufdecken',
  },
  jp: {
    weirdDrop: '\u3053\u3053\u3092\u958b\u304f',
    luckyMess: '\u3061\u3087\u3063\u3068\u306e\u305e\u304f',
    dumbSpark: '\u5c0f\u3055\u306a\u30b5\u30d7\u30e9\u30a4\u30ba',
    randomVibe: '\u30d2\u30f3\u30c8\u3082\u3046\u3072\u3068\u3064',
    lostThought: '\u3064\u3065\u3051\u3088\u3046',
    secretUselessness: '\u3044\u307e\u958b\u304f',
  },
}

function resolveLang(input: string | undefined): Lang {
  if (input === 'fr' || input === 'de' || input === 'jp') return input
  return 'en'
}

function getTileLabel({
  locale,
  key,
  override,
}: {
  locale: string | undefined
  key: TileKey
  override?: string
}): string {
  const normalizedLocale = resolveLang(locale)
  const base = TILE_LABELS[normalizedLocale]?.[key] ?? TILE_LABELS.en[key]
  const raw = (override || base || '').trim()
  return raw || TILE_LABELS.en[key]
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
  useEzoicFooterAd()

  const [themeIdx] = useState(() => Math.floor(Math.random() * THEMES.length))
  const theme = THEMES[themeIdx]

  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const [entries, setEntries] = useState<RandomContentItem[]>([])
  const [funPhrase, setFunPhrase] = useState<string>('')
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [revealedTiles, setRevealedTiles] = useState<boolean[]>(() => Array(TARGET_COUNT).fill(false))
  const [globalGlitches, setGlobalGlitches] = useState<Array<{ id: string; bars: GlitchBar[]; rect: { top: number; left: number; width: number; height: number } }>>([])
  const glitchTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const tileRefs = useRef<Array<HTMLDivElement | null>>([])
  const fetchLangRef = useRef<Lang>((locale || 'en') as Lang)
  const initialLoadRef = useRef(false)
  const autoRevealTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const [loadErrorFlag, setLoadErrorFlag] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
      autoRevealTimersRef.current.forEach((timer) => clearTimeout(timer))
      autoRevealTimersRef.current = []
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

  const tileOverrides = useMemo<Record<TileKey, string>>(
    () => ({
      weirdDrop: t('noroscope.tiles.weirdDrop', ''),
      luckyMess: t('noroscope.tiles.luckyMess', ''),
      dumbSpark: t('noroscope.tiles.dumbSpark', ''),
      randomVibe: t('noroscope.tiles.randomVibe', ''),
      lostThought: t('noroscope.tiles.lostThought', ''),
      secretUselessness: t('noroscope.tiles.secretUselessness', ''),
    }),
    [t]
  )

  const tileMeta = useMemo(
    () =>
      TILE_KEYS.map((key, index) => {
        const override = tileOverrides[key]
        return {
          key,
          label: getTileLabel({ locale, key, override }),
          color: TEXT_COLORS[index % TEXT_COLORS.length],
        }
      }),
    [locale, tileOverrides]
  )

  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const noroscopeMenuLabel = useMemo(() => t('noroscope.menu', '6 RANDOM'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const shareLabel = useMemo(() => t('noroscope.shareAction', 'Share this 6 RANDOM'), [t])
  const shareTitle = useMemo(() => t('noroscope.shareTitle', 'Share your 6 RANDOM'), [t])
  const titleBar = useMemo(() => t('noroscope.titleBar', 'Your 6 RANDOM'), [t])
  const loadingLabel = useMemo(() => t('noroscope.loading', "Aligning today's 6 RANDOM..."), [t])
  const errorLabel = useMemo(() => t('noroscope.error', "Couldn't load everything. Give it another try."), [t])
  const retryLabel = useMemo(() => t('noroscope.retry', 'Try again'), [t])
  const emptyLabel = useMemo(() => t('noroscope.empty', 'No content available yet.'), [t])
  const likeLabel = useMemo(() => t('modal.like', 'Like'), [t])
  const dislikeLabel = useMemo(() => t('modal.dislike', 'Dislike'), [t])
  const summaryFallback = useMemo(() => t('noroscope.expressionFallback', 'The vibes are undecided today.'), [t])
  const revealActionLabel = useMemo(() => t('noroscope.revealAction', 'Reveal this vibe'), [t])
  const revealUnavailableLabel = useMemo(() => t('noroscope.revealUnavailable', 'Content still loading'), [t])
  const tileFallbackLabel = useMemo(() => t('noroscope.tileFallback', 'Reveal me'), [t])
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

  const revealTile = useCallback((index: number) => {
    const item = entries[index]
    if (!item) return
    setRevealedTiles((prev) => {
      if (prev[index]) return prev
      const next = [...prev]
      next[index] = true
      return next
    })
    spawnGlobalGlitch(index, 'boost')
  }, [entries, spawnGlobalGlitch])

  const handleToggleLike = useCallback((item: RandomContentItem) => {
    if (!isLikeableRandomItem(item)) return
    const likeableItem = item
    setLikedMap((prev) => {
      const key = getItemKey(item)
      const currentlyLiked = prev[key]
      if (currentlyLiked) {
        removeLike(likeableItem)
      } else {
        addLike(likeableItem, theme)
      }
      try {
        window.dispatchEvent(new StorageEvent('storage', { key: 'likes' }))
      } catch {
        /* ignore */
      }
      return { ...prev, [key]: !currentlyLiked }
    })
  }, [theme])

  const shareItems = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gorandom.fun'
    const baseUrl = origin.replace(/\/$/, '')
    return entries.map((item, idx) => {
      const label = navLabels[item.type as ItemType] || item.type
      const title = item.type === 'quote'
        ? `${label}: ${item.text}${item.author ? ` — ${item.author}` : ''}`
        : `${label}: ${item.text || item.title || item.provider || ''}`
      const shareUrl = item.source?.url || ('url' in item ? (item as { url?: string }).url : undefined) || `${baseUrl}/6random?slot=${idx}`
      return {
        type: item.type,
        title: title.trim(),
        text: item.text || item.title || label,
        url: shareUrl,
      }
    })
  }, [entries, navLabels])

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[noroscope] entries update', entries)
    }
  }, [entries])

  const loadNoroscope = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const currentLang = force ? ((locale || 'en') as Lang) : fetchLangRef.current
    fetchLangRef.current = currentLang
    const lang = currentLang
    const storageKey = `${CACHE_STORAGE_KEY}-${lang}`

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
          const parsed = JSON.parse(raw) as {
            timestamp?: number
            entries?: RandomContentItem[]
            funPhrase?: string
            lang?: Lang
          }
          const cached = Array.isArray(parsed?.entries) ? parsed.entries : []
          const isFresh = typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp <= CACHE_TTL_MS
          const isComplete = cached.length === TARGET_COUNT && cached.every((item) => item && typeof item.type === 'string')
          if (isFresh && isComplete && parsed?.lang === lang) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[noroscope] cache hit', parsed)
            }
            setEntries(cached)
            const cachedPhrase = typeof parsed.funPhrase === 'string' ? parsed.funPhrase : pickFunPhraseForLang(lang)
            setFunPhrase(cachedPhrase)
            setRevealedTiles(Array(TARGET_COUNT).fill(false))
            fetchLangRef.current = lang
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
      const plan = shuffleArray(MIX_TEMPLATE)
      const seen = new Set<string>()
      const results: RandomContentItem[] = []
      for (const slot of plan) {
        const item = await fetchPlanItem(slot, lang, seen)
        if (item) results.push(item)
      }

      if (!results.length) {
        throw new Error('no results')
      }

      if (results.length < TARGET_COUNT) {
        const pool = [...results]
        while (results.length < TARGET_COUNT && pool.length) {
          results.push(pool[results.length % pool.length])
        }
      }

      if (!isMountedRef.current) return

      if (process.env.NODE_ENV === 'development') {
        console.log('[noroscope] fetched entries', results)
      }

      setEntries(results)
      const phrase = pickFunPhraseForLang(lang)
      setFunPhrase(phrase)
      fetchLangRef.current = lang
      setLoading(false)
      setRevealedTiles(Array(TARGET_COUNT).fill(false))
      setGlobalGlitches([])
      glitchTimeoutsRef.current = {}
      if (process.env.NODE_ENV === 'development') {
        console.log('[noroscope] loading -> false')
      }
      setLoadErrorFlag(results.length < TARGET_COUNT)

      try {
        const payload = { timestamp: Date.now(), entries: results, funPhrase: phrase, lang }
        localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        /* ignore cache write errors */
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

  const refreshLikedState = useCallback(() => {
    const next: Record<string, boolean> = {}
    entries.forEach((item) => {
      const key = getItemKey(item)
      next[key] = isLikeableRandomItem(item) ? isLiked(item) : false
    })
    setLikedMap(next)
  }, [entries])

  useEffect(() => {
    refreshLikedState()
  }, [refreshLikedState])

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === 'likes') refreshLikedState()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [refreshLikedState])

  useEffect(() => {
    autoRevealTimersRef.current.forEach((timer) => clearTimeout(timer))
    autoRevealTimersRef.current = []
    if (!entries.length || loading) return
    setRevealedTiles(Array(TARGET_COUNT).fill(false))
    const timers = entries.map((_, idx) =>
      window.setTimeout(() => {
        revealTile(idx)
      }, idx * AUTO_REVEAL_DELAY_MS)
    )
    autoRevealTimersRef.current = timers
    return () => timers.forEach((timer) => clearTimeout(timer))
  }, [entries, loading, revealTile])

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
        className="flex items-center justify-center"
        style={{ width: adFormat.width, height: adFormat.height }}
      >
        {/* Ezoic - bottom_of_page - bottom_of_page */}
        <div id={`ezoic-pub-ad-placeholder-${EZOIC_PLACEHOLDER_ID}`} />
        {/* End Ezoic - bottom_of_page - bottom_of_page */}
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

    const renderHeartButton = (item: RandomContentItem, size = 16) => {
      if (!isLikeableRandomItem(item)) return null
      const key = getItemKey(item)
      const liked = likedMap[key] || false
      return (
        <button
          type="button"
          aria-label={liked ? dislikeLabel : likeLabel}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleToggleLike(item)
          }}
          className="ml-2 rounded-full p-[2px]"
          style={{ lineHeight: 0 }}
        >
          <MonoIcon src="/icons/Heart.svg" color={liked ? '#FF4D78' : theme.cream} size={size} />
        </button>
      )
    }

    const renderSourceBar = (item: RandomContentItem, inline = false) => {
      const label = formatSourceLabel(item)
      const href =
        (item.source?.url && typeof item.source.url === 'string' && item.source.url) ||
        (item.type !== 'quote' && 'url' in item && typeof (item as { url?: string }).url === 'string'
          ? (item as { url?: string }).url
          : null) ||
        null

      const labelNode = label
        ? href
          ? (
            <a href={href} target="_blank" rel="noreferrer" className="underline">
              {label}
            </a>
          )
          : <span>{label}</span>
        : href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline">
            {href.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span>—</span>
        )

      if (inline) {
        return (
          <div
            className="mt-2 flex items-center justify-center gap-2 text-[11px] font-inter uppercase tracking-[0.2em]"
            style={{ color: theme.cream }}
          >
            <span style={{ opacity: 0.6 }}>Source:</span>
            {labelNode}
            {renderHeartButton(item, 14)}
          </div>
        )
      }

      return (
        <div
          className="absolute left-0 right-0 bottom-0 flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.2em]"
          style={{ backgroundColor: 'rgba(25,25,22,0.85)', color: theme.cream, fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif" }}
        >
          <div className="flex items-center gap-2">
            <span style={{ opacity: 0.7 }}>Source:</span>
            {labelNode}
          </div>
          {renderHeartButton(item)}
        </div>
      )
    }

    const renderGiphyFooter = (href: string, item: RandomContentItem) => (
      <div className="absolute left-0 right-0 bottom-0 flex items-center justify-between bg-black px-3 py-1.5">
        <a href={href} target="_blank" rel="noreferrer" aria-label="View on Giphy">
          <img src={GIPHY_ATTRIBUTION_BADGE} alt="Powered by GIPHY" style={{ height: '32px', width: 'auto' }} />
        </a>
        {renderHeartButton(item)}
      </div>
    )

    if (item.type === 'image') {
      const provider = (item.provider || item.source?.name || '').toLowerCase()
      const giphyHref = item.source?.url || item.pageUrl || item.link || item.url || null
      return (
        <>
          <img src={item.thumbUrl || item.url} alt={item.title || item.provider || 'Image'} className="absolute inset-0 h-full w-full object-cover" />
          {provider === 'giphy' && giphyHref ? renderGiphyFooter(giphyHref, item) : renderSourceBar(item)}
        </>
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
            {renderSourceBar(item)}
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
            <>
              <iframe
                src={embedUrl}
                title={item.text || badgeText}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
              {badge}
              {renderSourceBar(item)}
            </>
          )
        }
      }

      if (item.thumbUrl) {
        return (
          <>
            <img src={item.thumbUrl} alt={item.text || 'Video'} className="absolute inset-0 h-full w-full object-cover" />
            {badge}
            {renderSourceBar(item)}
          </>
        )
      }

      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <MonoIcon src="/icons/Video.svg" color={theme.cream} size={36} />
          {badge}
          {renderSourceBar(item)}
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

      const body = (
        <>
          {content}
          {badge}
          {renderSourceBar(item)}
        </>
      )

      return item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="absolute inset-0">
          {body}
        </a>
      ) : (
        <div className="absolute inset-0">{body}</div>
      )
    }

    const variant = TEXT_TILE_VARIANTS[index % TEXT_TILE_VARIANTS.length](theme)
    const wrapperStyle: CSSProperties = {
      backgroundColor: variant.backgroundColor,
      color: variant.color,
    }

    if (item.type === 'quote') {
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
          {renderSourceBar(item, true)}
          {disclaimer ? (
            <p className="noroscope-tile-disclaimer">{disclaimer}</p>
          ) : null}
        </div>
      )
    }

    if (item.type === 'joke') {
      const disclaimer = item.disclaimer || formatAiDisclaimer(item.ai?.source)
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            {item.text}
          </p>
          <div className="absolute inset-x-4 bottom-4 flex flex-col items-center gap-2">
            {renderSourceBar(item, true)}
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
            {renderSourceBar(fact, true)}
          </div>
        )
      }

      const disclaimer = fact.disclaimer || formatAiDisclaimer(fact.ai?.source)

      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            {fact.text}
          </p>
          {renderSourceBar(fact, true)}
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
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center gap-2" style={wrapperStyle}>
        <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
          {fallbackText}
        </p>
        {renderSourceBar(item, true)}
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
      const backgroundColor = isRevealed && item && item.type === 'image' ? 'rgba(0,0,0,0.55)' : theme.deep

      const handleReveal = () => {
        if (!hasContent || loading || revealedTiles[index]) return
        revealTile(index)
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
                <span className="noroscope-tile-label" style={{ color: theme.cream }}>
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
          <LogoAnimated trigger={1} toSecond={false} vhMobile={8} vhDesktop={8} gapMobile={4} gapDesktop={4} />
        </div>

        <button
          type="button"
          aria-label={shareLabel}
          onClick={() => setShareOpen(true)}
          className="p-3 disabled:opacity-40 disabled:pointer-events-none"
          disabled={!entries.length}
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
        <div className="px-3 sm:px-5 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-[3px] sm:gap-[3px] mx-auto w-full">
            {renderGrid()}
          </div>
          {loading ? (
            <p className="mt-4 text-center font-inter text-sm" style={{ color: theme.cream, opacity: 0.75 }}>
              {loadingLabel}
            </p>
          ) : null}
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
              {funPhrase || summaryFallback}
            </div>
          </div>
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
                href="/6random"
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
        url="/6random"
        theme={theme}
        list={shareItems}
      />
    </main>
  )
}
