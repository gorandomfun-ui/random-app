import type { PoolRetrievalReport } from './sampling'
import { bagValue, weighted, type Rng } from './random'
import { appendExposure, diversityWeights, pickDiverse, type Exposure } from './diversity'
import { isVisual, seenOf, type Candidate, type Format, type Seen } from './types'

export type Session = {
  version: 2; seed: number; revision: number; displayed: number; visuals: number
  mixedVisuals: number; coolTickets: number; editorialTickets: number; autonomousTickets: number
  recent: Seen[]; visualHistory: Seen[]; exposures?: Exposure[]
}
export type Intent = { revision: number; type: Format; mode: 'random' | 'cool';
  branch: 'editorial' | 'autonomous' | 'general'; lane: 'trend' | 'recent' | 'unknown' | 'described' | 'any'; allowStock: boolean; allowDirectReference: boolean }
export function newSession(seed: number): Session {
  return { version: 2, seed, revision: 0, displayed: 0, visuals: 0, mixedVisuals: 0,
    coolTickets: 0, editorialTickets: 0, autonomousTickets: 0, recent: [], visualHistory: [], exposures: [] }
}
export function planDraw(state: Session, type: Format): Intent {
  const visual = isVisual(type)
  // One visual draw in three is cool. The first ten used to be all cool and
  // then one in two: with threads of three, that was the same taste in loops.
  const cool = visual && bagValue(state.seed, 'mode', state.visuals, [true, false, false])
  const editorial = cool && bagValue(state.seed, 'editorial', state.coolTickets,
    [true, true, true, true, true, false, false, false, false, false])
  const lane = cool ? bagValue(state.seed, 'autonomous', editorial ? state.coolTickets : state.autonomousTickets,
    ['trend', 'trend', 'trend', 'trend', 'trend', 'recent', 'recent', 'recent', 'recent',
      'unknown', 'unknown', 'unknown', ...Array<Intent['lane']>(8).fill('described')] as Intent['lane'][]) : 'any'
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
    recent: [...state.recent, entry].slice(-40), exposures: appendExposure(state.exposures, item),
    visualHistory: visual ? [...state.visualHistory, entry].slice(-40) : state.visualHistory }
}
/** Wave views affect repetition only: never the introductory 10/40 or the format sequence. */
export function recordWave(state: Session, item: Candidate): Session {
  return { ...state, revision: state.revision + 1, recent: [...state.recent, seenOf(item)].slice(-40), exposures: appendExposure(state.exposures, item) }
}
export type PoolResult<T> = { item: Candidate<T>; branch: Intent['branch']; fallback: boolean;
  selection?: { requestedLane: Intent['lane']; servedLane: Intent['lane']; reasons: string[]; candidateCount?: number; familyCount?: number; retrieval?: PoolRetrievalReport } }
export function matchesLane(c: Candidate, lane: Intent['lane'], now: number): boolean {
  if (lane === 'trend') return c.trendObservedAt != null && c.trendObservedAt <= now && c.trendObservedAt >= now - 7 * 86400000
  if (lane === 'recent') return c.publishedAt != null && c.publishedAt <= now && c.publishedAt >= now - 90 * 86400000
  if (lane === 'unknown' || lane === 'described') return c.profile.evidence === lane
  return true
}
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
  // One lottery across the full sample: lanes and owner affinity adjust weights,
  // never discard all alternatives because a single preferred item exists.
  // Exact exclusions remain the original 40-item protection in hardEligible.
  const history = state.exposures?.length ? state.exposures : state.visualHistory.map(x => ({
    type: x.type === 'video' ? 'video' as const : 'image' as const, family: x.family,
    practices: [], terms: [], ...(x.pattern ? { pattern: x.pattern } : {}),
  }))
  const editorialMatch = (candidate: Candidate<T>) => ticket.branch === 'editorial' &&
    (!candidate.directEditorialReference || ticket.allowDirectReference) &&
    Boolean(candidate.editorialFamilies?.some(family => (referenceCounts[family] ?? 0) > 0))
  const preferences = new Map<Candidate<T>, number>()
  for (const candidate of eligible) {
    let preference = ticket.mode === 'cool' && ticket.lane !== 'any' && matchesLane(candidate, ticket.lane, now) ? 3 : 1
    if (ticket.mode === 'cool' && ticket.lane !== 'unknown' && candidate.profile.metadataQuality !== 'unverified') preference *= 1.5
    if (editorialMatch(candidate)) preference *= 3
    preferences.set(candidate, Math.min(8, preference))
  }
  const item = pickDiverse(eligible, diversityWeights(eligible, history), random, preferences)
  if (!item) return null
  const laneAvailable = eligible.some(c => matchesLane(c, ticket.lane, now))
  const laneServed = matchesLane(item, ticket.lane, now)
  const editorialServed = editorialMatch(item)
  const reasons = [
    ...(!laneAvailable ? ['requested-lane-unavailable'] : !laneServed ? ['requested-lane-balanced'] : []),
    ...(ticket.branch === 'editorial' && !editorialServed ? [eligible.some(editorialMatch)
      ? 'editorial-diversity-relaxed' : 'editorial-match-unavailable'] : []),
  ]
  return { item, branch: editorialServed ? 'editorial' : ticket.mode === 'cool' ? 'autonomous' : 'general',
    fallback: reasons.length > 0, selection: { requestedLane: ticket.lane, servedLane: laneServed ? ticket.lane : 'any', reasons,
      candidateCount: eligible.length, familyCount: new Set(eligible.map(c => c.profile.family)).size } }

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
