/**
 * Sounds the promo makes itself, for when no track and no stock sound is at
 * hand: five glitch beds, each a little different by the seed, rendered
 * offline at the film's length — a pulse (kick, hat, sub), a modem (square
 * tones in runs, a hiss), static (noise swept, clicks, dropouts), a drone
 * (detuned saws under a moving lowpass), an arpeggio (square notes of a
 * minor pentatonic). The film then glitches them like any track.
 */

export type SynthKind = 'pulse' | 'modem' | 'static' | 'drone' | 'arp'
export const SYNTHS: Array<{ key: SynthKind; name: string }> = [
  { key: 'pulse', name: 'Pulsation' },
  { key: 'modem', name: 'Modem' },
  { key: 'static', name: 'Statique' },
  { key: 'drone', name: 'Nappe' },
  { key: 'arp', name: 'Arpège' },
]

/** A deterministic stream of numbers in [0, 1) from a seed. */
function lcg(seed: number) {
  let s = (Math.floor(seed) * 2654435761 + 1013904223) >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, rnd: () => number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate)
  const d = buffer.getChannelData(0)
  for (let i = 0; i < d.length; i += 1) d[i] = rnd() * 2 - 1
  return buffer
}

/** A gain node with an envelope: up at once, down over `decay` seconds, from `at`. */
function envelope(ctx: BaseAudioContext, at: number, peak: number, decay: number, hold = 0): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.003)
  if (hold > 0) g.gain.setValueAtTime(peak, at + hold)
  g.gain.exponentialRampToValueAtTime(0.0005, at + hold + decay)
  return g
}

export async function synthTrack(kind: SynthKind, seconds: number, seed: number, beatMs: number): Promise<AudioBuffer> {
  const sr = 44100, length = Math.max(1, seconds)
  const ctx = new OfflineAudioContext(2, Math.ceil(length * sr), sr)
  const rnd = lcg(seed * 7 + kind.length)
  const beat = Math.max(0.3, beatMs / 1000)
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination)
  const noise = noiseBuffer(ctx, 2, rnd)
  const burst = (at: number, len: number, peak: number, filter?: { type: BiquadFilterType; freq: number; q?: number }) => {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true
    const env = envelope(ctx, at, peak, len)
    if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; s.connect(f); f.connect(env) } else s.connect(env)
    env.connect(master); s.start(at, rnd() * 1.5); s.stop(at + len + 0.05)
  }
  const tone = (at: number, len: number, freq: number, type: OscillatorType, peak: number, decay = len, glideTo?: number) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + len)
    const env = envelope(ctx, at, peak, decay, Math.max(0, len - decay))
    o.connect(env); env.connect(master); o.start(at); o.stop(at + len + decay + 0.05)
  }
  switch (kind) {
    case 'pulse': {
      // A kick on every beat with a few doubled, a hat on the halves with some skipped, a sub note under it all.
      const root = 38 + rnd() * 14
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = root
      const subGain = ctx.createGain(); subGain.gain.value = 0.22; sub.connect(subGain); subGain.connect(master); sub.start(0); sub.stop(length)
      for (let t = 0.02; t < length; t += beat) {
        tone(t, 0.3, 160 + rnd() * 60, 'sine', 0.9, 0.28, 42)
        if (rnd() < 0.18) tone(t + beat * 0.5, 0.2, 140, 'sine', 0.6, 0.18, 40)
        for (const h of [0.5, 0.75, 0.25]) if (rnd() < 0.7) burst(t + beat * h, 0.04 + rnd() * 0.04, 0.3, { type: 'highpass', freq: 6000 })
      }
      break
    }
    case 'modem': {
      // Runs of square tones at data speed, gaps between the runs, a hiss underneath, a sweep now and then.
      const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true
      const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2400; hf.Q.value = 0.6
      const hg = ctx.createGain(); hg.gain.value = 0.045; hiss.connect(hf); hf.connect(hg); hg.connect(master); hiss.start(0); hiss.stop(length)
      let t = 0.05
      while (t < length) {
        const run = 3 + Math.floor(rnd() * 9)
        for (let i = 0; i < run && t < length; i += 1) { const len = 0.04 + rnd() * 0.08; tone(t, len, 500 + rnd() * 2200, 'square', 0.16, 0.02); t += len + (rnd() < 0.3 ? 0.03 : 0) }
        if (rnd() < 0.25) { tone(t, 0.3, 300, 'sawtooth', 0.14, 0.05, 2600); t += 0.3 }
        t += 0.08 + rnd() * 0.4
      }
      break
    }
    case 'static': {
      // Noise under a bandpass that drifts, clicks at random, dropouts that cut everything for a moment.
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2
      const drift = ctx.createOscillator(); drift.frequency.value = 0.08 + rnd() * 0.25; const depth = ctx.createGain(); depth.gain.value = 900; drift.connect(depth); depth.connect(bp.frequency); bp.frequency.value = 1200; drift.start(0)
      const g = ctx.createGain(); g.gain.value = 0.35; src.connect(bp); bp.connect(g); g.connect(master); src.start(0); src.stop(length)
      for (let t = 0; t < length; t += 0.05 + rnd() * 0.5) if (rnd() < 0.6) burst(t, 0.004 + rnd() * 0.01, 0.9)
      for (let t = 0.5; t < length; t += 0.4 + rnd() * 1.6) if (rnd() < 0.5) { const len = 0.05 + rnd() * 0.12; g.gain.setValueAtTime(0.35, t); g.gain.linearRampToValueAtTime(0, t + 0.004); g.gain.setValueAtTime(0, t + len); g.gain.linearRampToValueAtTime(0.35, t + len + 0.004) }
      break
    }
    case 'drone': {
      // Three saws a few cents apart on a low note, a lowpass that breathes, a sine an octave up that trembles.
      const root = 52 + rnd() * 34
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.value = 500
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + rnd() * 0.12; const depth = ctx.createGain(); depth.gain.value = 380; lfo.connect(depth); depth.connect(lp.frequency); lfo.start(0)
      const g = ctx.createGain(); g.gain.value = 0.16; lp.connect(g); g.connect(master)
      for (const cents of [-9, 0, 11]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * 2 ** (cents / 1200); o.connect(lp); o.start(0); o.stop(length) }
      const high = ctx.createOscillator(); high.type = 'sine'; high.frequency.value = root * 4
      const trem = ctx.createGain(); trem.gain.value = 0.05; const tl = ctx.createOscillator(); tl.frequency.value = 3 + rnd() * 4; const td = ctx.createGain(); td.gain.value = 0.04; tl.connect(td); td.connect(trem.gain); tl.start(0)
      high.connect(trem); trem.connect(master); high.start(0); high.stop(length)
      break
    }
    case 'arp': {
      // Square notes of a minor pentatonic, two a beat, octave jumps at random, a soft hat between.
      const root = 110 * 2 ** (Math.floor(rnd() * 7) / 12)
      const scale = [0, 3, 5, 7, 10]
      const step = beat / 2
      for (let t = 0.02, i = 0; t < length; t += step, i += 1) {
        if (rnd() < 0.12) continue
        const note = root * 2 ** (scale[Math.floor(rnd() * scale.length)] / 12) * (rnd() < 0.25 ? 2 : 1) * (i % 8 === 0 ? 0.5 : 1)
        tone(t, step * 0.55, note, 'square', 0.14, step * 0.5)
        if (i % 2 === 1 && rnd() < 0.6) burst(t + step * 0.5, 0.03, 0.12, { type: 'highpass', freq: 7000 })
      }
      break
    }
  }
  return ctx.startRendering()
}
