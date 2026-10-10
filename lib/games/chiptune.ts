/**
 * The games' sounds and their tunes, made from numbers the way the old
 * consoles made theirs: pulse and triangle waves, a little noise, short
 * envelopes. Nothing is recorded and nothing is borrowed — the tunes are
 * written here, note by note.
 *
 * Everything renders to mono samples at 22 050 Hz. A computer plays them
 * through Random's engine; an iPhone or an iPad plays the same samples
 * written to files (`scripts/games/sounds.ts`), as it does Random's own
 * sounds, because a live engine there takes the videos' sound away.
 *
 * The levels are set here, in the samples, not by the player: an iPhone does
 * not let a page turn a file down. The tunes sit low, under light sounds.
 *
 * Pure and repeatable: the noise comes from its own seeded generator, never
 * from Math.random, which the page's draws share.
 */

export const SOUND_RATE = 22_050

/** EATER's sounds, CATCHER's, ATTACKS', RACING's, and those the games share. */
export type SoundName =
  | 'bite' | 'fries' | 'shake' | 'donut' | 'gold' | 'crash'
  | 'item' | 'sauce' | 'slip' | 'coin' | 'note' | 'bundle' | 'card' | 'caught'
  | 'squirt' | 'pop' | 'clink' | 'power' | 'hurt' | 'rip' | 'whoosh' | 'thud' | 'boom'
  | 'beep' | 'go' | 'engine' | 'smash'
  | 'level' | 'over' | 'winner'
export const SOUND_NAMES: readonly SoundName[] = ['bite', 'fries', 'shake', 'donut', 'gold', 'crash', 'item', 'sauce', 'slip', 'coin', 'note', 'bundle', 'card', 'caught', 'squirt', 'pop', 'clink', 'power', 'hurt', 'rip', 'whoosh', 'thud', 'boom', 'beep', 'go', 'engine', 'smash', 'level', 'over', 'winner']

/** A diner's shuffle for EATER, a convenience store's bossa for CATCHER, a fifties film from space for ATTACKS, a drive down the coast at sunset for RACING. */
export type TuneName = 'diner' | 'store' | 'mars' | 'coast'
export const TUNE_NAMES: readonly TuneName[] = ['diner', 'store', 'mars', 'coast']

/** How loud, at the top: the tunes low, the sounds light, the jingles a little more. */
const TUNE_PEAK = 0.2
const SOUND_PEAK = 0.3
const JINGLE_PEAK = 0.36

type Wave = 'pulse' | 'triangle' | 'sine' | 'noise'
type Tone = {
  at: number
  /** How long it holds, before its release. */
  dur: number
  freq: number
  /** Where the pitch glides to by the end of `dur`. */
  to?: number
  wave: Wave
  /** A pulse's width: 0.5 square, 0.25 reedy, 0.125 thin. */
  duty?: number
  gain: number
  attack?: number
  release?: number
  /** Dies away on its own: the time it takes to fall to about a third. */
  decay?: number
  /** Wavering pitch, in semitones, once the note has settled. */
  vibrato?: { rate: number; depth: number; after?: number }
  /** Wavering loudness, as a vibraphone does. */
  tremolo?: { rate: number; depth: number }
  /** A second partial above the first, times the frequency, for bells. */
  partial?: { ratio: number; gain: number; decay: number }
  /** Softer: the noise or the wave through a low-pass at this frequency. */
  lowpass?: number
  /** Thinner: only what is above this frequency. */
  highpass?: number
  /** Noise only: its seed, so two hits sound alike. */
  seed?: number
}

/** A small seeded generator (xorshift32), from -1 to 1. */
function noiseSource(seed: number): () => number {
  let x = (seed >>> 0) || 0x9e3779b9
  return () => {
    x ^= x << 13; x >>>= 0
    x ^= x >>> 17
    x ^= x << 5; x >>>= 0
    return (x / 0xffffffff) * 2 - 1
  }
}

/** The smoothing that keeps a pulse's edges from ringing in the high end (polyBLEP). */
function blep(t: number, dt: number): number {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1 }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1 }
  return 0
}

function oscillator(wave: Exclude<Wave, 'noise'>, phase: number, dt: number, duty: number): number {
  const t = phase - Math.floor(phase)
  if (wave === 'sine') return Math.sin(2 * Math.PI * t)
  if (wave === 'triangle') return 4 * Math.abs(t - 0.5) - 1
  let v = t < duty ? 1 : -1
  v += blep(t, dt)
  let fall = t - duty
  if (fall < 0) fall += 1
  return v - blep(fall, dt)
}

/**
 * Samples that sounds are added into. A tune's mix first only writes its notes
 * down (`record`), so they can be rendered a few at a time without holding up
 * the game's frames.
 */
class Mix {
  readonly data: Float32Array
  readonly notes: Tone[] | null
  constructor(seconds: number, record = false) {
    this.data = new Float32Array(Math.ceil(seconds * SOUND_RATE))
    this.notes = record ? [] : null
  }

  tone(t: Tone): void {
    if (this.notes) this.notes.push(t)
    else this.render(t)
  }

