import type { Metadata } from 'next'

import GameTestGate from '@/components/games/GameTestGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'RANDOM ATTACKS — test',
  robots: { index: false, follow: false },
}

/** RANDOM ATTACKS, to be tried on its own before it goes into Random; `?niveau=8` starts a game at level 8, to try a boss without playing up to it. */
export default function AttacksTestPage({ searchParams }: { searchParams: { niveau?: string } }) {
  const level = Math.round(Number(searchParams.niveau))
  return <GameTestGate game="attacks" startLevel={level >= 1 && level <= 16 ? level : undefined} />
}
