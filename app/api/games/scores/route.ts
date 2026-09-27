export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { readWorld } from '@/lib/games/leaderboard'

/** The world's two hundred best of a game, best first. */
export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get('game')
  if (game !== 'catcher' && game !== 'eater') return NextResponse.json({ error: 'Unknown game' }, { status: 400 })
  try {
    const entries = await readWorld(game)
    return NextResponse.json(
      { entries: entries.map(({ runId, name, score, level, won }) => ({ runId, name, score, level, won })) },
      { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' } },
    )
  } catch {
    return NextResponse.json({ entries: [] }, { status: 503 })
  }
}
