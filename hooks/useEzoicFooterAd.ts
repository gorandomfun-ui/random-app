'use client'

import { useEffect, useRef } from 'react'

const SCRIPT_ID = 'ezoic-sa-script'
const SCRIPT_SRC = 'https://www.ezojs.com/ezoic/sa.min.js'

const ENV_ENABLED = process.env.NEXT_PUBLIC_EZOIC_ENABLED === 'true'
const PLACEHOLDER_ID = (() => {
  const raw = process.env.NEXT_PUBLIC_EZOIC_PLACEHOLDER_ID_FOOTER ?? ''
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 118
})()
const REFRESH_SECONDS = (() => {
  const raw = process.env.NEXT_PUBLIC_EZOIC_REFRESH_MIN_SEC ?? ''
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 60
  return Math.max(parsed, 45)
})()

export const EZOIC_PLACEHOLDER_ID = PLACEHOLDER_ID

export function useEzoicFooterAd(enabled = true) {
  const retryTimerRef = useRef<number | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!ENV_ENABLED || !enabled) return undefined
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    let cancelled = false

    const ensureScript = () => {
      if (document.getElementById(SCRIPT_ID)) return
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      document.head.appendChild(script)
    }

    const ensureQueue = () => {
      const w = window as typeof window & {
        ezstandalone?: {
          showAds?: (id: number) => void
          cmd?: Array<() => void>
        }
      }
      if (!w.ezstandalone) {
        w.ezstandalone = { cmd: [] }
      } else if (!Array.isArray(w.ezstandalone.cmd)) {
        w.ezstandalone.cmd = []
      }
      return w.ezstandalone
    }

    const triggerAd = () => {
      const api = ensureQueue()
      if (typeof api.showAds === 'function') {
        api.showAds(PLACEHOLDER_ID)
        return true
      }
      api.cmd?.push(() => {
        if (!cancelled) {
          api.showAds?.(PLACEHOLDER_ID)
        }
      })
      return false
    }

    const scheduleRetry = () => {
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current)
      }
      retryTimerRef.current = window.setTimeout(() => {
        if (cancelled) return
        if (!triggerAd()) {
          scheduleRetry()
        }
      }, 1500)
    }

    ensureScript()

    if (!triggerAd()) {
      scheduleRetry()
    }

    if (REFRESH_SECONDS > 0) {
      refreshTimerRef.current = window.setInterval(() => {
        if (!cancelled) {
          triggerAd()
        }
      }, REFRESH_SECONDS * 1000)
    }

    return () => {
      cancelled = true
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      if (refreshTimerRef.current != null) {
        window.clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [enabled])
}
