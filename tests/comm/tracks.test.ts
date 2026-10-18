import test from 'node:test'
import assert from 'node:assert/strict'

import { trackNameOf, trackPathFor, trackPathOk, trackTypeOf } from '@/lib/comm/tracks'

test('a dropped file gets a slug under the tracks folder, by its type or its extension', () => {
  assert.equal(trackPathFor({ name: 'Glitch Beat (Loop) #2.mp3', type: 'audio/mpeg' }), 'promo/tracks/glitch-beat-loop-2.mp3')
  assert.equal(trackPathFor({ name: 'Été à Paris.M4A', type: '' }), 'promo/tracks/ete-a-paris.m4a')
  assert.equal(trackPathFor({ name: 'x.wav', type: 'audio/x-wav' }), 'promo/tracks/x.wav')
  assert.equal(trackPathFor({ name: 'notes.txt', type: 'text/plain' }), null)
})

test('only the tracks folder, a slug and a known extension pass', () => {
  assert.ok(trackPathOk('promo/tracks/a-b.mp3'))
  assert.ok(!trackPathOk('comm/x/a.mp3'))
  assert.ok(!trackPathOk('promo/tracks/../a.mp3'))
  assert.ok(!trackPathOk('promo/tracks/sub/a.mp3'))
  assert.ok(!trackPathOk('promo/tracks/a.exe'))
})

test('the name shown is the slug with spaces; the stored type follows the extension', () => {
  assert.equal(trackNameOf('promo/tracks/glitch-beat-2.mp3'), 'glitch beat 2')
  assert.equal(trackTypeOf('promo/tracks/x.m4a'), 'audio/mp4')
  assert.equal(trackTypeOf('promo/tracks/x.flac'), 'audio/flac')
})
