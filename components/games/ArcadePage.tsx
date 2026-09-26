'use client'

/**
 * A game inside a Random page, the way the site shows any content: the
 * logo on top, a title bar, the frame, the row of actions. The title bar
 * says RANDOM ARCADE with a gamepad, so it reads as a Random of another
 * kind; no source line and no heart, since a game is not liked; the
 * share button shares the game — its title card, the score, a link — and
 * the trophy opens the ten best of this device. The game itself loads
 * only in the browser, after the page.
 */

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Gamepad2, Trophy, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import type { GameResult } from '@/components/games/GamePlayer'
import { isDaytime } from '@/lib/games/engine'
import { topScores, type GameName, type ScoreEntry } from '@/lib/games/scores'
import { THEMES } from '@/lib/theme'

const GamePlayer = dynamic(() => import('@/components/games/GamePlayer'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center font-tomorrow text-sm uppercase tracking-[0.2em] opacity-70">Loading…</div>,
})

const NAMES: Record<GameName, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER' }
const pad = (n: number) => String(n).padStart(5, '0')

/** The game's title card as a picture to share: the title screen, drawn twice as large. */
async function titleCard(game: GameName, accent: string, best: number): Promise<File | null> {
  const { renderTitle } = await import('@/lib/games/screens')
  const b = renderTitle(game, 'landscape', accent, { level: 1, best, frame: 0, blink: true, day: isDaytime() })
  const small = document.createElement('canvas')
  small.width = b.width
  small.height = b.height
  small.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0)
  const big = document.createElement('canvas')
  big.width = b.width * 2
  big.height = b.height * 2
  const ctx = big.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, big.width, big.height)
  const blob = await new Promise<Blob | null>((resolve) => big.toBlob(resolve, 'image/png'))
  return blob ? new File([blob], `random-${game}.png`, { type: 'image/png' }) : null
}

export default function ArcadePage({ game, themeIndex }: { game: GameName; themeIndex: number }) {
  const theme = THEMES[themeIndex] ?? THEMES[0]
  const [best, setBest] = useState(0)
  const [last, setLast] = useState<GameResult | null>(null)
  const [topOpen, setTopOpen] = useState(false)
  const [top, setTop] = useState<ScoreEntry[]>([])
  const [note, setNote] = useState('')
  const card = useRef<File | null>(null)

  useEffect(() => {
    document.body.classList.add('arcade-body')
    return () => document.body.classList.remove('arcade-body')
  }, [])

  // the card is made ahead, so the share sheet opens within the tap
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void titleCard(game, theme.text, best).then((file) => { if (!cancelled) card.current = file }).catch(() => undefined)
    }, 1200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [game, theme.text, best])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(''), 2200)
    return () => window.clearTimeout(timer)
  }, [note])

  const onResult = useCallback((result: GameResult) => setLast(result), [])
  const openTop = () => { setTop(topScores(game)); setTopOpen(true) }

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}`
    const text = last ? `${NAMES[game]} · SCORE ${pad(last.score)}` : NAMES[game]
    const file = card.current
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: NAMES[game], text: `${text}\n${url}` })
        return
      }
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: NAMES[game], text, url })
        return
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setNote('LINK COPIED')
    } catch {
      setNote(url)
    }
  }

  return (
    <main className="arcade-page flex h-[100svh] flex-col overflow-hidden" style={{ background: theme.bg, color: theme.cream }}>
      <header className="relative z-10 flex items-center justify-between px-4 pb-4 pt-6 sm:px-6">
        <Link href="/random" aria-label="Random" className="flex h-11 w-11 shrink-0 items-center">
          <MonoIcon src="/icons/return.svg" color={theme.text} size={28} />
        </Link>
        <div className="flex flex-1 justify-center">
          <LogoAnimated trigger={0} toSecond={false} vhMobile={8} vhDesktop={8} gapMobile={4} gapDesktop={4} />
        </div>
        <div className="h-11 w-11 shrink-0" aria-hidden="true" />
      </header>

      {/* Two pixels between the title bar and the content, as on every Random page. */}
      <div className="relative z-10 px-4 sm:px-6" style={{ marginBottom: '2px' }}>
        <div className="flex gap-[2px]" style={{ height: '40px' }}>
          <div
            className="flex flex-1 items-center justify-center gap-3 px-4 font-semibold uppercase tracking-wide"
            style={{ backgroundColor: theme.text, color: theme.cream, fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif" }}
          >
            <Gamepad2 size={22} strokeWidth={2.25} aria-hidden="true" />
            <span>Random arcade</span>
          </div>
          <div
            className="flex items-center justify-center px-4 text-xs font-semibold uppercase"
            style={{ backgroundColor: theme.cream, color: '#191916', minWidth: '96px', fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif" }}
          >
            <span>Best {pad(best)}</span>
          </div>
        </div>
      </div>

      <section className="relative z-10 flex min-h-0 flex-1 flex-col px-4 sm:px-6">
        <div className="min-h-0 flex-1" style={{ background: '#000' }}>
          <GamePlayer game={game} accent={theme.text} onBest={setBest} onResult={onResult} />
        </div>
      </section>

      <section className="relative z-10 px-4 sm:px-6" style={{ margin: '10px 0', paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex w-full items-center justify-between gap-4">
          <button type="button" aria-label="Top 10" onClick={openTop} className="p-3" style={{ color: theme.cream }}>
            <Trophy size={28} strokeWidth={2} />
          </button>
          <div className="flex flex-1 justify-center" style={{ minWidth: '160px', maxWidth: '260px' }}>
            <Link
              href="/random"
              className="w-full rounded-[28px] px-6 py-3 text-center font-tomorrow font-bold uppercase shadow-md transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: theme.text, color: theme.cream }}
            >
              Random
            </Link>
          </div>
          <button type="button" aria-label="Share the game" title="Share the game" onClick={() => void share()} className="p-3">
            <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
          </button>
        </div>
      </section>

      {note ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <span className="max-w-full truncate px-4 py-2 font-tomorrow text-sm font-bold uppercase tracking-[0.1em]" style={{ background: theme.cream, color: '#191916' }}>{note}</span>
        </div>
      ) : null}

      {topOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="absolute inset-0" onClick={() => setTopOpen(false)} />
          <div className="relative w-full max-w-[360px] border-2 p-5" style={{ background: '#0a0a14', borderColor: theme.text }}>
            <button type="button" aria-label="Close" onClick={() => setTopOpen(false)} className="absolute right-3 top-3" style={{ color: theme.cream }}>
              <X size={24} />
            </button>
            <h2 className="mb-1 font-tomorrow text-xl font-bold uppercase tracking-[0.12em]" style={{ color: theme.text }}>Top 10</h2>
            <p className="mb-4 font-tomorrow text-xs uppercase tracking-[0.12em] opacity-70">{NAMES[game]} · this device</p>
            {top.length ? (
              <ol className="flex flex-col gap-1 font-tomorrow text-sm uppercase">
                {top.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="grid grid-cols-[2.2em_1fr_auto_3.2em] items-center gap-2" style={{ color: index === 0 ? theme.text : theme.cream }}>
                    <span className="opacity-70">{index + 1}.</span>
                    <span className="truncate font-bold">{entry.name}</span>
                    <span className="font-bold tabular-nums">{pad(entry.score)}</span>
                    <span className="text-right text-xs opacity-70">LV {entry.level}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-tomorrow text-sm uppercase opacity-70">No score yet</p>
            )}
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .arcade-body #cookie-banner { display: none !important; }
        .arcade-body { overscroll-behavior: none; }
      `}</style>
    </main>
  )
}
