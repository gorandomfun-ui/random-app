import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { keyBelongsTo, legacyBlobUrl, MEDIA_CONTENT_TYPES, MEDIA_MAX_BYTES, readableMedia } from '@/lib/comm/blob'
import { objectKeyOf, objectMeta, objectUrl } from '@/lib/comm/gcs'
import { queueItemById, registerMedia } from '@/lib/comm/queue'
import type { MediaKind } from '@/lib/comm/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: MediaKind[] = ['capture', 'import', 'gif', 'image', 'screenshot', 'thumb', 'montage', 'still', 'render', 'poster']
const trimOf = (value: unknown) => { const t = value as { startSec?: unknown; endSec?: unknown } | null; return t && typeof t === 'object' && typeof t.startSec === 'number' && typeof t.endSec === 'number' && t.startSec >= 0 && t.endSec > t.startSec ? { startSec: Math.round(t.startSec * 100) / 100, endSec: Math.round(t.endSec * 100) / 100 } : null }
const cropOf = (value: unknown) => { const c = value as { mode?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown } | null; return c && typeof c === 'object' && (c.mode === 'framed' || c.mode === 'centered') && [c.x, c.y, c.w, c.h].every((n) => typeof n === 'number' && Number.isFinite(n)) ? { mode: c.mode as 'framed' | 'centered', x: c.x as number, y: c.y as number, w: c.w as number, h: c.h as number } : null }
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null)

/** Records a file the browser just sent to the store (by its key, or its address), once it sits in the item's own folder and the store confirms it. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const queueItemId = typeof body?.queueItemId === 'string' ? body.queueItemId : ''
  const kind = KINDS.includes(body?.kind as MediaKind) ? (body!.kind as MediaKind) : null
  const contentType = typeof body?.contentType === 'string' ? body.contentType.split(';')[0].trim().toLowerCase() : ''
  const bytes = num(body?.bytes)
  const pathname = typeof body?.key === 'string' ? body.key : typeof body?.blobUrl === 'string' && !legacyBlobUrl(body.blobUrl) ? objectKeyOf(body.blobUrl) : null
  if (!kind || !pathname || !keyBelongsTo(pathname, queueItemId) || !MEDIA_CONTENT_TYPES.includes(contentType) || bytes == null || bytes > MEDIA_MAX_BYTES) return json({ error: 'Invalid request' }, 400)
  try {
    const db = await commDb()
    if (!(await queueItemById(db, queueItemId))) return json({ error: 'not-found' }, 404)
    // The file must be there, whole: what the browser says it sent is checked against the store.
    const stored = await objectMeta(pathname)
    if (!stored || stored.size !== bytes) return json({ error: 'missing', message: 'Le fichier n’est pas arrivé entier dans le stockage.' }, 409)
    const media = readableMedia(await registerMedia(db, {
      queueItemId, kind, blobUrl: objectUrl(pathname), blobKey: pathname, contentType, bytes,
      width: num(body?.width), height: num(body?.height), durationSec: num(body?.durationSec),
      animated: body?.animated === true || contentType === 'image/gif' || contentType.startsWith('video/'),
      trim: trimOf(body?.trim), crop: cropOf(body?.crop),
      sourceMediaId: typeof body?.sourceMediaId === 'string' && /^[a-f\d]{24}$/i.test(body.sourceMediaId) ? body.sourceMediaId : null,
      templateKey: typeof body?.templateKey === 'string' && /^[a-z0-9-]{2,40}$/.test(body.templateKey) ? body.templateKey : null,
    }))
    return json({ media })
  } catch { return json({ error: 'unavailable' }, 503) }
}
