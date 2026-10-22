/**
 * The promo's sound: one of the curator's tracks, glitched by the film itself.
 * The film's plan — its shots — says where the track stutters, where it goes
 * quiet, where it is muffled: a beat-repeat of a short slice at the hints and
 * at the start of each burst, the track keeping its time underneath; holes on
 * the strong steps of a burst; a crushed grain over the bursts; a lowpass that
 * closes through each settle and opens again at its end; a short hole at each
 * card; a fade at the close. Rendered once, offline, so the preview and the
 * recording play the same sound; every number comes from the seed.
 */

import type { Shot } from './promoLoop'

const hash = (...n: number[]) => { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) + 0x9e3779b9; h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }
/** The promo's hash, for the page's own draws by the seed. */
export const promoHash = hash

export type SoundPlan = { shots: Shot[]; beat: number; seconds: number; seed: number; glitch: number; offsetSec: number }

let shared: AudioContext | null = null
/** The page's one audio context; Chrome lets it run after a first touch of the page. */
export function audioContext(): AudioContext {
  if (!shared) shared = new AudioContext()
  return shared
}

/** The track fetched and decoded — by an offline context, which needs no click to work. */
export async function loadTrack(url: string): Promise<AudioBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`piste ${response.status}`)
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(await response.arrayBuffer())
}

/** True when a decoded file holds nothing to hear: its loudest sample, read every sixteenth, stays under a whisper. */
export function soundless(buffer: AudioBuffer): boolean {
  let peak = 0
  for (let c = 0; c < buffer.numberOfChannels; c += 1) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i += 16) { const v = Math.abs(d[i]); if (v > peak) peak = v } }
  return peak < 0.004
}

/** Where in the track the film starts: a place by the seed, leaving the film's length before the end when the track is long enough. */
export function offsetFor(buffer: AudioBuffer, seconds: number, seed: number): number {
  const room = Math.max(0, buffer.duration - seconds - 0.5)
  return Math.floor(hash(seed, 900) * room * 10) / 10
}

/** A stepped curve: the signal held to a few levels, the crushed grain of a cheap converter. */
function stepCurve(bits: number): Float32Array<ArrayBuffer> {
  const levels = 2 ** bits, curve = new Float32Array(new ArrayBuffer(4096 * 4))
  for (let i = 0; i < curve.length; i += 1) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.round(x * levels) / levels }
  return curve
}

