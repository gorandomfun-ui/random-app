import test from 'node:test'
import assert from 'node:assert/strict'

import { trackNameOf, trackPathFor, trackPathOk, trackTypeOf } from '@/lib/comm/tracks'

const NOW = 1760800000000

test('a dropped file gets a slug and the moment under the tracks folder, by its type or its extension', () => {
  assert.equal(trackPathFor({ name: 'Glitch Beat (Loop) #2.mp3', type: 'audio/mpeg' }, NOW), `promo/tracks/glitch-beat-loop-2-${NOW.toString(36)}.mp3`)
  assert.equal(trackPathFor({ name: 'Été à Paris.M4A', type: '' }, NOW), `promo/tracks/ete-a-paris-${NOW.toString(36)}.m4a`)
  assert.equal(trackPathFor({ name: 'x.wav', type: 'audio/x-wav' }, NOW), `promo/tracks/x-${NOW.toString(36)}.wav`)
  assert.equal(trackPathFor({ name: 'notes.txt', type: 'text/plain' }, NOW), null)
  assert.ok(trackPathOk(trackPathFor({ name: 'Été à Paris.M4A', type: '' }, NOW)!))
})

test('only the tracks folder, a slug and a known extension pass', () => {
  assert.ok(trackPathOk('promo/tracks/a-b.mp3'))
  assert.ok(!trackPathOk('comm/x/a.mp3'))
  assert.ok(!trackPathOk('promo/tracks/../a.mp3'))
  assert.ok(!trackPathOk('promo/tracks/sub/a.mp3'))
  assert.ok(!trackPathOk('promo/tracks/a.exe'))
})

test('the name shown is the slug with spaces, without the token; the stored type follows the extension', () => {
  assert.equal(trackNameOf(`promo/tracks/glitch-beat-2-${NOW.toString(36)}.mp3`), 'glitch beat 2')
  assert.equal(trackNameOf('promo/tracks/glitch-beat-2.mp3'), 'glitch beat 2')
  assert.equal(trackTypeOf('promo/tracks/x.m4a'), 'audio/mp4')
  assert.equal(trackTypeOf('promo/tracks/x.flac'), 'audio/flac')
})
