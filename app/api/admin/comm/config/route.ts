import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { instagramState, refreshInstagramToken } from '@/lib/comm/configStore'
import { blobConfigured } from '@/lib/comm/blob'
import { DESTINATION_SPECS } from '@/lib/comm/destinations'
import { usageOf } from '@/lib/comm/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Configured, missing or expired; never a value. The store's month and weight beside. */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try {
    const db = await commDb()
    const [instagram, storage] = await Promise.all([instagramState(db, fetch), usageOf(db).catch(() => null)])
    return json({ blob: blobConfigured(), bucket: process.env.COMM_GCS_BUCKET ?? null, storage, instagram, destinations: DESTINATION_SPECS.map((d) => ({ key: d.key, name: d.name, direct: d.direct, note: d.directNote })) })
  } catch { return json({ error: 'unavailable' }, 503) }
}

/** `{ action: 'refresh-token' }`: a new long-lived token, shown once. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  if (body?.action !== 'refresh-token') return json({ error: 'Invalid request' }, 400)
  try {
    const result = await refreshInstagramToken(await commDb(), fetch)
    return result.ok ? json(result) : json({ error: result.reason }, 502)
  } catch { return json({ error: 'unavailable' }, 503) }
}
