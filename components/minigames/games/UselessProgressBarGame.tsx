import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'
import { useI18n } from '@/providers/I18nProvider'
import { formatI18n } from '@/lib/i18n/format'

type GameState = 'running' | 'ended'

export default function UselessProgressBarGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const { t } = useI18n()
  const baseKey = 'minigames.games.useless-progress-bar'
  const normalized = normalizeLevel(level, 18)
  const targetsPerRun = Math.min(6, 2 + Math.floor(normalized / 3))
  const perTargetTime = Math.max(2000, Math.round(scaleLevel(normalized, 6000, 2000, 18)))
  const tolerance = Math.max(4, Math.round(scaleLevel(normalized, 16, 4, 18)))
  const gainPerTick = Math.max(3.8, scaleLevel(normalized, 5.5, 8.5, 18))

  const [progress, setProgress] = useState(0)
  const [targetValue, setTargetValue] = useState(50)
  const [targetIndex, setTargetIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(perTargetTime)
  const readyLabel = t(`${baseKey}.status.ready`, 'Charge la barre inutile avec précision…')
  const targetTemplate = t(
    `${baseKey}.status.target`,
    'Objectif {current}/{total} · Vise {target}% (±{tolerance}%)',
  )
  const timeoutMessage = t(`${baseKey}.messages.timeout`, 'Temps écoulé !')
  const overMessage = t(`${baseKey}.messages.over`, 'Trop chargé !')
  const underMessage = t(`${baseKey}.messages.under`, 'Pas assez chargé !')
  const winMessage = t(`${baseKey}.messages.win`, 'Barre inutile parfaitement calibrée !')
  const detailValidatedLabel = t(`${baseKey}.details.validated`, 'Cibles validées')
  const detailLastGoalLabel = t(`${baseKey}.details.lastGoal`, 'Dernier objectif')
  const progressTemplate = t(
    `${baseKey}.hud.progress`,
    'Charge {progress}% · Cible {target}% ± {tolerance}%',
  )
  const timerTemplate = t(
    `${baseKey}.hud.timer`,
    'Temps : {seconds}s · Cible {current}/{total}',
  )
  const pressLabel = t(`${baseKey}.buttons.press`, 'Appuie pour charger')
  const releaseLabel = t(`${baseKey}.buttons.release`, 'Relâche pour valider')

  const [message, setMessage] = useState(readyLabel)
  const [charging, setCharging] = useState(false)
  const [state, setState] = useState<GameState>('running')

  const rngRef = useRef<() => number>(() => Math.random())
  const timerRef = useRef<number | null>(null)
  const chargeIntervalRef = useRef<number | null>(null)
  const endedRef = useRef(false)
  const progressRef = useRef(0)
  const targetRef = useRef(0)
  const targetIndexRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopCharging = useCallback(() => {
    if (chargeIntervalRef.current != null) {
      clearInterval(chargeIntervalRef.current)
      chargeIntervalRef.current = null
    }
    setCharging(false)
  }, [])

  const fail = useCallback(
    (reason: string) => {
      if (endedRef.current) return
      endedRef.current = true
      setState('ended')
      clearTimer()
      stopCharging()
      onComplete({
        outcome: 'lose',
        message: reason,
        details: [
          { label: detailValidatedLabel, value: `${targetIndexRef.current}/${targetsPerRun}` },
          { label: detailLastGoalLabel, value: `${targetRef.current.toFixed(0)}%` },
        ],
      })
    },
    [clearTimer, detailLastGoalLabel, detailValidatedLabel, onComplete, stopCharging, targetsPerRun],
  )

  const finalizeWin = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    setState('ended')
    clearTimer()
    stopCharging()
    onComplete({
      outcome: 'win',
      message: winMessage,
      details: [{ label: detailValidatedLabel, value: `${targetsPerRun}/${targetsPerRun}` }],
    })
  }, [clearTimer, detailValidatedLabel, onComplete, stopCharging, targetsPerRun, winMessage])

  const startTimer = useCallback(
    (duration: number) => {
      clearTimer()
      setTimeLeft(duration)
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          const next = Math.max(0, prev - 100)
          if (next <= 0) {
            clearTimer()
            fail(timeoutMessage)
            return 0
          }
          return next
        })
      }, 100)
    },
    [clearTimer, fail, timeoutMessage],
  )

  const prepareTarget = useCallback(
    (index: number) => {
      if (index >= targetsPerRun) {
        finalizeWin()
        return
      }
      if (index === 0) {
        const salt = `${seed}-${level}-useless-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        rngRef.current = createSeededRng(salt)
      }
      const rng = rngRef.current
      const target = 10 + Math.round(rng() * 90)
      targetRef.current = target
      targetIndexRef.current = index
      setTargetValue(target)
      setTargetIndex(index)
      setProgress(0)
      progressRef.current = 0
      setMessage(
        formatI18n(targetTemplate, {
          current: index + 1,
          total: targetsPerRun,
          target,
          tolerance,
        }),
      )
      startTimer(perTargetTime)
    },
    [
      finalizeWin,
      level,
      perTargetTime,
      seed,
      startTimer,
      targetTemplate,
      targetsPerRun,
      tolerance,
    ],
  )

  useEffect(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-useless`)
    endedRef.current = false
    setState('running')
    stopCharging()
    setProgress(0)
    progressRef.current = 0
    setMessage(readyLabel)
    prepareTarget(0)
    return () => {
      endedRef.current = true
      clearTimer()
      stopCharging()
    }
  }, [clearTimer, level, prepareTarget, readyLabel, seed, stopCharging])

  const handleSuccess = useCallback(() => {
    const nextIndex = targetIndexRef.current + 1
    prepareTarget(nextIndex)
  }, [prepareTarget])

  const resolveAttempt = useCallback(() => {
    if (state !== 'running') return
    if (!charging && chargeIntervalRef.current == null) return
    stopCharging()
    const diff = Math.abs(progressRef.current - targetRef.current)
    if (diff <= tolerance) {
      handleSuccess()
    } else if (progressRef.current > targetRef.current) {
      fail(overMessage)
    } else {
      fail(underMessage)
    }
  }, [charging, fail, handleSuccess, overMessage, state, stopCharging, tolerance, underMessage])

  const startCharging = useCallback(() => {
    if (state !== 'running' || charging) return
    setCharging(true)
    chargeIntervalRef.current = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(120, prev + gainPerTick)
        progressRef.current = next
        if (next > targetRef.current + tolerance + 1) {
          stopCharging()
          fail(overMessage)
        }
        return next
      })
    }, 120)
  }, [charging, fail, gainPerTick, overMessage, state, stopCharging, tolerance])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
        {message}
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-1 h-2 rounded-full bg-white/15" style={{ position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.min(100, progress)}%`,
              transition: 'width 0.15s ease-out',
              height: '100%',
              borderRadius: '999px',
              background: 'linear-gradient(90deg,#ff5bd7,#7affd5)',
            }}
          />
        </div>
        <div className="text-xs font-inter uppercase tracking-[0.18em] opacity-70" style={{ color: theme.cream }}>
          {formatI18n(progressTemplate, {
            progress: progress.toFixed(1),
            target: targetValue.toFixed(0),
            tolerance,
          })}
        </div>
      </div>
      <button
        type="button"
        disabled={state !== 'running'}
        onMouseDown={startCharging}
        onMouseUp={resolveAttempt}
        onMouseLeave={resolveAttempt}
        onTouchStart={(event) => {
          event.preventDefault()
          startCharging()
        }}
        onTouchEnd={(event) => {
          event.preventDefault()
          resolveAttempt()
        }}
        className="rounded-full px-5 py-3 font-tomorrow text-sm font-bold uppercase tracking-[0.12em]"
        style={{
          backgroundColor: charging ? theme.text : '#444',
          color: theme.cream,
          boxShadow: charging ? '0 0 22px rgba(0,0,0,0.45)' : '0 12px 22px rgba(0,0,0,0.35)',
          opacity: state === 'running' ? 1 : 0.6,
        }}
        >
        {charging ? releaseLabel : pressLabel}
      </button>
      <div
        className="rounded-full px-4 py-2 text-sm font-inter"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)', color: theme.cream }}
      >
        {formatI18n(timerTemplate, {
          seconds: (timeLeft / 1000).toFixed(1),
          current: targetIndex + 1,
          total: targetsPerRun,
        })}
      </div>
    </div>
  )
}
