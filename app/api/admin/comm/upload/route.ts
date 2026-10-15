import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { blobConfigured, keyBelongsTo, MEDIA_CONTENT_TYPES, MEDIA_MAX_BYTES } from '@/lib/comm/blob'
import { queueItemById } from '@/lib/comm/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The short token that lets the browser send a file straight to Blob, into one
 * queue item's folder and nowhere else. The file never crosses a function.
 * The upload-completed call comes from Vercel without the cookie; the SDK
 * checks its signature, and the browser registers the media itself anyway.
 */
export async function POST(req: Request) {
  let body: HandleUploadBody
  try { body = (await req.json()) as HandleUploadBody } catch { return json({ error: 'Invalid request' }, 400) }
  if (body.type !== 'blob.upload-completed' && !commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  if (!blobConfigured()) return json({ error: 'no-blob', message: 'Le stockage Blob n’est pas configuré sur le projet.' }, 503)
  try {
    const result = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const queueItemId = typeof clientPayload === 'string' ? clientPayload : ''
        if (!keyBelongsTo(pathname, queueItemId)) throw new Error('Chemin hors de la file')
        if (!(await queueItemById(await commDb(), queueItemId))) throw new Error('Élément inconnu')
        return { allowedContentTypes: MEDIA_CONTENT_TYPES, maximumSizeInBytes: MEDIA_MAX_BYTES, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 10 * 60 * 1000, tokenPayload: queueItemId }
      },
      onUploadCompleted: async () => { /* the browser registers the media with what it knows of it */ },
    })
    return json(result)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'upload' }, 400) }
}
