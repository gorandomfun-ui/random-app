import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { startInstagram, statusInstagram, type PublishAsset } from '@/lib/comm/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Step one of a publication: the containers, under the draft's lock. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const postId = typeof body?.postId === 'string' ? body.postId : ''
  const assets = Array.isArray(body?.assets) ? (body!.assets as PublishAsset[]).filter((a) => a && typeof a === 'object' && Number.isInteger(a.slideIndex) && typeof a.url === 'string' && (a.kind === 'image' || a.kind === 'video')).map((a) => ({ slideIndex: a.slideIndex, url: a.url, kind: a.kind })) : []
  const keep = Array.isArray(body?.keep) ? body!.keep.filter((id): id is string => typeof id === 'string') : []
  if (!/^[a-f\d]{24}$/i.test(postId)) return json({ error: 'Invalid request' }, 400)
  try {
    const result = await startInstagram(await commDb(), fetch, postId, assets, keep)
    return result.ok ? json(result) : json({ error: result.reason }, result.status)
  } catch { return json({ error: 'unavailable' }, 503) }
}

/** Polled by the browser until the publication is done or failed. */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const postId = new URL(req.url).searchParams.get('postId') ?? ''
  if (!/^[a-f\d]{24}$/i.test(postId)) return json({ error: 'Invalid request' }, 400)
  try { return json(await statusInstagram(await commDb(), fetch, postId)) } catch { return json({ error: 'unavailable' }, 503) }
}
