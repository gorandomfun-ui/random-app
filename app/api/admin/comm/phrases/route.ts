import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { deletePhrase, listPhrases, savePhrase } from '@/lib/comm/phraseStore'
import { PHRASE_FAMILIES } from '@/lib/comm/caption'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try { return json({ phrases: await listPhrases(await commDb()), families: PHRASE_FAMILIES }) } catch { return json({ error: 'unavailable' }, 503) }
}

/** Adds a phrase, or changes one when `id` is given. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  try {
    const phrase = await savePhrase(await commDb(), body, typeof body?.id === 'string' ? body.id : undefined)
    return phrase ? json({ phrase }) : json({ error: 'Invalid request' }, 400)
  } catch { return json({ error: 'unavailable' }, 503) }
}

export async function DELETE(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const id = new URL(req.url).searchParams.get('id') ?? ''
  try { return json({ removed: await deletePhrase(await commDb(), id) }) } catch { return json({ error: 'unavailable' }, 503) }
}
