/**
 * The subjects and channels this device saw, kept for two weeks.
 *
 * The device already remembers the contents it saw (utils/seenMemory.ts);
 * another video of the same subject passed that memory, and Pelé came back
 * day after day (the owner, 1 October: "avoir le même sujet de base d'une
 * session à l'autre par la même personne, c'est pas possible"). So the
 * device keeps the hashes of the subject and the author of every visual it
 * showed — the same hashes the session's exposures carry — and sends them
 * with every draw; the server refuses them on every card, chance included.
 * Nothing about the visitor: numbers, on this device only.
 */

const STORAGE_KEY = 'random-subjects-v1'
export const SUBJECTS_LIMIT = 600
export const SUBJECTS_TTL_MS = 14 * 24 * 60 * 60 * 1000

type Entry = [hash: number, at: number]

function read(now = Date.now()): Entry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is Entry => Array.isArray(entry) && Number.isSafeInteger(entry[0]) && typeof entry[1] === 'number')
      .filter(([, at]) => now - at < SUBJECTS_TTL_MS)
  } catch {
    return []
  }
}

function write(entries: Entry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-SUBJECTS_LIMIT)))
  } catch {
    /* A full or blocked storage forgets; the session's own memory still holds. */
  }
}

/** Marks subjects and authors as seen now; the oldest fall off past the limit. */
export function rememberSubjects(hashes: readonly number[], now = Date.now()): void {
  const fresh = hashes.filter((hash) => Number.isSafeInteger(hash) && hash >= 0)
  if (!fresh.length) return
  const entries = read(now).filter(([hash]) => !fresh.includes(hash))
  for (const hash of fresh) entries.push([hash, now])
  write(entries)
}

/** The hashes seen these two weeks, most recent last. */
export function seenSubjects(now = Date.now()): number[] {
  return read(now).map(([hash]) => hash)
}
