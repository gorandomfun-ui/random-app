'use client'

import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import LogoAnimated from '../components/LogoAnimated'
import RandomModal from '../components/RandomModal'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ShufflePicker from '../components/ShufflePicker'
import LegalModal from '../components/LegalModal'
import SocialPopover from '../components/SocialPopover'
import LikesMenu from '../components/LikesMenu'
import { useI18n } from '../providers/I18nProvider'
import { fetchRandom } from '../lib/api'
import { playRandom, playAgain } from '../utils/sound'
import EncouragementLayer from '../components/EncouragementLayer'
import { registerRandomClick } from '../lib/encourage/register'

type ItemType = 'image'|'video'|'quote'|'joke'|'fact'|'web'

const THEMES = [
  { bg:'#f8c021', deep:'#ff3500', cream:'#FEFBE8', text:'#ff3500' },
  { bg:'#ff7a3b', deep:'#b90045', cream:'#fff7e2', text:'#b90045' },
  { bg:'#347ad9', deep:'#0013a4', cream:'#fff6ee', text:'#0013a4' },
  { bg:'#ff3500', deep:'#ffc300', cream:'#eefdf3', text:'#ffc300' },
  { bg:'#00d440', deep:'#007861', cream:'#f7efff', text:'#007861' },
  { bg:'#7706b2', deep:'#4ecc7f', cream:'#f6fbff', text:'#4ecc7f' },
]

// séquence fixe (on applique ensuite le filtre de ShufflePicker)
const FIXED_SEQUENCE: ItemType[] = ['image','video','quote','joke','video','fact','image','web']

const randIdx = (max: number) => Math.floor(Math.random() * max)
const randDiffIdx = (max: number, not: number) => {
  if (max <= 1) return 0
  let i = randIdx(max)
  if (i === not) i = (i + 1 + randIdx(max - 1)) % max
  return i
}

