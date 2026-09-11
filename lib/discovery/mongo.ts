import { ObjectId, type Db, type Document, type Filter } from 'mongodb'
import { candidateFromRow, type CatalogueRow } from './catalog'
import { shuffled, type Rng } from './random'
import { pickPool, type Intent, type Session } from './pool'
import { composeWave } from './waves'
import { applyOwnerReferences } from './ownerStore'
import type { Candidate, Format } from './types'

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
async function ringSample(db: Db, match: Filter<Document>, limit: number, point: number): Promise<CatalogueRow[]> {
  const collection = db.collection('items')
  const first = await collection.find({ $and: [match, { rand: { $gte: point } }] })
    .sort({ rand: 1 }).limit(limit).maxTimeMS(700).toArray()
  if (first.length === limit) return first
  const second = await collection.find({ $and: [match, { rand: { $lt: point } }] })
    .sort({ rand: 1 }).limit(limit - first.length).maxTimeMS(700).toArray()
  return [...first, ...second]
}
function decodeRows<T>(rows: CatalogueRow[], decode: Decoder<T>, now: number): Candidate<T>[] {
  return rows.flatMap(row => { const payload = decode(row); return payload == null ? [] : [candidateFromRow(row, payload, now)] })
}
/** Independent of legacy strongPool, showWeight, likeCount and public feedback collections. */
export async function loadPoolCandidates<T>(db: Db, ticket: Intent, lang: string, decode: Decoder<T>, random: Rng, now: number, factVariant?: 'quiz' | 'text'): Promise<Candidate<T>[]> {
  if (ticket.type !== 'video' && ticket.type !== 'image') {
    const match = { $and: [base(ticket.type, lang, now), ...(ticket.type === 'fact' && factVariant ? [factVariant === 'quiz' ? { variant: 'quiz' } : { variant: { $ne: 'quiz' } }] : [])] }
    return decodeRows(await ringSample(db, match, 24, random()), decode, now)
  }
  if (ticket.branch === 'autonomous' && (ticket.lane === 'trend' || ticket.lane === 'unknown')) {
    const lane = ticket.lane === 'trend'
      ? { trendObservedAt: { $gte: new Date(now - 7 * 86400000), $lte: new Date(now) } }
      : { $or: [{ 'discoveryProfile.evidence': 'unknown' }, { discoveryVersion: { $exists: false } }] }
    try {
      const rows = await ringSample(db, { $and: [base(ticket.type, lang, now), lane, { provider: { $nin: ['pexels', 'pixabay'] } }] }, 60, random())
      const preferred = decodeRows(rows, decode, now)
      if (preferred.length) return preferred
    } catch { /* Bounded fallback to the general family sample. */ }
  }
  // Equal sampling budget per family prevents a huge gaming family from crowding out others.
  // At most 13 x 12 documents; empty families cost one bounded indexed wraparound query.
  const results = await Promise.allSettled(shuffled(FAMILIES, random).map(async family => {
    const match: Filter<Document> = { $and: [base(ticket.type, lang, now),
      family === 'unknown' ? { $or: [{ discoveryFamily: 'unknown' }, { discoveryFamily: { $exists: false } }] } : { discoveryFamily: family },
      ...(!ticket.allowStock ? [{ provider: { $nin: ['pexels', 'pixabay'] } }] : []),
    ] }
    return ringSample(db, match, 12, random())
  }))
  return decodeRows(results.flatMap(r => r.status === 'fulfilled' ? r.value : []), decode, now)
}
export async function selectPool<T>(db: Db, ticket: Intent, state: Session, lang: string, decode: Decoder<T>, random: Rng, now: number, factVariant?: 'quiz' | 'text', ownerId = '') {
  const retrievalTicket = ticket.branch === 'editorial' && !ownerId ? { ...ticket, branch: 'autonomous' as const } : ticket
  const candidates = await loadPoolCandidates(db, retrievalTicket, lang, decode, random, now, factVariant)
  if (ticket.branch === 'editorial' && ownerId) {
    try {
      const assigned = await applyOwnerReferences(db, candidates, ownerId)
      return pickPool(assigned.candidates, ticket, state, random, now, assigned.referenceCounts)
    } catch { /* Owner tooling must not stop autonomous discovery. */ }
  }
  return pickPool(candidates, ticket, state, random, now)
}
export async function loadWave<T>(db: Db, anchorId: string, lang: string, allowed: Format[], decode: Decoder<T>, random: Rng, now: number, excluded: string[] = []) {
  if (!ObjectId.isValid(anchorId)) return null
  const row = await db.collection('items').findOne({ _id: new ObjectId(anchorId) }, { maxTimeMS: 700 })
  if (!row) return null
  const payload = decode(row)
  if (payload == null) return null
  const anchor = candidateFromRow(row, payload, now), p = anchor.profile
  const terms = [
    ...(p.tokens.length ? [{ 'discoveryProfile.tokens': { $in: p.tokens.slice(0, 24) } }] : []),
    ...(p.practices.length ? [{ 'discoveryProfile.practices': { $in: p.practices } }] : []),
    ...(p.entities.length ? [{ 'discoveryProfile.entities': { $in: p.entities } }] : []),
  ]
  if (!anchor.available || anchor.suppressed || !terms.length) return null
  const caps: Record<Format, number> = { video: 60, image: 40, web: 20, quote: 20, joke: 20, fact: 20 }
  const results = await Promise.allSettled(TYPES.filter(t => allowed.includes(t)).map(type => ringSample(db,
    { $and: [base(type, lang, now), { discoveryVersion: 2 }, { $or: terms }] }, caps[type], random())))
  const candidates = decodeRows(results.flatMap(r => r.status === 'fulfilled' ? r.value : []), decode, now)
  const plan = composeWave(anchor, candidates, { excluded: new Set(excluded) })
  return { anchor, plan }
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
}
