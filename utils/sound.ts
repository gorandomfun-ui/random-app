let ctx: AudioContext | null = null
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

export function playRandom() {
  const base = 280 + Math.random()*80
  env({ freq: base, type:'square', gain:0.18, attack:0.005, decay:0.05, sustain:0.03, release:0.08 })
  setTimeout(()=>env({ freq: base*1.5, type:'triangle', gain:0.14, attack:0.003, decay:0.04, sustain:0.02, release:0.07 }), 30)
}
export function playAgain() {
  const base = 220 + Math.random()*50
  env({ freq: base, type:'sawtooth', gain:0.12, attack:0.003, decay:0.03, sustain:0.02, release:0.06 })
  setTimeout(()=>env({ freq: base*0.8, type:'square', gain:0.10, attack:0.002, decay:0.03, sustain:0.02, release:0.05 }), 40)
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
