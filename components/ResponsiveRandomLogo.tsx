'use client'

import { useEffect, useMemo, useState } from 'react'

type Layout = 'one' | 'two' | 'auto'
const LETTERS = ['R','A','N','D','O','M'] as const

type Props = {
  className?: string
  trigger?: number
  layout?: Layout
  heightMobile?: number   // vw
  heightDesktop?: number  // vw
  gapMobile?: number      // px (espace positif entre lettres)
  gapDesktop?: number     // px
  color?: string
}

export default function ResponsiveRandomLogo({
  className = '',
  trigger = 0,
  layout = 'auto',
  heightMobile = 22,
  heightDesktop = 14,
  gapMobile = 12,
  gapDesktop = 16,
  color = '#FEFBE8',
}: Props) {
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const onResize = () => setIsPortrait(window.innerHeight > window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const effectiveLayout: 'one' | 'two' =
    layout === 'auto' ? (isPortrait ? 'two' : 'one') : layout

  const lines = useMemo(() => {
    if (effectiveLayout === 'two') return [LETTERS.slice(0,3), LETTERS.slice(3)]
    return [LETTERS]
  }, [effectiveLayout])

  return (
    <div className={className}>
      <style jsx>{`
        .row { display:flex; align-items:end; justify-content:center }
        @media (max-width:767px){
          .letter{ height:${heightMobile}vw; width:auto }
          .letter:not(:last-child){ margin-right:${gapMobile}px }
        }
        @media (min-width:768px){
          .letter{ height:${heightDesktop}vw; width:auto }
          .letter:not(:last-child){ margin-right:${gapDesktop}px }
        }
      `}</style>

      {lines.map((row, idx) => (
        <div className="row" key={idx}>
          {row.map((L, i) => (
            <div className="letter" data-letter={L} key={`${idx}-${L}-${i}`}>
              <img
                src={`/logo/${L}1.svg`}  // <-- fichiers dans /public/logo
                alt={L}
                style={{ display:'block', height:'100%', width:'auto' }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
