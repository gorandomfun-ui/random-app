/**
 * RANDOM FIGHTER, a first proposal of its screens: the title, a moment of
 * play at every level (in its place: the street, the dojo, the kitchen), GAME
 * OVER and WINNER, wide and tall, at their sizes and drawn (not left black);
 * the fighter in every pose and every burger drawn; FIGHTER's lettering read.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { drawFighter, drawFoe, FIGHTER_BOX, FOE_BOX } from '@/lib/games/fighter-figures'
import { FIGHTER_PLAY, FIGHTER_SCREEN, fighterPlace, fighterWordHeight, renderFighterOver, renderFighterPlay, renderFighterTitle, renderFighterWinner } from '@/lib/games/fighter'
import { PixelBuffer } from '@/lib/games/pixels'

const drawn = (b: PixelBuffer) => b.countNot('#000000') > b.width * b.height * 0.9

test('fighter: the title, every level\'s moment of play and the two ends, wide and tall, at their sizes, drawn', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    for (const b of [renderFighterTitle(layout, '#D90845'), renderFighterOver(layout, '#D90845', { score: 10, best: 20 }), renderFighterWinner(layout, '#D90845', { score: 10, best: 20 })]) {
      assert.deepEqual([b.width, b.height], [FIGHTER_SCREEN[layout].width, FIGHTER_SCREEN[layout].height])
      assert.ok(drawn(b), `${layout}: drawn`)
    }
    for (let level = 1; level <= 16; level += 1) {
      const b = renderFighterPlay(layout, '#12c45c', { level, frame: level })
      assert.deepEqual([b.width, b.height], [FIGHTER_PLAY[layout].width, FIGHTER_PLAY[layout].height])
      assert.ok(drawn(b), `${layout} ${level}: drawn`)
    }
  }
  assert.deepEqual([1, 5, 6, 11, 12, 16].map(fighterPlace), ['street', 'street', 'dojo', 'dojo', 'kitchen', 'kitchen'])
  assert.ok(fighterWordHeight('fighter', 500) > 80, 'FIGHTER read from its lettering')
})

test('fighter: the fighter in every pose, every burger, each inside its box', () => {
  for (const pose of ['guard', 'punch', 'kick', 'step', 'hit'] as const) {
    const b = new PixelBuffer(Math.ceil(FIGHTER_BOX.width * 1.5), Math.ceil(FIGHTER_BOX.height * 1.5), '#000000')
    drawFighter(b, 0, 0, 1.5, pose, 0, '#D90845')
    assert.ok(b.countNot('#000000') > 1500, `${pose}: drawn`)
  }
  for (const kind of ['ninja', 'samurai', 'mini'] as const) {
    const b = new PixelBuffer(Math.ceil(FOE_BOX[kind].width * 1.5), Math.ceil(FOE_BOX[kind].height * 1.5), '#000000')
    drawFoe(b, 0, 0, 1.5, kind, 0, true)
    assert.ok(b.countNot('#000000') > 300, `${kind}: drawn`)
  }
})
