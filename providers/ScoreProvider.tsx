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

/**
 * One counter of points, for the whole site.
 *
 * There used to be two, both labelled "PTS": the quiz total, kept for good in
 * the browser's lasting store, and an XP total kept in the session store, which
 * a closed tab wiped and which almost nothing ever fed — the function the draws
 * called to award it was an empty shell. The home menu showed one, the Random
 * menu the other, and they never agreed.
 *
 * Now: a single number, kept where the quiz total was kept, so it survives a
 * closed tab, a closed browser and a phone that puts the page to sleep. The old
 * quiz total is carried into it, so nobody loses what they had. The games will
 * award through the same door.
 *
 * It lives in the browser of one device: a phone and a computer each keep their
 * own. Sharing them would take an account.
 */

type ScoreContextValue = {
  /** Everything earned on this device, ever. */
  points: number
  /** Awards points. Negative or absurd amounts are ignored. */
  addPoints: (amount: number) => void
}

const STORAGE_KEY = 'random-points-total'
/** Where the quiz total used to live, read once so nothing is lost. */
const LEGACY_QUIZ_KEY = 'random-quiz-score-total'

function readStored(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored != null) {
      const parsed = parseInt(stored, 10)
      if (!Number.isNaN(parsed)) return Math.max(0, parsed)
    }
    const legacy = localStorage.getItem(LEGACY_QUIZ_KEY)
    if (legacy != null) {
      const parsed = parseInt(legacy, 10)
      if (!Number.isNaN(parsed)) return Math.max(0, parsed)
    }
  } catch {
    /* A browser that refuses its store simply starts at zero. */
  }
  return 0
}

const ScoreContext = createContext<ScoreContextValue | undefined>(undefined)

export function ScoreProvider({ children }: { children: ReactNode }) {
  const [points, setPoints] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setPoints(readStored())
    // Another tab of the site earning points keeps this one in step.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue == null) return
      const parsed = parseInt(event.newValue, 10)
      if (!Number.isNaN(parsed)) setPoints(Math.max(0, parsed))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addPoints = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return
    setPoints((previous) => {
      const next = Math.max(0, Math.round(previous + amount))
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        /* The number still counts for this visit. */
      }
      return next
    })
  }, [])

  const value = useMemo<ScoreContextValue>(() => ({ points, addPoints }), [addPoints, points])

  return <ScoreContext.Provider value={value}>{children}</ScoreContext.Provider>
}

export function useScore(): ScoreContextValue {
  const ctx = useContext(ScoreContext)
  if (!ctx) {
    throw new Error('useScore must be used within ScoreProvider')
  }
  return ctx
}
