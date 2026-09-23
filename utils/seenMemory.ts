/**
 * What this device saw lately, kept for a week.
 *
 * A session remembers its last forty contents for six hours; a visitor who
 * comes back every day met the same handful again, because the cool zones
 * around a like or a small subject hold few contents. This device memory
 * travels with each draw so the server leaves out what was seen this week —
 * nothing is blocked for good, it just waits its turn.
 */

const STORAGE_KEY = 'random-seen-v1'
export const SEEN_LIMIT = 400
export const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

type Entry = [key: string, at: number]

function read(now = Date.now()): Entry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is Entry => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number')
      .filter(([, at]) => now - at < SEEN_TTL_MS)
  } catch {
    return []
  }
}

function write(entries: Entry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-SEEN_LIMIT)))
  } catch {
    /* A full or blocked storage forgets; the session's own memory still holds. */
  }
}

/** Marks a content as seen now; the oldest fall off past the limit. */
export function rememberSeen(key: string, now = Date.now()): void {
  if (!key) return
  const entries = read(now).filter(([seen]) => seen !== key)
  entries.push([key, now])
  write(entries)
}

/** The keys seen this week, most recent last. */
export function seenKeys(now = Date.now()): string[] {
  return read(now).map(([key]) => key)
}
