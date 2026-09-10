'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import MonoIcon from '@/components/MonoIcon'
import QuizScoreText from '@/components/QuizScoreText'
import { useI18n } from '@/providers/I18nProvider'

type Lang = 'en' | 'fr' | 'de' | 'jp' | 'es'

type LegalDocumentHeaderProps = {
  logoColor: 'black' | 'cream'
  burgerColor: string
  menuBackground: string
  menuColor: string
  scoreColor: string
}

const LOGO_LETTERS = ['R', 'A', 'N', 'D', 'O', 'M'] as const

function BurgerIcon({ color, glitch }: { color: string; glitch: boolean }) {
  return (
    <span
      className={`legal-burger-icon inline-flex h-5 w-7 flex-col justify-between${glitch ? ' legal-burger-icon--glitch' : ''}`}
      aria-hidden="true"
    >
      <span className="legal-burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="legal-burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="legal-burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
    </span>
  )
}

export default function LegalDocumentHeader({
  logoColor,
  burgerColor,
  menuBackground,
  menuColor,
  scoreColor,
}: LegalDocumentHeaderProps) {
  const { t, locale, locales, setLocale } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const privacyLabel = useMemo(() => t('legal.privacy.privacyPolicy', 'Privacy'), [t])
  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp', 'es']) as Lang[]

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    burgerTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 360)
  }, [])

  useEffect(() => () => {
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
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

  return (
    <>
      <header className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-3">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => {
            triggerBurgerGlitch()
            setMenuOpen(true)
          }}
          className="flex items-center justify-start"
        >
          <BurgerIcon color={burgerColor} glitch={burgerGlitch} />
        </button>

        <Link
          href="/"
          aria-label="RANDOM · Home"
          className="justify-self-center"
          style={{ filter: logoColor === 'black' ? 'brightness(0)' : undefined }}
        >
          <span className="inline-flex items-center gap-0.5 md:gap-[3px]" aria-hidden="true">
            {LOGO_LETTERS.map((letter) => (
              <img
                key={letter}
                src={`/logo/${letter}1.svg`}
                alt=""
                className="block h-[38px] w-auto md:h-12"
                draggable={false}
              />
            ))}
          </span>
        </Link>

        <span aria-hidden="true" />
      </header>

      {menuOpen ? (
        <div id="document-navigation" className="fixed inset-0 z-[190] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
          <div
            className="relative flex w-[min(360px,92vw)] flex-col gap-3 rounded-3xl px-6 pb-6 pt-4 shadow-2xl"
            style={{
              backgroundColor: menuBackground,
              color: menuColor,
              fontFamily: 'var(--font-inter-tight), sans-serif',
            }}
          >
            <div className="flex items-center justify-end">
              <button type="button" aria-label="Close" onClick={() => setMenuOpen(false)} className="text-2xl" style={{ color: menuColor }}>
                ×
              </button>
            </div>

            <nav className="flex flex-col text-lg font-semibold uppercase" style={{ gap: '10px' }}>
              <Link href="/" onClick={() => setMenuOpen(false)} className="flex items-center" style={{ color: menuColor }}>
                <span>Home</span>
              </Link>

              <Link href="/random" onClick={() => setMenuOpen(false)} className="flex items-center" style={{ color: menuColor }}>
                <span>Random</span>
              </Link>

              <Link href="/likes" onClick={() => setMenuOpen(false)} className="flex items-center gap-2" style={{ color: menuColor }}>
                <span>{likesLabel}</span>
                <MonoIcon src="/icons/Heart.svg" color={menuColor} size={18} />
              </Link>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setLanguagesOpen((open) => !open)}
                  className="flex w-full items-center justify-between"
                  style={{ color: menuColor }}
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
                            className="w-full rounded-xl px-3 py-2 text-left"
                            style={{
                              backgroundColor: active ? 'rgba(25,25,22,0.25)' : 'rgba(25,25,22,0.12)',
                              color: menuColor,
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

              <Link href="/legal" onClick={() => setMenuOpen(false)} style={{ color: menuColor }}>
                {legalLabel}
              </Link>

              <Link href="/privacy" onClick={() => setMenuOpen(false)} style={{ color: menuColor }}>
                {privacyLabel}
              </Link>

              <Link href="/add" onClick={() => setMenuOpen(false)} className="flex items-center gap-2" style={{ color: menuColor }}>
                <span>Add</span>
                <MonoIcon src="/icons/plus.svg" color={menuColor} size={18} />
              </Link>

              <QuizScoreText style={{ color: scoreColor }} />
            </nav>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .legal-burger-icon {
          position: relative;
        }
        .legal-burger-icon .legal-burger-line {
          width: 100%;
          border-radius: 9999px;
          transition: transform 140ms ease, opacity 140ms ease;
        }
        .legal-burger-icon--glitch .legal-burger-line {
          animation: legal-burger-glitch 360ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .legal-burger-icon--glitch .legal-burger-line:nth-child(2) {
          animation-delay: 40ms;
        }
        .legal-burger-icon--glitch .legal-burger-line:nth-child(3) {
          animation-delay: 80ms;
        }
        @keyframes legal-burger-glitch {
          0% { transform: translateX(0) skewX(0deg) scaleX(1); opacity: 1; box-shadow: none; filter: none; }
          20% { transform: translateX(-6px) skewX(-8deg) scaleX(1.06); opacity: 0.7; box-shadow: 4px 0 currentColor, -4px 0 rgba(255,255,255,0.75); filter: hue-rotate(-10deg) saturate(1.45); }
          48% { transform: translateX(6px) skewX(7deg) scaleX(0.94); opacity: 0.6; box-shadow: -4px 0 currentColor, 4px 0 rgba(255,255,255,0.55); filter: hue-rotate(9deg) saturate(1.35); }
          72% { transform: translateX(-3px) skewX(-5deg) scaleX(1.08); opacity: 0.85; box-shadow: 2px 0 currentColor, -2px 0 rgba(255,255,255,0.4); filter: hue-rotate(-6deg) saturate(1.25); }
          100% { transform: translateX(0) skewX(0deg) scaleX(1); opacity: 1; box-shadow: none; filter: none; }
        }
      `}</style>
    </>
  )
}
