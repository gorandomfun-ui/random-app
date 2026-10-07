/**
 * RANDOM RACING: the traced pictures all there; the title (with the car
 * chosen), the race, GAME OVER and WINNER drawn at their sizes, wide and
 * tall; the rules — the lights, the same race from the same seed and moves,
 * the rails and the rivals that knock, the clock that ends it, the levels one
 * after another; every level won by a good driver with time to spare, the
 * first ones by a casual one, none by a driver who never presses the gas;
 * the controls under a finger; the car chosen by a tap.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { PixelBuffer } from '@/lib/games/pixels'
import { maxScore } from '@/lib/games/plausible'
import { nextCar, racingCarAt, racingPadGeometry, racingPadPart, renderRacingGame, renderRacingOver, renderRacingPlay, renderRacingTitle, renderRacingWinner } from '@/lib/games/racing'
import { CAR_SIZES, provideRacingArt, racingArtFile, type RacingArtName } from '@/lib/games/racing-art'
import { createRacing, RACING_CARS, RACING_LAST_LEVEL, RACING_START_STEPS, racingLevelMax, racingTime, rivalsOf, stepRacing } from '@/lib/games/racing-rules'
import { decodePng } from '../../scripts/games/png'
import { CASUAL, GOOD, race } from './racing-robot'

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

test('racing: the title with each car, GAME OVER and WINNER, wide and tall', () => {
  for (const [layout, w, h] of [['landscape', 768, 432], ['portrait', 432, 768]] as const) {
    const marked = RACING_CARS.map((car) => renderRacingTitle(layout, '#0FC55D', 'sans', { frame: 3, car }))
    for (const b of marked) { assert.equal(b.width, w); assert.equal(b.height, h); assert.ok(b.countNot('#1a0c34') > w * h * 0.95, `${layout}: the title drawn all over`) }
    // the mark moves with the choice
    assert.notDeepEqual(marked[0].data, marked[2].data)
    for (const b of [renderRacingOver(layout, '#0FC55D', { score: 1200, best: 3000 }), renderRacingWinner(layout, '#0FC55D', { score: 41000, best: 41000 })]) { assert.equal(b.width, w); assert.equal(b.height, h) }
  }
})

test('racing: the race drawn, the tall board with its controls under it, the wide one without', () => {
  for (const [layout, w, h] of [['landscape', 448, 344], ['portrait', 320, 568]] as const) {
    const b = renderRacingPlay(layout, '#0FC55D', { frame: 3 })
    assert.equal(b.width, w); assert.equal(b.height, h)
    assert.ok(b.countNot('#0a0a14') > w * h * 0.8, `${layout}: the play drawn`)
  }
  // a tablet on its side: the controls beside the board
  const s = createRacing('landscape', 1, 1)
  const side = renderRacingGame(s, '#0FC55D', { pad: 'side' })
  assert.equal(side.width, 448 + 150)
})

test('racing: three red lights a second apart, then green; nothing moves before', () => {
  const s = createRacing('landscape', 1, 1)
  const heard: string[] = []
  for (let i = 0; i < RACING_START_STEPS; i += 1) { stepRacing(s, 1, true, false); heard.push(...s.heard) }
  assert.deepEqual(heard, ['beep', 'beep', 'beep', 'go'])
  assert.equal(s.phase, 'play')
  assert.equal(s.z, 0)
  assert.equal(s.speed, 0)
  assert.ok(s.rivals.every((r) => r.z === 0), 'the rivals wait too')
})

test('racing: the same seed and moves, the same race', () => {
  const play = () => {
    const s = createRacing('landscape', 5, 42, { car: 'giallo' })
    for (let i = 0; i < 2400; i += 1) stepRacing(s, i % 160 < 60 ? 1 : i % 160 < 120 ? -1 : 0, i % 50 < 40, i % 400 > 380)
    return JSON.stringify({ z: s.z, x: s.x, speed: s.speed, score: s.score, time: s.time, rivals: s.rivals.map((r) => [r.z, r.x]) })
  }
  assert.equal(play(), play())
})

test('racing: the rivals are the two cars not chosen', () => {
  for (const car of RACING_CARS) {
    const s = createRacing('portrait', 1, 1, { car })
    assert.deepEqual(s.rivals.map((r) => r.kind).sort(), rivalsOf(car).slice().sort())
    assert.ok(!s.rivals.some((r) => r.kind === car))
  }
})

test('racing: the rails stop the car with a knock; off the road it slows', () => {
  const s = createRacing('landscape', 1, 1)
  for (let i = 0; i < RACING_START_STEPS + 400; i += 1) stepRacing(s, 0, true)
  const fast = s.speed
  let knocked = false, slowest = fast
  for (let i = 0; i < 200; i += 1) { stepRacing(s, 1, true); knocked ||= s.heard.includes('thud'); slowest = Math.min(slowest, s.speed) }
  assert.ok(knocked, 'a knock on the rail')
  assert.ok(slowest < fast * 0.6, 'the car slowed')
  assert.ok(Math.abs(s.x) < 1.7, 'held inside the rails')
})

test('racing: the clock at zero, TIME UP, then over', () => {
  const s = createRacing('landscape', 1, 1)
  const steps = (racingTime(1) + 10) * 60 + RACING_START_STEPS
  for (let i = 0; i < steps && s.phase !== 'over'; i += 1) stepRacing(s, 0, false)
  assert.equal(s.phase, 'over')
  assert.equal(s.time, 0)
})

test('racing: a good driver wins every level with time to spare, and the first ones in first place', () => {
  for (let level = 1; level <= RACING_LAST_LEVEL; level += 1) {
    const out = race(createRacing('landscape', level, 3, { single: true }), GOOD, 3)
    assert.ok(out.won, `level ${level} won`)
    assert.ok(out.timeLeft >= 3, `level ${level}: ${out.timeLeft.toFixed(1)} s left`)
    if (level <= 8) assert.equal(out.place, 1, `level ${level}: first`)
    assert.ok(out.score <= racingLevelMax(level), `level ${level}: score within its most`)
  }
})

test('racing: a casual driver wins the first levels, with time to spare at the first', () => {
  for (let level = 1; level <= 6; level += 1) {
    const out = race(createRacing('portrait', level, 9, { single: true }), CASUAL, 9)
    assert.ok(out.won, `level ${level} won`)
    if (level === 1) assert.ok(out.timeLeft >= 6, `${out.timeLeft.toFixed(1)} s left`)
  }
})

test('racing: a whole game goes on from level to level, the score carried', () => {
  const s = createRacing('landscape', 1, 3)
  const first = race(s, GOOD, 3)
  assert.ok(first.won)
  assert.equal(s.passed, 1)
  assert.equal(s.level, 2)
  assert.equal(s.phase, 'start')
  assert.ok(s.score > 0)
  assert.ok(s.score <= maxScore('racing', 1))
})

test('racing: the controls under a finger, on every kind of board', () => {
  for (const [layout, pad] of [['portrait', 'band'], ['portrait', 'big'], ['landscape', 'band'], ['landscape', 'side']] as const) {
    const g = racingPadGeometry(layout, pad)!
    assert.equal(racingPadPart(g.left.x + g.left.w / 2, g.left.y + g.left.h / 2, g), 'left', `${layout} ${pad}`)
    assert.equal(racingPadPart(g.right.x + g.right.w / 2, g.right.y + g.right.h / 2, g), 'right', `${layout} ${pad}`)
    assert.equal(racingPadPart(g.gas.cx, g.gas.cy, g), 'gas', `${layout} ${pad}`)
    assert.equal(racingPadPart(g.brake.cx, g.brake.cy, g), 'brake', `${layout} ${pad}`)
    assert.equal(racingPadPart(g.zone.x + 1, g.zone.y - 4, g), null, 'over the board, nothing')
    // no button over another, all inside their band
    const discs = [g.gas, g.brake]
    assert.ok(Math.hypot(g.gas.cx - g.brake.cx, g.gas.cy - g.brake.cy) > g.gas.r + g.brake.r, `${layout} ${pad}: A and B apart`)
    for (const d of discs) for (const box of [g.left, g.right]) {
      const nx = Math.max(box.x, Math.min(d.cx, box.x + box.w)), ny = Math.max(box.y, Math.min(d.cy, box.y + box.h))
      assert.ok(Math.hypot(d.cx - nx, d.cy - ny) > d.r, `${layout} ${pad}: a round button clear of the arrows`)
      assert.ok(d.cx - d.r >= g.zone.x && d.cx + d.r <= g.zone.x + g.zone.w && d.cy - d.r >= g.zone.y && d.cy + d.r <= g.zone.y + g.zone.h, `${layout} ${pad}: inside the band`)
    }
    assert.ok(g.right.x >= g.left.x + g.left.w, `${layout} ${pad}: the arrows apart`)
  }
  assert.equal(racingPadGeometry('landscape', 'none'), null)
})

test('racing: a tap on a car on the title chooses it; left and right stop at the ends', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    const centres: Record<string, [number, number]> = layout === 'landscape' ? { rosso: [170, 340], burger: [385, 320], giallo: [600, 340] } : { rosso: [77, 612], burger: [216, 600], giallo: [358, 612] }
    for (const [car, [x, y]] of Object.entries(centres)) assert.equal(racingCarAt(layout, x, y), car, `${layout} ${car}`)
    assert.equal(racingCarAt(layout, 384, 60), null, 'the sky chooses nothing')
  }
  assert.equal(nextCar('rosso', -1), 'rosso')
  assert.equal(nextCar('rosso', 1), 'burger')
  assert.equal(nextCar('giallo', 1), 'giallo')
})

test('racing: the rules never touch the page\'s own random', () => {
  const real = Math.random
  Math.random = () => { throw new Error('Math.random') }
  try {
    const s = createRacing('landscape', 7, 5)
    for (let i = 0; i < 3000; i += 1) stepRacing(s, i % 90 < 45 ? 1 : -1, true)
  } finally { Math.random = real }
})
