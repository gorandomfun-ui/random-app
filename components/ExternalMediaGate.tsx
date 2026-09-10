'use client'

import type { ReactNode } from 'react'
import { useCookieConsent } from './CookieConsent'
import { useI18n } from '@/providers/I18nProvider'
import { privacyCopy } from '@/lib/privacy/copy'

export default function ExternalMediaGate({ children }: { children: ReactNode }) {
  const { consent, openSettings } = useCookieConsent()
  const { locale } = useI18n()
  const copy = privacyCopy[locale] || privacyCopy.en

  if (consent?.media === true) return <>{children}</>

  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 p-6 text-center">
      <p>{copy.blocked}</p>
      <button
        type="button"
        className="rounded-full border border-current px-5 py-3"
        onClick={openSettings}
      >
        {copy.allow}
      </button>
    </div>
  )
}
