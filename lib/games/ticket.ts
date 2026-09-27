/**
 * The ticket a game gets from the server when it starts, and hands back with
 * its score: signed, so a score cannot be sent for a game the server never
 * saw begin, nor claim to have begun earlier than it did. Server only.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type { GameName } from './scores'

/** A game in the Random flow can run over weeks, a level at a time. */
export const TICKET_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

function secret(): string | null {
  const own = (process.env.GAMES_SCORE_SECRET || '').trim()
  if (own) return own
  // without its own setting, a key drawn from the database's: the same on every server, never shown
  const base = (process.env.MONGODB_URI || '').trim()
  return base ? createHash('sha256').update(`random-games-ticket:${base}`).digest('hex') : null
}

const sign = (key: string, game: GameName, runId: string, startedAt: number) => createHmac('sha256', key).update(`${game}|${runId}|${startedAt}`).digest('hex')

export function issueTicket(game: GameName, now = Date.now()): { runId: string; token: string; startedAt: number } | null {
  const key = secret()
  if (!key) return null
  const runId = randomBytes(12).toString('hex')
  return { runId, startedAt: now, token: sign(key, game, runId, now) }
}

export function checkTicket(game: GameName, runId: unknown, token: unknown, startedAt: unknown, now = Date.now()): boolean {
  const key = secret()
  if (!key || typeof runId !== 'string' || !/^[0-9a-f]{24}$/.test(runId) || typeof token !== 'string' || typeof startedAt !== 'number') return false
  if (startedAt > now + 60_000 || now - startedAt > TICKET_MAX_AGE_MS) return false
  const expected = Buffer.from(sign(key, game, runId, startedAt))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
