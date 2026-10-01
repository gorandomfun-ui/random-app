import type { Db } from 'mongodb'
import { freshEnabled, parseFreshSeen, selectFresh } from './freshPool'
import type { CatalogueRow } from './catalog'
import { loadWave, selectPool } from './mongo'
import { planDraw } from './pool'
import { isVisual, type Candidate, type Format } from './types'
import { selectCool } from './coolPool'

const FORMATS: Format[] = ['video', 'image', 'quote', 'joke', 'fact', 'web']
type Dependencies<T> = { enabled: () => boolean; getDb: () => Promise<Db | null>; decode: (row: CatalogueRow) => T | null;
  onSelected?: (item: Candidate<T>, lang: string, req: Request) => Promise<void> }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
import { parseSession } from './sessionCodec'
export { parseSession } from './sessionCodec'
import { curatorOwnerId, curatorRequestAllowed } from './curatorAuth'
import { isAdminRequest } from '../auth/adminAuth'
import { themeAt, themeDeckSwitchedOn } from '../v3/cool/themes'
import { digDrawSwitchedOn, selectDig } from './digDraw'
import { selectWheel, wheelSwitchedOn } from './wheel'
import { countServed, servedCountOn } from './served'
import { parseKept, recordKept } from './kept'
import { withAbortDeadline } from './exploration'
import { requestSubjectWork } from './subjectWork'
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
/** Keys the device saw this week: at most four hundred, each a plain content key. */
export const SEEN_KEYS_MAX = 400
export function parseSeen(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length <= 2048).slice(-SEEN_KEYS_MAX)
}
/** The subjects and authors the device saw these two weeks (utils/subjectMemory.ts): at most six hundred hashes. */
export const SEEN_SUBJECTS_MAX = 600
export function parseSeenSubjects(value: unknown): Set<number> {
  if (!Array.isArray(value)) return new Set()
  return new Set(value.filter((hash): hash is number => Number.isSafeInteger(hash) && hash >= 0 && hash <= 0xffffffff).slice(-SEEN_SUBJECTS_MAX))
}
/** One switch on Vercel turns the cool pool off without a deployment. */
const coolPoolEnabled = () => process.env.RANDOM_COOL_POOL_ENABLED !== '0'
function language(body: Record<string, unknown>): string { return ['en', 'fr', 'de', 'es', 'jp'].includes(String(body.lang)) ? String(body.lang) : 'en' }

