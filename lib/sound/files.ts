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
 *
 * Safari does not drop a sound it cannot play at once: while a video holds the
 * sound, while the page comes back from another app or from a locked screen, it
 * keeps the request and plays it when it can. Every sound asked in between then
 * came out together, a burst the owner heard on his iPhone (29/09). A sound here
 * starts at once or never: one that has not started within `DEADLINE_MS` is
 * stopped, which is also what makes Safari forget it.
 */

export type SoundName = 'random' | 'again' | 'wave-enter' | 'wave-step'

/** How many steps of the progression each sound was rendered at. */
const STEPS: Record<SoundName, number> = { random: 3, again: 3, 'wave-enter': 1, 'wave-step': 1 }
/** Players kept per file: enough for sounds that overlap, few enough to stay light. */
const VOICES = 2
const VOLUME = 0.55
/** How late a sound may start. Later, it belongs to another moment: it is dropped. */
export const DEADLINE_MS = 250

/** What the players were asked for and what came of it, for the page's witness. */
const tally = { asked: 0, started: 0, dropped: 0 }
/** Each player's latest request, so a deadline only judges the request that set it. */
const turns = new WeakMap<HTMLAudioElement, number>()
/** Players asked to play whose deadline has not come yet. */
const pending = new Set<HTMLAudioElement>()
let watching = false

const pools = new Map<string, HTMLAudioElement[]>()
let unlocked = false

/**
 * Blank players started once during the first touch, for sounds the page does
 * not know yet — the games', which come later. A phone lets a player it has
 * met play any file afterwards, so a game's tune can start the moment the
 * game shows, without a touch of its own.
 */
const SPARES = 16
const spares: HTMLAudioElement[] = []
/** A tenth of a second of silence, as a file the players can start on. */
function silence(): string {
  const samples = 800
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i += 1) bytes[at + i] = s.charCodeAt(i) }
  text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true)
  text(36, 'data'); view.setUint32(40, samples, true)
  bytes.fill(128, 44)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return `data:audio/wav;base64,${btoa(binary)}`
}

/** A player a touch has already met when there is one left, a new one otherwise (it will need a touch of its own). */
export function spareSoundPlayer(): HTMLAudioElement {
  return spares.pop() ?? new Audio()
}

/** A player given back, stopped, for the next game. */
export function returnSoundPlayer(audio: HTMLAudioElement): void {
  try { audio.pause() } catch { /* nothing to stop */ }
  audio.loop = false
  if (spares.length < SPARES) spares.push(audio)
}

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
  const blank = silence()
  for (let i = 0; i < SPARES; i += 1) {
    const audio = new Audio(blank)
    audio.muted = true
    spares.push(audio)
    audio.play().then(() => { audio.pause(); audio.muted = false }, () => { audio.muted = false })
  }
  for (const name of Object.keys(STEPS) as SoundName[]) {
    for (let step = 0; step < STEPS[name]; step += 1) {
      for (const audio of poolFor(fileFor(name, step))) {
        // Muted, not turned down: an iPhone ignores a page's volume, and these
        // sixteen players all sounded together the moment their files arrived.
        const turn = (turns.get(audio) ?? 0) + 1
        turns.set(audio, turn)
        audio.muted = true
        audio.play().then(
          () => { if (turns.get(audio) === turn) { audio.pause(); audio.currentTime = 0; audio.muted = false } },
          () => { if (turns.get(audio) === turn) audio.muted = false },
        )
      }
    }
  }
}

/** The witness's numbers: sounds asked, sounds that started in time, sounds dropped. */
export function fileSoundTally(): { asked: number; started: number; dropped: number } {
  return { ...tally }
}

/** A hidden page stops its players, so that nothing held comes out on the way back. */
function watchHiding(): void {
  if (watching || typeof document === 'undefined') return
  watching = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    const players = new Set(pending)
    for (const pool of pools.values()) for (const audio of pool) players.add(audio)
    for (const audio of players) drop(audio, false)
  })
}

/** Stops a player and forgets what it was asked; on Safari, pausing is what cancels a held request. */
function drop(audio: HTMLAudioElement, counted: boolean): void {
  pending.delete(audio)
  turns.set(audio, (turns.get(audio) ?? 0) + 1)
  if (counted) tally.dropped += 1
  try { audio.pause(); audio.currentTime = 0 } catch { /* nothing to stop */ }
}

/**
 * Plays a player now or never. `askedAt` is when the page wanted the sound, so
 * the time spent loading this file's code counts too.
 */
export function playNowOrNever(audio: HTMLAudioElement, askedAt = performance.now()): void {
  tally.asked += 1
  const left = askedAt + DEADLINE_MS - performance.now()
  if (left <= 0 || (typeof document !== 'undefined' && document.hidden)) { tally.dropped += 1; return }
  watchHiding()
  const turn = (turns.get(audio) ?? 0) + 1
  turns.set(audio, turn)
  pending.add(audio)
  let started = false
  const mark = () => { started = true }
  audio.addEventListener('playing', mark, { once: true })
  try {
    audio.muted = false
    audio.currentTime = 0
    void audio.play().then(mark, () => undefined)
  } catch {
    /* A browser that refuses simply stays quiet. */
  }
  setTimeout(() => {
    audio.removeEventListener('playing', mark)
    if (turns.get(audio) !== turn) return
    // a busy page can run this after the sound began: a clock that moves means it did
    if (started || (!audio.paused && audio.currentTime > 0)) { pending.delete(audio); tally.started += 1; return }
    drop(audio, true)
  }, left)
}

/** Plays a sound, on the first of its players that is free. */
export function playSoundFile(name: SoundName, progress = 0, askedAt = performance.now()): void {
  if (typeof window === 'undefined') return
  const pool = poolFor(fileFor(name, progress))
  const free = pool.find((audio) => (audio.paused || audio.ended) && !pending.has(audio)) ?? pool[0]
  free.volume = VOLUME
  playNowOrNever(free, askedAt)
}
