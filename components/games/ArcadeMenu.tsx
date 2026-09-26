'use client'

/**
 * The Random menu, on a game's page: the same burger at the top left and
 * the same panel in the theme's colour — Home, Random, Likes, the language,
 * the legal pages, Add, the site's points. No sound switch: the games make
 * no sound. The panel is put on the page's body, so it stands over the
 * game's frame and not only over the header it opens from.
 */

import Link from 'next/link'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import MonoIcon from '@/components/MonoIcon'
import { PUBLIC_APP_PATHS } from '@/lib/navigation/appPaths'
import type { Theme } from '@/lib/theme'
import { useI18n } from '@/providers/I18nProvider'
import { useScore } from '@/providers/ScoreProvider'

type Lang = 'en' | 'fr' | 'de' | 'jp' | 'es'

/** The language chosen, told to the rest of the site the way the Random page tells it. */
function applyLangOut(next: Lang) {
  try {
    document.documentElement.setAttribute('lang', next)
    const globalWindow = window as Window & { __APP_LANG?: Lang }
    globalWindow.__APP_LANG = next
    document.cookie = `lang=${next}; path=/; max-age=${60 * 60 * 24 * 365}`
    globalWindow.dispatchEvent(new CustomEvent('i18n:changed', { detail: next }))
  } catch {
    /* ignore */
  }
}

export function BurgerIcon({ color }: { color: string }) {
  return (
    <span className="inline-flex h-5 w-7 flex-col justify-between" aria-hidden>
      <span className="block h-[3px]" style={{ backgroundColor: color }} />
      <span className="block h-[3px]" style={{ backgroundColor: color }} />
      <span className="block h-[3px]" style={{ backgroundColor: color }} />
    </span>
  )
}

export default function ArcadeMenu({ theme, onOpen }: { theme: Theme; onOpen?: () => void }) {
  const { locale, locales, setLocale, t } = useI18n()
  const { points } = useScore()
  const [open, setOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp', 'es']) as Lang[]
  const close = () => setOpen(false)
  const paths = PUBLIC_APP_PATHS

  return (
    <>
      <button type="button" aria-label="Menu" onClick={() => { onOpen?.(); setOpen(true) }} className="flex items-center">
        <BurgerIcon color={theme.text} />
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="absolute inset-0" onClick={close} />
          <div
            className="relative flex w-[min(360px,92vw)] flex-col gap-3 rounded-3xl px-6 pb-6 pt-4 shadow-2xl"
            style={{ backgroundColor: theme.text, color: theme.cream, fontFamily: 'var(--font-inter-tight), sans-serif' }}
          >
            <div className="flex items-center justify-end">
              <button type="button" aria-label="Close" onClick={close} className="text-2xl" style={{ color: theme.cream }}>×</button>
            </div>
            <nav className="flex flex-col text-lg font-semibold uppercase" style={{ gap: '10px' }}>
              <Link href={paths.home} onClick={close} className="flex items-center" style={{ color: theme.cream }}>Home</Link>
              <Link href={paths.random} onClick={close} className="flex items-center" style={{ color: theme.cream }}>Random</Link>
              <Link href={paths.likes} onClick={close} className="flex items-center gap-2" style={{ color: theme.cream }}>
                <span>{t('likes.title', 'Likes')}</span>
                <MonoIcon src="/icons/Heart.svg" color={theme.cream} size={18} />
              </Link>
              <div className="flex flex-col gap-3">
                <button type="button" onClick={() => setLanguagesOpen((o) => !o)} className="flex w-full items-center justify-between" style={{ color: theme.cream }}>
                  <span className="uppercase">{t('language.title', 'Language')}</span>
                  <span>{(locale || 'en').toUpperCase()}</span>
                </button>
                {languagesOpen ? (
                  <ul className="space-y-2 text-base font-semibold">
                    {langs.map((lang) => (
                      <li key={lang}>
                        <button
                          type="button"
                          onClick={() => { setLocale(lang); applyLangOut(lang); setLanguagesOpen(false); close() }}
                          className="w-full rounded-xl px-3 py-2 text-left"
                          style={{ backgroundColor: (locale || 'en') === lang ? 'rgba(25,25,22,0.25)' : 'rgba(25,25,22,0.12)', color: theme.cream }}
                        >
                          {lang.toUpperCase()}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Link href="/legal" onClick={close} className="text-lg font-semibold" style={{ color: theme.cream }}>{t('legal.title', 'Legal notice')}</Link>
              <Link href="/privacy" onClick={close} className="text-lg font-semibold" style={{ color: theme.cream }}>{t('legal.privacy.privacyPolicy', 'Privacy')}</Link>
              <Link href="/add" onClick={close} className="flex items-center gap-2" style={{ color: theme.cream }}>
                <span>Add</span>
                <MonoIcon src="/icons/plus.svg" color={theme.cream} size={18} />
              </Link>
              <span className="text-lg font-semibold uppercase" style={{ color: '#191916' }}>{points} PTS</span>
            </nav>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
