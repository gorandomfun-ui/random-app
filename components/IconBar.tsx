'use client'

import Image from 'next/image'
import { Dictionary } from '@/types'

interface IconBarProps {
  dict: Dictionary
}

export default function IconBar({ dict }: IconBarProps) {
  const items = [
    { icon: '/icons/image.svg', emoji: '📷', label: dict.nav.images },
    { icon: '/icons/video.svg', emoji: '🎬', label: dict.nav.videos },
    { icon: '/icons/web.svg', emoji: '🌐', label: dict.nav.web },
    { icon: '/icons/quote.svg', emoji: '💭', label: dict.nav.quotes },
    { icon: '/icons/joke.svg', emoji: '😂', label: dict.nav.jokes },
    { icon: '/icons/fact.svg', emoji: '💡', label: dict.nav.facts },
  ]
  
  // Vérifier si les SVG sont disponibles
  const hasSVG = false // Mettre à true quand les fichiers SVG sont ajoutés
  
  return (
    <div className="flex flex-wrap justify-center gap-4 md:gap-6">
      {items.map((item, index) => (
        <div 
          key={index}
          className="icon-label text-sm md:text-base opacity-90 hover:opacity-100 transition-opacity"
        >
          {hasSVG ? (
            <Image
              src={item.icon}
              alt={item.label}
              width={20}
              height={20}
              className="opacity-90"
            />
          ) : (
            <span className="text-lg md:text-xl">{item.emoji}</span>
          )}
          <span className="font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  )
}