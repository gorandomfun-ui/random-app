'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import LikesGrid from '../../components/LikesGrid'
import { LikeItem, getAll, clearExpired } from '../../utils/likes'
import LogoAnimated from '../../components/LogoAnimated'
import MonoIcon from '../../components/MonoIcon'
import { useI18n } from '../../providers/I18nProvider'

const THEMES = [
  { bg:'#65002d', deep:'#43001f', cream:'#FEFBE8', text:'#00b176' },
  { bg:'#191916', deep:'#2e2e28', cream:'#fff7e2', text:'#d90845' },
  { bg:'#051d37', deep:'#082f4b', cream:'#fff6ee', text:'#e5972b' },
  { bg:'#0c390d', deep:'#155a1a', cream:'#eefdf3', text:'#ff978f' },
  { bg:'#0fc55d', deep:'#0a8f43', cream:'#f7efff', text:'#3d42cc' },
  { bg:'#ff978f', deep:'#d46c65', cream:'#f6fbff', text:'#463b46' },
]

export default function LikesPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<LikeItem[]>([])
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
      const idx = fromQuery != null ? Number(fromQuery) : Number(localStorage.getItem('themeIdx') || 0)
      const safe = Math.max(0, Math.min(THEMES.length - 1, isFinite(idx) ? idx : 0))
      setThemeIdx(safe)
    } catch { setThemeIdx(0) }
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
    background: '#191916',
    color: theme.cream,
    '--theme-cream': theme.cream,
  }), [theme.cream])
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

  return (
    <main
      className="min-h-screen pb-[calc(var(--ad-bar-height,0px)+24px)]"
      style={mainStyle}
    >
      {/* Header */}
      <header className="px-4 pt-4 pb-2 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="justify-self-start">
          <Link
            href="/"
            aria-label="Back to home"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 hover:opacity-90 transition"
            style={{ fontFamily: 'var(--font-inter-tight)', fontWeight: 700 }}
          >
            <MonoIcon src="/icons/return.svg" color={theme.cream} size={32} />
          </Link>
        </div>

        <div className="flex items-center justify-center">
          <LogoAnimated
            trigger={1}
            toSecond={false}
            fitToWidth
            vhMobile={8}
            vhDesktop={10}
            gapMobile={1}
            gapDesktop={1}
          />
        </div>

        <span
          className="justify-self-end max-w-[220px] text-[11px] sm:text-xs leading-snug font-inter text-right"
          style={{ color: theme.cream, opacity: 0.8 }}
        >
          {t('likes.keep24h', 'Saved here for 24h.')}
        </span>
      </header>

      {/* Contenu : mosaïque bord à bord */}
      <section className="pb-10">
        {items.length ? (
          <LikesGrid items={items} onDelete={load} />
        ) : (
          <div className="opacity-85 text-center mt-10 px-4">
            No likes yet. Open something in the modal and tap the heart.
          </div>
        )}
      </section>

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
    </main>
  )
}
