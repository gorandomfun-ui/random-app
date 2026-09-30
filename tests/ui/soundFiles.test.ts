import test from 'node:test'
import assert from 'node:assert/strict'

import { gameSounds } from '@/lib/games/sound'
import * as files from '@/lib/sound/files'
import * as sound from '@/utils/sound'

/**
 * The sounds an iPhone plays as files, against a player that behaves as
 * Safari's does: it ignores the page's volume, it keeps a request it cannot
 * play while something holds the sound (a video, another app, a locked screen)
 * and plays it the moment the hold ends — unless the page paused it meanwhile.
 * That is how the owner heard all his sounds at once on 29/09.
 */

type Start = { src: string; muted: boolean }
type Listener = { fn: () => void; once: boolean }

const device = {
  /** Something else holds the sound: requests are kept for later. */
  interrupted: false,
  /** The files are still on their way: players start when they arrive. */
  slow: false,
  starts: [] as Start[],
  loading: new Set<FakeAudio>(),
  players: [] as FakeAudio[],
}
const audible = () => device.starts.filter((start) => !start.muted)

class FakeAudio {
  src: string
  muted = false
  paused = true
  ended = false
  currentTime = 0
  preload = ''
  loop = false
  /** What Safari will do when the hold ends. */
  restore: '' | 'playing' | 'paused' = ''
  private promise: { resolve: () => void; reject: (error: Error) => void } | null = null
  private listeners = new Map<string, Listener[]>()

  constructor(src = '') {
    this.src = src
    device.players.push(this)
  }
  // an iPhone keeps a page's players at full volume whatever it is told
  get volume() { return 1 }
  set volume(_value: number) { /* ignored */ }

  addEventListener(name: string, fn: () => void, options?: { once?: boolean }) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), { fn, once: Boolean(options?.once) }])
  }
  removeEventListener(name: string, fn: () => void) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((l) => l.fn !== fn))
  }
  private emit(name: string) {
    const all = this.listeners.get(name) ?? []
    this.listeners.set(name, all.filter((l) => !l.once))
    for (const l of all) l.fn()
  }

  play(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => { this.promise = { resolve, reject } })
    if (device.interrupted) { this.restore = 'playing'; return promise }
    this.paused = false
    if (device.slow) { device.loading.add(this); return promise }
    this.start()
    return promise
  }
  start() {
    this.paused = false
    this.restore = ''
    device.starts.push({ src: this.src, muted: this.muted })
    this.emit('playing')
    this.promise?.resolve()
    this.promise = null
  }
  pause() {
    if (device.interrupted) this.restore = 'paused'
    this.paused = true
    device.loading.delete(this)
    this.promise?.reject(new Error('AbortError'))
    this.promise = null
  }
}

function endInterruption() {
  device.interrupted = false
  for (const audio of device.players) if (audio.restore === 'playing') audio.start()
}
function filesArrive() {
  device.slow = false
  for (const audio of [...device.loading]) audio.start()
  device.loading.clear()
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const reset = () => { device.starts.length = 0; device.interrupted = false; device.slow = false }

const visibility: Array<() => void> = []
const touches = new Map<string, Set<() => void>>()
function touch() {
  // what a finger lifted from the page does: touchend, then click
  for (const name of ['touchend', 'click']) for (const handler of [...(touches.get(name) ?? [])]) handler()
}
const page = { visibilityState: 'visible', hidden: false }
function hide(hidden: boolean) {
  page.hidden = hidden
  page.visibilityState = hidden ? 'hidden' : 'visible'
  for (const handler of visibility) handler()
}

// The modules only read the browser when a sound is asked for, so the
// stand-ins can come after the imports.
;(globalThis as unknown as { window: unknown }).window = {}
;(globalThis as unknown as { Audio: unknown }).Audio = FakeAudio
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', maxTouchPoints: 5 },
  configurable: true,
})
;(globalThis as unknown as { document: unknown }).document = {
  get visibilityState() { return page.visibilityState },
  get hidden() { return page.hidden },
  addEventListener: (name: string, handler: () => void) => {
    if (name === 'visibilitychange') visibility.push(handler)
    else touches.set(name, new Set([...(touches.get(name) ?? []), handler]))
  },
  removeEventListener: (name: string, handler: () => void) => { touches.get(name)?.delete(handler) },
}


test('la page ouverte, le premier toucher n_importe où réchauffe les lecteurs pendant ce toucher', async () => {
  // Warmed after downloading the files' code, outside the touch, the first
  // sounds of a visit came too late and were dropped.
  sound.prepareSound()
  for (let i = 0; i < 100 && !sound.soundStatus().files; i += 1) await wait(10)
  assert.ok(sound.soundStatus().files, 'le code des sons est là avant le toucher')
  assert.equal(device.players.length, 0, 'rien avant le toucher')
  device.slow = true
  touch()
  assert.ok(device.players.length >= 32, `${device.players.length} lecteurs démarrés pendant le toucher`)
  assert.equal(touches.get('touchend')?.size, 0, 'une seule fois')
})

