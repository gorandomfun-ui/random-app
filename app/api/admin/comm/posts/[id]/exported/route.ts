import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { markExported } from '@/lib/comm/posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The files left the tool: the post becomes a trace and its items leave the queue, except those kept. */
export async function POST(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const keep = Array.isArray(body?.keep) ? body!.keep.filter((id): id is string => typeof id === 'string') : []
  try {
    const result = await markExported(await commDb(), (context?.params.id ?? ''), keep)
    return result.ok ? json(result) : json({ error: 'not-found' }, 404)
  } catch { return json({ error: 'unavailable' }, 503) }
}
