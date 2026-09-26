'use client'

/**
 * The base screens of both games, drawn on canvases from the same pixel
 * code the report's pictures come from: the title, a moment of play and
 * GAME OVER, wide and tall. A page to look at, not to play: the game loop
 * comes after the owner's GO on these screens.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { GAME_NAMES, renderAll, type Game, type Layout, type Shot } from '@/lib/games/screens'
import type { PixelBuffer } from '@/lib/games/pixels'
import { TEXT_COLORS } from '@/lib/theme'

const LABELS: Record<string, string> = {
  titre: 'Écran titre',
  jeu: 'En jeu',
  'jeu-sol-uni': 'En jeu — sol uni (premiers niveaux)',
  'jeu-sol-dalles': 'En jeu — dallage blanc et gris',
  'jeu-niveau-avance': 'En jeu — niveau avancé : damier et mobilier',
  'game-over': 'Game over',
}

function Screen({ buffer, label, width }: { buffer: PixelBuffer; label: string; width: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height), 0, 0)
  }, [buffer])
  // the largest whole scale that fits, so every pixel stays square and sharp; on a narrow phone, the full width
  const scale = Math.min(4, Math.floor(width / buffer.width))
  const size = scale >= 1 ? { width: buffer.width * scale, height: buffer.height * scale } : { width: '100%', height: 'auto' }
  return (
    <figure style={{ margin: 0, maxWidth: '100%' }}>
      <canvas ref={ref} width={buffer.width} height={buffer.height} style={{ ...size, imageRendering: 'pixelated', display: 'block', background: '#000' }} />
      <figcaption style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{label}</figcaption>
    </figure>
  )
}

export default function MockGallery() {
  const [accent, setAccent] = useState(TEXT_COLORS[0])
  const [frame, setFrame] = useState(0)
  const [room, setRoom] = useState(1200)
  useEffect(() => {
    const timer = window.setInterval(() => setFrame((value) => value + 1), 400)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const fit = () => setRoom(window.innerWidth - 32)
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  // Redrawn with every tick: cars drive, neon flickers, the burger chomps, the eater crawls.
  const shots = useMemo(() => renderAll(accent, frame), [accent, frame])
  const group = (game: Game, layout: Layout): Shot[] => shots.filter((shot) => shot.game === game && shot.layout === layout)
  return (
    <main style={{ background: '#191916', color: '#F8F5E6', minHeight: '100vh', padding: 16, fontFamily: 'var(--font-inter-tight), sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-tomorrow), sans-serif', fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Jeux — visuels de base</h1>
      <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 12, maxWidth: 720 }}>
        Les écrans des deux jeux, dessinés en pixels par le code du projet, en paysage puis en portrait. Les écrans titre et game over sont deux fois plus fins que le jeu. Rien n&apos;est jouable ici. Choisis une couleur du site :
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TEXT_COLORS.map((color) => (
          <button key={color} onClick={() => setAccent(color)} aria-label={color} style={{ width: 32, height: 32, borderRadius: 999, background: color, border: color === accent ? '3px solid #F8F5E6' : '3px solid transparent' }} />
        ))}
      </div>
      {(['catcher', 'eater'] as Game[]).map((game) => (
        <section key={game} style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'var(--font-tomorrow), sans-serif', fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, color: accent }}>{GAME_NAMES[game]}</h2>
          {(['landscape', 'portrait'] as Layout[]).map((layout) => (
            <div key={layout} style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, marginBottom: 8 }}>{layout === 'landscape' ? 'Paysage' : 'Portrait'}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                {group(game, layout).map((shot) => <Screen key={shot.name} buffer={shot.buffer} label={LABELS[shot.name] ?? shot.name} width={layout === 'landscape' ? room : Math.min(room, 700)} />)}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  )
}
