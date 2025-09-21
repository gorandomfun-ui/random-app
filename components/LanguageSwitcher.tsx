'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../providers/I18nProvider'

type Lang = 'en' | 'fr' | 'de' | 'jp'

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n() as any
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Couleurs dynamiques depuis le rendu réel
  const [bg, setBg] = useState<string>('rgba(0,0,0,0.9)')
  const [fg, setFg] = useState<string>('#FFF8E6')

  function refreshColors() {
    try {
      if (btnRef.current) {
        const cs = getComputedStyle(btnRef.current)
        const txt = cs.color || 'rgba(0,0,0,0.9)'
        setBg(txt)
      }
      const root = document.documentElement
      const creamVar =
        getComputedStyle(root).getPropertyValue('--theme-cream').trim() ||
        getComputedStyle(document.body).getPropertyValue('--theme-cream').trim()
      if (creamVar) setFg(creamVar)
    } catch {}
  }

  useEffect(() => {
    refreshColors()
  }, [])

  useEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: Math.max(8, r.right - 180) })
    refreshColors()
  }, [open])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open) return
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const langs: Lang[] = ['en', 'fr', 'de', 'jp']

  // -- helper: applique la langue "vers l'extérieur" pour les composants qui écoutent
  const applyLangOut = (next: Lang) => {
    try {
      document.documentElement.setAttribute('lang', next)
      ;(window as any).__APP_LANG = next
      // Notifie les listeners (EncouragementLayer l'écoute)
      window.dispatchEvent(new CustomEvent('i18n:changed', { detail: next }))
    } catch {}
  }

  // Sync automatique quand `locale` change via le provider (ex: navigation)
  useEffect(() => {
    if (!locale) return
    applyLangOut(locale as Lang)
  }, [locale])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className="ml-1 rounded-full px-2 py-1 text-[10px] font-bold border border-white/20 hover:bg-white/10"
        aria-label="change language"
      >
        {(locale || 'en').toUpperCase()}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed z-[2200] w-[180px] rounded-2xl shadow-2xl border backdrop-blur"
          style={{
            top: pos.top,
            left: pos.left,
            backgroundColor: bg,
            color: fg,
            borderColor: 'rgba(0,0,0,0.25)',
          }}
        >
          <div className="p-2">
            <div className="px-2 py-1 text-[11px] uppercase tracking-wide" style={{ color: fg, opacity: 0.75 }}>
              Language
            </div>
            <ul className="mt-1">
              {langs.map(l => {
                const active = (locale || 'en') === l
                return (
                  <li key={l}>
                    <button
                      onClick={() => {
                        // met à jour l'état i18n global...
                        setLocale(l)
                        // ...et pousse l'info immédiatement aux listeners
                        applyLangOut(l)
                        setOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl"
                      style={{
                        color: fg,
                        backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = active ? 'rgba(255,255,255,0.12)' : 'transparent'
                      }}
                    >
                      {l.toUpperCase()}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
