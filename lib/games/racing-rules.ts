/**
 * The rules of RANDOM RACING, apart from any screen. A race against the
 * clock on the coast road, seen from behind the car: the player's car — the
 * one chosen on the title — and the two others as rivals, side by side on
 * the grid. Three red lights, then green; the left and right arrows steer, A
 * (gas) speeds up, B brakes.
 *
 * The road changes as it goes (`racingCourse`): the beach and its palms,
 * the promenade with its lamps, the cliff over the sea, the causeway with
 * water on both sides, the tunnel through the rock; long sweepers, bends,
 * S bends, chicanes, hairpins, bends over a crest, hills. Too fast in a bend
 * and the car drifts out; off the road it slows; the rails stop it; a car hit
 * from behind slows it.
 *
 * On the road: stopwatches (+3 seconds), the mustard turbo (faster for four
 * seconds), coins in a row; and what is not expected: ketchup puddles that
 * send the car skidding, roadworks closing a lane with cones, slow traffic to
 * get past — some of it swerving into another lane as the player comes — and
 * rivals that move across to block. Two checkpoints add time to the clock;
 * the clock at zero, it is over; the finish line in time clears the level,
 * with points for the time left and the place.
 *
 * Each level is its own road, always the same for it, longer and harder:
 * more of the road's kinds, sharper bends, more traffic and more surprises,
 * rivals quicker and blocking more, less time to spare; from the thirteenth,
 * a storm and a slippery road. Level 16 cleared, the game is won.
 *
 * The road is cut into stretches (`RACING_SEGMENT` long, a tenth of the
 * road's half width): a place along it (`z`) counts in stretches, across it
 * (`x`) in half widths — −1 the left edge, 1 the right. Everything moves
 * sixty times a second; the same seed and the same moves play the same race.
 */

import { seeded } from './engine'
import type { RacingCarKind } from './racing-art'
import { FINISH_ZONE, racingWorldOrder, RACING_WORLDS, SHOP_LENGTHS, SHOP_ZONES, TUNNEL_FROM, WORLD_ROADS, WORLD_SHOPS, WORLD_TRAFFIC, WORLD_ZONES, type RacingWorld, type RacingZone } from './racing-worlds'

export type RacingLayout = 'landscape' | 'portrait'
export type { RacingCarKind, RacingWorld, RacingZone }
export { RACING_WORLDS, racingWorldOrder }
const SECOND = 60

/** The last level: cleared, the game is won. */
export const RACING_LAST_LEVEL = 16
export const RACING_CARS: readonly RacingCarKind[] = ['rosso', 'burger', 'giallo']

/**
 * What can be heard: a light of the start (and the last seconds), the green
 * light, a knock, a rival passed, the finish line, a checkpoint, a stopwatch,
 * the turbo, a coin, a skid, a cone knocked over.
 */
export type RacingSound = 'beep' | 'go' | 'thud' | 'whoosh' | 'level' | 'gold' | 'note' | 'power' | 'coin' | 'slip' | 'clink'

/** A stretch's length, in half widths of the road. */
export const RACING_SEGMENT = 0.1
/** How much a bend of 1 turns the road, in half widths per stretch per stretch. */
export const RACING_BEND = 0.0005
/** The road's edges, the kerbs past them, the rails further out: in half widths from the middle. */
export const RACING_KERB = 1.12
export const RACING_RAIL = 1.7
/** A car's width, and how close two must come, along the road, to touch (in stretches). */
export const RACING_CAR_WIDTH = 0.6
const CAR_LENGTH = 7
/** The three lanes' middles. */
export const RACING_LANES = [-0.64, 0, 0.64] as const

/** Top speed, in stretches a step: shown as 290 km/h; with the turbo, a little more. */
export const RACING_TOP = 1
const TURBO_TOP = 1.18
const ACCEL = RACING_TOP / 300
const BRAKE = RACING_TOP / 70
const COAST = RACING_TOP / 500
/** Off the road, above this the sand and the bushes slow the car hard. */
const OFFROAD_TOP = RACING_TOP * 0.42
const OFFROAD = RACING_TOP / 90
/** How far a step of steering takes the car at top speed, and how hard a bend pushes it out (more on a wet road). */
const STEER = 1 / 30
const CENTRIFUGAL = 0.3
const grip = (level: number) => (racingStorm(level) ? 1.12 : 1)
export const racingKmh = (speed: number): number => Math.round((Math.max(0, speed) / RACING_TOP) * 290)

/** The start: three red lights a second apart, then green. */
export const RACING_START_STEPS = 3 * SECOND
/** The finish line crossed: the car rolls on while the points add up; the clock at zero: it comes to a stop. */
const GOAL_STEPS = 3 * SECOND
const TIMEUP_STEPS = 2 * SECOND
/** Past the finish line the road goes on, so the car has somewhere to roll. */
const RUNOFF = 500
/** The turbo's length, a skid's, what a stopwatch gives. */
const TURBO_STEPS = 4 * SECOND
const SKID_STEPS = 45
const STOPWATCH = 3 * SECOND

/** How the coast looks as the levels go: sunset (1–4), dusk (5–8), night (9–12), the storm (13–16). */
export const racingTier = (level: number): 0 | 1 | 2 | 3 => (level >= 13 ? 3 : level >= 9 ? 2 : level >= 5 ? 1 : 0)
export const racingStorm = (level: number): boolean => racingTier(level) === 3
/**
 * The hour on the coast as the race goes on (`progress` from the start to
 * the finish line, 0 to 1): the sun sets through the first two levels — low
 * over the sea by the end of the first, under it during the second — the
 * dusk deepens to the fourth and darkens into night by the eighth, night to
 * the twelfth (0 the sunset, 1 the dusk, 2 the night); the storm (3) from
 * the thirteenth.
 */
export function racingHour(level: number, progress: number): number {
  if (racingStorm(level)) return 3
  const x = Math.max(0, Math.min(12, level - 1 + Math.max(0, Math.min(1, progress))))
  return x < 2 ? x * 0.4 : x < 4 ? 0.8 + (x - 2) * 0.1 : x < 8 ? 1 + (x - 4) * 0.2 : 1.8 + (x - 8) * 0.05
}
/** How far the sun has sunk at an hour, 0 to 1 (gone). */
export const racingSunset = (hour: number): number => Math.max(0, Math.min(1, hour / 0.75))

