'use client'

type Theme = { bg: string; deep: string; cream: string; text: string }

// On utilise MonoIcon pour teinter le SVG (couleur du thème)
import MonoIcon from './MonoIcon'

export default function LikesMenu({ theme }: { theme: Theme }) {
  return (
    <a href="/likes" aria-label="Likes" className="inline-flex items-center justify-center">
      <MonoIcon src="/icons/Heart.svg" color={theme.text} size={28} />
    </a>
  )
}
