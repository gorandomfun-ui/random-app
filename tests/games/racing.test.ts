/**
 * RANDOM RACING's proposal: the title and a moment of play, wide and tall,
 * at their sizes, with the traced pictures handed over as the browser would
 * have them; every traced picture there, the cars' clear around them.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { PixelBuffer } from '@/lib/games/pixels'
import { renderRacingPlay, renderRacingTitle } from '@/lib/games/racing'
import { CAR_SIZES, provideRacingArt, racingArtFile, type RacingArtName } from '@/lib/games/racing-art'
import { decodePng } from '../../scripts/games/png'

const NAMES: RacingArtName[] = ['titleWide', 'titleTall', 'playBack', 'palm', 'chevron', ...(['rosso', 'burger', 'giallo'] as const).flatMap((k) => CAR_SIZES.map((s) => `car-${k}-${s}` as RacingArtName))]
const pictures = new Map<RacingArtName, PixelBuffer>()
for (const name of NAMES) {
  const png = decodePng(readFileSync(join(process.cwd(), 'public/games/racing', racingArtFile(name))))
  const buffer = new PixelBuffer(png.width, png.height)
  buffer.data.set(png.rgba)
  pictures.set(name, buffer)
  provideRacingArt(name, buffer)
}

test('racing: every traced picture is there, the titles at their sizes, the cars clear around them', () => {
  assert.deepEqual([pictures.get('titleWide')!.width, pictures.get('titleWide')!.height], [768, 432])
  assert.deepEqual([pictures.get('titleTall')!.width, pictures.get('titleTall')!.height], [432, 768])
  for (const kind of ['rosso', 'burger', 'giallo']) {
    const pic = pictures.get(`car-${kind}-104` as RacingArtName)!
    // the corners are road, cut away
    assert.equal(pic.data[3], 0, `${kind}: its top left clear`)
    let solid = 0
    for (let i = 3; i < pic.data.length; i += 4) if (pic.data[i] > 128) solid += 1
    assert.ok(solid > pic.width * pic.height * 0.5, `${kind}: mostly car`)
  }
})

test('racing: the title and a moment of play, wide and tall', () => {
  for (const [layout, w, h] of [['landscape', 768, 432], ['portrait', 432, 768]] as const) {
    const b = renderRacingTitle(layout, '#0FC55D', 'sans', { frame: 3 })
    assert.equal(b.width, w); assert.equal(b.height, h)
    assert.ok(b.countNot('#1a0c34') > w * h * 0.95, `${layout}: the title drawn all over`)
  }
  // the tall board with its controls under it, the wide one without
  for (const [layout, w, h] of [['landscape', 448, 344], ['portrait', 320, 568]] as const) {
    const b = renderRacingPlay(layout, '#0FC55D', { frame: 3 })
    assert.equal(b.width, w); assert.equal(b.height, h)
    assert.ok(b.countNot('#0a0a14') > w * h * 0.8, `${layout}: the play drawn`)
  }
})
