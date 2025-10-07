'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

type ScoreAction = 'random' | 'encourage' | 'quizSuccess' | 'diamond'

type DiamondEvent = { id: string; amount: number; timestamp: number }

type ScoreContextValue = {
  score: number
  addAction: (action: ScoreAction) => void
  addPoints: (amount: number) => void
  maybeSpawnDiamond: () => boolean
  diamonds: DiamondEvent[]
}

const ScoreContext = createContext<ScoreContextValue | undefined>(undefined)

export function ScoreProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ScoreContextValue>(
    () => ({
      score: 0,
      addAction: () => undefined,
      addPoints: () => undefined,
      maybeSpawnDiamond: () => false,
      diamonds: [],
    }),
    [],
  )

  return <ScoreContext.Provider value={value}>{children}</ScoreContext.Provider>
}

export function useScore(): ScoreContextValue {
  const ctx = useContext(ScoreContext)
  if (!ctx) {
    throw new Error('useScore must be used within ScoreProvider')
  }
  return ctx
}
