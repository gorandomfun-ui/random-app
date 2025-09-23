'use client'

import { useEffect, useMemo, useRef, useState, useLayoutEffect, type RefObject, type CSSProperties } from 'react'
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
import MonoIcon from '../components/MonoIcon'
import AnimatedButtonLabel from '../components/AnimatedButtonLabel'

type ItemType = 'image'|'video'|'quote'|'joke'|'fact'|'web'

const THEMES = [
  { bg:'#65002d', deep:'#43001f', cream:'#FEFBE8', text:'#00b176' },
  { bg:'#191916', deep:'#2e2e28', cream:'#fff7e2', text:'#d90845' },
  { bg:'#051d37', deep:'#082f4b', cream:'#fff6ee', text:'#e5972b' },
  { bg:'#0c390d', deep:'#155a1a', cream:'#eefdf3', text:'#ff978f' },
  { bg:'#0fc55d', deep:'#0a8f43', cream:'#f7efff', text:'#3d42cc' },
  { bg:'#ff978f', deep:'#d46c65', cream:'#f6fbff', text:'#463b46' },
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
      const viewportW = window.innerWidth

      let next: number | null = null

      if (logoEl && viewportW < 768) {
        const { width } = logoEl.getBoundingClientRect()
        if (width > 0) next = Math.round(width + 6)
      }

      if (next == null) {
        if (heroEl) {
          const rect = heroEl.getBoundingClientRect()

          // Heuristique “2 lignes” : ~66% de la largeur visuelle du titre,
          // plafonnée pour éviter le bouton géant au 1er paint.
          const ideal = Math.min(rect.width * 0.66, 880)
          next = Math.max(280, Math.round(ideal))
        } else {
          next = 280
        }
      }

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
    const ro = logoNode && 'ResizeObserver' in window
      ? new ResizeObserver(() => schedule())
      : null
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
  const { dict, locale } = useI18n() as any

  const HEADER_H = 56
  const FOOTER_H = 56
  const AD_H = 108

  const headerRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const logoRef = useRef<HTMLDivElement | null>(null)
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
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const [reservedHeight, setReservedHeight] = useState(HEADER_H + FOOTER_H + AD_H)
  const [adHeight, setAdHeight] = useState(AD_H)

  // sélection utilisateur (par défaut : tout)
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>(['image','video','quote','joke','fact','web'])
  const [seqIndex, setSeqIndex] = useState(0)

  const [currentItem, setCurrentItem] = useState<any>(null)
  const lang = (locale || 'en') as 'en'|'fr'|'de'|'jp'
  const [isButtonBursting, setIsButtonBursting] = useState(false)
  const burstMountRef = useRef(true)

  useEffect(() => {
    const t = randIdx(THEMES.length)
    setThemeIdx(t)
    setModalThemeIdx(randDiffIdx(THEMES.length, t))
  }, [])

  const theme = THEMES[themeIdx]
  const modalTheme = THEMES[modalThemeIdx]

  const mainStyle = useMemo(() => {
    const base: CSSProperties = {
      backgroundColor: theme.bg,
      color: theme.cream,
    }
    ;(base as any)['--theme-cream'] = theme.cream
    return base
  }, [theme.bg, theme.cream])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    let frame: number | null = null

    const measure = () => {
      frame = null
      setViewportHeight(window.innerHeight)
      setViewportWidth(window.innerWidth)
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

  useEffect(() => {
    if (burstMountRef.current) {
      burstMountRef.current = false
      return
    }
    setIsButtonBursting(true)
    const timer = setTimeout(() => setIsButtonBursting(false), 520)
    return () => clearTimeout(timer)
  }, [trigger])

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

  const adFormat = useMemo(() => {
    const width = viewportWidth ?? 0
    if (width && width >= 768) return { width: 728, height: 90 }
    return { width: 320, height: 50 }
  }, [viewportWidth])

  const shareFromFooter = () => {
    if (navigator.share) navigator.share({ title: 'Random', text: 'Random app', url: location.href }).catch(() => {})
    else { navigator.clipboard?.writeText(location.href); alert('Link copied!') }
  }

  /* ---------- largeur bouton : mesure du conteneur du logo ---------- */
  const targetBtnW = useButtonWidth(heroRef, logoRef)

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--ad-bar-height', `${adFormat.height}px`)
    return () => {
      document.documentElement.style.removeProperty('--ad-bar-height')
    }
  }, [adFormat.height])

  return (
     <>
    <main className="min-h-screen flex flex-col" style={mainStyle}>
      {/* Header */}
      <header ref={headerRef} className="relative flex items-center justify-between px-4 pt-4 pb-2" style={{ height: HEADER_H }}>
        <LikesMenu theme={theme} />

        <button className="absolute left-1/2 -translate-x-1/2" onClick={() => setIsShuffleOpen(true)} aria-label={dict?.shuffle?.title ?? 'Shuffle'}>
          <MonoIcon src="/icons/Shuffle.svg" color={theme.cream} size={28} />
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
              gapDesktop={5}
            />
          </div>

          {/* bouton calé “2 lignes” — fallback CSS pour le premier paint */}
          <div
            className="mt-6 mx-auto w-full max-w-[880px]"
            style={{ width: targetBtnW ? `${targetBtnW}px` : undefined }}
          >
            <button
              onClick={startRandom}
              className={`w-full px-10 py-3 rounded-[28px] shadow-md hover:scale-[1.03] transition uppercase flex items-center justify-center ${isButtonBursting ? 'btn-energized' : ''}`}
              style={{
                backgroundColor: theme.text,
                color: theme.cream,
                fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
                fontWeight: 700,
              }}
            >
              <span className="sr-only">{dict?.hero?.startButton ?? 'GO RANDOM'}</span>
              <AnimatedButtonLabel
                text={dict?.hero?.startButton ?? 'GO RANDOM'}
                color={theme.cream}
                trigger={trigger}
                toSecond={isSecond}
              />
            </button>
          </div>

          <p
            className="mt-4 font-tomorrow font-bold text-base md:text-xl leading-snug"
            style={{ color: theme.text, fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}
          >
            {(dict?.hero?.tagline1 ?? 'EXPLORE RANDOM CONTENTS.')}<br />
            {(dict?.hero?.tagline2 ?? 'NO NEWS, NO REASON, NO SENSE.')}<br />
            {(dict?.hero?.tagline3 ?? 'ONLY USELESS SURPRISE.')}
          </p>

          {/* Descriptif 4 + 2 */}
          <div
            className="mt-6 flex flex-col items-center font-inter font-semibold text-base md:text-lg tracking-tight"
            style={{ color: theme.cream, letterSpacing: '-0.01em' }}
          >
            <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 md:gap-x-1.5">
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/image.svg" color={theme.cream} size={20} /> {dict?.nav?.images ?? 'images'}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/Video.svg" color={theme.cream} size={20} /> {dict?.nav?.videos ?? 'videos'}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/web.svg" color={theme.cream} size={20} /> {dict?.nav?.web ?? 'web'}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/quote.svg" color={theme.cream} size={20} /> {dict?.nav?.quotes ?? 'quotes'}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 md:gap-x-1.5">
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/joke.svg" color={theme.cream} size={20} /> {dict?.nav?.jokes ?? 'funny jokes'}
              </span>
              <span className="opacity-70 select-none text-base md:text-lg leading-none" style={{ margin: '0 1px' }}>/</span>
              <span className="flex items-center gap-1 leading-tight">
                <MonoIcon src="/icons/fact.svg" color={theme.cream} size={20} /> {dict?.nav?.facts ?? 'facts'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer ref={footerRef} className="fixed left-0 right-0 z-20" style={{ bottom: `calc(${adHeight}px + env(safe-area-inset-bottom, 0px))`, height: FOOTER_H }}>
        <div className="w-full px-4 h-full flex items-center justify-between">
          <SocialPopover theme={theme} />
          <button className="flex items-center gap-2" onClick={() => setIsLegalOpen(true)}>
            <MonoIcon src="/icons/info.svg" color={theme.cream} size={20} />
            <span className="font-inter font-semibold">{dict?.footer?.legal ?? 'Legal notice.'}</span>
          </button>
          <button className="flex items-center gap-2" onClick={shareFromFooter}>
            <MonoIcon src="/icons/share.svg" color={theme.cream} size={20} />
            <span className="font-inter font-semibold">{dict?.footer?.share ?? 'share'}</span>
          </button>
        </div>
      </footer>

      {/* Ad bar */}
      <div
        ref={adRef}
        id="ad-bar"
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
