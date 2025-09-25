'use client'

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  FactItem,
  ImageItem,
  JokeItem,
  QuoteItem,
  RandomContentItem,
  VideoItem,
  WebItem,
} from '../lib/random/clientTypes'
import { getSourceHref, getSourceLabel } from '../lib/random/clientTypes'

type Theme = { bg: string; deep: string; cream: string; text: string }

type RenderableItem = RandomContentItem

export default function RandomContentRenderer({
  item,
  theme,
}: {
  item: RenderableItem | null
  theme: Theme
}) {
  if (!item) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <span className="animate-pulse opacity-80 font-inter">Loading…</span>
      </div>
    )
  }

  if (item.type === 'image') {
    const image = item as ImageItem
    return (
      <div className="w-full h-full flex items-center justify-center">
        <img
          src={image.url}
          alt="Random"
          className="max-h-[56vh] md:max-h-[64vh] max-w-full object-contain rounded-lg shadow-lg"
          style={{ background: '#0000' }}
        />
      </div>
    )
  }

  if (item.type === 'quote' || item.type === 'fact' || item.type === 'joke') {
    const textItem = item.type === 'quote'
      ? (item as QuoteItem)
      : item.type === 'fact'
        ? (item as FactItem)
        : (item as JokeItem)
    return (
      <div className="w-full max-w-3xl mx-auto text-center px-4">
        <p
          className="font-tomorrow font-bold text-xl md:text-3xl leading-snug"
          style={{ color: theme.cream, fontFamily: "'Tomorrow', sans-serif", fontWeight: 700 }}
        >
          {textItem.text}
        </p>
        {textItem.type === 'quote' && textItem.author ? (
          <p className="mt-3 opacity-80 font-inter">— {textItem.author}</p>
        ) : null}
      </div>
    )
  }

  if (item.type === 'web') {
    const web = item as WebItem
    const href = web.url
    let host = web.host || ''
    if (!host && href) {
      try { host = new URL(href).hostname.replace(/^www\./, '') } catch {}
    }
    const sourceLabel = getSourceLabel(web.source, web.provider)
    const sourceHref = getSourceHref(web)

    return (
      <div className="w-full max-w-3xl mx-auto text-center px-4 flex flex-col items-center gap-4">
        {web.ogImage ? (
          <img
            src={web.ogImage}
            alt=""
            className="max-h-[30vh] w-auto object-contain rounded-xl"
            style={{ boxShadow: '0 8px 22px rgba(0,0,0,.15)' }}
          />
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline font-inter text-lg md:text-xl break-words"
            style={{ color: theme.cream }}
          >
            {web.text || host || href}
          </a>
        ) : (
          <p className="font-inter text-lg md:text-xl" style={{ color: theme.cream }}>
            {web.text}
          </p>
        )}
        {sourceLabel ? (
          <p className="font-inter text-sm opacity-80">
            {sourceHref ? (
              <a href={sourceHref} target="_blank" rel="noreferrer" className="underline">
                {sourceLabel}
              </a>
            ) : (
              <span>{sourceLabel}</span>
            )}
          </p>
        ) : null}
      </div>
    )
  }

  if (item.type === 'video') {
    return <Video block={item as VideoItem} theme={theme} />
  }

  // Fallback très simple (au cas où)
  return (
    <div className="w-full max-w-3xl mx-auto text-center px-4">
      <pre className="text-xs md:text-sm opacity-80 overflow-auto">{JSON.stringify(item, null, 2)}</pre>
    </div>
  )
}

function Video({ block, theme }: { block: VideoItem; theme: Theme }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [originParam, setOriginParam] = useState('')
  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginParam(window.location.origin)
    }
  }, [])

  const videoId = useMemo(() => {
    try {
      const u = new URL(block.url)
      if (u.hostname.includes('youtu')) {
        return u.searchParams.get('v') || u.pathname.split('/').pop() || ''
      }
    } catch {}
    return block.url.split('/').pop() || ''
  }, [block.url])

  const src = useMemo(() => {
    const params = new URLSearchParams({
      rel: '0',
      autoplay: '1',
      mute: '1',
      playsinline: '1',
      modestbranding: '1',
      enablejsapi: '1',
      controls: '1',
    })
    if (originParam) params.set('origin', originParam)
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
  }, [videoId, originParam])

  const unmute = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
        '*'
      )
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      )
      setIsMuted(false)
    } catch {}
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="w-full max-w-3xl" style={{ aspectRatio: '16 / 9', position: 'relative' }}>
        <iframe
          ref={iframeRef}
          src={src}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={block.text || 'Video'}
          style={{ border: 'none', borderRadius: '18px' }}
        />
        {isMuted ? (
          <button
            type="button"
            onClick={unmute}
            className="absolute top-4 right-4 rounded-full bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
          >
            Tap to unmute
          </button>
        ) : null}
      </div>
      {block.source?.name ? (
        <p className="font-inter text-sm opacity-80" style={{ color: theme.cream }}>
          {block.source.url ? (
            <a href={block.source.url} target="_blank" rel="noreferrer" className="underline">
              {block.source.name}
            </a>
          ) : (
            <span>{block.source.name}</span>
          )}
        </p>
      ) : null}
    </div>
  )
}
