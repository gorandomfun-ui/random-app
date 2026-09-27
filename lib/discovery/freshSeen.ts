/**
 * Which of the day's fresh videos a device has already been shown: one bit
 * per place in the day's list, a thousand places in 168 characters. The
 * device keeps it with the list's day and sends it with every draw; the
 * server draws among the places still at zero. Pure, shared by both sides.
 */

export type FreshSeen = { day: string; seen: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** Room for 2,048 places: twice the day's list. */
export const FRESH_SEEN_MAX_CHARS = 344

function toBytes(seen: string): Uint8Array {
  try {
    const binary = typeof atob === 'function' ? atob(seen) : Buffer.from(seen, 'base64').toString('binary')
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return new Uint8Array(0)
  }
}

function toText(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64')
}

export function parseFreshSeen(value: unknown): FreshSeen | null {
  if (!value || typeof value !== 'object') return null
  const { day, seen } = value as Record<string, unknown>
  if (typeof day !== 'string' || !DAY.test(day)) return null
  if (typeof seen !== 'string' || seen.length > FRESH_SEEN_MAX_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(seen)) return null
  return { day, seen }
}

/** The seen places of that day, as bytes: empty for another day or none. */
export function seenBytes(cursor: FreshSeen | null, day: string): Uint8Array {
  return cursor && cursor.day === day ? toBytes(cursor.seen) : new Uint8Array(0)
}

export const isSeen = (bytes: Uint8Array, index: number): boolean => Boolean((bytes[index >> 3] ?? 0) & (1 << (index & 7)))

export function hasSeen(cursor: FreshSeen | null, day: string, index: number): boolean {
  return isSeen(seenBytes(cursor, day), index)
}

/** The same memory with one more place seen; another day starts a new memory. */
export function markSeen(cursor: FreshSeen | null, day: string, index: number): FreshSeen {
  const bytes = cursor && cursor.day === day ? toBytes(cursor.seen) : new Uint8Array(0)
  const size = Math.max(bytes.length, (index >> 3) + 1)
  const next = new Uint8Array(size)
  next.set(bytes)
  next[index >> 3] |= 1 << (index & 7)
  return { day, seen: toText(next) }
}
