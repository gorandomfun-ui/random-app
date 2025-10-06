'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'randomapp:score'

const ACTION_POINTS = {
  random: 1,
  encourage: 10,
  quizSuccess: 5,
  diamond: 3,
} as const

type ScoreAction = keyof typeof ACTION_POINTS

type DiamondEvent = {
  id: string
  amount: number
  timestamp: number
}

type ScoreContextValue = {
  score: number
  addAction: (action: ScoreAction) => void
  addPoints: (amount: number) => void
  maybeSpawnDiamond: () => boolean
  diamonds: DiamondEvent[]
}

const ScoreContext = createContext<ScoreContextValue | undefined>(undefined)

function readStoredScore(): number {
  if (typeof window === 'undefined') return 0
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

export function ScoreProvider({ children }: { children: ReactNode }) {
  const [score, setScore] = useState(0)
  const [diamonds, setDiamonds] = useState<DiamondEvent[]>([])
  const loadedRef = useRef(false)
  const counterRef = useRef(0)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    try {
      setScore(readStoredScore())
    } catch {
      setScore(0)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(STORAGE_KEY, String(score))
    } catch {
      /* ignore */
    }
  }, [score])

  const addPoints = useCallback((amount: number) => {
    if (!amount) return
    setScore((prev) => Math.max(0, prev + amount))
  }, [])

  const spawnDiamond = useCallback((amount: number) => {
    const id = `diamond-${Date.now()}-${(counterRef.current += 1)}`
    const event: DiamondEvent = { id, amount, timestamp: Date.now() }
    setDiamonds((prev) => [...prev, event])
    setTimeout(() => {
      setDiamonds((prev) => prev.filter((item) => item.id !== id))
    }, 1200)
  }, [])

  const addAction = useCallback((action: ScoreAction) => {
    const amount = ACTION_POINTS[action]
    if (!amount) return
    addPoints(amount)
    if (action === 'diamond') {
      spawnDiamond(amount)
    }
  }, [addPoints, spawnDiamond])

  const maybeSpawnDiamond = useCallback(() => {
    const probability = 0.15
    if (Math.random() <= probability) {
      addAction('diamond')
      return true
    }
    return false
  }, [addAction])

  const value = useMemo<ScoreContextValue>(() => ({
    score,
    addAction,
    addPoints,
    maybeSpawnDiamond,
    diamonds,
  }), [score, addAction, addPoints, maybeSpawnDiamond, diamonds])

  return <ScoreContext.Provider value={value}>{children}</ScoreContext.Provider>
}

export function useScore(): ScoreContextValue {
  const ctx = useContext(ScoreContext)
  if (!ctx) {
    throw new Error('useScore must be used within ScoreProvider')
  }
  return ctx
}
