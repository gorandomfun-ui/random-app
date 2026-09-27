'use client'

/**
 * A game in the Random flow, in the content's frame: the game's title screen
 * with a PLAY button like Random's own — nothing else, no box, no sentence:
 * to pass, RANDOM AGAIN, as for any content. Then one level, then what comes
 * next, said in the visitor's language on a quiet panel — the next level in
 * so many randoms, a retry, try again later, all sixteen won — with CONTINUE
 * back to the randoms. The first level won asks for a name, once.
 *
 * On a phone, PLAY takes the game full screen: a bar on top (play/pause on
 * the left, RANDOM in pixel letters in the theme's colour, × on the right),
 * the board as large as the screen allows and a tall band of controls. ×
 * pauses and brings the page back, the game still there; PLAY again takes it
 * up where it was. A round over, the page comes back by itself. On a phone
 * held upright the page puts PLAY and the end of a round under the picture,
 * not over it, and keeps room for them; held sideways there is no room: at
 * its foot, as on a computer.
 *
 * The page keeps the rest: the flow's state, the points, the world's table.
 * Loaded only when a game comes up; it also tints Random's glitch backdrop
 * in the theme's colours for as long as it is on screen.
 */

import { Pause, Play, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import GamePlayer, { type GameControl, type PlayState, type Round, type RoundEvent } from '@/components/games/GamePlayer'
import { formatI18n } from '@/lib/i18n/format'
import { drawLogo, LOGO_HEIGHT, LOGO_WIDTH } from '@/lib/games/logo'
import { PixelBuffer } from '@/lib/games/pixels'
import { lastName, NAME_MAX, type GameName } from '@/lib/games/scores'
import type { Theme } from '@/lib/theme'
import { useI18n } from '@/providers/I18nProvider'

import { titleCard } from './share'

export type Decision = { kind: 'won' | 'winner' | 'lost' | 'quit'; score: number; level: number }

/** RANDOM in the games' pixel letters, in a colour. */
function PixelRandom({ color, height }: { color: string; height: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const b = new PixelBuffer(LOGO_WIDTH, LOGO_HEIGHT, '#000000')
    drawLogo(b, 0, 0, color, 1)
    // the letters only: the rest see-through
    for (let i = 0; i < b.data.length; i += 4) if (b.data[i] === 0 && b.data[i + 1] === 0 && b.data[i + 2] === 0) b.data[i + 3] = 0
    canvas.width = LOGO_WIDTH
    canvas.height = LOGO_HEIGHT
    ctx.putImageData(new ImageData(b.data as Uint8ClampedArray<ArrayBuffer>, LOGO_WIDTH, LOGO_HEIGHT), 0, 0)
  }, [color])
  return <canvas ref={ref} aria-label="Random" style={{ height, width: (height * LOGO_WIDTH) / LOGO_HEIGHT, imageRendering: 'pixelated' }} />
}

/** A phone: a touch screen whose short side is under 600 pixels. */
function isPhone(): boolean {
  if (typeof window === 'undefined') return false
  const touch = (window.matchMedia?.('(pointer: coarse)').matches ?? false) || 'ontouchstart' in window
  return touch && Math.min(window.innerWidth, window.innerHeight) < 600
}