// ---------------------------------------------------------------- the road

/** What lives at sea and on the beach. */
export type RacingProp = 'parasol' | 'tower' | 'sailboat' | 'yacht' | 'jetski' | 'windsurf' | 'buoy' | 'dolphin' | 'lighthouse'
/** What stands by the road in the other worlds: pines and rocks, saguaros, shrubs, red rocks and tumbleweeds, globe lamps, trees, fountains and traffic lights. */
export type RacingScenery = 'pine' | 'rock' | 'saguaro' | 'shrub' | 'redrock' | 'tumbleweed' | 'globe' | 'tree' | 'fountain' | 'lights'
/**
 * What stands by the road on a stretch: a palm, a chevron pointing into a
 * bend (`flip`: pointing left), a lamp, a bush, the public, the beach's and
 * the sea's things, the other worlds' things; `x` in half widths from the
 * middle, `look` which one of its kind (which faces, which front, which
 * colours).
 */
export type RacingThing = { kind: 'palm' | 'chevron' | 'lamp' | 'bush' | 'crowd' | RacingProp | RacingScenery; x: number; flip: boolean; look: number }
/** A shop along the road: which one, the stretch its front starts at (nearest), how many stretches it runs. */
export type RacingShop = { kind: number; start: number; len: number }
/** A stretch: how much the road bends there (to the right when positive), its height at its near and far ends, its kind, what stands by it, the shops it runs along on the right and on the left. */
export type RacingSegment = { curve: number; y1: number; y2: number; zone: RacingZone; things: RacingThing[]; shop?: RacingShop; shopL?: RacingShop }
/** Each shop's length along the road, in stretches: its front's width (`SHOP_WIDTHS`) at the shops' scale (`TOWN_UNIT`). */
export const RACING_SHOP_LENGTHS = SHOP_LENGTHS

/** What lies on the road: a stopwatch, the turbo, a coin; a ketchup puddle, a cone of the roadworks. */
export type RacingItemKind = 'time' | 'turbo' | 'coin' | 'puddle' | 'cone'
export type RacingItem = { kind: RacingItemKind; z: number; x: number; taken: boolean }
/** The everyday cars of the traffic. */
export type RacingTrafficModel = 'hatch' | 'saloon' | 'camper' | 'pickup' | 'estate' | 'beetle' | 'icecream'
/** A slow car of the traffic: the model and its colour (`look`), its lane, its speed; whether it swerves into another lane when the player comes. */
export type RacingTraffic = { kind: RacingTrafficModel; look: number; z: number; x: number; lane: number; speed: number; swerve: boolean; swerved: boolean }

/** A level's road and what is on it, always the same for the level. */
export type RacingCourse = {
  world: RacingWorld
  track: RacingSegment[]
  finish: number
  /** The checkpoints, where time is added, in stretches. */
  checks: number[]
  /** The par of each part of the road (to the first checkpoint, between them, to the line), in seconds. */
  pars: number[]
  items: Array<Omit<RacingItem, 'taken'>>
  traffic: Array<Omit<RacingTraffic, 'swerved'>>
}

const easeIn = (a: number, b: number, t: number) => a + (b - a) * t * t
const easeInOut = (a: number, b: number, t: number) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5)

/** How long a level's road is, about, to the finish line, in stretches. */
export const racingLength = (level: number): number => 2800 + Math.min(RACING_LAST_LEVEL, level) * 120
/** How fast the rivals go on the straights, as a share of the top speed; in the bends they take a little less than the most the bend allows. */
export const racingPace = (level: number): number => 0.82 + Math.min(RACING_LAST_LEVEL, level) * 0.005
const RIVAL_BEND = 0.93
/** How fast a car can take a bend of `curve` and still hold it, steering all the way in: a share of the top speed. */
export const bendLimit = (curve: number, level = 1): number => (Math.abs(curve) < 1e-6 ? 1 : Math.min(1, Math.sqrt(1 / (CENTRIFUGAL * grip(level) * Math.abs(curve)))))

const courses = new Map<string, RacingCourse>()

/**
 * A level's road in a world. Its kinds come one after another, a few
 * hundred stretches each — the world's first two from the first level, the
 * third from the second, the fourth from the fourth, the tunnel from the
 * sixth (out of the rock and back into it) — and its bends with them:
 * sweepers and bends at first, S bends from the third, chicanes from the
 * fourth, hairpins from the fifth, bends over a crest from the sixth; hills
 * from the third, higher from the seventh and the eleventh; each world its
 * own way (`WORLD_ROADS`: the mountains' hills and hairpins, the desert's
 * straights and sweepers, the city's flat streets). A straight for the grid,
 * a straight to the line where the public is, the run-off past it.
 */
