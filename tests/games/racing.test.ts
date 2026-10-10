/**
 * RANDOM RACING: the traced pictures all there, each car straight (even
 * left and right) and turning; the title (with the car chosen), the race at
 * every hour in each of the four worlds, GAME OVER and WINNER drawn at their
 * sizes, wide and tall; the fireworks and the confetti past the line,
 * thicker as the levels go; the rules — the lights, the same race from the
 * same seed and moves, the worlds drawn at random for each game, the road's
 * kinds and bends growing with the levels, each world's own things and
 * shops, the stopwatches, the turbo, the puddles, the cones, the
 * checkpoints, the rails and the cars that knock, the clock that ends it,
 * the levels one after another; every level of every world won by a good
 * driver with time to spare, the first ones by a casual one; the controls
 * under a finger; the car chosen by a tap.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { PixelBuffer } from '@/lib/games/pixels'
import { maxScore } from '@/lib/games/plausible'
import { nextCar, racingCarAt, racingPadGeometry, racingPadPart, renderRacingGame, renderRacingOver, renderRacingPlay, renderRacingTitle, renderRacingWinner } from '@/lib/games/racing'
import { CAR_SIZES, provideRacingArt, racingArtFile, type RacingArtName } from '@/lib/games/racing-art'
import { CAR_STATS, createRacing, FORK_FROM, FORK_SHARE, FORK_ZONES, RACING_CARS, RACING_LAST_LEVEL, RACING_SEGMENT, RACING_SHOP_LENGTHS, RACING_START_STEPS, RACING_STATS, RACING_WORLDS, racingBendSpeed, racingCharacter, racingCourse, racingEngine, racingGaragePick, racingHour, racingLevelMax, racingSunset, racingTime, racingWorldOrder, rivalsOf, stepRacing } from '@/lib/games/racing-rules'
import { shop, SHOP_WIDTHS, SHOPS, TOWN_UNIT } from '@/lib/games/racing-town'
import { FEATURED_ZONE, FINISH_ZONE, SHOP_ZONES, WORLD_SHOPS, WORLD_ZONES } from '@/lib/games/racing-worlds'
import { TRAFFIC_MODELS, trafficPicture } from '@/lib/games/racing-traffic'
import { decodePng } from '../../scripts/games/png'
import { CASUAL, driver, GOOD, race } from './racing-robot'

const NAMES: RacingArtName[] = ['titleWide', 'titleTall', 'playBack', 'palm', 'far-mountain', 'far-desert', 'far-city', 'pine', 'rock', 'saguaro', 'butte', 'face-desert', 'face-mountain', ...(['rosso', 'burger', 'giallo'] as const).flatMap((k) => CAR_SIZES.flatMap((s) => [`car-${k}-${s}`, `car-${k}-${s}-turn`] as RacingArtName[]))]
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
    // straight from behind: as wide on the left of its middle as on the right
    let left = 0, right = 0
    for (let y = 0; y < pic.height; y += 1) for (let x = 0; x < pic.width; x += 1) if (pic.data[(y * pic.width + x) * 4 + 3] > 128) { if (x < pic.width / 2) left += 1; else right += 1 }
    assert.ok(Math.abs(left - right) <= (left + right) * 0.03, `${kind}: even (${left} / ${right})`)
    // turning, the flank or the lean past its back
    assert.ok(pictures.get(`car-${kind}-104-turn` as RacingArtName)!.width > pic.width, `${kind}: its turning picture wider`)
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

test('racing: the race drawn at every hour, the tall board with its controls under it, the wide one without', () => {
  for (const [layout, w, h] of [['landscape', 448, 344], ['portrait', 320, 568]] as const) {
    for (const level of [1, 7, 11, 14]) {
      const b = renderRacingPlay(layout, '#0FC55D', { frame: 3, level })
      assert.equal(b.width, w); assert.equal(b.height, h)
      assert.ok(b.countNot('#0a0a14') > w * h * 0.8, `${layout} ${level}: the play drawn`)
    }
  }
  // a tablet on its side: the controls beside the board
  const s = createRacing('landscape', 1, 1)
  const side = renderRacingGame(s, '#0FC55D', { pad: 'side' })
  assert.equal(side.width, 448 + 150)
})

test('racing: three red lights a second apart, then green; nothing moves before', () => {
  const s = createRacing('landscape', 1, 1)
  const heard: string[] = []
  for (let i = 0; i < RACING_START_STEPS; i += 1) { stepRacing(s, 1, false, false); heard.push(...s.heard) }
  assert.deepEqual(heard, ['beep', 'beep', 'beep', 'go'])
  assert.equal(s.phase, 'play')
  assert.equal(s.z, 0)
  assert.equal(s.speed, 0)
  assert.ok(s.rivals.every((r) => r.z === 0), 'the rivals wait too')
})

test('racing: the start — A on the third light, a burst ahead of the rivals; held from before, the wheels spin; after the green, an ordinary start', () => {
  const launch = (pressAt: number) => {
    const s = createRacing('landscape', 1, 1)
    for (let i = 0; i < RACING_START_STEPS + 120; i += 1) stepRacing(s, 0, i >= pressAt, false)
    return { launch: s.launch, z: s.z, ahead: s.rivals.filter((r) => r.z > s.z).length }
  }
  const perfect = launch(2 * 60 + 5), early = launch(30), late = launch(RACING_START_STEPS + 2)
  assert.equal(perfect.launch, 'perfect')
  assert.equal(early.launch, 'early')
  assert.equal(late.launch, 'none')
  assert.ok(perfect.z > late.z && late.z > early.z, `a burst, a spin (${perfect.z.toFixed(0)} / ${late.z.toFixed(0)} / ${early.z.toFixed(0)})`)
  assert.equal(perfect.ahead, 0, 'ahead of both rivals after a perfect start')
})

test('racing: three cars that drive their own way — the red one fastest, the yellow one quickest off the mark, the burger surest in the bends', () => {
  const drive = (car: 'rosso' | 'giallo' | 'burger') => {
    const s = createRacing('landscape', 1, 1, { car })
    for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
    s.traffic = []
    s.track = s.track.map((g) => ({ ...g, curve: 0, y1: 0, y2: 0 }))
    let to200 = 0
    for (let i = 0; i < 1200; i += 1) { stepRacing(s, 0, true); if (!to200 && s.speed >= 0.69) to200 = i }
    return { top: s.speed, to200, bend: racingBendSpeed(s, 5) }
  }
  const rosso = drive('rosso'), giallo = drive('giallo'), burger = drive('burger')
  assert.ok(rosso.top > giallo.top && giallo.top > burger.top, 'top speeds')
  assert.ok(giallo.to200 < burger.to200 && burger.to200 < rosso.to200, 'acceleration')
  assert.ok(burger.bend > rosso.bend && rosso.bend > giallo.bend, 'grip')
  for (const car of RACING_CARS) assert.equal(RACING_STATS.reduce((a, n) => a + CAR_STATS[car][n], 0), 8, `${car}: eight points, its own way`)
})

test('racing: between two levels the pit stop — three improvements, one taken, the car better — then the next world of the game\'s draw', () => {
  const s = createRacing('landscape', 1, 3, { car: 'giallo' })
  const d = driver(GOOD, 3)
  for (let i = 0; i < 30000 && s.phase !== 'garage'; i += 1) { const m = d(s); stepRacing(s, m.steer, m.gas, m.brake, m.nitro) }
  assert.equal(s.phase, 'garage')
  const g = s.garage!
  assert.equal(g.options.length, 3)
  const stat = g.options[2], before = s.stats[stat]
  // A held from the race does not take one; the right arrow points further; A takes it
  stepRacing(s, 1, true); stepRacing(s, 0, true)
  assert.equal(s.phase, 'garage')
  for (let i = 0; i < 30; i += 1) stepRacing(s)
  stepRacing(s, 1); stepRacing(s, 0); stepRacing(s, 0, true)
  assert.equal(s.stats[stat], before + 1, 'the car one point better')
  assert.equal(s.level, 2)
  assert.equal(s.world, racingWorldOrder(3)[1])
  assert.equal(s.phase, 'start')
  const t = createRacing('landscape', 2, 5)
  assert.equal(racingGaragePick(t, 0), false, 'no pit stop in the middle of a race')
  // a round at a later level: the car as improved as it would be by then
  assert.equal(RACING_STATS.reduce((a, n) => a + createRacing('landscape', 9, 3, { single: true, car: 'burger' }).stats[n], 0), 8 + 8)
})

test('racing: the turbo earned by risks — a car brushed past, a combo, the slipstream, the bottle — and let go with its button', () => {
  const s = createRacing('landscape', 2, 1)
  for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
  s.rivals.forEach((r) => { r.z = -500 })
  s.items = []
  s.track = s.track.map((g) => ({ ...g, curve: 0, y1: 0, y2: 0 }))
  // a slow car ahead in the next lane: passed close, at speed
  s.z = 300; s.speed = 0.95; s.x = 0
  s.traffic = [{ kind: 'hatch', look: 0, z: 330, x: 0.7, lane: 0.7, speed: 0.4, swerve: false, swerved: false, spin: 0, spinWay: 1 as const }, { kind: 'saloon', look: 1, z: 345, x: -0.7, lane: -0.7, speed: 0.4, swerve: false, swerved: false, spin: 0, spinWay: 1 as const }]
  const score = s.score
  for (let i = 0; i < 120; i += 1) stepRacing(s, 0, true)
  assert.equal(s.combo, 2, 'two brushes in a row')
  assert.ok(s.score >= score + 50 + 100, 'their points, the second doubled')
  assert.ok(s.boost > 0.3, `the gauge filling (${s.boost.toFixed(2)})`)
  assert.ok(s.pops.some((p) => p.text.startsWith('NEAR MISS x2')))
  // riding behind a car fills it too
  const drafted = s.boost
  s.traffic = [{ kind: 'hatch', look: 0, z: s.z + 8, x: 0, lane: 0, speed: 0.95, swerve: false, swerved: false, spin: 0, spinWay: 1 as const }]
  for (let i = 0; i < 30; i += 1) { s.traffic[0].z = s.z + 8; stepRacing(s, 0, true) }
  assert.ok(s.drafting && s.boost > drafted, 'the slipstream')
  // let go: faster than the car's own top speed for a while, the gauge emptied
  s.traffic = []
  s.boost = 1
  stepRacing(s, 0, true, false, true)
  let fastest = 0
  for (let i = 0; i < 200; i += 1) { stepRacing(s, 0, true, false, true); fastest = Math.max(fastest, s.speed) }
  assert.equal(s.boost, 0)
  assert.ok(fastest > 1.1, `with the turbo: ${fastest.toFixed(2)}`)
})

test('racing: from the second level, the road divides after its first quarter into two roads for half the level — each its own way, through its own country, with its own offers — and the side the car is on takes one', () => {
  for (const world of RACING_WORLDS) for (let level = 2; level <= RACING_LAST_LEVEL; level += 1) {
    const c = racingCourse(level, world), f = c.fork!
    assert.ok(f && f.kinds[0] !== f.kinds[1], `${world} ${level}: two different roads`)
    assert.ok(f.at >= c.finish * (FORK_FROM - 0.03) && f.at <= c.finish * (FORK_FROM + 0.1), `${world} ${level}: after the first quarter (${(f.at / c.finish).toFixed(2)})`)
    assert.ok(f.len >= c.finish * (FORK_SHARE - 0.06) && f.at + f.len < c.finish - 200, `${world} ${level}: half the level, back together before the line`)
    assert.equal(f.tracks[0].length, f.len); assert.equal(f.tracks[1].length, f.len)
    for (const [k, road] of f.tracks.entries()) {
      // both start straight on the road they leave, and end straight, level with the road they meet again
      assert.ok(road.slice(0, 40).every((g) => g.curve === 0 && g.zone === c.track[f.at - 1].zone), 'straight while the car decides')
      assert.equal(road[f.len - 1].curve, 0)
      assert.ok(Math.abs(road[f.len - 1].y2 - c.track[f.at + f.len].y1) < 0.06, `${world} ${level}: back at the height it meets`)
      // through its own country
      const country = new Set(road.slice(60, f.len - 80).map((g) => g.zone))
      assert.ok([...country].every((z) => FORK_ZONES[world][f.kinds[k]].includes(z) || z === 'tunnel' || z === c.track[f.at + f.len].zone), `${world} ${level} ${f.kinds[k]}: its own country (${[...country].join(', ')})`)
    }
    const zonesOf = (k: 0 | 1) => new Set(f.tracks[k].slice(60, f.len - 80).map((g) => g.zone))
    assert.ok([...zonesOf(0)].some((z) => !zonesOf(1).has(z)) || [...zonesOf(1)].some((z) => !zonesOf(0).has(z)), `${world} ${level}: not the same country`)
    assert.ok(f.items[0].length && f.items[1].length, 'each road offers something')
  }
  assert.equal(racingCourse(1, 'coast').fork, null, 'none at the first level')
  // the side the car is on, a little before it: its road
  for (const side of [-1, 1] as const) {
    const s = createRacing('landscape', 5, 2, { single: true, world: 'desert' })
    const f = s.fork!
    for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
    s.traffic = []; s.rivals.forEach((r) => { r.z = -900 })
    s.z = f.at - 60; s.x = side * 0.6; s.speed = 0.9
    // kept on its side through the bends before the fork
    for (let i = 0; i < 80; i += 1) stepRacing(s, s.x < side * 0.6 - 0.05 ? 1 : s.x > side * 0.6 + 0.05 ? -1 : 0, true)
    const pick = side < 0 ? 0 : 1
    assert.equal(s.forkPick, pick)
    assert.ok(s.track.slice(f.at, f.at + f.len).every((g, k) => g.curve === f.tracks[pick][k].curve), 'its road laid down')
    assert.ok(f.items[pick].every((it) => s.items.some((o) => o.z === it.z && o.kind === it.kind)), 'its offers on it')
    assert.ok(racingCourse(5, 'desert').track === racingCourse(5, 'desert').track && s.track !== racingCourse(5, 'desert').track, 'the level\'s own road untouched')
  }
})

test('racing: never a hill steeper than a road can be, never too high', () => {
  for (const world of RACING_WORLDS) for (let level = 1; level <= RACING_LAST_LEVEL; level += 1) {
    const track = racingCourse(level, world).track
    assert.ok(track.every((g) => Math.abs(g.y2 - g.y1) <= 0.1201), `${world} ${level}: gentle enough`)
    assert.ok(track.every((g) => Math.abs(g.y2) <= 10.01), `${world} ${level}: within reach of the start's level`)
  }
})

test('racing: the engine climbs with the speed through its gears, dropping back at each change; quiet at the pit stop', () => {
  const s = createRacing('landscape', 1, 1)
  for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
  s.traffic = []
  const rates: number[] = []
  for (let i = 0; i < 500; i += 1) { stepRacing(s, 0, true); rates.push(racingEngine(s)!) }
  const drops = rates.filter((r, k) => k > 0 && r < rates[k - 1] - 0.2).length
  assert.ok(drops >= 3, `gear changes (${drops})`)
  assert.ok(Math.max(...rates) > 1.4 && Math.min(...rates) < 0.8)
  s.phase = 'garage'
  assert.equal(racingEngine(s), null)
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

test('racing: the rails stop the car with a knock and sparks; off the road it slows', () => {
  const s = createRacing('landscape', 1, 1)
  for (let i = 0; i < RACING_START_STEPS + 400; i += 1) stepRacing(s, 0, true)
  const fast = s.speed
  let knocked = false, sparked = false, slowest = fast
  for (let i = 0; i < 200; i += 1) { stepRacing(s, 1, true); knocked ||= s.heard.includes('thud'); sparked ||= s.sparks > 0 && s.sparkSide === 1; slowest = Math.min(slowest, s.speed) }
  assert.ok(knocked, 'a knock on the rail')
  assert.ok(sparked, 'sparks off it, on its side')
  assert.ok(slowest < fast * 0.6, 'the car slowed')
  assert.ok(Math.abs(s.x) < 1.7, 'held inside the rails')
})

test('racing: each world drawn at every hour — its far view, its ground, its things — and not the same as another', () => {
  for (const level of [1, 6, 10, 14]) {
    const seen = RACING_WORLDS.map((world) => {
      const s = createRacing('landscape', level, 3, { single: true, world })
      const d = driver(GOOD, 3)
      for (let i = 0; i < 900; i += 1) { const m = d(s); stepRacing(s, m.steer, m.gas, m.brake) }
      const b = renderRacingGame(s, '#0FC55D')
      assert.ok(b.countNot('#0a0a14') > b.width * b.height * 0.8, `${world} ${level}: drawn`)
      // the far view is the world's own picture
      return b.data.slice((60 * b.width) * 4, (61 * b.width) * 4)
    })
    for (let a = 0; a < seen.length; a += 1) for (let c = a + 1; c < seen.length; c += 1) assert.notDeepEqual(seen[a], seen[c], `level ${level}: ${RACING_WORLDS[a]} and ${RACING_WORLDS[c]} differ`)
  }
})

test('racing: past the line, fireworks and confetti over the public, thicker as the levels go', () => {
  const party = (level: number) => {
    const s = createRacing('landscape', level, 3, { single: true, world: 'coast' })
    const d = driver(GOOD, 3)
    for (let i = 0; i < 30000 && s.goalAt < 0; i += 1) { const m = d(s); stepRacing(s, m.steer, m.gas, m.brake) }
    assert.ok(s.goalAt >= 0, `level ${level}: the line crossed`)
    const crowds = s.track.slice(s.finish, s.finish + 130).filter((g) => g.things.some((t) => t.kind === 'crowd')).length
    for (let i = 0; i < 70; i += 1) stepRacing(s)
    const at = s.goalAt, lit = renderRacingGame(s, '#0FC55D').data.slice()
    s.goalAt = -1
    const plain = renderRacingGame(s, '#0FC55D').data
    s.goalAt = at
    let changed = 0
    for (let i = 0; i < plain.length; i += 4) if (plain[i] !== lit[i] || plain[i + 1] !== lit[i + 1] || plain[i + 2] !== lit[i + 2]) changed += 1
    return { changed, crowds }
  }
  const first = party(1), last = party(16)
  assert.ok(first.changed > 1000, `fireworks at the first level (${first.changed})`)
  assert.ok(last.changed > first.changed * 1.5, `more at the last (${last.changed} / ${first.changed})`)
  assert.ok(first.crowds >= 10 && last.crowds > first.crowds, `the public on past the line (${first.crowds}, ${last.crowds})`)
})

test('racing: the clock at zero, TIME UP, then over', () => {
  const s = createRacing('landscape', 1, 1)
  const steps = (racingTime(1) + 10) * 60 + RACING_START_STEPS
  for (let i = 0; i < steps && s.phase !== 'over'; i += 1) stepRacing(s, 0, false)
  assert.equal(s.phase, 'over')
  assert.equal(s.time, 0)
})

test('racing: running into a car much slower is a crash — both spin, the player\'s car out of hand a moment and slowed; a little faster, only a knock', () => {
  const at = (speed: number) => {
    const s = createRacing('landscape', 3, 1, { single: true, world: 'desert' })
    for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
    s.track = s.track.map((g) => ({ ...g, curve: 0, y1: 0, y2: 0 }))
    s.items = []; s.rivals.forEach((r) => { r.z = -500 })
    s.z = 300; s.x = 0.1; s.speed = speed
    s.traffic = [{ kind: 'saloon', look: 0, z: 320, x: 0, lane: 0, speed: 0.45, swerve: false, swerved: false, spin: 0, spinWay: 1 }]
    const heard: string[] = []
    for (let i = 0; i < 150 && !heard.includes('smash') && !heard.includes('thud'); i += 1) { stepRacing(s, 0, speed > 0.7, false); heard.push(...s.heard) }
    return { s, heard }
  }
  const { s, heard } = at(1)
  assert.ok(heard.includes('smash'), 'a crash')
  assert.ok(s.crash > 0 && s.traffic[0].spin > 0, 'both cars spinning')
  assert.notEqual(s.crashWay, s.traffic[0].spinWay, 'each its own way')
  assert.ok(s.speed < 0.45, `the player's car slowed (${s.speed.toFixed(2)})`)
  assert.ok(s.smoke > 0, 'smoking after it')
  // out of hand: steering and the pedals do nothing while it spins
  const x = s.x, way = s.crashWay
  for (let i = 0; i < 20; i += 1) stepRacing(s, way === 1 ? -1 : 1, true)
  assert.ok((s.x - x) * way > 0, 'it slides its way whatever the steering')
  for (let i = 0; i < 120; i += 1) stepRacing(s, 0, true)
  assert.equal(s.crash, 0, 'then the hand again')
  assert.equal(s.traffic[0].spin, 0, 'and the other car back in a lane')
  const soft = at(0.7)
  assert.ok(soft.heard.includes('thud') && !soft.heard.includes('smash') && soft.s.crash === 0, 'a little faster: a knock only')
})

test('racing: smoke now and then — the tyres braking hard, a car after a crash; the mountain\'s mist on the road', () => {
  const s = createRacing('portrait', 2, 1, { single: true, world: 'mountain' })
  for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
  s.speed = 0.9
  stepRacing(s, 0, false, true)
  assert.ok(s.braking, 'braking hard at speed')
  s.speed = 0.3
  stepRacing(s, 0, false, true)
  assert.ok(!s.braking, 'not slowly')
  // the same road in and out of a bank of mist
  const shot = (world: 'mountain', zone: 'forest', z: number) => {
    const r = createRacing('portrait', 2, 1, { single: true, world })
    for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(r)
    r.items = []; r.traffic = []; r.rivals.forEach((c) => { c.z = -400 })
    r.track = r.track.map((g) => ({ ...g, curve: 0, y1: 0, y2: 0, zone, shop: undefined, shopL: undefined }))
    r.z = z
    const board = renderRacingGame(r, '#12c45c', { pad: 'band' })
    return Uint8ClampedArray.from(board.data)
  }
  const lightness = (d: Uint8ClampedArray) => { let t = 0; for (let i = 0; i < d.length; i += 4) t += d[i] + d[i + 1] + d[i + 2]; return t / (d.length / 4) }
  assert.ok(lightness(shot('mountain', 'forest', 860)) > lightness(shot('mountain', 'forest', 600)) + 6, 'in a bank of mist, the view whiter')
})

test('racing: the public cheers as the car goes by it — not again for a few seconds — and at the line', () => {
  const s = createRacing('landscape', 1, 3, { single: true, world: 'coast' })
  const drive = driver(GOOD, 3)
  const cheers: number[] = []
  let line = false
  for (let i = 0; i < 240 * 60 && s.phase !== 'won'; i += 1) {
    const m = drive(s)
    stepRacing(s, m.steer, m.gas, m.brake, m.nitro)
    if (s.heard.includes('level')) line = s.heard.includes('cheer')
    else if (s.heard.includes('cheer')) cheers.push(s.steps)
  }
  assert.ok(cheers.length >= 4, `cheered along the road (${cheers.length})`)
  assert.ok(cheers.every((at, k) => k === 0 || at - cheers[k - 1] >= 7 * 60), 'never twice within seven seconds')
  assert.ok(line, 'and at the line')
})

test('racing: a good driver wins every level of every world with time to spare, and the first five in first place', () => {
  for (const world of RACING_WORLDS) for (let level = 1; level <= RACING_LAST_LEVEL; level += 1) {
    const out = race(createRacing('landscape', level, 3, { single: true, world }), GOOD, 3)
    assert.ok(out.won, `${world} ${level} won`)
    assert.ok(out.timeLeft >= 3, `${world} ${level}: ${out.timeLeft.toFixed(1)} s left`)
    if (level <= 5) assert.equal(out.place, 1, `${world} ${level}: first`)
    assert.ok(out.score <= racingLevelMax(level), `${world} ${level}: score within its most`)
  }
})

test('racing: a casual driver wins the first levels of every world with time to spare; each level leaves it less, the last ones a few seconds at most', () => {
  const spare = (level: number) => RACING_WORLDS.map((world) => race(createRacing('portrait', level, 9, { single: true, world }), CASUAL, 9))
  for (const world of RACING_WORLDS) for (let level = 1; level <= 3; level += 1) {
    const out = race(createRacing('portrait', level, 9, { single: true, world }), CASUAL, 9)
    assert.ok(out.won, `${world} ${level} won`)
    if (level === 1) assert.ok(out.timeLeft >= 6, `${world}: ${out.timeLeft.toFixed(1)} s left`)
  }
  const mean = (level: number) => spare(level).reduce((a, o) => a + (o.won ? o.timeLeft : 0), 0) / RACING_WORLDS.length
  const first = mean(1), middle = mean(8), last = mean(RACING_LAST_LEVEL)
  assert.ok(first > middle && middle > last, `less and less time to spare (${first.toFixed(1)}, ${middle.toFixed(1)}, ${last.toFixed(1)})`)
  for (const world of RACING_WORLDS) for (const seed of [7, 8, 9]) {
    const out = race(createRacing('portrait', RACING_LAST_LEVEL, seed, { single: true, world }), CASUAL, seed)
    assert.ok(!out.won || out.timeLeft <= 8, `${world} ${seed}: the last level leaves a casual driver little (${out.timeLeft.toFixed(1)} s)`)
  }
})

test('racing: the rivals stay in the race — passed, they come back; a mistake and they are by', () => {
  for (const world of RACING_WORLDS) {
    const s = createRacing('landscape', 2, 3, { single: true, world })
    const d = driver(GOOD, 3)
    let far = 0, steps = 0
    for (let i = 0; i < 30000 && s.z < s.finish * 0.7; i += 1) {
      const m = d(s); stepRacing(s, m.steer, m.gas, m.brake)
      if (s.phase !== 'play' || s.z < 400) continue
      steps += 1
      if (Math.min(...s.rivals.map((r) => Math.abs(r.z - s.z))) > 120) far += 1
    }
    assert.ok(far < steps * 0.1, `${world}: a rival near most of the race (${Math.round((100 * far) / steps)} % of it none within 120)`)
    // three seconds standing still: they go by
    const place = s.place
    for (let i = 0; i < 180; i += 1) stepRacing(s, 0, false, true)
    assert.ok(s.place > place || place === 3, `${world}: a rival by (${place} → ${s.place})`)
  }
})

test('racing: each level its own character — the sprint straight, the twisty level sharp, the tunnel level in the rock, the hills high — never twice running', () => {
  for (let level = 2; level <= RACING_LAST_LEVEL; level += 1) assert.notEqual(racingCharacter(level), racingCharacter(level - 1), `levels ${level - 1} and ${level}`)
  for (const world of RACING_WORLDS) {
    const road = (level: number) => racingCourse(level, world).track.slice(0, racingCourse(level, world).finish)
    const share = (level: number, f: (g: ReturnType<typeof road>[number]) => boolean) => road(level).filter(f).length / road(level).length
    const straight = (g: ReturnType<typeof road>[number]) => Math.abs(g.curve) < 0.3, sharp = (g: ReturnType<typeof road>[number]) => Math.abs(g.curve) >= 3.5
    const height = (level: number) => { const ys = road(level).map((g) => g.y2); return Math.max(...ys) - Math.min(...ys) }
    // (half of each level on its two roads, each road its own shape: the sprint a little less than twice as straight as the twisty level in the desert, the straightest world)
    assert.ok(share(7, straight) > 0.5 && share(7, straight) > share(9, straight) * 1.8, `${world}: the sprint mostly straight (${share(7, straight).toFixed(2)} / ${share(9, straight).toFixed(2)})`)
    assert.ok(share(9, sharp) > share(7, sharp) * 2, `${world}: the twisty level sharp`)
    assert.ok(share(10, (g) => g.zone === 'tunnel') > 0.2, `${world}: the tunnel level in the rock`)
    if (world !== 'city') assert.ok(height(8) > height(7) * 1.5, `${world}: the hills high (${height(8)} / ${height(7)})`)
    for (let level = 1; level <= RACING_LAST_LEVEL; level += 1) assert.equal(road(level)[0].zone, FEATURED_ZONE[world][racingCharacter(level)], `${world} ${level}: starts on its own kind of road`)
  }
})

test('racing: each level harder than the one before — more traffic, more on the road, quicker rivals', () => {
  const count = (level: number, kind: string) => RACING_WORLDS.reduce((a, w) => a + racingCourse(level, w).items.filter((it) => it.kind === kind).length, 0)
  const traffic = (level: number) => RACING_WORLDS.reduce((a, w) => a + racingCourse(level, w).traffic.length, 0)
  for (let level = 4; level <= RACING_LAST_LEVEL; level += 4) {
    assert.ok(traffic(level) > traffic(level - 3), `more traffic at ${level}`)
    // more puddles, and more on the road all told (a roadworks ten cones; a twisty level has fewer, its bends leaving few places for them)
    const all = (lv: number) => count(lv, 'puddle') + count(lv, 'cone') / 10
    assert.ok(count(level, 'puddle') > count(level - 3, 'puddle') && all(level) > all(level - 3), `more on the road at ${level}`)
  }
  assert.ok(RACING_WORLDS.every((w) => racingCourse(4, w).traffic.some((t) => t.swerve) || racingCourse(5, w).traffic.some((t) => t.swerve)), 'cars that swerve from the fourth level')
  // never roadworks in a sharp bend
  for (const world of RACING_WORLDS) for (let level = 1; level <= RACING_LAST_LEVEL; level += 1) { const c = racingCourse(level, world); for (const it of c.items) if (it.kind === 'cone') assert.ok(Math.abs(c.track[it.z].curve) <= 3, `${world} ${level}: cones at ${it.z} out of the bends`) }
})

test('racing: each game draws its worlds at random — the four in every four levels, never the same twice running', () => {
  const orders = [1, 2, 3, 4, 5, 6].map(racingWorldOrder)
  for (const order of orders) {
    assert.equal(order.length, RACING_LAST_LEVEL)
    for (let k = 0; k < 4; k += 1) assert.deepEqual([...order.slice(k * 4, k * 4 + 4)].sort(), [...RACING_WORLDS].sort())
    for (let k = 1; k < order.length; k += 1) assert.notEqual(order[k], order[k - 1])
  }
  assert.ok(new Set(orders.map((o) => o.join())).size >= 5, 'a different order from game to game')
  assert.ok(new Set(orders.map((o) => o[0])).size >= 2, 'not always the same world first')
  // a game follows its order from level to level; the test page keeps one world
  const s = createRacing('landscape', 1, 4)
  assert.equal(s.world, racingWorldOrder(4)[0])
  race(s, GOOD, 4)
  assert.equal(s.world, racingWorldOrder(4)[1])
  assert.ok(createRacing('landscape', 9, 4, { world: 'desert' }).worlds.every((w) => w === 'desert'))
})

test('racing: each world its own road — its kinds, its things, its shops on its sides — and more public and busier streets as the levels go', () => {
  type Seg = ReturnType<typeof racingCourse>['track'][number]
  const things: Record<string, string[]> = { coast: ['palm', 'parasol', 'sailboat', 'lighthouse'], mountain: ['pine', 'rock', 'lamp'], desert: ['saguaro', 'shrub', 'redrock', 'tumbleweed'], city: ['globe', 'palm', 'lights'] }
  for (const world of RACING_WORLDS) {
    const kinds = new Set<string>(WORLD_ZONES[world])
    for (const level of [1, 6, 12, 16]) {
      const c = racingCourse(level, world)
      assert.equal(c.world, world)
      for (const g of c.track) assert.ok(kinds.has(g.zone), `${world} ${level}: ${g.zone} is one of its own`)
      assert.equal(c.track[0].zone, FEATURED_ZONE[world][racingCharacter(level)], `${world} ${level}: starts on its level's kind of road`)
      assert.equal(c.track[c.finish].zone, FINISH_ZONE[world], `${world} ${level}: the line where the public and the shops are`)
      for (const sp of c.track.flatMap((g) => [g.shop, g.shopL])) if (sp) assert.ok(WORLD_SHOPS[world].includes(sp.kind), `${world}: ${SHOPS[sp.kind]} is one of its shops`)
      for (const [i, g] of c.track.entries()) { if (g.shop) assert.ok(SHOP_ZONES[g.zone], `${world} ${i}: a shop where shops are`); if (g.shopL) assert.equal(SHOP_ZONES[g.zone], 'both', `${world} ${i}: on the left where both sides have them`) }
      assert.ok(!c.track.some((g) => g.zone === 'tunnel' && g.things.some((t) => t.kind === 'crowd')), 'nobody in the tunnel')
    }
    const all = new Set([1, 6, 12, 16].flatMap((level) => racingCourse(level, world).track.flatMap((g) => g.things.map((t) => t.kind as string))))
    for (const kind of things[world]) assert.ok(all.has(kind), `${world}: ${kind}`)
    if (world === 'city' || world === 'mountain') assert.ok(racingCourse(1, world).track.some((g) => g.shopL), `${world}: shops on both sides`)
    const share = (level: number, what: (g: Seg) => boolean) => { const c = racingCourse(level, world); return c.track.slice(0, c.finish).filter(what).length / c.finish }
    const crowd = (g: Seg) => g.things.some((t) => t.kind === 'crowd')
    assert.ok(share(16, crowd) > share(1, crowd), `${world}: more public later`)
  }
  // the shops closer together later: the gap from one to the next along the same street
  for (const world of RACING_WORLDS) {
    const gap = (level: number) => {
      const track = racingCourse(level, world).track, spans = [...new Map(track.filter((g) => g.shop).map((g) => [g.shop!.start, g.shop!])).values()]
      const gaps = spans.slice(1).map((sp, k) => sp.start - (spans[k].start + spans[k].len)).filter((d, k) => track.slice(spans[k].start, spans[k + 1].start).every((g) => g.zone === track[spans[k].start].zone))
      return gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length)
    }
    assert.ok(gap(16) < gap(1) * 0.6, `${world}: busier streets later (${gap(1).toFixed(1)} → ${gap(16).toFixed(1)} stretches between shops)`)
  }
})

test('racing: the road grows with the levels — its kinds, its bends, its traffic, its surprises', () => {
  const zones = (level: number) => new Set(racingCourse(level).track.map((g) => g.zone))
  assert.deepEqual([...zones(1)].sort(), ['beach', 'promenade'])
  for (const z of ['beach', 'promenade', 'causeway', 'cliff', 'tunnel']) assert.ok([7, 8, 10, 12, 14, 15].some((level) => zones(level).has(z as never)), `${z} somewhere`)
  const sharpest = (level: number) => Math.max(...racingCourse(level).track.map((g) => Math.abs(g.curve)))
  assert.ok(sharpest(1) <= 4.3 && sharpest(9) >= 6, 'hairpins later on')
  assert.ok(racingCourse(1).traffic.length >= 2, 'a little traffic from the first level')
  assert.ok(racingCourse(16).traffic.length > racingCourse(4).traffic.length)
  const count = (level: number, kind: string) => racingCourse(level).items.filter((it) => it.kind === kind).length
  assert.ok(count(1, 'puddle') > 0 && count(1, 'cone') > 0, 'something unexpected from the first level')
  assert.ok(count(16, 'puddle') > count(1, 'puddle') && count(16, 'cone') > count(1, 'cone'), 'more of it later')
  for (let level = 1; level <= RACING_LAST_LEVEL; level += 1) {
    const c = racingCourse(level)
    assert.equal(c.checks.length, 2, `level ${level}: two checkpoints`)
    assert.ok(c.items.some((it) => it.kind === 'time') && c.items.some((it) => it.kind === 'coin'), `level ${level}: stopwatches and coins`)
    // never all three lanes shut at once by the cones
    for (const it of c.items) if (it.kind === 'cone') assert.ok(new Set(c.items.filter((o) => o.kind === 'cone' && Math.abs(o.z - it.z) < 10).map((o) => o.x)).size < 3)
  }
})

test('racing: the coast is alive — the public at the start, the checkpoints and the line, buildings on the promenade, life at sea, a lighthouse', () => {
  for (const level of [1, 6, 12]) {
    const c = racingCourse(level)
    const at = (kind: string, from: number, to: number) => c.track.slice(Math.max(0, from), to).some((g) => g.things.some((t) => t.kind === kind))
    assert.ok(at('crowd', 0, 80), `level ${level}: the public at the start`)
    for (const k of c.checks) assert.ok(at('crowd', k - 35, k + 10) || c.track[k].zone === 'tunnel', `level ${level}: the public at a checkpoint`)
    assert.ok(at('crowd', c.finish - 80, c.finish + 15), `level ${level}: the public at the line`)
    // by whichever of its two roads
    const things = [...c.track, ...(c.fork?.tracks[0] ?? [])].flatMap((g) => g.things.map((t) => t.kind))
    for (const kind of ['parasol', 'sailboat', 'buoy', 'lighthouse']) assert.ok(things.includes(kind as never), `level ${level}: ${kind}`)
    assert.ok(c.track.some((g) => g.shop), `level ${level}: shops`)
    // nobody in the tunnel
    assert.ok(!c.track.some((g) => g.zone === 'tunnel' && g.things.some((t) => t.kind === 'crowd')))
  }
})

test('racing: the sun sets as the race goes on, night falls by the levels, the storm at the end', () => {
  let last = -1
  for (let level = 1; level <= 12; level += 1) for (const p of [0, 0.5, 1]) { const h = racingHour(level, p); assert.ok(h >= last, `level ${level} at ${p}: later`); last = h }
  assert.ok(racingSunset(racingHour(1, 0)) === 0, 'the sun up at the start')
  assert.ok(racingSunset(racingHour(1, 1)) > 0.4, 'low by the end of the first level')
  assert.equal(racingSunset(racingHour(2, 1)), 1, 'gone by the end of the second')
  assert.equal(racingHour(13, 0), 3)
})

test('racing: the traffic is everyday cars, and the shops each look like their trade, one after another different', () => {
  for (let level = 1; level <= RACING_LAST_LEVEL; level += 1) for (const t of racingCourse(level).traffic) assert.ok(TRAFFIC_MODELS.includes(t.kind), `level ${level}: ${t.kind} is an everyday car`)
  const spans = [...new Map(racingCourse(6).track.filter((g) => g.shop).map((g) => [g.shop!.start, g.shop!])).values()]
  const shops = spans.map((sp) => sp.kind)
  assert.ok(new Set(shops).size >= 4, `several kinds of shop (${new Set(shops).size})`)
  for (let k = 1; k < shops.length; k += 1) assert.notEqual(shops[k], shops[k - 1], 'never the same shop twice running')
  // each runs along the road as long as its front is wide, at the shops' scale, on the promenade only
  SHOPS.forEach((kind, k) => assert.equal(RACING_SHOP_LENGTHS[k], Math.round((SHOP_WIDTHS[k] * TOWN_UNIT) / RACING_SEGMENT), kind))
  for (const sp of spans) for (let i = sp.start; i < sp.start + sp.len; i += 1) assert.equal(racingCourse(6).track[i].zone, 'promenade')
  for (const kind of SHOPS) for (const lit of [false, true]) { const s = shop(kind, lit); assert.ok(s.front.width === s.pic.width && s.front.height > 20, kind); assert.equal(s.front.height + s.roof, s.pic.height) }
  for (const model of TRAFFIC_MODELS) { const straight = trafficPicture(model, 0, false, 64), turning = trafficPicture(model, 0, true, 64); assert.ok(turning.pic.width > straight.pic.width, `${model}: its flank when it turns`) }
})

/** A race put just short of something on the road, at speed, in its lane. */
function before(kind: string, level = 5): { s: ReturnType<typeof createRacing>; it: ReturnType<typeof createRacing>['items'][number] } {
  // the first level from `level` on with one on its road
  let lv = level
  while (!createRacing('landscape', lv, 1).items.some((o) => o.kind === kind)) lv += 1
  const s = createRacing('landscape', lv, 1)
  for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
  const it = s.items.find((o) => o.kind === kind)!
  // on the right-hand road if it is on one of the two: as if taken
  if (s.fork) s.forkPick = 1
  s.z = it.z - 12; s.x = it.x; s.speed = 0.8
  s.rivals.forEach((r) => { r.z = 0 }); s.traffic = []
  return { s, it }
}

