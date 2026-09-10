'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useCookieConsent } from './CookieConsent'
import { useI18n } from '@/providers/I18nProvider'
import { privacyCopy } from '@/lib/privacy/copy'
import {
  canLoadExternalPlayer,
  type ExternalPlayer,
} from '@/lib/privacy/mediaPolicy'

/** Enable only for the verified standard iframe without Infopack/TCF. */
const STANDARD_DM_ENABLED = process.env.NEXT_PUBLIC_RANDOM_DM_STANDARD_PLAYBACK === '1'

type Props = {
  children: ReactNode
  player?: ExternalPlayer
  source?: string
  standardDailymotion?: boolean
  onBlocked?: () => void
}

export default function ExternalMediaGate({
  children,
  player = 'other',
  source = '',
  standardDailymotion = false,
  onBlocked,
}: Props) {
  const { consent, allowMedia, acceptAll, rejectAll, openSettings, gpc } = useCookieConsent()
  const { locale } = useI18n()
  const copy = privacyCopy[locale] || privacyCopy.en
  const [browserChecked, setBrowserChecked] = useState(false)

  useEffect(() => {
    setBrowserChecked(true)
  }, [])

  // Defence in depth: this does not certify every possible CMP integration.
  const hasTcfApi =
    typeof window !== 'undefined' &&
    typeof (window as Window & { __tcfapi?: unknown }).__tcfapi === 'function'
  const allowed = canLoadExternalPlayer({
    player,
    source,
    standardDailymotion,
    mediaConsent: consent?.media === true,
    standardPlaybackEnabled: STANDARD_DM_ENABLED,
    browserChecked,
    hasTcfApi,
  })

  useEffect(() => {
    if (browserChecked && !allowed) onBlocked?.()
  }, [allowed, browserChecked, onBlocked])

  if (allowed) return <>{children}</>

  return (
    <div className="flex h-full min-h-[200px] flex-col overflow-y-auto overscroll-contain p-4 text-center">
      <div className="my-auto flex w-full flex-col items-center gap-3">
        <p>{copy.blocked}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="rounded-full border border-current px-4 py-2"
            onClick={gpc ? allowMedia : acceptAll}
          >
            {gpc ? copy.allow : copy.both}
          </button>
          <button
            type="button"
            className="rounded-full border border-current px-4 py-2"
            onClick={rejectAll}
          >
            {copy.reject}
          </button>
        </div>
        <button type="button" className="underline" onClick={openSettings}>
          {copy.customize}
        </button>
        {gpc && <p className="text-sm">{copy.gpc}</p>}
        <details className="text-sm">
          <summary className="cursor-pointer underline">{copy.details}</summary>
          <div className="mt-2 space-y-2">
            <p>{copy.mediaText}</p>
            <p>{copy.adsText}</p>
            <p>{copy.remembered}</p>
            <a href="/privacy" className="underline">{copy.policy}</a>
          </div>
        </details>
      </div>
    </div>
  )
}
