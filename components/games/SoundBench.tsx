'use client'

/**
 * The games' sounds, to listen to on the test page: each game's tune, its
 * sounds one by one, and "as in the game" — the tune low with sounds coming
 * over it at a game's pace. Played exactly as the games play them: live on a
 * computer, from the files on an iPhone or an iPad.
 */

import { useEffect, useRef, useState } from 'react'

import type { SoundName } from '@/lib/games/chiptune'
import type { GameName } from '@/lib/games/scores'
import { GAME_SOUNDS, gameSounds, type GameSounds } from '@/lib/games/sound'
import { wakeSound } from '@/utils/sound'

const LABELS: Record<SoundName, string> = {
  bite: 'Burger avalé', fries: 'Frites', shake: 'Milkshake', donut: 'Donut', gold: 'Burger doré', crash: 'Choc (perdu)',
  item: 'Article avalé', sauce: 'Bouteille de sauce', slip: 'Client qui glisse', coin: 'Pièce', note: 'Billet', bundle: 'Liasse', card: 'Carte', caught: 'Attrapé',
  squirt: 'Giclée de ketchup', pop: 'Burger touché', clink: 'Assiette ébréchée', power: 'Bonus attrapé', hurt: 'Cuisinier touché',
  rip: 'Papier alu arraché', whoosh: 'Plongeurs qui partent / rival dépassé', thud: 'Boss touché / choc', boom: 'Boss qui explose',
  beep: 'Feu rouge', go: 'Feu vert', engine: 'Moteur (en boucle)',
  level: 'Niveau gagné', over: 'Game over', winner: 'Winner',
}
const GAMES: GameName[] = ['eater', 'catcher', 'attacks', 'racing']
const NAMES: Record<GameName, string> = { eater: 'Random Eater', catcher: 'Random Catcher', attacks: 'Random Attacks', racing: 'Random Racing' }
const TUNES: Record<GameName, string> = { eater: 'Musique du diner', catcher: 'Musique de la supérette', attacks: 'Musique de Mars', racing: 'Musique de la côte' }
/** What a game sounds like for half a minute: mostly the plain catch, now and then something more. */
const PLAY: Record<GameName, SoundName[]> = {
  eater: ['bite', 'bite', 'fries', 'bite', 'bite', 'shake', 'bite', 'donut', 'bite', 'bite', 'gold', 'bite', 'level'],
  catcher: ['item', 'item', 'coin', 'item', 'sauce', 'item', 'slip', 'note', 'item', 'card', 'item', 'bundle', 'caught', 'item', 'level'],
  attacks: ['squirt', 'pop', 'squirt', 'rip', 'squirt', 'pop', 'whoosh', 'squirt', 'pop', 'clink', 'squirt', 'thud', 'squirt', 'thud', 'gold', 'power', 'squirt', 'hurt', 'boom', 'level'],
  racing: ['beep', 'beep', 'beep', 'go', 'coin', 'coin', 'coin', 'whoosh', 'note', 'slip', 'thud', 'power', 'clink', 'gold', 'whoosh', 'beep', 'beep', 'level'],
}

export default function SoundBench({ accent }: { accent: string }) {
  const sounds = useRef<Partial<Record<GameName, GameSounds>>>({})
  const [tune, setTune] = useState<GameName | null>(null)
  const [demo, setDemo] = useState<GameName | null>(null)

  useEffect(() => {
    const made = { eater: gameSounds('eater'), catcher: gameSounds('catcher'), attacks: gameSounds('attacks'), racing: gameSounds('racing') }
    sounds.current = made
    return () => { made.eater.dispose(); made.catcher.dispose(); made.attacks.dispose(); made.racing.dispose() }
  }, [])

  // the tune asked for again and again, as a game does at every frame
  useEffect(() => {
    const on = demo ?? tune
    const timer = window.setInterval(() => {
      for (const game of GAMES) sounds.current[game]?.tune(on === game)
    }, 100)
    return () => {
      window.clearInterval(timer)
      for (const game of GAMES) sounds.current[game]?.tune(false)
    }
  }, [tune, demo])

  // as in the game: a sound every so often over the tune
  useEffect(() => {
    if (!demo) return
    let i = 0
    const timer = window.setInterval(() => {
      const list = PLAY[demo]
      sounds.current[demo]?.play(list[i % list.length])
      i += 1
    }, 850)
    return () => window.clearInterval(timer)
  }, [demo])

  const touch = () => {
    wakeSound()
    for (const game of GAMES) sounds.current[game]?.touch()
  }
  const button = (active: boolean) => ({
    padding: '8px 14px', borderRadius: 999, border: `2px solid ${accent}`, background: active ? accent : 'transparent',
    color: '#F8F5E6', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  })

  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontFamily: 'var(--font-tomorrow), sans-serif', fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, color: accent }}>Sons des jeux</h2>
      <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16, maxWidth: 720 }}>
        Chaque musique, chaque son, et « comme en jeu » : la musique basse avec des sons par-dessus au rythme d&apos;une partie. Sur iPhone et iPad, ce sont les fichiers que les jeux jouent vraiment.
      </p>
      {GAMES.map((game) => (
        <div key={game} style={{ marginBottom: 24 }} onPointerDown={touch}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 10 }}>{NAMES[game]}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <button type="button" style={button(tune === game && !demo)} onClick={() => { setDemo(null); setTune(tune === game && !demo ? null : game) }}>
              {tune === game && !demo ? '■ ' : '▶ '}{TUNES[game]}
            </button>
            <button type="button" style={button(demo === game)} onClick={() => { setTune(null); setDemo(demo === game ? null : game) }}>
              {demo === game ? '■ ' : '▶ '}Comme en jeu
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GAME_SOUNDS[game].sounds.map((name) => (
              <button key={name} type="button" style={button(false)} onClick={() => sounds.current[game]?.play(name)}>{LABELS[name]}</button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
