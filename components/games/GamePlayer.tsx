'use client'

/**
 * One of the games, played: a canvas that fills its frame with square
 * pixels, the title on its street, the game at sixty steps a second
 * whatever the screen, GAME OVER, and a name for the ten best of this
 * device; WINNER when the sixteenth level is cleared. Arrows, WASD or
 * ZQSD steer, a swipe too, or on a tall screen the cross of arrows — the
 * whole band under the board answers, and a thumb can roll from one arm to
 * the next without lifting. In ATTACKS the cook walks while left or right
 * is held — a key or an arrow under the board — and squirts when fire is:
 * the space bar or up, the FIRE button, or a finger on the sky. In RACING the
 * car is chosen on the title (left and right, or a tap on it); in the race
 * left and right steer while held, up or the space bar is the gas (A), down
 * the brake (B). P or Escape pause, and so does the page's own
 * pause button through `control`; the game pauses by itself when the page
 * is left. Wide or tall is chosen at the start of a game, from the frame's
 * shape, and kept until it ends. Each game has its tune, on the title and
 * low under the play, and its sounds (`lib/games/sound.ts`), which Random's
 * sound switch silences with the rest.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'

import { attacksOverHits, attacksPadGeometry, attacksPadPart, renderAttacksGame, renderAttacksOver, renderAttacksTitle, renderAttacksWinner } from '@/lib/games/attacks'
import { ATTACKS_BOARD, ATTACKS_LAST_LEVEL, createAttacks, stepAttacks, type AttacksState } from '@/lib/games/attacks-rules'
import { createCatcher, nextLevel, stepCatcher, type CatcherState } from '@/lib/games/catcher'
import { createEater, stepEater, turnEater, type EaterState } from '@/lib/games/eater'
import { nextCar, racingCarAt, racingOverHits, racingPadGeometry, racingPadPart, racingWinnerHits, renderRacingGame, renderRacingOver, renderRacingTitle, renderRacingWinner } from '@/lib/games/racing'
import { createRacing, RACING_CARS, RACING_LAST_LEVEL, stepRacing, type RacingCarKind, type RacingState, type RacingWorld } from '@/lib/games/racing-rules'
import { crossDirection, FixedClock, isDaytime, keyDirection, swipeDirection } from '@/lib/games/engine'
import type { PixelBuffer } from '@/lib/games/pixels'
import { addScore, bestScore, lastName, NAME_MAX, qualifies, type GameName } from '@/lib/games/scores'
import { dpadGeometry, gameOverHits, pauseHits, playSize, renderCatcherGame, renderEaterGame, renderGameOver, renderTitle, renderWinner, winnerHits, type Hit, type Layout, type Pad } from '@/lib/games/screens'
import { gameSounds } from '@/lib/games/sound'
import type { Direction } from '@/lib/games/sprites'
import { HUD_HEIGHT } from '@/lib/games/ui'
import { wakeSound } from '@/utils/sound'

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
 * Filled in by the player, so the page's own buttons can reach it: pause and
 * resume, and in a round, start — and, for the effects test page's bench
 * only, end the round won or lost at once.
 */
export type GameControl = { togglePause?: () => void; pause?: () => void; resume?: () => void; start?: () => void; retry?: () => void; finishRound?: (won: boolean) => void; touch?: () => void }

type Mode = 'title' | 'play' | 'ending' | 'name' | 'over' | 'winner' | 'cleared' | 'retry' | 'lost'

