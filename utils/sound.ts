let ctx: AudioContext | null = null
let transitionNoiseBuffer: AudioBuffer | null = null
let muted = false

type AudioWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const win = window as AudioWindow
  const Ctor = win.AudioContext || win.webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  return ctx
}

export const setMuted = (v: boolean) => { muted = v }
export const getMuted = () => muted

type BeepOpts = { freq?: number; attack?: number; decay?: number; sustain?: number; release?: number; type?: OscillatorType; gain?: number }
function env({ freq=440, attack=0.005, decay=0.06, sustain=0.04, release=0.08, type='square', gain=0.2 }: BeepOpts) {
  if (muted) return
  const c = getAudioContext()
  if (!c) return
  const t = c.currentTime
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type; o.frequency.value = freq
  g.gain.setValueAtTime(0,t)
  g.gain.linearRampToValueAtTime(gain,t+attack)
  g.gain.linearRampToValueAtTime(gain*0.6,t+attack+decay)
  g.gain.setValueAtTime(gain*0.6,t+attack+decay+sustain)
  g.gain.linearRampToValueAtTime(0.0001,t+attack+decay+sustain+release)
  o.connect(g).connect(c.destination); o.start(t); o.stop(t+attack+decay+sustain+release+0.02)
}

function soundProgress(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function soundFinalPush(progress: number): number {
  return soundProgress((progress - 2) / 0.5)
}

function getTransitionNoiseBuffer(context: AudioContext): AudioBuffer {
  if (transitionNoiseBuffer && transitionNoiseBuffer.sampleRate === context.sampleRate) {
    return transitionNoiseBuffer
  }
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1
  }
  transitionNoiseBuffer = buffer
  return buffer
}

function transitionTail(progress: number, direction: 1 | -1) {
  const energy = soundProgress(progress)
  const overdrive = soundProgress(progress - 1)
  const finalPush = soundFinalPush(progress)
  if (muted || energy < 0.06) return
  const c = getAudioContext()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => undefined)

  const start = c.currentTime + 0.008
  const duration = 0.14 + energy * 0.44 + overdrive * 0.28 + finalPush * 0.18
  const source = c.createBufferSource()
  const filter = c.createBiquadFilter()
  const gain = c.createGain()
  const panner = typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null

  source.buffer = getTransitionNoiseBuffer(c)
  filter.type = 'bandpass'
  filter.Q.value = 0.7 + energy * 1.2 + overdrive * 3.1 + finalPush * 1.4
  filter.frequency.setValueAtTime(
    direction > 0 ? 720 - overdrive * 460 - finalPush * 55 : 3200 - overdrive * 1700 - finalPush * 260,
    start,
  )
  filter.frequency.exponentialRampToValueAtTime(
    direction > 0 ? 4800 - overdrive * 3000 + finalPush * 420 : 540 - overdrive * 190 - finalPush * 45,
    start + duration * 0.72,
  )
  filter.frequency.exponentialRampToValueAtTime(280 - overdrive * 90 - finalPush * 24, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(0.012 + energy * 0.052 + overdrive * 0.03 + finalPush * 0.012, start + duration * 0.12)
  gain.gain.setValueAtTime(0.009 + energy * 0.035 + overdrive * 0.026 + finalPush * 0.009, start + duration * 0.68)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  if (panner) {
    const panReach = Math.min(0.82, 0.42 * energy + 0.16 * overdrive + finalPush * 0.08)
    panner.pan.setValueAtTime(-panReach * direction, start)
    panner.pan.linearRampToValueAtTime(panReach * direction, start + duration * 0.7)
    source.connect(filter).connect(gain).connect(panner).connect(c.destination)
  } else {
    source.connect(filter).connect(gain).connect(c.destination)
  }
  source.start(start)
  source.stop(start + duration + 0.02)
}

