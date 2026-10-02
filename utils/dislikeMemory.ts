/**
 * What this device refused with "pas ça", kept a month.
 *
 * A refusal closes the visual with its seconds (utils/keptMemory.ts) and
 * the site counts it on the content; but the device also keeps the id, so
 * that the taste card, which looks for what resembles the likes, keeps the
 * lookalikes of what was refused away (lib/discovery/wheel.ts), and so that
 * the content itself never comes back here. The latest few ride with every
 * draw. Nothing about the visitor: content ids, on this device only.
 */

const STORAGE_KEY = 'random-dislikes-v1'
export const DISLIKES_LIMIT = 60
export const DISLIKES_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Ids a draw carries at most: the latest refusals, enough to keep their lookalikes away. */
export const DISLIKES_PER_DRAW = 20

type Entry = [id: string, at: number]

function read(now = Date.now()): Entry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is Entry => Array.isArray(entry) && typeof entry[0] === 'string' && /^[a-f\d]{24}$/i.test(entry[0]) && typeof entry[1] === 'number')
      .filter(([, at]) => now - at < DISLIKES_TTL_MS)
  } catch {
    return []
  }
}

function write(entries: Entry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-DISLIKES_LIMIT)))
  } catch {
    /* A full or blocked storage forgets; the site's own count of the refusal still holds. */
  }
}

/** A content refused now; the oldest fall off past the limit. */
export function rememberDislike(id: string, now = Date.now()): void {
  if (!/^[a-f\d]{24}$/i.test(id)) return
  const entries = read(now).filter(([known]) => known !== id)
  entries.push([id, now])
  write(entries)
}

/** The latest refusals, most recent last, as many as a draw carries. */
export function dislikedIds(now = Date.now()): string[] {
  return read(now).map(([id]) => id).slice(-DISLIKES_PER_DRAW)
}
