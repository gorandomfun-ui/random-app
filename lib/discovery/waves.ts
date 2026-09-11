import type { Candidate, Profile } from './types'

export type Relation = { score: number; reasons: string[] }
function shared(a: string[], b: string[]): string[] { const set = new Set(b); return a.filter(x => set.has(x)) }
function overlap(a: string[], b: string[]): number {
  return a.length && b.length ? shared(a, b).length / Math.max(1, Math.min(a.length, b.length)) : 0
}
/** No embeddings/service implied. All available weights are normalised to 1. */
export function relation(anchor: Profile, candidate: Profile): Relation | null {
  if (anchor.version !== 2 || candidate.version !== 2) return null
  const entities = shared(anchor.entities, candidate.entities)
  const practices = shared(anchor.practices, candidate.practices)
  const tokens = shared(anchor.tokens, candidate.tokens)
  // A broad theme, era, colour, provider, public like or editorial like cannot open the gate.
  if (!entities.length && !practices.length && tokens.length < 2) return null
  const subject = Math.max(entities.length ? 1 : 0, Math.min(1, tokens.length / 3))
  const practice = overlap(anchor.practices, candidate.practices)
  const context = overlap(anchor.themes, candidate.themes)
  const score = (.5 * subject + .25 * practice + .1 * context) / .85
  if (score < .3) return null
  return { score, reasons: [...entities.map(x => `entity:${x}`), ...practices.map(x => `practice:${x}`),
    ...tokens.slice(0, 4).map(x => `term:${x}`)] }
}
export function duplicates(a: Candidate, b: Candidate): boolean {
  return a.key === b.key || Boolean(a.duplicateKey && a.duplicateKey === b.duplicateKey) ||
    Boolean(a.seriesKey && a.seriesKey === b.seriesKey)
}
function redundancy(a: Candidate, b: Candidate): number {
  return Math.min(1, .65 * overlap(a.profile.tokens, b.profile.tokens) +
    .2 * overlap(a.profile.practices, b.profile.practices) + .15 * Number(Boolean(a.authorKey && a.authorKey === b.authorKey)))
}
function validSet(items: Candidate[]): boolean {
  if (items.filter(x => x.type === 'image').length > 2 || items.filter(x => x.quiz).length > 1) return false
  return !items.some((x, i) => items.slice(0, i).some(y => duplicates(x, y)))
}
export type WavePlan<T> = { ready: true; anchorKey: string; trio: Candidate<T>[]; reserves: Candidate<T>[];
  relations: Record<string, Relation> } | { ready: false; anchorKey: string; reason: 'insufficient-related-content' }

/** Bounded feasibility search. `prefix` contains successfully displayed Wave items, never failed media. */
export function composeWave<T>(anchor: Candidate<T>, candidates: Candidate<T>[],
  options: { prefix?: Candidate<T>[]; excluded?: Set<string> } = {}): WavePlan<T> {
  const prefix = options.prefix ?? [], excluded = options.excluded ?? new Set<string>()
  const empty = { ready: false as const, anchorKey: anchor.key, reason: 'insufficient-related-content' as const }
  if (prefix.length > 3 || !validSet(prefix) || prefix.some(x => duplicates(anchor, x) || !relation(anchor.profile, x.profile))) return empty
  const ranks = new Map<string, Relation>()
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  const ranked = candidates.filter(x => x.available && !x.suppressed && !excluded.has(x.key) && !duplicates(anchor, x))
    .filter(x => { const rel = relation(anchor.profile, x.profile); if (!rel) return false; ranks.set(x.key, rel); return true })
    .sort((a, b) => ranks.get(b.key)!.score - ranks.get(a.key)!.score || a.key.localeCompare(b.key))
    .filter(x => {
      if (seen.has(x.key) || prefix.some(p => duplicates(p, x))) return false
      seen.add(x.key)
      const n = counts.get(x.type) ?? 0
      if (n >= (x.type === 'video' ? 16 : 8)) return false
      counts.set(x.type, n + 1); return true
    }).slice(0, 48)
  const needed = 3 - prefix.length
  if (ranked.length < needed) return empty
  let best: Candidate<T>[] | null = null, bestPriority = -1, bestScore = -Infinity
  const visit = (chosen: Candidate<T>[], start: number): void => {
    const all = [...prefix, ...chosen]
    if (!validSet(all)) return
    if (chosen.length === needed) {
      const priority = 2 * Number(all.some(x => x.type === 'video')) + Number(new Set(all.map(x => x.type)).size >= 2)
      const sum = all.reduce((v, x) => v + (ranks.get(x.key) ?? relation(anchor.profile, x.profile))!.score, 0) / 3
      const red = (redundancy(all[0], all[1]) + redundancy(all[0], all[2]) + redundancy(all[1], all[2])) / 3
      const score = .8 * sum - .2 * red
      if (priority > bestPriority || priority === bestPriority && score > bestScore) {
        bestPriority = priority; bestScore = score; best = all
      }
      return
    }
    for (let i = start; i <= ranked.length - (needed - chosen.length); i++) visit([...chosen, ranked[i]], i + 1)
  }
  visit([], 0)
  if (!best) return empty
  const trio: Candidate<T>[] = best
  const reserves = ranked.filter(x => !trio.some(y => duplicates(x, y))).slice(0, 7)
  for (const x of prefix) ranks.set(x.key, relation(anchor.profile, x.profile)!)
  return { ready: true, anchorKey: anchor.key, trio, reserves,
    relations: Object.fromEntries([...trio, ...reserves].map(x => [x.key, ranks.get(x.key)!])) }
}

/** Client-side state: reserves never replace an item by a blind queue.shift(). */
export class WaveSession<T> {
  private shown: Candidate<T>[] = []
  private excluded = new Set<string>()
  constructor(readonly anchor: Candidate<T>, readonly candidates: Candidate<T>[]) {}
  next(): Candidate<T> | null {
    if (this.shown.length >= 3) return null
    const plan = composeWave(this.anchor, this.candidates, { prefix: this.shown, excluded: this.excluded })
    return plan.ready ? plan.trio[this.shown.length] : null
  }
  failed(key: string): void { this.excluded.add(key) }
  displayed(key: string): void {
    const next = this.next()
    if (!next || next.key !== key) throw new Error('Wave display does not match the current plan')
    this.shown.push(next)
  }
  /** A player can report failure just after display; replace that slot without consuming a fourth item. */
  revokeLast(key: string): void {
    if (this.shown.at(-1)?.key === key) this.shown.pop()
    this.excluded.add(key)
  }
  get displayedCount(): number { return this.shown.length }
}
