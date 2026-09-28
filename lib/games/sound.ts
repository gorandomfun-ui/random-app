'use client'

/**
 * A game's sounds and its tune, played the way Random plays its own: on a
 * computer or an Android phone through Random's engine, from samples made
 * here (`chiptune.ts`); on an iPhone or an iPad as files through players,
 * because a live engine there takes the videos' sound away. The files ignore
 * the silent switch, as a video does; Random's own sound switch silences
 * everything, and so does a hidden page.
 *
 * The tune plays on the title and on under the game, low; the sounds are
 * light. Their levels are in the samples themselves: an iPhone does not let
 * a page turn a file down.
 */

import { returnSoundPlayer, spareSoundPlayer } from '@/lib/sound/files'
import { gameSoundContext, getMuted, soundByFiles } from '@/utils/sound'

import { renderSound, renderTuneSoftly, SOUND_RATE, type SoundName, type TuneName } from './chiptune'
import type { GameName } from './scores'

/** Each game's tune and the sounds it can make. */
export const GAME_SOUNDS: Record<GameName, { tune: TuneName; sounds: readonly SoundName[] }> = {
  eater: { tune: 'diner', sounds: ['bite', 'fries', 'shake', 'donut', 'gold', 'crash', 'level', 'over', 'winner'] },
  catcher: { tune: 'store', sounds: ['item', 'sauce', 'slip', 'coin', 'note', 'bundle', 'card', 'caught', 'level', 'over', 'winner'] },
}
/** Sounds that can follow one another closely get two players. */
const TWICE: ReadonlySet<SoundName> = new Set(['bite', 'item', 'coin'])

export type GameSounds = {
  play: (name: SoundName) => void
  /** Whether the tune should be heard now: said at every frame, acted on only when it changes. */
  tune: (on: boolean) => void
  /** To be called during a touch or a key: an iPhone lets a player start only after one. */
  touch: () => void
  dispose: () => void
}

export const soundFile = (name: SoundName) => `/sounds/games/${name}.wav`
export const tuneFile = (name: TuneName) => `/sounds/games/tune-${name}.wav`

/** Samples already made, kept for the page's life: the games and the listening bench share them. */
const made = new Map<SoundName, Float32Array>()
const madeTunes = new Map<TuneName, Promise<Float32Array>>()
function soundSamples(name: SoundName): Float32Array {
  let data = made.get(name)
  if (!data) { data = renderSound(name); made.set(name, data) }
  return data
}
function tuneSamples(name: TuneName): Promise<Float32Array> {
  let data = madeTunes.get(name)
  if (!data) { data = renderTuneSoftly(name); madeTunes.set(name, data) }
  return data
}

const silent = () => getMuted() || (typeof document !== 'undefined' && document.hidden)

export function gameSounds(game: GameName): GameSounds {
  return soundByFiles() ? filePlayers(game) : livePlayers(game)
}

/** A computer, an Android phone: Random's engine plays the samples. */
function livePlayers(game: GameName): GameSounds {
  const { tune, sounds } = GAME_SOUNDS[game]
  const buffers = new Map<string, AudioBuffer>()
  let alive = true, want = false, tried = 0
  let loop: Float32Array | null = null
  let source: AudioBufferSourceNode | null = null
  let level: GainNode | null = null
  let startedAt = 0, offset = 0

  const bufferOf = (context: AudioContext, key: string, data: Float32Array) => {
    let buffer = buffers.get(key)
    if (!buffer) {
      buffer = context.createBuffer(1, data.length, SOUND_RATE)
      buffer.getChannelData(0).set(data)
      buffers.set(key, buffer)
    }
    return buffer
  }
  const start = () => {
    if (source || !loop || !want) return
    // the engine asked for at most once a second while it will not play
    const now = performance.now()
    const context = gameSoundContext()
    if (!context) { tried = now; return }
    const buffer = bufferOf(context, `tune:${tune}`, loop)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.3)
    const node = context.createBufferSource()
    node.buffer = buffer
    node.loop = true
    node.connect(gain).connect(context.destination)
    node.start(0, offset % buffer.duration)
    startedAt = context.currentTime - offset
    source = node
    level = gain
  }
  const stop = () => {
    if (!source || !level) return
    const context = level.context
    offset = (context.currentTime - startedAt) % (source.buffer?.duration || 1)
    level.gain.cancelScheduledValues(context.currentTime)
    level.gain.setValueAtTime(level.gain.value, context.currentTime)
    level.gain.linearRampToValueAtTime(0, context.currentTime + 0.06)
    source.stop(context.currentTime + 0.08)
    source = null
    level = null
  }

  // the tune made a little at a time, then this game's sounds one by one, so the first bite never waits
  void tuneSamples(tune).then((data) => { loop = data; start() })
  let next = 0
  const warm = () => {
    if (!alive || next >= sounds.length) return
    soundSamples(sounds[next])
    next += 1
    timer = window.setTimeout(warm, 40)
  }
  let timer = window.setTimeout(warm, 300)

  return {
    play(name) {
      if (silent()) return
      const context = gameSoundContext()
      if (!context) return
      const node = context.createBufferSource()
      node.buffer = bufferOf(context, name, soundSamples(name))
      node.connect(context.destination)
      node.start()
    },
    tune(on) {
      want = on && !silent()
      if (!want) { stop(); return }
      if (!source && performance.now() - tried > 1000) start()
    },
    touch() { tried = 0 },
    dispose() { alive = false; want = false; window.clearTimeout(timer); stop() },
  }
}

/** An iPhone, an iPad: the same sounds as files, each on a player of its own. */
function filePlayers(game: GameName): GameSounds {
  const { tune, sounds } = GAME_SOUNDS[game]
  const all: HTMLAudioElement[] = []
  const take = (src: string) => {
    const audio = spareSoundPlayer()
    audio.preload = 'auto'
    audio.src = src
    all.push(audio)
    return audio
  }
  const players = new Map<SoundName, HTMLAudioElement[]>()
  for (const name of sounds) players.set(name, Array.from({ length: TWICE.has(name) ? 2 : 1 }, () => take(soundFile(name))))
  const music = take(tuneFile(tune))
  music.loop = true
  const met = new Set<HTMLAudioElement>()
  let want = false, tried = 0

  const start = () => {
    tried = performance.now()
    void music.play().catch(() => undefined)
  }

  return {
    play(name) {
      if (silent()) return
      const pool = players.get(name)
      if (!pool) return
      const free = pool.find((audio) => audio.paused || audio.ended) ?? pool[0]
      try {
        free.currentTime = 0
        void free.play().catch(() => undefined)
      } catch { /* a browser that refuses stays quiet */ }
    },
    tune(on) {
      want = on && !silent()
      if (!want) { if (!music.paused) music.pause(); return }
      if (music.paused && performance.now() - tried > 1000) start()
    },
    touch() {
      // every player this game has not met yet is started and stopped at once, silently, during the touch
      for (const audio of all) {
        if (met.has(audio)) continue
        met.add(audio)
        if (audio === music && want) { start(); continue }
        audio.muted = true
        audio.play().then(
          () => { if (!(audio === music && want)) { audio.pause(); audio.currentTime = 0 } audio.muted = false },
          () => { audio.muted = false },
        )
      }
    },
    dispose() {
      want = false
      for (const audio of all) returnSoundPlayer(audio)
      all.length = 0
    },
  }
}
