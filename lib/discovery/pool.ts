import { bagValue, weighted, type Rng } from './random'
import { isVisual, seenOf, type Candidate, type Format, type Seen } from './types'

export type Session = {
  version: 2; seed: number; revision: number; displayed: number; visuals: number
  mixedVisuals: number; coolTickets: number; editorialTickets: number; autonomousTickets: number
  recent: Seen[]; visualHistory: Seen[]
}
export type Intent = { revision: number; type: Format; mode: 'random' | 'cool';
  branch: 'editorial' | 'autonomous' | 'general'; lane: 'trend' | 'unknown' | 'described' | 'any'; allowStock: boolean; allowDirectReference: boolean }
export function newSession(seed: number): Session {
  return { version: 2, seed, revision: 0, displayed: 0, visuals: 0, mixedVisuals: 0,
    coolTickets: 0, editorialTickets: 0, autonomousTickets: 0, recent: [], visualHistory: [] }
}
export function planDraw(state: Session, type: Format): Intent {
  const visual = isVisual(type)
  const cool = visual && (state.displayed < 10 || bagValue(state.seed, 'mode', state.mixedVisuals,
    [true, true, true, true, true, false, false, false, false, false]))
  const editorial = cool && bagValue(state.seed, 'editorial', state.coolTickets,
    [true, true, true, true, true, false, false, false, false, false])
  const lane = cool ? bagValue(state.seed, 'autonomous', editorial ? state.coolTickets : state.autonomousTickets,
    ['trend', 'trend', 'trend', 'trend', 'trend', 'unknown', 'unknown', 'unknown', 'unknown',
      ...Array<Intent['lane']>(11).fill('described')] as Intent['lane'][]) : 'any'
  return { revision: state.revision, type, mode: cool ? 'cool' : 'random',
    branch: editorial ? 'editorial' : cool ? 'autonomous' : 'general', lane,
    allowStock: visual && !cool && state.displayed >= 40 && state.visualHistory.slice(-19).every(x => !x.stock),
    allowDirectReference: editorial && bagValue(state.seed, 'direct', state.editorialTickets, [true, false, false, false, false]) }
}
function same(a: Seen, b: Candidate): boolean {
  return a.key === b.key || Boolean(a.duplicateKey && a.duplicateKey === b.duplicateKey)
}
export function hardEligible(c: Candidate, intent: Intent, state: Session): boolean {
  return c.available && !c.suppressed && c.type === intent.type &&
    (!c.stock || intent.allowStock) && !(intent.mode === 'cool' && c.routineEditorial) &&
    !state.recent.some(x => same(x, c))
}
export function commitDraw<T>(state: Session, ticket: Intent, item: Candidate<T>): Session {
  if (ticket.revision !== state.revision || !hardEligible(item, ticket, state)) throw new Error('Stale or invalid Random reservation')
  const visual = isVisual(item.type), entry = seenOf(item)
  return { ...state, revision: state.revision + 1, displayed: state.displayed + 1,
    visuals: state.visuals + Number(visual), mixedVisuals: state.mixedVisuals + Number(visual && state.displayed >= 10),
    coolTickets: state.coolTickets + Number(ticket.mode === 'cool'),
    editorialTickets: state.editorialTickets + Number(ticket.branch === 'editorial'),
    autonomousTickets: state.autonomousTickets + Number(ticket.branch === 'autonomous'),
    recent: [...state.recent, entry].slice(-40),
    visualHistory: visual ? [...state.visualHistory, entry].slice(-40) : state.visualHistory }
}
/** Wave views affect repetition only: never the introductory 10/40 or the format sequence. */
export function recordWave(state: Session, item: Candidate): Session {
  return { ...state, revision: state.revision + 1, recent: [...state.recent, seenOf(item)].slice(-40) }
}
function repeatPenalty(c: Candidate, state: Session): number {
  let weight = 1
  const history = state.visualHistory, videos = history.filter(x => x.type === 'video')
  if (c.authorKey && videos.slice(-5).some(x => x.authorKey === c.authorKey)) weight *= .08
  if (c.authorKey && videos.slice(-20).filter(x => x.authorKey === c.authorKey).length >= 2) weight *= .15
  if (c.seriesKey && history.slice(-10).some(x => x.seriesKey === c.seriesKey)) weight *= .1
  if (history.slice(-2).length === 2 && history.slice(-2).every(x => x.family === c.profile.family)) weight *= .2
  if (history.slice(-20).filter(x => x.family === c.profile.family).length >= 7) weight *= .25
  return weight
}
function byFamily<T>(items: Candidate<T>[], state: Session, random: Rng): Candidate<T> | null {
  const families = new Map<string, Candidate<T>[]>()
  for (const c of items) {
    const list = families.get(c.profile.family) ?? []; list.push(c); families.set(c.profile.family, list)
  }
  const family = weighted([...families.values()], group => Math.max(...group.map(c => repeatPenalty(c, state))), random)
  return family ? weighted(family, c => repeatPenalty(c, state), random) : null
}
export type PoolResult<T> = { item: Candidate<T>; branch: Intent['branch']; fallback: boolean }
/** Caller supplies a bounded, family-balanced sample from the DB, not the whole catalogue. */
export function pickPool<T>(candidates: Candidate<T>[], ticket: Intent, state: Session, random: Rng,
  now: number, referenceCounts: Record<string, number> = {}): PoolResult<T> | null {
  let eligible = candidates.filter(c => hardEligible(c, ticket, state))
  if (!eligible.length) return null
  if (!isVisual(ticket.type)) {
    const item = weighted(eligible, () => 1, random)
    return item ? { item, branch: 'general', fallback: false } : null
  }
  if (ticket.mode === 'cool') eligible = eligible.filter(c => !c.stock)
  else {
    // At most 10% of general visual attempts, and no catching up when stock is unavailable.
    const wantStock = ticket.allowStock && random() < .1
    const normal = eligible.filter(c => !c.stock), stock = eligible.filter(c => c.stock)
    eligible = wantStock && stock.length ? stock : normal
  }
  if (ticket.branch === 'editorial') {
    const counts = Object.values(referenceCounts).filter(n => n > 0).sort((a, b) => a - b)
    const median = counts[Math.floor(counts.length / 2)] ?? 1
    const families = Object.keys(referenceCounts).filter(f => referenceCounts[f] > 0 && eligible.some(c =>
      c.editorialFamilies?.includes(f) && (!c.directEditorialReference || ticket.allowDirectReference)))
    const family = weighted(families, f => Math.min(Math.sqrt(referenceCounts[f]), 2 * Math.sqrt(median)), random)
    if (family) {
      const item = byFamily(eligible.filter(c => c.editorialFamilies?.includes(family) &&
        (!c.directEditorialReference || ticket.allowDirectReference)), state, random)
      if (item) return { item, branch: 'editorial', fallback: false }
    }
  }
  const preferred = eligible.filter(c => ticket.lane === 'any' ||
    (ticket.lane === 'trend' && c.trendObservedAt != null && c.trendObservedAt <= now && c.trendObservedAt >= now - 7 * 86400000) ||
    (ticket.lane === 'unknown' && c.profile.evidence === 'unknown') ||
    (ticket.lane === 'described' && c.profile.evidence === 'described'))
  const item = byFamily(preferred.length ? preferred : eligible, state, random)
  return item ? { item, branch: ticket.mode === 'cool' ? 'autonomous' : 'general',
    fallback: ticket.branch === 'editorial' || !preferred.length } : null
}

/** Project prepared items, but commit only the displayed head. Failure invalidates its successors. */
export class ReservationQueue<T> {
  private entries: { ticket: Intent; item: Candidate<T>; after: Session }[] = []
  constructor(public committed: Session) {}
  get projected(): Session { return this.entries.at(-1)?.after ?? this.committed }
  get length(): number { return this.entries.length }
  reserve(ticket: Intent, item: Candidate<T>): void {
    if (this.entries.length >= 3) throw new Error('Prefetch limit is three')
    this.entries.push({ ticket, item, after: commitDraw(this.projected, ticket, item) })
  }
  displayed(key: string): void {
    const first = this.entries[0]
    if (!first || first.item.key !== key) throw new Error('Random display out of order')
    this.committed = first.after; this.entries.shift()
  }
  failed(key: string): void {
    const index = this.entries.findIndex(x => x.item.key === key)
    if (index >= 0) this.entries.splice(index)
  }
  reset(state = this.committed): void { this.committed = state; this.entries = [] }
}
