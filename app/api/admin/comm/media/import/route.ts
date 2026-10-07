import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { importSourceMedia, type ImportWhat } from '@/lib/comm/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** A GIF or a full-size picture from its provider: a few seconds, never a minute. */
export const maxDuration = 30

const WHATS: ImportWhat[] = ['image', 'gif', 'thumb']
const REASONS: Record<string, [number, string]> = {
  'no-blob': [503, 'Le stockage Blob n’est pas configuré sur le projet.'],
  'no-item': [404, 'Cet élément n’est plus dans la file.'],
  'no-url': [422, 'Ce contenu n’a pas de fichier à récupérer.'],
  fetch: [502, 'La source n’a pas répondu.'],
  type: [415, 'La source n’a pas renvoyé une image ou une vidéo.'],
  size: [413, 'Le fichier est trop lourd pour la file.'],
}

/** Fetches the content's own file from the snapshot's address into the item's Blob folder. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const queueItemId = typeof body?.queueItemId === 'string' ? body.queueItemId : ''
  const what = WHATS.includes(body?.what as ImportWhat) ? (body!.what as ImportWhat) : null
  if (!/^[a-f\d]{24}$/i.test(queueItemId) || !what) return json({ error: 'Invalid request' }, 400)
  try {
    const result = await importSourceMedia(await commDb(), queueItemId, what)
    if (!result.ok) { const [status, message] = REASONS[result.reason]; return json({ error: result.reason, message }, status) }
    return json({ media: result.media })
  } catch { return json({ error: 'unavailable' }, 503) }
}
