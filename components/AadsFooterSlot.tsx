'use client'

import { useEffect, useRef, useState } from 'react'

import {
  AADS_REFRESH_EVENT,
  type AadsRefreshEvent,
  type AadsRefreshTarget,
  type AadsSlotStatus,
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
  onVisibleChange?: (visible: boolean) => void
}

/**
 * Why both formats are written into the page.
 *
 * A-ADS checks one page and one page only, the address written on the unit, and
 * it does not run the page: it reads what the server sent. Deciding in the
 * browser which of the two banners to build meant the other one existed nowhere
 * in that page, so its unit could never be verified and stayed "Not found",
 * whatever the visitors did.
 *
 * Both are written now, and a plain media query shows the one that fits the
 * screen. A visitor sees a single banner, as before; the checker finds each unit
 * at the address it was given.
 */
export default function AadsFooterSlot({
  variant,
  enabled = true,
  label = null,
  refreshTarget = 'footer',
  onVisibleChange,
}: Props) {
  const unitId = variant === 'desktop' ? FOOTER_DESKTOP_ID : FOOTER_MOBILE_ID
  const size = variant === 'desktop' ? '728x90' : '320x50'
  const otherId = variant === 'desktop' ? FOOTER_MOBILE_ID : FOOTER_DESKTOP_ID
  const otherSize = variant === 'desktop' ? '320x50' : '728x90'
  const otherUrl = otherId ? `https://acceptable.a-ads.com/${encodeURIComponent(otherId)}/?size=${encodeURIComponent(otherSize)}` : null
  // A-ADS sets no cookie and tracks nobody, so the banner does not wait for the
  // privacy dialog: gated behind it, A-ADS's own bot found no ad unit on the page
  // and stopped counting anything.
  //
  // For the same reason the frame is written in the page rather than built by
  // hand once the page is running. A bot that reads the delivered page and does
  // not run its code saw an empty box, which is why all four units read "Not
  // found" on the dashboard and no paying advertiser was ever served: 694
  // requests, zero paid impressions.
  const effectiveEnabled = enabled
  const lastRefreshRef = useRef(0)
  const [nonce, setNonce] = useState(0)
  const [status, setStatus] = useState<AadsSlotStatus>(() => (effectiveEnabled && unitId ? 'idle' : 'empty'))
  const visible = status === 'visible'
  // The address and the shape of A-ADS's own snippet, to the letter: their
  // verifier looks for the code they hand out, and ours differed by a domain
  // and a trailing slash. Their two domains serve the same banner.
  const adUrl = unitId ? `https://acceptable.a-ads.com/${encodeURIComponent(unitId)}/?size=${encodeURIComponent(size)}` : null

  useEffect(() => {
    onVisibleChange?.(visible)
  }, [onVisibleChange, visible])

  useEffect(() => {
    if (!effectiveEnabled || !unitId) setStatus('empty')
  }, [effectiveEnabled, unitId])

  useEffect(() => {
    if (!refreshTarget) return
    const handler = (event: Event) => {
      const custom = event as AadsRefreshEvent
      if (!effectiveEnabled) return
      if (custom.detail?.slot !== refreshTarget) return
      if (Date.now() - lastRefreshRef.current < MIN_REFRESH_MS) return
      lastRefreshRef.current = Date.now()
      setNonce((value) => value + 1)
    }
    window.addEventListener(AADS_REFRESH_EVENT, handler)
    return () => window.removeEventListener(AADS_REFRESH_EVENT, handler)
  }, [effectiveEnabled, refreshTarget])

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center"
      // Painted only once the frame has answered, as before: shown earlier it
      // escaped the white bar on an iPad. The verifier reads the delivered page
      // and finds the unit there whatever its opacity, so nothing is lost.
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
      <div id="frame" className="relative flex h-full w-full items-center justify-center" style={{ width: '100%' }}>
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
            loading="eager"
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
            width={otherSize === '728x90' ? 728 : 320}
            height={otherSize === '728x90' ? 90 : 50}
            scrolling="no"
            frameBorder={0}
            loading="lazy"
            style={{ border: 0, padding: 0, overflow: 'hidden', background: 'transparent', position: 'absolute', inset: 0, margin: 'auto' }}
          />
        ) : null}
      </div>
    </div>
  )
}
