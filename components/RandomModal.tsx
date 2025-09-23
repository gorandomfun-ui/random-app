'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../providers/I18nProvider'
import MonoIcon from './MonoIcon'
import LogoAnimated from './LogoAnimated'
import { addLike, isLiked, removeLike } from '../utils/likes'
import AnimatedButtonLabel from './AnimatedButtonLabel'

type Theme = { bg: string; deep: string; cream: string; text: string }
type ItemType = 'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'
type SourceInfo = { name?: string; url?: string } | null

type Item = {
  _id?: string
  type: ItemType
  lang?: 'en' | 'fr' | 'de' | 'jp'
  text?: string
  author?: string
  url?: string
  thumbUrl?: string
  width?: number
  height?: number
  source?: SourceInfo
  ogImage?: string | null
  title?: string
}

type Props = {
  open: boolean
  onClose: () => void
  onRandomAgain?: () => void
  trigger?: number
  isSecond?: boolean
  types?: ItemType[]
  lang?: Item['lang']
  theme: Theme
  children?: ReactNode
  forceItem?: Item | null
}

/* ============ IMAGE plein largeur SANS coins arrondis ============ */
function ImageBlock({
  src,
  alt,
  sourceLabel,
  sourceHref,
}: {
  src: string
  alt?: string
  sourceLabel?: string
  sourceHref?: string
}) {
  return (
    <figure className="-mx-6 w-[calc(100%+3rem)]"> {/* supprime le padding horizontal du corps */}
      <div className="relative w-full overflow-hidden">
        <img
          src={src}
          alt={alt || 'image'}
          className="block w-full h-[min(60vh,640px)] object-cover select-none"
          loading="lazy"
          decoding="async"
        />
      </div>

      {(sourceLabel || sourceHref) && (
        <figcaption className="mt-3 text-center text-sm opacity-80">
          {sourceLabel ? <span>{sourceLabel}</span> : null}
          {sourceHref ? (
            <>
              <span> · </span>
              <a href={sourceHref} target="_blank" rel="noreferrer" className="underline">
                {new URL(sourceHref).hostname.replace(/^www\./, '')}
              </a>
            </>
          ) : null}
        </figcaption>
      )}
    </figure>
  )
}

/* ---------------- SHARE POPOVER (inchangé) ---------------- */
function SharePopover({
  item,
  theme,
  anchorRef,
  placeAbove,
  onClose,
}: {
  item: Item | null
  theme: Theme
  anchorRef: React.RefObject<HTMLButtonElement | null>
  placeAbove: boolean
  onClose: () => void
}) {
  const shareUrl = item?.url || (typeof window !== 'undefined' ? window.location.href : '')
  const text =
    item?.text || item?.title || 'Random — explore random contents. Only useless surprise.'
  const u = encodeURIComponent(shareUrl)
  const t = encodeURIComponent(text)

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Random', text, url: shareUrl })
        onClose()
      }
    } catch {}
  }
  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(shareUrl)
      onClose()
      alert('Link copied!')
    } catch {}
  }
  function openWindow(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={`absolute ${placeAbove ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 w-[260px] rounded-xl shadow-xl p-3 z-50`}
      style={{ background: theme.deep, color: theme.cream }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide opacity-80">Share</div>
        <button
          className="text-lg leading-none opacity-80 hover:opacity-100"
          onClick={onClose}
          aria-label="Close share"
        >
          ×
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <button className="text-left px-3 py-2 rounded hover:opacity-90" onClick={nativeShare}>
          • Native share (mobile)
        </button>
        <button className="text-left px-3 py-2 rounded hover:opacity-90" onClick={copyLink}>
          • Copy link
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://twitter.com/intent/tweet?url=${u}&text=${t}`)}
        >
          • X / Twitter
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://www.facebook.com/sharer/sharer.php?u=${u}`)}
        >
          • Facebook
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://www.reddit.com/submit?url=${u}&title=${t}`)}
        >
          • Reddit
        </button>
        <button
          className="text-left px-3 py-2 rounded hover:opacity-90"
          onClick={() => openWindow(`https://www.linkedin.com/sharing/share-offsite/?url=${u}`)}
        >
          • LinkedIn
        </button>
      </div>
    </div>
  )
}

