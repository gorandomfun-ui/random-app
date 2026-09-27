export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

import { issueTicket } from '@/lib/games/ticket'
import { checkRateLimit } from '@/lib/utils/rate-limit'

/** A game begins: its signed ticket, to be handed back with its score. */
export async function POST(request: Request) {
  const who = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (!checkRateLimit(`games-run:${who}`, 30, 10 * 60 * 1000)) return NextResponse.json({ error: 'Too many games' }, { status: 429 })
  const body = await request.json().catch(() => null) as { game?: unknown } | null
  const game = body?.game
  if (game !== 'catcher' && game !== 'eater') return NextResponse.json({ error: 'Unknown game' }, { status: 400 })
  const ticket = issueTicket(game)
  if (!ticket) return NextResponse.json({ error: 'Scores unavailable' }, { status: 503 })
  return NextResponse.json(ticket, { headers: { 'Cache-Control': 'no-store' } })
}
