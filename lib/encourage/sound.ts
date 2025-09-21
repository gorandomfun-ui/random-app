'use client'

const SOUND_FILES = ['pop1.mp3', 'pop2.mp3', 'pop3.mp3', 'pop4.mp3']

export async function playAppear() {
  // 1) mp3 aléatoire, volume élevé
  try {
    const file = SOUND_FILES[Math.floor(Math.random() * SOUND_FILES.length)]
    const a = new Audio(`/encourage/sounds/${file}`)
    a.volume = 0.95 // plus fort
    // pour éviter des blocages, on lance dans un user-gesture (ton clic déclenche l’event)
    await a.play()
    return
  } catch {
    // 2) fallback WebAudio plus punchy
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext)
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.setValueAtTime(-10, ctx.currentTime)
      comp.knee.setValueAtTime(20, ctx.currentTime)
      comp.ratio.setValueAtTime(12, ctx.currentTime)
      comp.attack.setValueAtTime(0.002, ctx.currentTime)
      comp.release.setValueAtTime(0.1, ctx.currentTime)

      // petit sweep pour donner de la présence
      osc.type = 'square'
      osc.frequency.setValueAtTime(720, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.12)

      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.01) // plus fort
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)

      osc.connect(gain).connect(comp).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.2)
    } catch { /* ignore */ }
  }
}