test('au premier toucher, les lecteurs réchauffés restent muets même si leurs fichiers arrivent tard', async () => {
  // They used to be turned down, which an iPhone ignores: all sixteen then
  // sounded together a moment after the first touch, when the files arrived.
  device.starts.length = 0
  filesArrive()
  await wait(0)
  assert.ok(device.starts.length >= 16, `${device.starts.length} lecteurs démarrés`)
  assert.deepEqual(audible(), [], 'aucun ne se fait entendre')
  const warmed = device.players.filter((audio) => audio.src.startsWith('/sounds/'))
  assert.ok(warmed.every((audio) => audio.paused && !audio.muted), 'arrêtés et prêts à sonner')
})

test('un son qui part tout de suite se joue en entier', async () => {
  reset()
  const before = files.fileSoundTally()
  files.playSoundFile('random', 1)
  await wait(files.LATE_MS + 50)
  assert.deepEqual(audible().map((s) => s.src), ['/sounds/random-1.wav'])
  const player = device.players.find((audio) => audio.src === '/sounds/random-1.wav' && !audio.paused)
  assert.ok(player, 'toujours en train de jouer après le délai')
  assert.equal(files.fileSoundTally().started, before.started + 1)
})

test('des sons retenus par Safari sont annulés et ne sortent jamais plus tard, tous ensemble', async () => {
  reset()
  const before = files.fileSoundTally()
  device.interrupted = true
  sound.playRandom(0)
  sound.playRandom(2)
  sound.playAgain(1)
  sound.playWaveStep()
  await wait(files.HELD_MS + 50)
  endInterruption()
  await wait(0)
  assert.deepEqual(audible(), [], 'rien ne sort à la fin de l_interruption')
  assert.equal(files.fileSoundTally().dropped, before.dropped + 4)
  // and the next draw sounds normally
  sound.playRandom(0)
  await wait(20)
  assert.deepEqual(audible().map((s) => s.src), ['/sounds/random-0.wav'])
})

test('un son pris par Safari mais encore en chargement part s_il arrive dans la seconde', async () => {
  // the first sound of a visit, the first Wave: their file is still on its way
  reset()
  device.slow = true
  sound.playWaveEnter()
  await wait(files.HELD_MS + 250)
  filesArrive()
  await wait(0)
  assert.deepEqual(audible().map((s) => s.src), ['/sounds/wave-enter.wav'])
})

test('un son encore en chargement après une seconde est jeté', async () => {
  reset()
  const before = files.fileSoundTally()
  device.slow = true
  files.playSoundFile('again', 1)
  await wait(files.LATE_MS + 50)
  filesArrive()
  await wait(0)
  assert.deepEqual(audible(), [])
  assert.equal(files.fileSoundTally().dropped, before.dropped + 1)
})

test('un son demandé il y a trop longtemps (le temps de charger son code) est jeté sans jouer', async () => {
  reset()
  const before = files.fileSoundTally()
  files.playSoundFile('again', 0, performance.now() - files.LATE_MS - 100)
  await wait(20)
  assert.deepEqual(device.starts, [])
  assert.equal(files.fileSoundTally().dropped, before.dropped + 1)
})

test('page cachée : rien ne part, et un son en attente est oublié', async () => {
  reset()
  hide(true)
  sound.playRandom(0)
  await wait(20)
  assert.deepEqual(device.starts, [], 'rien pendant que la page est cachée')
  hide(false)

  // asked while the sound is held, then the page leaves before the deadline
  device.interrupted = true
  sound.playAgain(2)
  await wait(20)
  hide(true)
  endInterruption()
  await wait(files.LATE_MS + 50)
  hide(false)
  assert.deepEqual(audible(), [], 'rien au retour sur la page')
})

test('les sons d_un jeu obéissent à la même règle', async () => {
  reset()
  const sounds = gameSounds('eater')
  device.interrupted = true
  sounds.play('bite')
  sounds.play('fries')
  sounds.play('bite')
  await wait(files.HELD_MS + 50)
  endInterruption()
  await wait(0)
  assert.deepEqual(audible(), [], 'aucune bouchée en retard')
  sounds.play('bite')
  await wait(20)
  assert.deepEqual(audible().map((s) => s.src), ['/sounds/games/bite.wav'])
  sounds.dispose()
})

test('le témoin de la page compte les sons de fichiers', async () => {
  const status = sound.soundStatus()
  assert.equal(status.state, 'coupe-ios')
  assert.ok(status.files, 'les chiffres des fichiers sont là')
  assert.ok(status.files.asked >= status.files.started + status.files.dropped)
})