function resonantPulse(progress: number, direction: 1 | -1) {
  const overdrive = soundProgress(progress - 1)
  const finalPush = soundFinalPush(progress)
  if (muted || overdrive < 0.02) return
  const c = getAudioContext()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => undefined)

  const start = c.currentTime + 0.014
  const duration = 0.34 + overdrive * 0.5 + finalPush * 0.18
  const root = (direction > 0 ? 150 : 168) + overdrive * 52 + finalPush * 16
  const filter = c.createBiquadFilter()
  const gain = c.createGain()
  const metallicGain = c.createGain()
  const panner = typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null
  const low = c.createOscillator()
  const beat = c.createOscillator()
  const metallic = c.createOscillator()

  filter.type = 'lowpass'
  filter.Q.value = 1.4 + overdrive * 2.8 + finalPush * 1.1
  filter.frequency.setValueAtTime(980 + overdrive * 420 + finalPush * 260, start)
  filter.frequency.exponentialRampToValueAtTime(380, start + duration)

  low.type = 'sine'
  low.frequency.setValueAtTime(root, start)
  low.frequency.exponentialRampToValueAtTime(root * 0.72, start + duration)
  beat.type = 'triangle'
  beat.frequency.setValueAtTime(root * (1.025 + overdrive * 0.025), start)
  beat.frequency.exponentialRampToValueAtTime(root * 0.755, start + duration)
  metallic.type = 'sawtooth'
  metallic.frequency.setValueAtTime(root * 2.45, start)
  metallic.frequency.exponentialRampToValueAtTime(root * 1.35, start + duration * 0.82)
  metallicGain.gain.setValueAtTime(0.16 + overdrive * 0.22 + finalPush * 0.09, start)
  metallicGain.gain.exponentialRampToValueAtTime(0.08, start + duration * 0.82)

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(0.012 + overdrive * 0.048 + finalPush * 0.01, start + duration * 0.12)
  gain.gain.setValueAtTime(0.01 + overdrive * 0.036 + finalPush * 0.008, start + duration * 0.66)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  low.connect(filter)
  beat.connect(filter)
  metallic.connect(metallicGain).connect(filter)
  if (panner) {
    const panReach = 0.18 + overdrive * 0.18 + finalPush * 0.08
    panner.pan.setValueAtTime(panReach * direction, start)
    panner.pan.linearRampToValueAtTime(-panReach * direction, start + duration * 0.72)
    filter.connect(gain).connect(panner).connect(c.destination)
  } else {
    filter.connect(gain).connect(c.destination)
  }

  low.start(start)
  beat.start(start)
  metallic.start(start + 0.018)
  low.stop(start + duration + 0.02)
  beat.stop(start + duration + 0.02)
  metallic.stop(start + duration * 0.82)
}

function pressurePulse(progress: number, direction: 1 | -1) {
  const finalPush = soundFinalPush(progress)
  if (muted || finalPush < 0.02) return
  const c = getAudioContext()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => undefined)

  const start = c.currentTime + 0.055
  const duration = 0.48 + finalPush * 0.42
  const root = direction > 0 ? 92 : 106
  const low = c.createOscillator()
  const tension = c.createOscillator()
  const filter = c.createBiquadFilter()
  const gain = c.createGain()
  const panner = typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null

  low.type = 'sine'
  low.frequency.setValueAtTime(root + finalPush * 18, start)
  low.frequency.exponentialRampToValueAtTime(root * 0.62, start + duration)
  tension.type = 'triangle'
  tension.frequency.setValueAtTime(root * (2.8 + finalPush * 0.4), start)
  tension.frequency.exponentialRampToValueAtTime(root * 1.18, start + duration * 0.86)

  filter.type = 'bandpass'
  filter.Q.value = 2.4 + finalPush * 3.2
  filter.frequency.setValueAtTime(720 + finalPush * 360, start)
  filter.frequency.exponentialRampToValueAtTime(190, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(0.012 + finalPush * 0.022, start + duration * 0.16)
  gain.gain.setValueAtTime(0.009 + finalPush * 0.014, start + duration * 0.68)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  low.connect(filter)
  tension.connect(filter)
  if (panner) {
    panner.pan.setValueAtTime(0.24 * direction, start)
    panner.pan.linearRampToValueAtTime(-0.34 * direction, start + duration * 0.74)
    filter.connect(gain).connect(panner).connect(c.destination)
  } else {
    filter.connect(gain).connect(c.destination)
  }

  low.start(start)
  tension.start(start + 0.025)
  low.stop(start + duration + 0.02)
  tension.stop(start + duration * 0.88)
}