export default function ArcadeStage({
  game,
  theme,
  round,
  control,
  after,
  onPlayState,
  onStarted,
  onDeclined,
  onDecided,
  onContinue,
  onCard,
  onFull,
}: {
  game: GameName
  theme: Theme
  round: Round
  control: GameControl
  /** How many randoms until the game comes back: after a level won, after a level lost. */
  after: { won: number; lost: number }
  onPlayState: (state: PlayState) => void
  onStarted: () => void
  onDeclined: () => void
  onDecided: (decision: Decision) => void
  onContinue: (name: string | null) => void
  onCard: (card: File | null, url: string | null) => void
  /** The game goes full screen on a phone, or comes back into the page. */
  onFull: (full: boolean) => void
}) {
  const { t } = useI18n()
  const [event, setEvent] = useState<RoundEvent>({ kind: 'title' })
  const [name, setName] = useState('')
  const [askName, setAskName] = useState(false)
  const [phone, setPhone] = useState(false)
  const [upright, setUpright] = useState(true)
  const [full, setFull] = useState(false)
  const [playState, setPlayState] = useState<PlayState>('idle')
  const decided = useRef(false)
  const started = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const words = (key: string, fallback: string, values: Record<string, string | number> = {}) => formatI18n(t(`arcade.${key}`, fallback), values)

  useEffect(() => {
    const check = () => { setPhone(isPhone()); setUpright(window.innerHeight >= window.innerWidth) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // where the game's picture stands in the stage, so what goes with it sits at its foot or under it
  const [shot, setShot] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let canvas: HTMLCanvasElement | null = null
    let watch: ResizeObserver | null = null
    const measure = () => {
      if (!canvas) return
      const a = stage.getBoundingClientRect(), b = canvas.getBoundingClientRect()
      setShot({ left: b.left - a.left, top: b.top - a.top, width: b.width, height: b.height })
    }
    const find = window.setInterval(() => {
      canvas = stage.querySelector('canvas.game-player__canvas')
      if (!canvas || canvas.getBoundingClientRect().width === 0) return
      window.clearInterval(find)
      watch = new ResizeObserver(measure)
      watch.observe(canvas)
      watch.observe(stage)
      measure()
    }, 60)
    return () => { window.clearInterval(find); watch?.disconnect() }
  }, [])

  // the title card: the share picture and, while the game is on, Random's backdrop
  const cardTo = useRef(onCard)
  cardTo.current = onCard
  useEffect(() => {
    let url: string | null = null, live = true
    void titleCard(game, theme.text, 0).then((file) => {
      if (!live) return
      url = file ? URL.createObjectURL(file) : null
      cardTo.current(file, url)
    }).catch(() => undefined)
    return () => { live = false; if (url) URL.revokeObjectURL(url); cardTo.current(null, null) }
  }, [game, theme.text])

  const fullTo = useRef(onFull)
  fullTo.current = onFull
  const goFull = useCallback((on: boolean) => { setFull(on); fullTo.current(on) }, [])
  // a full-screen game locks the page behind it; the page comes back when it ends
  useEffect(() => {
    if (!full) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = before }
  }, [full])
  useEffect(() => () => fullTo.current(false), [])

  const onRound = useCallback((e: RoundEvent) => {
    setEvent(e)
    if (e.kind === 'play') { decided.current = false; started.current = true; onStarted() }
    else if (e.kind === 'declined') onDeclined()
    else if ((e.kind === 'won' || e.kind === 'winner' || e.kind === 'lost' || e.kind === 'quit') && !decided.current) {
      decided.current = true
      if ((e.kind === 'won' || e.kind === 'winner') && !lastName()) { setAskName(true); setName('') }
      // the round is over: the page comes back, with what comes next
      goFull(false)
      onDecided(e)
    }
  }, [goFull, onStarted, onDeclined, onDecided])

  const ended = event.kind === 'won' || event.kind === 'winner' || event.kind === 'lost' || event.kind === 'quit'
  const leave = useCallback(() => onContinue(askName ? name.trim() || null : null), [askName, name, onContinue])

  /** PLAY: the round begins, or takes up where it was; on a phone, full screen first, the game started once the frame has grown. */
  const play = useCallback(() => {
    const go = () => {
      if (event.kind === 'retry') control.retry?.()
      else if (started.current) control.resume?.()
      else control.start?.()
    }
    if (!phone) { go(); return }
    goFull(true)
    requestAnimationFrame(() => requestAnimationFrame(go))
  }, [control, event.kind, goFull, phone])

  /** ×: the game pauses and the page comes back; nothing is lost. */
  const close = useCallback(() => {
    control.pause?.()
    goFull(false)
  }, [control, goFull])

  // Enter takes the way back once the round is over; typing a name keeps its keys
  useEffect(() => {
    if (!ended) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON')) return
      if (e.key === 'Enter') { e.preventDefault(); leave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ended, leave])

  const submit = (e: FormEvent) => { e.preventDefault(); leave() }
  const line =
    event.kind === 'won' ? words('nextLevel', 'Next level in {count} randoms', { count: after.won })
    : event.kind === 'winner' ? words('winnerLine', 'All 16 levels won!')
    : event.kind === 'lost' || event.kind === 'quit' ? words('tryAgain', 'Try again in {count} randoms', { count: after.lost })
    : event.kind === 'retry' ? (event.retriesLeft === 1 ? words('retryLeft', '1 try left') : words('retriesLeft', '{count} tries left', { count: event.retriesLeft }))
    : null

  // PLAY shows on the title; on a phone also in the page while a round waits, paused or for a retry
  const showPlay = !full && (event.kind === 'title' || (phone && started.current && !ended && (event.kind === 'play' || event.kind === 'retry')))
  // on a phone held upright in the page, under the picture, in room kept for it; elsewhere, at its foot
  const under = phone && upright && !full
  const room = !under ? 0 : ended ? (askName ? 156 : 108) : event.kind === 'retry' ? 112 : 72
  // under the picture, the page's width: a narrow picture (a tall board) would squeeze the pill and the panel
  const footOf = (gap: number) => shot && (under
    ? { left: 0, width: '100%', top: shot.top + shot.height + gap }
    : { left: shot.left, width: shot.width, top: shot.top + shot.height * 0.9, transform: 'translateY(-100%)' })

  return (
    <div ref={stageRef} className={`arcade-stage${full ? ' arcade-stage--full' : ''}`} style={full ? { background: theme.bg } : undefined}>
      {full ? (
        <div className="arcade-stage__bar">
          <button type="button" className="arcade-stage__icon" aria-label={playState === 'paused' ? words('resume', 'Resume') : words('pause', 'Pause')} onClick={() => control.togglePause?.()} style={{ borderColor: theme.text }}>
            {playState === 'paused' ? <Play size={20} strokeWidth={2.25} fill="currentColor" /> : <Pause size={20} strokeWidth={2.25} fill="currentColor" />}
          </button>
          <PixelRandom color={theme.text} height={30} />
          <button type="button" className="arcade-stage__icon" aria-label="Close" onClick={close} style={{ borderColor: theme.text }}>
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
      <div className="arcade-stage__game" style={room ? { marginBottom: room } : undefined}>
        <GamePlayer
          game={game}
          accent={theme.text}
          round={round}
          onRound={onRound}
          onPlayState={(state) => { setPlayState(state); onPlayState(state) }}
          control={control}
          big={full}
          align={under ? 'top' : 'center'}
        />
      </div>
      {showPlay && shot ? (
        <div className="arcade-stage__foot" style={footOf(14) ?? undefined}>
          <button type="button" className="arcade-stage__pill" style={{ background: theme.text, color: theme.cream }} onClick={play}>Play</button>
        </div>
      ) : null}
      {event.kind === 'retry' && line && shot && !full && under ? (
        <div className="arcade-stage__foot" style={{ left: 0, width: '100%', top: shot.top + shot.height + 76 }}>
          <p className="arcade-stage__note">{line}</p>
        </div>
      ) : event.kind === 'retry' && line && shot ? (
        <div className="arcade-stage__foot" style={{ left: shot.left, width: shot.width, top: shot.top + shot.height - 6, transform: 'translateY(-100%)' }}>
          <p className="arcade-stage__note">{line}</p>
        </div>
      ) : null}
      {shot && ended && line ? (
        <form
          className="arcade-stage__panel"
          onSubmit={submit}
          style={under
            ? { left: '50%', width: 'min(320px, calc(100% - 32px))', top: shot.top + shot.height + 10, transform: 'translateX(-50%)' }
            : { left: shot.left + shot.width * 0.06, width: shot.width * 0.88, top: shot.top + shot.height - 10, transform: 'translateY(-100%)' }}
        >
          <p className="arcade-stage__line">{line}</p>
          {askName ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              placeholder={words('yourName', 'Your name')}
              aria-label={words('yourName', 'Your name')}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="done"
              className="arcade-stage__name"
              style={{ borderColor: theme.text }}
            />
          ) : null}
          <button type="submit" className="arcade-stage__pill" style={{ background: theme.text, color: theme.cream }}>Continue</button>
        </form>
      ) : null}
      <style jsx>{`
        .arcade-stage { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; }
        .arcade-stage__game { position: relative; flex: 1; min-height: 0; }
        /* full screen on a phone: the bar on top, the game under it, the phone's own edges kept clear */
        .arcade-stage--full { padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
        .arcade-stage__bar { flex: none; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; }
        .arcade-stage__icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 999px; border: 2px solid; background: transparent; color: #ffffff; }
        .arcade-stage__foot { position: absolute; display: flex; justify-content: center; z-index: 2; pointer-events: none; }
        .arcade-stage__foot > * { pointer-events: auto; }
        /* the same pill as Random's own button, with a shadow to stand out */
        .arcade-stage__pill { min-width: 160px; max-width: 260px; width: 62%; padding: 12px 24px; border: 0; border-radius: 28px; font-family: var(--font-tomorrow), sans-serif; font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55), 0 3px 0 rgba(0, 0, 0, 0.35); transition: transform 120ms ease; }
        .arcade-stage__pill:hover { transform: scale(1.02); }
        .arcade-stage__note { margin: 0; padding: 4px 12px; border-radius: 12px; background: rgba(8, 8, 16, 0.55); color: #f8f5e6; font-family: var(--font-inter-tight), 'Inter Tight', sans-serif; font-size: 13px; font-weight: 600; }
        /* a quiet panel with the game: the line, a name once, CONTINUE */
        .arcade-stage__panel { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px 12px 12px; border-radius: 16px; background: rgba(8, 8, 16, 0.5); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); font-family: var(--font-inter-tight), 'Inter Tight', sans-serif; color: #f8f5e6; text-align: center; z-index: 2; }
        .arcade-stage__line { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.3; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); }
        .arcade-stage__name { width: 100%; max-width: 260px; height: 38px; background: rgba(0, 0, 0, 0.35); border: 2px solid; border-radius: 10px; color: #f8f5e6; font-family: var(--font-tomorrow), sans-serif; font-size: 16px; letter-spacing: 0.14em; text-align: center; outline: none; }
        .arcade-stage__name::placeholder { color: rgba(248, 245, 230, 0.45); letter-spacing: 0.06em; }
      `}</style>
      <style jsx global>{`
        /* full screen on a phone: the content's section leaves the page's flow and takes the whole screen, as a full-screen video does */
        .random-page--arcade-full .random-content-section { position: fixed !important; inset: 0 !important; z-index: 1000 !important; padding: 0 !important; margin: 0 !important; gap: 0 !important; }
        .random-page--arcade-full .random-content-frame { height: 100% !important; width: 100% !important; }
        /* Random's glitch backdrop while a game is on: the game's own card behind, the signal in the theme's colours rather than cyan and magenta */
        .random-page--arcade .random-immersive-bg::before {
          background:
            linear-gradient(90deg, transparent 0 5%, color-mix(in srgb, var(--random-bg-accent) 85%, #fff) 5% 19%, rgba(2, 2, 2, 0.88) 19% 24%, var(--random-bg-accent) 24% 51%, transparent 51% 100%) 0 8% / 88% 1.44px no-repeat,
            linear-gradient(90deg, transparent 0 16%, color-mix(in srgb, var(--random-bg-accent) 45%, #fff) 16% 29%, rgba(255, 255, 255, 0.7) 29% 32%, color-mix(in srgb, var(--random-bg-accent) 70%, #000) 32% 73%, transparent 73% 100%) 18% 72% / 90% 1.8px no-repeat,
            linear-gradient(90deg, var(--random-bg-accent) 0 14%, transparent 14% 31%, color-mix(in srgb, var(--random-bg-accent) 55%, #fff) 31% 62%, rgba(3, 3, 3, 0.92) 62% 68%, transparent 68% 100%) -10% 88% / 76% 2.4px no-repeat;
        }
        .random-page--arcade .random-immersive-bg::after {
          background:
            repeating-linear-gradient(180deg, color-mix(in srgb, var(--random-bg-accent) 16%, transparent) 0 0.34px, rgba(0, 0, 0, 0.28) 0.34px 0.68px, transparent 0.68px 1.02px),
            repeating-linear-gradient(180deg, transparent 0 1.7px, color-mix(in srgb, var(--random-bg-accent) 10%, transparent) 1.7px 1.95px, transparent 1.95px 4.9px),
            linear-gradient(180deg, rgba(0, 0, 0, 0.18), transparent 18%, rgba(0, 0, 0, 0.22) 54%, transparent 72%, rgba(0, 0, 0, 0.18));
        }
        .random-page--arcade .random-immersive-fragment { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04), 4px 0 0 color-mix(in srgb, var(--random-bg-accent) 26%, transparent), -3px 0 0 color-mix(in srgb, var(--random-bg-accent) 16%, #000) !important; }
        .random-page--arcade .random-immersive-fragment--signal, .random-page--arcade .random-immersive-fragment--signal-bar {
          background-image: linear-gradient(90deg, var(--random-bg-accent) 0 42%, #ffffff 42% 48%, #030303 48% 52%, color-mix(in srgb, var(--random-bg-accent) 50%, #fff) 52% 78%, transparent 78% 100%) !important;
          filter: none;
        }
        /* while playing, the backdrop calms down and holds still, so it never pulls the eye from the game */
        .random-page--arcade-playing .random-immersive-bg { opacity: 0.55; transition: opacity 500ms ease; }
        .random-page--arcade-playing .random-immersive-bg *, .random-page--arcade-playing .random-immersive-bg::before { animation-play-state: paused !important; }
      `}</style>
    </div>
  )
}
