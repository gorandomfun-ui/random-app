import type { Metadata } from 'next'

import GameTestGate from '@/components/games/GameTestGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'RANDOM CATCHER — test',
  robots: { index: false, follow: false },
}

/** RANDOM CATCHER, to be tried on its own before it goes into Random. */
export default function CatcherTestPage() {
  return <GameTestGate game="catcher" />
}
