'use client'

import { useCookieConsent } from './CookieConsent'
import { useI18n } from '@/providers/I18nProvider'
import { privacyCopy } from '@/lib/privacy/copy'

export default function CookieBanner() {
  const {
    consent,
    isBannerOpen,
    isSettingsOpen,
    acceptAll,
    allowMedia,
    rejectAll,
    openSettings,
    gpc,
  } = useCookieConsent()
  const { locale } = useI18n()
  const copy = privacyCopy[locale] || privacyCopy.en

  if (!isBannerOpen) {
    if (!consent || isSettingsOpen) return null
    return (
      <button
        type="button"
        onClick={openSettings}
        className="fixed left-3 z-[170] max-w-[calc(100vw-24px)] rounded-full border border-neutral-400 bg-white px-3 py-2 text-xs text-neutral-900 shadow"
        style={{ bottom: 'calc(var(--ad-bar-height, 0px) + 12px)' }}
      >
        {consent.media ? copy.shortcut : copy.limited}
      </button>
    )
  }

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
          </a>{' · '}
          <a className="underline" href="/terms">
            {copy.terms}
          </a>
        </p>
        {gpc && <p className="mt-2 text-sm">{copy.gpc}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={gpc ? allowMedia : acceptAll} className={button}>
            {gpc ? copy.allow : copy.accept}
          </button>
          <button type="button" onClick={rejectAll} className={button}>
            {copy.reject}
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="rounded-xl px-3 py-2 text-sm underline"
          >
            {copy.customize}
          </button>
        </div>
      </div>
    </section>
  )
}
