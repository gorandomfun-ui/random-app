'use client'

/**
 * The transition sounds as files, for the devices that may not synthesise.
 *
 * On an iPhone and an iPad a running Web Audio engine takes the device's audio
 * session, and the video in the page is then given nothing: that is how the
 * owner lost the sound of his videos. A file played through a player takes
 * nothing from anyone — two players share the device happily — and it ignores
 * the silent switch, exactly as a video does.
 *
 * The files are rendered once by `scripts/sound/render.ts` from the same shapes
 * `utils/sound.ts` synthesises live. A handful of players are kept and reused,
 * so two draws in quick succession never wait on one another.
 */

export type SoundName = 'random' | 'again' | 'wave-enter' | 'wave-step'

/** How many steps of the progression each sound was rendered at. */
const STEPS: Record<SoundName, number> = { random: 3, again: 3, 'wave-enter': 1, 'wave-step': 1 }
/** Players kept per file: enough for sounds that overlap, few enough to stay light. */
const VOICES = 2
const VOLUME = 0.55

const pools = new Map<string, HTMLAudioElement[]>()
let unlocked = false

function fileFor(name: SoundName, progress: number): string {
  const steps = STEPS[name]
  if (steps <= 1) return `/sounds/${name}.wav`
  const step = Math.max(0, Math.min(steps - 1, Math.round(Number.isFinite(progress) ? progress : 0)))
  return `/sounds/${name}-${step}.wav`
}

function poolFor(src: string): HTMLAudioElement[] {
  const held = pools.get(src)
  if (held) return held
  const made = Array.from({ length: VOICES }, () => {
    const audio = new Audio(src)
    audio.preload = 'auto'
    audio.volume = VOLUME
    return audio
  })
  pools.set(src, made)
  return made
}

/**
 * Warms the players during a touch.
 *
 * A phone only lets a file start after a touch, and only for a player it has
 * already met. Each one is started and stopped at once, silently, so the sound
 * of a draw can play later without one.
 */
export function unlockSoundFiles(): void {
  if (unlocked || typeof window === 'undefined') return
  unlocked = true
  for (const name of Object.keys(STEPS) as SoundName[]) {
    for (let step = 0; step < STEPS[name]; step += 1) {
      for (const audio of poolFor(fileFor(name, step))) {
        const before = audio.volume
        audio.volume = 0
        audio.play().then(
          () => { audio.pause(); audio.currentTime = 0; audio.volume = before },
          () => { audio.volume = before },
        )
      }
    }
  }
}

/** Plays a sound, on the first of its players that is free. */
export function playSoundFile(name: SoundName, progress = 0): void {
  if (typeof window === 'undefined') return
  const pool = poolFor(fileFor(name, progress))
  const free = pool.find((audio) => audio.paused || audio.ended) ?? pool[0]
  try {
    free.currentTime = 0
    free.volume = VOLUME
    void free.play().catch(() => undefined)
  } catch {
    /* A browser that refuses simply stays quiet. */
  }
}
