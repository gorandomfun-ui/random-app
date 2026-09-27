/**
 * Sites waiting for their preview. The draw only serves a site with an image
 * (lib/random/web.ts); two good sites in three have no usable og:image, and a
 * web ingest on Vercel has no time to photograph them. So they wait here, and
 * the server's `web-previews` line visits each one: alive or not, parked or
 * not, its own image or a capture of the page, then into the catalogue
 * (scripts/v3/web-previews.ts). Nothing here is ever drawn.
 */

import { createHash } from 'node:crypto'

import type { Db } from 'mongodb'

export const CANDIDATES = 'web_candidates_v1'

export type CandidateStatus = 'new' | 'done' | 'dead' | 'dull' | 'noimage' | 'failed'

export type CandidateInput = {
  url: string
  /** Where it was found: 'google-cse', 'hn', 'set-aside'… — kept as the item's provider. */
  source: string
  title?: string
  text?: string
  tags?: string[]
  sourceName?: string
  sourceUrl?: string
}

export type Candidate = CandidateInput & {
  _id: string
  host: string
  status: CandidateStatus
  attempts: number
  rand: number
  createdAt: Date
  nextAt: Date
  settledAt?: Date
  outcome?: string
}

/** The same site however it was written: no scheme, no www, no trailing slash. */
export function siteKey(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) return null
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const path = parsed.pathname.replace(/\/+$/, '')
    return `${host}${path}${parsed.search}`
  } catch {
    return null
  }
}

/** The addresses an already stored item may carry for this site. */
export function storedForms(url: string): string[] {
  const key = siteKey(url)
  if (!key) return []
  const out: string[] = []
  for (const scheme of ['https://', 'http://']) {
    for (const www of ['', 'www.']) {
      out.push(`${scheme}${www}${key}`)
      if (!key.includes('?')) out.push(`${scheme}${www}${key}/`)
    }
  }
  return out
}

export function previewObjectName(url: string): string {
  return `previews/${createHash('sha1').update(siteKey(url) ?? url).digest('hex')}.jpg`
}

let indexed = false
async function ensureIndexes(db: Db): Promise<void> {
  if (indexed) return
  await db.collection(CANDIDATES).createIndex({ status: 1, rand: 1 })
  indexed = true
}

/**
 * Adds the sites not already in the catalogue nor already waiting. Returns how
 * many were new to the list. One lookup per batch on the (type, url) index.
 */
export async function enqueueSites(db: Db, rows: CandidateInput[]): Promise<{ queued: number; known: number }> {
  const unique = new Map<string, CandidateInput>()
  for (const row of rows) {
    const key = siteKey(row.url)
    if (key && !unique.has(key)) unique.set(key, row)
  }
  if (!unique.size) return { queued: 0, known: 0 }
  await ensureIndexes(db)
  const forms = [...unique.values()].flatMap((row) => storedForms(row.url))
  const stored = new Set<string>()
  for (let start = 0; start < forms.length; start += 800) {
    const docs = await db.collection('items').find({ type: 'web', url: { $in: forms.slice(start, start + 800) } }, { projection: { url: 1 } }).toArray()
    for (const doc of docs) {
      const key = siteKey(String(doc.url))
      if (key) stored.add(key)
    }
  }
  const now = new Date()
  const fresh = [...unique].filter(([key]) => !stored.has(key))
  if (!fresh.length) return { queued: 0, known: unique.size }
  const result = await db.collection<Candidate>(CANDIDATES).bulkWrite(fresh.map(([key, row]) => ({
    updateOne: {
      filter: { _id: key },
      update: {
        $setOnInsert: {
          ...row,
          _id: key,
          host: key.split('/')[0],
          status: 'new' as CandidateStatus,
          attempts: 0,
          rand: Math.random(),
          createdAt: now,
          nextAt: now,
        },
      },
      upsert: true,
    },
  })), { ordered: false })
  return { queued: result.upsertedCount || 0, known: unique.size - (result.upsertedCount || 0) }
}

/** A handful of sites to visit, in random order across sources. */
export async function takeCandidates(db: Db, size: number, now = new Date()): Promise<Candidate[]> {
  await ensureIndexes(db)
  const start = Math.random()
  const filter = { status: 'new' as CandidateStatus, nextAt: { $lte: now } }
  const first = await db.collection<Candidate>(CANDIDATES).find({ ...filter, rand: { $gte: start } }).sort({ rand: 1 }).limit(size).toArray()
  if (first.length >= size) return first
  const rest = await db.collection<Candidate>(CANDIDATES).find({ ...filter, rand: { $lt: start } }).sort({ rand: 1 }).limit(size - first.length).toArray()
  return [...first, ...rest]
}

/** A failed visit is tried again three days later, twice at most: a small host is sometimes just down. */
export const RETRY_DAYS = 3
export const MAX_ATTEMPTS = 2

export async function settleCandidate(db: Db, candidate: Candidate, status: CandidateStatus, outcome: string, now = new Date()): Promise<void> {
  const attempts = candidate.attempts + 1
  const retry = (status === 'dead' || status === 'failed') && attempts < MAX_ATTEMPTS
  await db.collection<Candidate>(CANDIDATES).updateOne({ _id: candidate._id }, {
    $set: retry
      ? { attempts, nextAt: new Date(now.getTime() + RETRY_DAYS * 86_400_000), outcome }
      : { attempts, status, outcome, settledAt: now },
  })
}

/** A visit that could not finish for want of something on our side (the captures bucket): tried again tomorrow, no attempt spent. */
export async function deferCandidate(db: Db, candidate: Candidate, outcome: string, now = new Date()): Promise<void> {
  await db.collection<Candidate>(CANDIDATES).updateOne({ _id: candidate._id }, { $set: { nextAt: new Date(now.getTime() + 86_400_000), outcome } })
}

export async function candidateCounts(db: Db): Promise<Record<CandidateStatus, number>> {
  const counts = { new: 0, done: 0, dead: 0, dull: 0, noimage: 0, failed: 0 } as Record<CandidateStatus, number>
  for (const row of await db.collection(CANDIDATES).aggregate<{ _id: CandidateStatus; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray()) {
    counts[row._id] = row.n
  }
  return counts
}
