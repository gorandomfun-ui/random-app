'use client'

/**
 * One of the two games, played: a canvas that fills its frame with square
 * pixels, the title on its street, the game at sixty steps a second
 * whatever the screen, GAME OVER, and a name for the ten best of this
 * device; WINNER when the sixteenth level is cleared. Arrows, WASD or
 * ZQSD steer, a swipe too, or on a tall screen the cross of arrows — the
 * whole band under the board answers, and a thumb can roll from one arm to
 * the next without lifting. P or Escape pause, and so does the page's own
 * pause button through `control`; the game pauses by itself when the page
 * is left. Wide or tall is chosen at the start of a game, from the frame's
 * shape, and kept until it ends.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'

import { createCatcher, nextLevel, stepCatcher, type CatcherState } from '@/lib/games/catcher'
import { createEater, stepEater, turnEater, type EaterState } from '@/lib/games/eater'
import { crossDirection, FixedClock, isDaytime, keyDirection, swipeDirection } from '@/lib/games/engine'
import type { PixelBuffer } from '@/lib/games/pixels'
import { addScore, bestScore, lastName, NAME_MAX, qualifies, type GameName } from '@/lib/games/scores'
import { dpadGeometry, gameOverHits, pauseHits, playSize, renderCatcherGame, renderEaterGame, renderGameOver, renderTitle, renderWinner, winnerHits, type Hit, type Layout } from '@/lib/games/screens'
import type { Direction } from '@/lib/games/sprites'

export type GameResult = { score: number; level: number; won: boolean; needsName?: boolean }
/**
 * A round of the Random flow: one level of a game under way, from its score so
 * far; `retries` more tries straight away if it is lost.
 */
export type Round = { level: number; score: number; retries: number }
/** What a round tells the page, so it can say the rest in the visitor's language. */
export type RoundEvent =
  | { kind: 'title' | 'play' | 'declined' }
  | { kind: 'retry'; retriesLeft: number }
  | { kind: 'won' | 'winner' | 'lost' | 'quit'; score: number; level: number }
/** What the page shows beside the game: a game under way, paused, or none. */
export type PlayState = 'idle' | 'playing' | 'paused'
/**
 * Filled in by the player, so the page's own buttons can reach it: pause, and
 * in a round, start — and, for the effects test page's bench only, end the
 * round won or lost at once.
 */
export type GameControl = { togglePause?: () => void; start?: () => void; finishRound?: (won: boolean) => void }

type Mode = 'title' | 'play' | 'ending' | 'name' | 'over' | 'winner' | 'cleared' | 'retry' | 'lost'

type Session = {
  mode: Mode
  layout: Layout
  catcher: CatcherState | null
  eater: EaterState | null
  /** The pause card, RESUME (0) or QUIT (1) lit; null while playing. */
  pause: 0 | 1 | null
  /** GAME OVER's answer: YES (0) or NO (1). */
  choice: 0 | 1
  frame: number
  blink: boolean
  slow: number
  endSteps: number
  seed: number
  score: number
  level: number
  won: boolean
  /** In a round: tries left after this one. */
  retriesLeft: number
  dirty: boolean
}

/**
 * A game's seed, drawn from the browser's crypto rather than Math.random: the
 * Random page draws its format cycles from Math.random, and a game in between
 * must not move them.
 */
function gameSeed(): number {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 0x7ffffffe) + 1 } catch { return (Date.now() % 0x7ffffffe) + 1 }
}

/** The title, GAME OVER and WINNER move at the pace of the approved mock page: a picture every 450 ms. */
const SLOW_MS = 450
const within = (h: Hit, x: number, y: number) => x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h

/** Wide or tall: whichever lets the board be drawn the larger in this frame. */
function layoutFor(width: number, height: number): Layout {
  if (!width || !height) return 'landscape'
  const wide = playSize('landscape'), tall = playSize('portrait')
  return Math.min(width / wide.width, height / wide.height) >= Math.min(width / tall.width, height / tall.height) ? 'landscape' : 'portrait'
}