test('racing: a stopwatch gives three seconds, the mustard fills the turbo\'s gauge', () => {
  const w = before('time')
  const t0 = w.s.time
  for (let i = 0; i < 20; i += 1) stepRacing(w.s, 0, true)
  assert.ok(w.it.taken)
  assert.ok(w.s.time > t0 - 20 + 170, 'three seconds more')
  const t = before('turbo', 3)
  for (let i = 0; i < 20; i += 1) stepRacing(t.s, 0, true)
  assert.ok(t.it.taken)
  assert.ok(t.s.boost >= 0.6, 'the mustard fills the gauge')
})

test('racing: a puddle sends the car skidding, the wheels not answering; a cone knocks it', () => {
  const p = before('puddle')
  let skidded = false
  for (let i = 0; i < 20; i += 1) { stepRacing(p.s, 0, true); skidded ||= p.s.skid > 0 }
  assert.ok(skidded, 'a skid')
  const x = p.s.x
  for (let i = 0; i < 10 && p.s.skid > 0; i += 1) stepRacing(p.s, (p.s.skidWay * -1) as -1 | 1, true)
  assert.ok(Math.sign(p.s.x - x) === p.s.skidWay || p.s.skid === 0, 'it slides its own way, whatever the steering')
  const c = before('cone')
  const heard: string[] = []
  let slowest = 1
  for (let i = 0; i < 20; i += 1) { stepRacing(c.s, 0, true); heard.push(...c.s.heard); if (heard.includes('clink')) slowest = Math.min(slowest, c.s.speed) }
  assert.ok(heard.includes('clink'))
  assert.ok(slowest <= 0.56, 'slowed down by the knock')
})

test('racing: a checkpoint adds the next part\'s time to the clock', () => {
  const s = createRacing('landscape', 4, 1)
  for (let i = 0; i < RACING_START_STEPS; i += 1) stepRacing(s)
  s.z = s.checks[0] - 2; s.speed = 0.9
  const t0 = s.time
  const heard: string[] = []
  for (let i = 0; i < 5; i += 1) { stepRacing(s, 0, true); heard.push(...s.heard) }
  assert.ok(heard.includes('gold'))
  assert.equal(s.check, 1)
  assert.ok(s.time > t0 + 15 * 60, 'a good deal of time more')
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
    const discs = [g.gas, g.brake, g.nitro]
    assert.equal(racingPadPart(g.nitro.cx, g.nitro.cy, g), 'nitro', `${layout} ${pad}: T`)
    for (const [p, q] of [[g.gas, g.brake], [g.gas, g.nitro], [g.brake, g.nitro]]) assert.ok(Math.hypot(p.cx - q.cx, p.cy - q.cy) > p.r + q.r, `${layout} ${pad}: the round buttons apart`)
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
