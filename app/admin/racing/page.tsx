import type { Metadata } from 'next'

import GameTestGate from '@/components/games/GameTestGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'RANDOM RACING — test',
  robots: { index: false, follow: false },
}

/** RANDOM RACING, to be tried on its own before it goes into Random; `?niveau=8` starts a game at level 8, to try it without driving up to it. */
export default function RacingTestPage({ searchParams }: { searchParams: { niveau?: string } }) {
  const level = Math.round(Number(searchParams.niveau))
  return <GameTestGate game="racing" startLevel={level >= 1 && level <= 16 ? level : undefined} />
}
