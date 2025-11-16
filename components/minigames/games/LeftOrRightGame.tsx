import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'
import { useI18n } from '@/providers/I18nProvider'
import { formatI18n } from '@/lib/i18n/format'

type Direction = 'L' | 'R'

export default function LeftOrRightGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const { t } = useI18n()
  const baseKey = 'minigames.games.left-or-right'
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
  const introTemplate = t(
    `${baseKey}.status.intro`,
    'Choisis la flèche la moins fréquente dans les {count} dernières !',
  )
  const analyzingLabel = t(`${baseKey}.status.analyzing`, 'Analyse en cours…')
  const tieLabel = t(`${baseKey}.status.tie`, 'Égalité parfaite : choisis n’importe laquelle.')
  const guidanceTemplate = t(
    `${baseKey}.status.guidance`,
    '{direction} est la moins fréquente (écart {diff}).',
  )
  const correctStatus = t(`${baseKey}.status.correct`, 'Bien vu ! Continue.')
  const mistakeStatus = t(`${baseKey}.status.mistake`, 'Oups, ce n’était pas la meilleure option…')
  const tooManyMessage = t(`${baseKey}.messages.tooMany`, 'Trop d’erreurs.')
  const successMessage = t(`${baseKey}.messages.success`, 'Challenge complété !')
  const failMessage = t(`${baseKey}.messages.fail`, 'Encore une erreur de trop.')
  const timeMessage = t(`${baseKey}.messages.time`, 'Le temps est écoulé.')
  const feedbackCorrect = t(`${baseKey}.feedback.correct`, 'Bien vu !')
  const feedbackWrong = t(`${baseKey}.feedback.wrong`, 'Essaie l’autre sens.')
  const directionLeftLabel = t(`${baseKey}.directions.left`, '← Gauche')
  const directionRightLabel = t(`${baseKey}.directions.right`, 'Droite →')
  const directionEitherLabel = t(`${baseKey}.directions.either`, '← ou →')
  const hudHistoryTemplate = t(
    `${baseKey}.hud.history`,
    'Derniers {count} : ← {left} · → {right}',
  )
  const hudTargetTemplate = t(`${baseKey}.hud.target`, 'Cible : {label}')
  const hudRoundTemplate = t(
    `${baseKey}.hud.round`,
    'Round {round}/{total} · Réussites {successes} · Erreurs {mistakes}/{allowed} · Temps {seconds}s',
  )
  const detailRoundsLabel = t(`${baseKey}.details.rounds`, 'Tours')
  const detailSuccessLabel = t(`${baseKey}.details.success`, 'Réussites')
  const detailErrorsLabel = t(`${baseKey}.details.errors`, 'Erreurs')
  const [status, setStatus] = useState(() =>
    formatI18n(introTemplate, { count: historySize }),
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
          { label: detailRoundsLabel, value: `${roundRef.current - 1} / ${goalRounds}` },
          { label: detailSuccessLabel, value: `${successRef.current}` },
          { label: detailErrorsLabel, value: `${mistakeRef.current} / ${allowedMistakes}` },
        ],
      })
    },
    [
      allowedMistakes,
      clearFeedback,
      clearTimer,
      detailErrorsLabel,
      detailRoundsLabel,
      detailSuccessLabel,
      goalRounds,
      onComplete,
    ],
  )

  const describeGuidance = useCallback((hist: Direction[]): string => {
    if (hist.length < historySize) return analyzingLabel
    const leftCount = hist.filter((entry) => entry === 'L').length
    const rightCount = hist.length - leftCount
    if (leftCount === rightCount) {
      return tieLabel
    }
    const target = leftCount < rightCount ? directionLeftLabel : directionRightLabel
    const diff = Math.abs(leftCount - rightCount)
    return formatI18n(guidanceTemplate, { direction: target, diff })
  }, [analyzingLabel, directionLeftLabel, directionRightLabel, guidanceTemplate, historySize, tieLabel])

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
        finalize(false, timeMessage)
      }
    }, 120)
    return () => {
      clearTimer()
       clearFeedback()
      endedRef.current = true
    }
  }, [clearFeedback, clearTimer, describeGuidance, durationMs, finalize, level, rollInitialHistory, seed, timeMessage])

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
      setStatus(correctStatus)
    } else {
      const nextMistake = mistakeRef.current + 1
      mistakeRef.current = nextMistake
      setMistakes(nextMistake)
      if (nextMistake > allowedMistakes) {
        finalize(false, tooManyMessage)
        return
      }
      setStatus(mistakeStatus)
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
      finalize(win, win ? successMessage : failMessage)
      return
    }

    const guidance = describeGuidance(updated)
    const feedback = correct ? feedbackCorrect : feedbackWrong
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
      ? directionEitherLabel
      : currentTarget.includes('L')
        ? directionLeftLabel
        : directionRightLabel

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
        {formatI18n(hudHistoryTemplate, { count: historySize, left: counts.left, right: counts.right })}
      </div>
      <div className="text-xs font-tomorrow uppercase tracking-[0.18em]" style={{ color: theme.cream }}>
        {formatI18n(hudTargetTemplate, { label: targetLabel })}
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
          {directionLeftLabel}
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
          {directionRightLabel}
        </button>
      </div>
      <div className="text-xs font-inter uppercase tracking-[0.18em] opacity-70" style={{ color: theme.cream }}>
        {formatI18n(hudRoundTemplate, {
          round,
          total: goalRounds,
          successes,
          mistakes,
          allowed: allowedMistakes,
          seconds: (timeLeft / 1000).toFixed(1),
        })}
      </div>
    </div>
  )
}
