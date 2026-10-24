/**
 * RANDOM FIGHTER's screens, after the owner's two pictures: the title, a
 * moment of play at every level (in its place: the street, the dojo, the
 * kitchen), GAME OVER and WINNER, wide and tall, at their sizes and drawn
 * (not left black); the traced titles and the cut-out fighters there, at the
 * sizes their data gives, their outsides clear; FIGHTER's lettering read.
 */

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { FIGHTER_PLAY, FIGHTER_SCREEN, fighterPlace, fighterWordHeight, renderFighterOver, renderFighterPlay, renderFighterTitle, renderFighterWinner } from '@/lib/games/fighter'
import { fighterArt, fighterArtFile, provideFighterArt, type FighterArtName } from '@/lib/games/fighter-art'
import { FIGHTER_SPRITES, type FighterSprite } from '@/lib/games/fighter-art-data'
import { PixelBuffer } from '@/lib/games/pixels'
import { decodePng } from '../../scripts/games/png'

const drawn = (b: PixelBuffer) => b.countNot('#000000') > b.width * b.height * 0.9
const names: FighterArtName[] = ['titleWide', 'titleTall', 'play-dusk-wide', 'play-dusk-tall', 'play-night-wide', 'play-night-tall', ...(Object.keys(FIGHTER_SPRITES) as FighterSprite[])]
for (const name of names) {
  const png = decodePng(readFileSync(join(process.cwd(), 'public/games/fighter', fighterArtFile(name))))
  const buffer = new PixelBuffer(png.width, png.height)
  buffer.data.set(png.rgba)
  provideFighterArt(name, buffer)
}

test('fighter: the traced titles at the title\'s sizes; each fighter cut out at its size, clear round it', () => {
  assert.deepEqual([fighterArt('titleWide')!.width, fighterArt('titleWide')!.height], [768, 432])
  assert.deepEqual([fighterArt('titleTall')!.width, fighterArt('titleTall')!.height], [432, 768])
  for (const name of Object.keys(FIGHTER_SPRITES) as FighterSprite[]) {
    const art = fighterArt(name)!
    assert.deepEqual([art.width, art.height], [FIGHTER_SPRITES[name].width, FIGHTER_SPRITES[name].height], name)
    let clear = 0, solid = 0
    for (let i = 3; i < art.data.length; i += 4) if (art.data[i] < 128) clear += 1; else solid += 1
    assert.ok(clear > 0 && solid > art.width * art.height * 0.2, `${name}: cut out`)
    // its corners clear: the background is gone
    assert.ok(art.data[3] < 128 && art.data[(art.width - 1) * 4 + 3] < 128, `${name}: clear at its top corners`)
  }
})

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
  assert.deepEqual([1, 8, 9, 16].map(fighterPlace), ['dusk', 'dusk', 'night', 'night'])
  for (const layout of ['landscape', 'portrait'] as const) { const back = fighterArt(`play-dusk-${layout === 'landscape' ? 'wide' : 'tall'}`)!; assert.deepEqual([back.width, back.height], [FIGHTER_PLAY[layout].width, FIGHTER_PLAY[layout].stage]) }
  assert.ok(fighterWordHeight('fighter', 500) > 80, 'FIGHTER read from its lettering')
})
