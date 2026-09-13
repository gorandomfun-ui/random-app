import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { bodyOf } from '@/lib/discovery/handlers'
import { curatorOwnerId, curatorRequestAllowed, sameOrigin } from '@/lib/discovery/curatorAuth'
import { candidateFromRow } from '@/lib/discovery/catalog'
import { legacySourceSnapshot } from '@/lib/discovery/backfill'
import { buildProfile } from '@/lib/discovery/profile'
import { saveOwnerReference } from '@/lib/discovery/ownerStore'
import { enqueue } from '@/lib/discovery/exploration'
import { refreshTopLikesForItem } from '@/lib/likes/top'
import { planCurationLikeMutation } from '@/lib/discovery/curationLike'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(req: Request) {
  if (!curatorRequestAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const itemId = new URL(req.url).searchParams.get('itemId') ?? ''
  if (!/^[a-f\d]{24}$/i.test(itemId)) return json({ active: false })
  try {
    const row = await (await getDb()).collection('discovery_owner_references_v2').findOne({ ownerId: curatorOwnerId(), itemId, active: true }, { maxTimeMS: 700 })
    return json({ active: Boolean(row) })
  } catch { return json({ error: 'unavailable' }, 503) }
}
export async function POST(req: Request) {
  if (!sameOrigin(req) || !curatorRequestAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try {
    const body = await bodyOf(req)
    if (!body || typeof body.itemId !== 'string' || !/^[a-f\d]{24}$/i.test(body.itemId) || typeof body.active !== 'boolean') return json({ error: 'Invalid request' }, 400)
    const db = await getDb()
    const objectId = new ObjectId(body.itemId)
    const items = db.collection('items')
    const row = await items.findOne({ _id: objectId }, { maxTimeMS: 700 })
    if (!row || !['video', 'image'].includes(String(row.type))) return json({ error: 'Visual content required' }, 400)
    const profile = buildProfile(legacySourceSnapshot(row))
    const candidate = candidateFromRow({ ...row, discoveryVersion: 2, discoveryProfile: profile }, null, Date.now())
    if (body.active && (candidate.stock || !candidate.available || candidate.suppressed)) return json({ error: 'Ineligible reference' }, 400)

    const ownerId = curatorOwnerId()
    const existing = await db.collection('discovery_owner_references_v2').findOne(
      { ownerId, $or: [{ contentKey: candidate.key }, { itemId: body.itemId }] },
      { projection: { active: 1, publicLikeCounted: 1 }, maxTimeMS: 700 },
    )
    const syncPublicLike = body.syncPublicLike === true
    const locallyLiked = body.locallyLiked === true
    const { changed, likeDelta, publicLikeCounted } = planCurationLikeMutation({
      wasActive: Boolean(existing?.active),
      nextActive: body.active,
      syncPublicLike,
      locallyLiked,
      publicLikeCounted: existing?.publicLikeCounted as boolean | undefined,
    })

    if (syncPublicLike && changed) {
      if (likeDelta > 0) {
        await items.updateOne({ _id: objectId }, { $inc: { likeCount: 1 }, $set: { updatedAt: new Date() } })
      } else if (likeDelta < 0) {
        await items.updateOne(
          { _id: objectId },
          [{ $set: { likeCount: { $max: [0, { $subtract: [{ $ifNull: ['$likeCount', 0] }, 1] }] }, updatedAt: '$$NOW' } }],
        )
      }
      if (likeDelta !== 0) await refreshTopLikesForItem(objectId)
    }

    try {
      await saveOwnerReference(db, { ownerId, itemId: body.itemId, contentKey: candidate.key,
        active: body.active, familyId: profile.family, profile, type: row.type as 'video' | 'image', version: 2,
        publicLikeCounted, updatedAt: new Date() })
    } catch (error) {
      if (likeDelta > 0) {
        await items.updateOne(
          { _id: objectId },
          [{ $set: { likeCount: { $max: [0, { $subtract: [{ $ifNull: ['$likeCount', 0] }, 1] }] }, updatedAt: '$$NOW' } }],
        ).catch(() => undefined)
      } else if (likeDelta < 0) {
        await items.updateOne({ _id: objectId }, { $inc: { likeCount: 1 }, $set: { updatedAt: new Date() } }).catch(() => undefined)
      }
      if (likeDelta !== 0) await refreshTopLikesForItem(objectId).catch(() => undefined)
      throw error
    }
    // Only original owner likes create seeds; discovered descendants never become reference likes.
    if (body.active && row.provider === 'youtube' && typeof row.channelId === 'string') {
      await enqueue(db, { kind: 'channel', channelId: row.channelId }, 0, true).catch(() => undefined)
    }
    return json({ active: body.active, publicLikeSynced: syncPublicLike, changed })
  } catch { return json({ error: 'unavailable' }, 503) }
}
