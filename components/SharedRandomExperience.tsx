'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ShareMenu from '@/components/ShareMenu'
import type { SharedContent } from '@/lib/share/content'
import { SHARE_PRESENTATION, type ShareLocale } from '@/lib/share/presentation'
import type { Theme } from '@/lib/theme'

const TYPE_ICONS: Record<SharedContent['type'], string> = {
  image: '/icons/image.svg',
  video: '/icons/Video.svg',
  web: '/icons/web.svg',
  quote: '/icons/quote.svg',
  joke: '/icons/joke.svg',
  fact: '/icons/fact.svg',
}

const TYPE_ACCENTS: Record<SharedContent['type'], string> = {
  video: '#13D8FF',
  image: '#FF35C7',
  web: '#FF8A00',
  quote: '#B7FF4A',
  joke: '#FF005C',
  fact: '#8D6CFF',
}

type BackgroundStyle = CSSProperties & {
  '--share-bg-image': string
  '--share-bg-accent': string
}

const cssImage = (url: string | null) => url ? `url(${JSON.stringify(url)})` : 'none'

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    let id = ''
    if (parsed.hostname === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || ''
    if (parsed.hostname.includes('youtube.com')) {
      if (/^\/(shorts|embed|live)\//.test(parsed.pathname)) id = parsed.pathname.split('/')[2] || ''
      else id = parsed.searchParams.get('v') || ''
    }
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1` : null
  } catch {
    return null
  }
}

function getDailymotionEmbedUrl(url: string): string | null {
  const match = url.match(/(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([a-zA-Z0-9]+)/i)
  return match?.[1] ? `https://www.dailymotion.com/embed/video/${encodeURIComponent(match[1])}` : null
}

function SharedContentView({ content, theme }: { content: SharedContent; theme: Theme }) {
  if (content.type === 'video' && content.mediaUrl) {
    const embedUrl = getYouTubeEmbedUrl(content.mediaUrl) || getDailymotionEmbedUrl(content.mediaUrl)
    if (embedUrl) {
      return (
        <div className="relative w-full bg-black" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={embedUrl}
            title={content.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            style={{ border: 0 }}
          />
        </div>
      )
    }
    return (
      <video className="max-h-[58svh] w-full bg-black object-contain" src={content.mediaUrl} poster={content.imageUrl || undefined} controls playsInline />
    )
  }

  if (content.type === 'image' && (content.mediaUrl || content.imageUrl)) {
    return <img src={content.mediaUrl || content.imageUrl || ''} alt={content.title} className="max-h-[58svh] w-full object-contain" />
  }

  if (content.type === 'web') {
    return (
      <div className="flex w-full flex-col items-center gap-5 text-center">
        {content.imageUrl ? <img src={content.imageUrl} alt="" className="max-h-[42svh] w-full object-contain" /> : null}
        {content.sourceUrl ? (
          <a href={content.sourceUrl} target="_blank" rel="noreferrer" className="max-w-3xl break-words font-tomorrow text-xl font-bold underline md:text-3xl" style={{ color: theme.cream }}>
            {content.text || content.title}
          </a>
        ) : <p className="max-w-3xl font-tomorrow text-xl font-bold md:text-3xl">{content.text || content.title}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 text-center">
      <p className="whitespace-pre-wrap font-tomorrow text-[22px] font-bold leading-snug md:text-[32px]" style={{ color: theme.cream }}>
        {content.text || content.title}
      </p>
      {content.type === 'quote' && content.author ? <p className="mt-4 text-base opacity-80 md:text-lg">— {content.author}</p> : null}
    </div>
  )
}

export default function SharedRandomExperience({
  content,
  theme,
  themeIndex,
  locale,
}: {
  content: SharedContent
  theme: Theme
  themeIndex: number
  locale: ShareLocale
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const labels = SHARE_PRESENTATION[locale]
  const originalUrl = content.sourceUrl || content.mediaUrl
  const backgroundStyle = useMemo<BackgroundStyle>(() => ({
    '--share-bg-image': cssImage(content.imageUrl),
    '--share-bg-accent': TYPE_ACCENTS[content.type],
  }), [content.imageUrl, content.type])
  const fragments = useMemo(() => Array.from({ length: content.imageUrl ? 13 : 5 }, (_, index) => ({
    top: `${7 + ((index * 19 + content.id.charCodeAt(index % content.id.length)) % 86)}%`,
    left: `${(index * 31) % 28 - 8}%`,
    width: `${65 + (index * 17) % 48}%`,
    height: index % 3 === 0 ? `${8 + (index % 4) * 3}px` : `${1 + (index % 2)}px`,
    animationDelay: `${-index * 613}ms`,
  })), [content.id, content.imageUrl])

  useEffect(() => {
    document.body.classList.add('shared-random-body')
    const previousLang = document.documentElement.lang
    document.documentElement.lang = locale === 'jp' ? 'ja' : locale
    return () => {
      document.body.classList.remove('shared-random-body')
      document.documentElement.lang = previousLang
    }
  }, [locale])

  return (
    <main
      className="shared-random-page relative flex min-h-[100svh] flex-col overflow-hidden"
      style={{ background: theme.bg, color: theme.cream, '--theme-text': theme.text } as CSSProperties}
    >
      <div className="shared-random-bg" style={backgroundStyle} aria-hidden="true">
        <div className="shared-random-bg__media" />
        <div className="shared-random-bg__fragments">
          {fragments.map((fragment, index) => <span key={index} style={fragment} />)}
        </div>
        <div className="shared-random-bg__tone" />
        <div className="shared-random-bg__noise" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-5xl justify-center px-4 pb-3 pt-5 sm:pt-7">
        <Link href="/random" aria-label="Random" className="block w-[min(410px,72vw)]">
          <LogoAnimated trigger={0} toSecond={false} heightMobile={62} heightDesktop={86} gapMobile={3} gapDesktop={5} fitToWidth />
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-5 sm:px-6">
        <div className="mb-4 flex min-h-11 w-full items-center justify-center gap-3 px-4 py-2 font-tomorrow text-sm font-bold uppercase tracking-[0.14em] sm:text-base" style={{ background: theme.text, color: theme.cream }}>
          <MonoIcon src={TYPE_ICONS[content.type]} color={theme.cream} size={23} />
          <span>{labels.categories[content.type]}</span>
        </div>

        <div className="flex min-h-[300px] flex-1 items-center justify-center py-3 sm:py-5">
          <SharedContentView content={content} theme={theme} />
        </div>

        <div className="min-h-8 py-2 text-center text-sm opacity-80">
          {originalUrl ? (
            <a href={originalUrl} target="_blank" rel="noreferrer" className="underline">
              {labels.source}{content.provider ? ` · ${content.provider}` : ''}
            </a>
          ) : content.provider ? <span>{labels.source} · {content.provider}</span> : null}
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-2">
          <Link href="/random" className="flex min-h-14 items-center justify-center rounded-full px-5 text-center font-tomorrow text-base font-bold uppercase tracking-[0.08em] sm:text-lg" style={{ background: theme.text, color: theme.cream }}>
            {labels.randomMore}
          </Link>
          <button onClick={() => setShareOpen(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-full px-5 font-tomorrow text-base font-bold uppercase tracking-[0.08em] sm:text-lg" style={{ background: theme.text, color: theme.cream }}>
            <MonoIcon src="/icons/share.svg" color={theme.cream} size={22} />
            <span className="hidden sm:inline">{labels.share}</span>
          </button>
        </div>
      </section>

      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={content.title}
        theme={theme}
        themeIndex={themeIndex}
        localeOverride={locale}
        itemId={content.id}
      />

      <style jsx global>{`
        .shared-random-body #cookie-banner { display: none !important; }
        .shared-random-page { isolation: isolate; }
        .shared-random-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: #020202; }
        .shared-random-bg__media { position: absolute; inset: -8%; background-image: var(--share-bg-image); background-size: cover; background-position: center; filter: blur(5px) saturate(2.25) contrast(1.85) brightness(.28); opacity: .8; transform: scale(1.13); animation: shared-random-drift 18s steps(8,end) infinite alternate; }
        .shared-random-bg__tone { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.64) 44%,rgba(0,0,0,.94)),radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--share-bg-accent) 12%,transparent),transparent 55%); }
        .shared-random-bg__fragments { position: absolute; inset: 0; z-index: 2; overflow: hidden; mix-blend-mode: screen; }
        .shared-random-bg__fragments span { position: absolute; display: block; background-image: var(--share-bg-image); background-size: 120vw auto; background-position: center; opacity: .36; box-shadow: 5px 0 rgba(0,255,255,.18),-5px 0 rgba(255,0,130,.16); animation: shared-random-fragment 7s steps(1,end) infinite; }
        .shared-random-bg__noise { position: absolute; inset: 0; z-index: 3; opacity: .45; mix-blend-mode: screen; background: repeating-linear-gradient(180deg,rgba(70,110,255,.11) 0 .4px,rgba(0,0,0,.1) .4px .8px,transparent .8px 2px),linear-gradient(180deg,transparent 0 37%,rgba(0,255,255,.13) 37.1% 37.25%,transparent 37.4% 71%,rgba(255,0,130,.11) 71.1% 71.25%,transparent 71.4%); }
        @keyframes shared-random-drift { 0% { transform: translate3d(-.6%,-.4%,0) scale(1.13); } 50% { transform: translate3d(.8%,.5%,0) scale(1.15); } 100% { transform: translate3d(-.2%,.8%,0) scale(1.14); } }
        @keyframes shared-random-fragment { 0%,89%,100% { opacity:.26; transform:translateX(0); } 90% { opacity:.7; transform:translateX(18px); } 92% { opacity:.4; transform:translateX(-9px); } }
        @media (prefers-reduced-motion: reduce) { .shared-random-bg__media,.shared-random-bg__fragments span { animation:none; } }
      `}</style>
    </main>
  )
}
