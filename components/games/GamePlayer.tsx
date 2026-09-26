'use client'

/**
 * One of the two games, played: a canvas that fills its frame with square
 * pixels, the title on its street, the game at sixty steps a second
 * whatever the screen, GAME OVER, and a name for the ten best of this
 * device. Arrows, WASD or ZQSD steer, a swipe too, or the cross of arrows
 * on a tall screen; P or Escape pause; the game pauses by itself when the
 * page is left. Wide or tall is chosen at the start of a game, from the
 * frame's shape, and kept until it ends.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'

import { createCatcher, nextLevel, stepCatcher, type CatcherState } from '@/lib/games/catcher'
import { createEater, stepEater, turnEater, type EaterState } from '@/lib/games/eater'
import { dpadDirection, FixedClock, isDaytime, keyDirection, swipeDirection } from '@/lib/games/engine'
import type { PixelBuffer } from '@/lib/games/pixels'
import { addScore, bestScore, lastName, NAME_MAX, qualifies, type GameName } from '@/lib/games/scores'
import { dpadGeometry, gameOverHits, pauseHits, playSize, renderCatcherGame, renderEaterGame, renderGameOver, renderTitle, type Hit, type Layout } from '@/lib/games/screens'
import type { Direction } from '@/lib/games/sprites'

export type GameResult = { score: number; level: number }

type Mode = 'title' | 'play' | 'ending' | 'name' | 'over'

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
  dirty: boolean
}

/** The title and GAME OVER move at the pace of the approved mock page: a picture every 450 ms. */
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
}: {
  game: GameName
  accent: string
  onBest?: (best: number) => void
  onResult?: (result: GameResult) => void
  onStart?: () => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const session = useRef<Session>({ mode: 'title', layout: 'landscape', catcher: null, eater: null, pause: null, choice: 0, frame: 0, blink: true, slow: 0, endSteps: 0, seed: 1, score: 0, level: 1, dirty: true })
  const bestRef = useRef(0)
  const callbacks = useRef({ onBest, onResult, onStart })
  callbacks.current = { onBest, onResult, onStart }
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

    const draw = (): PixelBuffer => {
      if (s.mode === 'title') return renderTitle(game, s.layout, accent, { level: 1, best: bestRef.current, frame: s.frame, blink: s.blink, day: isDaytime() })
      if (s.mode === 'over' || s.mode === 'name') return renderGameOver(game, s.layout, accent, { score: s.score, best: Math.max(bestRef.current, s.score), frame: s.frame, blink: s.mode === 'over' && s.blink, choice: s.choice })
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

    const start = () => {
      s.layout = layoutFor(box.width, box.height)
      s.seed = Math.floor(Math.random() * 0x7ffffffe) + 1
      s.catcher = game === 'catcher' ? createCatcher(s.layout, 1, s.seed) : null
      s.eater = game === 'eater' ? createEater(s.layout, 1, s.seed) : null
      s.mode = 'play'
      s.pause = null
      s.dirty = true
      clock.reset()
      setGlitching(true)
      callbacks.current.onStart?.()
    }
    const toTitle = () => {
      s.mode = 'title'
      s.catcher = null
      s.eater = null
      s.pause = null
      s.layout = layoutFor(box.width, box.height)
      s.dirty = true
    }
    const end = (score: number, level: number, hold: number) => { s.mode = 'ending'; s.score = score; s.level = level; s.endSteps = hold }
    const finish = () => {
      const result = { score: s.score, level: s.level }
      callbacks.current.onResult?.(result)
      s.choice = 0
      s.frame = 0
      s.layout = layoutFor(box.width, box.height)
      if (qualifies(game, s.score)) { s.mode = 'name'; setName(lastName()); setNaming(result) }
      else s.mode = 'over'
      s.dirty = true
    }
    const stepGame = () => {
      if (s.catcher) {
        const c = s.catcher
        stepCatcher(c)
        if (c.phase === 'clear' && c.phaseTimer === 0) s.catcher = nextLevel(c, (s.seed = s.seed + 1))
        else if (c.phase === 'over') end(c.score, c.level, 20)
      } else if (s.eater) {
        stepEater(s.eater)
        // a second to see the crash before GAME OVER
        if (s.eater.phase === 'over') end(s.eater.score, s.eater.level, 60)
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

    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(250, now - last)
      last = now
      if (s.mode === 'play' && s.pause == null) { if (clock.advance(dt, () => { if (s.mode === 'play') stepGame() }) > 0) s.dirty = true }
      else if (s.mode === 'ending') clock.advance(dt, () => { if (s.mode === 'ending' && --s.endSteps <= 0) finish() })
      else if (s.mode === 'title' || s.mode === 'over') {
        s.slow += dt
        if (s.slow >= SLOW_MS) {
          s.slow = 0
          if (!reduced) { s.frame += 1; s.blink = !s.blink; s.dirty = true }
        }
      }
      if (s.dirty) { s.dirty = false; paint() }
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
      if (s.mode === 'title') { if (confirm) start(); else used = false }
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
      } else if (s.mode === 'over') {
        if (dir === 'left' || dir === 'right') { s.choice = s.choice === 0 ? 1 : 0; s.dirty = true }
        else if (confirm) confirmOver()
        else if (pauseKey) toTitle()
        else used = false
      } else used = false
      if (used) e.preventDefault()
    }

    // the finger: the pause button and the cross of arrows answer at once; a swipe steers; a tap chooses
    const toBuffer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height }
    }
    let touch: { id: number; x: number; y: number; moved: boolean } | null = null
    const onDown = (e: PointerEvent) => {
      if (e.button > 0) return
      const p = toBuffer(e)
      if (s.mode === 'play' && s.pause == null) {
        if (within(pauseHits(s.layout).pause, p.x, p.y)) { pause(); return }
        const pad = dpadGeometry(s.layout)
        const dir = pad ? dpadDirection(p.x, p.y, pad.cx, pad.cy, pad.arm) : null
        if (dir) { steer(dir); return }
      }
      touch = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    }
    const onMove = (e: PointerEvent) => {
      if (!touch || touch.id !== e.pointerId) return
      const dx = e.clientX - touch.x, dy = e.clientY - touch.y
      if (Math.hypot(dx, dy) > 10) touch.moved = true
      if (s.mode !== 'play' || s.pause != null) return
      const dir = swipeDirection(dx, dy, 24)
      // one swipe after another without lifting the finger
      if (dir) { steer(dir); touch.x = e.clientX; touch.y = e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (!touch || touch.id !== e.pointerId) return
      const tap = !touch.moved
      touch = null
      if (!tap) return
      const p = toBuffer(e)
      if (s.mode === 'title') start()
      else if (s.mode === 'over') {
        const hits = gameOverHits(s.layout)
        if (within(hits.yes, p.x, p.y)) start()
        else if (within(hits.no, p.x, p.y)) toTitle()
      } else if (s.mode === 'play' && s.pause != null) {
        const hits = pauseHits(s.layout)
        if (within(hits.resume, p.x, p.y)) resume()
        else if (within(hits.quit, p.x, p.y)) toTitle()
      }
    }
    const onCancel = () => { touch = null }
    const onHidden = () => { if (document.hidden) pause() }
    const watch = new ResizeObserver(() => {
      box.width = frameBox.clientWidth
      box.height = frameBox.clientHeight
      if (s.mode === 'title' || s.mode === 'over' || s.mode === 'name') s.layout = layoutFor(box.width, box.height)
      s.dirty = true
    })
    watch.observe(frameBox)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onHidden)
    frameBox.addEventListener('pointerdown', onDown)
    frameBox.addEventListener('pointermove', onMove)
    frameBox.addEventListener('pointerup', onUp)
    frameBox.addEventListener('pointercancel', onCancel)
    return () => {
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
  }, [game, accent])

  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!naming) return
    addScore(game, { name, score: naming.score, level: naming.level })
    bestRef.current = bestScore(game)
    callbacks.current.onBest?.(bestRef.current)
    setNaming(null)
    const s = session.current
    s.mode = 'over'
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
