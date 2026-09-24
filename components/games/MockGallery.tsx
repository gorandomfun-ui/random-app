'use client'

/**
 * The still screens of both games, drawn on canvases from the same pixel
 * code the report's pictures come from. A page to look at, not to play:
 * the game loop comes after the owner's GO on these screens.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { canvasSize, GAME_NAMES, renderAll, type Game } from '@/lib/games/screens'
import type { PixelBuffer } from '@/lib/games/pixels'
import { TEXT_COLORS } from '@/lib/theme'

function Screen({ buffer, name, scale }: { buffer: PixelBuffer; name: string; scale: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height), 0, 0)
  }, [buffer])
  return (
    <figure style={{ margin: 0 }}>
      <canvas ref={ref} width={buffer.width} height={buffer.height} style={{ width: buffer.width * scale, height: buffer.height * scale, imageRendering: 'pixelated', display: 'block', background: '#000' }} />
      <figcaption style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{name}</figcaption>
    </figure>
  )
}

export default function MockGallery() {
  const [accent, setAccent] = useState(TEXT_COLORS[0])
  const [frame, setFrame] = useState(0)
  const [scale, setScale] = useState(3)
  useEffect(() => {
    const timer = window.setInterval(() => setFrame((value) => value + 1), 400)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const fit = () => {
      const widest = Math.max(canvasSize('catcher').width, canvasSize('eater').width)
      setScale(Math.max(1, Math.min(4, Math.floor((window.innerWidth - 32) / widest))))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  // Redrawn with every tick so the title's hero and the play screen's walkers step.
  const animated = useMemo(() => (['catcher', 'eater'] as Game[]).map((game) => ({ game, screens: renderAll(game, accent, frame) })), [accent, frame])
  return (
    <main style={{ background: '#191916', color: '#F8F5E6', minHeight: '100vh', padding: 16, fontFamily: 'var(--font-inter-tight), sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-tomorrow), sans-serif', fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Jeux — maquette statique</h1>
      <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 12 }}>Les écrans des deux jeux, dessinés en pixels par le code du projet, avec leurs petites animations. Rien n&apos;est jouable ici. Choisis une couleur du site :</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TEXT_COLORS.map((color) => (
          <button key={color} onClick={() => setAccent(color)} aria-label={color} style={{ width: 32, height: 32, borderRadius: 999, background: color, border: color === accent ? '3px solid #F8F5E6' : '3px solid transparent' }} />
        ))}
      </div>
      {animated.map(({ game, screens: list }) => (
        <section key={game} style={{ marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-tomorrow), sans-serif', fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, color: accent }}>{GAME_NAMES[game]}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            {list.map((entry) => <Screen key={entry.name} buffer={entry.buffer} name={entry.name} scale={scale} />)}
          </div>
        </section>
      ))}
    </main>
  )
}