  render(t: Tone): void {
    const attack = Math.max(1, (t.attack ?? 0.004) * SOUND_RATE)
    const release = Math.max(1, (t.release ?? 0.012) * SOUND_RATE)
    const hold = t.dur * SOUND_RATE
    const start = Math.round(t.at * SOUND_RATE)
    const count = Math.min(Math.round(hold + release), this.data.length - start)
    const noise = t.wave === 'noise' ? noiseSource(t.seed ?? 1) : null
    const lp = t.lowpass ? 1 - Math.exp((-2 * Math.PI * t.lowpass) / SOUND_RATE) : 0
    const hp = t.highpass ? 1 - Math.exp((-2 * Math.PI * t.highpass) / SOUND_RATE) : 0
    // what changes smoothly changes by a fixed factor each sample: the glide, the decays
    const glide = t.to ? Math.pow(t.to / t.freq, 1 / Math.max(1, hold)) : 1
    const fall = t.decay ? Math.exp(-1 / (t.decay * SOUND_RATE)) : 1
    const partialFall = t.partial ? Math.exp(-1 / (t.partial.decay * SOUND_RATE)) : 1
    const vibratoFrom = (t.vibrato?.after ?? 0) * SOUND_RATE
    const wave = t.wave === 'noise' ? 'sine' : t.wave
    const duty = t.duty ?? 0.5
    let base = t.freq, decay = 1, partial = t.partial?.gain ?? 0
    let phase = 0, phase2 = 0, low = 0, high = 0, held = 0, wait = 0
    for (let i = Math.max(0, -start); i < count; i += 1) {
      let freq = base
      if (i < hold) base *= glide
      if (t.vibrato && i > vibratoFrom) freq *= Math.pow(2, (t.vibrato.depth * Math.sin((2 * Math.PI * t.vibrato.rate * i) / SOUND_RATE)) / 12)
      const dt = freq / SOUND_RATE
      let v: number
      if (noise) {
        // noise held for a period set by the frequency: high is a hiss, low a rumble
        wait -= 1
        if (wait <= 0) { held = noise(); wait = Math.max(1, Math.round(SOUND_RATE / Math.max(freq, 1))) }
        v = held
      } else {
        v = oscillator(wave, phase, dt, duty)
        phase += dt
        if (t.partial) {
          v += partial * Math.sin(2 * Math.PI * phase2)
          phase2 += dt * t.partial.ratio
          partial *= partialFall
        }
      }
      if (lp) { low += lp * (v - low); v = low }
      if (hp) { high += hp * (v - high); v -= high }
      let env = (i < attack ? i / attack : 1) * decay
      decay *= fall
      if (i > hold) env *= Math.max(0, 1 - (i - hold) / release)
      if (t.tremolo) env *= 1 - t.tremolo.depth * (0.5 + 0.5 * Math.sin((2 * Math.PI * t.tremolo.rate * i) / SOUND_RATE))
      this.data[start + i] += v * env * t.gain
    }
  }

  /** Brought to a set peak, the start and end eased so nothing clicks. */
  finish(peak: number): Float32Array {
    return settle(this.data, peak, Math.round(0.004 * SOUND_RATE))
  }
}

