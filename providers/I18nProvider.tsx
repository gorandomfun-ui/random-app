'use client'

import { createContext, useContext, useMemo, useState } from 'react'

// ⬅️ chemins corrigés depuis /providers → /lib/i18n/dictionaries
import en from '../lib/i18n/dictionaries/en'
import fr from '../lib/i18n/dictionaries/fr'
import de from '../lib/i18n/dictionaries/de'
import jp from '../lib/i18n/dictionaries/jp'

const DICTS = { en, fr, de, jp } as const
type Locale = keyof typeof DICTS
type Dict = (typeof DICTS)[Locale]

// helper "a.b.c" → dict.a?.b?.c ?? fallback
function getFromDict(dict: any, path: string, fallback?: string) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), dict) ?? fallback
}

type Ctx = {
  locale: Locale
  setLocale: (l: Locale) => void
  locales: Locale[]
  dict: Dict
  t: (path: string, fallback?: string) => string
}

const Ctx = createContext<Ctx | null>(null)
export const useI18n = () => {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

const normalize = (l: string): Locale => {
  const raw = (l || 'en').toLowerCase().trim()
  const primary = raw.split(/[-_]/)[0]
  if (primary === 'fr') return 'fr'
  if (primary === 'de') return 'de'
  if (primary === 'ja' || primary === 'jp') return 'jp'
  return 'en'
}

export default function I18nProvider({
  children,
  initialLocale = 'en',
}: {
  children: React.ReactNode
  initialLocale?: string
}) {
  const [locale, setLocale] = useState<Locale>(normalize(initialLocale))
  const dict = useMemo<Dict>(() => DICTS[locale], [locale])
  const t = (path: string, fallback?: string) => String(getFromDict(dict as any, path, fallback))

  const value: Ctx = {
    locale,
    setLocale: (l) => setLocale(normalize(l)),
    locales: Object.keys(DICTS) as Locale[],
    dict,
    t,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
