'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import HouseAd from './HouseAd'
import {
  AADS_REFRESH_EVENT,
  type AadsRefreshEvent,
  type AadsRefreshTarget,
  mountAadsSlot,
} from '@/lib/aads'

const FOOTER_DESKTOP_ID = process.env.NEXT_PUBLIC_AADS_BANNER_DESKTOP_ID
const FOOTER_MOBILE_ID = process.env.NEXT_PUBLIC_AADS_BANNER_MOBILE_ID
const MIN_REFRESH_MS = 60_000

type Variant = 'desktop' | 'mobile'

type Props = {
  variant: Variant
  enabled?: boolean
  label?: string | null
  refreshTarget?: AadsRefreshTarget | null
}

export default function AadsFooterSlot({
  variant,
  enabled = true,
  label = null,
  refreshTarget = 'footer',
}: Props) {
  const unitId = variant === 'desktop' ? FOOTER_DESKTOP_ID : FOOTER_MOBILE_ID
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const lastRefreshRef = useRef(0)
  const [fallback, setFallback] = useState(() => !enabled || !unitId)

  const requestAd = useCallback(() => {
    cleanupRef.current?.()
    const container = containerRef.current
    if (!container || !enabled || !unitId) {
      setFallback(true)
      return
    }
    setFallback(false)
    cleanupRef.current = mountAadsSlot(container, unitId, {
      onLoad: () => setFallback(false),
      onFallback: () => setFallback(true),
    })
    lastRefreshRef.current = Date.now()
  }, [enabled, unitId])

  useEffect(() => {
    if (!unitId) {
      setFallback(true)
    }
  }, [unitId])

  useEffect(() => {
    if (!enabled) {
      setFallback(true)
      cleanupRef.current?.()
      return
    }
    requestAd()
    return () => cleanupRef.current?.()
  }, [enabled, requestAd])

  useEffect(() => {
    if (!refreshTarget) return
    const handler = (event: Event) => {
      const custom = event as AadsRefreshEvent
      if (!enabled) return
      if (custom.detail?.slot !== refreshTarget) return
      if (Date.now() - lastRefreshRef.current < MIN_REFRESH_MS) return
      requestAd()
    }
    window.addEventListener(AADS_REFRESH_EVENT, handler)
    return () => window.removeEventListener(AADS_REFRESH_EVENT, handler)
  }, [enabled, refreshTarget, requestAd])

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      {label ? (
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
          {label}
        </span>
      ) : null}
      <div className="relative flex h-full w-full items-center justify-center">
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ display: fallback ? 'none' : 'block' }}
        />
        {fallback ? <HouseAd orientation="horizontal" /> : null}
      </div>
    </div>
  )
}
