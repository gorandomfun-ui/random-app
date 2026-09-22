import { createHash } from 'node:crypto'

import type { Collection, Db } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'

/**
 * Bounded public endpoints.
 *
 * Two collections, both emptied by a TTL index so nothing accumulates:
 *   - `rate_limits_v3`   : one counter per (ip, route, time window)
 *   - `feedback_effects_v3` : one marker per (scope, ip), used both to count
 *     the distinct IPs that reported the same item and to apply the effect of
 *     an IP on an item only once per 24 h.
 *
 * IP addresses are never stored: only a salted hash.
 */

export const RATE_LIMIT_COLLECTION = 'rate_limits_v3'
export const FEEDBACK_EFFECT_COLLECTION = 'feedback_effects_v3'

export const EFFECT_WINDOW_MS = 24 * 60 * 60 * 1000

type RateLimitDocument = {
  _id: string
  count: number
  expiresAt: Date
}

type FeedbackEffectDocument = {
  _id: string
  scope: string
  expiresAt: Date
}

export type RateLimitDecision = {
  allowed: boolean
  count: number
  limit: number
}

function salt(): string {
  return process.env.RANDOM_RATE_LIMIT_SALT || process.env.RANDOM_CURATOR_SECRET || 'random-v3-rate-limit'
}

function hash(value: string): string {
  return createHash('sha256').update(`${salt()}:${value}`).digest('hex').slice(0, 32)
}

/** Best-effort client address; unknown clients share the `unknown` bucket. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  if (first) return first
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return 'unknown'
}

let indexesReady: Promise<void> | null = null

async function ensureIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      await db
        .collection(RATE_LIMIT_COLLECTION)
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' })
      const effects = db.collection(FEEDBACK_EFFECT_COLLECTION)
      await effects.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' })
      await effects.createIndex({ scope: 1 }, { name: 'scope' })
    })().catch((error) => {
      indexesReady = null
      throw error
    })
  }
  await indexesReady
}

/**
 * Counts one hit for this IP on this route and says whether it stays under the
 * limit. Windows are fixed slices of `windowMs`, so the key carries the slice.
 */
export async function consumeRateLimit(options: {
  req: Request
  route: string
  limit: number
  windowMs: number
  now?: number
  /** `global`: one counter for everyone, for calls to a provider that has its own limit. */
  scope?: 'ip' | 'global'
}): Promise<RateLimitDecision> {
  const { req, route, limit, windowMs } = options
  const now = options.now ?? Date.now()
  const window = Math.floor(now / windowMs)
  const key = hash(`${options.scope === 'global' ? 'global' : clientIp(req)}|${route}|${window}`)

  try {
    const db = await getDatabase()
    await ensureIndexes(db)
    const collection: Collection<RateLimitDocument> = db.collection(RATE_LIMIT_COLLECTION)
    const updated = await collection.findOneAndUpdate(
      { _id: key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((window + 1) * windowMs) },
      },
      { upsert: true, returnDocument: 'after' },
    )
    const count = updated?.count ?? 1
    return { allowed: count <= limit, count, limit }
  } catch (error) {
    // The endpoint needs the database anyway; staying open here keeps a
    // transient database problem from turning into a silent outage.
    console.error('[v3/rateLimit] counter unavailable, allowing request', error)
    return { allowed: true, count: 0, limit }
  }
}

export type EffectRegistration = {
  /** True the first time this IP acts on this scope within the window. */
  first: boolean
  /** Number of distinct IPs that acted on this scope within the window. */
  distinctIps: number
}

/**
 * Registers the effect of one IP on one scope (typically `action:itemId`).
 * Returns whether it is the first one within the window, and how many
 * distinct IPs are currently registered on that scope.
 */
export async function registerFeedbackEffect(options: {
  req: Request
  scope: string
  windowMs?: number
  now?: number
}): Promise<EffectRegistration> {
  const { req, scope } = options
  const windowMs = options.windowMs ?? EFFECT_WINDOW_MS
  const now = options.now ?? Date.now()
  const key = hash(`${scope}|${clientIp(req)}`)

  const db = await getDatabase()
  await ensureIndexes(db)
  const collection: Collection<FeedbackEffectDocument> = db.collection(FEEDBACK_EFFECT_COLLECTION)
  const result = await collection.updateOne(
    { _id: key },
    { $setOnInsert: { scope, expiresAt: new Date(now + windowMs) } },
    { upsert: true },
  )
  const distinctIps = await collection.countDocuments({ scope })
  return { first: result.upsertedCount > 0, distinctIps }
}

/** Releases the marker of this IP on this scope (used when a like is undone). */
export async function releaseFeedbackEffect(options: { req: Request; scope: string }): Promise<void> {
  const key = hash(`${options.scope}|${clientIp(options.req)}`)
  const db = await getDatabase()
  const collection: Collection<FeedbackEffectDocument> = db.collection(FEEDBACK_EFFECT_COLLECTION)
  await collection.deleteOne({ _id: key })
}

/** Test seam: forces the next call to recreate the TTL indexes. */
export function resetRateLimitIndexCache(): void {
  indexesReady = null
}
