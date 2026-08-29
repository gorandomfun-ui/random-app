'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import LikesGrid from '../../components/LikesGrid'
import ShufflePicker from '@/components/ShufflePicker'
import { clearExpired, fetchGlobalTop, getAll, type GlobalLikeItem, type LikeItem } from '../../utils/likes'
import LogoAnimated from '../../components/LogoAnimated'
import MonoIcon from '../../components/MonoIcon'
import HeartIcon from '../../components/HeartIcon'
import { useI18n } from '../../providers/I18nProvider'
import { THEMES } from '@/lib/theme'
import type { ItemType } from '@/lib/random/types'
import AadsFooterSlot from '@/components/AadsFooterSlot'
import {
  readWeLikesCache,
  WE_CACHE_TTL_MS,
  WE_LIKES_INVALIDATED_EVENT,
  writeWeLikesCache,
} from '@/lib/likes/weCache'

type Lang = 'en' | 'fr' | 'de' | 'jp'
type LikesClientProps = {
  initialGlobalItems?: GlobalLikeItem[]
  initialFetchedAt?: number
}

const ALL_ITEM_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']
const GLOBAL_LIKES_LIMIT = 200

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

function readWeCache(): { items: GlobalLikeItem[]; timestamp: number } | null {
  return readWeLikesCache<GlobalLikeItem>()
}

type LikesGlitchBgStyle = CSSProperties & {
  ['--likes-bg-image']?: string
  ['--likes-bg-accent']?: string
  ['--likes-bg-media-opacity']?: number
}

type LikesGlitchFragmentStyle = CSSProperties & {
  ['--likes-fragment-x']?: string
  ['--likes-fragment-y']?: string
  ['--likes-fragment-w']?: string
  ['--likes-fragment-h']?: string
  ['--likes-fragment-dx']?: string
  ['--likes-fragment-color']?: string
  ['--likes-fragment-opacity']?: number
  ['--likes-fragment-bg-x']?: string
  ['--likes-fragment-bg-y']?: string
  ['--likes-fragment-bg-size']?: string
}

type LikesGlitchFragment = {
  id: string
  kind: 'line' | 'block' | 'media'
  style: LikesGlitchFragmentStyle
}

type LikesGlitchSource = Pick<LikeItem, 'id' | 'likedAt' | 'ogImage' | 'provider' | 'thumbUrl' | 'type' | 'url'>

const LIKES_GLITCH_COLORS = ['#18f06a', '#b833ff', '#00e8ff', '#ff2a6d', '#f3ef7d', '#ffffff']

function toKnownItemType(type: string): ItemType {
  return ALL_ITEM_TYPES.includes(type as ItemType) ? (type as ItemType) : 'video'
}

