import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'

const EMOJIS = ['🍋', '🍉', '🍇', '🍒', '🫐', '🥝', '🍍', '🥥', '🍑', '🍎'] as const

type Phase = 'playing' | 'input'

export default function EmojiEchoGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const normalized = normalizeLevel(level, 18)
  const baseLength = Math.min(6, 2 + Math.max(0, normalized - 1))
  const sequenceLengths = useMemo(
    () => [baseLength, Math.min(10, baseLength + 1)],
    [baseLength],
  )
  const playbackInterval = Math.max(360, Math.round(scaleLevel(normalized, 780, 380, 18)))
  const inputWindow = Math.max(3000, Math.round(scaleLevel(normalized, 8400, 4800, 18)))

  const [phase, setPhase] = useState<Phase>('playing')
  const [highlight, setHighlight] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Observe la séquence d’emojis…')
  const [pressedIndex, setPressedIndex] = useState<number | null>(null)
  const [sequenceStep, setSequenceStep] = useState(0)

  const rngRef = useRef<() => number>(() => Math.random)
  const timersRef = useRef<number[]>([])
  const inputTimeoutRef = useRef<number | null>(null)
  const endedRef = useRef(false)
  const seqRef = useRef<number[]>([])
  const lastEmojiRef = useRef<number | null>(null)

  const clearInputTimer = useCallback(() => {
    if (inputTimeoutRef.current != null) {
      clearTimeout(inputTimeoutRef.current)
      inputTimeoutRef.current = null
    }
  }, [])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id))
    timersRef.current = []
    clearInputTimer()
  }, [clearInputTimer])

  const finalize = useCallback(
    (won: boolean, message?: string) => {
      if (endedRef.current) return
      endedRef.current = true
      clearTimers()
      onComplete({
        outcome: won ? 'win' : 'lose',
        message,
        details: [
          { label: 'Séquence atteinte', value: `${sequenceStep + 1} / ${sequenceLengths.length}` },
        ],
      })
    },
    [clearTimers, onComplete, sequenceLengths.length, sequenceStep],
  )

  const restartInputTimer = useCallback(() => {
    clearInputTimer()
    inputTimeoutRef.current = window.setTimeout(() => {
      finalize(false, 'Trop tard.')
    }, inputWindow)
  }, [clearInputTimer, finalize, inputWindow])

  const playSequence = useCallback(
    (sequence: number[]) => {
      clearTimers()
      setPhase('playing')
      setProgress(0)
      setStatus('Observe…')
      const timers: number[] = []
      sequence.forEach((index, idx) => {
        timers.push(
          window.setTimeout(() => {
            setHighlight(index)
          }, idx * playbackInterval),
        )
        timers.push(
          window.setTimeout(() => {
            setHighlight(null)
          }, idx * playbackInterval + Math.floor(playbackInterval * 0.65)),
        )
      })
      timers.push(
        window.setTimeout(() => {
          setHighlight(null)
          setPhase('input')
          setStatus('Reproduis la séquence !')
          setProgress(0)
          restartInputTimer()
        }, sequence.length * playbackInterval + playbackInterval),
      )
      timersRef.current = timers
    },
    [clearTimers, playbackInterval, restartInputTimer],
  )

  const buildSequence = useCallback((length: number) => {
    const rng = rngRef.current
    const seq: number[] = []
    while (seq.length < length) {
      const candidate = Math.floor(rng() * EMOJIS.length)
      if (seq.length && seq[seq.length - 1] === candidate && EMOJIS.length > 1) continue
      seq.push(candidate)
    }
    seqRef.current = seq
    lastEmojiRef.current = seq[seq.length - 1]
    return seq
  }, [])

  useEffect(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-echo`)
    endedRef.current = false
    setSequenceStep(0)
    return () => {
      clearTimers()
      endedRef.current = true
    }
  }, [clearTimers, level, seed])

  useEffect(() => {
    if (endedRef.current) return
    const index = Math.min(sequenceStep, sequenceLengths.length - 1)
    const seq = buildSequence(sequenceLengths[index])
    playSequence(seq)
  }, [buildSequence, playSequence, sequenceLengths, sequenceStep])

  const handleInput = (index: number) => {
    if (endedRef.current || phase !== 'input') return
    const sequence = seqRef.current
    const expected = sequence[progress]
    setPressedIndex(index)
    window.setTimeout(() => setPressedIndex((prev) => (prev === index ? null : prev)), 180)
    if (index !== expected) {
      finalize(false, 'Ce n’est pas la bonne suite !')
      return
    }
    const nextProgress = progress + 1
    setProgress(nextProgress)
    if (nextProgress >= sequence.length) {
      clearInputTimer()
      if (sequenceStep >= sequenceLengths.length - 1) {
        finalize(true, 'Mémoire impeccable !')
      } else {
        setSequenceStep((prev) => prev + 1)
      }
      return
    }
    restartInputTimer()
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
        {status}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {EMOJIS.map((emoji, idx) => {
          const active = highlight === idx
          const pressed = pressedIndex === idx
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => handleInput(idx)}
              className="text-3xl"
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '18px',
                border: `2px solid ${active ? '#55ffcc' : theme.cream}33`,
                backgroundColor: active ? '#233' : 'rgba(255,255,255,0.06)',
                boxShadow: active
                  ? '0 0 18px rgba(85,255,204,0.5)'
                  : pressed
                    ? 'inset 0 0 12px rgba(0,0,0,0.35)'
                    : 'none',
                transform: pressed ? 'scale(0.92)' : 'scale(1)',
                transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                cursor: phase === 'input' ? 'pointer' : 'not-allowed',
                opacity: phase === 'input' ? 1 : 0.6,
              }}
            >
              {emoji}
            </button>
          )
        })}
      </div>
      <div
        className="rounded-full px-4 py-2 text-sm font-inter"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)', color: theme.cream }}
      >
        Séquence {sequenceStep + 1}/{sequenceLengths.length} · Longueur {seqRef.current.length}
      </div>
    </div>
  )
}
