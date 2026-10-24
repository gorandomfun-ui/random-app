/**
 * The one question asked of Dailymotion about an account: its latest uploads, a hundred at most, with what the rule
 * reads (lib/v3/bait/rule.ts) and the titles for the list's sample. Free, no key, like every call to them.
 */

import type { Upload } from './rule'

const USER_AGENT = 'RandomIngest/1.0 (+https://www.gorandom.fun)'
const FIELDS = 'id,title,description,duration,created_time'
/** Dailymotion's largest page, the most evidence one call can bring: ten would have condemned two real accounts (rule.ts). */
export const UPLOADS_ASKED = 100
const TIMEOUT_MS = 10_000

/** An answer Dailymotion refused: the run stops asking on 403 and 429, and leaves the account for another night. */
export class DailymotionRefusal extends Error {
  constructor(readonly status: number) {
    super(`Dailymotion HTTP ${status}`)
    this.name = 'DailymotionRefusal'
  }
}

/** `gone`: Dailymotion knows no such account any more (404, 410) — nothing of it can enter. */
export type AccountAnswer = { gone: false; uploads: Upload[]; total: number | null } | { gone: true }

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** The account's latest uploads, newest first. `ownerId` is Dailymotion's own id ("x1cfbdd"). */
export async function askUploads(ownerId: string, request: typeof fetch = fetch, signal?: AbortSignal): Promise<AccountAnswer> {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(UPLOADS_ASKED), sort: 'recent' })
  const response = await request(`https://api.dailymotion.com/user/${encodeURIComponent(ownerId)}/videos?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.status === 404 || response.status === 410) return { gone: true }
  if (!response.ok) throw new DailymotionRefusal(response.status)
  const payload = (await response.json()) as { list?: unknown; total?: unknown }
  const rows = Array.isArray(payload.list) ? (payload.list as Array<Record<string, unknown>>) : []
  const uploads = rows.map((row): Upload => ({
    id: text(row.id),
    title: text(row.title),
    description: text(row.description),
    duration: typeof row.duration === 'number' ? row.duration : null,
    created_time: typeof row.created_time === 'number' ? row.created_time : null,
  }))
  return { gone: false, uploads, total: count(payload.total) }
}
