'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  CONSENT_KEY,
  LEGACY_CONSENT_KEY,
  denied,
  normalizeConsent,
  parseConsent,
  recordConsent,
  type Consent,
  type ConsentRecord,
} from '@/lib/privacy/consent'

export type { Consent } from '@/lib/privacy/consent'
export type Region = 'eu' | 'us' | 'other'

type Ctx = {
  consent: Consent | null
  decided: boolean
  isBannerOpen: boolean
  isSettingsOpen: boolean
  acceptAll: () => void
  rejectAll: () => void
  save: (next: Consent) => void
  openSettings: () => void
  closeSettings: () => void
  region: Region
  gpc: boolean
}

const Context = createContext<Ctx | null>(null)

function readGpc() {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

export function CookieConsentProvider({
  children,
  region = 'other',
}: {
  children: ReactNode
  region?: Region
}) {
  const [record, setRecord] = useState<ConsentRecord | null>(null)
  const [ready, setReady] = useState(false)
  const [gpc, setGpc] = useState(false)
  const [isSettingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const read = () => {
      setGpc(readGpc())
      try {
        setRecord(parseConsent(localStorage.getItem(CONSENT_KEY)))
      } catch {
        setRecord(null)
      }
      setReady(true)
    }

    read()
    const storage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) read()
    }
    const focus = () => setGpc(readGpc())
    window.addEventListener('storage', storage)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', focus)
    }
  }, [])

  useEffect(() => {
    if (!record) return
    let timer: number
    const schedule = () => {
      const remaining = record.expiresAt - Date.now()
      if (remaining <= 0) {
        setRecord(null)
        return
      }
      timer = window.setTimeout(schedule, Math.min(remaining, 2_147_483_647))
    }
    schedule()
    const visible = () => {
      if (record.expiresAt <= Date.now()) setRecord(null)
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [record])

  useEffect(() => {
    if (!gpc || !record?.choices.ads) return
    const updated = { ...record, choices: normalizeConsent(record.choices, true) }
    setRecord(updated)
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(updated))
    } catch {
      /* Retained in memory. */
    }
  }, [gpc, record])

  const save = useCallback((next: Consent) => {
    const signal = readGpc()
    setGpc(signal)
    const value = recordConsent(next, Date.now(), signal)
    setRecord(value)
    setReady(true)
    setSettingsOpen(false)
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(value))
      localStorage.removeItem(LEGACY_CONSENT_KEY)
    } catch {
      /* Effective in this tab even without storage. */
    }
  }, [])

  const acceptAll = useCallback(() => save({ ...denied(), ads: true, media: true }), [save])
  const rejectAll = useCallback(() => save(denied()), [save])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const consent = useMemo(
    () => (record ? normalizeConsent(record.choices, gpc) : null),
    [record, gpc],
  )

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('cookie:ads-changed', { detail: consent?.ads === true }))
  }, [consent?.ads])

  const value = useMemo<Ctx>(
    () => ({
      consent,
      decided: consent !== null,
      isBannerOpen: ready && !consent && !isSettingsOpen,
      isSettingsOpen,
      acceptAll,
      rejectAll,
      save,
      openSettings,
      closeSettings,
      region,
      gpc,
    }),
    [
      consent,
      ready,
      isSettingsOpen,
      acceptAll,
      rejectAll,
      save,
      openSettings,
      closeSettings,
      region,
      gpc,
    ],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCookieConsent(): Ctx {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('CookieConsentProvider is missing')
  return ctx
}
