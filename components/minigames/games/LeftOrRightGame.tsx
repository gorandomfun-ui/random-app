import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'

type Direction = 'L' | 'R'

export default function LeftOrRightGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const normalized = normalizeLevel(level, 18)
  const historySize = Math.min(9, 5 + Math.floor(normalized / 3))
  const goalRounds = Math.min(12, 5 + Math.floor(normalized * 0.7))
  const allowedMistakes = Math.max(1, 3 - Math.floor(normalized / 4))
  const durationMs = Math.round(scaleLevel(normalized, 32000, 15000, 18))

  const [history, setHistory] = useState<Direction[]>([])
  const [round, setRound] = useState(1)
  const [successes, setSuccesses] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [timeLeft, setTimeLeft] = useState(durationMs)
  const [status, setStatus] = useState(
    () => `Choisis la flèche la moins fréquente dans les ${historySize} dernières !`,
  )

  const rngRef = useRef<() => number>(() => Math.random())
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const endedRef = useRef(false)
  const roundRef = useRef(1)
  const successRef = useRef(0)
  const mistakeRef = useRef(0)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const [feedbackIndicator, setFeedbackIndicator] = useState<string | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearFeedback = useCallback(() => {
    if (feedbackTimeoutRef.current != null) {
      clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
  }, [])

  const finalize = useCallback(
    (won: boolean, reason?: string) => {
      if (endedRef.current) return
      endedRef.current = true
      clearTimer()
      clearFeedback()
      onComplete({
        outcome: won ? 'win' : 'lose',
        message: reason,
        details: [
          { label: 'Tours', value: `${roundRef.current - 1} / ${goalRounds}` },
          { label: 'Réussites', value: `${successRef.current}` },
          { label: 'Erreurs', value: `${mistakeRef.current} / ${allowedMistakes}` },
        ],
      })
    },
    [allowedMistakes, clearFeedback, clearTimer, goalRounds, onComplete],
  )

  const describeGuidance = useCallback((hist: Direction[]): string => {
    if (hist.length < historySize) return 'Analyse en cours…'
    const leftCount = hist.filter((entry) => entry === 'L').length
    const rightCount = hist.length - leftCount
    if (leftCount === rightCount) {
      return 'Égalité parfaite : choisis n’importe laquelle.'
    }
    const target = leftCount < rightCount ? '← Gauche' : 'Droite →'
    const diff = Math.abs(leftCount - rightCount)
    return `${target} est la moins fréquente (écart ${diff}).`
  }, [historySize])

  const rollInitialHistory = useCallback(() => {
    const rng = rngRef.current
    const base: Direction[] = []
    for (let i = 0; i < historySize; i += 1) {
      base.push(rng() > 0.5 ? 'L' : 'R')
    }
    setHistory(base)
    setStatus(describeGuidance(base))
  }, [describeGuidance, historySize])

  useEffect(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-left-right`)
    endedRef.current = false
    setRound(1)
    setSuccesses(0)
    setMistakes(0)
    roundRef.current = 1
    successRef.current = 0
    mistakeRef.current = 0
    setStatus(describeGuidance([]))
    rollInitialHistory()
    startRef.current = Date.now()
    setTimeLeft(durationMs)
    clearTimer()
    clearFeedback()
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current
      const remaining = Math.max(0, durationMs - elapsed)
      setTimeLeft(remaining)
      if (remaining <= 0) {
        finalize(false, 'Le temps est écoulé.')
      }
    }, 120)
    return () => {
      clearTimer()
       clearFeedback()
      endedRef.current = true
    }
  }, [clearFeedback, clearTimer, describeGuidance, durationMs, finalize, level, rollInitialHistory, seed])

  const computeAllowed = useCallback(
    (hist: Direction[]): Direction[] => {
      const leftCount = hist.filter((item) => item === 'L').length
      const rightCount = hist.length - leftCount
      if (leftCount === rightCount) return ['L', 'R']
      return leftCount < rightCount ? ['L'] : ['R']
    },
    [],
  )

  const advanceHistory = useCallback((hist: Direction[], push: Direction) => {
    const next = [...hist.slice(1), push]
    return next
  }, [])

  const handlePick = (choice: Direction) => {
    if (endedRef.current || history.length < historySize) return
    const allowed = computeAllowed(history)
    const correct = allowed.includes(choice)
    const rng = rngRef.current

    if (correct) {
      const nextSuccess = successRef.current + 1
      successRef.current = nextSuccess
      setSuccesses(nextSuccess)
      setStatus('Bien vu ! Continue.')
    } else {
      const nextMistake = mistakeRef.current + 1
      mistakeRef.current = nextMistake
      setMistakes(nextMistake)
      if (nextMistake > allowedMistakes) {
        finalize(false, 'Trop d’erreurs.')
        return
      }
      setStatus('Oups, ce n’était pas la meilleure option…')
    }

    const nextArrow = rng() > 0.5 ? 'L' : 'R'
    const updated = advanceHistory(history, correct ? choice : nextArrow)
    setHistory(updated)

    const nextRound = roundRef.current + 1
    roundRef.current = nextRound
    setRound(nextRound)

    if (nextRound > goalRounds) {
      const minSuccess = goalRounds - allowedMistakes
      const win = successRef.current >= minSuccess && mistakeRef.current <= allowedMistakes
      finalize(win, win ? 'Challenge complété !' : 'Encore une erreur de trop.')
      return
    }

    const guidance = describeGuidance(updated)
    const feedback = correct ? 'Bien vu !' : 'Essaie l’autre sens.'
    setStatus(`${feedback} ${guidance}`)
    const indicator = correct ? '👍' : '✖'
    setFeedbackIndicator(indicator)
    clearFeedback()
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedbackIndicator(null)
    }, 720)
  }

  const ready = history.length >= historySize
  const counts = ready
    ? {
        left: history.filter((entry) => entry === 'L').length,
        right: history.filter((entry) => entry === 'R').length,
      }
    : { left: 0, right: 0 }
  const currentTarget = ready ? computeAllowed(history) : []
  const targetLabel = !ready
    ? '...'
    : currentTarget.length === 2
      ? '← ou →'
      : currentTarget.includes('L')
        ? '← Gauche'
        : 'Droite →'

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
        {status}
      </div>
      <div className="flex gap-3 text-lg font-mono" style={{ color: theme.cream }}>
        {history.map((entry, idx) => (
          <span key={idx} className={idx === history.length - 1 ? 'opacity-100' : 'opacity-60'}>
            {entry === 'L' ? '←' : '→'}
          </span>
        ))}
      </div>
      <div className="text-xs font-inter opacity-70" style={{ color: theme.cream }}>
        Derniers {historySize}&nbsp;: ← {counts.left} · → {counts.right}
      </div>
      <div className="text-xs font-tomorrow uppercase tracking-[0.18em]" style={{ color: theme.cream }}>
        Cible&nbsp;: {targetLabel}
      </div>
      {feedbackIndicator ? (
        <div className="text-xl font-tomorrow" style={{ color: theme.cream }}>
          {feedbackIndicator}
        </div>
      ) : null}
      <div className="flex gap-6">
        <button
          type="button"
          onClick={() => handlePick('L')}
          className="rounded-full px-5 py-3 font-tomorrow text-lg font-bold uppercase tracking-[0.12em]"
          disabled={!ready}
          style={{
            backgroundColor: currentTarget.length === 1 && currentTarget.includes('L') ? theme.text : 'rgba(0,0,0,0.4)',
            color: theme.cream,
            opacity: ready ? 1 : 0.4,
          }}
        >
          ← Gauche
        </button>
        <button
          type="button"
          onClick={() => handlePick('R')}
          className="rounded-full px-5 py-3 font-tomorrow text-lg font-bold uppercase tracking-[0.12em]"
          disabled={!ready}
          style={{
            backgroundColor: currentTarget.length === 1 && currentTarget.includes('R') ? theme.text : 'rgba(0,0,0,0.4)',
            color: theme.cream,
            opacity: ready ? 1 : 0.4,
          }}
        >
          Droite →
        </button>
      </div>
      <div className="text-xs font-inter uppercase tracking-[0.18em] opacity-70" style={{ color: theme.cream }}>
        Round {round}/{goalRounds} · Réussites {successes} · Erreurs {mistakes}/{allowedMistakes} · Temps {(timeLeft / 1000).toFixed(1)} s
      </div>
    </div>
  )
}
