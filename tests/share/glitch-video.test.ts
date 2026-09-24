import test from 'node:test'
import assert from 'node:assert/strict'

import { BURSTS, burstIntensity, fileNameFor, pickMimeType, STORY_VIDEO } from '@/lib/share/glitchVideo'

test('trois secondes : un début propre, trois coups de glitch, une fin propre', () => {
  assert.equal(STORY_VIDEO.seconds, 3)
  assert.equal(BURSTS.length, 3)
  assert.equal(burstIntensity(0), 0, 'la carte est propre au départ')
  assert.equal(burstIntensity(2.9), 0, 'et à la fin')
  for (const [start, end] of BURSTS) {
    const middle = (start + end) / 2
    assert.ok(burstIntensity(middle) > 0.95, `plein au milieu du coup ${start}-${end}`)
    assert.ok(burstIntensity(start) >= 0.3 && burstIntensity(start) < 0.5, 'plus doux au bord')
    assert.equal(burstIntensity(end), 0, 'fini à la fin du coup')
  }
  assert.ok(BURSTS.every(([start, end]) => end - start <= 0.3 + 1e-9), 'des coups courts, la carte reste lisible')
})

test('le format d_enregistrement : MP4 quand le navigateur le fait, sinon WebM, sinon rien', () => {
  assert.equal(pickMimeType((type) => type === 'video/mp4'), 'video/mp4')
  assert.equal(pickMimeType((type) => type.startsWith('video/webm')), 'video/webm;codecs=vp9')
  assert.equal(pickMimeType(() => false), null)
  assert.equal(pickMimeType(() => { throw new Error('unknown type') }), null, 'un navigateur qui lève ne casse rien')
  assert.equal(fileNameFor('video/mp4;codecs=avc1'), 'gorandom-story.mp4')
  assert.equal(fileNameFor('video/webm;codecs=vp9'), 'gorandom-story.webm')
})
