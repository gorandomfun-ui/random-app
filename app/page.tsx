import type { Metadata } from 'next'

import HomeExperience from '@/components/HomeExperience'
import { APP_SHARE, appCardUrl, appShareUrl } from '@/lib/share/app'
import { normalizeShareLocale } from '@/lib/share/presentation'

/** What a shared link to the home unfurls into, in the language the sharer was in (`?lang=`). */
export function generateMetadata({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }): Metadata {
  const raw = searchParams?.lang
  const locale = normalizeShareLocale(typeof raw === 'string' ? raw : null)
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://gorandom.fun'
  const slogan = APP_SHARE[locale].slogan
  const image = appCardUrl(base, locale, 'og')
  return {
    title: 'Random',
    description: slogan,
    openGraph: { title: 'Random', description: slogan, url: appShareUrl(base, locale), siteName: 'Random', type: 'website', images: [{ url: image, width: 1200, height: 630, alt: 'Random' }] },
    twitter: { card: 'summary_large_image', title: 'Random', description: slogan, images: [image] },
  }
}

export default function HomePage() {
  return <HomeExperience />
}
