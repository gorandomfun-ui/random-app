'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { useScore } from '@/providers/ScoreProvider'

const DIAMOND_ICON = '/icons/diamond.png'

export type ScoreCounterVariant = 'home' | 'random' | 'menu'

type AnimatedDiamond = {
  id: string
  amount: number
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

  useEffect(() => {
    const seen = lastSeenRef.current
    const newcomers = diamonds.filter((diamond) => !seen.has(diamond.id))
    if (!newcomers.length) return
    newcomers.forEach((diamond) => {
      seen.add(diamond.id)
      setActiveDiamonds((prev) => [...prev, { id: diamond.id, amount: diamond.amount }])
      setTimeout(() => {
        setActiveDiamonds((prev) => prev.filter((entry) => entry.id !== diamond.id))
        seen.delete(diamond.id)
      }, 1100)
    })
  }, [diamonds])

  const baseClass = 'score-counter'
  const variantClass = variant === 'random' ? 'score-counter--random' : ''

  return (
    <div className={`${baseClass} ${variantClass} ${className}`} data-variant={variant} style={style}>
      <span className="score-counter__label">Score :</span>
      <span className="score-counter__value">{score}</span>

      <div className="score-counter__spark" aria-hidden>
        {activeDiamonds.map((diamond) => (
          <Diamond key={diamond.id} amount={diamond.amount} />
        ))}
      </div>
    </div>
  )
}

function Diamond({ amount }: { amount: number }) {
  return (
    <div className="score-diamond">
      <Image src={DIAMOND_ICON} alt="" className="score-diamond__icon" width={22} height={22} />
      <span className="score-diamond__value">+{amount}</span>
    </div>
  )
}