export function racingCourse(level: number, world: RacingWorld = 'coast'): RacingCourse {
  const lv = Math.max(1, Math.min(RACING_LAST_LEVEL, level))
  const key = `${lv}|${world}`
  const known = courses.get(key)
  if (known) return known
  const way = WORLD_ROADS[world], zones = WORLD_ZONES[world] as readonly RacingZone[]
  const rnd = seeded(1000 + lv * 7919 + RACING_WORLDS.indexOf(world) * 104729)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]
  const between = (a: number, b: number) => Math.round(a + rnd() * (b - a))
  const track: RacingSegment[] = []
  const lastY = () => (track.length ? track[track.length - 1].y2 : 0)
  let zone: RacingZone = zones[0]
  const add = (enter: number, hold: number, leave: number, curve: number, height: number) => {
    const y0 = lastY(), y1 = y0 + height, total = enter + hold + leave
    let n = 0
    const push = (c: number) => { track.push({ curve: c, y1: easeInOut(y0, y1, n / total), y2: easeInOut(y0, y1, (n + 1) / total), zone, things: [] }); n += 1 }
    for (let i = 0; i < enter; i += 1) push(easeIn(0, curve, i / enter))
    for (let i = 0; i < hold; i += 1) push(curve)
    for (let i = 0; i < leave; i += 1) push(easeInOut(curve, 0, i / leave))
  }
  // up or down, back toward the start's level when the road has climbed or dropped far; flat on the water and in the tunnel
  const hill = (bigger = false) => {
    if (zone === 'causeway' || zone === 'bridge' || zone === 'tunnel' || zone === 'lake') return 0
    const size = (lv >= 11 ? pick([4, 6]) : lv >= 7 ? pick([2, 4]) : lv >= 3 ? pick([0, 2]) : 0) + (bigger && lv >= 3 ? 2 : 0)
    return Math.round(size * way.hills) * (lastY() > 3 ? -1 : lastY() < -3 ? 1 : rnd() < 0.5 ? -1 : 1)
  }
  const kinds = zones.filter((z, k) => z !== 'tunnel' && (k < 2 || (k === 2 && lv >= 2) || (k === 3 && lv >= 4)))
  // how often each shape of road comes, in this world
  const shapes: Array<[string, number]> = [['straight', 0.18 * way.straights], ['sweeper', 0.16 * way.sweepers], ['s', lv >= 3 ? 0.12 : 0], ['chicane', lv >= 4 ? 0.1 : 0], ['hairpin', lv >= 5 ? 0.1 * way.hairpins : 0], ['crest', lv >= 6 ? 0.08 : 0], ['bend', 0.26]]
  const total = shapes.reduce((a, [, w]) => a + w, 0)
  const shape = () => { let r = rnd() * total; for (const [name, w] of shapes) { if (r < w) return name; r -= w } return 'bend' }
  const end = racingLength(lv) - 140
  add(0, 80, 0, 0, 0)
  let left = between(320, 520)
  while (track.length < end) {
    if (left <= 0) {
      // the next kind of road; the tunnel only out of the rock, and back into it
      if (zone === TUNNEL_FROM[world] && lv >= 6 && rnd() < 0.55) { zone = 'tunnel'; left = between(140, 240) }
      else if (zone === 'tunnel') { zone = TUNNEL_FROM[world]; left = between(160, 260) }
      else { const next = kinds.filter((k) => k !== zone); zone = pick(next); left = between(300, 560) }
    }
    const start = track.length
    const dir = rnd() < 0.5 ? -1 : 1
    const kind = zone === 'tunnel' ? 'tunnel' : shape()
    if (kind === 'tunnel') {
      // in the rock: gentle bends, no hills
      if (rnd() < 0.5) add(0, between(40, 90), 0, 0, 0)
      else add(30, between(60, 110), 30, dir * (1.5 + rnd() * 1.5), 0)
    } else if (kind === 'straight') add(0, between(50, 120), 0, 0, lv >= 3 && rnd() < 0.5 ? hill() : 0)
    else if (kind === 'sweeper') add(between(40, 60), between(100, 190), between(40, 60), dir * (1.5 + rnd() * 1.5), hill())
    else if (kind === 's') {
      const c = 2.5 + rnd() * (lv >= 6 ? 2.5 : 1.5)
      add(25, between(30, 60), 25, dir * c, hill())
      add(25, between(30, 60), 25, -dir * c, 0)
    } else if (kind === 'chicane') {
      const c = 4.5 + rnd() * 1.5
      add(12, between(8, 14), 12, dir * c, 0)
      add(12, between(8, 14), 12, -dir * c, 0)
    } else if (kind === 'hairpin') add(22, between(30, 50), 22, dir * (6 + rnd() * 1.2), hill())
    else if (kind === 'crest') {
      add(30, between(40, 70), 30, dir * (3 + rnd() * 2), hill(true))
      add(25, 20, 25, 0, -lastY() * 0.5)
    } else add(between(25, 45), between(40, 90), between(25, 45), dir * (3 + rnd() * (lv >= 5 ? 2 : 1.2)), hill())
    left -= track.length - start
  }
  // down to the level of the start, a straight to the line where the public is, and on past it
  zone = FINISH_ZONE[world]
  add(30, 70, 30, 0, -lastY())
  const finish = track.length
  add(0, RUNOFF, 0, 0, 0)
  dress(track, finish, lv, world)
  // the public at the start, at each checkpoint and all along the end, on both sides
  const cheer = (from: number, to: number, every: number) => { for (let i = Math.max(4, from); i < Math.min(track.length, to); i += every) if (track[i].zone !== 'tunnel') for (const side of [-1, 1]) track[i].things.push({ kind: 'crowd', x: side * 2.08, flip: side < 0, look: i * 2 + (side < 0 ? 1 : 0) }) }
  const checks = [Math.round(finish / 3), Math.round((finish * 2) / 3)]
  cheer(10, 70, 9)
  for (const c of checks) cheer(c - 30, c + 8, 8)
  // the end: the public all along the last straight and on past the line, thicker as the levels go
  cheer(finish - 70, finish + 130, Math.max(4, 8 - Math.floor(lv / 4)))
  // the checkpoints at a third and two thirds, each part's par
  const marks = [0, ...checks, finish]
  const pars = marks.slice(1).map((to, k) => { let steps = 0; for (let i = marks[k]; i < to; i += 1) steps += 1 / (RACING_TOP * bendLimit(track[i].curve, lv)); return steps / SECOND })
  const course: RacingCourse = { world, track, finish, checks, pars, items: placeItems(track, finish, lv, world), traffic: placeTraffic(finish, lv, world) }
  courses.set(key, course)
  return course
}

/**
 * What stands by a world's road, a little irregular, more of it (the
 * public, the shops) as the levels go. The coast: palms, bushes, parasols
 * and lifeguard towers, lamps on the promenade and the causeway, life at sea
 * and a lighthouse. The mountains: pines, rocks, boats on the lake, lamps in
 * the village. The desert: saguaros, shrubs, red rocks, tumbleweeds. The
 * city: palms and lamps along the streets, trees and fountains in the park,
 * traffic lights over the road, boats in the bay. Chevrons on the outside of
 * bends; the shops one after another where the world has them.
 */
