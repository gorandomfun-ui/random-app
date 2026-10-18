export const runtime = 'nodejs'
export const maxDuration = 10

import { NextResponse } from 'next/server'

import { isGameName } from '@/lib/games/scores'
import { issueTicket } from '@/lib/games/ticket'
import { consumeRateLimit } from '@/lib/v3/rateLimit'

/** A game begins: its signed ticket, to be handed back with its score. */
export async function POST(request: Request) {
  // Counted in the base, the same on every server (it was counted per server until 18 October).
  if (!(await consumeRateLimit({ req: request, route: 'games-run', limit: 30, windowMs: 10 * 60 * 1000 })).allowed) return NextResponse.json({ error: 'Too many games' }, { status: 429 })
  const body = await request.json().catch(() => null) as { game?: unknown } | null
  const game = body?.game
  if (!isGameName(game)) return NextResponse.json({ error: 'Unknown game' }, { status: 400 })
  const ticket = issueTicket(game)
  if (!ticket) return NextResponse.json({ error: 'Scores unavailable' }, { status: 503 })
  return NextResponse.json(ticket, { headers: { 'Cache-Control': 'no-store' } })
}
