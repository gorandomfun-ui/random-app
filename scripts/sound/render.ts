/**
 * The transition sounds, rendered once into files.
 *
 *   node --import tsx scripts/sound/render.ts
 *
 * On an iPhone and an iPad the page may not synthesise: a running Web Audio
 * engine takes the device's audio session there and the video in the page is
 * given nothing — the owner lost his video sound the evening that engine was
 * finally made to run. A file played through a player takes nothing from
 * anybody, and it also ignores the silent switch, as a video does.
 *
 * So the same shapes `utils/sound.ts` synthesises are written here into small
 * mono files: one per sound and per step of the progression. They are close to
 * the live ones, not identical — a filter sweep is approximated — which nobody
 * can hear on a phone.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const RATE = 22_050
const OUT = path.join(process.cwd(), 'public', 'sounds')

type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth'

/** One sample of a waveform at a given phase, 0 to 1. */
function shape(kind: Wave, phase: number): number {
  const t = phase - Math.floor(phase)
  if (kind === 'sine') return Math.sin(2 * Math.PI * t)
  if (kind === 'square') return t < 0.5 ? 1 : -1
  if (kind === 'sawtooth') return 2 * t - 1
  return 4 * Math.abs(t - 0.5) - 1
}

class Track {
  readonly data: Float32Array
  constructor(readonly seconds: number) {
    this.data = new Float32Array(Math.ceil(seconds * RATE))
  }
  add(index: number, value: number): void {
    if (index < 0 || index >= this.data.length) return
    this.data[index] += value
  }
}

/** A tone with the attack, decay, sustain and release the live sound uses. */
function tone(track: Track, at: number, options: {
  freq: number; to?: number; type?: Wave; gain?: number
  attack?: number; decay?: number; sustain?: number; release?: number
}): void {
  const { freq, to = freq, type = 'square', gain = 0.2, attack = 0.005, decay = 0.06, sustain = 0.04, release = 0.08 } = options
  const total = attack + decay + sustain + release
  const start = Math.round(at * RATE)
  const count = Math.round(total * RATE)
  let phase = 0
  for (let i = 0; i < count; i += 1) {
    const time = i / RATE
    const ratio = time / total
    const frequency = freq + (to - freq) * ratio
    phase += frequency / RATE
    let level: number
    if (time < attack) level = (time / attack) * gain
    else if (time < attack + decay) level = gain - ((time - attack) / decay) * gain * 0.4
    else if (time < attack + decay + sustain) level = gain * 0.6
    else level = gain * 0.6 * Math.max(0, 1 - (time - attack - decay - sustain) / release)
    track.add(start + i, shape(type, phase) * level)
  }
}

let seed = 20260926
/** Repeatable noise, so a rendering is the same every time it is run. */
function noise(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed / 0x7fffffff) * 2 - 1
}

