'use client'

import CookieSettingsLink from '@/components/CookieSettingsLink'
import LegalDocumentHeader from '@/components/legal/LegalDocumentHeader'
import { THEMES } from '@/lib/theme'
import { useI18n } from '@/providers/I18nProvider'
import { useMemo, useState } from 'react'

export default function LegalPage() {
  const { t } = useI18n()

  const [themeIdx] = useState(() => Math.floor(Math.random() * THEMES.length))
  const theme = THEMES[themeIdx]

  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const subtitle = useMemo(() => t('legal.subtitle', 'Transparency & accountability'), [t])
  const disclaimerTitle = useMemo(() => t('legal.disclaimer.title', 'Disclaimer'), [t])
  const disclaimerBody = useMemo(() => t('legal.disclaimer.body'), [t])

  return (
    <main
      className="min-h-screen px-6 py-8 md:py-12 flex flex-col"
      style={{ backgroundColor: '#000', color: '#F8F5E6' }}
    >
      <LegalDocumentHeader
        logoColor="cream"
        burgerColor={theme.text}
        menuBackground={theme.text}
        menuColor={theme.cream}
        scoreColor="#191916"
      />

      <header className="mb-6 mt-8 text-right">
        <h1 className="text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
          {legalLabel}
        </h1>
        <p className="mt-1 text-xs uppercase tracking-widest opacity-70 md:text-sm">
          {subtitle}
        </p>
      </header>

      <article className="w-full max-w-4xl mx-auto space-y-8">
        <section
          className="border-2 p-6 shadow-lg"
          style={{
            borderColor: '#ff4d4d',
            backgroundColor: '#b1001f',
            color: '#fff5f5',
          }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#ffe0e0' }}>
            {disclaimerTitle}
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
            {disclaimerBody}
          </p>
        </section>

        <p className="mt-2 text-sm font-bold uppercase tracking-widest" style={{ color: theme.text }}>
          V 0.1.
        </p>

        <section className="space-y-6 text-base leading-relaxed">
          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.editor.title')}
            </h3>
            <p className="mt-2 whitespace-pre-line opacity-90">
              {t('legal.editor.body')}
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.hosting.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.hosting.body')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.purpose.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.purpose.body')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.privacy.title')}
            </h3>
            <p className="mt-2 opacity-90">
              {t('legal.privacy.bodyPrefix')}{' '}
              <CookieSettingsLink>{t('legal.privacy.manageCookies')}</CookieSettingsLink>
              <span className="mx-1">·</span>
              <a href="/privacy" className="underline">
                {t('legal.privacy.privacyPolicy')}
              </a>
              <span className="mx-1">·</span>
              <a href="/terms" className="underline">
                {t('legal.privacy.termsOfUse')}
              </a>
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.usa.title')}
            </h3>
            <p className="mt-2 opacity-90">
              {t('legal.usa.bodyPrefix')}{' '}
              <a href="/privacy#do-not-sell" className="underline">
                {t('legal.usa.doNotSell')}
              </a>
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.dmca.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.dmca.body')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-lg uppercase tracking-wide text-white">
              {t('legal.law.title')}
            </h3>
            <p className="mt-2 opacity-90">{t('legal.law.body')}</p>
          </div>
        </section>
      </article>

    </main>
  )
}
