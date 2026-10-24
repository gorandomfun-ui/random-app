import { ObjectId } from 'mongodb'

import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { CLIP_URL_SEC, legacyBlobUrl, readUrl } from '@/lib/comm/blob'
import { COMM_MEDIA, type MediaDoc } from '@/lib/comm/model'
import { countEgress, egressAllowed, egressFullMessage, monthEgress } from '@/lib/comm/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A readable address for one media, asked when the browser opens it: the
 * clip's bytes count toward the month's cap, and past the cap the answer is
 * no, with the day it opens again. A file still in the old store is handed
 * as it is, uncounted.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const id = (await context.params).id ?? ''
  if (!ObjectId.isValid(id)) return json({ error: 'Invalid request' }, 400)
  try {
    const db = await commDb()
    const media = await db.collection(COMM_MEDIA).findOne({ _id: new ObjectId(id) }, { projection: { blobUrl: 1, bytes: 1, contentType: 1 }, maxTimeMS: 2500 }) as (Pick<MediaDoc, 'blobUrl' | 'bytes' | 'contentType'> & { _id: ObjectId }) | null
    if (!media) return json({ error: 'not-found' }, 404)
    if (legacyBlobUrl(media.blobUrl)) return json({ url: media.blobUrl, bytes: media.bytes, counted: false })
    const bytes = typeof media.bytes === 'number' ? media.bytes : 0
    if (!egressAllowed(await monthEgress(db), bytes)) return json({ error: 'quota', message: egressFullMessage() }, 429)
    const total = await countEgress(db, bytes)
    return json({ url: readUrl(media.blobUrl, CLIP_URL_SEC), bytes, counted: true, monthBytes: total })
  } catch { return json({ error: 'unavailable' }, 503) }
}
