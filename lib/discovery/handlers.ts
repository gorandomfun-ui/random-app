import type { Db } from 'mongodb'
import type { CatalogueRow } from './catalog'
import { loadWave, selectPool } from './mongo'
import { planDraw } from './pool'
import type { Format } from './types'
import type { Candidate } from './types'

const FORMATS: Format[] = ['video', 'image', 'quote', 'joke', 'fact', 'web']
type Dependencies<T> = { enabled: () => boolean; getDb: () => Promise<Db | null>; decode: (row: CatalogueRow) => T | null;
  onSelected?: (item: Candidate<T>, lang: string, req: Request) => Promise<void> }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
import { parseSession } from './sessionCodec'
export { parseSession } from './sessionCodec'
import { curatorOwnerId, curatorRequestAllowed } from './curatorAuth'
const isObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value)
export async function bodyOf(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get('content-length') ?? '0') > 65536) return null
  // Bound bytes before JSON parsing, including requests without Content-Length.
  const reader = req.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []; let length = 0
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    length += value.length
    if (length > 65536) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { const body: unknown = JSON.parse(new TextDecoder().decode(bytes)); return isObject(body) ? body : null } catch { return null }
}
function language(body: Record<string, unknown>): string { return ['en', 'fr', 'de', 'es', 'jp'].includes(String(body.lang)) ? String(body.lang) : 'en' }

export function randomHandler<T>(deps: Dependencies<T>) {
  return async (req: Request): Promise<Response> => {
    if (!deps.enabled() && !curatorRequestAllowed(req)) return json({ error: 'disabled' }, 404)
    try {
      const body = await bodyOf(req), state = body && parseSession(body.session)
      if (!body || !state || !FORMATS.includes(body.type as Format)) return json({ error: 'invalid-request' }, 400)
      const db = await deps.getDb(); if (!db) return json({ error: 'unavailable' }, 503)
      const ticket = planDraw(state, body.type as Format)
      const choice = await selectPool(db, ticket, state, language(body), deps.decode, Math.random, Date.now(), body.factVariant === 'quiz' || body.factVariant === 'text' ? body.factVariant : undefined, curatorOwnerId())
      if (!choice) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
      await deps.onSelected?.(choice.item, language(body), req).catch(() => undefined)
      const { editorialFamilies: _families, directEditorialReference: _direct, ...publicCandidate } = choice.item
      return json({ version: 2, candidate: publicCandidate, branch: choice.branch, fallback: choice.fallback })
    } catch { return json({ error: 'unavailable' }, 503) }
  }
}
export function waveHandler<T>(deps: Dependencies<T>) {
  return async (req: Request): Promise<Response> => {
    if (!deps.enabled() && !curatorRequestAllowed(req)) return json({ error: 'disabled' }, 404)
    try {
      const body = await bodyOf(req)
      if (!body || typeof body.anchorId !== 'string' || !/^[a-f\d]{24}$/i.test(body.anchorId)) return json({ error: 'invalid-anchor' }, 400)
      const db = await deps.getDb(); if (!db) return json({ error: 'unavailable' }, 503)
      const requested = Array.isArray(body.types) ? body.types : FORMATS
      const types = FORMATS.filter(x => requested.includes(x))
      const excluded = Array.isArray(body.excludeKeys) ? body.excludeKeys.filter((x): x is string => typeof x === 'string' && x.length <= 2048).slice(0, 80) : []
      const result = await loadWave(db, body.anchorId, language(body), types, deps.decode, Math.random, Date.now(), excluded)
      if (!result?.plan.ready) return json({ version: 2, ready: false, reason: 'insufficient-related-content' })
      return json({ version: 2, anchor: result.anchor, ...result.plan })
    } catch { return json({ error: 'unavailable' }, 503) }
  }
}
