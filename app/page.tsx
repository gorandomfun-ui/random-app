'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type RefObject,
  type CSSProperties,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import AnimatedButtonLabel from '@/components/AnimatedButtonLabel'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ScoreCounter from '@/components/ScoreCounter'
import ShufflePicker from '@/components/ShufflePicker'
import SocialPopover from '@/components/SocialPopover'
import { useI18n } from '@/providers/I18nProvider'
import { useCookieConsent } from '@/components/CookieConsent'
import { fetchRandom, type RandomTypes } from '@/lib/api'
import { XP_UI_ENABLED } from '@/lib/features'
import { THEMES } from '@/lib/theme'
import type { RandomContentItem } from '@/lib/random/clientTypes'
import type { ItemType } from '@/lib/random/types'
import { useScore } from '@/providers/ScoreProvider'
import { setMuted } from '@/utils/sound'
import AadsFooterSlot from '@/components/AadsFooterSlot'
import { startRandomPrefetch, startWeLikePrefetch } from '@/lib/prefetch/homePrefetch'

const ALL_ITEM_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']
type Lang = 'en' | 'fr' | 'de' | 'jp'

const SOUND_STORAGE_KEY = 'randomapp-sound-muted'

const randIdx = (max: number) => Math.floor(Math.random() * max)
const randDiffIdx = (max: number, not: number) => {
  if (max <= 1) return 0
  let i = randIdx(max)
  if (i === not) i = (i + 1 + randIdx(max - 1)) % max
  return i
}

const HOME_GLITCH_TYPES: RandomTypes = ['video', 'image', 'web']

type HomeGlitchFragmentKind = 'line' | 'media-line' | 'tear' | 'block' | 'void'

type HomeGlitchFragmentStyle = CSSProperties & {
  ['--home-fragment-x']?: string
  ['--home-fragment-y']?: string
  ['--home-fragment-w']?: string
  ['--home-fragment-h']?: string
  ['--home-fragment-opacity']?: number
  ['--home-fragment-color']?: string
  ['--home-fragment-accent']?: string
  ['--home-fragment-bg-position']?: string
  ['--home-fragment-bg-size']?: string
  ['--home-fragment-delay']?: string
  ['--home-fragment-drift']?: string
  ['--home-fragment-drift-back']?: string
  ['--home-fragment-pop']?: number
}

type HomeGlitchFragment = {
  id: string
  kind: HomeGlitchFragmentKind
  style: HomeGlitchFragmentStyle
}

type HomeGlitchBgStyle = CSSProperties & {
  ['--home-glitch-image']?: string
  ['--home-glitch-tone']?: string
  ['--home-glitch-accent']?: string
  ['--home-glitch-strength']?: number
}

function cssImageUrl(value: string | null): string {
  if (!value) return 'none'
  return `url("${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createSeededRandom(seed: string) {
  let state = hashString(seed) || 1
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state)
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
}

function getYouTubeThumb(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
    }
    if (host.includes('youtube.com')) {
      const fromParam = parsed.searchParams.get('v')
      const parts = parsed.pathname.split('/').filter(Boolean)
      const fromPath = parts[0] === 'shorts' || parts[0] === 'embed' ? parts[1] : null
      const id = fromParam || fromPath
      return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
    }
  } catch {
    const match = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/)
    return match?.[1] ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : null
  }
  return null
}

function getDailymotionThumb(url: string): string | null {
  const match = url.match(/dailymotion\.com\/video\/([^_/?#]+)|dai\.ly\/([^_/?#]+)/i)
  const id = match?.[1] || match?.[2]
  return id ? `https://www.dailymotion.com/thumbnail/video/${id}` : null
}

function getHomeGlitchImage(item: RandomContentItem | null): string | null {
  if (!item) return null
  if (item.type === 'image') return item.thumbUrl || item.url || null
  if (item.type === 'video') return item.thumbUrl || getYouTubeThumb(item.url) || getDailymotionThumb(item.url)
  if (item.type === 'web') return item.ogImage || null
  return null
}

