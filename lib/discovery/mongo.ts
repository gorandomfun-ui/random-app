import { ObjectId, type Db, type Document, type Filter } from 'mongodb'
import { candidateFromRow, type CatalogueRow } from './catalog'
import { shuffled, type Rng } from './random'
import { pickPool, type Intent, type Session } from './pool'
import { composeWave, relation, type WavePlan } from './waves'
import { loadOwnerReferences } from './ownerStore'
import { assignEditorial, type OwnerReference } from './editorial'
import { retrieveRelatedRows } from './retrieval'
import type { Candidate, Format } from './types'
import { randomWindow, sampleCatalogue, sampleWindow, type PoolRetrievalReport } from './sampling'

const FAMILIES = ['music', 'sport', 'craft', 'food', 'art', 'advertising', 'cinema', 'science', 'gaming', 'technology', 'travel', 'everyday', 'unknown']
const TYPES: Format[] = ['video', 'image', 'web', 'quote', 'joke', 'fact']
type Decoder<T> = (row: CatalogueRow) => T | null
function base(type: Format, lang: string, now: number): Filter<Document> {
  const visual = type === 'video' || type === 'image'
  return { type, isSuppressed: { $ne: true }, ...(type === 'video' ? {
    obsoleteVideoStatus: { $ne: 'obsolete' },
    $or: [{ obsoleteVideoRuntimeBlockedUntil: { $exists: false } }, { obsoleteVideoRuntimeBlockedUntil: null }, { obsoleteVideoRuntimeBlockedUntil: { $lte: new Date(now) } }],
  } : {}), ...(!visual && type !== 'web' ? { $or: [
    { languageScope: { $exists: false } },
    { languageScope: null },
    { languageScope: 'universal' },
    { languageScope: 'localized', lang: { $in: [lang, ...(lang === 'jp' ? ['ja'] : [])] } },
  ] } : {}) }
}
async function ringSample(db: Db, match: Filter<Document>, limit: number, point: number, maxTimeMS = 700): Promise<CatalogueRow[]> {
  const collection = db.collection('items')
  const first = await collection.find({ $and: [match, { rand: { $gte: point } }] }, { timeoutMS: maxTimeMS + 150 })
    .sort({ rand: 1 }).limit(limit).maxTimeMS(maxTimeMS).toArray()
  if (first.length === limit) return first
  const second = await collection.find({ $and: [match, { rand: { $lt: point } }] }, { timeoutMS: maxTimeMS + 150 })
    .sort({ rand: 1 }).limit(limit - first.length).maxTimeMS(maxTimeMS).toArray()
  return [...first, ...second]
}
function decodeRows<T>(rows: CatalogueRow[], decode: Decoder<T>, now: number): Candidate<T>[] {
  return rows.flatMap(row => { const payload = decode(row); return payload == null ? [] : [candidateFromRow(row, payload, now)] })
}
/** A fresh broad catalogue sample is the backbone of EVERY visual draw.
 * Focused additions can enrich it, but only inside a rotating random window. */
