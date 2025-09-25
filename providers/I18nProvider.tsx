'use client'

import { createContext, useContext, useMemo, useState } from 'react'

// ⬅️ chemins corrigés depuis /providers → /lib/i18n/dictionaries
import enDictionary from '../lib/i18n/dictionaries/en'
import frDictionary from '../lib/i18n/dictionaries/fr'
import deDictionary from '../lib/i18n/dictionaries/de'
import jpDictionary from '../lib/i18n/dictionaries/jp'

type Dictionary = Record<string, unknown>

const DICTS = {
  en: enDictionary,
  fr: frDictionary,
  de: deDictionary,
  jp: jpDictionary,
} satisfies Record<string, Dictionary>

type Locale = keyof typeof DICTS
type Dict = Dictionary

function getFromDict(dict: Dict, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, dict)
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
  const t = (path: string, fallback?: string) => {
    const value = getFromDict(dict, path)
    if (value === undefined || value === null) return fallback ?? path
    return typeof value === 'string' ? value : String(value)
  }

  const value: Ctx = {
    locale,
    setLocale: (l) => setLocale(normalize(l)),
    locales: Object.keys(DICTS) as Locale[],
    dict,
    t,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
