import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'
import { useI18n } from '@/providers/I18nProvider'
import { formatI18n } from '@/lib/i18n/format'

const TICK_MS = 80

type RunnerId = number

type RaceResult = { won: boolean; message: string; winningRunner: RunnerId }

export default function FakeLoadingRaceGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const { t } = useI18n()
  const baseKey = 'minigames.games.fake-loading-race'
  const normalized = normalizeLevel(level, 18)
  const runnerCount = Math.min(5, 3 + Math.floor(normalized / 5))
  const raceDuration = Math.max(6 - normalized * 0.18, 2.8)
  const baseIncrement = (TICK_MS / (raceDuration * 1000)) * 100
  const minIncrement = baseIncrement * 0.65
  const maxIncrement = baseIncrement * 1.35
  const adjustEveryTicks = Math.max(6, Math.round(scaleLevel(normalized, 14, 6, 18)))

  const [progresses, setProgresses] = useState<number[]>(() => Array(runnerCount).fill(0))
  const [selected, setSelected] = useState<RunnerId | null>(null)
  const [swapUsed, setSwapUsed] = useState(false)
  const startMessage = t(`${baseKey}.messages.start`, 'Parie sur le loader gagnant !')
  const selectedTemplate = t(
    `${baseKey}.messages.selected`,
    'Parie sur le loader {index}. Course lancée !',
  )
  const swapTemplate = t(
    `${baseKey}.messages.swap`,
    'Tu changes de pari pour le loader {index} !',
  )
  const winTemplate = t(
    `${baseKey}.messages.win`,
    'Ton loader {index} passe la ligne en tête !',
  )
  const loseTemplate = t(`${baseKey}.messages.lose`, 'Loader {index} gagne la course.')
  const hintText = t(
    `${baseKey}.messages.hint`,
    'Tu peux changer de pari une seule fois pendant la course.',
  )
  const detailBetLabel = t(`${baseKey}.details.bet`, 'Pari')
  const detailNoneLabel = t(`${baseKey}.details.none`, 'Aucun')
  const detailWinnerLabel = t(`${baseKey}.details.winner`, 'Gagnant')
  const loaderLabelTemplate = t(`${baseKey}.labels.loader`, 'Loader {index}')
  const buttonBetLabel = t(`${baseKey}.buttons.bet`, 'Parier')
  const buttonSwitchLabel = t(`${baseKey}.buttons.switch`, 'Switch')
  const buttonLockedLabel = t(`${baseKey}.buttons.locked`, 'Pari')
  const replayLabel = t(`${baseKey}.buttons.replay`, 'Rejouer')
  const exitLabel = t(`${baseKey}.buttons.exit`, 'Quitter')
  const finishPrefix = t(`${baseKey}.finish.prefix`, 'Arrivée :')
  const finishEntryTemplate = t(
    `${baseKey}.finish.entry`,
    '{position}ᵉ → Loader {runner}',
  )
  const resultWinTitle = t(`${baseKey}.result.winTitle`, 'VICTOIRE !')
  const resultLoseTitle = t(`${baseKey}.result.loseTitle`, 'DÉFAITE')
  const resultSummaryTemplate = t(
    `${baseKey}.result.summary`,
    'Pari : {bet} · Gagnant : Loader {winner}',
  )

  const [message, setMessage] = useState(startMessage)
  const [winner, setWinner] = useState<RunnerId | null>(null)
  const [finishOrder, setFinishOrder] = useState<RunnerId[]>([])
  const [result, setResult] = useState<RaceResult | null>(null)

  const rngRef = useRef<() => number>(() => Math.random())
  const speedsRef = useRef<number[]>([])
  const targetsRef = useRef<number[]>([])
  const intervalRef = useRef<number | null>(null)
  const ticksRef = useRef(0)
  const raceActiveRef = useRef(false)
  const endedRef = useRef(false)
  const finishOrderRef = useRef<RunnerId[]>([])
  const currentBetRef = useRef<RunnerId | null>(null)

  const stopRace = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const finalize = useCallback(
    (raceResult: RaceResult) => {
      if (endedRef.current) return
      endedRef.current = true
      stopRace()
      onComplete({
        outcome: raceResult.won ? 'win' : 'lose',
        message: raceResult.message,
        details: [
          {
            label: detailBetLabel,
            value:
              selected != null
                ? formatI18n(loaderLabelTemplate, { index: selected + 1 })
                : detailNoneLabel,
          },
          {
            label: detailWinnerLabel,
            value: formatI18n(loaderLabelTemplate, { index: raceResult.winningRunner + 1 }),
          },
        ],
      })
    },
    [detailBetLabel, detailNoneLabel, detailWinnerLabel, loaderLabelTemplate, onComplete, selected, stopRace],
  )

  const resetRace = useCallback(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-race-${Date.now().toString(36)}`)
    setProgresses(Array(runnerCount).fill(0))
    setSelected(null)
    currentBetRef.current = null
    setSwapUsed(false)
    setWinner(null)
    setFinishOrder([])
    setResult(null)
    setMessage(startMessage)
    finishOrderRef.current = []
    speedsRef.current = []
    targetsRef.current = []
    raceActiveRef.current = false
    endedRef.current = false
    ticksRef.current = 0
    stopRace()
  }, [level, runnerCount, seed, startMessage, stopRace])

  useEffect(() => {
    resetRace()
    return () => {
      endedRef.current = true
      stopRace()
    }
  }, [resetRace, stopRace])

  useEffect(() => {
    setProgresses(Array(runnerCount).fill(0))
  }, [runnerCount])

  const initIncrements = useCallback(() => {
    const rng = rngRef.current
    speedsRef.current = Array.from({ length: runnerCount }, () =>
      Math.max(minIncrement, Math.min(maxIncrement, baseIncrement * (0.8 + rng() * 0.4))),
    )
    targetsRef.current = speedsRef.current.map(() =>
      Math.max(minIncrement, Math.min(maxIncrement, baseIncrement * (0.65 + rng() * 0.7))),
    )
    ticksRef.current = 0
  }, [baseIncrement, maxIncrement, minIncrement, runnerCount])

  const declareWinner = useCallback(
    (winningRunner: RunnerId) => {
      const won = currentBetRef.current === winningRunner
      const messageText = won
        ? formatI18n(winTemplate, { index: winningRunner + 1 })
        : formatI18n(loseTemplate, { index: winningRunner + 1 })
      setWinner(winningRunner)
      setResult({ won, message: messageText, winningRunner })
      setMessage(messageText)
      setFinishOrder(finishOrderRef.current.slice())
    },
    [loseTemplate, winTemplate],
  )

  const startRace = useCallback(() => {
    initIncrements()
    setProgresses(Array(runnerCount).fill(0))
    finishOrderRef.current = []
    raceActiveRef.current = true
    stopRace()
    intervalRef.current = window.setInterval(() => {
      const rng = rngRef.current
      ticksRef.current += 1
      speedsRef.current = speedsRef.current.map((speed, idx) => {
        const target = targetsRef.current[idx]
        return Math.max(minIncrement, Math.min(maxIncrement, speed + (target - speed) * 0.18))
      })
      if (ticksRef.current % adjustEveryTicks === 0) {
        targetsRef.current = targetsRef.current.map(() =>
          Math.max(minIncrement, Math.min(maxIncrement, baseIncrement * (0.65 + rng() * 0.7))),
        )
      }

      setProgresses((prev) => {
        const next = prev.map((value, idx) => Math.min(100, value + speedsRef.current[idx]))
        next.forEach((value, idx) => {
          if (value >= 100 && !finishOrderRef.current.includes(idx)) {
            finishOrderRef.current.push(idx)
          }
        })

        const winningRunner = finishOrderRef.current.length ? finishOrderRef.current[0] : -1
        if (winningRunner >= 0) {
          raceActiveRef.current = false
          stopRace()
          declareWinner(winningRunner)
        }
        return next
      })
    }, TICK_MS)
  }, [adjustEveryTicks, baseIncrement, declareWinner, initIncrements, maxIncrement, minIncrement, runnerCount, stopRace])

  useEffect(() => {
    if (selected == null || winner != null || raceActiveRef.current) return
    startRace()
  }, [selected, startRace, winner])

  const handleSelect = (runner: RunnerId) => {
    if (endedRef.current) return
    if (winner != null || result) return

    if (selected == null) {
      setSelected(runner)
      currentBetRef.current = runner
      setMessage(formatI18n(selectedTemplate, { index: runner + 1 }))
      return
    }

    if (!swapUsed && runner !== selected) {
      setSelected(runner)
      currentBetRef.current = runner
      setSwapUsed(true)
      setMessage(formatI18n(swapTemplate, { index: runner + 1 }))
    }
  }

  const runners = useMemo(() => Array.from({ length: runnerCount }, (_, idx) => idx), [runnerCount])
  const canSwap = selected != null && !swapUsed && winner == null && !result

  const handleReplay = () => {
    resetRace()
  }

  const handleValidate = () => {
    if (!result) return
    finalize(result)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
        {message}
      </div>
      <div className="flex w-full max-w-md flex-col gap-3">
        {runners.map((idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-inter uppercase tracking-[0.18em]" style={{ color: theme.cream }}>
              <span>{formatI18n(loaderLabelTemplate, { index: idx + 1 })}</span>
              <span>{(progresses[idx] ?? 0).toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/15" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progresses[idx] ?? 0}%`,
                  transition: 'width 0.12s linear',
                  height: '100%',
                  borderRadius: '999px',
                  background: selected === idx ? '#ff82d5' : '#5bffd1',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 flex-wrap justify-center">
        {runners.map((idx) => {
          const isActive = selected === idx
          const disabled = winner != null || result != null || (selected != null && swapUsed && !isActive)
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(idx)}
              disabled={disabled}
              className="rounded-full px-4 py-2 font-tomorrow text-sm font-bold uppercase tracking-[0.12em]"
              style={{
                backgroundColor: isActive ? theme.text : 'rgba(0,0,0,0.35)',
                color: theme.cream,
                opacity: disabled && !isActive ? 0.4 : 1,
              }}
            >
              {(selected == null ? buttonBetLabel : canSwap ? buttonSwitchLabel : buttonLockedLabel)} {idx + 1}
            </button>
          )
        })}
      </div>
      {finishOrder.length ? (
        <div className="text-xs font-inter uppercase tracking-[0.14em] opacity-75" style={{ color: theme.cream }}>
          {finishPrefix}{' '}
          {finishOrder
            .map((runner, index) =>
              formatI18n(finishEntryTemplate, { position: index + 1, runner: runner + 1 }),
            )
            .join(' · ')}
        </div>
      ) : null}
      {result ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-inter" style={{ color: theme.cream }}>
          <div className="text-lg font-tomorrow font-bold" style={{ color: result.won ? '#3cff8f' : '#ff708f' }}>
            {result.won ? resultWinTitle : resultLoseTitle}
          </div>
          <div>{result.message}</div>
          <div className="text-xs uppercase tracking-[0.18em] opacity-80">
            {formatI18n(resultSummaryTemplate, {
              bet:
                selected != null
                  ? formatI18n(loaderLabelTemplate, { index: selected + 1 })
                  : detailNoneLabel,
              winner: result.winningRunner + 1,
            })}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReplay}
              className="rounded-full px-4 py-2 font-tomorrow text-xs font-bold uppercase tracking-[0.12em]"
              style={{ backgroundColor: theme.text, color: theme.cream }}
            >
              {replayLabel}
            </button>
            <button
              type="button"
              onClick={handleValidate}
              className="rounded-full px-4 py-2 font-tomorrow text-xs font-bold uppercase tracking-[0.12em]"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)', color: theme.cream }}
            >
              {exitLabel}
            </button>
          </div>
        </div>
      ) : canSwap ? (
        <div className="text-xs font-inter opacity-70" style={{ color: theme.cream }}>
          {hintText}
        </div>
      ) : null}
    </div>
  )
}
