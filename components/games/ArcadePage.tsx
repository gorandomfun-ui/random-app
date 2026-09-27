'use client'

/**
 * A game inside a Random page, the way the site shows any content: the
 * menu and the logo on top, a title bar, the frame, the row of actions.
 * Where Random has Wave, a pause button: pause lives on the page, not in
 * the game. The title bar says RANDOM ARCADE with a gamepad, so it reads
 * as a Random of another kind; no source line and no heart, since a game
 * is not liked: in the heart's place HIGH SCORE in pixel letters opens the
 * ten best of this device; the share button shares the game — its title
 * card, the score, a link. Behind it all, a calm glitch in the theme's
 * colours. The game itself loads only in the browser, after the page.
 */

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Gamepad2, Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ArcadeBackdrop from '@/components/games/ArcadeBackdrop'
import ArcadeMenu from '@/components/games/ArcadeMenu'
import PixelWords from '@/components/games/PixelWords'
import type { GameControl, GameResult, PlayState } from '@/components/games/GamePlayer'
import ScoresPanel from '@/components/games/ScoresPanel'
import { shareGame, titleCard } from '@/components/games/share'
import { fetchTicket, sendScore, type Ticket } from '@/components/games/world'
import { lastName, type GameName } from '@/lib/games/scores'
import { THEMES } from '@/lib/theme'
import { useScore } from '@/providers/ScoreProvider'

const GamePlayer = dynamic(() => import('@/components/games/GamePlayer'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center font-tomorrow text-sm uppercase tracking-[0.2em] opacity-70">Loading…</div>,
})

const NAMES: Record<GameName, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER' }
const pad = (n: number) => String(n).padStart(5, '0')

export default function ArcadePage({ game, themeIndex }: { game: GameName; themeIndex: number }) {
  const theme = THEMES[themeIndex] ?? THEMES[0]
  const [best, setBest] = useState(0)
  const [last, setLast] = useState<GameResult | null>(null)
  const [topOpen, setTopOpen] = useState(false)
  const [note, setNote] = useState('')
  const { addPoints } = useScore()
  const ticket = useRef<Ticket | null>(null)
  const pending = useRef<GameResult | null>(null)
  const [playState, setPlayState] = useState<PlayState>('idle')
  const [backdrop, setBackdrop] = useState<string | null>(null)
  const card = useRef<File | null>(null)
  const control = useRef<GameControl>({}).current

  useEffect(() => {
    document.body.classList.add('arcade-body')
    return () => document.body.classList.remove('arcade-body')
  }, [])

  // the card is made ahead, so the share sheet opens within the tap
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void titleCard(game, theme.text, best).then((file) => {
        if (cancelled || !file) return
        card.current = file
        // the first card also becomes the page's backdrop
        setBackdrop((current) => current ?? URL.createObjectURL(file))
      }).catch(() => undefined)
    }, 1200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [game, theme.text, best])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(''), 2200)
    return () => window.clearTimeout(timer)
  }, [note])

  /** A game begins: its ticket for the world's table. */
  const onStart = useCallback(() => {
    ticket.current = null
    void fetchTicket(game).then((t) => { ticket.current = t })
  }, [game])
  /** The world's table, under the name given (or the last one, or PLAYER). */
  const toWorld = useCallback((result: GameResult, name: string) => {
    if (!ticket.current || result.score <= 0) return
    void sendScore(game, ticket.current, { name, score: result.score, level: result.level, won: result.won })
  }, [game])
  const onResult = useCallback((result: GameResult) => {
    setLast(result)
    // the site's points: all sixteen won is worth five more than its last level
    if (result.won) addPoints(6)
    if (result.needsName) pending.current = result
    else toWorld(result, lastName() || 'PLAYER')
  }, [addPoints, toWorld])
  const onNamed = useCallback((name: string) => {
    if (pending.current) toWorld(pending.current, name)
    pending.current = null
  }, [toWorld])
  const onLevelCleared = useCallback(() => addPoints(1), [addPoints])
  // a panel over the game pauses it
  const holdGame = () => { if (playState === 'playing') control.togglePause?.() }
  const openTop = () => { holdGame(); setTopOpen(true) }

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}`
    const text = last ? `${NAMES[game]} · SCORE ${pad(last.score)}` : NAMES[game]
    const outcome = await shareGame(game, text, url, card.current)
    if (outcome === 'copied') setNote('LINK COPIED')
    else if (outcome === 'failed') setNote(url)
  }

  return (
    <main className="arcade-page relative flex h-[100svh] flex-col overflow-hidden" style={{ background: theme.bg, color: theme.cream }}>
      <ArcadeBackdrop image={backdrop} accent={theme.text} playing={playState === 'playing'} />
      <header className="relative z-10 flex items-center justify-between px-4 pb-4 pt-6 sm:px-6">
        <ArcadeMenu theme={theme} onOpen={holdGame} />
        <div className="flex flex-1 justify-center">
          <LogoAnimated trigger={0} toSecond={false} vhMobile={8} vhDesktop={8} gapMobile={4} gapDesktop={4} />
        </div>
        <button
          type="button"
          aria-label={playState === 'paused' ? 'Resume' : 'Pause'}
          title={playState === 'paused' ? 'Resume' : 'Pause'}
          onClick={() => control.togglePause?.()}
          disabled={playState === 'idle'}
          aria-pressed={playState === 'paused'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:cursor-default disabled:hover:scale-100"
          style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: playState === 'idle' ? '#777777' : theme.text, color: playState === 'idle' ? '#777777' : '#ffffff', background: 'transparent' }}
        >
          {playState === 'paused' ? <Play size={22} strokeWidth={2.25} fill="currentColor" /> : <Pause size={22} strokeWidth={2.25} fill="currentColor" />}
        </button>
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
          <GamePlayer game={game} accent={theme.text} onBest={setBest} onResult={onResult} onStart={onStart} onNamed={onNamed} onLevelCleared={onLevelCleared} onPlayState={setPlayState} control={control} />
        </div>
      </section>

      <section className="relative z-10 px-4 sm:px-6" style={{ margin: '10px 0', paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex w-full items-center justify-between gap-4">
          <button type="button" aria-label="High score" onClick={openTop} className="flex items-center py-2 pr-2 transition-transform hover:scale-105">
            <PixelWords lines={['HIGH', 'SCORE']} color={theme.text} />
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
          <button type="button" aria-label="Share the game" title="Share the game" onClick={() => { holdGame(); void share() }} className="p-3">
            <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
          </button>
        </div>
      </section>

      {note ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <span className="max-w-full truncate px-4 py-2 font-tomorrow text-sm font-bold uppercase tracking-[0.1em]" style={{ background: theme.cream, color: '#191916' }}>{note}</span>
        </div>
      ) : null}

      {topOpen ? <ScoresPanel game={game} theme={theme} onClose={() => setTopOpen(false)} /> : null}

      <style jsx global>{`
        .arcade-body #cookie-banner { display: none !important; }
        .arcade-body { overscroll-behavior: none; }
      `}</style>
    </main>
  )
}