export async function renderSoundtrack(buffer: AudioBuffer, plan: SoundPlan): Promise<AudioBuffer> {
  const sr = buffer.sampleRate, seconds = Math.max(0.5, plan.seconds)
  const off = new OfflineAudioContext(Math.min(2, Math.max(1, buffer.numberOfChannels)), Math.ceil(seconds * sr), sr)
  const g = Math.min(1, Math.max(0, plan.glitch))
  const beatSec = Math.max(0.3, plan.beat / 1000)
  const master = off.createGain(); master.connect(off.destination)
  const filter = off.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 18000; filter.Q.value = 0.7; filter.connect(master)
  // The crusher beside the clean path, mixed in by its own gain over the bursts.
  const dry = off.createGain(); dry.gain.value = 1; dry.connect(filter)
  const wet = off.createGain(); wet.gain.value = 0; wet.connect(filter)
  const crusher = off.createWaveShaper(); crusher.curve = stepCurve(5); crusher.connect(wet)
  const bus = off.createGain(); bus.connect(dry); bus.connect(crusher)
  // The base: the track from its offset, looping when it runs short, muted during the stutters and the holes.
  const base = off.createGain(); base.gain.value = 1; base.connect(bus)
  const track = off.createBufferSource(); track.buffer = buffer; track.loop = true; track.loopStart = 0; track.loopEnd = buffer.duration; track.connect(base)
  const offset = plan.offsetSec % buffer.duration
  track.start(0, offset)
  const hole = (t0: number, len: number) => {
    base.gain.setValueAtTime(1, t0); base.gain.linearRampToValueAtTime(0, t0 + 0.004)
    base.gain.setValueAtTime(0, t0 + len - 0.004); base.gain.linearRampToValueAtTime(1, t0 + len)
  }
  /** The slice at the track's place at t0, repeated: the base muted meanwhile, each repeat with its own tiny fades. */
  const stutter = (t0: number, len: number, repeats: number) => {
    if (repeats < 1 || len < 0.02) return
    hole(t0, len * repeats)
    for (let i = 0; i < repeats; i += 1) {
      const at = t0 + i * len
      const s = off.createBufferSource(); s.buffer = buffer
      const env = off.createGain(); s.connect(env); env.connect(bus)
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + 0.004); env.gain.setValueAtTime(1, at + len - 0.006); env.gain.linearRampToValueAtTime(0, at + len)
      s.start(at, (offset + t0) % buffer.duration, len)
    }
  }
  for (const shot of plan.shots) {
    const from = shot.from / 1000, to = Math.min(seconds, shot.to / 1000), len = to - from
    if (len <= 0.03) continue
    const s = shot.seed
    if (shot.phase === 'hint' && g > 0.05 && hash(s, 901) < 0.35 + g * 0.5) {
      // A few tiny repeats: the first sign.
      const sl = Math.min(0.12, Math.max(0.05, beatSec / 8))
      stutter(from, sl, Math.min(Math.floor(len / sl), 2 + Math.round(g * 2)))
    }
    if (shot.phase === 'burst') {
      // The beat-repeat at the start, harder with the force; holes on the strong steps after it; the crushed grain over the whole burst.
      const sl = Math.min(0.16, (0.045 + hash(s, 902) * 0.07) * (1 + (1 - g) * 0.6))
      const n = Math.min(Math.floor(len / sl), Math.round((2 + g * 7) * (0.5 + shot.g * 0.5)))
      stutter(from, sl, n)
      if (shot.g > 0.5 && g > 0.1) { const step = 0.26 - shot.g * 0.17; for (let t = from + sl * Math.max(0, n) + 0.05, i = 0; t < to - 0.1; t += step, i += 1) if (hash(s, i, 903) < g * 0.35) hole(t, 0.03 + hash(s, i, 904) * 0.05) }
      const amount = Math.min(0.8, g * (0.3 + shot.g * 0.5))
      wet.gain.setValueAtTime(0, from); wet.gain.linearRampToValueAtTime(amount, from + 0.02); wet.gain.setValueAtTime(amount, to - 0.05); wet.gain.linearRampToValueAtTime(0, to)
      dry.gain.setValueAtTime(1, from); dry.gain.linearRampToValueAtTime(1 - amount * 0.7, from + 0.02); dry.gain.setValueAtTime(1 - amount * 0.7, to - 0.05); dry.gain.linearRampToValueAtTime(1, to)
    }
    if (shot.phase === 'settle' && g > 0.05) {
      // Muffled: the lowpass closes over the settle and opens again at its end.
      const floor = 500 + (1 - g) * 3000 + hash(s, 905) * 600
      filter.frequency.setValueAtTime(18000, from); filter.frequency.exponentialRampToValueAtTime(floor, from + len * (0.35 + hash(s, 906) * 0.3))
      filter.frequency.setValueAtTime(floor, Math.max(from + 0.05, to - 0.12)); filter.frequency.exponentialRampToValueAtTime(18000, to)
    }
    if (shot.phase === 'card' && g > 0.05) hole(from, 0.05 + g * 0.06)
  }
  // At one level whatever the source — a quiet street or a loud track; in without a click; out with a short fade.
  const level = 0.9 * levelFor(buffer, offset, seconds)
  master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(level, 0.03)
  master.gain.setValueAtTime(level, Math.max(0.03, seconds - 0.3)); master.gain.linearRampToValueAtTime(0, seconds)
  return off.startRendering()
}

/** The gain that brings the part of the source the film uses to a working loudness, within bounds. */
function levelFor(buffer: AudioBuffer, offsetSec: number, seconds: number): number {
  const d = buffer.getChannelData(0), from = Math.floor(offsetSec * buffer.sampleRate), to = Math.min(d.length, Math.floor((offsetSec + seconds) * buffer.sampleRate))
  let sum = 0, n = 0
  for (let i = from; i < to; i += 8) { sum += d[i] * d[i]; n += 1 }
  const rms = n ? Math.sqrt(sum / n) : 0
  return rms > 0.0005 ? Math.min(5, Math.max(0.4, 0.12 / rms)) : 1
}
