'use client'

import CookieSettingsLink from '@/components/CookieSettingsLink'
import MonoIcon from '@/components/MonoIcon'
import { THEMES } from '@/lib/theme'
import { useI18n } from '@/providers/I18nProvider'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Lang = 'en' | 'fr' | 'de' | 'jp'

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

export default function LegalPage() {
  const { t, locale, locales, setLocale } = useI18n()

  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [themeIdx] = useState(() => Math.floor(Math.random() * THEMES.length))
  const theme = THEMES[themeIdx]

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

  useEffect(() => {
    if (!menuOpen) setLanguagesOpen(false)
  }, [menuOpen])

  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const subtitle = useMemo(() => t('legal.subtitle', 'Transparency & accountability'), [t])
  const disclaimerTitle = useMemo(() => t('legal.disclaimer.title', 'Disclaimer'), [t])
  const disclaimerBody = useMemo(() => t('legal.disclaimer.body'), [t])

  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp']) as Lang[]

  return (
    <main
      className="min-h-screen px-6 py-8 md:py-12 flex flex-col"
      style={{ backgroundColor: '#000', color: '#F8F5E6' }}
    >
      <header className="flex items-center justify-between gap-4 mb-6">
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

        <div className="text-right flex-1">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">
            {legalLabel}
          </h1>
          <p className="text-xs md:text-sm uppercase tracking-widest opacity-70 mt-1">
            {subtitle}
          </p>
        </div>
      </header>

      <article className="w-full max-w-4xl mx-auto space-y-8">
        <section
          className="border-2 p-6 shadow-lg"
          style={{
            borderColor: '#ff4d4d',
            backgroundColor: '#b1001f',
            color: '#fff5f5',
          }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#ffe0e0' }}>
            {disclaimerTitle}
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
            {disclaimerBody}
          </p>
        </section>

        <section className="space-y-6 text-base leading-relaxed">
          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.editor.title')}
            </h3>
            <p className="mt-2 whitespace-pre-line opacity-90">
              {t('legal.editor.body')}
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.hosting.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.hosting.body')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.purpose.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.purpose.body')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.privacy.title')}
            </h3>
            <p className="mt-2 opacity-90">
              {t('legal.privacy.bodyPrefix')}{' '}
              <CookieSettingsLink>{t('legal.privacy.manageCookies')}</CookieSettingsLink>
              <span className="mx-1">·</span>
              <a href="/privacy" className="underline">
                {t('legal.privacy.privacyPolicy')}
              </a>
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.usa.title')}
            </h3>
            <p className="mt-2 opacity-90">
              {t('legal.usa.bodyPrefix')}{' '}
              <a href="/privacy#do-not-sell" className="underline">
                {t('legal.usa.doNotSell')}
              </a>
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.dmca.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.dmca.body')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.law.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.law.body')}</p>
          </div>
        </section>
      </article>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
          <div
            className="relative w-[min(360px,92vw)] rounded-3xl px-6 py-7 flex flex-col gap-6 shadow-2xl"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              fontFamily: 'var(--font-inter-tight), sans-serif',
            }}
          >
            <div className="flex items-center justify-between uppercase tracking-wide">
              <span className="text-lg font-bold">Menu</span>
              <button type="button" aria-label="Close" onClick={() => setMenuOpen(false)} className="text-2xl" style={{ color: theme.cream }}>
                ×
              </button>
            </div>

            <nav className="flex flex-col gap-5 text-lg font-semibold uppercase">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream }}
              >
                <span>Home</span>
              </Link>

              <Link
                href="/likes"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2"
                style={{ color: theme.cream }}
              >
                <span>{likesLabel}</span>
                <MonoIcon src="/icons/Heart.svg" color={theme.cream} size={24} />
              </Link>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setLanguagesOpen((o) => !o)}
                  className="w-full flex items-center justify-between"
                  style={{ color: theme.cream }}
                >
                  <span>{languageLabel}</span>
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
            </nav>
          </div>
        </div>
      ) : null}

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
      `}</style>
    </main>
  )
}
