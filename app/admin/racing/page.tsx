import type { Metadata } from 'next'

import GameTestGate from '@/components/games/GameTestGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'RANDOM RACING — test',
  robots: { index: false, follow: false },
}

/**
 * RANDOM RACING, to be tried on its own before it goes into Random;
 * `?niveau=8` starts a game at level 8, to try it without driving up to it;
 * `?univers=montagne` (`cote`, `desert`, `ville`) keeps every level in one
 * world, to try it without waiting for it to come up.
 */
export default function RacingTestPage({ searchParams }: { searchParams: { niveau?: string; univers?: string } }) {
  const level = Math.round(Number(searchParams.niveau))
  const world = ({ cote: 'coast', montagne: 'mountain', desert: 'desert', ville: 'city' } as const)[searchParams.univers as 'cote']
  return <GameTestGate game="racing" startLevel={level >= 1 && level <= 16 ? level : undefined} startWorld={world} />
}
