'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AADS_REFRESH_EVENT,
  type AadsRefreshEvent,
  type AadsRefreshTarget,
  type AadsSlotStatus,
} from '@/lib/aads'

const INLINE_DESKTOP_ID = process.env.NEXT_PUBLIC_AADS_INFEED_DESKTOP_ID
const INLINE_MOBILE_ID = process.env.NEXT_PUBLIC_AADS_INFEED_MOBILE_ID
const MIN_REFRESH_MS = 60_000

type Variant = 'desktop' | 'mobile'

let inlineVisibilityOwner: string | null = null

const claimInlineSlot = (slotId: string) => {
  if (inlineVisibilityOwner && inlineVisibilityOwner !== slotId) return false
  inlineVisibilityOwner = slotId
  return true
}

const releaseInlineSlot = (slotId: string) => {
  if (inlineVisibilityOwner === slotId) {
    inlineVisibilityOwner = null
  }
}

type Props = {
  label: string
  variant: Variant
  forceVisible?: boolean
  refreshTarget?: AadsRefreshTarget | null
  onStatusChange?: (status: AadsSlotStatus) => void
}

export default function AadsInlineContentAd({
  label,
  variant,
  forceVisible = false,
  refreshTarget = 'inline',
  onStatusChange,
}: Props) {
  const slotIdRef = useRef(`inline-${Math.random().toString(36).slice(2)}`)
  const [intersecting, setIntersecting] = useState(forceVisible)
  const [active, setActive] = useState(forceVisible)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const lastRefreshRef = useRef(0)
  const unitId = getUnitId(variant)
  // A-ADS is cookieless and shown without a consent gate, in every region.
  const effectiveEnabled = true
  const [status, setStatus] = useState<AadsSlotStatus>(() => (effectiveEnabled && unitId ? 'idle' : 'empty'))

  const [nonce, setNonce] = useState(0)

  const size = useMemo(() => {
    if (variant === 'desktop') return { width: 728, height: 90 }
    return { width: 300, height: 250 }
  }, [variant])

  /**
   * A-ADS checks one page and reads what the server sent, without running it.
   * A frame built by hand once the page is running exists nowhere in that page,
   * so these two units could never be verified. Both are written now, at their
   * own address and in A-ADS's own shape, and the one that does not belong on
   * this screen is left to the style sheet.
   */
  const otherId = variant === 'desktop' ? INLINE_MOBILE_ID : INLINE_DESKTOP_ID
  const otherSize = variant === 'desktop' ? '300x250' : '728x90'
  const adUrl = unitId ? `https://acceptable.a-ads.com/${encodeURIComponent(unitId)}/?size=${size.width}x${size.height}` : null
  const otherUrl = otherId ? `https://acceptable.a-ads.com/${encodeURIComponent(otherId)}/?size=${otherSize}` : null

  useEffect(() => () => releaseInlineSlot(slotIdRef.current), [])

  useEffect(() => {
    if (forceVisible) {
      setIntersecting(true)
      setActive(true)
      return undefined
    }
    const node = wrapperRef.current
    if (!node) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setIntersecting(Boolean(entry?.isIntersecting))
      },
      { threshold: 0.4, rootMargin: '120px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [forceVisible])

  useEffect(() => {
    if (forceVisible) return
    const slotId = slotIdRef.current
    if (!intersecting) {
      releaseInlineSlot(slotId)
      setActive(false)
      return undefined
    }
    if (!claimInlineSlot(slotId)) {
      setActive(false)
      return undefined
    }
    setActive(true)
    return () => releaseInlineSlot(slotId)
  }, [forceVisible, intersecting])

  const visible = status === 'visible'
  const reserved = status === 'loading' || visible

  useEffect(() => {
    onStatusChange?.(status)
  }, [onStatusChange, status])

  useEffect(() => {
    if (!unitId) setStatus('empty')
  }, [unitId])

  const requestAd = useCallback(() => {
    if (!active || !effectiveEnabled || !unitId) {
      setStatus('empty')
      return
    }
    setNonce((value) => value + 1)
    lastRefreshRef.current = Date.now()
  }, [active, effectiveEnabled, unitId])

  useEffect(() => {
    if (!refreshTarget) return
    const handler = (event: Event) => {
      const custom = event as AadsRefreshEvent
      if (!active || !effectiveEnabled) return
      if (custom.detail?.slot !== refreshTarget) return
      if (Date.now() - lastRefreshRef.current < MIN_REFRESH_MS) return
      requestAd()
    }
    window.addEventListener(AADS_REFRESH_EVENT, handler)
    return () => window.removeEventListener(AADS_REFRESH_EVENT, handler)
  }, [active, effectiveEnabled, refreshTarget, requestAd])

  return (
    <div
      ref={wrapperRef}
      className="w-full"
      style={{
        minHeight: reserved ? (variant === 'desktop' ? 120 : 260) : 0,
        height: reserved ? undefined : 0,
        overflow: reserved ? 'visible' : 'hidden',
      }}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center rounded-3xl border border-white/15 bg-white/5 px-4 py-5"
        aria-hidden={status === 'empty'}
        style={{
          opacity: status === 'empty' ? 0 : 1,
          pointerEvents: status === 'empty' ? 'none' : 'auto',
        }}
      >
        {visible ? (
          <span className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-neutral-400">
            {label}
          </span>
        ) : null}
        <div id="frame" className="relative flex items-center justify-center" style={{ width: size.width, maxWidth: '100%', height: size.height }}>
          {adUrl && effectiveEnabled ? (
            <iframe
              key={nonce}
              data-aa={unitId}
              src={adUrl}
              title="advertisement"
              width="100%"
              height="100%"
              scrolling="no"
              frameBorder={0}
              loading="lazy"
              style={{ border: 0, padding: 0, width: '100%', height: '100%', overflow: 'hidden', background: 'transparent' }}
              onLoad={() => setStatus('visible')}
              onError={() => setStatus('empty')}
            />
          ) : null}
          {otherUrl && effectiveEnabled ? (
            <iframe
              className="aads-other-format"
              data-aa={otherId}
              src={otherUrl}
              title="advertisement"
              scrolling="no"
              frameBorder={0}
              loading="lazy"
              style={{ border: 0, padding: 0, overflow: 'hidden', background: 'transparent', position: 'absolute', inset: 0, margin: 'auto' }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function getUnitId(variant: Variant) {
  return variant === 'desktop' ? INLINE_DESKTOP_ID : INLINE_MOBILE_ID
}
