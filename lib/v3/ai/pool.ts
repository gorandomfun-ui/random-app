/**
 * The pool of the likes' look-alikes: the videos of the stock marked with the
 * like they resemble (`v3.lookalike {like, score}`), whichever way they came —
 * found by the look-alikes' line (lib/v3/ingest/lines/lookalike.ts), marked
 * on entry by the fingerprints' pass (scripts/v3/vec-direct.ts), or marked
 * over the whole stock once (scripts/v3/mark-near-likes.ts). The taste card
 * draws from it once it is large enough (lib/discovery/wheel.ts): the owner
 * set the bar at 30,000 on 6 October, so the card never narrows the choice.
 */

import { ObjectId, type Db, type Document } from 'mongodb'

import { FIELD, fromRow } from './bits'
import { joinsPool, nearestLikeInScript, saysEnough } from './likeness'
import { loadLikePool } from '../cool/likePool'

/** The pool's own index: the marked videos by `rand`, for the card's random point (a partial index on the mark's presence). */
export const POOL_INDEX = 'lookalike_type_rand'
/** The look-alikes of one like, the nearest first. */
export const LIKE_INDEX = 'lookalike_like_score'
export const POOL_FILTER: Document = { type: 'video', 'v3.lookalike.like': { $exists: true } }

export type ModelLike = { id: string; title: string; bits: Uint8Array }

/** The likes that serve as models: printed, and with a title the model can read something in (lib/v3/ai/likeness.ts, saysEnough). */
export async function modelLikes(db: Db, now = Date.now()): Promise<ModelLike[]> {
  const pool = await loadLikePool(db, now)
  const ids = pool.likeIds.filter((id) => ObjectId.isValid(id)).slice(0, 400).map((id) => new ObjectId(id))
  if (!ids.length) return []
  const rows = await db.collection('items').find({ _id: { $in: ids }, type: 'video', [FIELD]: { $exists: true } } as Document, { projection: { title: 1, [FIELD]: 1 }, maxTimeMS: 4000 }).toArray()
  return rows.flatMap((row) => {
    const bits = fromRow(row[FIELD])
    const title = String(row.title ?? '')
    return bits && saysEnough(title) ? [{ id: String(row._id), title, bits }] : []
  })
}

/** The mark a video of the stock gets, or none: the nearest model like written in its script, when near enough and not a copy. */
export function poolMark(bits: Uint8Array, title: string, likes: readonly ModelLike[]): { like: string; score: number } | null {
  const nearest = nearestLikeInScript(bits, title, likes)
  return joinsPool(nearest) ? { like: likes[nearest.index].id, score: Math.round(nearest.score * 1000) / 1000 } : null
}

/** Builds the pool's two indexes when they are missing (small: a partial index holds only the marked videos). */
export async function ensurePoolIndexes(db: Db): Promise<void> {
  const items = db.collection('items')
  const partialFilterExpression = { 'v3.lookalike.like': { $exists: true } }
  await items.createIndex({ type: 1, rand: 1 }, { name: POOL_INDEX, partialFilterExpression })
  await items.createIndex({ 'v3.lookalike.like': 1, 'v3.lookalike.score': -1 }, { name: LIKE_INDEX, partialFilterExpression })
}

/** How many videos the pool holds (the suppressed ones included: a few dozen, counted once an hour). */
export async function poolSize(db: Db, maxTimeMS = 4000): Promise<number> {
  return db.collection('items').countDocuments(POOL_FILTER, { hint: POOL_INDEX, maxTimeMS })
}
