export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

import { submitWorld, worldName } from '@/lib/games/leaderboard'
import { plausible } from '@/lib/games/plausible'
import { checkTicket } from '@/lib/games/ticket'
import { checkRateLimit } from '@/lib/utils/rate-limit'

/**
 * A game's score for the world's table: with the ticket the game got when
 * it began, a score the rules make possible, a name the table can show.
 * Sent again as the game goes on; the entry only ever goes up.
 */
export async function POST(request: Request) {
  const who = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (!checkRateLimit(`games-score:${who}`, 40, 10 * 60 * 1000)) return NextResponse.json({ error: 'Too many scores' }, { status: 429 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const game = body?.game
  if (game !== 'catcher' && game !== 'eater') return NextResponse.json({ error: 'Unknown game' }, { status: 400 })
  const { runId, token, startedAt, score, level } = body as { runId: unknown; token: unknown; startedAt: unknown; score: unknown; level: unknown }
  const won = body?.won === true
  const now = Date.now()
  if (!checkTicket(game, runId, token, startedAt, now)) return NextResponse.json({ error: 'Bad ticket' }, { status: 403 })
  if (typeof score !== 'number' || typeof level !== 'number' || !plausible(game, score, level, won, now - (startedAt as number))) {
    return NextResponse.json({ error: 'Implausible score' }, { status: 422 })
  }
  try {
    const place = await submitWorld(game, { runId: runId as string, name: worldName(body?.name), score, level, won, at: now })
    return NextResponse.json({ place }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Scores unavailable' }, { status: 503 })
  }
}
