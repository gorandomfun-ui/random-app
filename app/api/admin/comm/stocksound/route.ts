import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { drawSounds, markHeard } from '@/lib/comm/stockSound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A few stock videos with sound, drawn from the catalogue of finds — the catalogue probed first while it is thin. */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const n = Math.max(1, Math.min(6, Number(new URL(req.url).searchParams.get('n')) || 3))
  const keys = { pixabay: process.env.PIXABAY_API_KEY ?? '', pexels: process.env.PEXELS_API_KEY ?? '' }
  try { return json(await drawSounds(await commDb(), n, keys)) } catch { return json({ sounds: [], reason: 'unavailable' }) }
}

/** What the browser heard of a find once decoded: loud, or silent after all. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  const key = typeof body?.id === 'string' ? body.id : ''
  if (!/^(pixabay|pexels):\d{1,12}$/.test(key) || typeof body?.loud !== 'boolean') return json({ error: 'Invalid request' }, 400)
  try { return json({ marked: await markHeard(await commDb(), key, body.loud) }) } catch { return json({ error: 'unavailable' }, 503) }
}
