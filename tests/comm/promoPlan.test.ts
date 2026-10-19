import test from 'node:test'
import assert from 'node:assert/strict'

import { planShots, type ShotKind } from '@/lib/comm/promoLoop'

const base = { seconds: 10, intensity: 0.6, seed: 4242, brandMode: 'center' as const, subjects: ['block', 'wordmark'] as Array<'block' | 'wordmark' | 'icon'>, recognition: 0.3, text: null }

test('no moment allowed gives a soft film: calms and hints, cards, never a burst', () => {
  const { shots } = planShots({ ...base, shots: [] as ShotKind[], text: { lines: ['UN', 'DEUX'], size: 90, align: 'left', font: 'x', weight: 700, x: null, y: null, width: 0.88 } }, 2, 3, 4)
  assert.ok(shots.length > 3)
  assert.ok(shots.every((s) => s.phase !== 'burst' && s.phase !== 'settle'), shots.map((s) => s.phase).join(','))
  assert.ok(shots.some((s) => s.phase === 'calm'))
  assert.equal(shots.filter((s) => s.phase === 'card').length, 2)
  assert.equal(shots[shots.length - 1].to, 10000)
})

test('one moment allowed gives bursts of that kind only', () => {
  const { shots } = planShots({ ...base, shots: ['ecto'] as ShotKind[] }, 2, 3, 4)
  const bursts = shots.filter((s) => s.phase === 'burst')
  assert.ok(bursts.length >= 2)
  assert.ok(bursts.every((s) => s.kind === 'ecto'))
})

test('the close on the brand block is there by default, on a bumper too, and gone when the curator ends on the last cycle', () => {
  const closing = (s: ReturnType<typeof planShots>['shots'][number]) => s.phase === 'calm' && s.subject === 'block' && s.pill && s.bw === 0.68
  const on = planShots({ ...base, shots: ['blocks'] as ShotKind[] }, 2, 3, 4).shots
  assert.ok(closing(on[on.length - 1]) && on[on.length - 1].to - on[on.length - 1].from >= 900)
  const bumper = planShots({ ...base, seconds: 3, shots: ['blocks'] as ShotKind[] }, 2, 3, 4).shots
  assert.ok(closing(bumper[bumper.length - 1]))
  const off = planShots({ ...base, shots: ['blocks'] as ShotKind[], ending: false }, 2, 3, 4).shots
  assert.ok(!closing(off[off.length - 1]))
  assert.equal(off[off.length - 1].to, 10000)
})

test('the Fond needs a picture or a video: alone without sources it gives way to the others', () => {
  const { shots } = planShots({ ...base, shots: ['back'] as ShotKind[] }, 0, 0, 4)
  assert.ok(shots.filter((s) => s.phase === 'burst').every((s) => s.kind !== 'back'))
})
