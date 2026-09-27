/**
 * The world's best scores, per game: the two hundred best, kept in one small
 * document each (like the likes' leaderboard), read in one go. A game's
 * entry is its run: sent again as the game goes on, level after level, it
 * replaces itself and only ever goes up. Server only.
 */

import { getDb } from '@/lib/db'

import { worldName } from './names'
import type { GameName } from './scores'

export { worldName }

export const WORLD_TOP = 200
const COLLECTION = 'leaderboards'
const idOf = (game: GameName) => `games-${game}`

export type WorldEntry = { runId: string; name: string; score: number; level: number; won: boolean; at: number }
type Doc = { _id: string; entries: WorldEntry[]; updatedAt?: Date }

export async function readWorld(game: GameName): Promise<WorldEntry[]> {
  const db = await getDb()
  const doc = await db.collection<Doc>(COLLECTION).findOne({ _id: idOf(game) })
  return doc?.entries ?? []
}

/** Puts a run's score in the table if it belongs there; returns its place (1 is the best), or 0. */
export async function submitWorld(game: GameName, entry: WorldEntry): Promise<number> {
  const db = await getDb()
  const collection = db.collection<Doc>(COLLECTION)
  const entries = (await collection.findOne({ _id: idOf(game) }))?.entries ?? []
  const previous = entries.find((e) => e.runId === entry.runId)
  // a run's score only goes up
  if (previous && previous.score >= entry.score && previous.level >= entry.level) return entries.indexOf(previous) + 1
  const list = [...entries.filter((e) => e.runId !== entry.runId), entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, WORLD_TOP)
  const place = list.findIndex((e) => e.runId === entry.runId) + 1
  if (place === 0 && !previous) return 0
  await collection.updateOne({ _id: idOf(game) }, { $set: { entries: list, updatedAt: new Date() } }, { upsert: true })
  return place
}
