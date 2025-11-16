import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'
import { useI18n } from '@/providers/I18nProvider'
import { formatI18n } from '@/lib/i18n/format'

type SequenceLabel = 'tap' | 'dont'

export default function TapToNotTapGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const { t } = useI18n()
  const baseKey = 'minigames.games.tap-to-not-tap'
  const normalized = normalizeLevel(level, 18)
  const sequenceLength = Math.min(22, 10 + Math.floor(normalized * 0.8))
  const promptWindow = Math.max(360, Math.round(scaleLevel(normalized, 980, 360, 18)))
  const blankWindow = Math.max(140, Math.round(scaleLevel(normalized, 260, 90, 18)))
  const pulseDuration = Math.max(180, Math.round(promptWindow * 0.6))
  const maxErrors = normalized <= 2 ? 2 : normalized <= 5 ? 3 : 4
  const assistColors = normalized <= 2

  const readyLabel = t(`${baseKey}.status.ready`, 'La séquence va commencer…')
  const tapStatus = t(`${baseKey}.status.tap`, 'TAP ! Clique avant le prochain flash.')
  const dontStatus = t(`${baseKey}.status.dontTap`, "DON’T TAP !")
  const tipText = t(
    `${baseKey}.status.tip`,
    'Clique uniquement quand le mot TAP apparaît. Chaque flash arrive plus vite.',
  )
  const encourageText = t(`${baseKey}.status.encourage`, 'Bien joué ! Reste concentré.')
  const errorTemplate = t(`${baseKey}.status.errorCount`, '{reason} · erreur {current}/{max}')
  const missedTapMessage = t(`${baseKey}.messages.missedTap`, 'Tu as manqué un TAP.')
  const wrongClickMessage = t(`${baseKey}.messages.wrongClick`, 'Il ne fallait pas cliquer.')
  const sequenceCompleteMessage = t(
    `${baseKey}.messages.sequenceComplete`,
    'Séquence complétée !',
  )
  const sequenceInterruptedMessage = t(
    `${baseKey}.messages.sequenceInterrupted`,
    'Séquence interrompue.',
  )
  const tooManyErrorsMessage = t(`${baseKey}.messages.tooManyErrors`, 'Trop d’erreurs !')
  const detailStepsLabel = t(`${baseKey}.details.steps`, 'Étapes')
  const detailSuccessLabel = t(`${baseKey}.details.success`, 'TAP réussis')
  const detailErrorsLabel = t(`${baseKey}.details.errors`, 'Erreurs')
  const hudStepLabel = t(`${baseKey}.hud.step`, 'Étape')
  const hudTapLabel = t(`${baseKey}.hud.tapCount`, 'TAP faits')
  const hudErrorsLabel = t(`${baseKey}.hud.errors`, 'Erreurs')

  const [currentIndex, setCurrentIndex] = useState(-1)
  const [currentLabel, setCurrentLabel] = useState<SequenceLabel | null>(null)
  const [errors, setErrors] = useState(0)
  const [successes, setSuccesses] = useState(0)
  const [status, setStatus] = useState(readyLabel)
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
        { label: detailStepsLabel, value: `${sequenceRef.current.length}` },
        { label: detailSuccessLabel, value: `${successesRef.current}` },
        { label: detailErrorsLabel, value: `${errorsRef.current}/${maxErrors}` },
      ]
      onComplete({
        outcome: won ? 'win' : 'lose',
        message: message ?? (won ? sequenceCompleteMessage : sequenceInterruptedMessage),
        details,
      })
    },
    [
      clearTimers,
      detailErrorsLabel,
      detailStepsLabel,
      detailSuccessLabel,
      maxErrors,
      onComplete,
      sequenceCompleteMessage,
      sequenceInterruptedMessage,
    ],
  )

  const registerError = useCallback(
    (reason: string) => {
      if (finishedRef.current) return
      setErrors((prev) => {
        const next = prev + 1
        errorsRef.current = next
        if (next > maxErrors) {
          setStatus(tooManyErrorsMessage)
          finalize(false, reason)
        } else {
          setStatus(formatI18n(errorTemplate, { reason, current: next, max: maxErrors }))
        }
        return next
      })
    },
    [errorTemplate, finalize, maxErrors, tooManyErrorsMessage],
  )

  const advanceStep = useCallback(
    (index: number) => {
      if (finishedRef.current) return
      const seq = sequenceRef.current
      if (!seq.length) return
      if (index >= seq.length) {
        finalize(true, sequenceCompleteMessage)
        return
      }

      const label = seq[index]
      setCurrentIndex(index)
      setCurrentLabel(label)
      awaitingTapRef.current = label === 'tap'
      clickedThisBeatRef.current = false

      setPulse(true)
      setStatus(label === 'tap' ? tapStatus : dontStatus)
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
          registerError(missedTapMessage)
        }
        setCurrentLabel(null)
        const nextIndex = index + 1
        if (nextIndex >= seq.length) {
          finalize(
            errorsRef.current <= maxErrors,
            errorsRef.current <= maxErrors ? sequenceCompleteMessage : sequenceInterruptedMessage,
          )
          return
        }
        stepTimeoutRef.current = window.setTimeout(() => {
          advanceStep(nextIndex)
        }, blankWindow)
      }, promptWindow)
    },
    [
      blankWindow,
      dontStatus,
      finalize,
      maxErrors,
      missedTapMessage,
      promptWindow,
      pulseDuration,
      registerError,
      sequenceCompleteMessage,
      sequenceInterruptedMessage,
      tapStatus,
    ],
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
    setStatus(readyLabel)

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
  }, [advanceStep, clearTimers, readyLabel, sequenceLength])

  const handlePress = () => {
    if (finishedRef.current || currentLabel == null) return
    if (currentLabel === 'tap') {
      if (awaitingTapRef.current && !clickedThisBeatRef.current) {
        awaitingTapRef.current = false
        clickedThisBeatRef.current = true
        successesRef.current += 1
        setSuccesses((prev) => prev + 1)
        setStatus(encourageText)
      }
    } else {
      registerError(wrongClickMessage)
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
        <div className="text-xs uppercase tracking-[0.12em] opacity-75">{hudStepLabel}</div>
        <div className="text-lg font-tomorrow font-bold" style={{ color: theme.cream }}>
          {currentIndex >= 0 ? `${currentIndex + 1}/${sequenceLength}` : `0/${sequenceLength}`}
        </div>
        <div className="flex flex-row items-center gap-5 text-sm font-inter">
          <span>
            {hudTapLabel}&nbsp;
            <strong>{successes}</strong> / {tapCount}
          </span>
          <span>
            {hudErrorsLabel}&nbsp;
            <strong>{errors}</strong> / {maxErrors}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
          {tipText}
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
