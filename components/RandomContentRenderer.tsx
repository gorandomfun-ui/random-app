'use client'

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type {
  FactItem,
  FactQuizItem,
  FactTextItem,
  ImageItem,
  JokeItem,
  QuoteItem,
  RandomContentItem,
  VideoItem,
  WebItem,
} from '../lib/random/clientTypes'
import { getSourceHref, getSourceLabel } from '../lib/random/clientTypes'
import { useScore } from '@/providers/ScoreProvider'

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

  if (item.type === 'fact') {
    const fact = item as FactItem
    if (fact.variant === 'quiz') {
      return <FactQuizCard item={fact as FactQuizItem} theme={theme} />
    }
    const factText = fact as FactTextItem
    return (
      <div className="w-full max-w-3xl mx-auto text-center px-4">
        <p
          className="font-tomorrow font-bold text-xl md:text-3xl leading-snug"
          style={{ color: theme.cream, fontFamily: "'Tomorrow', sans-serif", fontWeight: 700 }}
        >
          {factText.text}
        </p>
        <AiAttribution item={factText} theme={theme} />
      </div>
    )
  }

  if (item.type === 'quote' || item.type === 'joke') {
    const textItem = item.type === 'quote' ? (item as QuoteItem) : (item as JokeItem)
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
        <AiAttribution item={textItem} theme={theme} />
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
            className="w-full max-h-[40vh] object-cover rounded-xl"
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

function AiAttribution({ item, theme }: { item: QuoteItem | JokeItem | FactTextItem; theme: Theme }) {
  const label = item.disclaimer || (item.ai?.source ? `Généré par IA – ${item.ai.source}` : null)
  if (!label) return null
  return (
    <p
      className="mt-3 text-xs font-inter opacity-75"
      style={{ color: theme.cream }}
    >
      {label}
    </p>
  )
}

export function FactQuizCard({ item, theme }: { item: FactQuizItem; theme: Theme }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const { addAction } = useScore()

  const allCorrectIndices = useMemo(() => {
    if (Array.isArray(item.correctIndices) && item.correctIndices.length) {
      const unique = Array.from(new Set(item.correctIndices.filter((idx) => idx >= 0 && idx < item.options.length)))
      if (unique.length) return unique
    }
    return [item.correctIndex]
  }, [item.correctIndices, item.correctIndex, item.options.length])

  const sourceName = item.source?.name || item.provider || 'Quiz'
  const sourceUrl = item.source?.url
  const correctAnswers = useMemo(
    () => allCorrectIndices.map((idx) => item.options[idx]).filter(Boolean),
    [allCorrectIndices, item.options],
  )

  useEffect(() => {
    setSelected(null)
    setRevealed(false)
  }, [item.id])

  const onSelect = (index: number) => {
    if (revealed) return
    const correct = allCorrectIndices.includes(index)
    setSelected(index)
    setRevealed(true)
    if (correct) {
      addAction('quizSuccess')
    }
  }

  const isCorrect = revealed && selected !== null && allCorrectIndices.includes(selected)

  return (
    <div
      className="w-full max-w-3xl mx-auto flex h-full flex-col gap-4"
      style={{ paddingBottom: '24px' }}
    >
      <div className="px-1">
        <p
          className="font-tomorrow font-bold text-xl md:text-3xl leading-snug text-center"
          style={{ color: theme.cream, fontFamily: "'Tomorrow', sans-serif", fontWeight: 700 }}
        >
          {item.question}
        </p>
        <div className="mt-2 text-center text-[11px] font-inter opacity-70">
          <span>Source : </span>
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">
              {sourceName}
            </a>
          ) : (
            <span>{sourceName}</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-wide opacity-80 font-inter">
          {item.category ? (
            <span className="px-3 py-1 rounded-full border border-white/30" style={{ borderColor: 'rgba(255,255,255,0.22)' }}>
              {item.category}
            </span>
          ) : null}
          {item.difficulty ? (
            <span className="px-3 py-1 rounded-full border border-white/30" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
              {item.difficulty}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex flex-col gap-1.5">
          {item.options.map((option, index) => {
            const isSelected = selected === index
            const isAnswer = allCorrectIndices.includes(index)
            const revealState = revealed && (isSelected || isAnswer)
            const style = {
              color: theme.cream,
              background: 'transparent',
              padding: '10px 8px',
            } as CSSProperties
            if (!revealed && isSelected) {
              style.background = 'rgba(255,255,255,0.06)'
            }
            if (revealState && isAnswer) {
              style.background = 'rgba(34,255,156,0.16)'
              style.color = theme.text
            } else if (revealState && !isAnswer) {
              style.background = 'rgba(255,0,92,0.12)'
            }
            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => onSelect(index)}
                disabled={revealed}
                className="w-full rounded-md text-left md:text-center font-inter text-base md:text-lg transition-colors disabled:cursor-default"
                style={style}
              >
                <span className="flex items-center gap-3 justify-between md:justify-center">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold"
                    style={{ borderColor: 'rgba(255,255,255,0.35)' }}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="flex-1 text-left md:text-center leading-snug">{option}</span>
                  {revealed && isAnswer ? (
                    <span className="hidden md:inline-flex text-xs font-semibold" style={{ color: '#22FF9C' }}>
                      ✓
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {revealed && selected !== null ? (
        <div
          className="px-1 font-inter text-sm md:text-base text-center"
          style={{ color: isCorrect ? '#22FF9C' : '#FF8A8A' }}
        >
          {isCorrect ? 'Bonne réponse ! ✅' : (
            <span>
              Mauvaise réponse ❌
              <span className="block mt-1 text-xs md:text-sm opacity-80" style={{ color: theme.cream }}>
                Réponse correcte : {correctAnswers.length ? correctAnswers.join(', ') : item.answer}
              </span>
            </span>
          )}
        </div>
      ) : null}
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
