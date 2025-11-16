import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'

type Spot = { x: number; y: number }
type PointerPosition = { xPct: number; yPct: number; xPx: number; yPx: number }
type PointerInfo = PointerPosition & { rect: DOMRect }

export default function SteadySpotsGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const normalized = normalizeLevel(level, 18)
  const totalSpots = Math.min(7, 2 + Math.floor(normalized * 0.7))
  const holdDuration = Math.max(1100, Math.round(scaleLevel(normalized, 1700, 1150, 18)))
  const tolerancePx = Math.max(16, Math.round(scaleLevel(normalized, 44, 20, 18)))
  const timeLimit = Math.round(scaleLevel(normalized, 15000, 8500, 18))
  const jitterRange = Math.max(4, Math.round(scaleLevel(normalized, 14, 7, 18)))
  const jitterEnabled = normalized > 1

  const [spots, setSpots] = useState<Spot[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [status, setStatus] = useState('Atteins chaque spot et maintiens-le environ 2 secondes.')
  const [timeLeft, setTimeLeft] = useState(timeLimit)
  const [holding, setHolding] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [pointerPos, setPointerPos] = useState<PointerPosition | null>(null)
  const [jitterOffset, setJitterOffset] = useState({ x: 0, y: 0 })

  const rngRef = useRef<() => number>(() => Math.random())
  const timerRef = useRef<number | null>(null)
  const holdFrameRef = useRef<number | null>(null)
  const holdStartRef = useRef<number>(0)
  const pointerIdRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const endedRef = useRef(false)
  const activeIndexRef = useRef(0)
  const jitterIntervalRef = useRef<number | null>(null)
  const lockUntilRef = useRef<number>(0)

  const releasePointerCapture = useCallback(() => {
    if (pointerIdRef.current == null || !containerRef.current) return
    try {
      containerRef.current.releasePointerCapture(pointerIdRef.current)
    } catch {
      // ignore
    }
  }, [])

  const stopHoldFrame = useCallback(() => {
    if (holdFrameRef.current != null) {
      cancelAnimationFrame(holdFrameRef.current)
      holdFrameRef.current = null
    }
  }, [])

  const stopJitter = useCallback(() => {
    if (jitterIntervalRef.current != null) {
      clearInterval(jitterIntervalRef.current)
      jitterIntervalRef.current = null
    }
    setJitterOffset({ x: 0, y: 0 })
  }, [])

  const resetHoldState = useCallback(() => {
    stopHoldFrame()
    releasePointerCapture()
    pointerIdRef.current = null
    setHolding(false)
    setHoldProgress(0)
    stopJitter()
  }, [releasePointerCapture, stopHoldFrame, stopJitter])

  const finalize = useCallback(
    (won: boolean, message?: string) => {
      if (endedRef.current) return
      endedRef.current = true
      resetHoldState()
      if (timerRef.current != null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      onComplete({
        outcome: won ? 'win' : 'lose',
        message,
        details: [{ label: 'Spots validés', value: `${Math.min(activeIndexRef.current, totalSpots)}/${totalSpots}` }],
      })
    },
    [onComplete, resetHoldState, totalSpots],
  )

  const fail = useCallback((reason: string) => finalize(false, reason), [finalize])

  const validateSpot = useCallback(() => {
    if (endedRef.current) return
    resetHoldState()
    setStatus('Spot validé !')
    setActiveIndex((prev) => {
      const next = prev + 1
      activeIndexRef.current = next
      if (next >= totalSpots) {
        finalize(true, 'Tu as tenu tous les spots !')
        return next
      }
      setStatus(`Spot ${next + 1}/${totalSpots} — clique et maintiens 2 s.`)
      return next
    })
  }, [finalize, resetHoldState, totalSpots])

  const trackHold = useCallback(() => {
    const tick = () => {
      holdFrameRef.current = requestAnimationFrame(() => {
        const elapsed = performance.now() - holdStartRef.current
        setHoldProgress(elapsed)
        if (elapsed >= holdDuration) {
          validateSpot()
          return
        }
        if (pointerIdRef.current != null && !endedRef.current) {
          tick()
        }
      })
    }
    tick()
  }, [holdDuration, validateSpot])

  const startJitter = useCallback(() => {
    if (!jitterEnabled) return
    if (jitterIntervalRef.current != null) return
    jitterIntervalRef.current = window.setInterval(() => {
      setJitterOffset({
        x: (Math.random() * 2 - 1) * jitterRange,
        y: (Math.random() * 2 - 1) * jitterRange,
      })
    }, 220)
  }, [jitterEnabled, jitterRange])

  const startHold = useCallback(() => {
    if (pointerIdRef.current == null || endedRef.current) return
    holdStartRef.current = performance.now()
    setHolding(true)
    setHoldProgress(0)
    setStatus('Ne bouge plus…')
    trackHold()
    startJitter()
  }, [startJitter, trackHold])

  const computePosition = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): PointerInfo | null => {
      if (!containerRef.current) return null
      const rect = containerRef.current.getBoundingClientRect()
      const xPx = event.clientX - rect.left
      const yPx = event.clientY - rect.top
      return {
        xPx,
        yPx,
        xPct: (xPx / rect.width) * 100,
        yPct: (yPx / rect.height) * 100,
        rect,
      }
    },
    [],
  )

  const isInsideActive = useCallback(
    (info: PointerInfo) => {
      const target = spots[activeIndex]
      if (!target) return false
      const targetX = (target.x / 100) * info.rect.width + jitterOffset.x
      const targetY = (target.y / 100) * info.rect.height + jitterOffset.y
      const distance = Math.hypot(info.xPx - targetX, info.yPx - targetY)
      return distance <= tolerancePx
    },
    [activeIndex, jitterOffset.x, jitterOffset.y, spots, tolerancePx],
  )

  useEffect(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-steady`)
    endedRef.current = false
    resetHoldState()
    const rng = rngRef.current
    const generated: Spot[] = Array.from({ length: totalSpots }, () => ({
      x: 12 + rng() * 76,
      y: 18 + rng() * 64,
    }))
    setSpots(generated)
    setActiveIndex(0)
    activeIndexRef.current = 0
    setStatus(`Spot 1/${totalSpots} — clique et maintiens 2 s.`)
    setTimeLeft(timeLimit)
    setHoldProgress(0)
    setPointerPos(null)
    if (timerRef.current != null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 250
        if (next <= 0) {
          fail('Temps écoulé.')
          return 0
        }
        return next
      })
    }, 250)
    return () => {
      endedRef.current = true
      if (timerRef.current != null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      resetHoldState()
    }
  }, [fail, level, resetHoldState, seed, timeLimit, totalSpots])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (endedRef.current) return
    if (Date.now() < lockUntilRef.current) return
    const info = computePosition(event)
    if (!info) return
    const { rect: _rect, ...coords } = info
    setPointerPos(coords)
    if (pointerIdRef.current != null) return
    if (!isInsideActive(info)) return
    pointerIdRef.current = event.pointerId
    containerRef.current?.setPointerCapture(event.pointerId)
    startHold()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (endedRef.current) return
    const info = computePosition(event)
    if (!info) return
    const { rect: _rect, ...coords } = info
    setPointerPos(coords)
    if (!holding) return
    if (pointerIdRef.current === event.pointerId && !isInsideActive(info)) {
      fail('Tu as quitté le spot !')
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current == null || pointerIdRef.current !== event.pointerId) return
    lockUntilRef.current = Date.now() + 450
    fail('Tu as relâché trop tôt.')
  }

  const handlePointerLeave = () => {
    if (pointerIdRef.current != null) {
      lockUntilRef.current = Date.now() + 450
      fail('Tu as quitté la zone.')
    }
  }

  const grid = useMemo(
    () =>
      spots.map((spot, idx) => ({
        ...spot,
        state: idx === activeIndex ? 'active' : 'hidden',
      })),
    [activeIndex, spots],
  )

  const progressRatio = Math.min(1, holdProgress / holdDuration)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
        {status}
      </div>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className="relative touch-none"
        style={{
          width: 'min(320px, 70vw)',
          height: 'min(280px, 60vh)',
          borderRadius: '26px',
          border: `1px dashed ${theme.cream}33`,
          background: 'rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}
      >
        {grid.map((spot, idx) => (
          <span
            key={`${spot.x}-${spot.y}-${idx}`}
            className="absolute"
            style={{
              left: `${spot.x}%`,
              top: `${spot.y}%`,
              width: `${tolerancePx * 2}px`,
              height: `${tolerancePx * 2}px`,
              transform:
                spot.state === 'active'
                  ? `translate(calc(-50% + ${jitterOffset.x}px), calc(-50% + ${jitterOffset.y}px))`
                  : 'translate(-50%, -50%)',
              transition: spot.state === 'active' ? 'transform 0.12s ease' : undefined,
              borderRadius: '50%',
              border: spot.state === 'active' ? `2px dashed ${theme.cream}` : '2px dashed transparent',
              backgroundColor: 'transparent',
              boxShadow: spot.state === 'active' ? '0 0 18px rgba(0,255,200,0.45)' : 'none',
              opacity: spot.state === 'active' ? 1 : 0,
            }}
          />
        ))}
        {pointerPos ? (
          <span
            className="absolute"
            style={{
              left: `${pointerPos.xPct}%`,
              top: `${pointerPos.yPct}%`,
              transform: 'translate(-50%, -50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: holding ? '#2fffd0' : theme.cream,
              boxShadow: holding ? '0 0 8px rgba(47,255,208,0.6)' : 'none',
            }}
          />
        ) : null}
        {holding ? (
          <div
            className="absolute left-1/2 top-4 flex w-40 -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-xs font-inter"
            style={{ color: theme.cream }}
          >
            <span>Hold</span>
            <div className="h-1 flex-1 rounded-full bg-white/20">
              <div
                style={{
                  width: `${progressRatio * 100}%`,
                  height: '100%',
                  borderRadius: '999px',
                  background: '#2fffd0',
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
      <div className="text-xs font-inter uppercase tracking-[0.18em] opacity-70" style={{ color: theme.cream }}>
        Spot {Math.min(activeIndex + 1, totalSpots)}/{totalSpots} · Temps {(timeLeft / 1000).toFixed(1)} s
      </div>
    </div>
  )
}
