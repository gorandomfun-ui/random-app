'use client'

import { useCookieConsent } from './CookieConsent'
import { useI18n } from '@/providers/I18nProvider'
import { privacyCopy } from '@/lib/privacy/copy'

export default function CookieBanner() {
  const { isBannerOpen, acceptAll, rejectAll, openSettings } = useCookieConsent()
  const { locale } = useI18n()
  const copy = privacyCopy[locale] || privacyCopy.en
  if (!isBannerOpen) return null
  const button = 'rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white hover:opacity-90'

  return (
    <section
      id="cookie-banner"
      aria-label={copy.title}
      className="fixed inset-x-0 bottom-0 z-[180]"
    >
      <div className="mx-auto mb-4 w-[min(92vw,900px)] rounded-2xl bg-white/95 p-4 text-neutral-900 shadow-2xl ring-1 ring-black/10 backdrop-blur">
        <p className="text-sm">
          {copy.intro}{' '}
          <a className="underline" href="/privacy">
            {copy.policy}
          </a>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={acceptAll} className={button}>
            {copy.accept}
          </button>
          <button type="button" onClick={rejectAll} className={button}>
            {copy.reject}
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="rounded-xl px-3 py-2 text-sm underline"
          >
            {copy.settings}
          </button>
        </div>
      </div>
    </section>
  )
}
