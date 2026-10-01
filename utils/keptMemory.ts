/**
 * How long each visual stayed on screen, on this device.
 *
 * The site counts what it serves (lib/discovery/served.ts) but knew nothing
 * of what people stay on — the one thing a feed learns from (the owner,
 * 1 October: "une curation globale, lente"). When a visual is shown, the
 * previous one closes with the seconds it was kept; the closed ones ride
 * along with the next draw (`kept` in the request body) and the site adds
 * them to the content's count. Nothing about the visitor: a content id and
 * a number of seconds, capped, a few at a time.
 */

export type Kept = { id: string; seconds: number }
/** Past this, the visitor has walked away, not watched. */
export const KEPT_CAP_SECONDS = 120
/** Reports a draw carries at most; older ones fall off. */
export const KEPT_PER_DRAW = 4

type Open = { id: string; at: number }

export function createKeptMemory(clock: () => number = Date.now) {
  let open: Open | null = null
  let pending: Kept[] = []
  return {
    /** A visual is on screen now (null: something that is not a visual); the previous one closes. */
    markShown(id: string | null, now = clock()): void {
      if (open) {
        const seconds = Math.min(KEPT_CAP_SECONDS, Math.max(0, Math.round((now - open.at) / 1000)))
        pending = [...pending, { id: open.id, seconds }].slice(-KEPT_PER_DRAW * 2)
      }
      open = id && /^[a-f\d]{24}$/i.test(id) ? { id, at: now } : null
    },
    /** The reports ready to ride with a draw; taken once. */
    takeKept(): Kept[] {
      const taken = pending.slice(0, KEPT_PER_DRAW)
      pending = pending.slice(KEPT_PER_DRAW)
      return taken
    },
  }
}

const memory = createKeptMemory()
export const markShown = (id: string | null): void => memory.markShown(id)
export const takeKept = (): Kept[] => memory.takeKept()
