import { timingSafeEqual } from 'node:crypto'

/**
 * Single entry point for administrative authentication.
 *
 * Accepted proofs, and nothing else:
 *   - header `x-admin-ingest-key` equal to ADMIN_INGEST_KEY
 *   - header `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set
 *
 * Deliberately refused:
 *   - the key passed as a URL parameter (`?key=`), because it leaks into
 *     access logs, proxies, browser history and referrers
 *   - the `x-vercel-cron` header and the user agent, because a client
 *     chooses them freely
 *   - every request when ADMIN_INGEST_KEY is empty
 */

export const ADMIN_KEY_HEADER = 'x-admin-ingest-key'

const BEARER_PREFIX = 'bearer '

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8')
  const rightBytes = Buffer.from(right, 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
}

function adminKey(): string {
  return (process.env.ADMIN_INGEST_KEY || '').trim()
}

function cronSecret(): string {
  return (process.env.CRON_SECRET || '').trim()
}

function bearerToken(req: Request): string {
  const authorization = (req.headers.get('authorization') || '').trim()
  if (!authorization.toLowerCase().startsWith(BEARER_PREFIX)) return ''
  return authorization.slice(BEARER_PREFIX.length).trim()
}

/** Which proof the caller supplied, or null when none is valid. */
export type AdminRequestKind = 'admin-key' | 'cron-secret'

export function adminRequestKind(req: Request): AdminRequestKind | null {
  const expectedAdminKey = adminKey()
  if (!expectedAdminKey) return null

  const providedAdminKey = (req.headers.get(ADMIN_KEY_HEADER) || '').trim()
  if (providedAdminKey && constantTimeEquals(providedAdminKey, expectedAdminKey)) {
    return 'admin-key'
  }

  const expectedCronSecret = cronSecret()
  if (!expectedCronSecret) return null

  const providedCronSecret = bearerToken(req)
  if (!providedCronSecret) return null

  return constantTimeEquals(providedCronSecret, expectedCronSecret) ? 'cron-secret' : null
}

export function isAdminRequest(req: Request): boolean {
  return adminRequestKind(req) !== null
}

/** The only body ever returned on refusal: no key, no length, no preview. */
export function adminUnauthorizedBody(): { error: string } {
  return { error: 'Unauthorized' }
}

/** Headers an internal server-to-server call must carry to be accepted. */
export function adminAuthHeaders(): Record<string, string> {
  const key = adminKey()
  return key ? { [ADMIN_KEY_HEADER]: key } : {}
}
