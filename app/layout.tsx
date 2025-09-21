// app/layout.tsx
import './globals.css';
import { cookies } from 'next/headers';

import I18nProvider from '@/providers/I18nProvider'; // <- ton provider i18n (nommé "default")
import { CookieConsentProvider } from '@/components/CookieConsent'; // <- export nommé
import CookieBanner from '@/components/CookieBanner';
import CookieSettingsModal from '@/components/CookieSettingsModal';

export const metadata = {
  title: 'random',
  description: 'Explore random contents.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lis la langue depuis le cookie "lang" (adaptable selon ton app)
  const cookieStore = cookies();
  const lang =
    (cookieStore.get('lang')?.value as 'en' | 'fr' | 'de' | 'jp') ?? 'en';

  return (
    <html lang={lang} suppressHydrationWarning>
      {/* ⚠️ Remets ici exactement les classes que tu avais sur <body> si besoin */}
      <body>
        {/* i18n DOIT envelopper tout ce qui consomme useI18n */}
        <I18nProvider initialLocale={lang}>
          {/* Le provider de consentement doit envelopper la bannière + modal + app */}
          <CookieConsentProvider>
            {children}

            {/* La bannière s’affiche à l’ouverture si pas de consentement */}
            <CookieBanner />

            {/* Le modal de réglages est monté globalement et sera ouvert par <CookieSettingsLink /> */}
            <CookieSettingsModal />
          </CookieConsentProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
