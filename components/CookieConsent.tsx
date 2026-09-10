'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  CONSENT_KEY,
  denied,
  grantMediaConsent,
  hasOptionalConsent,
  normalizeConsent,
  recordConsent,
  type Consent,
  type ConsentRecord,
} from '@/lib/privacy/consent'
import {
  browserConsentStores,
  markVisitAway,
  persistConsent,
  readStoredConsent,
  recordRemoteRefusal,
  resumeVisit,
} from '@/lib/privacy/storage'

export type { Consent } from '@/lib/privacy/consent'
export type Region = 'eu' | 'us' | 'other'

type Ctx = {
  consent: Consent | null
  decided: boolean
  isBannerOpen: boolean
  isSettingsOpen: boolean
  allowMedia: () => void
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
  const recordRef = useRef<ConsentRecord | null>(null)
  const [ready, setReady] = useState(false)
  const [gpc, setGpc] = useState(false)
  const [isSettingsOpen, setSettingsOpen] = useState(false)

  const updateRecord = useCallback((next: ConsentRecord | null) => {
    recordRef.current = next
    setRecord(next)
  }, [])

  useEffect(() => {
    const stores = browserConsentStores()
    let away: number | null = null

    resumeVisit(stores)
    setGpc(readGpc())
    updateRecord(readStoredConsent(stores, Date.now(), readGpc()))
    setReady(true)

    const storage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== stores.persistent) return
      if (event.key !== CONSENT_KEY && event.key !== null) return
      setGpc(readGpc())
      if (event.key === CONSENT_KEY && event.newValue === null) {
        updateRecord(recordRemoteRefusal(stores))
      } else if (event.key === null) {
        updateRecord(null)
      } else {
        updateRecord(readStoredConsent(stores, Date.now(), readGpc()))
      }
    }

    const leave = () => {
      // pagehide may follow visibilitychange: retain the start of the absence.
      if (away === null) {
        away = Date.now()
        markVisitAway(stores, away)
      }
    }

    const returned = () => {
      const renewed = resumeVisit(stores, Date.now(), away)
      away = null
      setGpc(readGpc())
      const current = recordRef.current
      if (
        current &&
        (current.expiresAt <= Date.now() || (renewed && !hasOptionalConsent(current.choices)))
      ) {
        updateRecord(null)
      }
    }

    const visibility = () => {
      if (document.visibilityState === 'hidden') leave()
      else returned()
    }
    const focus = () => setGpc(readGpc())

    window.addEventListener('storage', storage)
    window.addEventListener('focus', focus)
    window.addEventListener('pagehide', leave)
    window.addEventListener('pageshow', returned)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', focus)
      window.removeEventListener('pagehide', leave)
      window.removeEventListener('pageshow', returned)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [updateRecord])

  useEffect(() => {
    if (!record) return
    let timer: number
    const schedule = () => {
      const remaining = record.expiresAt - Date.now()
      if (remaining <= 0) {
        updateRecord(null)
        return
      }
      timer = window.setTimeout(schedule, Math.min(remaining, 2_147_483_647))
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [record, updateRecord])

  useEffect(() => {
    if (!gpc || !record?.choices.ads) return
    const updated = { ...record, choices: normalizeConsent(record.choices, true) }
    updateRecord(updated)
    persistConsent(browserConsentStores(), updated)
  }, [gpc, record, updateRecord])

  const commit = useCallback(
    (value: ConsentRecord, signal: boolean) => {
      setGpc(signal)
      updateRecord(value)
      setReady(true)
      setSettingsOpen(false)
      persistConsent(browserConsentStores(), value)
    },
    [updateRecord],
  )

  const save = useCallback(
    (next: Consent) => {
      const signal = readGpc()
      commit(recordConsent(next, Date.now(), signal), signal)
    },
    [commit],
  )

  const allowMedia = useCallback(() => {
    const signal = readGpc()
    commit(grantMediaConsent(recordRef.current, Date.now(), signal), signal)
  }, [commit])

  const acceptAll = useCallback(
    () => save({ ...denied(), ads: true, media: true }),
    [save],
  )
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
      allowMedia,
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
      allowMedia,
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
