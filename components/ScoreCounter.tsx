'use client'

import Image from 'next/image'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { useScore } from '@/providers/ScoreProvider'

const DIAMOND_ICON = '/icons/diamond.png'

export type ScoreCounterVariant = 'home' | 'random' | 'menu'

type AnimatedDiamond = {
  id: string
  amount: number
  dx: number
  dy: number
}

type Props = {
  variant?: ScoreCounterVariant
  className?: string
  style?: CSSProperties
}

export default function ScoreCounter({ variant = 'home', className = '', style }: Props) {
  const { score, diamonds } = useScore()
  const [activeDiamonds, setActiveDiamonds] = useState<AnimatedDiamond[]>([])
  const lastSeenRef = useRef<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement | null>(null)
  const targetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

  const updateTarget = useCallback(() => {
    if (typeof window === 'undefined') return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = rect.left + rect.width / 2 - window.innerWidth / 2
    const dy = rect.top + rect.height / 2 - window.innerHeight / 2
    targetRef.current = { dx, dy }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    updateTarget()
    window.addEventListener('resize', updateTarget)
    window.addEventListener('scroll', updateTarget, true)
    return () => {
      window.removeEventListener('resize', updateTarget)
      window.removeEventListener('scroll', updateTarget, true)
    }
  }, [updateTarget])

  useEffect(() => {
    const seen = lastSeenRef.current
    const newcomers = diamonds.filter((diamond) => !seen.has(diamond.id))
    if (!newcomers.length) return
    const { dx, dy } = targetRef.current
    newcomers.forEach((diamond) => {
      seen.add(diamond.id)
      setActiveDiamonds((prev) => [...prev, { id: diamond.id, amount: diamond.amount, dx, dy }])
      setTimeout(() => {
        setActiveDiamonds((prev) => prev.filter((entry) => entry.id !== diamond.id))
        seen.delete(diamond.id)
      }, 1400)
    })
  }, [diamonds])

  const baseClass = 'score-counter'
  const variantClass = variant === 'random' ? 'score-counter--random' : ''

  return (
    <div
      ref={containerRef}
      className={`${baseClass} ${variantClass} ${className}`}
      data-variant={variant}
      style={style}
    >
      <span className="score-counter__label">XP :</span>
      <span className="score-counter__value">{score}</span>

      {activeDiamonds.map((diamond) => (
        <Diamond key={diamond.id} amount={diamond.amount} dx={diamond.dx} dy={diamond.dy} />
      ))}
    </div>
  )
}

function Diamond({ amount, dx, dy }: { amount: number; dx: number; dy: number }) {
  const style = useMemo(
    () => ({
      '--diamond-dx': `${dx}px`,
      '--diamond-dy': `${dy}px`,
    }) as CSSProperties,
    [dx, dy]
  )

  return (
    <div className="score-diamond" style={style}>
      <Image src={DIAMOND_ICON} alt="" className="score-diamond__icon" width={120} height={120} />
      <span className="score-diamond__value">+{amount}</span>
    </div>
  )
}
