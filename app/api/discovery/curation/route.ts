import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { bodyOf } from '@/lib/discovery/handlers'
import { curatorRequestAllowed, sameOrigin } from '@/lib/discovery/curatorAuth'
import { candidateFromRow } from '@/lib/discovery/catalog'
import { legacySourceSnapshot } from '@/lib/discovery/backfill'
import { buildProfile } from '@/lib/discovery/profile'
import { saveOwnerReference } from '@/lib/discovery/ownerStore'
import { enqueue } from '@/lib/discovery/exploration'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(req: Request) {
  if (!curatorRequestAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const itemId = new URL(req.url).searchParams.get('itemId') ?? ''
  if (!/^[a-f\d]{24}$/i.test(itemId)) return json({ active: false })
  try {
    const row = await (await getDb()).collection('discovery_owner_references_v2').findOne({ ownerId: process.env.RANDOM_EDITOR_OWNER_ID, itemId, active: true }, { maxTimeMS: 700 })
    return json({ active: Boolean(row) })
  } catch { return json({ error: 'unavailable' }, 503) }
}
export async function POST(req: Request) {
  if (!sameOrigin(req) || !curatorRequestAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try {
    const body = await bodyOf(req)
    if (!body || typeof body.itemId !== 'string' || !/^[a-f\d]{24}$/i.test(body.itemId) || typeof body.active !== 'boolean') return json({ error: 'Invalid request' }, 400)
    const db = await getDb(), row = await db.collection('items').findOne({ _id: new ObjectId(body.itemId) }, { maxTimeMS: 700 })
    if (!row || !['video', 'image'].includes(String(row.type))) return json({ error: 'Visual content required' }, 400)
    const profile = buildProfile(legacySourceSnapshot(row))
    const candidate = candidateFromRow({ ...row, discoveryVersion: 2, discoveryProfile: profile }, null, Date.now())
    if (body.active && (candidate.stock || !candidate.available || candidate.suppressed)) return json({ error: 'Ineligible reference' }, 400)
    await saveOwnerReference(db, { ownerId: process.env.RANDOM_EDITOR_OWNER_ID!, itemId: body.itemId, contentKey: candidate.key,
      active: body.active, familyId: profile.family, profile, type: row.type as 'video' | 'image', version: 2, updatedAt: new Date() })
    // Only original owner likes create seeds; discovered descendants never become reference likes.
    if (body.active && row.provider === 'youtube' && typeof row.channelId === 'string') {
      await enqueue(db, { kind: 'channel', channelId: row.channelId }, 0, true).catch(() => undefined)
    }
    return json({ active: body.active })
  } catch { return json({ error: 'unavailable' }, 503) }
}