/* ---------------------- hook: largeur “idéale” du bouton ---------------------- */
function useButtonWidth(heroRef: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState<number | null>(null)

  useLayoutEffect(() => {
    const calc = () => {
      const el = heroRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()

      // Heuristique “2 lignes” : ~66% de la largeur visuelle du titre,
      // plafonnée pour éviter le bouton géant au 1er paint.
      const ideal = Math.min(rect.width * 0.66, 880)
      const clamped = Math.max(280, Math.round(ideal))
      setW(clamped)
    }

    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [heroRef])

  return w
}

export default function HomePage() {
  const { dict, locale } = useI18n() as any

  const HEADER_H = 56
  const FOOTER_H = 56
  const AD_H = 108

  const headerRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const footerRef = useRef<HTMLElement | null>(null)
  const adRef = useRef<HTMLDivElement | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isShuffleOpen, setIsShuffleOpen] = useState(false)
  const [isLegalOpen, setIsLegalOpen] = useState(false)
  const [trigger, setTrigger] = useState(0)
  const [isSecond, setIsSecond] = useState(false)
  const [themeIdx, setThemeIdx] = useState(0)
  const [modalThemeIdx, setModalThemeIdx] = useState(1)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [reservedHeight, setReservedHeight] = useState(HEADER_H + FOOTER_H + AD_H)
  const [adHeight, setAdHeight] = useState(AD_H)

  // sélection utilisateur (par défaut : tout)
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>(['image','video','quote','joke','fact','web'])
  const [seqIndex, setSeqIndex] = useState(0)

  const [currentItem, setCurrentItem] = useState<any>(null)
  const lang = (locale || 'en') as 'en'|'fr'|'de'|'jp'

  useEffect(() => {
    const t = randIdx(THEMES.length)
    setThemeIdx(t)
    setModalThemeIdx(randDiffIdx(THEMES.length, t))
  }, [])

  const theme = THEMES[themeIdx]
  const modalTheme = THEMES[modalThemeIdx]

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    let frame: number | null = null

    const measure = () => {
      frame = null
      setViewportHeight(window.innerHeight)
      const headerH = headerRef.current?.getBoundingClientRect().height ?? HEADER_H
      const footerH = footerRef.current?.getBoundingClientRect().height ?? FOOTER_H
      const adH = adRef.current?.getBoundingClientRect().height ?? AD_H
      setReservedHeight(headerH + footerH + adH)
      setAdHeight(adH)
    }

    const schedule = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    schedule()
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.visualViewport?.addEventListener('resize', schedule)

    const node = adRef.current
    const resizeObs = node && 'ResizeObserver' in window
      ? new ResizeObserver(schedule)
      : null
    if (resizeObs && node) resizeObs.observe(node)

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      resizeObs?.disconnect()
    }
  }, [])

  // séquence filtrée (on conserve l'ordre)
  const filteredSequence = useMemo<ItemType[]>(() => {
    const allow = new Set(selectedTypes)
    const seq = FIXED_SEQUENCE.filter(t => allow.has(t))
    return seq.length ? seq : FIXED_SEQUENCE.slice()
  }, [selectedTypes])

  function getNextTypeAndAdvance(): ItemType {
    const nextType = filteredSequence[seqIndex % filteredSequence.length]
    setSeqIndex(i => i + 1)
    return nextType
  }

  const startRandom = async () => {
    registerRandomClick();
    const next = !isSecond
    setIsSecond(next)
    setTrigger(t => t + 1)

    try {
      const t = getNextTypeAndAdvance()
      const res = await fetchRandom({ types: [t] as any, lang })
      setCurrentItem(res?.item || null)
      const contrast = Math.random() < 0.7
      if (contrast) setModalThemeIdx(randDiffIdx(THEMES.length, themeIdx))
      setIsModalOpen(true)
      playRandom()
    } catch {
      setCurrentItem(null)
      setIsModalOpen(true)
      playRandom()
    }
  }

  const randomAgain = async () => {
    registerRandomClick();
    const next = !isSecond
    setIsSecond(next)
    setTrigger(t => t + 1)

    try {
      const t = getNextTypeAndAdvance()
      const res = await fetchRandom({ types: [t] as any, lang })
      setCurrentItem(res?.item || null)
    } catch {}

    if (Math.random() < 0.5) {
      setModalThemeIdx(i => randDiffIdx(THEMES.length, i))
    } else {
      setThemeIdx(i => {
        const ni = randDiffIdx(THEMES.length, i)
        if (ni === modalThemeIdx) setModalThemeIdx(randDiffIdx(THEMES.length, ni))
        return ni
      })
    }
    playAgain()
  }

  const heroAvailable = viewportHeight != null ? viewportHeight - reservedHeight : null
  const heroMinHeight: number | string = heroAvailable != null
    ? Math.max(heroAvailable, 360)
    : `calc(100dvh - ${reservedHeight}px)`

  const shareFromFooter = () => {
    if (navigator.share) navigator.share({ title: 'Random', text: 'Random app', url: location.href }).catch(() => {})
    else { navigator.clipboard?.writeText(location.href); alert('Link copied!') }
  }

  /* ---------- largeur bouton : mesure du conteneur du logo ---------- */
  const targetBtnW = useButtonWidth(heroRef)

  return (
     <>
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: theme.bg, color: theme.cream }}>
      {/* Header */}
      <header ref={headerRef} className="relative flex items-center justify-between px-4 pt-4 pb-2" style={{ height: HEADER_H }}>
        <LikesMenu theme={theme} />

        <button className="absolute left-1/2 -translate-x-1/2" onClick={() => setIsShuffleOpen(true)} aria-label={dict?.shuffle?.title ?? 'Shuffle'}>
          <img src="/icons/Shuffle.svg" alt="shuffle" className="h-7 w-7" />
        </button>

        <span className="text-xs font-bold flex items-center" style={{ color: theme.text }}>
  V 0.1.<LanguageSwitcher />