function dress(track: RacingSegment[], finish: number, lv: number, world: RacingWorld): void {
  const place = seeded(77 + lv * 131 + RACING_WORLDS.indexOf(world) * 7)
  const shops = WORLD_SHOPS[world]
  // the gaps between the shops and between the groups of the public, closing up as the levels go
  const busy = Math.max(0.45, 1.15 - lv * 0.045), spacing = Math.max(0.45, 1.5 - lv * 0.065)
  const next: Record<string, number> = { palmL: 20, palmR: 30, lamp: 10, bush: 12, house: 6, houseL: 14, parasol: 30, tower: 90, boat: 40, fans: 30, tree: 8, treeL: 12, rock: 60, weed: 70, lights: 120, fountain: 60 }
  let turn = lv % shops.length, turnL = (lv + 3) % shops.length
  const thing = (seg: RacingSegment, kind: RacingThing['kind'], x: number, look = 0) => seg.things.push({ kind, x, flip: place() < 0.5, look })
  const due = (key: string, i: number, gap: number, spread: number) => { if (i < next[key]) return false; next[key] = i + gap + Math.floor(place() * spread); return true }
  /** A shop along this side if the road stays the same kind for its whole length. */
  const shopAt = (i: number, side: 'shop' | 'shopL') => {
    const k = side === 'shop' ? turn : turnL
    const kind = shops[(k + 1 + Math.floor(place() * 2)) % shops.length], len = SHOP_LENGTHS[kind]
    if (!track.slice(i, i + len).every((g) => g.zone === track[i].zone)) return false
    if (side === 'shop') turn = shops.indexOf(kind); else turnL = shops.indexOf(kind)
    for (let k2 = 0; k2 < len; k2 += 1) track[i + k2][side] = { kind, start: i, len }
    return len
  }
  track.forEach((seg, i) => {
    if (i < 24 || i > finish + 200) return
    const z = seg.zone
    if (z === 'tunnel') return
    if (Math.abs(seg.curve) >= 3 && i % 9 === 0) seg.things.push({ kind: 'chevron', x: seg.curve > 0 ? -1.95 : 1.95, flip: seg.curve < 0, look: 0 })
    const sides = SHOP_ZONES[z]
    if (sides && i >= next.house) { const len = shopAt(i, 'shop'); next.house = len ? i + len + Math.round((3 + place() * 9) * spacing) : i + 1 }
    if (sides === 'both' && i >= next.houseL) { const len = shopAt(i, 'shopL'); next.houseL = len ? i + len + Math.round((3 + place() * 9) * spacing) : i + 1 }
    if (world === 'coast') {
      if (z === 'beach' && due('palmL', i, 9, 14)) thing(seg, 'palm', -2.25 - place() * 0.9)
      if ((z === 'beach' || (z === 'promenade' && !seg.shop)) && due('palmR', i, 14, 18)) thing(seg, 'palm', 2.15 + place() * 1.2)
      if (z === 'beach' && due('bush', i, 4, 6)) thing(seg, 'bush', 2.0 + place() * 4.5)
      if ((z === 'promenade' || z === 'causeway') && due('lamp', i, 16, 0)) seg.things.push({ kind: 'lamp', x: -1.95, flip: false, look: 0 }, { kind: 'lamp', x: 1.95, flip: true, look: 0 })
      if (z === 'beach' && due('parasol', i, 8, 14)) thing(seg, 'parasol', -1.95 - place() * 0.12, Math.floor(place() * 3))
      if (z === 'beach' && due('tower', i, 180, 120)) thing(seg, 'tower', -2.02)
      if (due('boat', i, 22, 34)) {
        const r = place()
        const kind: RacingProp = r < 0.3 ? 'sailboat' : r < 0.52 ? 'buoy' : r < 0.67 ? 'windsurf' : r < 0.79 ? 'yacht' : r < 0.92 ? 'jetski' : 'dolphin'
        const side = z === 'causeway' && place() < 0.5 ? 1 : -1, near = kind === 'buoy' ? 3.0 + place() * 1.5 : 3.6 + place() * 7
        thing(seg, kind, side * (z === 'cliff' ? near + 1.5 : near), Math.floor(place() * 3))
      }
      if ((z === 'promenade' && i >= next.fans) || (z === 'beach' && i >= next.fans + 80)) { seg.things.push({ kind: 'crowd', x: z === 'promenade' ? 2.12 : -2.0, flip: false, look: i }); next.fans = i + Math.round((40 + place() * 40) * busy) }
    } else if (world === 'mountain') {
      if ((z === 'forest' || z === 'gorge') && due('tree', i, 5, 6) && z === 'forest') thing(seg, 'pine', 2.1 + place() * 3.6)
      if ((z === 'forest' || z === 'lake') && due('treeL', i, 5, 7) && z === 'forest') thing(seg, 'pine', -2.1 - place() * 3.6)
      if (z === 'lake' && due('tree', i, 6, 7)) thing(seg, 'pine', 2.1 + place() * 3.2)
      if ((z === 'forest' || z === 'gorge') && due('rock', i, 40, 40)) thing(seg, 'rock', (z === 'gorge' ? 1 : place() < 0.5 ? -1 : 1) * (2.05 + place() * 0.5))
      if (z === 'lake' && due('boat', i, 30, 40)) thing(seg, place() < 0.6 ? 'sailboat' : 'buoy', -3.4 - place() * 6, Math.floor(place() * 3))
      if (z === 'village' && due('lamp', i, 16, 0)) seg.things.push({ kind: 'lamp', x: -1.95, flip: false, look: 0 }, { kind: 'lamp', x: 1.95, flip: true, look: 0 })
      if (z === 'village' && i >= next.fans) { seg.things.push({ kind: 'crowd', x: place() < 0.5 ? 2.12 : -2.12, flip: false, look: i }); next.fans = i + Math.round((36 + place() * 30) * busy) }
    } else if (world === 'desert') {
      if ((z === 'dunes' || z === 'mesa' || z === 'town') && due('treeL', i, 10, 14)) thing(seg, 'saguaro', -2.2 - place() * 5)
      if ((z === 'dunes' || z === 'canyon') && due('tree', i, 11, 16) && z === 'dunes') thing(seg, 'saguaro', 2.2 + place() * 5)
      if (z !== 'canyon' && due('bush', i, 4, 6)) thing(seg, 'shrub', (z === 'town' || z === 'mesa' || place() < 0.5 ? -1 : 1) * (2.0 + place() * 5))
      if ((z === 'dunes' || z === 'mesa') && due('rock', i, 45, 50)) thing(seg, 'redrock', (z === 'mesa' ? -1 : place() < 0.5 ? -1 : 1) * (2.2 + place() * 3))
      if (z === 'dunes' && due('weed', i, 70, 90)) thing(seg, 'tumbleweed', 0, i)
      if (z === 'town' && i >= next.fans) { seg.things.push({ kind: 'crowd', x: -2.12, flip: false, look: i }); next.fans = i + Math.round((40 + place() * 30) * busy) }
    } else {
      if ((z === 'avenue' || z === 'downtown' || z === 'bridge' || z === 'park') && due('lamp', i, 14, 0)) seg.things.push({ kind: 'globe', x: -1.95, flip: false, look: 0 }, { kind: 'globe', x: 1.95, flip: true, look: 0 })
      if (z === 'avenue' && due('palmR', i, 16, 6)) seg.things.push({ kind: 'palm', x: -1.98, flip: place() < 0.5, look: 0 }, { kind: 'palm', x: 1.98, flip: place() < 0.5, look: 0 })
      if (z === 'park' && due('tree', i, 6, 6)) thing(seg, 'tree', 2.1 + place() * 3.5, Math.floor(place() * 3))
      if (z === 'park' && due('treeL', i, 6, 6)) thing(seg, 'tree', -2.1 - place() * 3.5, Math.floor(place() * 3))
      if (z === 'park' && due('fountain', i, 90, 60)) thing(seg, 'fountain', (place() < 0.5 ? -1 : 1) * 2.8)
      if ((z === 'avenue' || z === 'downtown') && due('lights', i, 180, 80)) thing(seg, 'lights', 0, i)
      if (z === 'bridge' && due('boat', i, 26, 30)) thing(seg, place() < 0.5 ? 'yacht' : 'sailboat', (place() < 0.5 ? -1 : 1) * (3.6 + place() * 6), Math.floor(place() * 3))
      if ((z === 'avenue' || z === 'downtown' || z === 'park') && i >= next.fans) { seg.things.push({ kind: 'crowd', x: place() < 0.5 ? 2.12 : -2.12, flip: false, look: i }); next.fans = i + Math.round((26 + place() * 26) * busy) }
    }
  })
  // the coast's lighthouse once, out on the sea's side, halfway
  if (world === 'coast') { const mid = track.findIndex((g, i) => i > finish * 0.45 && (g.zone === 'beach' || g.zone === 'cliff')); if (mid > 0) track[mid].things.push({ kind: 'lighthouse', x: -9.5, flip: false, look: 0 }) }
}

