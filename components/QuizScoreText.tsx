'use client'

import type { CSSProperties } from 'react'

import { useScore } from '@/providers/ScoreProvider'

type Props = {
  className?: string
  style?: CSSProperties
}

export default function QuizScoreText({
  className = 'text-lg font-semibold uppercase',
  style,
}: Props) {
  const { quizScore } = useScore()

  return (
    <span className={className} style={style}>
      {quizScore} PTS
    </span>
  )
}
