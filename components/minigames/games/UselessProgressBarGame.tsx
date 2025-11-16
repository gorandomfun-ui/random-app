import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'

type GameState = 'running' | 'ended'

export default function UselessProgressBarGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const normalized = normalizeLevel(level, 18)
  const targetsPerRun = Math.min(6, 2 + Math.floor(normalized / 3))
  const perTargetTime = Math.max(2000, Math.round(scaleLevel(normalized, 6000, 2000, 18)))
  const tolerance = Math.max(4, Math.round(scaleLevel(normalized, 16, 4, 18)))
  const gainPerTick = Math.max(3.8, scaleLevel(normalized, 5.5, 8.5, 18))

  const [progress, setProgress] = useState(0)
  const [targetValue, setTargetValue] = useState(50)
  const [targetIndex, setTargetIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(perTargetTime)
  const [message, setMessage] = useState('Charge la barre inutile avec précision…')
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
          { label: 'Cibles validées', value: `${targetIndexRef.current}/${targetsPerRun}` },
          { label: 'Dernier objectif', value: `${targetRef.current.toFixed(0)}%` },
        ],
      })
    },
    [clearTimer, onComplete, stopCharging, targetsPerRun],
  )

  const finalizeWin = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    setState('ended')
    clearTimer()
    stopCharging()
    onComplete({
      outcome: 'win',
      message: 'Barre inutile parfaitement calibrée !',
      details: [{ label: 'Cibles validées', value: `${targetsPerRun}/${targetsPerRun}` }],
    })
  }, [clearTimer, onComplete, stopCharging, targetsPerRun])

  const startTimer = useCallback(
    (duration: number) => {
      clearTimer()
      setTimeLeft(duration)
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          const next = Math.max(0, prev - 100)
          if (next <= 0) {
            clearTimer()
            fail('Temps écoulé !')
            return 0
          }
          return next
        })
      }, 100)
    },
    [clearTimer, fail],
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
      setMessage(`Objectif ${index + 1}/${targetsPerRun} · Vise ${target}% (±${tolerance}%)`)
      startTimer(perTargetTime)
    },
    [finalizeWin, level, perTargetTime, seed, startTimer, targetsPerRun, tolerance],
  )

  useEffect(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-useless`)
    endedRef.current = false
    setState('running')
    stopCharging()
    setProgress(0)
    progressRef.current = 0
    prepareTarget(0)
    return () => {
      endedRef.current = true
      clearTimer()
      stopCharging()
    }
  }, [clearTimer, level, prepareTarget, seed, stopCharging])

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
      fail('Trop chargé !')
    } else {
      fail('Pas assez chargé !')
    }
  }, [fail, handleSuccess, state, stopCharging, tolerance])

  const startCharging = useCallback(() => {
    if (state !== 'running' || charging) return
    setCharging(true)
    chargeIntervalRef.current = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(120, prev + gainPerTick)
        progressRef.current = next
        if (next > targetRef.current + tolerance + 1) {
          stopCharging()
          fail('Trop chargé !')
        }
        return next
      })
    }, 120)
  }, [charging, fail, gainPerTick, state, stopCharging, tolerance])

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
          Charge {(progress).toFixed(1)}% · Cible {targetValue.toFixed(0)}% ± {tolerance}%
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
        {charging ? 'Relâche pour valider' : 'Appuie pour charger'}
      </button>
      <div
        className="rounded-full px-4 py-2 text-sm font-inter"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)', color: theme.cream }}
      >
        Temps&nbsp;: {(timeLeft / 1000).toFixed(1)} s · Cible {targetIndex + 1}/{targetsPerRun}
      </div>
    </div>
  )
}
