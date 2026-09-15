import type { Db } from 'mongodb'
import { buildProfile } from './profile'
import { foldSubject, hasPhrase, type SubjectHint } from './subjects'
import type { SourceMetadata } from './types'
import { permalinkSubject, providerPageWords, subjectTitle } from './sourceEvidence'
import { withAbortDeadline } from './exploration'
import { entityCacheKey } from './subjectWork'

type EntityHit = { id: string; label: string; description?: string; aliases: string[] }
type Cache = { _id: string; hits: EntityHit[]; expiresAt: Date }
/** Public entity names/aliases, no paid service or artist-by-artist application dictionary.
 * Search results are candidate evidence, never accepted merely because they ranked first. */
export async function searchEntities(query: string, language: string, signal: AbortSignal,
  request: typeof fetch = fetch): Promise<EntityHit[]> {
  const params = new URLSearchParams({ action: 'wbsearchentities', search: query.slice(0, 120), language,
    uselang: 'en', type: 'item', limit: '5', format: 'json', maxlag: '5' })
  const r = await request(`https://www.wikidata.org/w/api.php?${params}`, { signal,
    headers: { 'User-Agent': 'GoRandom/1.0 (https://www.gorandom.fun; public content subject discovery)' } })
  if (!r.ok) throw new Error(`entity-http-${r.status}`)
  const body = await r.json() as { error?: unknown; search?: { id?: string; label?: string; description?: string; aliases?: string[]; match?: { text?: string } }[] }
  if (body.error || !Array.isArray(body.search)) throw new Error('entity-invalid-response')
  return body.search.slice(0, 5).flatMap(x => /^Q[1-9]\d*$/.test(x.id ?? '') && typeof x.label === 'string' ? [{
    id: x.id!, label: x.label, description: x.description,
    aliases: [...new Set([x.label, ...(x.aliases ?? []), ...(x.match?.text ? [x.match.text] : [])])].filter(a => typeof a === 'string' && a.length <= 100).slice(0, 16),
  }] : [])
}

/** Reject homonyms and incidental mentions; the query itself is not supporting evidence. */
export function resolveEntityHit(source: SourceMetadata, query: string, hits: EntityHit[]): SubjectHint | undefined {
  const profile = buildProfile(source), primary = profile.subject?.primary
  const page = providerPageWords(source).join(' ')
  const evidence = [source.legacyUnverified ? '' : source.title ?? '', permalinkSubject(source) ?? '', page]
  const normalized = foldSubject(query), compact = normalized.replaceAll(' ', '')
  const matching = hits.filter(hit => hit.aliases.some(alias => {
    const folded = foldSubject(alias)
    if (folded !== normalized && (compact.length < 6 || folded.replaceAll(' ', '') !== compact)) return false
    return evidence.some(text => hasPhrase(text, alias) || hasPhrase(text, query))
  }))
  let supported = matching
  // General domains resolve homonyms only with both source context and an explicit entity
  // description. Unknown descriptions cannot win on popularity or result order.
  const context = foldSubject(`${source.category ?? ''} ${source.title ?? ''}`)
  const domains = [
    { source: /(?:music|musique|concert|song|album|official video|official clip|歌|mv)/u, entity: /(?:singer|musician|rapper|band|music group|composer|recording artist)/iu },
    { source: /(?:gameplay|playthrough|speedrun|video game|gaming)/u, entity: /(?:video game|game series|video-game)/iu },
    { source: /(?:official trailer|bande annonce|movie trailer)/u, entity: /(?:film|movie|television series)/iu },
  ]
  if (new Set(matching.map(x => x.id)).size > 1) {
    const evidenced = matching.filter(hit => domains.some(d => d.source.test(context) && d.entity.test(hit.description ?? '')))
    if (new Set(evidenced.map(x => x.id)).size === 1) supported = evidenced
  }
  const ids = new Set(supported.map(x => x.id))
  // “Madonna” may refer to a person, painting or religious icon: ambiguity stays unresolved.
  if (ids.size !== 1) return undefined
  const found = supported[0]
  if (primary && !primary.tentative && !primary.aliases.some(a => foldSubject(a) === normalized) && primary.evidence !== 'permalink') return undefined
  return { label: found.label, aliases: [...new Set([...found.aliases, query])], kind: 'entity', entityId: found.id }
}

/** Bounded alternatives from title syntax; no query terms, uploader names or tags. */
export function sourceEntityQueries(source: SourceMetadata): string[] {
  const profile = buildProfile(source), primary = profile.subject?.primary
  const title = subjectTitle(source.title ?? '')
  const fragments = title.split(/\s+[-–—|/]\s+/u).map(x => x.trim())
  const music = /(?:music|musique|concert|mv|歌)/iu.test(`${source.category ?? ''} ${source.title ?? ''}`)
  const alternatives = fragments.length > 1 ? (music ? [...fragments].reverse() : fragments) : []
  return [...new Set([...(primary?.kind === 'entity' ? [primary.label] : []), permalinkSubject(source), ...alternatives]
    .filter((x): x is string => typeof x === 'string' && x.length >= 3 && x.length <= 100 && x.split(/\s+/u).length <= 6))].slice(0, 3)
}

export async function resolveSourceEntity(db: Db, source: SourceMetadata,
  options: { signal?: AbortSignal; request?: typeof fetch; maxMs?: number; now?: number } = {}): Promise<SubjectHint | undefined> {
  if (source.legacyUnverified) return undefined
  const profile = buildProfile(source)
  if (profile.subject?.primary?.entityId) return source.primarySubject
  const queries = sourceEntityQueries(source)
  if (!queries.length) return undefined
  const language = ['fr', 'en', 'de', 'es', 'ja', 'ko', 'ar', 'pt', 'pl', 'ru'].includes(source.language ?? '') ? source.language! : 'en'
  const now = options.now ?? Date.now(), deadline = Date.now() + Math.min(4500, options.maxMs ?? 4500)
  const cache = db.collection<Cache>('discovery_entity_cache_v1')
  for (const query of queries) {
    if (options.signal?.aborted || Date.now() > deadline - 100) break
    const key = entityCacheKey(foldSubject(query), language)
    const cached = await cache.findOne({ _id: key, expiresAt: { $gt: new Date(now) } }, { timeoutMS: 400 })
    let hits = cached?.hits
    if (!hits) {
      hits = await withAbortDeadline(Math.max(1, deadline - Date.now()), options.signal,
        signal => searchEntities(query, language, signal, options.request))
      await cache.updateOne({ _id: key }, { $set: { hits, expiresAt: new Date(now + (hits.length ? 30 : 1) * 86400000) } }, { upsert: true, maxTimeMS: 400 })
    }
    const resolved = resolveEntityHit(source, query, hits)
    if (resolved) return resolved
  }
  return undefined
}