function buildHomeGlitchFragments(image: string | null, seed: string, viewportWidth: number | null): HomeGlitchFragment[] {
  const rng = createSeededRandom(`${seed}:${viewportWidth ?? 0}`)
  const compact = viewportWidth != null && viewportWidth < 720
  const hasImage = Boolean(image)
  const lineCount = hasImage ? (compact ? 170 : 260) : (compact ? 52 : 72)
  const tearCount = hasImage ? (compact ? 26 : 40) : compact ? 5 : 8
  const blockCount = hasImage ? (compact ? 16 : 24) : compact ? 4 : 6
  const fragments: HomeGlitchFragment[] = []
  const palette = [
    'rgba(0, 255, 238, 0.72)',
    'rgba(255, 0, 168, 0.66)',
    'rgba(63, 86, 255, 0.58)',
    'rgba(255, 245, 198, 0.55)',
    'rgba(31, 255, 104, 0.48)',
    'rgba(255, 72, 42, 0.52)',
  ]

  const color = () => palette[Math.floor(rng() * palette.length)] ?? palette[0]
  const unit = (value: number) => `${Math.round(value * 10) / 10}%`
  const px = (value: number) => `${Math.max(1, Math.round(value))}px`

  for (let i = 0; i < lineCount; i += 1) {
    const mediaLine = hasImage && rng() > 0.54
    const y = rng() * 100
    const drift = Math.round(-18 + rng() * 36)
    fragments.push({
      id: `line-${i}`,
      kind: mediaLine ? 'media-line' : 'line',
      style: {
        '--home-fragment-x': unit(-10 + rng() * 120),
        '--home-fragment-y': unit(y),
        '--home-fragment-w': unit(5 + rng() * (compact ? 62 : 78)),
        '--home-fragment-h': rng() > 0.8 ? px(2 + rng() * 2) : `${0.55 + rng() * 1.35}px`,
        '--home-fragment-opacity': mediaLine ? 0.18 + rng() * 0.38 : 0.12 + rng() * 0.34,
        '--home-fragment-color': color(),
        '--home-fragment-accent': color(),
        '--home-fragment-bg-position': `${unit(rng() * 100)} ${unit(rng() * 100)}`,
        '--home-fragment-bg-size': `${140 + Math.round(rng() * 280)}% auto`,
        '--home-fragment-delay': `${Math.round(rng() * 3000)}ms`,
        '--home-fragment-drift': `${drift}px`,
        '--home-fragment-drift-back': `${Math.round(drift * -0.45)}px`,
        '--home-fragment-pop': rng() > 0.78 ? 1 : 0,
      },
    })
  }

  for (let i = 0; i < tearCount; i += 1) {
    const drift = Math.round(-24 + rng() * 48)
    fragments.push({
      id: `tear-${i}`,
      kind: 'tear',
      style: {
        '--home-fragment-x': unit(-8 + rng() * 110),
        '--home-fragment-y': unit(rng() * 100),
        '--home-fragment-w': unit(15 + rng() * (compact ? 54 : 72)),
        '--home-fragment-h': px(4 + rng() * (compact ? 12 : 18)),
        '--home-fragment-opacity': 0.14 + rng() * 0.34,
        '--home-fragment-color': color(),
        '--home-fragment-accent': color(),
        '--home-fragment-bg-position': `${unit(rng() * 100)} ${unit(rng() * 100)}`,
        '--home-fragment-bg-size': `${120 + Math.round(rng() * 260)}% auto`,
        '--home-fragment-delay': `${Math.round(rng() * 3000)}ms`,
        '--home-fragment-drift': `${drift}px`,
        '--home-fragment-drift-back': `${Math.round(drift * -0.45)}px`,
        '--home-fragment-pop': rng() > 0.55 ? 1 : 0,
      },
    })
  }

  for (let i = 0; i < blockCount; i += 1) {
    const isVoid = rng() > 0.72
    const drift = Math.round(-28 + rng() * 56)
    fragments.push({
      id: `block-${i}`,
      kind: isVoid ? 'void' : 'block',
      style: {
        '--home-fragment-x': unit(-3 + rng() * 104),
        '--home-fragment-y': unit(rng() * 100),
        '--home-fragment-w': unit(5 + rng() * (compact ? 22 : 34)),
        '--home-fragment-h': px(14 + rng() * (compact ? 42 : 64)),
        '--home-fragment-opacity': isVoid ? 0.42 + rng() * 0.28 : 0.2 + rng() * 0.36,
        '--home-fragment-color': color(),
        '--home-fragment-accent': color(),
        '--home-fragment-bg-position': `${unit(rng() * 100)} ${unit(rng() * 100)}`,
        '--home-fragment-bg-size': `${160 + Math.round(rng() * 340)}% auto`,
        '--home-fragment-delay': `${Math.round(rng() * 3000)}ms`,
        '--home-fragment-drift': `${drift}px`,
        '--home-fragment-drift-back': `${Math.round(drift * -0.45)}px`,
        '--home-fragment-pop': rng() > 0.42 ? 1 : 0,
      },
    })
  }

  return fragments
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

function useButtonWidth(
  heroRef: RefObject<HTMLElement | null>,
  logoRef: RefObject<HTMLDivElement | null>
) {
  const [w, setW] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    let frame: number | null = null

    const measure = () => {
      frame = null
      const heroEl = heroRef.current
      const logoEl = logoRef.current
      const viewportW = window.innerWidth || 320

      const heroWidth = heroEl?.getBoundingClientRect().width ?? viewportW - 48
      const logoWidth = logoEl?.getBoundingClientRect().width ?? 0

      const maxWidth = Math.min(880, heroWidth, viewportW - 32)
      const minWidth = Math.min(maxWidth, 260)

      let next = 280

      if (logoWidth > 0) {
        const padded = logoWidth + 24
        next = Math.max(minWidth, Math.min(padded, maxWidth))
      } else if (heroWidth > 0) {
        const ideal = Math.min(heroWidth * 0.66, maxWidth)
        next = Math.max(minWidth, Math.round(ideal))
      }

      next = Math.max(minWidth, Math.min(next, maxWidth))

      setW(next)
    }

    const schedule = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    schedule()
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    const logoNode = logoRef.current
    const ro = logoNode && 'ResizeObserver' in window ? new ResizeObserver(() => schedule()) : null
    if (ro && logoNode) ro.observe(logoNode)

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
  }, [heroRef, logoRef])

  return w
}

