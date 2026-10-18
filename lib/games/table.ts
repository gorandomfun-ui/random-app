/**
 * How a game's world table is built, without the database: each address keeps
 * its best few places, so a cheat cannot fill the table with made-up runs.
 */

export const WORLD_TOP = 200
/** Places one address may hold in a game's table (18 October). */
export const PLACES_PER_ADDRESS = 3

/** `who`: a salted fingerprint of the address that sent it (lib/v3/rateLimit.ts), never shown. */
export type WorldEntry = { runId: string; name: string; score: number; level: number; won: boolean; at: number; who?: string }

/** The table with a run's score put in, sorted, each address keeping its best few, cut to the top. */
export function placeEntry(entries: readonly WorldEntry[], entry: WorldEntry): WorldEntry[] {
  const sorted = [...entries.filter((e) => e.runId !== entry.runId), entry].sort((a, b) => b.score - a.score || a.at - b.at)
  const held = new Map<string, number>()
  const kept: WorldEntry[] = []
  for (const e of sorted) {
    if (e.who) {
      const count = held.get(e.who) ?? 0
      if (count >= PLACES_PER_ADDRESS) continue
      held.set(e.who, count + 1)
    }
    kept.push(e)
    if (kept.length >= WORLD_TOP) break
  }
  return kept
}
