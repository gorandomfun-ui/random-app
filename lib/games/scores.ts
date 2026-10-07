/**
 * The best scores kept on this device, per game: the ten best, each with
 * the name the player left, and the last name typed so it is offered
 * again. Stored like the quiz points, in localStorage, every read and
 * write guarded: a private window that refuses storage simply keeps no
 * scores, and nothing breaks. A score is a whole game's, entered when the
 * game ends (GAME OVER or WINNER) and only if it makes the ten; the world's
 * two hundred best are in the database.
 */

export type GameName = 'catcher' | 'eater' | 'attacks' | 'racing'
export const GAME_NAMES: readonly GameName[] = ['catcher', 'eater', 'attacks', 'racing']
/** A game's name as a request may carry it: one of the games, or not. */
export const isGameName = (value: unknown): value is GameName => typeof value === 'string' && (GAME_NAMES as readonly string[]).includes(value)
/** `runId`: that game's line in the world's table, when it was sent there — so the panel can light it. */
export type ScoreEntry = { name: string; score: number; level: number; at: number; runId?: string }

/** Version 2 from 30 September: the tables started again, the scores of games not finished left behind. */
const KEY = 'random_games_scores_v2'
const NAME_KEY = 'random_games_name_v1'
export const TOP = 10
export const NAME_MAX = 10

type Store = Partial<Record<GameName, ScoreEntry[]>>

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

function read(): Store {
  try {
    const raw = storage()?.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed as Store : {}
  } catch { return {} }
}

/** A name as the table keeps it: capitals, digits and a few signs, ten at most. */
export function cleanName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

/** This device's ten best for a game, best first. */
export function topScores(game: GameName): ScoreEntry[] {
  const list = read()[game]
  return Array.isArray(list) ? list.filter((e) => typeof e?.score === 'number').slice(0, TOP) : []
}

export const bestScore = (game: GameName): number => topScores(game)[0]?.score ?? 0

/** Would this score enter the ten best? */
export function qualifies(game: GameName, score: number): boolean {
  if (score <= 0) return false
  const list = topScores(game)
  return list.length < TOP || score > list[list.length - 1].score
}

/** Puts a finished game's score in the table, keeps the ten best; returns its place (1 is the best), or 0 if it did not enter or could not be kept. */
export function addScore(game: GameName, entry: Omit<ScoreEntry, 'at'> & { at?: number }): number {
  const name = cleanName(entry.name) || 'PLAYER'
  const row: ScoreEntry = { name, score: Math.max(0, Math.floor(entry.score)), level: Math.max(1, Math.floor(entry.level)), at: entry.at ?? Date.now(), ...(entry.runId ? { runId: entry.runId } : {}) }
  const list = [...topScores(game), row].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, TOP)
  const place = list.indexOf(row) + 1
  const st = storage()
  if (!st) return 0
  try {
    const store = read()
    store[game] = list
    st.setItem(KEY, JSON.stringify(store))
    st.setItem(NAME_KEY, name)
  } catch { return 0 }
  return place
}

export function lastName(): string {
  try { return cleanName(storage()?.getItem(NAME_KEY) ?? '') } catch { return '' }
}
