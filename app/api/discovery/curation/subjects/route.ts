/**
 * The subject of each like, in the owner's words.
 *
 * GET lists his active likes with the subject he confirmed and, failing that,
 * a suggestion (the primary subject the tagger read, else the channel). PUT
 * saves the subject of one like; an empty subject clears it. The dig reads
 * the confirmed subjects at every run (`lib/v3/dig/likes.ts`).
 */

import { ObjectId, type Document } from 'mongodb'

import { getDb } from '@/lib/db'
import { bodyOf } from '@/lib/discovery/handlers'
import { curatorOwnerId, curatorRequestAllowed, sameOrigin } from '@/lib/discovery/curatorAuth'
import { SUBJECTS_COLLECTION } from '@/lib/v3/subjects/build'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: Request) {
  if (!curatorRequestAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try {
    const db = await getDb()
    const refs = await db.collection('discovery_owner_references_v2')
      .find({ ownerId: curatorOwnerId(), active: true }, { projection: { itemId: 1, digSubject: 1, updatedAt: 1 }, sort: { updatedAt: -1 }, limit: 500, maxTimeMS: 2000 })
      .toArray()
    const ids = refs.map((ref) => ref.itemId).filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id))
    const rows = ids.length
      ? await db.collection('items').find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { type: 1, title: 1, text: 1, thumb: 1, thumbUrl: 1, provider: 1, channelTitle: 1, 'v3.subjects': 1 }, maxTimeMS: 3000 }).toArray()
      : []
    const byId = new Map(rows.map((row) => [String(row._id), row]))
    const subjectIds = [...new Set(rows.flatMap((row) => ((row.v3?.subjects ?? []) as Array<{ id: string; role: string }>).filter((subject) => subject.role === 'primary').map((subject) => subject.id)))]
    const labels = new Map((subjectIds.length ? await db.collection(SUBJECTS_COLLECTION).find({ _id: { $in: subjectIds } } as Document, { projection: { label: 1 }, maxTimeMS: 2000 }).toArray() : []).map((subject) => [String(subject._id), String(subject.label ?? '')]))
    const items = refs.flatMap((ref) => {
      const row = byId.get(String(ref.itemId))
      if (!row) return []
      const primary = ((row.v3?.subjects ?? []) as Array<{ id: string; role: string }>).find((subject) => subject.role === 'primary')
      const suggested = (primary && labels.get(primary.id)) || String(row.channelTitle ?? '') || ''
      return [{
        itemId: String(ref.itemId), type: row.type, title: String(row.title ?? row.text ?? ''), thumbUrl: row.thumb ?? row.thumbUrl ?? null, provider: row.provider, channelTitle: row.channelTitle ?? null,
        subject: String((ref.digSubject as { label?: string } | undefined)?.label ?? ''), suggested,
      }]
    })
    return json({ items })
  } catch { return json({ error: 'unavailable' }, 503) }
}

export async function PUT(req: Request) {
  if (!sameOrigin(req) || !curatorRequestAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try {
    const body = await bodyOf(req)
    if (!body || typeof body.itemId !== 'string' || !/^[a-f\d]{24}$/i.test(body.itemId) || typeof body.subject !== 'string') return json({ error: 'Invalid request' }, 400)
    const label = body.subject.trim().replace(/\s+/g, ' ').slice(0, 80)
    const db = await getDb()
    const result = await db.collection('discovery_owner_references_v2').updateOne(
      { ownerId: curatorOwnerId(), itemId: body.itemId },
      label ? { $set: { digSubject: { label, at: new Date() } } } : { $unset: { digSubject: '' } },
      { maxTimeMS: 2000 },
    )
    if (!result.matchedCount) return json({ error: 'Unknown like' }, 404)
    return json({ itemId: body.itemId, subject: label })
  } catch { return json({ error: 'unavailable' }, 503) }
}