export default function HomePage() {
  const router = useRouter()
  const { t, locale, locales, setLocale } = useI18n()
  const { consent } = useCookieConsent()
  const { addAction, maybeSpawnDiamond } = useScore()

  const HEADER_H = 56
  const FOOTER_H = 56

  const headerRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const logoRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLElement | null>(null)
  const adRef = useRef<HTMLDivElement | null>(null)

  const [isShuffleOpen, setIsShuffleOpen] = useState(false)
  const [trigger, setTrigger] = useState(0)
  const [isSecond, setIsSecond] = useState(false)
  const [themeIdx, setThemeIdx] = useState(() => randIdx(THEMES.length))
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>(ALL_ITEM_TYPES)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const [reservedHeight, setReservedHeight] = useState(HEADER_H + FOOTER_H)
  const [footerAdVisible, setFooterAdVisible] = useState(false)
  const [isButtonBursting, setIsButtonBursting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const [soundMuted, setSoundMuted] = useState(false)
  const [homeGlitchImage, setHomeGlitchImage] = useState<string | null>(null)
  const [homeGlitchSeed, setHomeGlitchSeed] = useState('home-empty')
  const [homeGlitchPatternTick, setHomeGlitchPatternTick] = useState(0)
  const adsAllowed = consent?.ads === true
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const theme = THEMES[themeIdx]

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    burgerTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 360)
  }, [])

  useEffect(() => () => {
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const readSoundPref = () => {
      try {
        return localStorage.getItem(SOUND_STORAGE_KEY) === 'true'
      } catch {
        return false
      }
    }
    const initial = readSoundPref()
    setSoundMuted(initial)
    setMuted(initial)
    const handler = (event: StorageEvent) => {
      if (event.key === SOUND_STORAGE_KEY && event.newValue != null) {
        const next = event.newValue === 'true'
        setSoundMuted(next)
        setMuted(next)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const toggleSound = () => {
    setSoundMuted((prev) => {
      const next = !prev
      setMuted(next)
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  useEffect(() => {
    const lang = (locale || 'en') as Lang
    startRandomPrefetch(lang, selectedTypes)
  }, [locale, selectedTypes])

  useEffect(() => {
    startWeLikePrefetch()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const timer = window.setInterval(() => {
      setHomeGlitchPatternTick((value) => value + 1)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const lang = (locale || 'en') as Lang
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(load, delay)
    }

    const load = async () => {
      try {
        let picked: RandomContentItem | null = null
        let pickedImage: string | null = null

        for (let attempt = 0; attempt < 4 && !pickedImage; attempt += 1) {
          const response = await fetchRandom({
            types: HOME_GLITCH_TYPES,
            lang,
            strong: attempt < 2,
            preview: true,
          })
          const item = response.item
          const image = getHomeGlitchImage(item)
          if (image) {
            picked = item
            pickedImage = image
          }
        }

        if (!stopped && pickedImage) {
          const id = picked?._id || pickedImage
          setHomeGlitchImage(pickedImage)
          setHomeGlitchSeed(`${id}:${Date.now()}`)
        }
      } catch {
        /* keep the calm fallback */
      } finally {
        if (!stopped) schedule(60000)
      }
    }

    schedule(900)

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [locale])

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
    try {
      const stored = localStorage.getItem('random:selectedTypes')
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      const filtered = parsed.filter((entry): entry is ItemType => ALL_ITEM_TYPES.includes(entry as ItemType))
      if (filtered.length) setSelectedTypes(filtered)
    } catch {
      /* ignore */
    }
  }, [])

  const heroCopy = useMemo(() => ({
    startButton: t('hero.startButton', 'GO RANDOM'),
    tagline1: t('hero.tagline1', 'EXPLORE RANDOM CONTENTS.'),
    tagline2: t('hero.tagline2', 'NO MISSION, NO GOAL, NO REASON.'),
    tagline3: t('hero.tagline3', 'ONLY USELESS SURPRISE.'),
  }), [t])

  const navLabels = useMemo(() => ({
    images: t('nav.images', 'images'),
    videos: t('nav.videos', 'videos'),
    web: t('nav.web', 'web'),
    quotes: t('nav.quotes', 'quotes'),
    jokes: t('nav.jokes', 'funny jokes'),
    facts: t('nav.facts', 'facts'),
  }), [t])

  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp']) as Lang[]

  const footerCopy = useMemo(() => ({
    legal: t('footer.legal', 'Legal notice.'),
    share: t('footer.share', 'share'),
  }), [t])

  const shuffleLabel = useMemo(() => t('shuffle.title', 'Shuffle'), [t])

  type ThemeStyle = CSSProperties & { ['--theme-cream']?: string }
  const mainStyle = useMemo<ThemeStyle>(() => ({
    backgroundColor: theme.bg,
    color: theme.cream,
    '--theme-cream': theme.cream,
  }), [theme.bg, theme.cream])

  const homeGlitchFragments = useMemo(
    () => buildHomeGlitchFragments(homeGlitchImage, `${homeGlitchSeed}:${homeGlitchPatternTick}`, viewportWidth),
    [homeGlitchImage, homeGlitchPatternTick, homeGlitchSeed, viewportWidth]
  )

  const homeGlitchStyle = useMemo<HomeGlitchBgStyle>(() => ({
    '--home-glitch-image': cssImageUrl(homeGlitchImage),
    '--home-glitch-tone': theme.bg,
    '--home-glitch-accent': theme.text,
    '--home-glitch-strength': homeGlitchImage ? 1 : 0.38,
  }), [homeGlitchImage, theme.bg, theme.text])

  useEffect(() => {
    const onResize = () => {
      if (typeof window === 'undefined') return
      setViewportHeight(window.innerHeight)
      setViewportWidth(window.innerWidth)
    }
    onResize()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
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

  const adFormat = useMemo(() => {
    const width = viewportWidth ?? 0
    if (width >= 1024) return { width: 728, height: 90, variant: 'desktop' as const }
    return { width: 320, height: 50, variant: 'mobile' as const }
  }, [viewportWidth])
  const visibleAdHeight = adsAllowed && footerAdVisible ? adFormat.height : 0

  useEffect(() => {
    const observers: Array<{ el: HTMLElement | null; handler: () => void }> = []
    const handle = () => {
      const headerH = headerRef.current?.offsetHeight ?? HEADER_H
      const footerH = footerRef.current?.offsetHeight ?? FOOTER_H
      const adH = adRef.current?.offsetHeight ?? 0
      setReservedHeight(headerH + footerH + adH)
    }
    observers.push({ el: headerRef.current, handler: handle })
    observers.push({ el: footerRef.current, handler: handle })
    observers.push({ el: adRef.current, handler: handle })

    const ro = typeof window !== 'undefined' && 'ResizeObserver' in window
      ? new ResizeObserver(() => handle())
      : null

    handle()
    observers.forEach(({ el }) => {
      if (el) ro?.observe(el)
    })

    return () => ro?.disconnect()
  }, [visibleAdHeight])

  const heroAvailable = viewportHeight != null ? viewportHeight - reservedHeight : null
  const heroMinHeight: number | string = heroAvailable != null
    ? Math.max(heroAvailable, 360)
    : `calc(100dvh - ${reservedHeight}px)`

  useEffect(() => {
    if (!adsAllowed) setFooterAdVisible(false)
  }, [adsAllowed])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--ad-bar-height', `${visibleAdHeight}px`)
    return () => {
      document.documentElement.style.removeProperty('--ad-bar-height')
    }
  }, [visibleAdHeight])

  const targetBtnW = useButtonWidth(heroRef, logoRef)

  const heroButtonsWidth = useMemo(() => {
    if (!targetBtnW) return undefined
    const width = viewportWidth ?? 0
    if (width >= 768) {
      const total = targetBtnW + targetBtnW / 3 + 24
      return Math.min(Math.round(total), 880)
    }
    return targetBtnW
  }, [targetBtnW, viewportWidth])

  const likesButtonWidth = useMemo(() => {
    if (!targetBtnW) return undefined
    const width = viewportWidth ?? 0
    if (width >= 768) {
      return Math.round(targetBtnW / 3)
    }
    return undefined
  }, [targetBtnW, viewportWidth])

  const shareFromFooter = useCallback(() => {
    const shareData = {
      title: 'Random',
      text: 'Random app',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://gorandom.fun',
    }
    if (navigator.share) {
      navigator.share(shareData).catch(() => {})
    } else {
      navigator.clipboard?.writeText(shareData.url).then(() => alert('Link copied!')).catch(() => {})
    }
  }, [])

  const handleStart = useCallback(() => {
    const next = !isSecond
    setIsSecond(next)
    setTrigger((t) => t + 1)
    setThemeIdx((idx) => randDiffIdx(THEMES.length, idx))
    setIsButtonBursting(true)
    setTimeout(() => setIsButtonBursting(false), 520)

    try {
      localStorage.setItem('random:selectedTypes', JSON.stringify(selectedTypes))
    } catch {
      /* ignore */
    }

    const typesParam = selectedTypes.join(',')

    addAction('random')
    maybeSpawnDiamond()

    if (typesParam.length) {
      router.push(`/random?types=${encodeURIComponent(typesParam)}`)
    } else {
      router.push('/random')
    }
  }, [addAction, isSecond, maybeSpawnDiamond, router, selectedTypes])

  return (
    <main className="home-page min-h-screen flex flex-col" style={mainStyle}>
      <div className="home-glitch-bg" style={homeGlitchStyle} aria-hidden="true">
        <div className="home-glitch-bg__media" />
        <div className="home-glitch-bg__fragments">
          {homeGlitchFragments.map((fragment) => (
            <span
              key={fragment.id}
              className={`home-glitch-fragment home-glitch-fragment--${fragment.kind}`}
              style={fragment.style}
            />
          ))}
        </div>
        <div className="home-glitch-bg__tone" />
        <div className="home-glitch-bg__scan" />
      </div>

      <header
        ref={headerRef}
        className="relative z-10 flex items-center justify-between px-4 pt-4 pb-2"
        style={{ height: HEADER_H }}
      >
        <div className="flex items-center gap-3">
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

          <Link
            href="/likes"
            aria-label={likesLabel}
            className="flex items-center"
          >
            <MonoIcon src="/icons/Heart.svg" color={theme.text} size={28} />
          </Link>
        </div>

        <div className="flex-1 flex justify-center">
          <button onClick={() => setIsShuffleOpen(true)} aria-label={shuffleLabel} className="flex items-center">
            <MonoIcon src="/icons/Shuffle.svg" color={theme.cream} size={28} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div style={{ color: theme.text }} className="flex">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <section
        ref={heroRef}
        className="relative z-10 flex flex-col items-center px-4 flex-1 justify-center text-center"
        style={{
          minHeight: heroMinHeight,
          paddingTop: 'calc(max(12px, env(safe-area-inset-top, 0px)) + 12px)',
          paddingBottom: `calc(${FOOTER_H}px + 24px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div
          className="flex flex-col items-center w-full"
          style={{ transform: 'translateY(calc(-1 * clamp(36px, 10vh, 160px)))' }}
        >
          <div ref={logoRef} className="mx-auto">
            <LogoAnimated
              trigger={trigger}
              toSecond={isSecond}
              twoLineOnMobile
              vhMobile={18}
              vhDesktop={40}
              gapMobile={5}
              gapDesktop={8}
            />
          </div>

          <div
            className="mt-6 mx-auto w-full max-w-[880px]"
            style={{ width: heroButtonsWidth ? `${heroButtonsWidth}px` : undefined }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-center md:gap-4">
              <button
                onClick={handleStart}
                className={`w-full px-10 py-3 rounded-[28px] shadow-md hover:scale-[1.03] transition uppercase flex items-center justify-center ${isButtonBursting ? 'btn-energized' : ''}`}
                style={{
                  backgroundColor: theme.text,
                  color: theme.cream,
                  fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
                  fontWeight: 700,
                  width: viewportWidth && viewportWidth >= 768 && targetBtnW ? `${targetBtnW}px` : undefined,
                }}
              >
                <span className="sr-only">{heroCopy.startButton}</span>
                <AnimatedButtonLabel
                  text={heroCopy.startButton}
                  color={theme.cream}
                  trigger={trigger}
                  toSecond={isSecond}
                />
              </button>

              <Link
                href="/likes"
                aria-label={likesLabel}
                className="w-full px-10 py-3 rounded-[28px] shadow-md hover:scale-[1.03] transition uppercase flex items-center justify-center"
                style={{
                  backgroundColor: theme.cream,
                  color: theme.text,
                  fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
                  fontWeight: 700,
                  width: viewportWidth && viewportWidth >= 768 && likesButtonWidth ? `${likesButtonWidth}px` : undefined,
                }}
              >
                <span>{likesLabel}</span>
              </Link>
            </div>
          </div>

          <p
            className="mt-4 font-tomorrow font-bold text-base md:text-xl leading-snug"
            style={{ color: theme.text, fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}
          >
            {heroCopy.tagline1}<br />
            {heroCopy.tagline2}<br />
            {heroCopy.tagline3}
          </p>

          <div
            className="mt-6 hidden flex-col items-center font-inter font-semibold text-base md:text-lg tracking-tight md:flex"
            style={{ color: theme.cream, letterSpacing: '-0.01em' }}
          >
            <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 md:gap-x-1.5">
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/image.svg" color={theme.cream} size={20} /> {navLabels.images}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/Video.svg" color={theme.cream} size={20} /> {navLabels.videos}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/web.svg" color={theme.cream} size={20} /> {navLabels.web}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/quote.svg" color={theme.cream} size={20} /> {navLabels.quotes}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 md:gap-x-1.5">
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/joke.svg" color={theme.cream} size={20} /> {navLabels.jokes}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/fact.svg" color={theme.cream} size={20} /> {navLabels.facts}
              </span>
            </div>
          </div>
        </div>
      </section>

      <footer
        ref={footerRef}
        className="fixed left-0 right-0 z-20"
        style={{ bottom: `calc(${visibleAdHeight}px + env(safe-area-inset-bottom, 0px))`, height: FOOTER_H }}
      >
        <div className="w-full px-4 h-full flex items-center justify-between" style={{ color: theme.text }}>
          <SocialPopover theme={theme} />
          <Link href="/legal" className="flex items-center gap-2">
            <MonoIcon src="/icons/info.svg" color={theme.cream} size={20} />
            <span className="font-inter font-semibold" style={{ color: theme.cream }}>{footerCopy.legal}</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/add" className="flex items-center gap-1">
              <span className="font-inter font-semibold" style={{ color: theme.cream }}>Add</span>
              <MonoIcon src="/icons/plus.svg" color={theme.cream} size={20} />
            </Link>
            <button className="flex items-center" onClick={shareFromFooter} aria-label={footerCopy.share}>
              <MonoIcon src="/icons/share.svg" color={theme.text} size={20} />
            </button>
          </div>
        </div>
      </footer>

      {adsAllowed ? (
        <div
          ref={adRef}
          id="ad-bar"
          className="fixed bottom-0 left-0 right-0 flex items-center justify-center"
          style={{
            height: visibleAdHeight,
            backgroundColor: footerAdVisible ? '#ffffff' : 'transparent',
            color: '#111',
            overflow: 'visible',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            pointerEvents: footerAdVisible ? 'auto' : 'none',
            zIndex: 120,
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: adFormat.width,
              height: adFormat.height,
              position: footerAdVisible ? 'static' : 'absolute',
              bottom: 0,
            }}
          >
            <AadsFooterSlot
              variant={adFormat.variant}
              enabled={adsAllowed}
              onVisibleChange={setFooterAdVisible}
            />
          </div>
        </div>
      ) : null}

      <ShufflePicker
        open={isShuffleOpen}
        onClose={() => setIsShuffleOpen(false)}
        selected={selectedTypes}
        onChange={(next) => setSelectedTypes(next)}
        theme={theme}
      />

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
            <div
              className={`flex items-center ${XP_UI_ENABLED ? 'justify-between' : 'justify-end'}`}
              style={{ color: theme.cream }}
            >
              {XP_UI_ENABLED ? <ScoreCounter /> : null}
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

              <button
                type="button"
                onClick={toggleSound}
                className="mt-2 w-full rounded-xl border border-white/25 px-3 py-2 text-sm font-semibold uppercase tracking-[0.15em]"
                style={{ color: theme.cream }}
                aria-pressed={!soundMuted}
              >
                Sound FX: {soundMuted ? 'Off' : 'On'}
              </button>
            </nav>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .home-page {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background: #050505;
        }

        .home-glitch-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background: #020202;
        }

        .home-glitch-bg__media {
          position: absolute;
          inset: -8%;
          background-image: var(--home-glitch-image);
          background-position: center;
          background-size: cover;
          filter: blur(5px) saturate(2.25) contrast(1.85) brightness(0.39);
          transform: scale(1.12);
          opacity: 0;
          animation: home-glitch-media-cycle 10s steps(1, end) infinite;
        }

        .home-glitch-bg__fragments {
          position: absolute;
          inset: 0;
          opacity: 0;
          animation: home-glitch-fragments-cycle 10s steps(1, end) infinite;
        }

        .home-glitch-bg__tone {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0.58) 46%, rgba(0, 0, 0, 0.9)),
            linear-gradient(90deg, rgba(0, 0, 0, 0.18), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.18));
        }

        .home-glitch-bg__scan {
          position: absolute;
          inset: 0;
          opacity: 0;
          mix-blend-mode: screen;
          background:
            repeating-linear-gradient(
              to bottom,
              rgba(178, 227, 255, 0.13) 0,
              rgba(178, 227, 255, 0.13) 1px,
              transparent 1px,
              transparent 3px
            );
          animation: home-glitch-scan-cycle 10s steps(1, end) infinite;
        }

        .home-glitch-fragment {
          position: absolute;
          left: var(--home-fragment-x);
          top: var(--home-fragment-y);
          width: var(--home-fragment-w);
          height: var(--home-fragment-h);
          opacity: calc(var(--home-fragment-opacity) * var(--home-glitch-strength, 1));
          transform: translate3d(0, 0, 0);
          animation: home-glitch-fragment-jump 10s steps(1, end) infinite;
          animation-delay: var(--home-fragment-delay);
          will-change: transform, opacity;
        }

        .home-glitch-fragment--line {
          background:
            linear-gradient(
              90deg,
              transparent 0%,
              var(--home-fragment-color) 14%,
              rgba(255, 255, 255, 0.64) 44%,
              var(--home-fragment-accent) 66%,
              transparent 100%
            );
          box-shadow:
            0 0 8px color-mix(in srgb, var(--home-fragment-color) 52%, transparent),
            2px 0 0 rgba(0, 255, 242, 0.22),
            -2px 0 0 rgba(255, 0, 168, 0.18);
        }

        .home-glitch-fragment--media-line,
        .home-glitch-fragment--tear,
        .home-glitch-fragment--block {
          background-image: var(--home-glitch-image);
          background-position: var(--home-fragment-bg-position);
          background-size: var(--home-fragment-bg-size);
          filter: saturate(2.7) contrast(1.8) brightness(1.05);
          mix-blend-mode: screen;
          box-shadow:
            2px 0 0 rgba(0, 255, 242, 0.34),
            -2px 0 0 rgba(255, 0, 168, 0.28),
            0 0 12px rgba(255, 255, 255, 0.06);
        }

        .home-glitch-fragment--media-line {
          min-height: 1px;
        }

        .home-glitch-fragment--tear {
          background-color: var(--home-fragment-color);
          border-left: 2px solid rgba(255, 255, 255, 0.38);
          border-right: 1px solid rgba(0, 255, 242, 0.28);
        }

        .home-glitch-fragment--block {
          background-color: var(--home-fragment-color);
        }

        .home-glitch-fragment--void {
          background:
            linear-gradient(90deg, rgba(0, 0, 0, 0.92), rgba(4, 4, 4, 0.7)),
            linear-gradient(180deg, var(--home-fragment-color), transparent);
          border-left: 1px solid rgba(0, 255, 242, 0.24);
          border-bottom: 1px solid rgba(255, 0, 168, 0.18);
        }

        @keyframes home-glitch-media-cycle {
          0%,
          29.99% {
            opacity: 0;
            transform: scale(1.12) translate3d(0, 0, 0);
            filter: blur(5px) saturate(2.1) contrast(1.7) brightness(0.36);
          }
          30%,
          100% {
            opacity: calc(var(--home-glitch-strength, 1) * 0.92);
            transform: scale(1.15) translate3d(-0.8%, 0.4%, 0);
            filter: blur(4px) saturate(2.75) contrast(2.1) brightness(0.35);
          }
        }

        @keyframes home-glitch-fragments-cycle {
          0%,
          29.99% {
            opacity: 0;
          }
          30%,
          100% {
            opacity: 1;
          }
        }

        @keyframes home-glitch-scan-cycle {
          0%,
          29.99% {
            opacity: 0.06;
          }
          30%,
          100% {
            opacity: 0.32;
          }
        }

        @keyframes home-glitch-fragment-jump {
          0%,
          34% {
            transform: translate3d(0, 0, 0);
          }
          39% {
            transform: translate3d(var(--home-fragment-drift), 0, 0);
          }
          44% {
            transform: translate3d(var(--home-fragment-drift-back), 0, 0);
          }
          53%,
          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-glitch-bg__media,
          .home-glitch-bg__fragments,
          .home-glitch-bg__scan,
          .home-glitch-fragment {
            animation: none;
          }

          .home-glitch-bg__media {
            opacity: 0;
          }

          .home-glitch-bg__fragments {
            opacity: 0.22;
          }

          .home-glitch-bg__scan {
            opacity: 0.12;
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
      `}</style>
    </main>
  )
}