/* ---------------- RENDERER (image/quote/fact/joke/web/video) ---------------- */
function ContentRenderer({ item, theme }: { item: Item; theme: Theme }) {
  if (item.type === 'image') {
    const src = (item as any)?.url || (item as any)?.src
    const alt = (item as any)?.title || (item as any)?.alt || 'image'
    const sourceLabel =
      (item as any)?.sourceName || (item as any)?.provider || (item as any)?.attribution
    const sourceHref =
      (item as any)?.sourceUrl ||
      (item as any)?.pageUrl ||
      (item as any)?.link ||
      (item as any)?.url

    if (src) {
      return (
        <div className="w-full">
          <ImageBlock src={src} alt={alt} sourceLabel={sourceLabel} sourceHref={sourceHref} />
        </div>
      )
    }
  }

  if (item.type === 'quote' && item.text) {
    return (
      <blockquote
        className="max-w-[80ch] text-center font-tomorrow font-bold text-[22px] md:text-[32px] leading-snug"
        style={{ color: theme.cream, letterSpacing: '.01em' }}
      >
        “{item.text}”
      </blockquote>
    )
  }

  if ((item.type === 'fact' || item.type === 'joke') && item.text) {
    return (
      <p
        className="max-w-[85ch] text-center font-tomorrow font-bold text-[20px] md:text-[28px] leading-snug"
        style={{ color: theme.cream, letterSpacing: '.01em' }}
      >
        {item.text}
      </p>
    )
  }

  if (item.type === 'web' && item.url) {
    let host = ''
    try {
      host = new URL(item.url).hostname.replace(/^www\./, '')
    } catch {}
    return (
      <div className="flex flex-col items-center gap-4">
        {item.ogImage && (
          <img
            src={item.ogImage}
            alt=""
            className="max-h-[30vh] w-auto object-contain rounded-lg"
            style={{ boxShadow: '0 8px 22px rgba(0,0,0,.15)' }}
          />
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="underline font-inter text-lg md:text-xl text-center break-words"
          style={{ color: theme.cream }}
        >
          {item.text || host || item.url}
        </a>
      </div>
    )
  }

  if (item.type === 'video' && item.url) {
    let id = ''
    try {
      const u = new URL(item.url)
      if (u.hostname.includes('youtu')) id = u.searchParams.get('v') || u.pathname.split('/').pop() || ''
    } catch {}
    if (!id && item.url) id = item.url.split('/').pop() || ''
    const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`
    return (
      <div className="w-full flex flex-col items-center">
        {item.text ? (
          <p
            className="mb-4 text-lg md:text-xl font-tomorrow font-bold text-center"
            style={{ color: theme.cream, fontFamily: "'Tomorrow', sans-serif", fontWeight: 700 }}
          >
            {item.text}
          </p>
        ) : null}
        <div className="w-full" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={src}
            className="w-full h-full rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={item.text || 'YouTube'}
          />
        </div>
      </div>
    )
  }

  return null
}

function SourceLine({ item }: { item: Item }) {
  if (item.type === 'quote' && item.author) return <span>— {item.author}</span>
  const s = item.source
  if (!s) return null
  if (typeof s === 'string') return <span>{s}</span>
  if (s.url) {
    try {
      const host = new URL(s.url).host.replace(/^www\./, '')
      return (
        <span>
          {s.name ? `${s.name} · ` : ''}
          <a href={s.url} target="_blank" rel="noreferrer" className="underline">
            {host}
          </a>
        </span>
      )
    } catch {
      return <span>{s.name || s.url}</span>
    }
  }
  if (s.name) return <span>{s.name}</span>
  return null
}

/* ---------------- MODALE principale ---------------- */
export default function RandomModal({
  open,
  onClose,
  onRandomAgain,
  trigger = 0,
  isSecond = false,
  types,
  lang,
  theme,
  children,
  forceItem = null,
}: Props) {
  const { dict } = useI18n()
  const [item, setItem] = useState<Item | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)

  // Share popover
  const [shareOpen, setShareOpen] = useState(false)
  const [shareAbove, setShareAbove] = useState(false)
  const shareBtnRef = useRef<HTMLButtonElement | null>(null)
  const [buttonBurst, setButtonBurst] = useState(false)
  const burstRef = useRef(true)

  const effectiveTypes = useMemo<ItemType[]>(
    () => (types && types.length ? types : ['image', 'quote', 'fact']),
    [types]
  )

  useEffect(() => {
    if (!open) return
    if (forceItem) {
      setItem(forceItem)
      setError(null)
      setLoading(false)
      return
    }
    if (children) return

    let aborted = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        setItem(null)
        const qs = new URLSearchParams({
          types: effectiveTypes.join(','),
          lang: (lang as string) || 'en',
          t: String(Date.now()),
        })
        const res = await fetch(`/api/random?${qs.toString()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (aborted) return
        setItem(data?.item || null)
      } catch (e: any) {
        if (!aborted) setError(e?.message || 'error')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    load()
    return () => {
      aborted = true
    }
  }, [open, trigger, children, lang, forceItem, effectiveTypes])

  useEffect(() => {
    const current = (forceItem as Item | null) ?? item ?? null
    if (current) setLiked(isLiked(current))
    else setLiked(false)
  }, [forceItem, item, open])

  useEffect(() => {
    if (!open) {
      burstRef.current = true
      setButtonBurst(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (burstRef.current) {
      burstRef.current = false
      return
    }
    setButtonBurst(true)
    const timer = setTimeout(() => setButtonBurst(false), 520)
    return () => clearTimeout(timer)
  }, [trigger, open])

  // Position dynamique du menu Share
  useEffect(() => {
    if (!shareOpen || !shareBtnRef.current) return
    const rect = shareBtnRef.current.getBoundingClientRect()
    const POPOVER_H = 240 // hauteur estimée
    setShareAbove(rect.bottom + POPOVER_H > window.innerHeight - 16)
  }, [shareOpen])

  function handleRandomAgain() {
    setShareOpen(false)
    if (onRandomAgain) return onRandomAgain()
    setItem((prev) => (prev ? { ...prev } : prev))
  }

  if (!open) return null
  const viewItem: Item | null = (forceItem as Item | null) ?? item ?? null
  const showChildren = !viewItem && !!children

  const LOGO_GAP_MOBILE = 2
  const LOGO_GAP_DESKTOP = 2

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', paddingBottom: 'calc(var(--ad-bar-height, 0px) + 16px)' }}
    >
      <div
        className="relative w-[min(95vw,1000px)] max-h-[80dvh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: theme.bg, color: theme.cream, marginTop: 'clamp(24px, 12vh, 120px)', marginBottom: 'calc(var(--ad-bar-height, 0px) + 24px)' }}
      >
        {/* header */}
        <div className="px-4 py-3 border-b border-white/20 shrink-0">
          <div className="relative flex items-center justify-center">
            <button
              onClick={() => {
                setShareOpen(false)
                onClose()
              }}
              aria-label="Close"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-2xl leading-none"
            >
              ×
            </button>

            <div className="max-w-[calc(100%-48px)]">
              <LogoAnimated
                trigger={trigger}
                toSecond={isSecond}
                fitToWidth
                vhMobile={6}
                vhDesktop={6}
                gapMobile={LOGO_GAP_MOBILE}
                gapDesktop={LOGO_GAP_DESKTOP}
              />
            </div>
          </div>
        </div>

        {/* type / titre */}
        {viewItem && (
          <div className="px-6 pt-2 text-[28px] md:text-[30px] font-inter font-semibold flex items-center justify-center gap-2 shrink-0">
            <MonoIcon
              src={
                {
                  image: '/icons/image.svg',
                  video: '/icons/Video.svg',
                  web: '/icons/web.svg',
                  quote: '/icons/quote.svg',
                  joke: '/icons/joke.svg',
                  fact: '/icons/fact.svg',
                }[viewItem.type]
              }
              color={theme.cream}
              size={30}
            />
            <span style={{ letterSpacing: '.02em' }}>{viewItem.type}</span>
          </div>
        )}

        {/* corps */}
        <div className="px-6 py-5 flex items-center justify-center min-h-[320px] md:min-h-[360px] overflow-auto flex-1">
          {viewItem ? (
            <ContentRenderer item={viewItem} theme={theme} />
          ) : showChildren ? (
            children
          ) : loading ? (
            <div className="opacity-80 font-inter">Loading...</div>
          ) : error ? (
            <div className="opacity-80 font-inter">Error</div>
          ) : null}
        </div>

        {/* source */}
        {viewItem && (
          <div className="px-6 pb-2 -mt-2 text-center font-inter italic opacity-90 shrink-0">
            <SourceLine item={viewItem} />
          </div>
        )}

        {/* footer */}
        <div className="border-t border-white/20 px-4 py-4 shrink-0">
          <div className="grid grid-cols-3 items-center">
            <div className="flex items-center gap-4 justify-start">
              <button
                className={`like-button p-2 rounded-full ${liked ? 'liked' : ''}`}
                aria-label="Like"
                onClick={() => {
                  if (!viewItem) return
                  if (liked) {
                    removeLike(viewItem)
                    setLiked(false)
                  } else {
                    addLike(
                      {
                        type: viewItem.type,
                        url: viewItem.url,
                        text: viewItem.text || viewItem.author,
                        title: viewItem.title,
                        thumbUrl: viewItem.thumbUrl,
                        ogImage: (viewItem as any).ogImage,
                        provider: viewItem.source?.name,
                      },
                      theme
                    )
                    setLiked(true)
                  }
                  try {
                    window.dispatchEvent(new StorageEvent('storage', { key: 'likes' }))
                  } catch {}
                }}
              >
                <MonoIcon
                  src="/icons/Heart.svg"
                  color={liked ? '#ff4d78' : theme.cream}
                  size={28}
                  className="transition-[background-color] duration-300"
                />
              </button>

            </div>

            <div className="flex justify-center">
              <button
                className={`px-10 md:px-14 py-2 rounded-[28px] shadow-md hover:scale-[1.03] transition uppercase whitespace-nowrap flex items-center justify-center ${buttonBurst ? 'btn-energized' : ''}`}
                style={{
                  backgroundColor: theme.text,
                  color: theme.cream,
                  fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
                  fontWeight: 700,
                }}
                onClick={handleRandomAgain}
              >
                <span className="sr-only">{dict?.modal?.randomAgain ?? 'RANDOM AGAIN'}</span>
                <AnimatedButtonLabel
                  text={dict?.modal?.randomAgain ?? 'RANDOM AGAIN'}
                  color={theme.cream}
                  trigger={trigger}
                  toSecond={isSecond}
                />
              </button>
            </div>

            <div className="relative flex justify-end">
              <button
                ref={shareBtnRef}
                className="p-2 rounded-full hover:opacity-90"
                aria-label="Share"
                onClick={() => setShareOpen((s) => !s)}
              >
                <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
              </button>

              {shareOpen && (
                <SharePopover
                  theme={theme}
                  item={viewItem}
                  anchorRef={shareBtnRef}
                  placeAbove={shareAbove}
                  onClose={() => setShareOpen(false)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    <style jsx>{`
      .like-button {
        transition: transform 0.3s ease;
      }
      .like-button:hover {
        transform: scale(1.05);
      }
      .like-button.liked {
        transform: scale(1.1);
        animation: heartPulse 0.45s ease;
      }
      @keyframes heartPulse {
        0% { transform: scale(1); }
        30% { transform: scale(1.25); }
        60% { transform: scale(0.95); }
        100% { transform: scale(1.1); }
      }
    `}</style>
    </>
  )
}
