'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import LikesGrid from '../../components/LikesGrid'
import { LikeItem, getAll, clearExpired } from '../../utils/likes'
import LogoAnimated from '../../components/LogoAnimated'

const THEMES = [
  { bg:'#f8c021', deep:'#ff3500', cream:'#FEFBE8', text:'#ff3500' },
  { bg:'#ff7a3b', deep:'#b90045', cream:'#fff7e2', text:'#b90045' },
  { bg:'#347ad9', deep:'#0013a4', cream:'#fff6ee', text:'#0013a4' },
  { bg:'#ff3500', deep:'#ffc300', cream:'#eefdf3', text:'#ffc300' },
  { bg:'#00d440', deep:'#007861', cream:'#f7efff', text:'#007861' },
  { bg:'#7706b2', deep:'#4ecc7f', cream:'#f6fbff', text:'#4ecc7f' },
]

export default function LikesPage() {
  const [items, setItems] = useState<LikeItem[]>([])
  const [themeIdx, setThemeIdx] = useState(0)

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

  const theme = useMemo(() => THEMES[themeIdx], [themeIdx])

  return (
    <main className="min-h-screen" style={{ background: theme.bg, color: theme.cream }}>
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
    </main>
  )
}
