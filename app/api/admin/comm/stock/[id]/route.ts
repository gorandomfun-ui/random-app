import { ObjectId } from 'mongodb'
import { commAllowed, json } from '@/lib/comm/auth'
import { getDb } from '@/lib/db'
import { STOCK_PROVIDERS, stockHostAllowed } from '@/lib/comm/stock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One stock picture, fetched by the server from the platform's own address and handed to the
 * browser from here, so a canvas can read it. Only an item of the catalogue, only a permissive
 * platform, only its known hosts: never a free address.
 */
export async function GET(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const id = context?.params.id ?? ''
  if (!ObjectId.isValid(id)) return json({ error: 'not-found' }, 404)
  try {
    const row = await (await getDb()).collection('items').findOne({ _id: new ObjectId(id), type: 'image' }, { projection: { url: 1, provider: 1 }, maxTimeMS: 2000 })
    if (!row || !STOCK_PROVIDERS.includes(String(row.provider ?? '').toLowerCase()) || typeof row.url !== 'string' || !stockHostAllowed(row.url)) return json({ error: 'not-found' }, 404)
    const upstream = await fetch(row.url, { signal: AbortSignal.timeout(8000), headers: { accept: 'image/*' } })
    if (!upstream.ok || !upstream.body) return json({ error: 'upstream' }, 502)
    const type = upstream.headers.get('content-type') ?? 'image/jpeg'
    if (!type.startsWith('image/')) return json({ error: 'upstream' }, 502)
    return new Response(upstream.body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } })
  } catch { return json({ error: 'unavailable' }, 503) }
}