/**
 * What lies on the road, never in the first stretches nor on the last
 * straight, and never all three lanes shut: rows of five coins; stopwatches
 * now and then; the turbo where a straight begins; ketchup puddles and
 * roadworks closing a lane with cones (none in the tunnel), a few from the
 * first level, more as the levels go.
 */
function placeItems(track: RacingSegment[], finish: number, lv: number, world: RacingWorld): Array<Omit<RacingItem, 'taken'>> {
  const rnd = seeded(31 + lv * 977 + RACING_WORLDS.indexOf(world) * 4241)
  const items: Array<Omit<RacingItem, 'taken'>> = []
  const lane = () => RACING_LANES[Math.floor(rnd() * 3)]
  const from = 220, to = finish - 140
  const busy = (z0: number, z1: number) => items.some((it) => it.z >= z0 && it.z <= z1 && (it.kind === 'cone' || it.kind === 'puddle'))
  // roadworks: a lane shut for sixty stretches, a cone every six
  const works = 1 + Math.floor(lv / 4)
  for (let k = 0; k < works; k += 1) {
    const z0 = Math.round(from + ((k + 0.5) / works) * (to - from) + (rnd() - 0.5) * 200)
    if (track[z0]?.zone === 'tunnel' || busy(z0 - 40, z0 + 100)) continue
    const x = lane()
    for (let z = z0; z < z0 + 60; z += 6) items.push({ kind: 'cone', z, x })
  }
  // ketchup puddles
  const puddles = 2 + Math.floor(lv * 0.7)
  for (let k = 0; k < puddles; k += 1) {
    const z = Math.round(from + rnd() * (to - from))
    if (busy(z - 30, z + 30)) continue
    items.push({ kind: 'puddle', z, x: lane() })
  }
  // coins in rows, stopwatches, the turbo where a straight begins
  for (let z = from + 60; z < to; z += 260 + Math.floor(rnd() * 160)) { const x = lane(); if (!busy(z - 10, z + 40)) for (let k = 0; k < 5; k += 1) items.push({ kind: 'coin', z: z + k * 7, x }) }
  const watches = lv <= 4 ? 3 : 2
  for (let k = 0; k < watches; k += 1) { const z = Math.round(from + ((k + 0.7) / watches) * (to - from)); if (!busy(z - 15, z + 15)) items.push({ kind: 'time', z, x: lane() }) }
  // the turbo where a straight of sixty stretches or more begins, out of a bend; two at most, far apart
  const straight = (i: number) => { for (let k = i; k < i + 60; k += 1) if (Math.abs(track[k].curve) > 0.4) return false; return true }
  let turbos = 0
  for (let i = from + 100; i < to - 60 && turbos < 2; i += 1) {
    const outOfBend = track.slice(Math.max(0, i - 40), i).some((g) => Math.abs(g.curve) > 2)
    if (outOfBend && straight(i) && !busy(i - 10, i + 20) && track[i].zone !== 'tunnel') { items.push({ kind: 'turbo', z: i + 4, x: lane() }); turbos += 1; i += Math.round((to - from) / 2.5) }
  }
  if (!turbos) for (let i = from + 100; i < to - 60; i += 1) if (straight(i) && !busy(i - 10, i + 20)) { items.push({ kind: 'turbo', z: i + 4, x: lane() }); break }
  return items.sort((a, b) => a.z - b.z)
}

/** The traffic: the world's everyday cars spread along the road, two at the first level and more as the levels go; from the seventh, some swerve when the player comes. */
function placeTraffic(finish: number, lv: number, world: RacingWorld): Array<Omit<RacingTraffic, 'swerved'>> {
  const rnd = seeded(53 + lv * 613 + RACING_WORLDS.indexOf(world) * 3001)
  const MODELS: readonly RacingTrafficModel[] = WORLD_TRAFFIC[world]
  const n = Math.round(1.5 + lv * 0.75)
  return Array.from({ length: n }, (_, k) => {
    const lane = Math.floor(rnd() * 3)
    return {
      kind: MODELS[Math.floor(rnd() * MODELS.length)], look: Math.floor(rnd() * 9),
      z: Math.round(260 + ((k + rnd() * 0.8) / n) * (finish * 0.55)), x: RACING_LANES[lane], lane: RACING_LANES[lane],
      speed: RACING_TOP * (0.46 + rnd() * 0.16), swerve: lv >= 7 && rnd() < 0.35,
    }
  })
}

