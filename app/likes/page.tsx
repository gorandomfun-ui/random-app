'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import LikesGrid from '../../components/LikesGrid'
import { clearExpired, fetchGlobalTop, getAll, type GlobalLikeItem, type LikeItem } from '../../utils/likes'
import LogoAnimated from '../../components/LogoAnimated'
import MonoIcon from '../../components/MonoIcon'
import HeartIcon from '../../components/HeartIcon'
import { useI18n } from '../../providers/I18nProvider'
import { THEMES } from '@/lib/theme'

export default function LikesPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<LikeItem[]>([])
  const [globalItems, setGlobalItems] = useState<GlobalLikeItem[]>([])
  const [globalLoaded, setGlobalLoaded] = useState(false)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'you' | 'we'>('you')
  const [themeIdx, setThemeIdx] = useState(0)
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)

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

  const theme = useMemo(() => THEMES[themeIdx], [themeIdx])
  type ThemeStyle = CSSProperties & { ['--theme-cream']?: string }
  const mainStyle = useMemo<ThemeStyle>(() => ({
    background: theme.bg,
    color: theme.cream,
    '--theme-cream': theme.cream,
  }), [theme.bg, theme.cream])
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

  const description = activeTab === 'you'
    ? t('likes.youDescription', 'Your')
    : t('likes.weDescription', 'Here is the most')

  const heartInline = (
    <HeartIcon
      color={accentColor}
      size={28}
      className="inline-block align-middle mx-2"
    />
  )

  const baseText = activeTab === 'you'
    ? t('likes.youSuffix', 'are stored here for 24 hours.')
    : t('likes.weSuffix', 'content.')

  const adBar = (
    <div
      id="ad-bar"
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

  const renderGrid = () => {
    if (activeTab === 'you') {
      if (!items.length) {
        return (
          <div className="opacity-85 text-center mt-10 px-4 font-inter">
            {t('likes.empty', 'No likes yet. Open something in the modal and tap the heart.')}
          </div>
        )
      }
      return <LikesGrid items={items} onDelete={load} />
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

    return <LikesGrid items={globalItems} readOnly />
  }

  return (
    <main
      className="min-h-screen pb-[calc(var(--ad-bar-height,0px)+24px)]"
      style={mainStyle}
    >
      <header className="px-6 pt-4 pb-2 flex items-center justify-between">
        <Link
          href="/"
          aria-label="Back to home"
          className="inline-flex items-center gap-2 rounded-xl px-2 py-1 hover:opacity-90 transition"
          style={{ fontFamily: 'var(--font-inter-tight)', fontWeight: 700 }}
        >
          <MonoIcon src="/icons/return.svg" color={cream} size={32} />
        </Link>

        <LogoAnimated
          trigger={1}
          toSecond={false}
          fitToWidth
          vhMobile={8}
          vhDesktop={9}
          gapMobile={1}
          gapDesktop={1}
        />

        <div className="w-10" aria-hidden="true" />
      </header>

      <div className="border-y border-[var(--theme-cream)] mt-2">
        <div className="grid grid-cols-2 divide-x divide-[var(--theme-cream)]">
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
      </div>

      <p
        className="mt-4 text-center text-xl sm:text-2xl font-semibold"
        style={{ color: cream, letterSpacing: 'normal', fontFamily: 'var(--font-inter-tight), sans-serif' }}
      >
        <span>{description}</span>
        {heartInline}
        <span>{baseText}</span>
      </p>

      <section className="mt-4 pb-12">
        {renderGrid()}
      </section>

      {adBar}
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
  const heartColor = active ? cream : accent

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1 md:gap-2 py-[2px] md:py-[4px] uppercase font-tomorrow font-bold text-[64px] md:text-[84px]"
      style={{
        background: active ? accent : 'transparent',
        color: cream,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <span>{label}</span>
      <HeartIcon color={heartColor} size={56} className="inline-block" />
    </button>
  )
}
