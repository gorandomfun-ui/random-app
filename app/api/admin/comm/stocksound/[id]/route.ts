import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { soundByKey } from '@/lib/comm/stockSound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One stock video with sound, fetched by the server from the platform's own address and streamed to
 * the browser, which decodes its audio. Only a find of the catalogue, only its known hosts.
 */
export async function GET(req: Request, context?: { params: { id: string } }) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const key = decodeURIComponent(context?.params.id ?? '')
  if (!/^(pixabay|pexels):\d{1,12}$/.test(key)) return json({ error: 'not-found' }, 404)
  try {
    const row = await soundByKey(await commDb(), key)
    if (!row) return json({ error: 'not-found' }, 404)
    const upstream = await fetch(row.url, { signal: AbortSignal.timeout(20000), headers: { accept: 'video/*' } })
    if (!upstream.ok || !upstream.body) return json({ error: 'upstream' }, 502)
    const type = upstream.headers.get('content-type') ?? 'video/mp4'
    if (!type.startsWith('video/')) return json({ error: 'upstream' }, 502)
    return new Response(upstream.body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } })
  } catch { return json({ error: 'unavailable' }, 503) }
}
