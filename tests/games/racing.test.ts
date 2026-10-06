/**
 * RANDOM RACING's proposal: the title and a moment of play, wide and tall,
 * at their sizes and drawn all over; each of the three cars drawn, at two
 * sizes.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { PixelBuffer } from '@/lib/games/pixels'
import { renderRacingPlay, renderRacingTitle } from '@/lib/games/racing'
import { CAR_BOX, CARS, drawCarRear } from '@/lib/games/racing-cars'

test('racing: the title and a moment of play, wide and tall', () => {
  for (const [layout, w, h] of [['landscape', 768, 432], ['portrait', 432, 768]] as const) {
    const b = renderRacingTitle(layout, '#0FC55D', 'sans', { frame: 3 })
    assert.equal(b.width, w); assert.equal(b.height, h)
    assert.ok(b.countNot('#0a0a14') > w * h * 0.95, `${layout}: the title drawn all over`)
  }
  // the tall board with its controls under it, the wide one without
  for (const [layout, w, h] of [['landscape', 448, 344], ['portrait', 320, 568]] as const) {
    const b = renderRacingPlay(layout, '#0FC55D', { frame: 3 })
    assert.equal(b.width, w); assert.equal(b.height, h)
    assert.ok(b.countNot('#0a0a14') > w * h * 0.8, `${layout}: the play drawn`)
  }
})

test('racing: the three cars, small and large', () => {
  for (const kind of CARS) for (const scale of [0.5, 1.2]) {
    const b = new PixelBuffer(Math.ceil(CAR_BOX.w * scale) + 4, Math.ceil(CAR_BOX.h * scale) + 4, '#ff00ff')
    drawCarRear(b, kind, 2, 2, scale, 0)
    assert.ok(b.countNot('#ff00ff') > b.width * b.height * 0.4, `${kind} at ${scale}`)
  }
})
