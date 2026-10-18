export const runtime = 'nodejs'
export const maxDuration = 10

import { NextResponse } from 'next/server'

import { submitWorld, worldName } from '@/lib/games/leaderboard'
import { plausible } from '@/lib/games/plausible'
import { isGameName } from '@/lib/games/scores'
import { checkTicket } from '@/lib/games/ticket'
import { addressKey, consumeRateLimit } from '@/lib/v3/rateLimit'

/**
 * A game's score for the world's table: with the ticket the game got when
 * it began, a score the rules make possible, a name the table can show.
 * Sent again as the game goes on; the entry only ever goes up.
 */
export async function POST(request: Request) {
  // Counted in the base, the same on every server (it was counted per server until 18 October).
  if (!(await consumeRateLimit({ req: request, route: 'games-score', limit: 40, windowMs: 10 * 60 * 1000 })).allowed) return NextResponse.json({ error: 'Too many scores' }, { status: 429 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const game = body?.game
  if (!isGameName(game)) return NextResponse.json({ error: 'Unknown game' }, { status: 400 })
  const { runId, token, startedAt, score, level } = body as { runId: unknown; token: unknown; startedAt: unknown; score: unknown; level: unknown }
  const won = body?.won === true
  const now = Date.now()
  if (!checkTicket(game, runId, token, startedAt, now)) return NextResponse.json({ error: 'Bad ticket' }, { status: 403 })
  if (typeof score !== 'number' || typeof level !== 'number' || !plausible(game, score, level, won, now - (startedAt as number))) {
    return NextResponse.json({ error: 'Implausible score' }, { status: 422 })
  }
  try {
    const place = await submitWorld(game, { runId: runId as string, name: worldName(body?.name), score, level, won, at: now, who: addressKey(request) })
    return NextResponse.json({ place }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Scores unavailable' }, { status: 503 })
  }
}
