'use client'

import { ReactNode } from 'react'
import I18nProvider from '../providers/I18nProvider'

// adapte ces chemins si tes composants cookies sont ailleurs
import { CookieConsentProvider } from './CookieConsent'
import CookieBanner from './CookieBanner'
import CookieSettingsModal from './CookieSettingsModal'

export default function RootClient({
  children,
  initialLang,
}: {
  children: ReactNode
  initialLang: string
}) {
  return (
    <CookieConsentProvider>
      <CookieBanner />
      <CookieSettingsModal />
      <I18nProvider initialLocale={initialLang}>{children}</I18nProvider>
    </CookieConsentProvider>
  )
}
