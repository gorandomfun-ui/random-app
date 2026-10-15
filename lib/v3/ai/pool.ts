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
import { gifText, joinsPool, nearestLikeInScript, saysEnough } from './likeness'
import { curatorOwnerId } from '../../discovery/curatorAuth'

/** The pool's own index: the marked videos by `rand`, for the card's random point (a partial index on the mark's presence). */
export const POOL_INDEX = 'lookalike_type_rand'
/** The look-alikes of one like, the nearest first. */
export const LIKE_INDEX = 'lookalike_like_score'
export const POOL_FILTER: Document = { type: 'video', 'v3.lookalike.like': { $exists: true } }

export type ModelLike = { id: string; title: string; bits: Uint8Array }

/** Likes read at most: 253 on 15 October. */
const MAX_LIKES = 2000

/**
 * The owner's liked contents, videos and GIFs, read where the curation page writes them. Not from the like pool's list
 * (lib/v3/cool/likePool.ts): its hourly job stopped on 2 October with the old lines, and until 15 October the 110 likes
 * made since were never models — never searched around, no video marked near them.
 */
export async function likedItemIds(db: Db): Promise<ObjectId[]> {
  const rows = await db.collection('discovery_owner_references_v2').find({ ownerId: curatorOwnerId(), active: true } as Document, { projection: { itemId: 1 }, limit: MAX_LIKES, maxTimeMS: 4000 }).toArray()
  const ids = new Set(rows.map((row) => row.itemId).filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id)))
  return [...ids].map((id) => new ObjectId(id))
}

/**
 * The likes that serve as models: printed, and with a title the model can read something in (lib/v3/ai/likeness.ts,
 * saysEnough). A GIF is one once the look-alikes' line has printed its title (lib/v3/ingest/lines/lookalike.ts).
 */
export async function modelLikes(db: Db): Promise<ModelLike[]> {
  const ids = await likedItemIds(db)
  if (!ids.length) return []
  const rows = await db.collection('items').find({ _id: { $in: ids }, type: { $in: ['video', 'image'] }, [FIELD]: { $exists: true } } as Document, { projection: { type: 1, title: 1, [FIELD]: 1 }, maxTimeMS: 4000 }).toArray()
  return rows.flatMap((row) => {
    const bits = fromRow(row[FIELD])
    const title = String(row.title ?? '')
    if (!bits || !saysEnough(title)) return []
    return [{ id: String(row._id), title: row.type === 'image' ? gifText(title) : title, bits }]
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
