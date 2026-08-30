// app/layout.tsx
import './globals.css';
import { cookies, headers } from 'next/headers';

import I18nProvider from '@/providers/I18nProvider'; // <- ton provider i18n (nommé "default")
import { CookieConsentProvider, type Region } from '@/components/CookieConsent'; // <- export nommé
import CookieBanner from '@/components/CookieBanner';
import CookieSettingsModal from '@/components/CookieSettingsModal';
import { ScoreProvider } from '@/providers/ScoreProvider';
import { interTight, tomorrow } from './fonts';

export const metadata = {
  title: 'random',
  description: 'Explore random contents.',
};

const mapLocale = (value?: string | null): 'en' | 'fr' | 'de' | 'jp' | 'es' => {
  if (!value) return 'en'
  const lower = value.toLowerCase().trim()
  const primary = lower.split(/[-_]/)[0]
  if (primary === 'fr') return 'fr'
  if (primary === 'de') return 'de'
  if (primary === 'es') return 'es'
  if (primary === 'ja' || primary === 'jp') return 'jp'
  return 'en'
}

const mapCountry = (country?: string | null): 'en' | 'fr' | 'de' | 'jp' | 'es' | null => {
  if (!country) return null
  const code = country.toUpperCase()
  if (code === 'FR') return 'fr'
  if (code === 'DE') return 'de'
  if (code === 'ES') return 'es'
  if (code === 'JP') return 'jp'
  return null
}

const EU_COUNTRY_CODES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  'IS','LI','NO','CH','GB','UK'
])

const detectRegion = (country?: string | null): Region => {
  if (!country) return 'eu'
  const code = country.toUpperCase()
  if (code === 'US') return 'us'
  if (EU_COUNTRY_CODES.has(code)) return 'eu'
  return 'other'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies()
  const cookieLangRaw = cookieStore.get('lang')?.value
  const headerList = headers()
  const acceptLang = headerList.get('accept-language') || ''
  const primaryRequested = acceptLang.split(',')[0]?.trim()
  const autoLang = mapLocale(primaryRequested)
  const countryCode = headerList.get('x-vercel-ip-country')
  const countryLang = mapCountry(countryCode)
  const lang = cookieLangRaw ? mapLocale(cookieLangRaw) : (countryLang ?? autoLang)
  const region = detectRegion(countryCode)

  return (
    <html lang={lang} suppressHydrationWarning className={`${interTight.variable} ${tomorrow.variable}`}>
      <head>
      </head>
      {/* ⚠️ Remets ici exactement les classes que tu avais sur <body> si besoin */}
      <body className={interTight.className}>
        {/* i18n DOIT envelopper tout ce qui consomme useI18n */}
        <I18nProvider initialLocale={lang}>
          {/* Le provider de consentement doit envelopper la bannière + modal + app */}
          <CookieConsentProvider region={region}>
            <ScoreProvider>
              {children}

              {/* La bannière s’affiche à l’ouverture si pas de consentement */}
              <CookieBanner />

              {/* Le modal de réglages est monté globalement et sera ouvert par <CookieSettingsLink /> */}
              <CookieSettingsModal />

            </ScoreProvider>
          </CookieConsentProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