/** The stretch under a point of the road (the last one past the end). */
export const segmentOf = (track: RacingSegment[], z: number): RacingSegment => track[Math.max(0, Math.min(track.length - 1, Math.floor(z)))]
/** The road's height under a point. */
export function heightAt(track: RacingSegment[], z: number): number {
  const seg = segmentOf(track, z), t = z - Math.floor(z)
  return seg.y1 + (seg.y2 - seg.y1) * t
}
/** Where a level's finish line is, in stretches from the start. */
export const racingFinish = (level: number, world: RacingWorld = 'coast'): number => racingCourse(level, world).finish

/**
 * The clock: at the start, the first part's par with room to spare — a
 * quarter more at the first level, a fifth at the second and third (a
 * player still finding the car, in whichever world comes first), a twelfth
 * at the last (a little more in the storm, the road slippery and the rain in
 * the eyes) — and the same at each checkpoint for the part that follows.
 */
const roomFor = (level: number) => 1.2 - Math.min(RACING_LAST_LEVEL, level) * 0.007 + Math.max(0, 4 - level) * 0.02 + (racingStorm(level) ? 0.015 : 0)
export const racingTime = (level: number, world: RacingWorld = 'coast'): number => Math.round(racingCourse(level, world).pars[0] * roomFor(level) + 6)
export const racingExtension = (level: number, part: number, world: RacingWorld = 'coast'): number => Math.round(racingCourse(level, world).pars[part] * roomFor(level) + 1)

// ---------------------------------------------------------------- the race

export type RacingRival = {
  kind: RacingCarKind
  z: number
  x: number
  speed: number
  /** Its lane's middle, where it heads; its own pace, a hair over or under the level's; the step it may change lanes at. */
  lane: number
  pace: number
  next: number
  /** Whether it was ahead of the player at the last step; whether the player has passed it yet in this level (points the first time only). */
  ahead: boolean
  passed: boolean
}

export type RacingPhase = 'start' | 'play' | 'goal' | 'timeup' | 'won' | 'over'

export type RacingState = {
  layout: RacingLayout
  level: number
  /** A single level (a round of the Random flow): its end is the round's. */
  single: boolean
  car: RacingCarKind
  /** The world of each level in this game, drawn at its start; the world of this one. */
  worlds: RacingWorld[]
  world: RacingWorld
  track: RacingSegment[]
  finish: number
  checks: number[]
  /** The next checkpoint to reach (an index into `checks`). */
  check: number
  items: RacingItem[]
  traffic: RacingTraffic[]
  z: number
  x: number
  speed: number
  /** The way the player steers this step, for the screen (the car turns). */
  steer: -1 | 0 | 1
  rivals: RacingRival[]
  /** Steps left on the clock. */
  time: number
  phase: RacingPhase
  phaseTimer: number
  score: number
  /** Stretches run since the last point for the distance. */
  run: number
  place: number
  /** The points of the finish line: for the time left and for the place, and the place they were for. */
  bonus: { time: number; place: number; rank: number } | null
  /** The step the line was crossed at (the fireworks start from it), or -1. */
  goalAt: number
  /** Steps of the shake after a knock; whether the car is off the road (sand or bushes flying). */
  knock: number
  offroad: boolean
  /** Steps left of the turbo, of a skid (and which way it slides). */
  turbo: number
  skid: number
  skidWay: -1 | 1
  /** What the screen says for a moment: a checkpoint and its seconds, a stopwatch; and for how many steps more. */
  news: { text: string; steps: number } | null
  /** How far the far view has slid with the bends, in pixels. */
  view: number
  steps: number
  heard: RacingSound[]
  /** Levels cleared in a whole game. */
  passed: number
  rnd: () => number
}

/** The two cars that are not the player's, in the order they line up. */
export const rivalsOf = (car: RacingCarKind): RacingCarKind[] => RACING_CARS.filter((k) => k !== car)

function freshLevel(s: RacingState): void {
  s.world = s.worlds[s.level - 1]
  const course = racingCourse(s.level, s.world)
  s.track = course.track
  s.finish = course.finish
  s.checks = course.checks
  s.check = 0
  s.items = course.items.map((it) => ({ ...it, taken: false }))
  s.traffic = course.traffic.map((t) => ({ ...t, swerved: false }))
  s.z = 0
  s.x = 0
  s.speed = 0
  s.steer = 0
  s.time = racingTime(s.level, s.world) * SECOND
  s.phase = 'start'
  s.phaseTimer = 0
  s.run = 0
  s.bonus = null
  s.goalAt = -1
  s.knock = 0
  s.offroad = false
  s.turbo = 0
  s.skid = 0
  s.news = null
  // the grid as on the title: the three cars side by side, the player's in the middle; the rivals quicker off the line
  const pace = racingPace(s.level)
  s.rivals = rivalsOf(s.car).map((kind, i) => ({ kind, z: 0, x: RACING_LANES[i === 0 ? 0 : 2], speed: 0, lane: RACING_LANES[i === 0 ? 0 : 2], pace: pace * (i === 0 ? 1.025 : 0.975), next: 5 * SECOND + Math.floor(s.rnd() * 3 * SECOND), ahead: false, passed: false }))
  s.place = 1
}

/**
 * A race from `level`, the worlds of its levels drawn from `seed` (all of
 * them `options.world`, if given: the test page's).
 */
export function createRacing(layout: RacingLayout, level = 1, seed = 1, options: { single?: boolean; score?: number; car?: RacingCarKind; world?: RacingWorld } = {}): RacingState {
  const worlds = options.world ? Array.from({ length: RACING_LAST_LEVEL }, () => options.world!) : racingWorldOrder(seed)
  const s: RacingState = {
    layout, level: Math.max(1, Math.min(RACING_LAST_LEVEL, level)), single: !!options.single, car: options.car ?? 'burger', worlds, world: worlds[0],
    track: [], finish: 0, checks: [], check: 0, items: [], traffic: [], z: 0, x: 0, speed: 0, steer: 0, rivals: [], time: 0, phase: 'start', phaseTimer: 0,
    score: options.score ?? 0, run: 0, place: 3, bonus: null, goalAt: -1, knock: 0, offroad: false, turbo: 0, skid: 0, skidWay: 1, news: null, view: 0, steps: 0, heard: [], passed: 0, rnd: seeded(seed),
  }
  freshLevel(s)
  return s
}

