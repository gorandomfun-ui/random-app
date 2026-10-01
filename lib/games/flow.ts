/**
 * When the games come up in the Random flow, apart from any screen: pure
 * rules over a small state kept on the device, never touching what Random
 * draws. A game is never a draw: it waits between two contents, and the
 * content that was due comes right after it.
 *
 * - The images and videos seen on this device are counted, visit after
 *   visit. A game — CATCHER or EATER, drawn by chance the first time — is
 *   offered at the 20th exactly, wherever the rhythm stands; refused, the
 *   other game comes at the 50th, then the 90th, the 150th, the 290th, the
 *   590th — and after that, no more in that visit. A new visit after a day
 *   away starts the ladder over at the 20th (the owner, 2 October: "sinon on
 *   ne repropose jamais, et on peut toujours dire non"). Only a Wave holds
 *   it back, and never before the 20th image or video of a visit.
 * - An offer counts as refused the moment it shows, and PLAY takes that
 *   back: an offer left unanswered (the page closed or reloaded) moves the
 *   ladder on instead of coming back at the start of the next visit.
 * - A game runs from level 1 to GAME OVER or WINNER, one level each time it
 *   comes up; its score adds up level after level. The next level is back
 *   ten visuals after a level won. A level lost, after its two retries
 *   straight away (or NO), is GAME OVER: the game ends there and a new one,
 *   from level 1, comes twenty visuals later. The score counts only then, at
 *   the end of a game, if it enters this device's ten best.
 * - A game left half-way — refused, or RANDOM in the middle of a level — is
 *   kept at its level. Coming back to it in another visit, the player
 *   chooses: take it up again, or a new game (which ends the old one).
 * - Every level is its own round in the flow: CATCHER starts each with three
 *   lives, EATER with his one.
 *
 * Storage refused (a private window on an iPhone): no state, no game, no
 * error.
 */

import type { GameName } from './scores'

export const GAMES: readonly GameName[] = ['catcher', 'eater']
const other = (game: GameName): GameName => (game === 'catcher' ? 'eater' : 'catcher')

