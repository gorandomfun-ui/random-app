import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { paletteOf } from '@/lib/comm/brand'
import { templateByKey } from '@/lib/comm/templateStore'
import { queueItemById } from '@/lib/comm/queue'
import { pictureDataUri, renderSlidePng } from '@/lib/comm/png'
import { sourceLineOf, creditLineOf } from '@/lib/comm/caption'
import type { Placement } from '@/lib/comm/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * One slide as a PNG: what the editor shows is what gets exported.
 *   template, palette (0–5), logo (black | white), text, mode (full | overlay),
 *   item (queue item id: its credit and source, its thumbnail), media (one of
 *   its media ids, a picture), thumb=1 (the thumbnail instead), glitch (0–1),
 *   seed, credit (a hand-typed author when the base has none).
 * Pictures come from the item's own records, never from a URL in the request.
 */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const params = new URL(req.url).searchParams
  const key = params.get('template') ?? ''
  if (!/^[a-z0-9-]{2,40}$/.test(key)) return json({ error: 'Invalid request' }, 400)
  const mode = params.get('mode') === 'overlay' ? 'overlay' : 'full'
  const logo = params.get('logo') === 'black' ? 'black' : 'white'
  const fit = params.get('fit') === 'cover' ? 'cover' : params.get('fit') === 'contain' ? 'contain' : null
  // A block placed by hand: "x,y,size[,align[,width]]", shares of the canvas and px on a 1080-wide one.
  const placeOf = (raw: string | null, maxSize: number): Placement | null => {
    if (!raw) return null
    const [x, y, size, align, width] = raw.split(',')
    const nx = Number(x), ny = Number(y), ns = Number(size), nw = Number(width)
    if (![nx, ny, ns].every(Number.isFinite) || nx < -0.5 || nx > 1.5 || ny < -0.5 || ny > 1.5) return null
    const place: Placement = { x: nx, y: ny, size: Math.min(maxSize, Math.max(12, ns)) }
    if (align === 'left' || align === 'center' || align === 'right') place.align = align
    if (Number.isFinite(nw) && nw > 0.05 && nw <= 1) place.width = nw
    return place
  }
  const scaleRaw = Number(params.get('scale'))
  const scale = Number.isFinite(scaleRaw) && scaleRaw >= 0.2 && scaleRaw < 1 ? scaleRaw : null
  const textPlace = placeOf(params.get('textplace'), 400)
  const sourcePlace = placeOf(params.get('sourceplace'), 120)
  const textPosition = ['top', 'middle', 'bottom'].includes(params.get('textpos') ?? '') ? (params.get('textpos') as 'top' | 'middle' | 'bottom') : null
  const glitchRaw = Number(params.get('glitch'))
  const glitch = params.has('glitch') && Number.isFinite(glitchRaw) ? Math.min(1, Math.max(0, glitchRaw)) : null
  try {
    const db = await commDb()
    const template = await templateByKey(db, key)
    if (!template) return json({ error: 'not-found' }, 404)
    const itemId = params.get('item') ?? ''
    const item = /^[a-f\d]{24}$/i.test(itemId) ? await queueItemById(db, itemId) : null
    let pictureUrl: string | null = null
    if (item && mode === 'full') {
      const mediaId = params.get('media') ?? ''
      const media = item.media.find((m) => m._id === mediaId)
      if (media && media.contentType.startsWith('image/')) pictureUrl = media.blobUrl
      else if (media && media.contentType.startsWith('video/')) {
        // A clip shows through its poster, one frame the browser took; without one, the thumbnail.
        const poster = item.media.find((m) => m.kind === 'poster' && m.sourceMediaId === media._id)
        pictureUrl = poster?.blobUrl ?? item.snapshot.thumb
      }
      else if (params.get('thumb') === '1' || !media) pictureUrl = item.snapshot.thumb
    }
    const picture = await pictureDataUri(pictureUrl)
    const creditTyped = (params.get('credit') ?? '').trim().slice(0, 120)
    const out = await renderSlidePng({
      template, palette: paletteOf(Number(params.get('palette') ?? '0')), logo,
      text: (params.get('text') ?? '').slice(0, 600),
      // A credit that only repeats the provider says nothing the source line does not: left out on the slide.
      credit: item ? (creditLineOf(item.snapshot, creditTyped) === item.snapshot.providerLabel ? '' : creditLineOf(item.snapshot, creditTyped)) : creditTyped,
      source: item ? sourceLineOf(item.snapshot) : '',
      media: picture?.uri ?? null, mediaSize: picture?.size ?? null, mode, glitch, seed: params.get('seed') ?? key, fit, textPosition, textPlace, sourcePlace, scale,
    })
    return new Response(out.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Comm-Truncated': out.truncated ? '1' : '0', 'X-Comm-Text-Size': String(out.textSize), 'X-Comm-Picture': picture ? '1' : '0' } })
  } catch { return json({ error: 'unavailable' }, 503) }
}