/** Filtered noise sweeping from one frequency to another: the transition's tail. */
function sweep(track: Track, at: number, duration: number, from: number, to: number, gain: number): void {
  const start = Math.round(at * RATE)
  const count = Math.round(duration * RATE)
  let low = 0
  let band = 0
  for (let i = 0; i < count; i += 1) {
    const ratio = i / count
    const frequency = from * Math.pow(to / from, ratio)
    // A two-pole band pass, enough for a whoosh.
    const f = 2 * Math.sin((Math.PI * Math.min(frequency, RATE / 2.2)) / RATE)
    const input = noise()
    low += f * band
    const high = input - low - 0.9 * band
    band += f * high
    const envelope = Math.sin(Math.PI * Math.min(1, ratio)) ** 1.4
    track.add(start + i, band * envelope * gain)
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** The draw's sound, as `playRandom` builds it, at a given step of the progression. */
function random(progress: number): Track {
  const energy = clamp01(progress)
  const overdrive = clamp01(progress - 1)
  const track = new Track(1.2 + energy * 0.5)
  const base = 300 + energy * 90
  tone(track, 0, { freq: base, type: 'square', gain: 0.18 + energy * 0.035, sustain: 0.03 + energy * 0.045, release: 0.08 + energy * 0.17 })
  tone(track, 0.03, { freq: base * (1.5 + energy * 0.22), type: 'triangle', gain: 0.14 + energy * 0.025, sustain: 0.02 + energy * 0.035, release: 0.07 + energy * 0.19 })
  if (energy > 0.3) tone(track, 0.05, { freq: base * 2.2, type: energy > 0.72 ? 'sawtooth' : 'square', gain: 0.015 + energy * 0.045, sustain: 0.01, release: 0.04 + energy * 0.14 })
  if (energy > 0.62) tone(track, 0.09, { freq: base * 0.45, type: 'sawtooth', gain: 0.012 + energy * 0.024, sustain: 0.025, release: 0.16 + energy * 0.1 })
  if (energy >= 0.06) sweep(track, 0.008, 0.14 + energy * 0.44 + overdrive * 0.28, 720 - overdrive * 460, 4800 - overdrive * 3000, 0.05 + energy * 0.16)
  if (overdrive >= 0.02) {
    const root = 150 + overdrive * 52
    tone(track, 0.014, { freq: root, to: root * 0.72, type: 'sine', gain: 0.05 + overdrive * 0.1, attack: 0.02, decay: 0.1, sustain: 0.12, release: 0.2 })
  }
  return track
}

/** The sound of asking again, lower and shorter. */
function again(progress: number): Track {
  const energy = clamp01(progress)
  const overdrive = clamp01(progress - 1)
  const track = new Track(1.1 + energy * 0.5)
  const base = 235 + energy * 55
  tone(track, 0, { freq: base, type: 'sawtooth', gain: 0.12 + energy * 0.025, attack: 0.003, decay: 0.03, sustain: 0.02 + energy * 0.025, release: 0.06 + energy * 0.16 })
  tone(track, 0.04, { freq: base * (0.8 + energy * 0.12), type: 'square', gain: 0.1 + energy * 0.02, attack: 0.002, decay: 0.03, sustain: 0.02, release: 0.05 + energy * 0.15 })
  if (energy >= 0.06) sweep(track, 0.008, 0.14 + energy * 0.44, 3200 - overdrive * 1700, 540 - overdrive * 190, 0.05 + energy * 0.14)
  return track
}

/** The two swooshes of the wave. */
function swoosh(duration: number, gain: number, from: number, to: number): Track {
  const track = new Track(duration + 0.1)
  sweep(track, 0.01, duration, from, to, gain)
  const start = Math.round(0.01 * RATE)
  const count = Math.round(duration * RATE)
  let phase = 0
  for (let i = 0; i < count; i += 1) {
    const ratio = i / count
    phase += (118 * Math.pow(54 / 118, ratio)) / RATE
    track.add(start + i, Math.sin(2 * Math.PI * phase) * gain * 0.26 * Math.max(0, 1 - ratio))
  }
  return track
}

/** A mono 16-bit file, the plainest thing every browser plays. */
function wav(track: Track): Buffer {
  // The silence at the end is weight for nothing on a phone.
  let last = track.data.length - 1
  while (last > 0 && Math.abs(track.data[last]) < 1e-4) last -= 1
  const samples = Math.min(track.data.length, last + Math.round(0.02 * RATE))
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40)
  let peak = 0
  for (const value of track.data) peak = Math.max(peak, Math.abs(value))
  // Kept under the ceiling, and never lifted: a quiet sound stays quiet.
  const scale = peak > 0.98 ? 0.98 / peak : 1
  for (let i = 0; i < samples; i += 1) {
    const value = Math.max(-1, Math.min(1, track.data[i] * scale))
    buffer.writeInt16LE(Math.round(value * 32_767), 44 + i * 2)
  }
  return buffer
}

function main(): void {
  mkdirSync(OUT, { recursive: true })
  const files: Array<[string, Track]> = [
    ['random-0', random(0)], ['random-1', random(1)], ['random-2', random(2)],
    ['again-0', again(0)], ['again-1', again(1)], ['again-2', again(2)],
    ['wave-enter', swoosh(1.42, 0.34, 150, 5600)],
    ['wave-step', swoosh(0.56, 0.22, 330, 3900)],
  ]
  for (const [name, track] of files) {
    const data = wav(track)
    writeFileSync(path.join(OUT, `${name}.wav`), data)
    console.log(`${name}.wav  ${(data.length / 1024).toFixed(0)} ko  ${track.seconds.toFixed(2)} s`)
  }
}

main()
