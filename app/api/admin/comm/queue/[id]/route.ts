import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { queueItemById, queueState, removeFromQueue } from '@/lib/comm/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try {
    const item = await queueItemById(await commDb(), (context?.params.id ?? ''))
    return item ? json({ item }) : json({ error: 'not-found' }, 404)
  } catch { return json({ error: 'unavailable' }, 503) }
}

/** Removes the item with its media and their files. */
export async function DELETE(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  try {
    const db = await commDb()
    const result = await removeFromQueue(db, (context?.params.id ?? ''))
    return json({ ...result, ...(await queueState(db)) })
  } catch { return json({ error: 'unavailable' }, 503) }
}