/**
 * One step of the race: `steer` the way the player steers (−1 left, 1
 * right), `gas` whether A is held, `brake` whether B is.
 */
export function stepRacing(s: RacingState, steer: -1 | 0 | 1 = 0, gas = false, brake = false): void {
  s.heard = []
  s.steps += 1
  if (s.knock > 0) s.knock -= 1
  if (s.news && --s.news.steps <= 0) s.news = null
  if (s.phase === 'won' || s.phase === 'over') return
  if (s.phase === 'start') {
    // the lights: three reds a second apart, then green
    if (s.phaseTimer % SECOND === 0 && s.phaseTimer < RACING_START_STEPS) s.heard.push('beep')
    s.phaseTimer += 1
    s.steer = steer
    if (s.phaseTimer >= RACING_START_STEPS) { s.phase = 'play'; s.phaseTimer = 0; s.heard.push('go') }
    return
  }
  s.phaseTimer += 1
  const rolling = s.phase === 'goal' || s.phase === 'timeup'
  // past the line or out of time, the car drives itself: lifting off, back to the middle
  if (rolling) { steer = Math.abs(s.x) > 0.1 ? (s.x > 0 ? -1 : 1) : 0; gas = s.phase === 'goal' && s.speed < RACING_TOP * 0.45; brake = s.phase === 'timeup' }
  drive(s, steer, gas, brake)
  stepRivals(s)
  stepTraffic(s)
  touchCars(s)
  if (!rolling) pickUp(s)
  placeAndPasses(s, rolling)
  if (s.phase === 'play') {
    // the distance's points; the clock; the checkpoints
    s.run += s.speed
    while (s.run >= 5) { s.run -= 5; s.score += 1 }
    s.time -= 1
    if (s.time > 0 && s.time <= 5 * SECOND && s.time % SECOND === 0) s.heard.push('beep')
    if (s.check < s.checks.length && s.z >= s.checks[s.check]) {
      s.check += 1
      const more = racingExtension(s.level, s.check, s.world)
      s.time += more * SECOND
      s.news = { text: `CHECKPOINT +${more}`, steps: 2 * SECOND }
      s.heard.push('gold')
    }
    if (s.z >= s.finish) {
      // the line: the time left and the place, in points
      const left = Math.ceil(s.time / SECOND)
      s.bonus = { time: left * 50, place: [1000, 400, 100][s.place - 1] ?? 0, rank: s.place }
      s.score += s.bonus.time + s.bonus.place
      s.phase = 'goal'
      s.phaseTimer = 0
      s.goalAt = s.steps
      s.turbo = 0
      s.heard.push('level')
    } else if (s.time <= 0) { s.time = 0; s.phase = 'timeup'; s.phaseTimer = 0 }
  } else if (s.phase === 'goal' && s.phaseTimer >= GOAL_STEPS) {
    if (s.single || s.level >= RACING_LAST_LEVEL) s.phase = 'won'
    else { s.passed += 1; s.level += 1; freshLevel(s) }
  } else if (s.phase === 'timeup' && s.phaseTimer >= TIMEUP_STEPS) s.phase = 'over'
}

/** The player's car: speed from the pedals and the turbo, the bend pushing it out, the steering (none while it skids), the sand, the rails. */
function drive(s: RacingState, steer: -1 | 0 | 1, gas: boolean, brake: boolean): void {
  const seg = segmentOf(s.track, s.z)
  const top = s.turbo > 0 ? TURBO_TOP : RACING_TOP
  if (s.turbo > 0) { s.turbo -= 1; gas = true }
  if (brake) s.speed -= BRAKE
  else if (gas) s.speed += ACCEL * (s.turbo > 0 ? 2.2 : 1) * (1 - 0.35 * Math.min(1, s.speed / RACING_TOP))
  else s.speed -= COAST
  if (s.speed > top) s.speed = Math.max(top, s.speed - COAST * 3)
  s.offroad = Math.abs(s.x) > RACING_KERB
  if (s.offroad && s.speed > OFFROAD_TOP) s.speed -= OFFROAD
  s.speed = Math.max(0, s.speed)
  const share = s.speed / RACING_TOP
  if (s.skid > 0) {
    // sliding on ketchup: the wheels do not answer, the car slews
    s.skid -= 1
    s.steer = s.skidWay
    s.x += s.skidWay * 0.016 * Math.min(1, share * 1.3)
    s.speed *= 0.992
  } else {
    s.steer = steer
    s.x += steer * STEER * Math.min(1, share * 1.25)
  }
  s.x -= STEER * share * share * seg.curve * CENTRIFUGAL * grip(s.level)
  // the far view slides as the road turns, a little; back to its place along the straights
  s.view += seg.curve * share * 0.045
  if (Math.abs(seg.curve) < 0.5) s.view *= 0.997
  // the rails: a knock, the car thrown back a little
  const wall = RACING_RAIL - RACING_CAR_WIDTH / 2
  if (Math.abs(s.x) > wall) {
    if (s.speed > RACING_TOP * 0.25 && s.knock === 0) { s.heard.push('thud'); s.knock = 20 }
    s.speed = Math.min(s.speed, RACING_TOP * 0.5) * 0.92
    s.x = Math.sign(s.x) * (wall - 0.04)
    s.skid = 0
  }
  s.z += s.speed
}

/** A car on the road ahead of another, in the same lane and close: the one behind keeps behind it. */
const blocking = (z: number, x: number, others: ReadonlyArray<{ z: number; x: number; speed: number }>, reach = CAR_LENGTH + 2) =>
  others.filter((o) => o.z > z && o.z - z < reach && Math.abs(o.x - x) < RACING_CAR_WIDTH).reduce<number | null>((m, o) => (m == null || o.speed < m ? o.speed : m), null)

/**
 * The rivals: each at its pace, slower where a bend asks it; round the
 * traffic and one another; changing lanes now and then; and, from the fifth
 * level, moving across to block the player coming up behind.
 */
