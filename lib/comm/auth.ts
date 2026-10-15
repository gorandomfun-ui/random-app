/** The tool's routes answer the curator only: the curation cookie, and the site's own origin for writes. */

import type { Db } from 'mongodb'

import { getDb } from '@/lib/db'
import { curatorRequestAllowed, sameOrigin } from '@/lib/discovery/curatorAuth'
import { ensureCommIndexes } from './model'

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export function commAllowed(req: Request, write = false): boolean {
  if (!curatorRequestAllowed(req)) return false
  return write ? sameOrigin(req) : true
}

let ensured: Promise<void> | null = null

/** The database, with the tool's indexes created once per process. */
export async function commDb(): Promise<Db> {
  const db = await getDb()
  if (!ensured) ensured = ensureCommIndexes(db).catch(() => { ensured = null })
  await ensured
  return db
}