/** Samples brought to a set peak; `edge` samples eased in and out at the ends. */
function settle(data: Float32Array, peak: number, edge: number): Float32Array {
  let top = 0
  for (const v of data) top = Math.max(top, Math.abs(v))
  const k = top > 0 ? peak / top : 0
  const n = data.length
  for (let i = 0; i < n; i += 1) {
    let v = data[i] * k
    if (edge && i < edge) v *= i / edge
    if (edge && i > n - edge) v *= (n - i) / edge
    data[i] = v
  }
  return data
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** A note's frequency from its name: 'A4' is 440, 'Bb3', 'F#5'. */
export function hz(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!m) throw new Error(`Not a note: ${name}`)
  const semis = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  const midi = 12 * (Number(m[3]) + 1) + semis
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// ——— the sounds ———

type Build = (m: Mix) => void
const SOUNDS: Record<SoundName, { seconds: number; peak: number; build: Build }> = {
  // EATER: a burger, bitten and swallowed
  bite: { seconds: 0.16, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.03, freq: 9000, wave: 'noise', gain: 0.5, decay: 0.012, highpass: 1500, seed: 11 })
    m.tone({ at: 0.018, dur: 0.075, freq: 520, to: 170, wave: 'pulse', duty: 0.5, gain: 0.45, decay: 0.05 })
  } },
  // fries: three crunches
  fries: { seconds: 0.2, peak: SOUND_PEAK, build: (m) => {
    for (const [k, at] of [0, 0.05, 0.1].entries()) m.tone({ at, dur: 0.02, freq: 11000, wave: 'noise', gain: 0.6, decay: 0.008, highpass: 2500, seed: 21 + k })
    m.tone({ at: 0.12, dur: 0.04, freq: 880, to: 1320, wave: 'pulse', duty: 0.25, gain: 0.25, decay: 0.03 })
  } },
  // a milkshake through a straw
  shake: { seconds: 0.4, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.28, freq: 240, to: 720, wave: 'pulse', duty: 0.125, gain: 0.35, vibrato: { rate: 22, depth: 1.2 }, attack: 0.02 })
    m.tone({ at: 0, dur: 0.28, freq: 3000, wave: 'noise', gain: 0.12, lowpass: 1800, seed: 31, attack: 0.02 })
    m.tone({ at: 0.3, dur: 0.03, freq: 1100, to: 700, wave: 'sine', gain: 0.35, decay: 0.02 })
  } },
  // a donut: pop
  donut: { seconds: 0.16, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.045, freq: 1200, to: 380, wave: 'sine', gain: 0.6, decay: 0.03 })
    m.tone({ at: 0.05, dur: 0.05, freq: 760, wave: 'pulse', duty: 0.25, gain: 0.25, decay: 0.03 })
  } },
  // the gold burger: a little fanfare that shines
  gold: { seconds: 0.62, peak: JINGLE_PEAK, build: (m) => {
    const notes = ['C6', 'E6', 'G6', 'C7']
    notes.forEach((n, i) => m.tone({ at: i * 0.055, dur: i === 3 ? 0.22 : 0.05, freq: hz(n), wave: 'pulse', duty: 0.25, gain: 0.3, vibrato: i === 3 ? { rate: 9, depth: 0.25, after: 0.05 } : undefined }))
    notes.forEach((n, i) => m.tone({ at: 0.03 + i * 0.055, dur: 0.04, freq: hz(n) * 2, wave: 'triangle', gain: 0.1, decay: 0.05 }))
  } },
  // EATER runs into the furniture, or into himself
  crash: { seconds: 0.5, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.14, freq: 4000, wave: 'noise', gain: 0.5, decay: 0.07, lowpass: 3000, seed: 41 })
    m.tone({ at: 0, dur: 0.34, freq: 220, to: 55, wave: 'pulse', duty: 0.5, gain: 0.45, decay: 0.18 })
  } },
  // CATCHER: an ingredient off the list, gulped down
  item: { seconds: 0.18, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.07, freq: 460, to: 160, wave: 'pulse', duty: 0.5, gain: 0.45, decay: 0.06 })
    m.tone({ at: 0.085, dur: 0.035, freq: 230, to: 320, wave: 'pulse', duty: 0.5, gain: 0.3, decay: 0.03 })
  } },
  // the sauce bottle: splotch
  sauce: { seconds: 0.34, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.22, freq: 2500, wave: 'noise', gain: 0.5, decay: 0.07, lowpass: 900, seed: 51 })
    m.tone({ at: 0, dur: 0.16, freq: 190, to: 60, wave: 'sine', gain: 0.6, decay: 0.08 })
  } },
  // a shopper slips on the sauce: up, and down
  slip: { seconds: 0.36, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.11, freq: 320, to: 960, wave: 'triangle', gain: 0.5 })
    m.tone({ at: 0.11, dur: 0.2, freq: 960, to: 180, wave: 'triangle', gain: 0.5, decay: 0.15 })
  } },
  // a coin: a small bell
  coin: { seconds: 0.4, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.004, freq: 9000, wave: 'noise', gain: 0.2, seed: 61 })
    m.tone({ at: 0, dur: 0.3, freq: hz('G6'), wave: 'sine', gain: 0.5, decay: 0.12, partial: { ratio: 2.76, gain: 0.35, decay: 0.05 } })
  } },
  // a bank note: a rustle, then two bells
  note: { seconds: 0.5, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.07, freq: 8000, wave: 'noise', gain: 0.3, attack: 0.05, highpass: 3000, seed: 71 })
    m.tone({ at: 0.08, dur: 0.12, freq: hz('E6'), wave: 'sine', gain: 0.45, decay: 0.07, partial: { ratio: 2.76, gain: 0.3, decay: 0.04 } })
    m.tone({ at: 0.15, dur: 0.25, freq: hz('B6'), wave: 'sine', gain: 0.45, decay: 0.11, partial: { ratio: 2.76, gain: 0.3, decay: 0.05 } })
  } },
  // a bundle of notes: the till opens
  bundle: { seconds: 0.75, peak: JINGLE_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.035, freq: 6000, wave: 'noise', gain: 0.5, decay: 0.02, seed: 81 })
    m.tone({ at: 0.03, dur: 0.05, freq: 2000, wave: 'noise', gain: 0.25, decay: 0.03, lowpass: 2500, seed: 82 })
    for (const n of ['E6', 'G#6', 'B6']) m.tone({ at: 0.07, dur: 0.5, freq: hz(n), wave: 'sine', gain: 0.3, decay: 0.2, partial: { ratio: 2.76, gain: 0.25, decay: 0.06 } })
    m.tone({ at: 0.22, dur: 0.3, freq: hz('E7'), wave: 'sine', gain: 0.2, decay: 0.12 })
  } },
  // the card: the terminal's two beeps
  card: { seconds: 0.26, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.07, freq: 1900, wave: 'sine', gain: 0.5 })
    m.tone({ at: 0.13, dur: 0.07, freq: 1900, wave: 'sine', gain: 0.5 })
  } },
  // a shopper catches the burger: bonk
  caught: { seconds: 0.42, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.05, freq: 3000, wave: 'noise', gain: 0.4, decay: 0.03, lowpass: 1500, seed: 91 })
    m.tone({ at: 0, dur: 0.3, freq: 330, to: 110, wave: 'pulse', duty: 0.5, gain: 0.45, decay: 0.16 })
  } },
  // ATTACKS: the cook's squirt of ketchup, short and wet, light since it comes often
  squirt: { seconds: 0.1, peak: SOUND_PEAK * 0.6, build: (m) => {
    m.tone({ at: 0, dur: 0.05, freq: 3000, wave: 'noise', gain: 0.5, decay: 0.025, lowpass: 1400, seed: 111 })
    m.tone({ at: 0, dur: 0.05, freq: 640, to: 300, wave: 'sine', gain: 0.35, decay: 0.03 })
  } },
  // a burger shot down: a juicy pop
  pop: { seconds: 0.24, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.06, freq: 5000, wave: 'noise', gain: 0.45, decay: 0.03, lowpass: 2600, seed: 121 })
    m.tone({ at: 0, dur: 0.16, freq: 420, to: 90, wave: 'pulse', duty: 0.25, gain: 0.45, decay: 0.08 })
  } },
  // a plate chipped: china
  clink: { seconds: 0.22, peak: SOUND_PEAK * 0.7, build: (m) => {
    m.tone({ at: 0, dur: 0.006, freq: 9000, wave: 'noise', gain: 0.3, seed: 131 })
    m.tone({ at: 0, dur: 0.16, freq: hz('D7'), wave: 'sine', gain: 0.4, decay: 0.05, partial: { ratio: 2.4, gain: 0.3, decay: 0.03 } })
  } },
  // a bonus caught: up the arpeggio, quickly
  power: { seconds: 0.42, peak: JINGLE_PEAK, build: (m) => {
    ;['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => m.tone({ at: i * 0.045, dur: i === 4 ? 0.16 : 0.04, freq: hz(n), wave: 'pulse', duty: 0.125, gain: 0.3 }))
    m.tone({ at: 0.18, dur: 0.16, freq: 6000, wave: 'noise', gain: 0.08, decay: 0.08, highpass: 3000, seed: 141 })
  } },
  // the cook hit: a buzz going down
  hurt: { seconds: 0.4, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.3, freq: 440, to: 110, wave: 'pulse', duty: 0.5, gain: 0.4, vibrato: { rate: 28, depth: 0.8 }, decay: 0.2 })
    m.tone({ at: 0, dur: 0.08, freq: 4000, wave: 'noise', gain: 0.3, decay: 0.04, lowpass: 2500, seed: 151 })
  } },
  // foil torn off a burger: a crinkle
  rip: { seconds: 0.16, peak: SOUND_PEAK * 0.8, build: (m) => {
    m.tone({ at: 0, dur: 0.1, freq: 9000, wave: 'noise', gain: 0.5, decay: 0.04, highpass: 3500, seed: 161 })
    m.tone({ at: 0.03, dur: 0.06, freq: 7000, wave: 'noise', gain: 0.35, decay: 0.025, highpass: 4500, seed: 162 })
    m.tone({ at: 0, dur: 0.05, freq: 1800, to: 2400, wave: 'pulse', duty: 0.125, gain: 0.15, decay: 0.03 })
  } },
  // divers leaving the formation: a swoop down
  whoosh: { seconds: 0.5, peak: SOUND_PEAK * 0.8, build: (m) => {
    m.tone({ at: 0, dur: 0.42, freq: 1400, to: 380, wave: 'triangle', gain: 0.35, attack: 0.03, release: 0.06 })
    m.tone({ at: 0, dur: 0.4, freq: 3000, wave: 'noise', gain: 0.2, attack: 0.08, decay: 0.2, lowpass: 2200, seed: 171 })
  } },
  // a squirt on a boss: a soft thud
  thud: { seconds: 0.14, peak: SOUND_PEAK * 0.75, build: (m) => {
    m.tone({ at: 0, dur: 0.09, freq: 180, to: 70, wave: 'sine', gain: 0.6, decay: 0.05 })
    m.tone({ at: 0, dur: 0.03, freq: 2500, wave: 'noise', gain: 0.3, decay: 0.015, lowpass: 1600, seed: 181 })
  } },
  // a boss blown up: a long rumbling blast
  boom: { seconds: 1.2, peak: JINGLE_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 1, freq: 3000, wave: 'noise', gain: 0.6, decay: 0.35, lowpass: 900, seed: 191 })
    m.tone({ at: 0, dur: 0.7, freq: 110, to: 32, wave: 'pulse', duty: 0.5, gain: 0.5, decay: 0.3 })
    m.tone({ at: 0.18, dur: 0.5, freq: 2000, wave: 'noise', gain: 0.35, decay: 0.2, lowpass: 600, seed: 192 })
  } },
  // RACING: a crash at speed: the crunch, the thump, the tyres screaming as the car spins
  smash: { seconds: 0.9, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.18, freq: 4000, wave: 'noise', gain: 0.55, decay: 0.08, lowpass: 2600, seed: 211 })
    m.tone({ at: 0, dur: 0.26, freq: 140, to: 48, wave: 'pulse', duty: 0.5, gain: 0.45, decay: 0.12 })
    m.tone({ at: 0.08, dur: 0.66, freq: 1180, to: 820, wave: 'pulse', duty: 0.25, gain: 0.16, attack: 0.04, release: 0.12, vibrato: { rate: 23, depth: 0.7 } })
    m.tone({ at: 0.08, dur: 0.66, freq: 6000, wave: 'noise', gain: 0.12, attack: 0.05, decay: 0.4, highpass: 2500, seed: 212 })
  } },
  // RACING: a red light of the start, and the last seconds on the clock: a short square beep
  beep: { seconds: 0.22, peak: SOUND_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.15, freq: hz('A5'), wave: 'pulse', duty: 0.5, gain: 0.4, release: 0.02 })
    m.tone({ at: 0, dur: 0.15, freq: hz('A4'), wave: 'triangle', gain: 0.25, release: 0.02 })
  } },
  // the green light: the same beep an octave up, held
  go: { seconds: 0.62, peak: JINGLE_PEAK, build: (m) => {
    m.tone({ at: 0, dur: 0.48, freq: hz('A6'), wave: 'pulse', duty: 0.5, gain: 0.38, release: 0.08 })
    m.tone({ at: 0, dur: 0.48, freq: hz('A5'), wave: 'triangle', gain: 0.3, release: 0.08 })
  } },
  // RACING's engine: a buzzing growl to be looped and played faster as the car goes — half a second of a 60 Hz pulse, its octave and a low rumble,
  // whole periods of each so the loop has no seam (rendered a second long, the second half kept, once the filters have settled)
  engine: { seconds: 1, peak: SOUND_PEAK * 0.42, build: (m) => {
    m.tone({ at: 0, dur: 1, freq: 60, wave: 'pulse', duty: 0.3, gain: 0.4, attack: 0, release: 0, lowpass: 1100 })
    m.tone({ at: 0, dur: 1, freq: 120, wave: 'pulse', duty: 0.5, gain: 0.18, attack: 0, release: 0, lowpass: 900 })
    m.tone({ at: 0, dur: 1, freq: 30, wave: 'triangle', gain: 0.35, attack: 0, release: 0 })
  } },
  // a level won: up the chord
  level: { seconds: 0.75, peak: JINGLE_PEAK, build: (m) => {
    const up = ['C5', 'E5', 'G5', 'C6']
    up.forEach((n, i) => m.tone({ at: i * 0.075, dur: i === 3 ? 0.3 : 0.06, freq: hz(n), wave: 'pulse', duty: 0.25, gain: 0.35, vibrato: i === 3 ? { rate: 7, depth: 0.2, after: 0.08 } : undefined }))
    m.tone({ at: 0.225, dur: 0.32, freq: hz('E5'), wave: 'pulse', duty: 0.125, gain: 0.15 })
    m.tone({ at: 0, dur: 0.2, freq: hz('C3'), wave: 'triangle', gain: 0.4 })
    m.tone({ at: 0.225, dur: 0.32, freq: hz('G3'), wave: 'triangle', gain: 0.4 })
  } },
  // GAME OVER: down, slowly
  over: { seconds: 1.3, peak: JINGLE_PEAK, build: (m) => {
    const down = ['G4', 'Eb4', 'C4']
    down.forEach((n, i) => m.tone({ at: i * 0.2, dur: 0.16, freq: hz(n), wave: 'pulse', duty: 0.25, gain: 0.35 }))
    m.tone({ at: 0.6, dur: 0.5, freq: hz('B3'), to: hz('A3'), wave: 'pulse', duty: 0.25, gain: 0.35, vibrato: { rate: 5, depth: 0.3, after: 0.1 }, release: 0.15 })
    const bass = ['C3', 'Ab2', 'F2', 'G2']
    bass.forEach((n, i) => m.tone({ at: i * 0.2, dur: i === 3 ? 0.5 : 0.18, freq: hz(n), wave: 'triangle', gain: 0.4, release: 0.1 }))
  } },
  // WINNER: the fanfare
  winner: { seconds: 1.9, peak: JINGLE_PEAK, build: (m) => {
    const lead: Array<[string, number, number]> = [['C5', 0, 0.08], ['E5', 0.1, 0.08], ['G5', 0.2, 0.08], ['C6', 0.3, 0.32], ['A5', 0.68, 0.08], ['B5', 0.78, 0.08], ['C6', 0.88, 0.08], ['D6', 0.98, 0.08], ['E6', 1.08, 0.55]]
    for (const [n, at, dur] of lead) m.tone({ at, dur, freq: hz(n), wave: 'pulse', duty: 0.25, gain: 0.32, vibrato: dur > 0.3 ? { rate: 7, depth: 0.2, after: 0.1 } : undefined })
    const third: Array<[string, number, number]> = [['E5', 0.3, 0.32], ['F5', 0.68, 0.08], ['G5', 0.78, 0.08], ['A5', 0.88, 0.08], ['B5', 0.98, 0.08], ['C6', 1.08, 0.55]]
    for (const [n, at, dur] of third) m.tone({ at, dur, freq: hz(n), wave: 'pulse', duty: 0.125, gain: 0.16 })
    for (const [n, at, dur] of [['C3', 0, 0.28], ['G3', 0.3, 0.32], ['F3', 0.68, 0.36], ['C3', 1.08, 0.55]] as Array<[string, number, number]>) m.tone({ at, dur, freq: hz(n), wave: 'triangle', gain: 0.4 })
    for (const at of [0.3, 1.08]) m.tone({ at, dur: 0.12, freq: 7000, wave: 'noise', gain: 0.12, decay: 0.08, highpass: 2000, seed: 101 })
  } },
}

