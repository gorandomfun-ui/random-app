'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import LikesGrid from '../../components/LikesGrid'
import { LikeItem, getAll, clearExpired } from '../../utils/likes'
import LogoAnimated from '../../components/LogoAnimated'

const THEMES = [
  { bg:'#65002d', deep:'#8c0040', cream:'#FEFBE8', text:'#00b176' },
  { bg:'#191916', deep:'#2d2d27', cream:'#fff7e2', text:'#d90845' },
  { bg:'#08203d', deep:'#0f2f53', cream:'#fff6ee', text:'#0078a4' },
  { bg:'#0c390d', deep:'#145b16', cream:'#eefdf3', text:'#ff978f' },
  { bg:'#4ecc7f', deep:'#2c8a56', cream:'#f7efff', text:'#007861' },
  { bg:'#ff978f', deep:'#d46c65', cream:'#f6fbff', text:'#463b46' },
]

export default function LikesPage() {
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
      style={{ background: theme.bg, color: theme.cream }}
    >
      {/* Header */}
      <header className="relative px-4 pt-4 pb-2">
        {/* Bouton Home : Inter Tight Bold + icône return.svg */}
        <Link
          href="/"
          aria-label="Back to home"
          className="absolute left-4 top-7 inline-flex items-center gap-2 rounded-xl px-3 py-2 hover:opacity-90 transition"
          style={{ fontFamily: 'var(--font-inter-tight)', fontWeight: 700 }} // Inter Tight Bold
        >
          <Image src="/icons/return.svg" alt="" width={32} height={32} priority />
          {/*<span>Home</span>*/}
        </Link>

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
        className="fixed bottom-0 left-0 right-0 flex items-center justify-center"
        style={{ minHeight: adFormat.height, backgroundColor: '#ffffff', color: '#111', paddingBottom: 'env(safe-area-inset-bottom, 0px)', zIndex: 60 }}
      >
        <div
          className="flex items-center justify-center border border-dashed border-neutral-300 rounded"
          style={{ width: adFormat.width, minHeight: adFormat.height }}
        >
          <span className="font-inter font-semibold opacity-70">Ad space</span>
        </div>
      </div>
    </main>
  )
}
