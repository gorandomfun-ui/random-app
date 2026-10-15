import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { createDraft, listPosts } from '@/lib/comm/posts'
import { DESTINATION_SPECS } from '@/lib/comm/destinations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try { return json({ posts: await listPosts(await commDb()), destinations: DESTINATION_SPECS }) } catch { return json({ error: 'unavailable' }, 503) }
}

/** Step 2: a draft for a destination, a format and the chosen items. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const ids = Array.isArray(body?.queueItemIds) ? body!.queueItemIds.filter((id): id is string => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) : []
  if (typeof body?.destination !== 'string' || typeof body?.format !== 'string') return json({ error: 'Invalid request' }, 400)
  try {
    const result = await createDraft(await commDb(), { destination: body.destination, format: body.format, queueItemIds: ids })
    return result.ok ? json({ post: result.post }) : json({ error: result.reason }, 400)
  } catch { return json({ error: 'unavailable' }, 503) }
}
