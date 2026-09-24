import test from 'node:test'
import assert from 'node:assert/strict'

import * as sound from '@/utils/sound'

/**
 * The sound engine of the page, as Safari treats it on an iPad: a fake audio
 * engine that can be put in the `interrupted` state a video causes, to check
 * that the transitions come back instead of falling silent for the session.
 */

type Note = { start: number; stop: number }

class FakeParam {
  setValueAtTime() { return this }
  linearRampToValueAtTime() { return this }
  exponentialRampToValueAtTime() { return this }
  value = 0
}

class FakeContext {
  state = 'running'
  currentTime = 0
  sampleRate = 48_000
  resumed = 0
  readonly notes: Note[] = []
  /** Safari refuses to come back outside a touch; the fake can do the same. */
  grantResume = true

  resume(): Promise<void> {
    this.resumed += 1
    if (!this.grantResume) return Promise.reject(new Error('refused'))
    this.state = 'running'
    return Promise.resolve()
  }
  createOscillator() {
    const note: Note = { start: -1, stop: -1 }
    return {
      type: 'square', frequency: new FakeParam(),
      connect: (next: unknown) => next,
      start: (t: number) => { note.start = t; this.notes.push(note) },
      stop: (t: number) => { note.stop = t },
    }
  }
  createGain() { return { gain: new FakeParam(), connect: (next: unknown) => next } }
  createBiquadFilter() { return { type: '', Q: new FakeParam(), frequency: new FakeParam(), connect: (next: unknown) => next } }
  createDynamicsCompressor() { return { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam(), connect: (next: unknown) => next } }
  createStereoPanner() { return { pan: new FakeParam(), connect: (next: unknown) => next } }
  createBuffer(_channels: number, length: number) { return { sampleRate: this.sampleRate, length, getChannelData: () => new Float32Array(length) } }
  createBufferSource() {
    const note: Note = { start: -1, stop: -1 }
    return {
      buffer: null as unknown,
      connect: (next: unknown) => next,
      start: (t: number) => { note.start = t; this.notes.push(note) },
      stop: (t: number) => { note.stop = t },
    }
  }
}

const listeners: Array<() => void> = []
const context = new FakeContext()
/** How many times the page asked the browser for an engine. */
let births = 0

// The module only reads the browser when a sound is asked for, so putting the
// stand-ins here, after the import, is early enough.
;(globalThis as unknown as { window: unknown }).window = { AudioContext: function () { births += 1; return context } }
Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { isActive: true } }, configurable: true })
;(globalThis as unknown as { document: unknown }).document = {
  visibilityState: 'visible',
  addEventListener: (_name: string, handler: () => void) => listeners.push(handler),
}



test('sans toucher, aucun moteur n_est créé et rien ne sonne', () => {
  // Safari leaves an engine born outside a touch deaf for the rest of the visit,
  // so the page must not create one just because a draw came up on its own.
  context.notes.length = 0
  sound.playRandom(0)
  sound.playAgain(0)
  assert.equal(births, 0, 'aucun moteur demandé au navigateur')
  assert.equal(context.notes.length, 0)
})

test('son coupé, le toucher ne crée pas de moteur : la vidéo garde le son de l_appareil', () => {
  // Creating an engine takes the device's audio session on iOS, and a page whose
  // sound is off has no business taking it from the video.
  sound.setMuted(true)
  sound.wakeSound()
  assert.equal(births, 0)
  sound.setMuted(false)
})

test('le toucher crée le moteur, et le son se joue', () => {
  sound.wakeSound()
  assert.equal(births, 1, 'le moteur naît au toucher')
  context.notes.length = 0
  sound.playRandom(0)
  assert.ok(context.notes.length > 0, 'des notes sont écrites')
})

test('interrompu par une vidéo, le moteur est réveillé et le son suivant revient', () => {
  // What an iPad does the moment a video takes the device's audio session.
  context.state = 'interrupted'
  context.notes.length = 0
  const before = context.resumed

  sound.playRandom(0)
  assert.equal(context.notes.length, 0, 'rien n_est écrit sur une horloge arrêtée')
  assert.ok(context.resumed > before, 'le moteur est réveillé')
  assert.equal(context.state, 'running', 'il est revenu')

  sound.playRandom(0)
  assert.ok(context.notes.length > 0, 'le tirage suivant sonne')
  assert.equal(births, 1, 'toujours le même moteur')
})

test('le réveil au toucher agit avant que le son soit dû', () => {
  context.state = 'interrupted'
  const before = context.resumed
  sound.wakeSound()
  assert.ok(context.resumed > before)
  assert.equal(context.state, 'running')
  sound.wakeSound()
  assert.equal(context.resumed, before + 1, 'un moteur qui tourne n_est pas réveillé pour rien')
})

test('un refus de Safari ne fait pas de bruit et ne casse rien', () => {
  context.state = 'interrupted'
  context.grantResume = false
  context.notes.length = 0
  assert.doesNotThrow(() => sound.playRandom(1.4))
  assert.doesNotThrow(() => sound.playAgain(0.5))
  assert.doesNotThrow(() => sound.wakeSound())
  assert.equal(context.notes.length, 0)
  context.grantResume = true
  context.state = 'running'
})

test('coupé, le moteur reste muet même réveillé', () => {
  sound.setMuted(true)
  context.notes.length = 0
  sound.playRandom(0)
  assert.equal(context.notes.length, 0)
  sound.setMuted(false)
})
