/**
 * The world's scores, from the browser: a ticket when a game begins, the
 * score sent with it, the table read back. Everything fails quietly — no
 * network, no world table, the game goes on.
 */

import type { GameName } from '@/lib/games/scores'

export type Ticket = { runId: string; token: string; startedAt: number }
export type WorldRow = { runId: string; name: string; score: number; level: number; won: boolean }

export async function fetchTicket(game: GameName): Promise<Ticket | null> {
  try {
    const response = await fetch('/api/games/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game }) })
    if (!response.ok) return null
    const body = await response.json() as Partial<Ticket>
    return typeof body.runId === 'string' && typeof body.token === 'string' && typeof body.startedAt === 'number' ? (body as Ticket) : null
  } catch { return null }
}

/** Sends a game's score; its place in the world's two hundred, or 0. */
export async function sendScore(game: GameName, ticket: Ticket, score: { name: string; score: number; level: number; won: boolean }): Promise<number> {
  try {
    const response = await fetch('/api/games/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game, ...ticket, ...score }) })
    if (!response.ok) return 0
    const body = await response.json() as { place?: number }
    return typeof body.place === 'number' ? body.place : 0
  } catch { return 0 }
}

export async function fetchWorld(game: GameName): Promise<WorldRow[] | null> {
  try {
    const response = await fetch(`/api/games/scores?game=${game}`)
    if (!response.ok) return null
    const body = await response.json() as { entries?: WorldRow[] }
    return Array.isArray(body.entries) ? body.entries : null
  } catch { return null }
}
