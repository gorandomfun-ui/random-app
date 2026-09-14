import { getDb } from '@/lib/db'
import { curatorOwnerId, curatorRequestAllowed } from '@/lib/discovery/curatorAuth'
import { inspectCuration, listCurationInspection } from '@/lib/discovery/curationInspection'
import { withAbortDeadline } from '@/lib/discovery/exploration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(req: Request) {
  if (!curatorRequestAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const id = new URL(req.url).searchParams.get('itemId')
  if (id !== null && !/^[a-f\d]{24}$/i.test(id)) return json({ error: 'Invalid item' }, 400)
  try {
    const db = await withAbortDeadline(1500, req.signal, () => getDb()), ownerId = curatorOwnerId()
    if (!id) return json({ references: await listCurationInspection(db, ownerId) })
    const report = await inspectCuration(db, ownerId, id)
    return report ? json(report) : json({ error: 'Not found' }, 404)
  } catch { return json({ error: 'unavailable' }, 503) }
}
