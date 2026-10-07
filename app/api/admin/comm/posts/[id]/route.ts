import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { deleteDraft, postById, updateDraft } from '@/lib/comm/posts'
import { queueItemById } from '@/lib/comm/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The draft with the items it was made from, for the editor to pick media and words. */
export async function GET(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try {
    const db = await commDb()
    const post = await postById(db, (context?.params.id ?? ''))
    if (!post) return json({ error: 'not-found' }, 404)
    const items = (await Promise.all(post.queueItemIds.map((id) => queueItemById(db, id)))).filter(Boolean)
    return json({ post, items })
  } catch { return json({ error: 'unavailable' }, 503) }
}

export async function PATCH(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  if (!body) return json({ error: 'Invalid request' }, 400)
  try {
    const result = await updateDraft(await commDb(), (context?.params.id ?? ''), body as never)
    return result.ok ? json({ post: result.post }) : json({ error: result.reason }, result.reason === 'not-found' ? 404 : 400)
  } catch { return json({ error: 'unavailable' }, 503) }
}

export async function DELETE(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  try { return json({ removed: await deleteDraft(await commDb(), (context?.params.id ?? '')) }) } catch { return json({ error: 'unavailable' }, 503) }
}
