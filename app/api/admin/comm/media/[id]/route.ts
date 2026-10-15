import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { removeMedia } from '@/lib/comm/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  try { return json({ removed: await removeMedia(await commDb(), (context?.params.id ?? '')) }) } catch { return json({ error: 'unavailable' }, 503) }
}