export function playRandom(progress = 0) {
  const energy = soundProgress(progress)
  const overdrive = soundProgress(progress - 1)
  const digitalPresence = 1 - overdrive * 0.25
  const base = 280 + Math.random() * (80 + energy * 90)
  env({ freq: base, type:'square', gain:(0.18 + energy * 0.035) * digitalPresence, attack:0.005, decay:0.05, sustain:0.03 + energy * 0.045, release:0.08 + energy * 0.17 + overdrive * 0.08 })
  setTimeout(()=>env({ freq: base*(1.5 + energy * 0.22), type:'triangle', gain:(0.14 + energy * 0.025) * digitalPresence, attack:0.003, decay:0.04, sustain:0.02 + energy * 0.035, release:0.07 + energy * 0.19 + overdrive * 0.08 }), 30)
  if (energy > 0.3) {
    setTimeout(() => env({
      freq: base * (2.05 + Math.random() * 0.55),
      type: energy > 0.72 ? 'sawtooth' : 'square',
      gain: (0.015 + energy * 0.045) * digitalPresence,
      attack: 0.002,
      decay: 0.025,
      sustain: 0.01,
      release: 0.04 + energy * 0.14,
    }), Math.round(58 - energy * 20))
  }
  if (energy > 0.62) {
    setTimeout(() => env({
      freq: base * (0.42 + Math.random() * 0.12),
      type: 'sawtooth',
      gain: (0.012 + energy * 0.024) * digitalPresence,
      attack: 0.006,
      decay: 0.05,
      sustain: 0.025,
      release: 0.16 + energy * 0.1,
    }), 92)
  }
  transitionTail(progress, 1)
  resonantPulse(progress, 1)
  pressurePulse(progress, 1)
}

export function playAgain(progress = 0) {
  const energy = soundProgress(progress)
  const overdrive = soundProgress(progress - 1)
  const digitalPresence = 1 - overdrive * 0.25
  const base = 220 + Math.random() * (50 + energy * 55)
  env({ freq: base, type:'sawtooth', gain:(0.12 + energy * 0.025) * digitalPresence, attack:0.003, decay:0.03, sustain:0.02 + energy * 0.025, release:0.06 + energy * 0.16 + overdrive * 0.08 })
  setTimeout(()=>env({ freq: base*(0.8 + energy * 0.12), type:'square', gain:(0.10 + energy * 0.02) * digitalPresence, attack:0.002, decay:0.03, sustain:0.02 + energy * 0.02, release:0.05 + energy * 0.15 + overdrive * 0.08 }), 40)
  transitionTail(progress, -1)
  resonantPulse(progress, -1)
  pressurePulse(progress, -1)
}

async function swoosh(duration: number, gainValue: number, startFrequency: number, endFrequency: number) {
  if (muted) return
  const c = getAudioContext()
  if (!c) return
  if (c.state === 'suspended') {
    try { await c.resume() } catch { return }
  }

  const start = c.currentTime + 0.01
  const sampleCount = Math.max(1, Math.floor(c.sampleRate * duration))
  const buffer = c.createBuffer(1, sampleCount, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount
    const envelope = Math.sin(Math.PI * progress) ** 1.6
    data[index] = (Math.random() * 2 - 1) * envelope
  }

  const source = c.createBufferSource()
  const filter = c.createBiquadFilter()
  const gain = c.createGain()
  const panner = typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.Q.value = 0.55
  filter.frequency.setValueAtTime(startFrequency, start)
  filter.frequency.exponentialRampToValueAtTime(endFrequency, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(gainValue, start + duration * 0.16)
  gain.gain.setValueAtTime(gainValue * 0.82, start + duration * 0.58)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  if (panner) {
    panner.pan.setValueAtTime(-0.72, start)
    panner.pan.linearRampToValueAtTime(0.72, start + duration * 0.78)
    panner.pan.linearRampToValueAtTime(0.18, start + duration)
    source.connect(filter).connect(gain).connect(panner).connect(c.destination)
  } else {
    source.connect(filter).connect(gain).connect(c.destination)
  }

  const low = c.createOscillator()
  const lowGain = c.createGain()
  low.type = 'sine'
  low.frequency.setValueAtTime(118, start)
  low.frequency.exponentialRampToValueAtTime(54, start + duration)
  lowGain.gain.setValueAtTime(0.0001, start)
  lowGain.gain.linearRampToValueAtTime(gainValue * 0.26, start + duration * 0.18)
  lowGain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  low.connect(lowGain).connect(c.destination)
  source.start(start)
  source.stop(start + duration + 0.02)
  low.start(start)
  low.stop(start + duration + 0.02)
}

export function playWaveEnter() {
  void swoosh(1.42, 0.34, 150, 5600)
}

export function playWaveStep() {
  void swoosh(0.56, 0.22, 330, 3900)
}