export async function loadPoolCandidates<T>(db: Db, ticket: Intent, lang: string, decode: Decoder<T>, random: Rng, now: number, factVariant?: 'quiz' | 'text', window = randomWindow(random), report?: PoolRetrievalReport): Promise<Candidate<T>[]> {
  const decodePoolRows = (rows: CatalogueRow[]) => decodeRows(rows, decode, now)
    .filter(candidate => candidate.available && !candidate.suppressed && (!candidate.stock || ticket.allowStock) &&
      !(ticket.mode === 'cool' && candidate.routineEditorial))
  if (ticket.type !== 'video' && ticket.type !== 'image') {
    const match = { $and: [base(ticket.type, lang, now), ...(ticket.type === 'fact' && factVariant ? [factVariant === 'quiz' ? { variant: 'quiz' } : { variant: { $ne: 'quiz' } }] : [])] }
    return decodePoolRows(await ringSample(db, match, 24, random()))
  }
  const common: Filter<Document> = { $and: [base(ticket.type, lang, now),
    ...(!ticket.allowStock ? [{ provider: { $nin: ['pexels', 'pixabay'] } }] : []),
  ] }
  const broadPromise = sampleCatalogue(db, common).catch(() => { if (report) report.queryFailures++; return [] as CatalogueRow[] })
  // Four rotating families, never a guaranteed allocation to all 13 families.
  // Each extra lookup stays within the SAME random window, even when empty.
  const focused = shuffled(FAMILIES, random).slice(0, 4).map(family => sampleWindow(db, {
    $and: [common, family === 'unknown'
      ? { $or: [{ discoveryFamily: 'unknown' }, { discoveryFamily: { $exists: false } }] }
      : { discoveryFamily: family }],
  }, window, 8))
  if (ticket.mode === 'cool' && ['trend', 'recent', 'unknown'].includes(ticket.lane)) {
    const lane = ticket.lane === 'trend'
      ? { trendObservedAt: { $gte: new Date(now - 7 * 86400000), $lte: new Date(now) } }
      : ticket.lane === 'recent'
        ? { publishedAt: { $type: 'date', $gte: new Date(now - 90 * 86400000), $lte: new Date(now) } }
        : { $or: [{ 'discoveryProfile.evidence': 'unknown' }, { discoveryVersion: { $exists: false } }] }
    focused.push(sampleWindow(db, { $and: [common, lane] }, window, 24))
  }
  const [broad, additions] = await Promise.all([broadPromise, Promise.allSettled(focused)])
  let general = decodePoolRows(broad)
  if (report) report.queryFailures += additions.filter(result => result.status === 'rejected').length
  if (!general.length) {
    if (report) report.broadFallback = true
    // One bounded same-format fallback for rare types, small catalogues or an
    // unavailable random cursor. Never serve a tiny focus pool alone on failure.
    general = decodePoolRows(await ringSample(db, common, 96, random()).catch(() => { if (report) report.queryFailures++; return [] }))
    if (!general.length) return []
  }
  const extra = decodePoolRows(additions.flatMap(result => result.status === 'fulfilled' ? result.value : []))
  if (report) { report.broadCandidates = general.length; report.focusedCandidates += extra.length }
  return [...new Map([...general, ...extra].map(candidate => [candidate.key, candidate])).values()]
}
export async function selectPool<T>(db: Db, ticket: Intent, state: Session, lang: string, decode: Decoder<T>, random: Rng, now: number, factVariant?: 'quiz' | 'text', ownerId = '') {
  const started = Date.now()
  const report: PoolRetrievalReport = { broadCandidates: 0, focusedCandidates: 0, queryFailures: 0, broadFallback: false, elapsedMs: 0 }
  const window = randomWindow(random)
  const retrievalTicket = ticket.branch === 'editorial' && !ownerId ? { ...ticket, branch: 'autonomous' as const } : ticket
  const generalPromise = loadPoolCandidates(db, retrievalTicket, lang, decode, random, now, factVariant, window, report).catch(() => [] as Candidate<T>[])
  let references: OwnerReference[] = []
  let directed: Candidate<T>[] = []
  if (ticket.branch === 'editorial' && ownerId && (ticket.type === 'video' || ticket.type === 'image')) {
    try {
      references = await loadOwnerReferences(db, ownerId, random)
      const seeds = shuffled(references.filter(r => r.profile.metadataQuality !== 'unverified'), random)
      const uniqueSubjects = new Set<string>()
      const selected = seeds.filter(r => {
        const key = r.profile.subject?.primary?.key ?? r.profile.titlePractices?.[0]
        if (!key || uniqueSubjects.has(key)) return false
        uniqueSubjects.add(key); return true
      }).slice(0, 2)
      const results = await Promise.allSettled(selected.map(r => retrieveRelatedRows(db, r.profile,
        { [ticket.type]: { $and: [base(ticket.type, lang, now), window] } }, random, { maxMs: 700, maxRows: 16 })))
      report.queryFailures += results.reduce((sum, result) => sum + (result.status === 'fulfilled' ? result.value.diagnostics.queryFailures : 1), 0)
      directed = decodeRows(results.flatMap(result => result.status === 'fulfilled' ? result.value.rows : []), decode, now)
    } catch { report.queryFailures++ /* General candidates remain usable if owner retrieval is temporarily unavailable. */ }
  }
  const general = await generalPromise
  if (!general.length) return null
  const candidates = [...new Map([...general, ...directed].map(c => [c.key, c])).values()]
  const assigned = ownerId && references.length ? assignEditorial(candidates, references, ownerId) : { candidates, referenceCounts: {} }
  const choice = pickPool(assigned.candidates, ticket, state, random, now, assigned.referenceCounts)
  report.focusedCandidates += directed.length
  report.elapsedMs = Date.now() - started
  return choice ? { ...choice, selection: { ...choice.selection!, retrieval: report } } : null
}
export async function loadWave<T>(db: Db, anchorId: string, lang: string, allowed: Format[], decode: Decoder<T>, random: Rng, now: number, excluded: string[] = [],
  audit?: (rows: CatalogueRow[]) => void) {
  if (!ObjectId.isValid(anchorId)) return null
  const row = await db.collection('items').findOne({ _id: new ObjectId(anchorId) }, { maxTimeMS: 500, timeoutMS: 800 })
  if (!row) return null
  const payload = decode(row)
  if (payload == null) return null
  const anchor = candidateFromRow(row, payload, now), p = anchor.profile
  if (p.metadataQuality === 'unverified') return { anchor, plan: composeWave(anchor, []), diagnostics: {
    subjectKey: null, sampled: 0, perType: Object.fromEntries(TYPES.map(type => [type, 0])),
    related: 0, unverifiedMetadata: 1, queries: 0, queryFailures: 0, elapsedMs: 0, cause: 'anchor-metadata-unverified',
  } }
  if (!anchor.available || anchor.suppressed) return null
  if (!p.subject?.primary) return { anchor, plan: composeWave(anchor, []), diagnostics: {
    subjectKey: null, sampled: 0, perType: Object.fromEntries(TYPES.map(type => [type, 0])),
    related: 0, unverifiedMetadata: 0, queries: 0, queryFailures: 0, elapsedMs: 0, cause: 'subject-unresolved',
  } }
  let candidates: Candidate<T>[] = []
  let plan: WavePlan<T> = composeWave<T>(anchor, [], { excluded: new Set(excluded) })
  const filters = Object.fromEntries(allowed.map(type => [type, { $and: [base(type, lang, now),
    { _id: { $ne: row._id } }] }]))
  const retrieval = await retrieveRelatedRows(db, p, filters, random, { satisfied: rows => {
    candidates = decodeRows(rows, decode, now)
    plan = composeWave(anchor, candidates, { excluded: new Set(excluded) })
    return plan.ready
  } })
  const diagnostics = { subjectKey: p.subject?.primary?.key ?? null,
    ...retrieval.diagnostics,
    perType: Object.fromEntries(TYPES.map(type => [type, candidates.filter(c => c.type === type).length])),
    related: candidates.filter(c => relation(p, c.profile)).length,
    unverifiedMetadata: candidates.filter(c => c.profile.metadataQuality === 'unverified').length,
    cause: plan.ready ? 'ready' : !retrieval.diagnostics.complete ? 'retrieval-incomplete'
      : !p.subject?.primary && !p.titlePractices?.length ? 'subject-unresolved' : 'insufficient-related-content',
  }
  audit?.(retrieval.rows)
  return { anchor, plan, diagnostics }
}

/** Run once in a migration, NEVER on a Random/Wave request. */
export async function installDiscoveryIndexes(db: Db): Promise<void> {
  const items = db.collection('items')
  await items.createIndex({ type: 1, discoveryFamily: 1, rand: 1 }, { name: 'discovery_family_rand_v2' })
  await items.createIndex({ type: 1, languageScope: 1, lang: 1, rand: 1 }, { name: 'discovery_lang_rand_v2' })
  await items.createIndex({ type: 1, trendObservedAt: -1, rand: 1 }, { name: 'discovery_trend_v2' })
  await items.createIndex({ type: 1, 'discoveryProfile.evidence': 1, rand: 1 }, { name: 'discovery_evidence_v2' })
  for (const field of ['tokens', 'practices', 'entities']) {
    await items.createIndex({ type: 1, discoveryVersion: 1, [`discoveryProfile.${field}`]: 1, rand: 1 }, { name: `discovery_${field}_v2` })
  }
  await items.createIndex({ editorialRoutineIngestedAt: -1 }, { name: 'video_editorial_routine_ingested_at',
    partialFilterExpression: { type: 'video', editorialRoutine: true, editorialRoutineIngestedAt: { $type: 'date' } } })
}