function cssImageUrl(value?: string | null) {
  if (!value) return 'none'
  return `url("${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

function looksLikeGifUrl(value: string) {
  return /\.gif(?:$|[?#])/i.test(value)
}

function toStaticGifPreview(value: string) {
  if (value.includes('giphy.com')) {
    return value.replace(/\/giphy\.gif(?:[?#].*)?$/i, '/200_s.gif')
  }
  return null
}

function getLikesGlitchImage(item: LikesGlitchSource | null | undefined) {
  if (!item) return null
  const raw =
    item.type === 'image'
      ? item.thumbUrl || item.url
      : item.type === 'video'
        ? item.thumbUrl
        : item.type === 'web'
          ? item.ogImage || item.thumbUrl
          : item.thumbUrl || item.ogImage

  if (!raw) return null
  if (!looksLikeGifUrl(raw)) return raw
  return toStaticGifPreview(raw)
}

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let value = seed % 2147483647
  if (value <= 0) value += 2147483646
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

function pickLikesGlitchImage(items: LikesGlitchSource[], seed: string) {
  const images = items.map(getLikesGlitchImage).filter((value): value is string => Boolean(value))
  if (!images.length) return null
  return images[hashString(seed) % images.length]
}

function buildLikesGlitchFragments(image: string | null, seed: string, viewportWidth: number) {
  const random = seededRandom(hashString(seed) || 1)
  const compact = viewportWidth < 720
  const lines = compact ? 72 : 120
  const blocks = compact ? 10 : 16
  const mediaBlocks = image ? (compact ? 8 : 12) : 0
  const fragments: LikesGlitchFragment[] = []

  for (let i = 0; i < lines; i += 1) {
    const color = LIKES_GLITCH_COLORS[Math.floor(random() * LIKES_GLITCH_COLORS.length)]
    const longLine = random() > 0.7
    fragments.push({
      id: `line-${i}`,
      kind: 'line',
      style: {
        '--likes-fragment-x': `${Math.round(random() * 1000) / 10}%`,
        '--likes-fragment-y': `${Math.round(random() * 350) / 10}%`,
        '--likes-fragment-w': `${Math.round((longLine ? 22 + random() * 58 : 5 + random() * 28) * 10) / 10}vw`,
        '--likes-fragment-h': `${Math.round((1 + random() * (compact ? 2 : 3)) * 10) / 10}px`,
        '--likes-fragment-dx': `${Math.round((random() * 18 - 9) * 10) / 10}px`,
        '--likes-fragment-color': color,
        '--likes-fragment-opacity': Math.round((0.08 + random() * 0.34) * 100) / 100,
      },
    })
  }

  for (let i = 0; i < blocks; i += 1) {
    const color = LIKES_GLITCH_COLORS[Math.floor(random() * LIKES_GLITCH_COLORS.length)]
    fragments.push({
      id: `block-${i}`,
      kind: 'block',
      style: {
        '--likes-fragment-x': `${Math.round(random() * 920) / 10}%`,
        '--likes-fragment-y': `${Math.round((3 + random() * 28) * 10) / 10}%`,
        '--likes-fragment-w': `${Math.round((20 + random() * 150) * 10) / 10}px`,
        '--likes-fragment-h': `${Math.round((4 + random() * 28) * 10) / 10}px`,
        '--likes-fragment-dx': `${Math.round((random() * 32 - 16) * 10) / 10}px`,
        '--likes-fragment-color': color,
        '--likes-fragment-opacity': Math.round((0.16 + random() * 0.36) * 100) / 100,
      },
    })
  }

  for (let i = 0; i < mediaBlocks; i += 1) {
    fragments.push({
      id: `media-${i}`,
      kind: 'media',
      style: {
        '--likes-fragment-x': `${Math.round(random() * 900) / 10}%`,
        '--likes-fragment-y': `${Math.round((2 + random() * 30) * 10) / 10}%`,
        '--likes-fragment-w': `${Math.round((34 + random() * 170) * 10) / 10}px`,
        '--likes-fragment-h': `${Math.round((8 + random() * 42) * 10) / 10}px`,
        '--likes-fragment-dx': `${Math.round((random() * 42 - 21) * 10) / 10}px`,
        '--likes-fragment-opacity': Math.round((0.18 + random() * 0.34) * 100) / 100,
        '--likes-fragment-bg-x': `${Math.round(random() * 1000) / 10}%`,
        '--likes-fragment-bg-y': `${Math.round(random() * 420) / 10}%`,
        '--likes-fragment-bg-size': `${Math.round((150 + random() * 180) * 10) / 10}%`,
      },
    })
  }

  return fragments
}

export default function LikesClient({ initialGlobalItems = [], initialFetchedAt = 0 }: LikesClientProps = {}) {
  const { t, locale, locales, setLocale } = useI18n()
  const cached = typeof window !== 'undefined' ? readWeCache() : null
  const [seedItems] = useState<GlobalLikeItem[]>(() => cached?.items ?? initialGlobalItems)
  const [seedTimestamp] = useState<number>(() => cached?.timestamp ?? initialFetchedAt)
  const [items, setItems] = useState<LikeItem[]>([])
  const [globalItems, setGlobalItems] = useState<GlobalLikeItem[]>(seedItems)
  const [globalLoaded, setGlobalLoaded] = useState(seedItems.length > 0)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [lastGlobalFetchedAt, setLastGlobalFetchedAt] = useState(seedTimestamp)
  const [activeTab, setActiveTab] = useState<'you' | 'we'>('you')
  const [themeIdx, setThemeIdx] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const globalLoadingRef = useRef(false)
  const initialGlobalRefreshRef = useRef(false)
  const previousActiveTabRef = useRef<'you' | 'we'>('you')
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterTypes, setFilterTypes] = useState<ItemType[]>(ALL_ITEM_TYPES)

  const cacheWeLikes = useCallback((entries: GlobalLikeItem[], timestamp: number) => {
    if (!timestamp) return
    writeWeLikesCache({ timestamp, items: entries })
  }, [])

  useEffect(() => {
    if (!seedItems.length || !seedTimestamp) return
    cacheWeLikes(seedItems, seedTimestamp)
  }, [cacheWeLikes, seedItems, seedTimestamp])

  useEffect(() => {
    try {
      const parsed = readWeLikesCache<GlobalLikeItem>()
      if (!parsed) return
      if (parsed.timestamp <= (seedTimestamp || 0)) return
      setGlobalItems(parsed.items)
      setGlobalLoaded(parsed.items.length > 0)
      setLastGlobalFetchedAt(parsed.timestamp)
    } catch {
      /* ignore */
    }
  }, [seedTimestamp])

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    burgerTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 360)
  }, [])

  useEffect(() => () => {
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
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
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const load = () => {
    try { clearExpired() } catch {}
    setItems(getAll())
  }

  useEffect(() => {
    // thème cohérent avec la home
    try {
      const fromQuery = new URLSearchParams(location.search).get('theme')
      let base = fromQuery != null ? Number(fromQuery) : Number(localStorage.getItem('themeIdx') || 0)
      base = isFinite(base) ? base : 0
      const randomShift = Math.floor(Math.random() * THEMES.length)
      const finalIdx = (Math.abs(Math.floor(base)) + randomShift) % THEMES.length
      setThemeIdx(finalIdx)
    } catch {
      setThemeIdx(Math.floor(Math.random() * THEMES.length))
    }
    load()

    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === 'likes') load() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!menuOpen) setLanguagesOpen(false)
  }, [menuOpen])

  const theme = useMemo(() => THEMES[themeIdx], [themeIdx])
  type ThemeStyle = CSSProperties & { ['--theme-cream']?: string }
  const mainStyle = useMemo<ThemeStyle>(() => ({
    background: theme.bg,
    color: theme.cream,
    '--theme-cream': theme.cream,
  }), [theme.bg, theme.cream])
  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp']) as Lang[]
  const adFormat = useMemo(() => {
    if (vw >= 1024) return { width: 728, height: 90, variant: 'desktop' as const }
    return { width: 320, height: 50, variant: 'mobile' as const }
  }, [vw])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--ad-bar-height', `${adFormat.height}px`)
    return () => {
      document.documentElement.style.removeProperty('--ad-bar-height')
    }
  }, [adFormat.height])

  const ensureGlobalLikes = useCallback((force = false) => {
    if (globalLoadingRef.current) return
    const isStale = !lastGlobalFetchedAt || Date.now() - lastGlobalFetchedAt > WE_CACHE_TTL_MS
    if (!force && globalLoaded && !isStale) return
    globalLoadingRef.current = true
    setGlobalLoading(true)
    fetchGlobalTop(GLOBAL_LIKES_LIMIT)
      .then((result) => {
        setGlobalItems(result)
        setGlobalLoaded(true)
        const fetchedAt = Date.now()
        setLastGlobalFetchedAt(fetchedAt)
        cacheWeLikes(result, fetchedAt)
      })
      .catch(() => {
        if (!globalLoaded) setGlobalLoaded(true)
      })
      .finally(() => {
        globalLoadingRef.current = false
        setGlobalLoading(false)
      })
  }, [cacheWeLikes, globalLoaded, lastGlobalFetchedAt])

  useEffect(() => {
    if (initialGlobalRefreshRef.current) return
    initialGlobalRefreshRef.current = true
    ensureGlobalLikes(true)
  }, [ensureGlobalLikes])

  useEffect(() => {
    const previousTab = previousActiveTabRef.current
    previousActiveTabRef.current = activeTab
    if (activeTab !== 'we' || previousTab === 'we') return
    ensureGlobalLikes(true)
  }, [activeTab, ensureGlobalLikes])

  useEffect(() => {
    const onWeLikesInvalidated = () => {
      setLastGlobalFetchedAt(0)
      if (activeTab === 'we') {
        ensureGlobalLikes(true)
      }
    }

    window.addEventListener(WE_LIKES_INVALIDATED_EVENT, onWeLikesInvalidated)
    return () => window.removeEventListener(WE_LIKES_INVALIDATED_EVENT, onWeLikesInvalidated)
  }, [activeTab, ensureGlobalLikes])

  const accentColor = theme.text
  const cream = theme.cream

  const infoText = activeTab === 'you'
    ? {
        prefix: t('likes.banner.youPrefix', 'Your'),
        suffix: t('likes.banner.youSuffix', 'stay on this device.'),
      }
    : {
        prefix: t('likes.banner.wePrefix', 'Here are the most'),
        suffix: t('likes.banner.weSuffix', 'contents.'),
      }

  const filterSet = useMemo(() => new Set(filterTypes), [filterTypes])
  const likesGlitchPool = useMemo<LikesGlitchSource[]>(() => {
    const activeSource: LikesGlitchSource[] = activeTab === 'you' ? items : globalItems
    const activeItems = activeSource.filter((item) => filterSet.has(toKnownItemType(item.type)))
    if (activeItems.length) return activeItems
    return [...items, ...globalItems].filter((item) => filterSet.has(toKnownItemType(item.type)))
  }, [activeTab, filterSet, globalItems, items])
  const likesGlitchSeed = useMemo(() => {
    const sample = likesGlitchPool
      .slice(0, 24)
      .map((item) => `${item.id}:${item.likedAt || ''}:${item.provider || ''}`)
      .join('|')
    return `${activeTab}:${accentColor}:${likesGlitchPool.length}:${sample}`
  }, [accentColor, activeTab, likesGlitchPool])
  const likesGlitchImage = useMemo(
    () => pickLikesGlitchImage(likesGlitchPool, likesGlitchSeed),
    [likesGlitchPool, likesGlitchSeed],
  )
  const likesGlitchFragments = useMemo(
    () => buildLikesGlitchFragments(likesGlitchImage, likesGlitchSeed, vw),
    [likesGlitchImage, likesGlitchSeed, vw],
  )
  const likesGlitchStyle = useMemo<LikesGlitchBgStyle>(() => ({
    '--likes-bg-image': cssImageUrl(likesGlitchImage),
    '--likes-bg-accent': accentColor,
    '--likes-bg-media-opacity': likesGlitchImage ? 0.28 : 0,
  }), [accentColor, likesGlitchImage])

  const adBar = (
    <div
      id="ad-bar"
      className="fixed bottom-0 left-0 right-0 flex items-center justify-center"
      style={{
        height: adFormat.height,
        backgroundColor: '#ffffff',
        color: '#111',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 120,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: adFormat.width, height: adFormat.height }}
      >
        <AadsFooterSlot variant={adFormat.variant} />
      </div>
    </div>
  )

  const renderGrid = () => {
    if (activeTab === 'you') {
      if (!items.length) {
        return (
          <div className="opacity-85 text-center mt-10 px-4 font-inter">
            {t('likes.empty', 'No likes yet. Open something in the modal and tap the heart.')}
          </div>
        )
      }

      const filtered = items.filter((entry) => filterSet.has(entry.type as ItemType))

      if (!filtered.length) {
        return (
          <div className="opacity-85 text-center mt-10 px-4 font-inter">
            {t('likes.filteredEmpty', 'Nothing matches the current filter yet.')}
          </div>
        )
      }

      return <LikesGrid items={filtered} onDelete={load} />
    }

    if (globalLoading && !globalLoaded) {
      return (
        <div className="opacity-85 text-center mt-10 px-4 font-inter">
          Loading…
        </div>
      )
    }

    if (!globalItems.length) {
      return (
        <div className="opacity-85 text-center mt-10 px-4 font-inter">
          {t('likes.weEmpty', 'No global favourites yet. Be the first to like something!')}
        </div>
      )
    }

    const filtered = globalItems.filter((entry) => filterSet.has(entry.type as ItemType))

    if (!filtered.length) {
      return (
        <div className="opacity-85 text-center mt-10 px-4 font-inter">
          {t('likes.filteredEmpty', 'Nothing matches the current filter yet.')}
        </div>
      )
    }

    return <LikesGrid items={filtered} readOnly />
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden pb-[calc(var(--ad-bar-height,0px)+24px)]"
      style={mainStyle}
    >
      <div className="likes-immersive-bg" style={likesGlitchStyle} aria-hidden="true">
        <div className="likes-immersive-bg__media" />
        <div className="likes-immersive-bg__fragments">
          {likesGlitchFragments.map((fragment) => (
            <i
              key={fragment.id}
              className={`likes-glitch-fragment likes-glitch-fragment--${fragment.kind}`}
              style={fragment.style}
            />
          ))}
        </div>
        <div className="likes-immersive-bg__tone" />
        <div className="likes-immersive-bg__scan" />
      </div>

      <header className="relative z-10 px-6 pt-4 pb-2 flex items-center justify-between">
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
        </div>

        <LogoAnimated trigger={1} toSecond={false} vhMobile={8} vhDesktop={8} gapMobile={4} gapDesktop={4} />

        <button
          type="button"
          aria-label="Filter likes"
          onClick={() => setFilterOpen(true)}
          className="flex items-center p-2"
        >
          <MonoIcon src="/icons/Shuffle.svg" color={cream} size={28} />
        </button>
      </header>

      <div className="relative z-10 mt-4 mx-4 flex items-center justify-center gap-2">
        <LikeTab
          label={t('likes.youTab', 'YOU')}
          active={activeTab === 'you'}
          onClick={() => setActiveTab('you')}
          accent={accentColor}
          cream={cream}
        />
        <LikeTab
          label={t('likes.weTab', 'WE')}
          active={activeTab === 'we'}
          onClick={() => setActiveTab('we')}
          accent={accentColor}
          cream={cream}
        />
      </div>

      <div className="relative z-10 mt-4 px-4 sm:px-6">
        <div
          className="px-4 py-2 text-center flex items-center justify-center gap-2 rounded-none text-xl sm:text-3xl"
          style={{
            backgroundColor: '#f1ead5',
            color: '#191916',
            fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
            fontWeight: 500,
          }}
        >
          <span>{infoText.prefix}</span>
          <HeartIcon color={accentColor} size={28} />
          <span>{infoText.suffix}</span>
        </div>
      </div>

      <section className="relative z-10 mt-4 pb-12">
        <div className="px-4 sm:px-6">
          {renderGrid()}
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
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        selected={filterTypes}
        onChange={(next) => setFilterTypes(next.length ? next : ALL_ITEM_TYPES)}
        theme={theme}
      />

      <style jsx global>{`
        .likes-immersive-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 10%, color-mix(in srgb, var(--likes-bg-accent) 20%, transparent), transparent 38%),
            #050505;
          contain: paint;
        }

        .likes-immersive-bg__media {
          position: absolute;
          inset: -12%;
          background-image: var(--likes-bg-image);
          background-size: cover;
          background-position: center 18%;
          opacity: var(--likes-bg-media-opacity);
          filter: blur(24px) saturate(2) contrast(1.45) brightness(0.35);
          transform: scale(1.12);
        }

        .likes-immersive-bg__media::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(5, 5, 5, 0.14), rgba(5, 5, 5, 0.72) 52%, rgba(5, 5, 5, 0.9)),
            linear-gradient(90deg, rgba(0, 0, 0, 0.52), transparent 32%, transparent 68%, rgba(0, 0, 0, 0.52));
        }

        .likes-immersive-bg__fragments {
          position: absolute;
          inset: 0;
          -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 35%, rgba(0, 0, 0, 0.35) 48%, transparent 66%);
          mask-image: linear-gradient(to bottom, #000 0%, #000 35%, rgba(0, 0, 0, 0.35) 48%, transparent 66%);
        }

        .likes-glitch-fragment {
          position: absolute;
          left: var(--likes-fragment-x);
          top: var(--likes-fragment-y);
          width: var(--likes-fragment-w);
          height: var(--likes-fragment-h);
          opacity: var(--likes-fragment-opacity);
          transform: translate3d(var(--likes-fragment-dx), 0, 0);
          display: block;
        }

        .likes-glitch-fragment--line {
          background: linear-gradient(90deg, transparent, var(--likes-fragment-color), rgba(255, 255, 255, 0.7), var(--likes-fragment-color), transparent);
          box-shadow: 0 0 10px color-mix(in srgb, var(--likes-fragment-color) 78%, transparent);
        }

        .likes-glitch-fragment--block {
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--likes-fragment-color) 68%, transparent), rgba(255, 255, 255, 0.22), transparent),
            var(--likes-fragment-color);
          mix-blend-mode: screen;
          box-shadow: 0 0 14px color-mix(in srgb, var(--likes-fragment-color) 66%, transparent);
        }

        .likes-glitch-fragment--media {
          background-image: var(--likes-bg-image);
          background-size: var(--likes-fragment-bg-size);
          background-position: var(--likes-fragment-bg-x) var(--likes-fragment-bg-y);
          filter: saturate(2.4) contrast(1.8) brightness(0.82);
          mix-blend-mode: screen;
          box-shadow: 0 0 18px color-mix(in srgb, var(--likes-bg-accent) 55%, transparent);
        }

        .likes-immersive-bg__tone {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.58) 46%, rgba(0, 0, 0, 0.78)),
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--likes-bg-accent) 18%, transparent), transparent 46%);
        }

        .likes-immersive-bg__scan {
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 4px),
            repeating-linear-gradient(180deg, transparent 0 13px, rgba(0, 232, 255, 0.05) 13px 14px, transparent 14px 19px);
          opacity: 0.32;
          mix-blend-mode: screen;
        }

        @media (min-width: 768px) {
          .likes-immersive-bg__scan {
            opacity: 0.22;
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

        .like-tab {
          position: relative;
          overflow: hidden;
        }
        .like-tab::after,
        .like-tab::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
        }
        .like-tab--glitch::before {
          animation: like-tab-glitch 280ms steps(2, jump-end) forwards;
        }
        @keyframes like-tab-glitch {
          0% {
            opacity: 0.6;
            transform: translate(2px, -1px) skewX(-6deg);
            box-shadow: -3px 0 rgba(42,219,113,0.45), 3px 0 rgba(255,255,255,0.2);
          }
          40% {
            opacity: 0.4;
            transform: translate(-3px, 2px) skewX(5deg);
            box-shadow: 3px 0 rgba(42,219,113,0.3), -3px 0 rgba(255,255,255,0.24);
          }
          100% {
            opacity: 0;
            transform: translate(0,0) skewX(0deg);
            box-shadow: none;
          }
        }
      `}</style>
    </main>
  )
}

type LikeTabProps = {
  label: string
  active: boolean
  onClick: () => void
  accent: string
  cream: string
}

function LikeTab({ label, active, onClick, accent, cream }: LikeTabProps) {
  const activeBg = accent
  const inactiveBorder = cream

  return (
    <button
      type="button"
      onClick={(event) => {
        const target = event.currentTarget
        target.classList.add('like-tab--glitch')
        window.setTimeout(() => target.classList.remove('like-tab--glitch'), 320)
        onClick()
      }}
      className={`flex items-center justify-center gap-1 sm:gap-2 px-12 sm:px-16 py-2 border-2 uppercase tracking-wide text-4xl sm:text-6xl transition focus:outline-none like-tab${active ? ' like-tab--active' : ''}`}
      style={{
        background: active ? activeBg : 'transparent',
        color: active ? '#051609' : cream,
        borderColor: active ? activeBg : inactiveBorder,
        fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
        fontWeight: 700,
        flex: '1 1 0',
        borderRadius: '9999px',
      }}
    >
      <span>{label}</span>
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 'min(1.1em, 32px)',
          height: 'min(1.1em, 32px)',
          minWidth: 'min(1.1em, 32px)',
          minHeight: 'min(1.1em, 32px)',
        }}
      >
        <HeartIcon color={active ? '#fff' : accent} size="100%" className="block" />
      </span>
    </button>
  )
}
