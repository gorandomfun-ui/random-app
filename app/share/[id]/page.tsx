import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import SharedRandomExperience from '@/components/SharedRandomExperience'
import { getSharedContent } from '@/lib/share/content'
import { normalizeShareLocale, SHARE_PRESENTATION } from '@/lib/share/presentation'
import { THEMES } from '@/lib/theme'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>
type PageProps = {
  params: { id: string }
  searchParams?: SearchParams
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function resolveThemeIndex(raw: string | string[] | undefined, id: string): number {
  const parsed = Number.parseInt(firstParam(raw) || '', 10)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < THEMES.length) return parsed
  const fallback = Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0)
  return fallback % THEMES.length
}

function getSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim()
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '')

  const headerList = headers()
  const host = headerList.get('x-forwarded-host') || headerList.get('host')
  const forwardedProto = headerList.get('x-forwarded-proto')
  const protocol = forwardedProto === 'http' || forwardedProto === 'https'
    ? forwardedProto
    : host?.startsWith('localhost') ? 'http' : 'https'
  return host ? `${protocol}://${host}` : 'https://gorandom.fun'
}

function getShareUrls(id: string, searchParams?: SearchParams) {
  const themeIndex = resolveThemeIndex(searchParams?.theme, id)
  const locale = normalizeShareLocale(firstParam(searchParams?.lang))
  const query = new URLSearchParams({ theme: String(themeIndex), lang: locale })
  const origin = getSiteOrigin()
  return {
    themeIndex,
    locale,
    pageUrl: `${origin}/share/${encodeURIComponent(id)}?${query.toString()}`,
    cardUrl: `${origin}/api/share/og?id=${encodeURIComponent(id)}&${query.toString()}`,
  }
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const content = await getSharedContent(params.id)
  if (!content) return { title: 'Random', description: 'This Random content is no longer available.' }

  const { pageUrl, cardUrl, locale } = getShareUrls(content.id, searchParams)
  const title = `${content.title} · Random`
  const description = `${SHARE_PRESENTATION[locale].foundOn} — ${content.description}`

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'website',
      siteName: 'goRANDOM.fun',
      url: pageUrl,
      title,
      description,
      images: [{ url: cardUrl, width: 1200, height: 630, alt: `${content.title} — Random` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [cardUrl],
    },
  }
}

export default async function SharedRandomPage({ params, searchParams }: PageProps) {
  const content = await getSharedContent(params.id)
  if (!content) notFound()

  const { themeIndex, locale } = getShareUrls(content.id, searchParams)
  return <SharedRandomExperience content={content} theme={THEMES[themeIndex]} themeIndex={themeIndex} locale={locale} />
}
