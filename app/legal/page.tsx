'use client'

import CookieSettingsLink from '@/components/CookieSettingsLink'
import { useI18n } from '@/providers/I18nProvider'

export default function LegalPage() {
  const { t } = useI18n()

  return (
    <main
      className="min-h-screen px-6 py-10 md:py-16 flex justify-center"
      style={{ backgroundColor: '#000', color: '#F8F5E6' }}
    >
      <article className="w-full max-w-4xl space-y-8">
        <header className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">
            {t('legal.title', 'Legal notice')}
          </h1>
          <p className="text-sm uppercase tracking-widest opacity-70">
            {t('legal.subtitle', 'Transparency & accountability')}
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-red-300">
            {t('legal.disclaimer.title', 'Disclaimer')}
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-red-100">
            {t('legal.disclaimer.body')}
          </p>
        </section>

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
