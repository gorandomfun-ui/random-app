/**
 * What the config page shows: configured, missing or expired, never a value.
 * The token's age is a date kept in the base (the token itself never is):
 * the day it was first seen, or the day it was last refreshed.
 */

import type { Db } from 'mongodb'
import { createHash } from 'node:crypto'

import { igConfig, igMe, igPublishingLimit, igRefreshToken, type IgFetch } from './instagram'

const COLLECTION = 'comm_config'
export const TOKEN_DAYS = 60

export type InstagramState = {
  configured: boolean
  account: { id: string; username: string | null; type: string | null } | null
  tokenSeenAt: string | null
  tokenAgeDays: number | null
  expiresInDays: number | null
  quota: { used: number; total: number } | null
  error: string | null
}

const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 16)

/** The day this token was first seen; a new token starts a new count. */
async function tokenSeenAt(db: Db, token: string): Promise<Date> {
  const key = `instagram-token:${fingerprint(token)}`
  const row = await db.collection(COLLECTION).findOneAndUpdate({ _id: key } as never, { $setOnInsert: { seenAt: new Date() } }, { upsert: true, returnDocument: 'after', maxTimeMS: 2500 })
  return row?.seenAt instanceof Date ? row.seenAt : new Date()
}

export async function instagramState(db: Db, fetchImpl: IgFetch): Promise<InstagramState> {
  const config = igConfig()
  if (!config) return { configured: false, account: null, tokenSeenAt: null, tokenAgeDays: null, expiresInDays: null, quota: null, error: null }
  const seen = await tokenSeenAt(db, config.token)
  const ageDays = Math.floor((Date.now() - seen.getTime()) / 86_400_000)
  const state: InstagramState = { configured: true, account: { id: config.accountId, username: null, type: null }, tokenSeenAt: seen.toISOString(), tokenAgeDays: ageDays, expiresInDays: Math.max(0, TOKEN_DAYS - ageDays), quota: null, error: null }
  try {
    const me = await igMe(fetchImpl, config.token)
    state.account = { id: config.accountId, username: me.username ?? null, type: me.account_type ?? null }
    const limit = await igPublishingLimit(fetchImpl, config)
    const row = limit.data?.[0]
    if (row && typeof row.quota_usage === 'number') state.quota = { used: row.quota_usage, total: row.config?.quota_total ?? 0 }
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Instagram n’a pas répondu.'
  }
  return state
}

/** A fresh token, shown once for the curator to put into Vercel; the base keeps only its date. */
export async function refreshInstagramToken(db: Db, fetchImpl: IgFetch): Promise<{ ok: true; token: string; expiresInDays: number } | { ok: false; reason: string }> {
  const config = igConfig()
  if (!config) return { ok: false, reason: 'Instagram n’est pas configuré.' }
  try {
    const result = await igRefreshToken(fetchImpl, config.token)
    await db.collection(COLLECTION).updateOne({ _id: `instagram-token:${fingerprint(result.access_token)}` } as never, { $set: { seenAt: new Date(), refreshed: true } }, { upsert: true })
    return { ok: true, token: result.access_token, expiresInDays: Math.round(result.expires_in / 86_400) }
  } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : 'Instagram n’a pas répondu.' } }
}
