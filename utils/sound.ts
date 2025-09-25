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
