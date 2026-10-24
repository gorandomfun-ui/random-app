import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { blobConfigured, PICTURE_URL_SEC, readUrl } from '@/lib/comm/blob'
import { deleteObject, listObjects, objectKeyOf, objectUrl, signUrl } from '@/lib/comm/gcs'
import { TRACK_MAX_BYTES, TRACKS_PREFIX, trackNameOf, trackPathFor, trackPathOk, trackTypeOf } from '@/lib/comm/tracks'
import { storageAllowed, storageFullMessage, storedBytes } from '@/lib/comm/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUT_SEC = 15 * 60

/**
 * The promo's tracks in the store: the folder listed with addresses that hold
 * all day, a signed PUT for the browser to send a file into it and nowhere
 * else, a file removed by its address.
 */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  if (!blobConfigured()) return json({ blob: false, tracks: [] })
  try {
    const objects = await listObjects(TRACKS_PREFIX)
    const tracks = objects.filter((o) => o.size > 0 && trackPathOk(o.key)).sort((a, b) => a.key.localeCompare(b.key)).map((o) => ({ url: readUrl(objectUrl(o.key), PICTURE_URL_SEC, true), name: trackNameOf(o.key), bytes: o.size }))
    return json({ blob: true, tracks })
  } catch { return json({ error: 'unavailable' }, 503) }
}

/** `{ name, type, bytes }` → a signed PUT address for that track, bound to its type. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  if (!blobConfigured()) return json({ error: 'no-blob', message: 'Le stockage n’est pas configuré sur le projet.' }, 503)
  const body = await bodyOf(req)
  const name = typeof body?.name === 'string' ? body.name.slice(0, 200) : ''
  const type = typeof body?.type === 'string' ? body.type : ''
  const bytes = typeof body?.bytes === 'number' && Number.isFinite(body.bytes) ? Math.round(body.bytes) : -1
  const key = name ? trackPathFor({ name, type }) : null
  if (!key || !trackPathOk(key) || bytes <= 0) return json({ error: 'Invalid request' }, 400)
  if (bytes > TRACK_MAX_BYTES) return json({ error: 'size', message: `Piste trop lourde (${Math.round(TRACK_MAX_BYTES / 1048576)} Mo au plus).` }, 413)
  try {
    if (!storageAllowed(await storedBytes(await commDb()), bytes)) return json({ error: 'full', message: storageFullMessage() }, 507)
    const contentType = trackTypeOf(key)
    return json({ url: signUrl({ method: 'PUT', key, expiresSec: PUT_SEC, contentType }), key, contentType, name: trackNameOf(key) })
  } catch { return json({ error: 'unavailable' }, 503) }
}

export async function DELETE(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const url = typeof body?.url === 'string' ? body.url : ''
  const key = objectKeyOf(url)
  if (!key || !trackPathOk(key)) return json({ error: 'Invalid request' }, 400)
  if (!blobConfigured()) return json({ error: 'no-blob' }, 503)
  try { await deleteObject(key); return json({ removed: true }) } catch { return json({ error: 'unavailable' }, 503) }
}