/** One of the games' sounds, as samples. */
export function renderSound(name: SoundName): Float32Array {
  const spec = SOUNDS[name]
  const mix = new Mix(spec.seconds)
  spec.build(mix)
  const out = mix.finish(spec.peak)
  // the engine's loop: its second half, steady
  return name === 'engine' ? out.slice(out.length / 2) : out
}

// ——— the tunes ———

/**
 * A tune in eighth notes, eight to a bar. A line of a part is one bar: a note
 * name starts a note, '-' holds it, '.' is a rest. `swing` is where the second
 * eighth of a beat falls: 0.5 straight, two thirds a full shuffle.
 */
type Tune = { bpm: number; swing: number; bars: number; build: (t: TuneWriter) => void }

class TuneWriter {
  constructor(readonly mix: Mix, readonly bpm: number, readonly swing: number) {}
  get beat(): number { return 60 / this.bpm }
  /** When an eighth begins, counted from the start of the tune. */
  at(eighth: number): number {
    const beat = Math.floor(eighth / 2)
    return beat * this.beat + (eighth % 2) * this.beat * this.swing
  }
  /** Plays a part, a bar per line, each note shaped by `voice`. */
  part(bars: string[], voice: (freq: number, at: number, dur: number) => void, gate = 0.9): void {
    bars.forEach((line, bar) => {
      const slots = line.trim().split(/\s+/)
      if (slots.length !== 8) throw new Error(`A bar is eight eighths: ${line}`)
      slots.forEach((slot, i) => {
        if (slot === '-' || slot === '.') return
        let length = 1
        while (i + length < 8 && slots[i + length] === '-') length += 1
        const start = bar * 8 + i
        voice(hz(slot), this.at(start), (this.at(start + length) - this.at(start)) * gate)
      })
    })
  }
  /** Something on given eighths of every bar. */
  each(bars: number, eighths: (bar: number) => number[], hit: (at: number, bar: number, eighth: number) => void): void {
    for (let bar = 0; bar < bars; bar += 1) for (const e of eighths(bar)) hit(this.at(bar * 8 + e), bar, e)
  }
}

