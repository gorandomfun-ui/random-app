import { PREFETCH_LIMIT, planDraw, ReservationQueue, recordWave, restartRhythm, type Intent, type Session } from './pool'
import { markSeen, parseFreshSeen, type FreshSeen } from './freshSeen'
import type { Candidate, Format } from './types'

export type Prepared<T> = { candidate: Candidate<T>; item: T }
export type RandomLoader<T> = (session: Session, type: Format, signal: AbortSignal, factVariant?: 'quiz' | 'text') => Promise<Candidate<T> | null>
/** Integrates with RandomExperience's ready queue. It does not replace media preloading. */
export class DiscoveryController<T> {
  private queue: ReservationQueue<T>
  private epoch = 0
  private pending?: AbortController
  constructor(state: Session) { this.queue = new ReservationQueue(state) }
  snapshot(): Session { return structuredClone(this.queue.committed) }
  get projected(): Session { return structuredClone(this.queue.projected) }
  async prepare(type: Format, load: RandomLoader<T>, factVariant?: 'quiz' | 'text'): Promise<Prepared<T> | null> {
    if (this.pending || this.queue.length >= PREFETCH_LIMIT) return null
    const controller = new AbortController(), epoch = this.epoch
    this.pending = controller
    const state = this.queue.projected, ticket: Intent = planDraw(state, type)
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      const candidate = await load(state, type, controller.signal, factVariant)
      if (!candidate || epoch !== this.epoch || controller.signal.aborted) return null
      this.queue.reserve(ticket, candidate)
      return { candidate, item: candidate.payload }
    } finally { clearTimeout(timeout); if (this.pending === controller) this.pending = undefined }
  }
  displayed(key: string): void { this.queue.displayed(key) }
  failed(key: string): void {
    this.epoch++; this.pending?.abort(); this.pending = undefined; this.queue.failed(key)
  }
  invalidate(): void {
    this.epoch++; this.pending?.abort(); this.pending = undefined; this.queue.reset()
  }
  waveDisplayed(item: Candidate<T>): void {
    this.invalidate(); this.queue.reset(recordWave(this.queue.committed, item))
  }
  /** The visitor is back: the score restarts at the hook, and what was prepared under the old position is dropped. */
  restartRhythm(): void {
    this.invalidate(); this.queue.reset(restartRhythm(this.queue.committed))
  }
  /** A draw made elsewhere — the home's advance — takes its place in the queue, in order. */
  adopt(ticket: Intent, candidate: Candidate<T>): void { this.queue.reserve(ticket, candidate) }
}

/** Which of the day's fresh videos this device has been shown (lib/discovery/freshSeen.ts). */
export type FreshStore = { read(): FreshSeen | null; mark(day: string, index: number): void }
const FRESH_KEY = 'random_fresh_v2'

/** The device's own memory, in its storage; nothing is kept where there is none (a private window, a test). */
export function browserFreshStore(): FreshStore {
  const storage = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null } }
  return {
    read() {
      try {
        const raw = storage()?.getItem(FRESH_KEY)
        return raw ? parseFreshSeen(JSON.parse(raw)) : null
      } catch { return null }
    },
    mark(day, index) {
      try { storage()?.setItem(FRESH_KEY, JSON.stringify(markSeen(this.read(), day, index))) } catch { /* no storage: the day's list may come back */ }
    },
  }
}

/** `seen`: what this device saw lately, sent with every draw so it is left out; the session's own memory stays in the session. */
export function makeRandomLoader<T>(lang: string, request: typeof fetch = fetch, seen: () => string[] = () => [], fresh: FreshStore = browserFreshStore()): RandomLoader<T> {
  return async (session, type, signal, factVariant) => {
    const memory = fresh.read()
    const response = await request('/api/discovery/random', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session, type, lang, factVariant, seen: seen(), ...(memory ? { fresh: memory } : {}) }) })
    if (response.status === 204) return null
    if (!response.ok) throw new Error(`Discovery request failed (${response.status})`)
    const body = await response.json() as { candidate: Candidate<T> }
    const candidate = body.candidate
    if (candidate?.fresh && candidate.freshDay && typeof candidate.freshPosition === 'number') fresh.mark(candidate.freshDay, candidate.freshPosition)
    return candidate
  }
}
