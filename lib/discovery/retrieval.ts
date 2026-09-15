import type { Db, Document, Filter } from 'mongodb'
import type { CatalogueRow } from './catalog'
import type { Format, Profile } from './types'
import type { Rng } from './random'
import { subjectSearchTerms } from './subjects'
import { tokensOf } from './profile'

type Signal = { query: Filter<Document>; index: string }
export function relatedSignals(profile: Profile): Signal[] {
  if (!profile.subject?.primary || profile.metadataQuality === 'unverified') return []
  const aliases = subjectSearchTerms(profile.subject).map(words => tokensOf(words.join(' '))).filter(words => words.length)
  const signals: Signal[] = aliases.length ? aliases.map(words => ({
    query: { 'discoveryProfile.tokens': { $all: words } }, index: 'discovery_tokens_v2',
  })) : [
    ...((profile.titleTokens?.length ?? 0) ? [{ query: { 'discoveryProfile.tokens': {
      $in: profile.titleTokens!.slice(0, 8) } }, index: 'discovery_tokens_v2' }] : []),
    ...(profile.titlePractices?.length ? [{ query: { 'discoveryProfile.practices': {
      $in: profile.titlePractices } }, index: 'discovery_practices_v2' }] : []),
    ...(profile.entities.length ? [{ query: { 'discoveryProfile.entities': {
      $in: profile.entities } }, index: 'discovery_entities_v2' }] : []),
  ]
  // Sparse/older token indexes may omit stage-name punctuation or short words.
  // A distinctive subject token retrieves candidates only; exact matching still
  // checks the current source metadata in composeWave. Never search its generic practice.
  const fallbackWord = aliases.flat().filter(w => w.length >= 4).sort((a, b) => b.length - a.length)[0]
  if (fallbackWord && aliases.every(words => words.length > 1)) signals.push({
    query: { 'discoveryProfile.tokens': fallbackWord }, index: 'discovery_tokens_v2',
  })
  // Different aliases can collapse to exactly the same indexed tokens.
  return [...new Map(signals.map(signal => [JSON.stringify(signal.query), signal])).values()].slice(0, 4)
}

export type RetrievalDiagnostics = { queries: number; queryFailures: number; elapsedMs: number; complete: boolean; sampled: number }
/** Existing indexes only; driver timeout includes pool checkout/network, unlike maxTimeMS alone. */
export async function retrieveRelatedRows(db: Db, profile: Profile, filters: Partial<Record<Format, Filter<Document>>>, random: Rng,
  options: { maxMs?: number; maxRows?: number; satisfied?: (rows: CatalogueRow[]) => boolean } = {}) {
  const started = Date.now(), deadline = started + Math.min(4500, options.maxMs ?? 4500)
  const maxRows = Math.max(1, Math.min(240, options.maxRows ?? 240))
  const caps: Record<Format, number> = { video: 40, image: 24, fact: 16, web: 12, quote: 12, joke: 12 }
  const order: Format[] = ['video', 'image', 'fact', 'web', 'quote', 'joke']
  const tasks = relatedSignals(profile).flatMap(signal => order.filter(type => filters[type]).map(type => ({ signal, type })))
  const unique = new Map<string, CatalogueRow>()
  let queries = 0, queryFailures = 0, attempted = 0, enough = false
  for (let i = 0; i < tasks.length && Date.now() < deadline && unique.size < maxRows; i += 3) {
    const results = await Promise.allSettled(tasks.slice(i, i + 3).map(async ({ signal, type }) => {
      attempted++
      const point = random(), limit = Math.min(caps[type], maxRows)
      const read = async (range: Filter<Document>, count: number) => {
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new Error('retrieval-deadline')
        queries++
        return db.collection('items').find({ $and: [filters[type]!, { discoveryVersion: 2 }, signal.query, range] },
          { timeoutMS: Math.max(1, Math.min(650, remaining)) })
          .hint(signal.index).sort({ rand: 1 }).limit(count).maxTimeMS(Math.max(1, Math.min(400, remaining))).toArray()
      }
      const first = await read({ rand: { $gte: point } }, limit)
      if (first.length === limit || Date.now() >= deadline) return first
      try { return [...first, ...await read({ rand: { $lt: point } }, limit - first.length)] }
      catch { queryFailures++; return first } // Keep useful first-page candidates after a wraparound timeout.
    }))
    for (const result of results) {
      if (result.status === 'rejected') { queryFailures++; continue }
      for (const row of result.value) if (unique.size < maxRows) unique.set(String(row._id), row)
    }
    enough = Boolean(options.satisfied?.([...unique.values()]))
    if (enough) break
  }
  const rows = [...unique.values()]
  const diagnostics: RetrievalDiagnostics = { queries, queryFailures, elapsedMs: Date.now() - started,
    complete: queryFailures === 0 && (enough || attempted === tasks.length), sampled: rows.length }
  return { rows, diagnostics }
}
