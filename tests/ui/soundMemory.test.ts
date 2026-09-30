import test from 'node:test'
import assert from 'node:assert/strict'

import * as files from '@/lib/sound/files'

/**
 * The sound files fetched once as the page opens: the players made afterwards
 * read them from memory, so the first Wave has nothing left to download when
 * its sound is due.
 */

const fetched: string[] = []
class FakeAudio {
  muted = false
  paused = true
  ended = false
  currentTime = 0
  preload = ''
  volume = 1
  constructor(readonly src = '') {}
  play() { this.paused = false; return new Promise<void>(() => undefined) }
  pause() { this.paused = true }
  addEventListener() {}
  removeEventListener() {}
}

;(globalThis as unknown as { window: unknown }).window = {}
;(globalThis as unknown as { Audio: unknown }).Audio = FakeAudio
;(globalThis as unknown as { document: unknown }).document = { hidden: false, visibilityState: 'visible', addEventListener: () => undefined }
;(globalThis as unknown as { fetch: unknown }).fetch = (src: string) => {
  fetched.push(src)
  return Promise.resolve({ ok: true, blob: () => Promise.resolve({ src }) })
}
URL.createObjectURL = ((blob: unknown) => `blob:${(blob as { src: string }).src}`) as typeof URL.createObjectURL

test('chaque son est téléchargé une seule fois, et les lecteurs le lisent en mémoire', async () => {
  const made: FakeAudio[] = []
  ;(globalThis as unknown as { Audio: unknown }).Audio = class extends FakeAudio { constructor(src = '') { super(src); made.push(this) } }
  files.fetchSoundFiles()
  files.fetchSoundFiles()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(fetched.length, new Set(fetched).size, 'une fois chacun')
  assert.ok(fetched.includes('/sounds/wave-enter.wav'))
  assert.equal(fetched.length, 8, fetched.join(' '))

  files.playSoundFile('wave-enter')
  assert.ok(made.length > 0)
  assert.ok(made.every((audio) => audio.src === 'blob:/sounds/wave-enter.wav'), made.map((a) => a.src).join(' '))
})