const envNumber = (value: string | undefined, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const envList = (value: string | undefined, fallback: number[]) => {
  const list = (value ?? '').split(',').map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return list.length ? list : fallback
}

/** The ladder and the gaps, each a setting (`NEXT_PUBLIC_GAMES_*`) with the owner's values as defaults. */
export const FLOW = {
  first: envNumber(process.env.NEXT_PUBLIC_GAMES_FIRST, 20),
  /** After each refusal in a row, how many more visuals until the next offer: 20 → 50 → 90 → 150 → 290 → 590, then no more. */
  ladder: envList(process.env.NEXT_PUBLIC_GAMES_LADDER, [30, 40, 60, 140, 300]),
  afterWin: envNumber(process.env.NEXT_PUBLIC_GAMES_AFTER_WIN, 10),
  afterLoss: envNumber(process.env.NEXT_PUBLIC_GAMES_AFTER_LOSS, 20),
  retries: 2,
  /** A visit this long after the last one starts the ladder over. */
  newVisitAfterMs: envNumber(process.env.NEXT_PUBLIC_GAMES_NEW_VISIT_HOURS, 24) * 3_600_000,
}

/**
 * A game under way in the flow: the level it is at, the score so far, its id
 * and signed ticket for the world's scores, and the visit it was last played
 * in (another visit offers to take it up again or start anew).
 */
export type Run = { level: number; score: number; runId?: string; token?: string; startedAt?: number; visit?: string }

export type FlowState = {
  v: 1
  /** Images and videos seen on this device. */
  count: number
  /** At which count the next offer may come. */
  nextAt: number
  /** Refusals in a row. */
  refusals: number
  /** The ladder is spent. */
  stopped: boolean
  /** The game the next offer is for. */
  next: GameName
  /** The game the visitor is playing through, if any: its next level comes first. */
  playing: GameName | null
  lastOfferAt: number
  runs: Partial<Record<GameName, Run>>
  /** When this device last opened Random: a day away, and the ladder starts over. */
  lastVisitAt?: number
}

const KEY = 'random_games_v1'

/** A device's first state: nothing seen yet, the first game drawn by chance (from crypto, not the page's Math.random). */
export function freshFlow(first: GameName = firstGame()): FlowState {
  return { v: 1, count: 0, nextAt: FLOW.first, refusals: 0, stopped: false, next: first, playing: null, lastOfferAt: 0, runs: {} }
}
function firstGame(): GameName {
  try { const a = new Uint8Array(1); crypto.getRandomValues(a); return GAMES[a[0] & 1] } catch { return GAMES[Date.now() & 1] }
}

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

/** The state on this device; null when the device keeps nothing (then the games never come). */
export function loadFlow(): FlowState | null {
  const st = storage()
  if (!st) return null
  try {
    const raw = st.getItem(KEY)
    if (!raw) { const fresh = freshFlow(); st.setItem(KEY, JSON.stringify(fresh)); return fresh }
    const parsed = JSON.parse(raw) as Partial<FlowState>
    if (!parsed || parsed.v !== 1 || typeof parsed.count !== 'number') return freshFlow()
    return { ...freshFlow(), ...parsed, runs: { ...(parsed.runs ?? {}) } }
  } catch { return null }
}

export function saveFlow(state: FlowState): void {
  try { storage()?.setItem(KEY, JSON.stringify(state)) } catch { /* nothing kept: no harm */ }
}

/** One more image or video seen. */
export const countVisual = (s: FlowState): FlowState => ({ ...s, count: s.count + 1 })

/**
 * The page opens: a day or more since the last visit, and the ladder starts
 * over — the first offer at the 20th visual of this visit, refusals
 * forgotten, a spent ladder alive again; the game under way, if any, is
 * kept and offered first. Any sooner, nothing changes but the stamp.
 */
export function newVisit(s: FlowState, now: number): FlowState {
  const away = s.lastVisitAt === undefined || now - s.lastVisitAt >= FLOW.newVisitAfterMs
  if (!away) return { ...s, lastVisitAt: now }
  return { ...s, lastVisitAt: now, refusals: 0, stopped: false, nextAt: s.count + FLOW.first }
}

/** What the page knows at the moment a content is about to show: a Wave under way, the images and videos seen in this visit. */
export type FlowMoment = { inWave: boolean; visitSeen: number }

/** Is a game due now, and which? Null when not. Reads only. */
export function dueGame(s: FlowState, m: FlowMoment): GameName | null {
  if (s.stopped || s.count < s.nextAt || m.inWave || m.visitSeen < FLOW.first) return null
  return s.playing ?? s.next
}

/** An offer shows: it counts as refused from now on, and PLAY takes it back (see `accepted`). */
export const offered = (s: FlowState, now: number): FlowState => ({ ...refused(s), lastOfferAt: now })

/** The offer refused, or a game left half-way: back on the ladder, the other game next, the game kept. */
export function refused(s: FlowState): FlowState {
  const refusals = s.refusals + 1
  const gap = FLOW.ladder[refusals - 1]
  const game = s.playing ?? s.next
  if (gap === undefined) return { ...s, refusals, stopped: true, playing: null, next: other(game) }
  return { ...s, refusals, nextAt: s.count + gap, playing: null, next: other(game) }
}

/** The offer taken: off the ladder, playing this game; its game under way, or a new one from level 1. `visit`: this visit, written on the game. */
export function accepted(s: FlowState, game: GameName, visit?: string): { state: FlowState; run: Run } {
  const kept = s.runs[game] ?? { level: 1, score: 0 }
  const run = visit ? { ...kept, visit } : kept
  return { state: { ...s, refusals: 0, stopped: false, playing: game, runs: { ...s.runs, [game]: run } }, run }
}

/**
 * The game under way that another visit should offer to take up again —
 * RESUME at its level, or NEW GAME — or null: none, one not begun, or one
 * already played in this visit (it simply goes on).
 */
export function resumable(s: FlowState, game: GameName, visit: string): Run | null {
  const run = s.runs[game]
  if (!run || (run.level <= 1 && run.score <= 0)) return null
  return run.visit === visit ? null : run
}

/** NEW GAME: the game under way ends here; the next round starts from level 1. */
export function newGame(s: FlowState, game: GameName): FlowState {
  const runs = { ...s.runs }
  delete runs[game]
  return { ...s, runs }
}

/** A level won: the score kept; the next level ten visuals on; the sixteenth, the game is over and won, the other game next time. */
export function levelWon(s: FlowState, game: GameName, score: number, lastLevel = 16): FlowState {
  const run = s.runs[game] ?? { level: 1, score: 0 }
  if (run.level >= lastLevel) {
    const runs = { ...s.runs }
    delete runs[game]
    return { ...s, runs, playing: null, next: other(game), nextAt: s.count + FLOW.ladder[0] }
  }
  return { ...s, playing: game, next: game, nextAt: s.count + FLOW.afterWin, runs: { ...s.runs, [game]: { ...run, level: run.level + 1, score } } }
}

/** GAME OVER: the level lost after its retries, the game ends; a new one of the same game twenty visuals on, from level 1. */
export function gameOver(s: FlowState, game: GameName): FlowState {
  const runs = { ...s.runs }
  delete runs[game]
  return { ...s, runs, playing: null, next: game, refusals: 0, nextAt: s.count + FLOW.afterLoss }
}

/** A level left half-way (RANDOM in the middle of it): the game waits at that level, twenty visuals on. */
export const levelLeft = (s: FlowState, game: GameName): FlowState => ({ ...s, playing: game, next: game, nextAt: s.count + FLOW.afterLoss })

/** The signed ticket of a game's run, once the server has given it. */
export function withTicket(s: FlowState, game: GameName, ticket: { runId: string; token: string; startedAt: number }): FlowState {
  const run = s.runs[game] ?? { level: 1, score: 0 }
  return { ...s, runs: { ...s.runs, [game]: { ...run, ...ticket } } }
}
