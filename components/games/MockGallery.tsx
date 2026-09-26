'use client'

/**
 * The base screens of both games, drawn on canvases from the same pixel
 * code the report's pictures come from: the title, a moment of play and
 * GAME OVER, wide and tall. A page to look at, not to play: the game loop
 * comes after the owner's GO on these screens. Each screen draws itself
 * and moves on only while it is in view, so a phone keeps up.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { GAME_NAMES, shotSpecs, type Game, type Layout, type ShotSpec } from '@/lib/games/screens'
import { TEXT_COLORS } from '@/lib/theme'

const LABELS: Record<string, string> = {
  titre: 'Écran titre',
  'titre-yesteryear': 'Écran titre — essai Yesteryear, incliné de 20°',
  jeu: 'En jeu',
  'jeu-niveau-1': 'En jeu — niveau 1 : sol noir',
  'jeu-niveau-4': 'En jeu — niveau 4 : damier léger, chaises',
  'jeu-niveau-8': 'En jeu — niveau 8 : tout le diner, et le milkshake bonus',
  'game-over': 'Game over',
}

function Screen({ spec, room }: { spec: ShotSpec; room: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const watch = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), { rootMargin: '120px' })
    watch.observe(canvas)
    return () => watch.disconnect()
  }, [])
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !visible) return
    let frame = 0
    const paint = () => {
      const buffer = spec.draw(frame)
      ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height), 0, 0)
      frame += 1
    }
    paint()
    const timer = window.setInterval(paint, 450)
    return () => window.clearInterval(timer)
  }, [spec, visible])
  // the largest whole scale that fits, so every pixel stays square and sharp; on a narrow phone, the full width
  const scale = Math.min(3, Math.floor(room / spec.width))
  const size = scale >= 1 ? { width: spec.width * scale, height: spec.height * scale } : { width: '100%', height: 'auto' }
  return (
    <figure style={{ margin: 0, maxWidth: '100%' }}>
      <canvas ref={ref} width={spec.width} height={spec.height} style={{ ...size, imageRendering: 'pixelated', display: 'block', background: '#000' }} />
      <figcaption style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{LABELS[spec.name] ?? spec.name}</figcaption>
    </figure>
  )
}

export default function MockGallery() {
  const [accent, setAccent] = useState(TEXT_COLORS[0])
  const [room, setRoom] = useState(1200)
  useEffect(() => {
    const fit = () => setRoom(window.innerWidth - 32)
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  const specs = useMemo(() => shotSpecs(accent), [accent])
  const group = (game: Game, layout: Layout): ShotSpec[] => specs.filter((spec) => spec.game === game && spec.layout === layout)
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
                {group(game, layout).map((spec) => <Screen key={`${spec.name}-${accent}`} spec={spec} room={layout === 'landscape' ? room : Math.min(room, 700)} />)}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  )
}
