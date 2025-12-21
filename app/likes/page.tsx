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

type Lang = 'en' | 'fr' | 'de' | 'jp'

const ALL_ITEM_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']

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

export default function LikesPage() {
  const { t, locale, locales, setLocale } = useI18n()
  const [items, setItems] = useState<LikeItem[]>([])
  const [globalItems, setGlobalItems] = useState<GlobalLikeItem[]>([])
  const [globalLoaded, setGlobalLoaded] = useState(false)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'you' | 'we'>('you')
  const [themeIdx, setThemeIdx] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterTypes, setFilterTypes] = useState<ItemType[]>(ALL_ITEM_TYPES)

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
  const noroscopeLabel = useMemo(() => t('noroscope.menu', '6 RANDOM'), [t])
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

  useEffect(() => {
    if (activeTab !== 'we' || globalLoaded || globalLoading) return
    setGlobalLoading(true)
    fetchGlobalTop(100)
      .then((result) => {
        setGlobalItems(result)
        setGlobalLoaded(true)
      })
      .catch(() => setGlobalLoaded(true))
      .finally(() => setGlobalLoading(false))
  }, [activeTab, globalLoaded, globalLoading])

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
      className="min-h-screen pb-[calc(var(--ad-bar-height,0px)+24px)]"
      style={mainStyle}
    >
      <header className="px-6 pt-4 pb-2 flex items-center justify-between">
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

      <div className="mt-4 mx-4 flex items-center justify-center gap-2">
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

      <div className="mt-4 px-4 sm:px-6">
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

      <section className="mt-4 pb-12">
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
                href="/6random"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream }}
              >
                <span>{noroscopeLabel}</span>
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
