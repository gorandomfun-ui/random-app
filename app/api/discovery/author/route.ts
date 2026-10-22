/**
 * A series of one author's videos (lib/random/author.ts): what "5 autres vidéos dans Random" shows, asked when the visitor
 * picks it under the légende. `key` is the author's channel key, `exclude` the videos not to give again, the one on
 * screen first.
 */

import { getDbSafe } from '@/lib/random/data'
import { normalizeWaveDocument, type WaveDocument } from '@/lib/random/waveEngine'
import { authorSeries } from '@/lib/discovery/author'
import { knownChannelKey } from '@/lib/random/author'

export const runtime = 'nodejs'
export const maxDuration = 10

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams
  const key = params.get('key') ?? ''
  if (!knownChannelKey(key)) return json({ error: 'invalid-author' }, 400)
  const exclude = (params.get('exclude') ?? '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 50)
  const db = await getDbSafe()
  if (!db) return json({ error: 'unavailable' }, 503)
  try {
    const rows = await authorSeries(db, key, exclude)
    const items = rows.map((row) => normalizeWaveDocument(row as WaveDocument)).filter((item) => item?.type === 'video')
    return json({ items })
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
}
