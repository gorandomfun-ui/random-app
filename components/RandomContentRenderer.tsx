'use client'

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type {
  FactItem,
  FactQuizItem,
  FactTextItem,
  ImageItem,
  JokeItem,
  MiniGameItem,
  QuoteItem,
  RandomContentItem,
  VideoItem,
  WebItem,
} from '../lib/random/clientTypes'
import { getSourceHref, getSourceLabel } from '../lib/random/clientTypes'
import { useScore } from '@/providers/ScoreProvider'
import MiniGameCard from './minigames/MiniGameCard'

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

  if (item.type === 'minigame') {
    return <MiniGameCard item={item as MiniGameItem} theme={theme} />
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
  const { addAction, addPoints } = useScore()

  const allCorrectIndices = useMemo(() => {
    if (Array.isArray(item.correctIndices) && item.correctIndices.length) {
      const unique = Array.from(new Set(item.correctIndices.filter((idx) => idx >= 0 && idx < item.options.length)))
      if (unique.length) return unique
    }
    return [item.correctIndex]
  }, [item.correctIndices, item.correctIndex, item.options.length])


  const quizReward = useMemo(() => {
    const map: Record<string, number> = { easy: 2, medium: 4, hard: 6 }
    return map[item.difficulty ?? ''] ?? 2
  }, [item.difficulty])

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
      addPoints(quizReward)
    }
  }

  const isCorrect = useMemo(
    () => revealed && selected !== null && allCorrectIndices.includes(selected),
    [allCorrectIndices, revealed, selected],
  )
  const difficultyColorMap: Record<string, string> = {
    easy: '#0FC55D',
    medium: '#E5972B',
    hard: '#D90845',
  }
  const difficultyColor = difficultyColorMap[item.difficulty ?? ''] ?? '#E5972B'

  return (
    <div
      className="-mx-4 sm:-mx-6 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] flex h-full flex-col gap-4"
      style={{ paddingBottom: '24px' }}
    >
      <div className="px-4 sm:px-6">
        <p
          className="font-tomorrow font-bold text-xl md:text-3xl leading-snug text-center"
          style={{ color: theme.cream, fontFamily: "'Tomorrow', sans-serif", fontWeight: 700 }}
        >
          {item.question}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-wide font-inter">
          {item.category ? (
            <span
              className="px-4 py-1 rounded-full border text-xs font-semibold"
              style={{ borderColor: 'rgba(255,255,255,0.22)', color: theme.cream }}
            >
              {item.category}
            </span>
          ) : null}
          {item.difficulty ? (
            <span
              className="px-4 py-1 rounded-full text-xs font-semibold uppercase"
              style={{ backgroundColor: difficultyColor, color: '#191916', letterSpacing: '.1em' }}
            >
              {item.difficulty}
            </span>
          ) : null}
        </div>
        {revealed && selected !== null ? (
          <div
            className="mt-4 px-1 font-inter text-sm md:text-base text-center"
            style={{ color: isCorrect ? '#0FC55D' : '#D90845' }}
          >
            {isCorrect ? 'Bonne réponse ! ✅' : 'Mauvaise réponse ❌'}
          </div>
        ) : null}
      </div>
      <div
        className="flex-1 overflow-y-auto px-4 sm:px-6"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="-mx-4 sm:-mx-6 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] flex flex-col gap-1.5 px-0">
          {item.options.map((option, index) => {
            const isSelected = selected === index
            const isAnswer = allCorrectIndices.includes(index)
            const revealState = revealed && (isSelected || isAnswer)
            const style = {
              color: theme.cream,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '12px 16px',
            } as CSSProperties
            if (!revealed && isSelected) {
              style.background = 'rgba(255,255,255,0.08)'
            }
            if (revealState && isAnswer) {
              style.background = '#0FC55D'
              style.color = '#FFFFFF'
              style.borderColor = '#0FC55D'
            } else if (revealState && !isAnswer) {
              style.background = '#D90845'
              style.color = '#FFFFFF'
              style.borderColor = '#D90845'
            }
            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => onSelect(index)}
                disabled={revealed}
                className="w-full text-left md:text-center font-inter text-base md:text-lg transition-colors disabled:cursor-default px-4 py-3"
                style={style}
              >
                <span className="flex items-center gap-3 justify-between md:justify-center">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center border-2 text-[11px] font-semibold"
                    style={{ borderColor: 'rgba(255,255,255,0.5)' }}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="flex-1 text-left md:text-center leading-snug">{option}</span>
                  {revealed && isAnswer ? (
                    <span className="hidden md:inline-flex text-xs font-semibold" style={{ color: '#0FC55D' }}>
                      ✓
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>
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