function stepRivals(s: RacingState): void {
  for (const r of s.rivals) {
    const seg = segmentOf(s.track, r.z + 20)
    let want = RACING_TOP * Math.min(r.pace, bendLimit(seg.curve, s.level) * RIVAL_BEND)
    // a little slower once well ahead, a little quicker once well behind: the race stays a race
    const gap = r.z - s.z
    if (gap > 260) want *= 0.95
    else if (gap < -220) want = Math.min(RACING_TOP * 0.98, want * 1.06)
    if (s.phase === 'timeup') want = Math.min(want, r.speed)
    r.speed += r.speed < want ? ACCEL * 1.4 : -Math.min(BRAKE * 0.4, r.speed - want)
    r.speed = Math.max(0, r.speed)
    const others = [...s.rivals.filter((o) => o !== r), ...s.traffic]
    // traffic or a cone ahead in its lane: another lane if one is free, else it keeps behind
    const ahead = (lane: number, reach: number) => others.some((o) => o.z > r.z && o.z - r.z < reach && Math.abs(o.x - lane) < RACING_CAR_WIDTH) || s.items.some((it) => it.kind === 'cone' && !it.taken && it.z > r.z && it.z - r.z < reach && Math.abs(it.x - lane) < 0.3)
    if (ahead(r.lane, 40)) {
      const free = RACING_LANES.filter((l) => l !== r.lane && !ahead(l, 40))
      if (free.length) r.lane = free.reduce((a, b) => (Math.abs(b - r.x) < Math.abs(a - r.x) ? b : a))
    }
    const slow = blocking(r.z, r.x, others)
    if (slow != null) r.speed = Math.min(r.speed, slow)
    if (s.steps >= r.next) {
      r.next = s.steps + 3 * SECOND + Math.floor(s.rnd() * 4 * SECOND)
      const behind = s.z - r.z
      // the player close behind and coming: from the fifth level, now and then, it moves across
      if (s.level >= 5 && behind < -4 && behind > -40 && s.speed > r.speed && s.rnd() < (s.level - 4) * 0.07) r.lane = RACING_LANES.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a))
      else {
        const free = RACING_LANES.filter((l) => l !== r.lane && !ahead(l, 30) && !s.rivals.some((o) => o !== r && Math.abs(o.z - r.z) < 30 && Math.abs(o.lane - l) < 0.1))
        if (free.length) r.lane = free[Math.floor(s.rnd() * free.length)]
      }
    }
    r.x += Math.max(-0.012, Math.min(0.012, r.lane - r.x))
    r.z += r.speed
  }
}

/** The traffic: each car at its speed, slower in the sharp bends; one that swerves moves into another lane as the player comes near. */
function stepTraffic(s: RacingState): void {
  for (const t of s.traffic) {
    const seg = segmentOf(s.track, t.z + 15)
    const speed = Math.min(t.speed, RACING_TOP * bendLimit(seg.curve, s.level) * 0.85)
    if (t.swerve && !t.swerved && t.z - s.z < 32 && t.z > s.z) {
      t.swerved = true
      const near = RACING_LANES.filter((l) => l !== t.lane).sort((a, b) => Math.abs(a - s.x) - Math.abs(b - s.x))
      t.lane = near[0]
    }
    t.x += Math.max(-0.01, Math.min(0.01, t.lane - t.x))
    t.z += speed
  }
}

/** The player's car against the other cars: running into one from behind brings it down to that car's speed; a rival running into it is held back. */
function touchCars(s: RacingState): void {
  const touch = (c: { z: number; x: number; speed: number }, rival: boolean) => {
    const dz = c.z - s.z
    if (Math.abs(dz) >= CAR_LENGTH || Math.abs(c.x - s.x) >= RACING_CAR_WIDTH * 0.92) return
    if (dz >= 0 && s.speed > c.speed) {
      if (s.knock === 0) { s.heard.push('thud'); s.knock = 20 }
      s.speed = c.speed * 0.8
      s.turbo = 0
      s.z = c.z - CAR_LENGTH
      // thrown a little aside
      s.x += s.x >= c.x ? 0.08 : -0.08
    } else if (dz < 0 && rival && c.speed > s.speed) {
      c.speed = s.speed * 0.9
      c.z = s.z - CAR_LENGTH
    }
  }
  for (const r of s.rivals) touch(r, true)
  for (const t of s.traffic) touch(t, false)
}

/** What the car runs over: a stopwatch, the turbo, a coin; a puddle (a skid); a cone (a knock). */
function pickUp(s: RacingState): void {
  for (const it of s.items) {
    if (it.taken || it.z < s.z - 3) continue
    if (it.z > s.z + 3) break
    if (Math.abs(it.x - s.x) > (it.kind === 'puddle' ? 0.42 : 0.36)) continue
    it.taken = true
    if (it.kind === 'time') { s.time += STOPWATCH; s.news = { text: 'TIME +3', steps: 70 }; s.heard.push('note') }
    else if (it.kind === 'turbo') { s.turbo = TURBO_STEPS; s.news = { text: 'TURBO!', steps: 70 }; s.heard.push('power') }
    else if (it.kind === 'coin') { s.score += 100; s.heard.push('coin') }
    else if (it.kind === 'puddle') { if (s.speed > RACING_TOP * 0.3) { s.skid = SKID_STEPS; s.skidWay = s.rnd() < 0.5 ? -1 : 1; s.heard.push('slip') } }
    else { s.speed = Math.min(s.speed, RACING_TOP * 0.55); s.turbo = 0; s.knock = Math.max(s.knock, 12); s.heard.push('clink') }
  }
}

/** The place in the race, and the points the first time each rival is passed. */
function placeAndPasses(s: RacingState, rolling: boolean): void {
  let ahead = 0
  for (const r of s.rivals) {
    const now = r.z > s.z
    if (now) ahead += 1
    else if (r.ahead && !r.passed && !rolling) { r.passed = true; s.score += 100; s.heard.push('whoosh') }
    r.ahead = now
  }
  s.place = ahead + 1
}

/** The largest score a level can give, at most, in whichever world it is: every stretch (and a quarter more, for the road driven again after a knock), every rival passed, every coin, first place, the whole clock left with every stopwatch. */
export function racingLevelMax(level: number): number {
  return Math.max(...RACING_WORLDS.map((world) => {
    const course = racingCourse(level, world)
    const coins = course.items.filter((it) => it.kind === 'coin').length
    const watches = course.items.filter((it) => it.kind === 'time').length
    const clock = racingTime(level, world) + course.checks.reduce((sum, _, k) => sum + racingExtension(level, k + 1, world), 0) + watches * 3
    return Math.ceil((course.finish / 5) * 1.25) + 200 + coins * 100 + 1000 + clock * 50
  }))
}
