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
 *   590th — and after that, no more. Only a Wave holds it back.
 * - Once someone plays, the next level is back ten visuals after a level
 *   won, twenty after a level lost (two retries come straight away).
 *   A game refused mid-way puts the player back on the ladder; the game
 *   is kept, and taken up again at its level.
 * - Every level is its own round in the flow: CATCHER starts each with three
 *   lives, EATER with his one; the score of a game adds up level after level.
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
}

/** A game under way in the flow: the level it is at, the score so far, its id and signed ticket for the world's scores. */
export type Run = { level: number; score: number; runId?: string; token?: string; startedAt?: number }

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

/** What the page knows at the moment a content is about to show. */
export type FlowMoment = { inWave: boolean }

/** Is a game due now, and which? Null when not. Reads only. */
export function dueGame(s: FlowState, m: FlowMoment): GameName | null {
  if (s.stopped || s.count < s.nextAt || m.inWave) return null
  return s.playing ?? s.next
}

export const offered = (s: FlowState, now: number): FlowState => ({ ...s, lastOfferAt: now })

/** The offer refused, or a game left half-way: back on the ladder, the other game next, the game kept. */
export function refused(s: FlowState): FlowState {
  const refusals = s.refusals + 1
  const gap = FLOW.ladder[refusals - 1]
  const game = s.playing ?? s.next
  if (gap === undefined) return { ...s, refusals, stopped: true, playing: null, next: other(game) }
  return { ...s, refusals, nextAt: s.count + gap, playing: null, next: other(game) }
}

/** The offer taken: off the ladder, playing this game; its game under way, or a new one from level 1. */
export function accepted(s: FlowState, game: GameName): { state: FlowState; run: Run } {
  const run = s.runs[game] ?? { level: 1, score: 0 }
  return { state: { ...s, refusals: 0, playing: game, runs: { ...s.runs, [game]: run } }, run }
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

/** A level lost after its retries: the same level twenty visuals on, the score as it stood before it. */
export const levelLost = (s: FlowState, game: GameName): FlowState => ({ ...s, playing: game, next: game, nextAt: s.count + FLOW.afterLoss })

/** The signed ticket of a game's run, once the server has given it. */
export function withTicket(s: FlowState, game: GameName, ticket: { runId: string; token: string; startedAt: number }): FlowState {
  const run = s.runs[game] ?? { level: 1, score: 0 }
  return { ...s, runs: { ...s.runs, [game]: { ...run, ...ticket } } }
}