const TUNES: Record<TuneName, Tune> = {
  // EATER: a fifties diner, a shuffle over C, A minor, F, G
  diner: { bpm: 150, swing: 0.64, bars: 8, build: (t) => {
    const lead = ['E5 - G5 - A5 G5 E5 -', 'C5 - E5 - D5 C5 A4 -', 'A4 - C5 - F5 - E5 D5', 'D5 - B4 - G4 - . .', 'E5 - G5 - C6 - B5 A5', 'A5 - G5 - E5 - C5 -', 'D5 - F5 - A5 - G5 F5', 'D5 - F5 - D5 - B4 -']
    t.part(lead, (freq, at, dur) => t.mix.tone({ at, dur, freq, wave: 'pulse', duty: 0.25, gain: 0.13, vibrato: { rate: 5.5, depth: 0.15, after: 0.15 }, release: 0.03 }), 0.92)
    // the walking bass, a quarter each: a triangle with a little pulse so a phone's speaker finds it
    const bass = ['C3 - E3 - G3 - A3 -', 'A2 - C3 - E3 - G3 -', 'F2 - A2 - C3 - D3 -', 'G2 - B2 - D3 - F3 -', 'C3 - E3 - G3 - A3 -', 'A2 - C3 - E3 - G3 -', 'F2 - A2 - C3 - D3 -', 'G2 - B2 - D3 - B2 -']
    t.part(bass, (freq, at, dur) => {
      t.mix.tone({ at, dur, freq, wave: 'triangle', gain: 0.32, decay: 0.5 })
      t.mix.tone({ at, dur, freq, wave: 'pulse', duty: 0.5, gain: 0.05, decay: 0.2, lowpass: 900 })
    }, 0.8)
    // the juke-box piano on the off-beats
    const chords = [['E4', 'G4', 'C5'], ['E4', 'A4', 'C5'], ['F4', 'A4', 'C5'], ['D4', 'G4', 'B4'], ['E4', 'G4', 'C5'], ['E4', 'A4', 'C5'], ['F4', 'A4', 'C5'], ['D4', 'F4', 'B4']]
    t.each(8, () => [1, 3, 5, 7], (at, bar) => { for (const n of chords[bar]) t.mix.tone({ at, dur: 0.07, freq: hz(n), wave: 'pulse', duty: 0.125, gain: 0.045, decay: 0.08 }) })
    // drums: kick on one and three, snare on two and four, a hat on every eighth
    t.each(8, () => [0, 4], (at) => t.mix.tone({ at, dur: 0.12, freq: 150, to: 45, wave: 'sine', gain: 0.4, decay: 0.07 }))
    t.each(8, () => [2, 6], (at) => {
      t.mix.tone({ at, dur: 0.1, freq: 11000, wave: 'noise', gain: 0.16, decay: 0.05, lowpass: 5000, seed: 7 })
      t.mix.tone({ at, dur: 0.05, freq: 190, wave: 'triangle', gain: 0.18, decay: 0.04 })
    })
    t.each(8, () => [0, 1, 2, 3, 4, 5, 6, 7], (at, _bar, e) => t.mix.tone({ at, dur: 0.012, freq: 11000, wave: 'noise', gain: e % 2 ? 0.05 : 0.035, decay: 0.012, highpass: 6000, seed: 3 }))
  } },
  // CATCHER: the store's music, a soft bossa over F major 7, D minor 7, G minor 7, C7
  store: { bpm: 120, swing: 0.5, bars: 8, build: (t) => {
    const lead = ['A4 - C5 - E5 - - -', 'D5 - C5 - A4 - F4 -', 'G4 - Bb4 - D5 - F5 -', 'E5 - - D5 C5 - . .', 'A4 - C5 - E5 - G5 -', 'F5 - E5 - D5 - A4 -', 'Bb4 - D5 - C5 - Bb4 -', 'G4 - - - E4 - . .']
    // a vibraphone: a sine with a bell's partial, dying away, wavering
    t.part(lead, (freq, at, dur) => t.mix.tone({ at, dur: dur + 0.35, freq, wave: 'sine', gain: 0.2, decay: 0.55, tremolo: { rate: 5, depth: 0.25 }, partial: { ratio: 4, gain: 0.2, decay: 0.08 }, release: 0.05 }), 1)
    // the bass: root, fifth, fifth, root, the bossa's way
    const roots = ['F2', 'D3', 'G2', 'C3', 'F2', 'D3', 'G2', 'C3']
    const fifths = ['C3', 'A2', 'D3', 'G2', 'C3', 'A2', 'D3', 'G2']
    const bass = roots.map((r, i) => `${r} - - ${fifths[i]} ${fifths[i]} - - ${r}`)
    t.part(bass, (freq, at, dur) => {
      t.mix.tone({ at, dur, freq, wave: 'triangle', gain: 0.3, decay: 0.35 })
      t.mix.tone({ at, dur, freq, wave: 'pulse', duty: 0.5, gain: 0.04, decay: 0.15, lowpass: 800 })
    }, 0.85)
    // soft chords on the three-three-two
    const chords = [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['F3', 'Bb3', 'D4'], ['E3', 'G3', 'Bb3'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['F3', 'Bb3', 'D4'], ['E3', 'G3', 'Bb3']]
    t.each(8, () => [0, 3, 6], (at, bar) => { for (const n of chords[bar]) t.mix.tone({ at, dur: 0.16, freq: hz(n), wave: 'triangle', gain: 0.06, decay: 0.2 }) })
    // a rim on the clave, a shaker on every eighth, a soft kick
    t.each(8, (bar) => (bar % 2 ? [2, 4] : [0, 3, 6]), (at) => t.mix.tone({ at, dur: 0.012, freq: 1700, wave: 'pulse', duty: 0.5, gain: 0.08, decay: 0.01 }))
    t.each(8, () => [0, 1, 2, 3, 4, 5, 6, 7], (at, _bar, e) => t.mix.tone({ at, dur: 0.03, freq: 11000, wave: 'noise', gain: e % 2 ? 0.035 : 0.02, attack: 0.012, decay: 0.02, highpass: 5000, seed: 5 }))
    t.each(8, () => [0, 4], (at) => t.mix.tone({ at, dur: 0.1, freq: 120, to: 50, wave: 'sine', gain: 0.25, decay: 0.06 }))
  } },
  // RACING: a drive down the coast at sunset — a bright lead over F sharp minor, D, A and E, a bass in driving octaves, a steady beat
  coast: { bpm: 138, swing: 0.5, bars: 8, build: (t) => {
    const lead = ['C#5 - E5 - F#5 - A5 -', 'A5 - F#5 - E5 - D5 -', 'E5 - C#5 - E5 - A5 -', 'G#5 - - - B4 - . .', 'C#5 - E5 - F#5 - C#6 -', 'B5 - A5 - F#5 - D5 -', 'C#5 - E5 - A5 - B5 -', 'G#5 - E5 - B4 - . .']
    t.part(lead, (freq, at, dur) => t.mix.tone({ at, dur, freq, wave: 'pulse', duty: 0.25, gain: 0.12, vibrato: { rate: 6, depth: 0.12, after: 0.12 }, release: 0.03 }), 0.9)
    // a thin echo of the lead an eighth late, as the old consoles faked one
    t.part(lead.map((line) => { const s = line.split(' '); return ['.', ...s.slice(0, 7)].join(' ') }), (freq, at, dur) => t.mix.tone({ at, dur, freq, wave: 'pulse', duty: 0.125, gain: 0.04, release: 0.03 }), 0.9)
    const roots = ['F#2', 'D2', 'A2', 'E2', 'F#2', 'D2', 'A2', 'E2']
    const up = (n: string) => n.replace(/\d/, (d) => String(Number(d) + 1))
    t.part(roots.map((r) => Array.from({ length: 8 }, (_, i) => (i % 2 ? up(r) : r)).join(' ')), (freq, at, dur) => {
      t.mix.tone({ at, dur, freq, wave: 'triangle', gain: 0.28, decay: 0.2 })
      t.mix.tone({ at, dur, freq, wave: 'pulse', duty: 0.5, gain: 0.04, decay: 0.1, lowpass: 900 })
    }, 0.7)
    const chords = [['F#4', 'A4', 'C#5'], ['F#4', 'A4', 'D5'], ['E4', 'A4', 'C#5'], ['E4', 'G#4', 'B4'], ['F#4', 'A4', 'C#5'], ['F#4', 'A4', 'D5'], ['E4', 'A4', 'C#5'], ['E4', 'G#4', 'B4']]
    t.each(8, () => [1, 3, 5, 7], (at, bar) => { for (const n of chords[bar]) t.mix.tone({ at, dur: 0.08, freq: hz(n), wave: 'pulse', duty: 0.125, gain: 0.035, decay: 0.09 }) })
    t.each(8, () => [0, 3, 4], (at) => t.mix.tone({ at, dur: 0.12, freq: 150, to: 45, wave: 'sine', gain: 0.38, decay: 0.07 }))
    t.each(8, () => [2, 6], (at) => {
      t.mix.tone({ at, dur: 0.1, freq: 11000, wave: 'noise', gain: 0.15, decay: 0.05, lowpass: 5000, seed: 13 })
      t.mix.tone({ at, dur: 0.05, freq: 200, wave: 'triangle', gain: 0.16, decay: 0.04 })
    })
    t.each(8, () => [0, 1, 2, 3, 4, 5, 6, 7], (at, _bar, e) => t.mix.tone({ at, dur: 0.012, freq: 11000, wave: 'noise', gain: e % 2 ? 0.05 : 0.03, decay: 0.012, highpass: 6000, seed: 17 }))
  } },
  // ATTACKS: a fifties film from space — a theremin over A minor, F, C and E, a walking bass, brushes
  mars: { bpm: 132, swing: 0.6, bars: 8, build: (t) => {
    const lead = ['A4 - - C5 E5 - D5 -', 'C5 - A4 - - - . .', 'F4 - A4 - C5 - B4 A4', 'G#4 - - - E4 - . .', 'A4 - C5 - E5 - A5 -', 'G5 - E5 - C5 - D5 -', 'B4 - G#4 - E4 - F4 G#4', 'A4 - - - - - . .']
    // the theremin: a sine that wavers wide and slides into its notes
    t.part(lead, (freq, at, dur) => t.mix.tone({ at, dur, freq: freq * 0.985, to: freq, wave: 'sine', gain: 0.24, attack: 0.04, vibrato: { rate: 6, depth: 0.35, after: 0.06 }, release: 0.08 }), 0.98)
    const bass = ['A2 - E3 - A2 - C3 -', 'A2 - E3 - A2 - G2 -', 'F2 - C3 - F2 - A2 -', 'E2 - B2 - E2 - G#2 -', 'A2 - E3 - A2 - C3 -', 'C3 - G3 - C3 - E3 -', 'E2 - B2 - D3 - G#2 -', 'A2 - E3 - A2 - E2 -']
    t.part(bass, (freq, at, dur) => {
      t.mix.tone({ at, dur, freq, wave: 'triangle', gain: 0.3, decay: 0.45 })
      t.mix.tone({ at, dur, freq, wave: 'pulse', duty: 0.5, gain: 0.045, decay: 0.2, lowpass: 900 })
    }, 0.8)
    // sparks from the stars on the off-beats: a thin pulse up the chord
    const sparks = [['A5', 'C6', 'E6'], ['A5', 'C6', 'E6'], ['F5', 'A5', 'C6'], ['E5', 'G#5', 'B5'], ['A5', 'C6', 'E6'], ['C6', 'E6', 'G6'], ['E5', 'G#5', 'D6'], ['A5', 'C6', 'E6']]
    t.each(8, () => [1, 3, 5, 7], (at, bar, e) => t.mix.tone({ at, dur: 0.05, freq: hz(sparks[bar][((e - 1) / 2) % 3]), wave: 'pulse', duty: 0.125, gain: 0.035, decay: 0.06 }))
    // brushes and a soft kick
    t.each(8, () => [0, 4], (at) => t.mix.tone({ at, dur: 0.12, freq: 130, to: 45, wave: 'sine', gain: 0.3, decay: 0.07 }))
    t.each(8, () => [2, 6], (at) => t.mix.tone({ at, dur: 0.14, freq: 9000, wave: 'noise', gain: 0.1, attack: 0.02, decay: 0.07, lowpass: 4500, seed: 9 }))
    t.each(8, () => [0, 1, 2, 3, 4, 5, 6, 7], (at, _bar, e) => t.mix.tone({ at, dur: 0.02, freq: 11000, wave: 'noise', gain: e % 2 ? 0.03 : 0.02, decay: 0.015, highpass: 6000, seed: 4 }))
  } },
}

/** How long a tune lasts before it starts again. */
export function tuneSeconds(name: TuneName): number {
  const tune = TUNES[name]
  return (tune.bars * 4 * 60) / tune.bpm
}

/** A tune's notes written down, and the mix they go into. */
function writeTune(name: TuneName): { mix: Mix; notes: Tone[]; length: number } {
  const tune = TUNES[name]
  const seconds = tuneSeconds(name)
  // what rings past the end is kept a moment, to be laid over the start
  const mix = new Mix(seconds + 1.5, true)
  tune.build(new TuneWriter(mix, tune.bpm, tune.swing))
  return { mix, notes: mix.notes ?? [], length: Math.round(seconds * SOUND_RATE) }
}

/** The tail laid over the start, so the loop has no seam; brought to the tunes' level. */
function closeLoop(mix: Mix, length: number): Float32Array {
  const loop = mix.data.slice(0, length)
  for (let i = length; i < mix.data.length; i += 1) loop[(i - length) % length] += mix.data[i]
  return settle(loop, TUNE_PEAK, 0)
}

/** A tune, as samples that loop without a seam. */
export function renderTune(name: TuneName): Float32Array {
  const { mix, notes, length } = writeTune(name)
  for (const note of notes) mix.render(note)
  return closeLoop(mix, length)
}

/**
 * The same, a few notes at a time, handing the page back between them: a
 * tune takes a tenth of a second or more to render on a computer, longer on
 * a phone, and the game's frames must not wait for it.
 */
export async function renderTuneSoftly(name: TuneName, slice = 6): Promise<Float32Array> {
  const { mix, notes, length } = writeTune(name)
  let since = performance.now()
  for (const note of notes) {
    mix.render(note)
    if (performance.now() - since > slice) {
      await new Promise((r) => setTimeout(r, 0))
      since = performance.now()
    }
  }
  return closeLoop(mix, length)
}