/**
 * The size on screen: whole device pixels per game pixel when that costs
 * little room, the frame's full size otherwise. On a sharp phone screen an
 * uneven pixel does not show, so there the whole number must cost less.
 */
function fit(boxW: number, boxH: number, w: number, h: number, dpr: number): { width: number; height: number } {
  const exact = Math.min((boxW * dpr) / w, (boxH * dpr) / h)
  const whole = Math.floor(exact)
  const scale = whole >= 1 && whole / exact >= (dpr >= 2 ? 0.93 : 0.85) ? whole : exact
  return { width: (w * scale) / dpr, height: (h * scale) / dpr }
}

export default function GamePlayer({
  game,
  accent,
  onBest,
  onResult,
  onStart,
  onPlayState,
  control,
  round,
  onRound,
  onLevelCleared,
  onNamed,
}: {
  game: GameName
  accent: string
  onBest?: (best: number) => void
  onResult?: (result: GameResult) => void
  onStart?: () => void
  onPlayState?: (state: PlayState) => void
  control?: GameControl
  /** Present in the Random flow: one level, then the page takes over. */
  round?: Round
  onRound?: (event: RoundEvent) => void
  /** A level cleared in a whole game (not in a round, which says so through `onRound`). */
  onLevelCleared?: (level: number) => void
  /** The name typed for a score of the device's ten best. */
  onNamed?: (name: string) => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const session = useRef<Session>({ mode: 'title', layout: 'landscape', catcher: null, eater: null, pause: null, choice: 0, frame: 0, blink: true, slow: 0, endSteps: 0, seed: 1, score: 0, level: 1, won: false, retriesLeft: round?.retries ?? 0, dirty: true })
  const roundRef = useRef(round)
  const bestRef = useRef(0)
  const callbacks = useRef({ onBest, onResult, onStart, onPlayState, onRound, onLevelCleared, onNamed })
  callbacks.current = { onBest, onResult, onStart, onPlayState, onRound, onLevelCleared, onNamed }
  const [naming, setNaming] = useState<GameResult | null>(null)
  const [name, setName] = useState('')
  const [glitching, setGlitching] = useState(true)

  // the light glitch the game comes in with, and again at every new game
  useEffect(() => {
    if (!glitching) return
    const timer = window.setTimeout(() => setGlitching(false), 650)
    return () => window.clearTimeout(timer)
  }, [glitching])

  useEffect(() => {
    const canvas = canvasRef.current, frameBox = boxRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !frameBox || !ctx) return
    const s = session.current
    const clock = new FixedClock()
    const box = { width: frameBox.clientWidth, height: frameBox.clientHeight }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    bestRef.current = bestScore(game)
    callbacks.current.onBest?.(bestRef.current)
    s.layout = layoutFor(box.width, box.height)
    s.dirty = true

    const inRound = () => roundRef.current != null
    const draw = (): PixelBuffer => {
      if (s.mode === 'title') return renderTitle(game, s.layout, accent, { level: roundRef.current?.level ?? 1, best: bestRef.current, frame: s.frame, blink: s.blink, day: isDaytime() })
      // in a round, the end speaks through the page: no PLAY AGAIN? unless a retry is on offer
      const ask = !inRound() || s.mode === 'retry'
      const ended = { score: s.score, best: Math.max(bestRef.current, s.score), frame: s.frame, blink: s.mode !== 'name' && s.blink, choice: s.choice, ask }
      if (s.mode === 'winner' || (s.mode === 'name' && s.won)) return renderWinner(game, s.layout, accent, { ...ended, day: isDaytime() })
      if (s.mode === 'over' || s.mode === 'name' || s.mode === 'retry' || s.mode === 'lost') return renderGameOver(game, s.layout, accent, ended)
      if (s.catcher) return renderCatcherGame(s.catcher, accent, { pause: s.pause })
      return renderEaterGame(s.eater!, accent, { pause: s.pause })
    }
    let sized = ''
    const paint = () => {
      const b = draw()
      if (canvas.width !== b.width || canvas.height !== b.height) { canvas.width = b.width; canvas.height = b.height }
      ctx.putImageData(new ImageData(b.data as Uint8ClampedArray<ArrayBuffer>, b.width, b.height), 0, 0)
      const key = `${b.width}x${b.height}|${box.width}x${box.height}`
      if (key !== sized) {
        sized = key
        const size = fit(box.width, box.height, b.width, b.height, window.devicePixelRatio || 1)
        canvas.style.width = `${size.width}px`
        canvas.style.height = `${size.height}px`
      }
    }

    let reported: PlayState | null = null
    const report = () => {
      const state: PlayState = s.mode !== 'play' ? 'idle' : s.pause != null ? 'paused' : 'playing'
      if (state !== reported) { reported = state; callbacks.current.onPlayState?.(state) }
    }
    const tell = (event: RoundEvent) => { if (inRound()) callbacks.current.onRound?.(event) }
    const start = () => {
      const r = roundRef.current
      s.layout = layoutFor(box.width, box.height)
      s.seed = gameSeed()
      // a round starts at its level with the score so far, CATCHER with three lives, EATER for that one level
      s.catcher = game === 'catcher' ? createCatcher(s.layout, r?.level ?? 1, s.seed, r ? { score: r.score, lives: 3 } : undefined) : null
      s.eater = game === 'eater' ? createEater(s.layout, r?.level ?? 1, s.seed, r ? { single: true, score: r.score } : {}) : null
      s.mode = 'play'
      s.pause = null
      s.dirty = true
      clock.reset()
      setGlitching(true)
      callbacks.current.onStart?.()
      tell({ kind: 'play' })
    }
    const toTitle = () => {
      // a round never goes back to its title: leaving it is quitting
      if (inRound()) { quitRound(); return }
      s.mode = 'title'
      s.catcher = null
      s.eater = null
      s.pause = null
      s.layout = layoutFor(box.width, box.height)
      s.dirty = true
    }
    const end = (score: number, level: number, hold: number, won: boolean) => { s.mode = 'ending'; s.score = score; s.level = level; s.endSteps = hold; s.won = won }
    const finish = () => {
      s.choice = 0
      s.frame = 0
      s.layout = layoutFor(box.width, box.height)
      s.dirty = true
      const r = roundRef.current
      if (r) {
        if (s.won) { s.mode = 'winner'; tell({ kind: 'winner', score: s.score, level: s.level }) }
        else if (s.retriesLeft > 0) { s.mode = 'retry'; tell({ kind: 'retry', retriesLeft: s.retriesLeft }) }
        // lost for now: the score stands where the round found it
        else { s.mode = 'lost'; s.score = r.score; tell({ kind: 'lost', score: r.score, level: s.level }) }
        return
      }
      const needsName = qualifies(game, s.score)
      const result = { score: s.score, level: s.level, won: s.won, needsName }
      callbacks.current.onResult?.(result)
      if (needsName) { s.mode = 'name'; setName(lastName()); setNaming(result) }
      else s.mode = s.won ? 'winner' : 'over'
    }
    /** A level cleared in a round, short of the last: the board holds on LEVEL CLEAR and the page says what comes next. */
    const cleared = (score: number, level: number) => { s.mode = 'cleared'; s.score = score; s.level = level; s.dirty = true; tell({ kind: 'won', score, level }) }
    const quitRound = () => {
      const r = roundRef.current!
      s.mode = 'lost'; s.pause = null; s.score = r.score; s.dirty = true
      tell({ kind: 'quit', score: r.score, level: r.level })
    }
    const retry = () => { s.retriesLeft -= 1; start() }
    const giveUp = () => { const r = roundRef.current!; s.retriesLeft = 0; s.mode = 'lost'; s.score = r.score; s.dirty = true; tell({ kind: 'lost', score: r.score, level: s.level }) }
    const stepGame = () => {
      if (s.catcher) {
        const c = s.catcher
        stepCatcher(c)
        if (c.phase === 'won') end(c.score, c.level, 30, true)
        else if (c.phase === 'clear' && c.phaseTimer === 0) {
          if (inRound()) cleared(c.score, c.level)
          else { callbacks.current.onLevelCleared?.(c.level); s.catcher = nextLevel(c, (s.seed = s.seed + 1)) }
        } else if (c.phase === 'over') end(c.score, c.level, 20, false)
      } else if (s.eater) {
        const e = s.eater
        const passed = e.passed
        stepEater(e)
        if (e.passed > passed && e.phase === 'play') callbacks.current.onLevelCleared?.(e.level - 1)
        // a second to see the crash before GAME OVER, half a second to take in the last burger before WINNER
        if (e.phase === 'over') end(e.score, e.level, 60, false)
        else if (e.phase === 'won' && e.single && e.level < 16) cleared(e.score, e.level)
        else if (e.phase === 'won') end(e.score, e.level, 30, true)
      }
    }
    const steer = (dir: Direction) => {
      if (s.mode !== 'play' || s.pause != null) return
      if (s.catcher) s.catcher.burger.want = dir
      else if (s.eater) turnEater(s.eater, dir)
    }
    const pause = () => { if (s.mode === 'play' && s.pause == null) { s.pause = 0; s.dirty = true } }
    const resume = () => { if (s.pause != null) { s.pause = null; s.dirty = true } }
    const confirmPause = () => (s.pause === 0 ? resume() : toTitle())
    const confirmOver = () => (s.choice === 0 ? start() : toTitle())
    const confirmRetry = () => (s.choice === 0 ? retry() : giveUp())
    if (control) {
      control.togglePause = () => { if (s.pause != null) resume(); else pause() }
      control.start = () => { if (s.mode === 'title') start() }
      control.finishRound = (won: boolean) => {
        const r = roundRef.current
        if (!r || s.mode !== 'play') return
        const level = r.level
        if (!won) { end(s.catcher?.score ?? s.eater?.score ?? r.score, level, 1, false); return }
        const score = (s.catcher?.score ?? s.eater?.score ?? r.score) + 50 * level
        if (level >= 16) end(score, level, 1, true)
        else cleared(score, level)
      }
    }

    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(250, now - last)
      last = now
      if (s.mode === 'play' && s.pause == null) { if (clock.advance(dt, () => { if (s.mode === 'play') stepGame() }) > 0) s.dirty = true }
      else if (s.mode === 'ending') clock.advance(dt, () => { if (s.mode === 'ending' && --s.endSteps <= 0) finish() })
      else if (s.mode === 'title' || s.mode === 'over' || s.mode === 'winner' || s.mode === 'retry' || s.mode === 'lost') {
        s.slow += dt
        if (s.slow >= SLOW_MS) {
          s.slow = 0
          if (!reduced) { s.frame += 1; s.blink = !s.blink; s.dirty = true }
        }
      }
      if (s.dirty) { s.dirty = false; paint() }
      report()
    }
    raf = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // a button or link that has the focus keeps Enter and Space for itself; the arrows still steer
      const onControl = target != null && (target.tagName === 'BUTTON' || target.tagName === 'A')
      const dir = keyDirection(e.key)
      const confirm = !onControl && (e.key === 'Enter' || e.key === ' ')
      const pauseKey = e.key === 'Escape' || e.key === 'p' || e.key === 'P'
      let used = true
      if (s.mode === 'title') {
        if (confirm) start()
        else if (e.key === 'Escape' && inRound()) tell({ kind: 'declined' })
        else used = false
      } else if (s.mode === 'retry') {
        if (dir === 'left' || dir === 'right') { s.choice = s.choice === 0 ? 1 : 0; s.dirty = true }
        else if (confirm) confirmRetry()
        else if (e.key === 'Escape') giveUp()
        else used = false
      }
      else if (s.mode === 'play' && s.pause != null) {
        if (dir === 'up' || dir === 'down') { s.pause = s.pause === 0 ? 1 : 0; s.dirty = true }
        else if (confirm) confirmPause()
        else if (pauseKey) resume()
        else used = false
      } else if (s.mode === 'play') {
        if (dir) steer(dir)
        else if (pauseKey) pause()
        // the space bar does nothing in play, but must not scroll the page
        else used = e.key === ' ' && !onControl
      } else if ((s.mode === 'over' || s.mode === 'winner') && !inRound()) {
        if (dir === 'left' || dir === 'right') { s.choice = s.choice === 0 ? 1 : 0; s.dirty = true }
        else if (confirm) confirmOver()
        else if (pauseKey) toTitle()
        else used = false
      } else used = false
      if (used) e.preventDefault()
    }

    // the finger: the cross of arrows answers at once and follows a rolling thumb; a swipe steers; a tap chooses
    const toBuffer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height }
    }
    let touch: { id: number; x: number; y: number; moved: boolean } | null = null
    let thumb: { id: number; dir: Direction | null } | null = null
    const onCross = (e: PointerEvent): Direction | null => {
      const pad = dpadGeometry(s.layout)
      if (!pad || s.mode !== 'play' || s.pause != null) return null
      const p = toBuffer(e)
      return crossDirection(p.x, p.y, pad)
    }
    const inBand = (e: PointerEvent) => { const pad = dpadGeometry(s.layout); return pad != null && toBuffer(e).y >= pad.top }
    const onDown = (e: PointerEvent) => {
      if (e.button > 0) return
      if (s.mode === 'play' && s.pause == null && inBand(e)) {
        const dir = onCross(e)
        thumb = { id: e.pointerId, dir }
        if (dir) steer(dir)
        return
      }
      touch = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    }
    const onMove = (e: PointerEvent) => {
      if (thumb && thumb.id === e.pointerId) {
        const dir = onCross(e)
        if (dir && dir !== thumb.dir) steer(dir)
        thumb.dir = dir
        return
      }
      if (!touch || touch.id !== e.pointerId) return
      const dx = e.clientX - touch.x, dy = e.clientY - touch.y
      if (Math.hypot(dx, dy) > 10) touch.moved = true
      if (s.mode !== 'play' || s.pause != null) return
      const dir = swipeDirection(dx, dy, 24)
      // one swipe after another without lifting the finger
      if (dir) { steer(dir); touch.x = e.clientX; touch.y = e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (thumb && thumb.id === e.pointerId) { thumb = null; return }
      if (!touch || touch.id !== e.pointerId) return
      const tap = !touch.moved
      touch = null
      if (!tap) return
      const p = toBuffer(e)
      if (s.mode === 'title') start()
      else if (s.mode === 'retry') {
        const hits = gameOverHits(game, s.layout)
        if (within(hits.yes, p.x, p.y)) retry()
        else if (within(hits.no, p.x, p.y)) giveUp()
      } else if ((s.mode === 'over' || s.mode === 'winner') && !inRound()) {
        const hits = s.mode === 'winner' ? winnerHits(s.layout) : gameOverHits(game, s.layout)
        if (within(hits.yes, p.x, p.y)) start()
        else if (within(hits.no, p.x, p.y)) toTitle()
      } else if (s.mode === 'play' && s.pause != null) {
        const hits = pauseHits(s.layout)
        if (within(hits.resume, p.x, p.y)) resume()
        else if (within(hits.quit, p.x, p.y)) toTitle()
      }
    }
    const onCancel = () => { touch = null; thumb = null }
    const onHidden = () => { if (document.hidden) pause() }
    const watch = new ResizeObserver(() => {
      box.width = frameBox.clientWidth
      box.height = frameBox.clientHeight
      if (s.mode === 'title' || s.mode === 'over' || s.mode === 'name') s.layout = layoutFor(box.width, box.height)
      s.dirty = true
    })
    watch.observe(frameBox)
    tell({ kind: 'title' })
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onHidden)
    frameBox.addEventListener('pointerdown', onDown)
    frameBox.addEventListener('pointermove', onMove)
    frameBox.addEventListener('pointerup', onUp)
    frameBox.addEventListener('pointercancel', onCancel)
    return () => {
      if (control) { control.togglePause = undefined; control.start = undefined; control.finishRound = undefined }
      cancelAnimationFrame(raf)
      watch.disconnect()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onHidden)
      frameBox.removeEventListener('pointerdown', onDown)
      frameBox.removeEventListener('pointermove', onMove)
      frameBox.removeEventListener('pointerup', onUp)
      frameBox.removeEventListener('pointercancel', onCancel)
    }
  }, [game, accent, control])

  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!naming) return
    addScore(game, { name, score: naming.score, level: naming.level })
    bestRef.current = bestScore(game)
    callbacks.current.onBest?.(bestRef.current)
    callbacks.current.onNamed?.(name)
    setNaming(null)
    const s = session.current
    s.mode = s.won ? 'winner' : 'over'
    s.dirty = true
  }

  return (
    <div ref={boxRef} className={`game-player${glitching ? ' game-player--glitch' : ''}`}>
      <canvas ref={canvasRef} className="game-player__canvas" aria-label={game === 'catcher' ? 'RANDOM CATCHER' : 'RANDOM EATER'} />
      {naming ? (
        <form className="game-player__name" onSubmit={submitName} style={{ borderColor: accent }}>
          <p className="game-player__name-title" style={{ color: accent }}>NEW HIGH SCORE</p>
          <p className="game-player__name-score">{String(naming.score).padStart(5, '0')}</p>
          <label htmlFor="game-player-name" className="sr-only">Name</label>
          <input
            id="game-player-name"
            value={name}
            onChange={(event) => setName(event.target.value.toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').slice(0, NAME_MAX))}
            maxLength={NAME_MAX}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="YOUR NAME"
            className="game-player__name-input"
            style={{ borderColor: accent }}
          />
          <button type="submit" className="game-player__name-ok" style={{ background: accent }}>OK</button>
        </form>
      ) : null}
      <style jsx>{`
        .game-player { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .game-player__canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; background: #0a0a14; }
        .game-player--glitch .game-player__canvas { animation: game-player-glitch 0.62s steps(1, end) both; }
        @keyframes game-player-glitch {
          0% { transform: translateX(-7px); clip-path: inset(10% 0 62% 0); filter: hue-rotate(50deg) saturate(1.7); }
          12% { transform: translateX(6px); clip-path: inset(55% 0 20% 0); filter: none; }
          24% { transform: translateX(-3px) skewX(-3deg); clip-path: inset(0 0 0 0); filter: contrast(1.35) brightness(1.25); }
          36% { transform: translateX(3px); clip-path: inset(30% 0 40% 0); filter: hue-rotate(-40deg); }
          48% { transform: none; clip-path: inset(0 0 0 0); filter: brightness(1.15); }
          60%, 100% { transform: none; clip-path: inset(0 0 0 0); filter: none; }
        }
        @media (prefers-reduced-motion: reduce) { .game-player--glitch .game-player__canvas { animation: none; } }
        .game-player__name { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(300px, calc(100% - 32px)); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 16px; background: rgba(10, 10, 20, 0.94); border: 2px solid; font-family: var(--font-tomorrow), sans-serif; text-transform: uppercase; touch-action: auto; user-select: text; -webkit-user-select: text; }
        .game-player__name-title { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.08em; text-align: center; }
        .game-player__name-score { margin: 0; font-size: 28px; font-weight: 700; color: #f8f5e6; letter-spacing: 0.12em; }
        .game-player__name-input { width: 100%; height: 46px; background: transparent; border: 2px solid; color: #f8f5e6; font: inherit; font-size: 20px; letter-spacing: 0.14em; text-align: center; outline: none; }
        .game-player__name-input::placeholder { color: rgba(248, 245, 230, 0.4); }
        .game-player__name-ok { width: 100%; height: 44px; border: 0; color: #f8f5e6; font: inherit; font-size: 18px; font-weight: 700; letter-spacing: 0.1em; cursor: pointer; }
      `}</style>
    </div>
  )
}
