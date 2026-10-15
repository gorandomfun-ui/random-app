import test from 'node:test'
import assert from 'node:assert/strict'

import { bandOf, clampTrim, cropRect, expectedSeconds, filmstripTimes, recorderChoice } from '@/lib/comm/montage'
import { seedTemplates } from '@/lib/comm/templates'

test('encadré : la vidéo entière, centrée dans la bande, avec ses barres', () => {
  const rect = cropRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { top: 0.2, height: 0.6 }, 'framed')
  assert.deepEqual(rect, { x: 0, y: 384 + Math.round((1152 - 608) / 2), w: 1080, h: 608 })
  const vertical = cropRect({ width: 1080, height: 1920 }, { width: 1080, height: 1920 }, { top: 0, height: 1 }, 'framed')
  assert.deepEqual(vertical, { x: 0, y: 0, w: 1080, h: 1920 })
})

test('recentré : la vidéo couvre la bande, et le décalage choisit la partie visible, borné', () => {
  const centre = cropRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { top: 0, height: 1 }, 'centered')
  assert.equal(centre.h, 1920); assert.equal(centre.w, 3413); assert.equal(centre.x, Math.round((1080 - 3413) / 2)); assert.equal(centre.y, 0)
  const left = cropRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { top: 0, height: 1 }, 'centered', { x: -1, y: 0 })
  assert.equal(left.x, 0, 'tout à gauche : le bord gauche de la vidéo')
  const right = cropRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { top: 0, height: 1 }, 'centered', { x: 5, y: 0 })
  assert.equal(right.x, 1080 - 3413, 'tout à droite, même avec un décalage trop grand')
  const none = cropRect({ width: 0, height: 0 }, { width: 1080, height: 1350 }, { top: 0.18, height: 0.62 }, 'centered')
  assert.deepEqual(none, { x: 0, y: 243, w: 1080, h: 837 })
})

test('la bande vient de la couche media du gabarit', () => {
  const framed = seedTemplates().find((t) => t.key === 'story-encadre')!
  assert.deepEqual(bandOf(framed.layers), { top: 0.2, height: 0.6 })
  const full = seedTemplates().find((t) => t.key === 'story-plein')!
  assert.deepEqual(bandOf(full.layers), { top: 0, height: 1 })
})

test('la frise et la découpe restent dans le clip et sous le plafond', () => {
  const times = filmstripTimes(30, 6)
  assert.deepEqual(times, [2.5, 7.5, 12.5, 17.5, 22.5, 27.5])
  assert.deepEqual(filmstripTimes(0), [])
  assert.deepEqual(clampTrim(5, 20, 30, 60), { startSec: 5, endSec: 20 })
  assert.deepEqual(clampTrim(5, 200, 30, 60), { startSec: 5, endSec: 30 })
  assert.deepEqual(clampTrim(0, 90, 120, 60), { startSec: 0, endSec: 60 })
  assert.deepEqual(clampTrim(10, 10.1, 30, 60), { startSec: 10, endSec: 10.5 })
  assert.deepEqual(clampTrim(-3, 2, 30, 60), { startSec: 0, endSec: 2 })
  assert.equal(expectedSeconds(5, 20), 17)
})

test('le format d_enregistrement : mp4 natif quand le navigateur l_offre, sinon WebM', () => {
  assert.deepEqual(recorderChoice((t) => t.startsWith('video/mp4')), { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4' })
  assert.deepEqual(recorderChoice((t) => t === 'video/webm'), { mimeType: 'video/webm', extension: 'webm' })
  assert.equal(recorderChoice(() => false), null)
})
