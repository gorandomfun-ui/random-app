import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'

type SequenceLabel = 'tap' | 'dont'

export default function TapToNotTapGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const normalized = normalizeLevel(level, 18)
  const sequenceLength = Math.min(22, 10 + Math.floor(normalized * 0.8))
  const promptWindow = Math.max(360, Math.round(scaleLevel(normalized, 980, 360, 18)))
  const blankWindow = Math.max(140, Math.round(scaleLevel(normalized, 260, 90, 18)))
  const pulseDuration = Math.max(180, Math.round(promptWindow * 0.6))
  const maxErrors = normalized <= 2 ? 2 : normalized <= 5 ? 3 : 4
  const assistColors = normalized <= 2

  const [currentIndex, setCurrentIndex] = useState(-1)
  const [currentLabel, setCurrentLabel] = useState<SequenceLabel | null>(null)
  const [errors, setErrors] = useState(0)
  const [successes, setSuccesses] = useState(0)
  const [status, setStatus] = useState('La séquence va commencer…')
  const [pulse, setPulse] = useState(false)
  const [tapCount, setTapCount] = useState(0)

  const rngRef = useRef<() => number>(() => Math.random())
  const awaitingTapRef = useRef(false)
  const clickedThisBeatRef = useRef(false)
  const finishedRef = useRef(false)
  const errorsRef = useRef(0)
  const successesRef = useRef(0)
  const sequenceRef = useRef<SequenceLabel[]>([])

  const stepTimeoutRef = useRef<number | null>(null)
  const pulseTimeoutRef = useRef<number | null>(null)
  const startTimeoutRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (stepTimeoutRef.current != null) {
      clearTimeout(stepTimeoutRef.current)
      stepTimeoutRef.current = null
    }
    if (pulseTimeoutRef.current != null) {
      clearTimeout(pulseTimeoutRef.current)
      pulseTimeoutRef.current = null
    }
    if (startTimeoutRef.current != null) {
      clearTimeout(startTimeoutRef.current)
      startTimeoutRef.current = null
    }
  }, [])

  const finalize = useCallback(
    (won: boolean, message?: string) => {
      if (finishedRef.current) return
      finishedRef.current = true
      clearTimers()
      const details = [
        { label: 'Étapes', value: `${sequenceRef.current.length}` },
        { label: 'TAP réussis', value: `${successesRef.current}` },
        { label: 'Erreurs', value: `${errorsRef.current}/${maxErrors}` },
      ]
      onComplete({
        outcome: won ? 'win' : 'lose',
        message: message ?? (won ? 'Séquence complétée !' : 'Séquence interrompue.'),
        details,
      })
    },
    [clearTimers, maxErrors, onComplete],
  )

  const registerError = useCallback(
    (reason: string) => {
      if (finishedRef.current) return
      setErrors((prev) => {
        const next = prev + 1
        errorsRef.current = next
        if (next > maxErrors) {
          setStatus('Trop d’erreurs !')
          finalize(false, reason)
        } else {
          setStatus(`${reason} · erreur ${next}/${maxErrors}`)
        }
        return next
      })
    },
    [finalize, maxErrors],
  )

  const advanceStep = useCallback(
    (index: number) => {
      if (finishedRef.current) return
      const seq = sequenceRef.current
      if (!seq.length) return
      if (index >= seq.length) {
        finalize(true, 'Séquence complétée !')
        return
      }

      const label = seq[index]
      setCurrentIndex(index)
      setCurrentLabel(label)
      awaitingTapRef.current = label === 'tap'
      clickedThisBeatRef.current = false

      setPulse(true)
      setStatus(label === 'tap' ? 'TAP ! Clique avant le prochain flash.' : "DON’T TAP !")
      if (pulseTimeoutRef.current != null) {
        clearTimeout(pulseTimeoutRef.current)
      }
      pulseTimeoutRef.current = window.setTimeout(() => {
        setPulse(false)
      }, pulseDuration)

      if (stepTimeoutRef.current != null) {
        clearTimeout(stepTimeoutRef.current)
      }
      stepTimeoutRef.current = window.setTimeout(() => {
        if (finishedRef.current) return
        if (awaitingTapRef.current) {
          awaitingTapRef.current = false
          registerError('Tu as manqué un TAP.')
        }
        setCurrentLabel(null)
        const nextIndex = index + 1
        if (nextIndex >= seq.length) {
          finalize(errorsRef.current <= maxErrors, errorsRef.current <= maxErrors ? 'Séquence complétée !' : 'Séquence interrompue.')
          return
        }
        stepTimeoutRef.current = window.setTimeout(() => {
          advanceStep(nextIndex)
        }, blankWindow)
      }, promptWindow)
    },
    [blankWindow, finalize, maxErrors, promptWindow, pulseDuration, registerError],
  )

  useEffect(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-tap2`)
  }, [level, seed])

  useEffect(() => {
    finishedRef.current = false
    clearTimers()
    errorsRef.current = 0
    successesRef.current = 0
    awaitingTapRef.current = false
    clickedThisBeatRef.current = false
    setErrors(0)
    setSuccesses(0)
    setCurrentIndex(-1)
    setCurrentLabel(null)
    setStatus('La séquence va commencer…')

    const rng = rngRef.current
    const seq = Array.from({ length: sequenceLength }, () => (rng() > 0.5 ? 'tap' : 'dont') as SequenceLabel)
    if (!seq.some((entry) => entry === 'tap')) {
      seq[0] = 'tap'
    }
    sequenceRef.current = seq
    setTapCount(seq.filter((entry) => entry === 'tap').length)

    startTimeoutRef.current = window.setTimeout(() => {
      advanceStep(0)
    }, 600)

    return () => {
      finishedRef.current = true
      clearTimers()
    }
  }, [advanceStep, clearTimers, sequenceLength])

  const handlePress = () => {
    if (finishedRef.current || currentLabel == null) return
    if (currentLabel === 'tap') {
      if (awaitingTapRef.current && !clickedThisBeatRef.current) {
        awaitingTapRef.current = false
        clickedThisBeatRef.current = true
        successesRef.current += 1
        setSuccesses((prev) => prev + 1)
        setStatus('Bien joué ! Reste concentré.')
      }
    } else {
      registerError('Il ne fallait pas cliquer.')
    }
  }

  const buttonColor =
    currentLabel === 'tap'
      ? assistColors
        ? '#2fffd0'
        : theme.text
      : assistColors
        ? '#ff5f7a'
        : theme.text

  const buttonText = currentLabel === 'tap' ? 'TAP' : currentLabel === 'dont' ? 'DON’T TAP' : '...'

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="text-xs uppercase tracking-[0.12em] opacity-75">Étape</div>
        <div className="text-lg font-tomorrow font-bold" style={{ color: theme.cream }}>
          {currentIndex >= 0 ? `${currentIndex + 1}/${sequenceLength}` : `0/${sequenceLength}`}
        </div>
        <div className="flex flex-row items-center gap-5 text-sm font-inter">
          <span>
            TAP faits&nbsp;
            <strong>{successes}</strong> / {tapCount}
          </span>
          <span>
            Erreurs&nbsp;
            <strong>{errors}</strong> / {maxErrors}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
          Clique uniquement quand le mot <span className="font-semibold">TAP</span> apparaît. Chaque flash arrive plus vite.
        </p>
        <button
          type="button"
          onClick={handlePress}
          disabled={finishedRef.current || currentLabel == null}
          style={{
            padding: '26px 46px',
            borderRadius: '34px',
            border: assistColors ? 'none' : '3px solid rgba(255,255,255,0.18)',
            backgroundColor: buttonColor,
            color: theme.cream,
            fontFamily: "'Tomorrow', sans-serif",
            fontWeight: 700,
            fontSize: '24px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease',
            transform: pulse ? 'scale(1.08)' : 'scale(1)',
            boxShadow: pulse ? '0 18px 32px rgba(0, 0, 0, 0.45)' : '0 0 0 rgba(0,0,0,0)',
            cursor: finishedRef.current ? 'default' : 'pointer',
            opacity: finishedRef.current ? 0.6 : 1,
          }}
        >
          {buttonText}
        </button>
        <p className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
          {status}
        </p>
      </div>
    </div>
  )
}
