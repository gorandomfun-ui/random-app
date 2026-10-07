import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { addToQueue, listQueue, queueItemByContent, queueState } from '@/lib/comm/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `?itemId=` tells whether one content is in the queue; without it, the whole queue. */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const itemId = new URL(req.url).searchParams.get('itemId') ?? ''
  try {
    const db = await commDb()
    const state = await queueState(db)
    if (itemId) {
      const item = /^[a-f\d]{24}$/i.test(itemId) ? await queueItemByContent(db, itemId) : null
      return json({ ...state, inQueue: Boolean(item), item })
    }
    return json({ ...state, items: await listQueue(db) })
  } catch { return json({ error: 'unavailable' }, 503) }
}

/** Sets a content aside. Idempotent; 409 when the queue is full. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const itemId = typeof body?.itemId === 'string' ? body.itemId : ''
  if (!/^[a-f\d]{24}$/i.test(itemId)) return json({ error: 'Invalid request' }, 400)
  try {
    const db = await commDb()
    const result = await addToQueue(db, itemId)
    const state = await queueState(db)
    if (!result.ok) return json({ ...state, error: result.reason }, result.reason === 'full' ? 409 : 404)
    return json({ ...state, item: result.item, created: result.created })
  } catch { return json({ error: 'unavailable' }, 503) }
}