export function randomHandler<T>(deps: Dependencies<T>) {
  return async (req: Request): Promise<Response> => {
    if (!deps.enabled() && !curatorRequestAllowed(req)) return json({ error: 'disabled' }, 404)
    try {
      const body = await bodyOf(req), state = body && parseSession(body.session)
      if (!body || !state || !FORMATS.includes(body.type as Format)) return json({ error: 'invalid-request' }, 400)
      const db = await withAbortDeadline(1500, req.signal, () => deps.getDb()); if (!db) return json({ error: 'unavailable' }, 503)
      const ticket = planDraw(state, body.type as Format)
      // The draw over the dig (lib/discovery/digDraw.ts), when its switch is on — or for the admin's rehearsal.
      const digOn = digDrawSwitchedOn() || (body.digDraw === true && isAdminRequest(req))
      // The theme deck (lib/v3/cool/themes.ts): this visual's universe, when the switch is on — or for the admin's rehearsal of it.
      // The dig draws inside the same card; where it has nothing of that universe, the deck's own paths answer (the owner, 30 September: the themes stay).
      // The wheel (lib/discovery/wheel.ts): every video of a session, when its switch is on — or for the admin's rehearsal; it deals inside the universe cards.
      const wheelOn = wheelSwitchedOn() || (body.wheel === true && isAdminRequest(req))
      const deckOn = themeDeckSwitchedOn() || (body.themeDeck === true && isAdminRequest(req)) || digOn || wheelOn
      const theme = deckOn && isVisual(ticket.type) ? themeAt(state.seed, state.visuals) : undefined
      // What the device saw this week rides along and is left out of the draw, on top of the session's own forty.
      const seen = parseSeen(body.seen)
      const drawState = seen.length ? { ...state, recent: [...state.recent, ...seen.map(key => ({ key, type: 'video' as Format, stock: false, family: 'seen' }))] } : state
      // Fresh of the day first: the session's first ten videos, at random among the day's list, none this device already saw today.
      const wheel = wheelOn && ticket.type === 'video'
        ? await selectWheel(db, ticket, drawState, parseFreshSeen(body.fresh), deps.decode, language(body), Math.random, Date.now(), theme ?? themeAt(state.seed, state.visuals), parseSeenSubjects(body.seenSubjects)).catch(() => null) : null
      const fresh = !wheel && freshEnabled() && ticket.type === 'video'
        ? await selectFresh(db, ticket, drawState, parseFreshSeen(body.fresh), deps.decode, Date.now(), Math.random, theme).catch(() => null) : null
      // The cool pool: a cool visual ticket is one content drawn live from the source the session's bag names.
      // The lanes remain the fallback when the pool holds nothing eligible for this visitor.
      // The dig: a base, a level, a subject the session has not seen, one of its videos.
      const dig = !wheel && !fresh && digOn && ticket.type === 'video'
        ? await selectDig(db, ticket, drawState, deps.decode, Math.random, Date.now()).catch(() => null) : null
      const cool = !wheel && !fresh && !dig && coolPoolEnabled() && ticket.mode === 'cool' && isVisual(ticket.type)
        ? await selectCool(db, ticket, drawState, deps.decode, Math.random, Date.now(), theme).catch(() => null) : null
      const choice = wheel ?? fresh ?? dig ?? cool ?? await selectPool(db, ticket, drawState, language(body), deps.decode, Math.random, Date.now(), body.factVariant === 'quiz' || body.factVariant === 'text' ? body.factVariant : undefined, curatorOwnerId(), theme)
      if (!choice) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
      // The site's count of what it served (lib/discovery/served.ts): one write per visual, so the least served wins next time on every device.
      if (servedCountOn() && isVisual(choice.item.type) && choice.item.id) await countServed(db, choice.item.id, Date.now()).catch(() => false)
      // What the device kept on screen since its last draw (lib/discovery/kept.ts): the slow curation's only input.
      const kept = parseKept(body.kept)
      if (servedCountOn() && kept.length) await recordKept(db, kept).catch(() => 0)
      await deps.onSelected?.(choice.item, language(body), req).catch(() => undefined)
      const publicCandidate = { ...choice.item }
      delete publicCandidate.editorialFamilies; delete publicCandidate.directEditorialReference
      // The card rides on the item, so the device can say how long each card's video was kept (lib/discovery/kept.ts).
      if (wheel) publicCandidate.payload = { ...(publicCandidate.payload as object), card: wheel.wheel.fallback ? 'joker' : wheel.wheel.slot === 'bonus' && wheel.wheel.universe ? `bonus:${wheel.wheel.universe}` : wheel.wheel.slot } as T
      return json({ version: 2, candidate: publicCandidate, branch: choice.branch, fallback: choice.fallback, selection: choice.selection, ...(theme ? { theme } : {}), ...(wheel ? { wheel: wheel.wheel } : {}), ...(dig ? { dig: dig.dig } : {}),
        ...(cool ? { cool: cool.cool, build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local' } : {}) })
    } catch { return json({ error: 'unavailable' }, 503) }
  }
}
export function waveHandler<T>(deps: Dependencies<T>) {
  const cache = new Map<string, { expiresAt: number; body: Record<string, unknown> }>()
  const remember = (key: string, body: Record<string, unknown>, ttlMs: number) => {
    cache.delete(key)
    cache.set(key, { expiresAt: Date.now() + ttlMs, body })
    while (cache.size > 64) {
      const oldest = cache.keys().next().value
      if (typeof oldest !== 'string') break
      cache.delete(oldest)
    }
  }
  return async (req: Request): Promise<Response> => {
    if (!deps.enabled() && !curatorRequestAllowed(req)) return json({ error: 'disabled' }, 404)
    try {
      const body = await bodyOf(req)
      if (!body || typeof body.anchorId !== 'string' || !/^[a-f\d]{24}$/i.test(body.anchorId)) return json({ error: 'invalid-anchor' }, 400)
      const lang = language(body)
      const requested = Array.isArray(body.types) ? body.types : FORMATS
      const types = FORMATS.filter(x => requested.includes(x))
      const excluded = Array.isArray(body.excludeKeys) ? body.excludeKeys.filter((x): x is string => typeof x === 'string' && x.length <= 2048).slice(0, 80) : []
      const cacheKey = JSON.stringify([body.anchorId, lang, types, [...new Set(excluded)].sort()])
      const cached = cache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) return json(cached.body)
      if (cached) cache.delete(cacheKey)
      const db = await withAbortDeadline(1500, req.signal, () => deps.getDb()); if (!db) return json({ error: 'unavailable' }, 503)
      const result = await loadWave(db, body.anchorId, lang, types, deps.decode, Math.random, Date.now(), excluded)
      // This queues only an item ID, with a global cap. No provider call or classification
      // service runs on this request. Queue latency cannot hold up Wave preparation.
      if (body.auditOnly !== true && (!result?.plan.ready || result.plan.trio.length < 3)) {
        await withAbortDeadline(220, req.signal, () => requestSubjectWork(db, body.anchorId as string,
          result?.diagnostics.cause ?? 'short-wave')).catch(() => false)
      }
      if (!result?.plan.ready) {
        if (result?.diagnostics.cause === 'retrieval-incomplete') return Response.json({ version: 2,
          ready: false, error: 'retrieval-incomplete', diagnostics: result.diagnostics },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' } })
        const reply = { version: 2, ready: false, reason: 'insufficient-related-content', diagnostics: result?.diagnostics }
        remember(cacheKey, reply, 15_000)
        return json(reply)
      }
      const reply = { version: 2, anchor: result.anchor, ...result.plan, diagnostics: result.diagnostics }
      remember(cacheKey, reply, result.plan.trio.length < 3 ? 30_000 : 5 * 60_000)
      return json(reply)
    } catch { return json({ error: 'unavailable' }, 503) }
  }
}
