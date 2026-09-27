'use client'

/**
 * A game in the Random flow, in the content's frame: the offer on the game's
 * title screen (Play, No thanks, and quietly, Don't offer again), then one
 * level, then what comes next said in the visitor's language — the next
 * level in so many randoms, a retry, try again later, all sixteen won — with
 * the way back to the randoms. The first level won asks for a name, once.
 *
 * The page keeps the rest: the flow's state, the points, the world's table.
 * Loaded only when a game comes up; it also tints Random's glitch backdrop
 * in the theme's colours for as long as it is on screen.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import GamePlayer, { type GameControl, type PlayState, type Round, type RoundEvent } from '@/components/games/GamePlayer'
import { formatI18n } from '@/lib/i18n/format'
import { lastName, NAME_MAX, type GameName } from '@/lib/games/scores'
import type { Theme } from '@/lib/theme'
import { useI18n } from '@/providers/I18nProvider'

import { GAME_TITLES, titleCard } from './share'

export type Decision = { kind: 'won' | 'winner' | 'lost' | 'quit'; score: number; level: number }

export default function ArcadeStage({
  game,
  theme,
  round,
  control,
  after,
  onPlayState,
  onStarted,
  onDeclined,
  onNever,
  onDecided,
  onContinue,
  onCard,
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
  onNever: () => void
  onDecided: (decision: Decision) => void
  onContinue: (name: string | null) => void
  onCard: (card: File | null, url: string | null) => void
}) {
  const { t } = useI18n()
  const [event, setEvent] = useState<RoundEvent>({ kind: 'title' })
  const [name, setName] = useState('')
  const [askName, setAskName] = useState(false)
  const decided = useRef(false)
  const words = (key: string, fallback: string, values: Record<string, string | number> = {}) => formatI18n(t(`arcade.${key}`, fallback), values)

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

  const onRound = useCallback((e: RoundEvent) => {
    setEvent(e)
    if (e.kind === 'play') { decided.current = false; onStarted() }
    else if (e.kind === 'declined') onDeclined()
    else if ((e.kind === 'won' || e.kind === 'winner' || e.kind === 'lost' || e.kind === 'quit') && !decided.current) {
      decided.current = true
      if ((e.kind === 'won' || e.kind === 'winner') && !lastName()) { setAskName(true); setName('') }
      onDecided(e)
    }
  }, [onStarted, onDeclined, onDecided])

  const ended = event.kind === 'won' || event.kind === 'winner' || event.kind === 'lost' || event.kind === 'quit'
  const leave = useCallback(() => onContinue(askName ? name.trim() || null : null), [askName, name, onContinue])

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

  return (
    <div className="arcade-stage">
      <GamePlayer game={game} accent={theme.text} round={round} onRound={onRound} onPlayState={onPlayState} control={control} />
      {event.kind === 'title' ? (
        <div className="arcade-stage__panel">
          <p className="arcade-stage__line">{words('offer', 'Up for a game of {game}?', { game: GAME_TITLES[game] })}</p>
          <div className="arcade-stage__buttons">
            <button type="button" className="arcade-stage__button" style={{ background: theme.text, color: theme.cream }} onClick={() => control.start?.()}>{words('play', 'Play')}</button>
            <button type="button" className="arcade-stage__button arcade-stage__button--quiet" style={{ borderColor: theme.cream, color: theme.cream }} onClick={onDeclined}>{words('noThanks', 'No thanks')}</button>
          </div>
          <button type="button" className="arcade-stage__never" onClick={onNever}>{words('never', "Don't offer again")}</button>
        </div>
      ) : null}
      {event.kind === 'retry' && line ? <div className="arcade-stage__panel arcade-stage__panel--note"><p className="arcade-stage__line">{line}</p></div> : null}
      {ended && line ? (
        <form className="arcade-stage__panel" onSubmit={submit}>
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
          <button type="submit" className="arcade-stage__button" style={{ background: theme.text, color: theme.cream }}>{words('continue', 'Continue the randoms')}</button>
        </form>
      ) : null}
      <style jsx>{`
        .arcade-stage { position: relative; width: 100%; height: 100%; }
        .arcade-stage__panel { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); width: min(420px, calc(100% - 24px)); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 14px 12px; background: rgba(8, 8, 16, 0.86); border: 1px solid rgba(248, 245, 230, 0.18); font-family: var(--font-inter-tight), 'Inter Tight', sans-serif; color: #f8f5e6; text-align: center; z-index: 2; }
        .arcade-stage__panel--note { bottom: 8px; padding: 8px 12px; }
        .arcade-stage__line { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; }
        .arcade-stage__buttons { display: flex; gap: 10px; width: 100%; }
        .arcade-stage__button { flex: 1; min-height: 44px; padding: 10px 14px; border: 0; border-radius: 28px; font-family: var(--font-tomorrow), sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; width: 100%; }
        .arcade-stage__button--quiet { background: transparent; border: 2px solid; }
        .arcade-stage__never { background: none; border: 0; color: rgba(248, 245, 230, 0.6); font-size: 12px; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
        .arcade-stage__name { width: 100%; height: 44px; background: transparent; border: 2px solid; color: #f8f5e6; font-family: var(--font-tomorrow), sans-serif; font-size: 18px; letter-spacing: 0.14em; text-align: center; outline: none; }
        .arcade-stage__name::placeholder { color: rgba(248, 245, 230, 0.4); letter-spacing: 0.06em; }
      `}</style>
      <style jsx global>{`
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
