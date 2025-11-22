'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ScoreAction = 'random' | 'encourage' | 'quizSuccess' | 'diamond'

type DiamondEvent = { id: string; amount: number; timestamp: number }

type ScoreContextValue = {
  score: number
  addAction: (action: ScoreAction) => void
  addPoints: (amount: number) => void
  maybeSpawnDiamond: () => boolean
  diamonds: DiamondEvent[]
}

const STORAGE_KEY = 'xp-session-total'

const ScoreContext = createContext<ScoreContextValue | undefined>(undefined)

export function ScoreProvider({ children }: { children: ReactNode }) {
  const [score, setScore] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored != null) {
        const parsed = parseInt(stored, 10)
        if (!Number.isNaN(parsed)) {
          setScore(parsed)
        }
      }
    } catch {
      /* ignore */
    }
  }, [])

  const persistScore = useCallback((value: number) => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      /* ignore */
    }
  }, [])

  const addPoints = useCallback(
    (amount: number) => {
      if (!amount || Number.isNaN(amount)) return
      setScore((prev) => {
        const next = Math.max(0, Math.round(prev + amount))
        persistScore(next)
        return next
      })
    },
    [persistScore],
  )

  const noopAddAction = useCallback((action: ScoreAction) => {
    void action
  }, [])

  const noopMaybeSpawnDiamond = useCallback(() => false, [])

  const diamonds = useMemo<DiamondEvent[]>(() => [], [])

  const value = useMemo<ScoreContextValue>(
    () => ({
      score,
      addAction: noopAddAction,
      addPoints,
      maybeSpawnDiamond: noopMaybeSpawnDiamond,
      diamonds,
    }),
    [addPoints, diamonds, noopAddAction, noopMaybeSpawnDiamond, score],
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