type Session = {
  mode: Mode
  layout: Layout
  catcher: CatcherState | null
  eater: EaterState | null
  attacks: AttacksState | null
  racing: RacingState | null
  /** RACING's car, chosen on the title. */
  car: RacingCarKind
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
  /** Where the cross of arrows goes, for the game under way. */
  pad: Pad
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

/** RACING's car, remembered on this device from one game to the next. */
const CAR_KEY = 'random_racing_car_v1'
function savedCar(): RacingCarKind {
  try { const v = window.localStorage.getItem(CAR_KEY); return RACING_CARS.includes(v as RacingCarKind) ? (v as RacingCarKind) : 'burger' } catch { return 'burger' }
}
function saveCar(car: RacingCarKind): void {
  try { window.localStorage.setItem(CAR_KEY, car) } catch { /* private window: the choice lasts the page */ }
}

/** The title, GAME OVER and WINNER move at the pace of the approved mock page: a picture every 450 ms. */
const SLOW_MS = 450
const within = (h: Hit, x: number, y: number) => x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h
const TITLES: Record<GameName, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER', attacks: 'RANDOM ATTACKS', racing: 'RANDOM RACING' }

/**
 * Where the cross goes for each shape of board: a desktop's wide board has
 * none; on a touch screen, a band under the board; a tablet held sideways
 * puts it beside its wide board, under the right thumb; on a phone playing
 * full screen, a taller band with a bigger cross.
 */
function padsFor(touch: boolean, big: boolean): Record<Layout, Pad> {
  if (big) return { portrait: 'big', landscape: 'side' }
  return { portrait: 'band', landscape: tabletSideways(touch) ? 'side' : touch ? 'band' : 'none' }
}
/** A touch screen whose short side is 600 pixels or more, held wider than tall. */
function tabletSideways(touch: boolean): boolean {
  if (!touch || typeof window === 'undefined') return false
  return Math.min(window.innerWidth, window.innerHeight) >= 600 && window.innerWidth > window.innerHeight
}
/** Wide or tall: whichever lets the board be drawn the larger in this frame, its cross counted. */
function layoutFor(width: number, height: number, touch = false, big = false): Layout {
  if (!width || !height) return 'landscape'
  const pads = padsFor(touch, big)
  const wide = playSize('landscape', pads.landscape), tall = playSize('portrait', pads.portrait)
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
  big = false,
  startLevel = 1,
  startWorld,
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
  /** A phone playing full screen: a taller band with a bigger cross, or a band beside the board on its side. Read when a game starts. */
  big?: boolean
  /** The level a whole game starts at: 1, or another on a test page. */
  startLevel?: number
  /** RACING's one world for every level, on its test page; drawn at random otherwise. */
  startWorld?: RacingWorld
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const session = useRef<Session>({ mode: 'title', layout: 'landscape', catcher: null, eater: null, attacks: null, racing: null, car: 'burger', pause: null, choice: 0, frame: 0, blink: true, slow: 0, endSteps: 0, seed: 1, score: 0, level: 1, won: false, retriesLeft: round?.retries ?? 0, pad: 'none', dirty: true })
  const roundRef = useRef(round)
  // a round changes only between two: NEW GAME puts the next one back at level 1 before it starts
  roundRef.current = round
  const bigRef = useRef(big)
  bigRef.current = big
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
    // a phone or a tablet: the cross of arrows is always there, the board wide or tall
    const touchScreen = (window.matchMedia?.('(pointer: coarse)').matches ?? false) || 'ontouchstart' in window
    const sounds = gameSounds(game)
    /** A touch, a click or a key: the moment a phone lets sound start. */
    const touched = () => { wakeSound(); sounds.touch() }
    bestRef.current = bestScore(game)
    callbacks.current.onBest?.(bestRef.current)
    if (game === 'racing') s.car = savedCar()
    s.layout = layoutFor(box.width, box.height, touchScreen)
    s.dirty = true

    const inRound = () => roundRef.current != null
    const draw = (): PixelBuffer => {
      // in a round a real PLAY button takes PRESS START's place
      const title = { level: roundRef.current?.level ?? startLevel, best: bestRef.current, frame: s.frame, blink: s.blink, press: !inRound() }
      if (s.mode === 'title') return game === 'attacks' ? renderAttacksTitle(s.layout, accent, 'zen', title) : game === 'racing' ? renderRacingTitle(s.layout, accent, 'sans', { ...title, car: s.car }) : renderTitle(game, s.layout, accent, { ...title, day: isDaytime() })
      // in a round, the end speaks through the page: no PLAY AGAIN? unless a retry is on offer
      const ask = !inRound() || s.mode === 'retry'
      const ended = { score: s.score, best: Math.max(bestRef.current, s.score), frame: s.frame, blink: s.mode !== 'name' && s.blink, choice: s.choice, ask }
      if (s.mode === 'winner' || (s.mode === 'name' && s.won)) return game === 'attacks' ? renderAttacksWinner(s.layout, accent, ended) : game === 'racing' ? renderRacingWinner(s.layout, accent, { ...ended, car: s.car }) : renderWinner(game, s.layout, accent, { ...ended, day: isDaytime() })
      if (s.mode === 'over' || s.mode === 'name' || s.mode === 'retry' || s.mode === 'lost') return game === 'attacks' ? renderAttacksOver(s.layout, accent, ended) : game === 'racing' ? renderRacingOver(s.layout, accent, ended) : renderGameOver(game, s.layout, accent, { ...ended, day: isDaytime() })
      // in a round the pause card only offers RESUME: leaving is the page's business
      if (s.attacks) return renderAttacksGame(s.attacks, accent, { pause: s.pause, pad: s.pad, resumeOnly: inRound(), pressed: pressed() })
      if (s.racing) return renderRacingGame(s.racing, accent, { pause: s.pause, pad: s.pad, resumeOnly: inRound(), pressed: pressed() })
      if (s.catcher) return renderCatcherGame(s.catcher, accent, { pause: s.pause, pad: s.pad, resumeOnly: inRound() })
      return renderEaterGame(s.eater!, accent, { pause: s.pause, pad: s.pad, resumeOnly: inRound() })
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
      // the frame as it stands this very moment: it may just have gone full screen
      box.width = frameBox.clientWidth
      box.height = frameBox.clientHeight
      s.layout = layoutFor(box.width, box.height, touchScreen, bigRef.current)
      s.seed = gameSeed()
      s.pad = padsFor(touchScreen, bigRef.current)[s.layout]
      // a round starts at its level with the score so far, CATCHER with three lives, EATER and RACING for that one level, ATTACKS both
      s.catcher = game === 'catcher' ? createCatcher(s.layout, r?.level ?? 1, s.seed, r ? { score: r.score, lives: 3 } : undefined) : null
      s.eater = game === 'eater' ? createEater(s.layout, r?.level ?? 1, s.seed, r ? { single: true, score: r.score } : {}) : null
      s.attacks = game === 'attacks' ? createAttacks(s.layout, r?.level ?? startLevel, s.seed, r ? { single: true, score: r.score, lives: 3 } : {}) : null
      s.racing = game === 'racing' ? createRacing(s.layout, r?.level ?? startLevel, s.seed, r ? { single: true, score: r.score, car: s.car } : { car: s.car, world: startWorld }) : null
      release()
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
      s.attacks = null
      s.racing = null
      s.pause = null
      s.layout = layoutFor(box.width, box.height, touchScreen)
      s.dirty = true
    }
    const end = (score: number, level: number, hold: number, won: boolean) => { s.mode = 'ending'; s.score = score; s.level = level; s.endSteps = hold; s.won = won }
    const finish = () => {
      sounds.play(s.won ? 'winner' : 'over')
      s.choice = 0
      s.frame = 0
      s.layout = layoutFor(box.width, box.height, touchScreen)
      s.dirty = true
      const r = roundRef.current
      if (r) {
        if (s.won) { s.mode = 'winner'; tell({ kind: 'winner', score: s.score, level: s.level }) }
        else if (s.retriesLeft > 0) { s.mode = 'retry'; tell({ kind: 'retry', retriesLeft: s.retriesLeft }) }
        // GAME OVER: the game ends with the score shown, the last try's points counted
        else { s.mode = 'lost'; tell({ kind: 'lost', score: s.score, level: s.level }) }
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
    // NO to PLAY AGAIN?: GAME OVER with the score shown
    const giveUp = () => { s.retriesLeft = 0; s.mode = 'lost'; s.dirty = true; tell({ kind: 'lost', score: s.score, level: s.level }) }
    const stepGame = () => {
      if (s.catcher) {
        const c = s.catcher
        stepCatcher(c)
        for (const heard of c.heard) sounds.play(heard)
        if (c.phase === 'won') end(c.score, c.level, 30, true)
        else if (c.phase === 'clear' && c.phaseTimer === 0) {
          if (inRound()) cleared(c.score, c.level)
          else { callbacks.current.onLevelCleared?.(c.level); s.catcher = nextLevel(c, (s.seed = s.seed + 1)) }
        } else if (c.phase === 'over') end(c.score, c.level, 20, false)
      } else if (s.eater) {
        const e = s.eater
        const passed = e.passed
        stepEater(e)
        for (const heard of e.heard) sounds.play(heard)
        if (e.passed > passed && e.phase === 'play') callbacks.current.onLevelCleared?.(e.level - 1)
        // a second to see the crash before GAME OVER, half a second to take in the last burger before WINNER
        if (e.phase === 'over') end(e.score, e.level, 60, false)
        else if (e.phase === 'won' && e.single && e.level < 16) cleared(e.score, e.level)
        else if (e.phase === 'won') end(e.score, e.level, 30, true)
      } else if (s.attacks) {
        const a = s.attacks
        const passed = a.passed
        stepAttacks(a, walk(), firing())
        if (held.latch > 0) held.latch -= 1
        for (const heard of a.heard) sounds.play(heard)
        if (a.passed > passed && a.phase === 'play') callbacks.current.onLevelCleared?.(a.level - 1)
        if (a.phase === 'over') end(a.score, a.level, 60, false)
        else if (a.phase === 'won' && a.single && a.level < ATTACKS_LAST_LEVEL) cleared(a.score, a.level)
        else if (a.phase === 'won') end(a.score, a.level, 30, true)
      } else if (s.racing) {
        const g = s.racing
        const passed = g.passed
        stepRacing(g, walk(), gassing(), braking())
        for (const heard of g.heard) sounds.play(heard)
        if (g.passed > passed) callbacks.current.onLevelCleared?.(g.level - 1)
        // TIME UP has had its two seconds; half a second on the line before WINNER
        if (g.phase === 'over') end(g.score, g.level, 20, false)
        else if (g.phase === 'won' && g.single && g.level < RACING_LAST_LEVEL) cleared(g.score, g.level)
        else if (g.phase === 'won') end(g.score, g.level, 30, true)
      }
    }
    const steer = (dir: Direction) => {
      if (s.mode !== 'play' || s.pause != null) return
      if (s.catcher) s.catcher.burger.want = dir
      else if (s.eater) turnEater(s.eater, dir)
    }
    // ATTACKS: the cook walks while a way is held — the last arrow key pressed and still down, else the arrow under a finger — and squirts while
    // fire is held: a fire key, the FIRE button, a finger on the sky; a quick press counts for a tenth of a second, so no tap is lost between two steps
    // RACING: the same for steering; the gas held as fire is (a key, the A button), the brake as its own (down, the B button)
    type Finger = 'left' | 'right' | 'fire' | 'sky' | 'gas' | 'brake'
    const held: { keys: Array<-1 | 1>; fire: Set<string>; brake: Set<string>; latch: number; fingers: Map<number, Finger> } = { keys: [], fire: new Set(), brake: new Set(), latch: 0, fingers: new Map() }
    const release = () => { held.keys = []; held.fire.clear(); held.brake.clear(); held.latch = 0; held.fingers.clear() }
    const fingers = () => [...held.fingers.values()]
    const walk = (): -1 | 0 | 1 => {
      if (held.keys.length) return held.keys[held.keys.length - 1]
      const way = fingers().filter((f) => f === 'left' || f === 'right').pop()
      return way === 'left' ? -1 : way === 'right' ? 1 : 0
    }
    const firing = () => held.fire.size > 0 || held.latch > 0 || fingers().some((f) => f === 'fire' || f === 'sky')
    const gassing = () => held.fire.size > 0 || fingers().includes('gas')
    const braking = () => held.brake.size > 0 || fingers().includes('brake')
    const pressed = () => { const f = fingers(); return { left: f.includes('left'), right: f.includes('right'), fire: f.includes('fire'), gas: f.includes('gas'), brake: f.includes('brake') } }
    /** Where a finger falls in play: an arrow, FIRE, the sky over the board (ATTACKS), A or B (RACING), or none of them. */
    const partAt = (e: PointerEvent): Finger | null => {
      const p = toBuffer(e)
      if (game === 'racing') { const pad = racingPadGeometry(s.layout, s.pad); return pad ? racingPadPart(p.x, p.y, pad) : null }
      const pad = attacksPadGeometry(s.layout, s.pad)
      const part = pad ? attacksPadPart(p.x, p.y, pad) : null
      if (part) return part
      const board = ATTACKS_BOARD[s.layout]
      return p.x >= 0 && p.x < board.width && p.y >= HUD_HEIGHT && p.y < HUD_HEIGHT + board.height ? 'sky' : null
    }
    const way = (dir: Direction | null): -1 | 0 | 1 => (dir === 'left' ? -1 : dir === 'right' ? 1 : 0)
    const pause = () => { release(); if (s.mode === 'play' && s.pause == null) { s.pause = 0; s.dirty = true } }
    const resume = () => { if (s.pause != null) { s.pause = null; s.dirty = true } }
    const confirmPause = () => (s.pause === 0 ? resume() : toTitle())
    const confirmOver = () => (s.choice === 0 ? start() : toTitle())
    const confirmRetry = () => (s.choice === 0 ? retry() : giveUp())
    if (control) {
      control.togglePause = () => { if (s.pause != null) resume(); else pause() }
      control.pause = pause
      control.resume = () => { resume(); clock.reset() }
      control.start = () => { if (s.mode === 'title') start() }
      control.retry = () => { if (s.mode === 'retry') retry() }
      control.finishRound = (won: boolean) => {
        const r = roundRef.current
        if (!r || s.mode !== 'play') return
        const level = r.level
        const now = s.catcher?.score ?? s.eater?.score ?? s.attacks?.score ?? s.racing?.score ?? r.score
        if (!won) { end(now, level, 1, false); return }
        const score = now + 50 * level
        if (level >= 16) end(score, level, 1, true)
        else { sounds.play('level'); cleared(score, level) }
      }
      control.touch = touched
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
      // the tune on the title and under the play; paused, over, or between screens, quiet
      sounds.tune(s.mode === 'title' || (s.mode === 'play' && s.pause == null))
    }
    raf = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      touched()
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
        else if (game === 'racing' && (dir === 'left' || dir === 'right')) { s.car = nextCar(s.car, dir === 'left' ? -1 : 1); saveCar(s.car); s.dirty = true }
        else if (e.key === 'Escape' && inRound()) tell({ kind: 'declined' })
        else used = false
      } else if (s.mode === 'retry') {
        if (dir === 'left' || dir === 'right') { s.choice = s.choice === 0 ? 1 : 0; s.dirty = true }
        else if (confirm) confirmRetry()
        else if (e.key === 'Escape') giveUp()
        else used = false
      }
      else if (s.mode === 'play' && s.pause != null) {
        if ((dir === 'up' || dir === 'down') && !inRound()) { s.pause = s.pause === 0 ? 1 : 0; s.dirty = true }
        else if (confirm) confirmPause()
        else if (pauseKey) resume()
        else used = false
      } else if (s.mode === 'play') {
        if ((game === 'attacks' || game === 'racing') && way(dir)) { const w = way(dir) as -1 | 1; if (!e.repeat) held.keys = [...held.keys.filter((k) => k !== w), w] }
        // the space bar or up: fire, or the gas, even with a button in focus (it must not press it)
        else if (game === 'attacks' && (e.key === ' ' || dir === 'up')) { if (!e.repeat) { held.fire.add(e.key); held.latch = 6 } }
        else if (game === 'racing' && (e.key === ' ' || dir === 'up')) held.fire.add(e.key)
        else if (game === 'racing' && dir === 'down') held.brake.add(e.key)
        else if (dir) steer(dir)
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
    const onKeyUp = (e: KeyboardEvent) => {
      const w = way(keyDirection(e.key))
      if (w) held.keys = held.keys.filter((k) => k !== w)
      held.brake.delete(e.key)
      if (held.fire.delete(e.key) && e.key === ' ' && s.mode === 'play') e.preventDefault()
    }

    // the finger: the cross of arrows answers at once and follows a rolling thumb; a swipe steers; a tap chooses
    const toBuffer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height }
    }
    let touch: { id: number; x: number; y: number; moved: boolean } | null = null
    let thumb: { id: number; dir: Direction | null } | null = null
    const onCross = (e: PointerEvent): Direction | null => {
      const pad = dpadGeometry(s.layout, s.pad)
      if (!pad || s.mode !== 'play' || s.pause != null) return null
      const p = toBuffer(e)
      return crossDirection(p.x, p.y, pad)
    }
    const inBand = (e: PointerEvent) => { const pad = dpadGeometry(s.layout, s.pad); if (!pad) return false; const p = toBuffer(e); return p.x >= pad.zone.x && p.y >= pad.zone.y }
    const onDown = (e: PointerEvent) => {
      if (e.button > 0) return
      touched()
      if ((game === 'attacks' || game === 'racing') && s.mode === 'play' && s.pause == null) {
        const part = partAt(e)
        if (part) { held.fingers.set(e.pointerId, part); if (part === 'fire' || part === 'sky') held.latch = 6; s.dirty = true; return }
      }
      if (s.mode === 'play' && s.pause == null && inBand(e)) {
        const dir = onCross(e)
        thumb = { id: e.pointerId, dir }
        if (dir) steer(dir)
        return
      }
      touch = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    }
    const onMove = (e: PointerEvent) => {
      const finger = held.fingers.get(e.pointerId)
      if (finger) {
        // a thumb rolls from one arrow to the other, or onto FIRE; a finger on the sky keeps firing wherever it goes
        if (finger !== 'sky') { const part = partAt(e); if (part && part !== 'sky' && part !== finger) { held.fingers.set(e.pointerId, part); s.dirty = true } }
        return
      }
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
      if (held.fingers.delete(e.pointerId)) { s.dirty = true; return }
      if (thumb && thumb.id === e.pointerId) { thumb = null; return }
      if (!touch || touch.id !== e.pointerId) return
      const tap = !touch.moved
      touch = null
      if (!tap) return
      const p = toBuffer(e)
      if (s.mode === 'title') {
        // RACING: a tap on another car chooses it; on the one chosen, or anywhere else, it starts
        const car = game === 'racing' ? racingCarAt(s.layout, p.x, p.y) : null
        if (car && (car !== s.car || inRound())) { s.car = car; saveCar(car); s.dirty = true }
        else if (!inRound()) start()
      } else if (s.mode === 'retry') {
        const hits = game === 'attacks' ? attacksOverHits(s.layout) : game === 'racing' ? racingOverHits(s.layout) : gameOverHits(game, s.layout)
        if (within(hits.yes, p.x, p.y)) retry()
        else if (within(hits.no, p.x, p.y)) giveUp()
      } else if ((s.mode === 'over' || s.mode === 'winner') && !inRound()) {
        const hits = s.mode === 'winner' ? (game === 'racing' ? racingWinnerHits(s.layout) : winnerHits(s.layout)) : game === 'attacks' ? attacksOverHits(s.layout) : game === 'racing' ? racingOverHits(s.layout) : gameOverHits(game, s.layout)
        if (within(hits.yes, p.x, p.y)) start()
        else if (within(hits.no, p.x, p.y)) toTitle()
      } else if (s.mode === 'play' && s.pause != null) {
        const hits = pauseHits(s.layout)
        if (within(hits.resume, p.x, p.y)) resume()
        else if (within(hits.quit, p.x, p.y) && !inRound()) toTitle()
      }
    }
    const onCancel = (e: PointerEvent) => { touch = null; thumb = null; held.fingers.delete(e.pointerId) }
    const onHidden = () => { if (document.hidden) pause() }
    const watch = new ResizeObserver(() => {
      box.width = frameBox.clientWidth
      box.height = frameBox.clientHeight
      if (s.mode === 'title' || s.mode === 'over' || s.mode === 'name') s.layout = layoutFor(box.width, box.height, touchScreen)
      s.dirty = true
    })
    watch.observe(frameBox)
    tell({ kind: 'title' })
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', onHidden)
    frameBox.addEventListener('pointerdown', onDown)
    frameBox.addEventListener('pointermove', onMove)
    frameBox.addEventListener('pointerup', onUp)
    frameBox.addEventListener('pointercancel', onCancel)
    return () => {
      if (control) { control.togglePause = undefined; control.pause = undefined; control.resume = undefined; control.start = undefined; control.retry = undefined; control.finishRound = undefined; control.touch = undefined }
      cancelAnimationFrame(raf)
      sounds.dispose()
      watch.disconnect()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', onHidden)
      frameBox.removeEventListener('pointerdown', onDown)
      frameBox.removeEventListener('pointermove', onMove)
      frameBox.removeEventListener('pointerup', onUp)
      frameBox.removeEventListener('pointercancel', onCancel)
    }
  }, [game, accent, control, startLevel, startWorld])

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
      <canvas ref={canvasRef} className="game-player__canvas" aria-label={TITLES[game]} />
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
