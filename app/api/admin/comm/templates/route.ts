import { bodyOf } from '@/lib/discovery/handlers'
import { commAllowed, commDb, json } from '@/lib/comm/auth'
import { deleteTemplate, listTemplates, saveTemplate } from '@/lib/comm/templateStore'
import { PALETTE_COUNT } from '@/lib/comm/brand'
import { FAMILY_SIZES, ICON_NAMES } from '@/lib/comm/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  try { return json({ templates: await listTemplates(await commDb()), families: FAMILY_SIZES, palettes: PALETTE_COUNT, icons: ICON_NAMES }) } catch { return json({ error: 'unavailable' }, 503) }
}

/** Adds or replaces a template, as data; refused with its reasons when a layer is wrong or the credit or source is missing. */
export async function POST(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const body = await bodyOf(req)
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request' }, 400)
  try {
    const result = await saveTemplate(await commDb(), body)
    return result.ok ? json({ template: result.template }) : json({ error: 'invalid', errors: result.errors }, 422)
  } catch { return json({ error: 'unavailable' }, 503) }
}

export async function DELETE(req: Request) {
  if (!commAllowed(req, true)) return json({ error: 'Unauthorized' }, 401)
  const key = new URL(req.url).searchParams.get('key') ?? ''
  if (!/^[a-z0-9-]{2,40}$/.test(key)) return json({ error: 'Invalid request' }, 400)
  try { return json({ removed: await deleteTemplate(await commDb(), key) }) } catch { return json({ error: 'unavailable' }, 503) }
}
