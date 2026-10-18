import { del, list } from '@vercel/blob'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, json } from '@/lib/comm/auth'
import { blobConfigured, blobPathnameOf } from '@/lib/comm/blob'
import { TRACK_CONTENT_TYPES, TRACK_MAX_BYTES, TRACKS_PREFIX, trackNameOf, trackPathOk } from '@/lib/comm/tracks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The promo's tracks in Blob: the folder listed, a short token for the
 * browser to send a file into it and nowhere else, a file removed by its
 * address. The upload-completed call comes from Vercel without the cookie;
 * the SDK checks its signature, and the page lists the folder again anyway.
 */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  if (!blobConfigured()) return json({ blob: false, tracks: [] })
  try {
    const { blobs } = await list({ prefix: TRACKS_PREFIX, limit: 200 })
    const tracks = blobs.filter((b) => b.size > 0 && trackPathOk(b.pathname)).sort((a, b) => a.pathname.localeCompare(b.pathname)).map((b) => ({ url: b.url, name: trackNameOf(b.pathname), bytes: b.size }))
    return json({ blob: true, tracks })
  } catch { return json({ error: 'unavailable' }, 503) }
}

export async function POST(req: Request) {
  let body: HandleUploadBody
  try { body = (await req.json()) as HandleUploadBody } catch { return json({ error: 'Invalid request' }, 400) }
  if (body.type !== 'blob.upload-completed' && !commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  if (!blobConfigured()) return json({ error: 'no-blob', message: 'Le stockage Blob n’est pas configuré sur le projet.' }, 503)
  try {
    const result = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!trackPathOk(pathname)) throw new Error('Chemin hors des pistes')
        return { allowedContentTypes: TRACK_CONTENT_TYPES, maximumSizeInBytes: TRACK_MAX_BYTES, addRandomSuffix: false, allowOverwrite: true, validUntil: Date.now() + 10 * 60 * 1000 }
      },
      onUploadCompleted: async () => { /* the page lists the folder again */ },
    })
    return json(result)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'upload' }, 400) }
}

export async function DELETE(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const url = typeof body?.url === 'string' ? body.url : ''
  const pathname = blobPathnameOf(url)
  if (!pathname || !trackPathOk(pathname)) return json({ error: 'Invalid request' }, 400)
  if (!blobConfigured()) return json({ error: 'no-blob' }, 503)
  try { await del(url); return json({ removed: true }) } catch { return json({ error: 'unavailable' }, 503) }
}