</span>
      </header>

      {/* Centre */}
      <section
        ref={heroRef}
        className="flex flex-col items-center px-4 flex-1 justify-center text-center"
        style={{
          minHeight: heroMinHeight,
          paddingTop: 'clamp(12px, 4vh, 48px)',
          paddingBottom: `calc(clamp(28px, 5vh, 56px) + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div className="flex flex-col items-center w-full" style={{ marginTop: 'calc(-1 * clamp(20px, 8vh, 80px))' }}>
          <LogoAnimated
            className="mx-auto"
            trigger={trigger}
            toSecond={isSecond}
            twoLineOnMobile
            vhMobile={18}
            vhDesktop={40}
            gapMobile={5}
            gapDesktop={5}
          />

          {/* bouton calé “2 lignes” — fallback CSS pour le premier paint */}
          <div
            className="mt-6 mx-auto w-full max-w-[880px]"
            style={{ width: targetBtnW ? `${targetBtnW}px` : undefined }}
          >
            <button
              onClick={startRandom}
              className="w-full px-10 py-3 rounded-[28px] shadow-md hover:scale-[1.03] transition uppercase"
              style={{
                backgroundColor: theme.deep,
                color: theme.cream,
                fontFamily: "'Tomorrow', sans-serif",
                fontWeight: 700,
              }}
            >
              {dict?.hero?.startButton ?? 'GO RANDOM'}
            </button>
          </div>

          <p
            className="mt-5 font-tomorrow font-bold text-lg md:text-xl leading-snug"
            style={{ color: theme.text, fontFamily: "'Tomorrow', sans-serif", fontWeight: 700 }}
          >
            {(dict?.hero?.tagline1 ?? 'EXPLORE RANDOM CONTENTS.')}<br />
            {(dict?.hero?.tagline2 ?? 'NO NEWS, NO REASON, NO SENSE.')}<br />
            {(dict?.hero?.tagline3 ?? 'ONLY USELESS SURPRISE.')}
          </p>

          {/* Descriptif 4 + 2 */}
          <div className="mt-4 hidden flex-col items-center font-inter font-semibold md:flex" style={{ color: theme.text }}>
            <div className="flex items-center justify-center gap-x-3">
              <span className="flex items-center gap-1.5"><img src="/icons/image.svg" className="h-5 w-5" alt="" /> {dict?.nav?.images ?? 'images'}</span>
              <span className="opacity-50 mx-1 select-none">/</span>
              <span className="flex items-center gap-1.5"><img src="/icons/Video.svg" className="h-5 w-5" alt="" /> {dict?.nav?.videos ?? 'videos'}</span>
              <span className="opacity-50 mx-1 select-none">/</span>
              <span className="flex items-center gap-1.5"><img src="/icons/web.svg" className="h-5 w-5" alt="" /> {dict?.nav?.web ?? 'web'}</span>
              <span className="opacity-50 mx-1 select-none">/</span>
              <span className="flex items-center gap-1.5"><img src="/icons/quote.svg" className="h-5 w-5" alt="" /> {dict?.nav?.quotes ?? 'quotes'}</span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-x-3">
              <span className="flex items-center gap-1.5"><img src="/icons/joke.svg" className="h-5 w-5" alt="" /> {dict?.nav?.jokes ?? 'funny jokes'}</span>
              <span className="opacity-50 mx-1 select-none">/</span>
              <span className="flex items-center gap-1.5"><img src="/icons/fact.svg" className="h-5 w-5" alt="" /> {dict?.nav?.facts ?? 'facts'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer ref={footerRef} className="fixed left-0 right-0 z-20" style={{ bottom: `calc(${adHeight}px + env(safe-area-inset-bottom, 0px))`, height: FOOTER_H }}>
        <div className="w-full px-4 h-full flex items-center justify-between">
          <SocialPopover theme={theme} />
          <button className="flex items-center gap-2" onClick={() => setIsLegalOpen(true)}>
            <img src="/icons/info.svg" className="h-5 w-5" alt="" />
            <span className="font-inter font-semibold">{dict?.footer?.legal ?? 'Legal notice.'}</span>
          </button>
          <button className="flex items-center gap-2" onClick={shareFromFooter}>
            <img src="/icons/share.svg" className="h-5 w-5" alt="" />
            <span className="font-inter font-semibold">{dict?.footer?.share ?? 'share'}</span>
          </button>
        </div>
      </footer>

      {/* Ad bar */}
      <div
        ref={adRef}
        id="ad-bar"
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center"
        style={{ height: AD_H, backgroundColor: '#ffffff', color: '#111', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <span className="font-inter font-semibold opacity-70">Ad space</span>
      </div>

      {/* Popups */}
      <ShufflePicker
        open={isShuffleOpen}
        onClose={() => setIsShuffleOpen(false)}
        selected={selectedTypes}
        onChange={(next) => {
          setSelectedTypes(next)
          setSeqIndex(0)
        }}
        theme={theme}
      />
      <LegalModal open={isLegalOpen} onClose={() => setIsLegalOpen(false)} />
      <RandomModal
        types={filteredSequence as any}
        lang={lang}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRandomAgain={randomAgain}
        trigger={trigger}
        isSecond={isSecond}
        theme={modalTheme}
        forceItem={currentItem}
      />
    </main>
    <EncouragementLayer />
    </>
  )
}
