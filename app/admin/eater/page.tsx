import type { Metadata } from 'next'

import GameTestGate from '@/components/games/GameTestGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'RANDOM EATER — test',
  robots: { index: false, follow: false },
}

/** RANDOM EATER, to be tried on its own before it goes into Random. */
export default function EaterTestPage() {
  return <GameTestGate game="eater" />
}
