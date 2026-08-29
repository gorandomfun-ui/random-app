'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AADS_REFRESH_EVENT,
  type AadsRefreshEvent,
  type AadsRefreshTarget,
  type AadsSlotStatus,
  mountAadsSlot,
} from '@/lib/aads'
import { useCookieConsent } from './CookieConsent'

const FOOTER_DESKTOP_ID = process.env.NEXT_PUBLIC_AADS_BANNER_DESKTOP_ID
const FOOTER_MOBILE_ID = process.env.NEXT_PUBLIC_AADS_BANNER_MOBILE_ID
const MIN_REFRESH_MS = 60_000

type Variant = 'desktop' | 'mobile'

type Props = {
  variant: Variant
  enabled?: boolean
  label?: string | null
  refreshTarget?: AadsRefreshTarget | null
  onVisibleChange?: (visible: boolean) => void
}

export default function AadsFooterSlot({
  variant,
  enabled = true,
  label = null,
  refreshTarget = 'footer',
  onVisibleChange,
}: Props) {
  const { consent } = useCookieConsent()
  const unitId = variant === 'desktop' ? FOOTER_DESKTOP_ID : FOOTER_MOBILE_ID
  const size = variant === 'desktop' ? '728x90' : '320x50'
  const effectiveEnabled = enabled && consent?.ads === true
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const lastRefreshRef = useRef(0)
  const [status, setStatus] = useState<AadsSlotStatus>(() => (effectiveEnabled && unitId ? 'idle' : 'empty'))
  const visible = status === 'visible'

  useEffect(() => {
    onVisibleChange?.(visible)
  }, [onVisibleChange, visible])

  const requestAd = useCallback(() => {
    cleanupRef.current?.()
    const container = containerRef.current
    if (!container || !effectiveEnabled || !unitId) {
      setStatus('empty')
      return
    }
    setStatus('loading')
    cleanupRef.current = mountAadsSlot(container, unitId, {
      onLoad: () => setStatus('visible'),
      onFallback: () => setStatus('empty'),
      size,
    })
    lastRefreshRef.current = Date.now()
  }, [effectiveEnabled, size, unitId])

  useEffect(() => {
    if (!unitId) {
      setStatus('empty')
    }
  }, [unitId])

  useEffect(() => {
    if (!effectiveEnabled) {
      setStatus('empty')
      cleanupRef.current?.()
      return
    }
    requestAd()
    return () => cleanupRef.current?.()
  }, [effectiveEnabled, requestAd])

  useEffect(() => {
    if (!refreshTarget) return
    const handler = (event: Event) => {
      const custom = event as AadsRefreshEvent
      if (!effectiveEnabled) return
      if (custom.detail?.slot !== refreshTarget) return
      if (Date.now() - lastRefreshRef.current < MIN_REFRESH_MS) return
      requestAd()
    }
    window.addEventListener(AADS_REFRESH_EVENT, handler)
    return () => window.removeEventListener(AADS_REFRESH_EVENT, handler)
  }, [effectiveEnabled, refreshTarget, requestAd])

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center"
      aria-hidden={!visible}
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {label && visible ? (
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
          {label}
        </span>
      ) : null}
      <div className="relative flex h-full w-full items-center justify-center">
        <div
          ref={containerRef}
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
