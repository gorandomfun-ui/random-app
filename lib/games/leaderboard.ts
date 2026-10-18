/**
 * The world's best scores, per game: the two hundred best, kept in one small
 * document each (like the likes' leaderboard), read in one go. A game's
 * entry is its run: sent again as the game goes on, level after level, it
 * replaces itself and only ever goes up. Server only.
 */

import { getDb } from '@/lib/db'

import { worldName } from './names'
import type { GameName } from './scores'
import { placeEntry, type WorldEntry } from './table'

export { worldName }
export { PLACES_PER_ADDRESS, WORLD_TOP, placeEntry, type WorldEntry } from './table'

const COLLECTION = 'leaderboards'
const idOf = (game: GameName) => `games-${game}`

type Doc = { _id: string; entries: WorldEntry[]; updatedAt?: Date; version?: number }

const WRITE_TRIES = 4

export async function readWorld(game: GameName): Promise<WorldEntry[]> {
  const db = await getDb()
  const doc = await db.collection<Doc>(COLLECTION).findOne({ _id: idOf(game) })
  return doc?.entries ?? []
}

/**
 * Puts a run's score in the table if it belongs there; returns its place (1 is the best), or 0.
 * The write only lands on the table it was computed from (its version): two scores sent at the
 * same moment no longer erase each other, the second is placed again on the first's table.
 */
export async function submitWorld(game: GameName, entry: WorldEntry): Promise<number> {
  const db = await getDb()
  const collection = db.collection<Doc>(COLLECTION)
  for (let attempt = 0; attempt < WRITE_TRIES; attempt += 1) {
    const doc = await collection.findOne({ _id: idOf(game) })
    const entries = doc?.entries ?? []
    const previous = entries.find((e) => e.runId === entry.runId)
    // a run's score only goes up
    if (previous && previous.score >= entry.score && previous.level >= entry.level) return entries.indexOf(previous) + 1
    const list = placeEntry(entries, entry)
    const place = list.findIndex((e) => e.runId === entry.runId) + 1
    if (place === 0 && !previous) return 0
    const version = doc?.version ?? 0
    if (!doc) {
      const inserted = await collection.insertOne({ _id: idOf(game), entries: list, updatedAt: new Date(), version: 1 }).then(() => true, () => false)
      if (inserted) return place
      continue
    }
    const written = await collection.updateOne(
      { _id: idOf(game), ...(doc.version == null ? { version: { $exists: false } } : { version }) },
      { $set: { entries: list, updatedAt: new Date(), version: version + 1 } },
    )
    if (written.matchedCount === 1) return place
  }
  return 0
}
