'use client'
import { useI18n } from '@/providers/I18nProvider'
import CookieSettingsLink from '@/components/CookieSettingsLink'
import { termsCopy, TERMS_UPDATED_AT, TERMS_CONTACT } from '@/lib/legal/terms'
export default function TermsContent() {
  const { locale } = useI18n()
  const copy = termsCopy[locale] || termsCopy.en
  return <main className="mx-auto max-w-3xl space-y-6 bg-white px-5 py-10 text-neutral-900">
    <h1 className="text-3xl font-bold">{copy.title}</h1>
    <p className="text-sm">{copy.updated} : <time dateTime={TERMS_UPDATED_AT}>{TERMS_UPDATED_AT}</time></p>
    <p>{copy.intro}</p>
    <nav className="flex flex-wrap gap-4">
      <a href="/legal" className="underline">{copy.editor}</a>
      <a href="/privacy" className="underline">{copy.privacy}</a>
      <CookieSettingsLink />
    </nav>
    {copy.sections.map(section => <section key={section.title} className="space-y-2">
      <h2 className="text-xl font-semibold">{section.title}</h2>
      <p className="leading-relaxed">{section.body}</p>
    </section>)}
    <p><a href={`mailto:${TERMS_CONTACT}`} className="underline">{TERMS_CONTACT}</a></p>
    <a href="/" className="inline-block underline">{copy.home}</a>
  </main>
}
