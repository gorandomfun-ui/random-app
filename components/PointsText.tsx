'use client'

import type { CSSProperties } from 'react'

import { useScore } from '@/providers/ScoreProvider'

type Props = {
  className?: string
  style?: CSSProperties
}

/** The one total of points, wherever a menu or a page header shows it. */
export default function PointsText({
  className = 'text-lg font-semibold uppercase',
  style,
}: Props) {
  const { points } = useScore()

  return (
    <span className={className} style={style}>
      {points} PTS
    </span>
  )
}
