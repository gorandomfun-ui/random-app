import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { blobConfigured, blobKeyFor, MEDIA_CONTENT_TYPES, MEDIA_MAX_BYTES } from '@/lib/comm/blob'
import { signUrl } from '@/lib/comm/gcs'
import { queueItemById } from '@/lib/comm/queue'
import { storageAllowed, storageFullMessage, storedBytes } from '@/lib/comm/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** How long the browser has to send the file once the address is minted. */
const PUT_SEC = 15 * 60

/**
 * `{ queueItemId, contentType, bytes }` → a signed PUT address into that
 * item's folder and nowhere else, bound to the type, good for a quarter of an
 * hour; the file never crosses a function. Refused when the store would pass
 * its cap. The browser registers the file afterwards (media route).
 */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  if (!blobConfigured()) return json({ error: 'no-blob', message: 'Le stockage n’est pas configuré sur le projet.' }, 503)
  const body = await bodyOf(req)
  const queueItemId = typeof body?.queueItemId === 'string' ? body.queueItemId : ''
  const contentType = typeof body?.contentType === 'string' ? body.contentType.split(';')[0].trim().toLowerCase() : ''
  const bytes = typeof body?.bytes === 'number' && Number.isFinite(body.bytes) ? Math.round(body.bytes) : -1
  if (!/^[a-f\d]{24}$/i.test(queueItemId) || !MEDIA_CONTENT_TYPES.includes(contentType) || bytes <= 0) return json({ error: 'Invalid request' }, 400)
  if (bytes > MEDIA_MAX_BYTES) return json({ error: 'size', message: `Fichier trop lourd (${Math.round(bytes / 1048576)} Mo ; ${Math.round(MEDIA_MAX_BYTES / 1048576)} Mo au plus).` }, 413)
  try {
    const db = await commDb()
    if (!(await queueItemById(db, queueItemId))) return json({ error: 'not-found', message: 'Élément inconnu.' }, 404)
    if (!storageAllowed(await storedBytes(db), bytes)) return json({ error: 'full', message: storageFullMessage() }, 507)
    const key = blobKeyFor(queueItemId, contentType)
    return json({ url: signUrl({ method: 'PUT', key, expiresSec: PUT_SEC, contentType }), key })
  } catch { return json({ error: 'unavailable' }, 503) }
}
