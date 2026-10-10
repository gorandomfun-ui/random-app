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
 * The three cars drive their own way — the red one faster on the
 * straights, the yellow one quicker off the mark, the burger surer in the
 * bends — and grow better level after level: after each, the player picks
 * one improvement out of three. The start is won or lost at the lights: A
 * pressed on the third red light, a perfect start and a burst of speed;
 * pressed too soon, the wheels spin.
 *
 * The turbo is earned by taking risks: brushing past a car (several running,
 * a combo), riding in a car's slipstream, taking a sharp bend at its limit,
 * the mustard bottle; the gauge full enough, the turbo button lets it go.
 *
 * On the road: stopwatches (+3 seconds), coins in a row; and what is not expected: ketchup puddles that
 * send the car skidding, roadworks closing a lane with cones, slow traffic to
 * get past — some of it swerving into another lane as the player comes — and
 * rivals that move across to block. Two checkpoints add time to the clock;
 * the clock at zero, it is over; the finish line in time clears the level,
 * with points for the time left and the place.
 *
 * In the middle of each level from the second, the road divides: two roads
 * offering different things, the side the car is on taking one.
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
import { CHARACTER_SHAPES, FEATURED_ZONE, FINISH_ZONE, RACING_CHARACTERS, racingWorldOrder, RACING_WORLDS, SHOP_LENGTHS, SHOP_ZONES, TUNNEL_FROM, WORLD_ROADS, WORLD_SHOPS, WORLD_TRAFFIC, WORLD_ZONES, type RacingCharacter, type RacingWorld, type RacingZone } from './racing-worlds'

export type RacingLayout = 'landscape' | 'portrait'
export type { RacingCarKind, RacingCharacter, RacingWorld, RacingZone }
export { RACING_CHARACTERS, RACING_WORLDS, racingWorldOrder }
/** A level's character: what its road is mostly made of. */
export const racingCharacter = (level: number): RacingCharacter => RACING_CHARACTERS[Math.max(1, Math.min(RACING_LAST_LEVEL, level)) - 1]
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

/** Top speed, in stretches a step: shown as 290 km/h (each car a little more or less, more once improved); with the turbo, more. */
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

/**
 * What a car is made of: its top speed, its acceleration, its grip in the
 * bends, its turbo (how fast the gauge fills, how long a turbo lasts) — in
 * points, from 1; each car eight at the start, its own way, and one more
 * after each level cleared, up to `STAT_MAX` in each.
 */
export type RacingStat = 'speed' | 'accel' | 'grip' | 'turbo'
export const RACING_STATS: readonly RacingStat[] = ['speed', 'accel', 'grip', 'turbo']
export const CAR_STATS: Record<RacingCarKind, Record<RacingStat, number>> = {
  rosso: { speed: 3, accel: 1, grip: 2, turbo: 2 },
  giallo: { speed: 2, accel: 3, grip: 1, turbo: 2 },
  burger: { speed: 1, accel: 2, grip: 3, turbo: 2 },
}
export const STAT_MAX = 8
/** What the points give: the top speed (a share of `RACING_TOP`), the acceleration's, the grip's and the turbo's factors. */
export const statTop = (speed: number): number => RACING_TOP * (0.97 + speed * 0.015)
const statAccel = (accel: number) => 0.85 + accel * 0.1
export const statGrip = (grip: number): number => 0.9 + grip * 0.05
const statTurbo = (turbo: number) => 0.8 + turbo * 0.1
/** The car a level is built for: eight points shared out, and one more for each level before it. */
const usualPoints = (level: number) => 2 + (Math.min(RACING_LAST_LEVEL, level) - 1) / 4
/** A car's points at a level of a single round: its own, and the improvements it would have had by then, each to its weakest point in turn. */
export function racingStatsAt(car: RacingCarKind, level: number): Record<RacingStat, number> {
  const stats = { ...CAR_STATS[car] }
  for (let k = 1; k < Math.min(RACING_LAST_LEVEL, level); k += 1) {
    const weakest = RACING_STATS.filter((n) => stats[n] < STAT_MAX).reduce((a, b) => (stats[b] < stats[a] ? b : a))
    stats[weakest] += 1
  }
  return stats
}

/** The start: three red lights a second apart, then green. */
export const RACING_START_STEPS = 3 * SECOND
/** The finish line crossed: the car rolls on while the points add up; the clock at zero: it comes to a stop. */
const GOAL_STEPS = 3 * SECOND
const TIMEUP_STEPS = 2 * SECOND
/** Past the finish line the road goes on, so the car has somewhere to roll. */
const RUNOFF = 500
/** The turbo's length with a full gauge, a skid's, what a stopwatch gives. */
const TURBO_STEPS = 4 * SECOND
const SKID_STEPS = 45
const STOPWATCH = 3 * SECOND
/** The start: A pressed during the last red light and held, a burst of speed; held from before it, the wheels spin. */
const LAUNCH_FROM = 2 * SECOND
const LAUNCH_BOOST = 1.2 * SECOND
const SPIN_STEPS = 0.8 * SECOND
/** The gauge: what each risk gives; what it takes to let the turbo go. */
const NEAR_MISS = 0.2
const DRAFT_FILL = 0.006
const LIMIT_FILL = 0.0025
const BOTTLE_FILL = 0.6
const BOOST_MIN = 0.3
/** Brushing past cars one after another within this long counts as a combo; each brush's points (times the combo, up to five). */
const COMBO_STEPS = 3 * SECOND
const NEAR_POINTS = 50

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
export type RacingScenery = 'pine' | 'rock' | 'saguaro' | 'butte' | 'shrub' | 'redrock' | 'crag' | 'tumbleweed' | 'globe' | 'tree' | 'fountain' | 'lights'
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

/**
 * The two roads of the fork in the middle of a level: what each offers —
 * bends and coins (and a stopwatch), a fast road and the mustard, a run
 * under the mountain with time to gain. Both as long, both back on the same
 * road at their end.
 */
export type RacingForkKind = 'bends' | 'fast' | 'tunnel'
export const RACING_FORK_KINDS: readonly RacingForkKind[] = ['bends', 'fast', 'tunnel']
export type RacingFork = { at: number; len: number; kinds: [RacingForkKind, RacingForkKind]; tracks: [RacingSegment[], RacingSegment[]]; items: [Array<Omit<RacingItem, 'taken'>>, Array<Omit<RacingItem, 'taken'>>] }
/** How long each road of the fork runs, and how far before it the side the car is on decides. */
export const FORK_LEN = 480
export const FORK_DECIDE = 30

/** A level's road and what is on it, always the same for the level (with its fork's right-hand road, until the player takes the left). */
export type RacingCourse = {
  world: RacingWorld
  fork: RacingFork | null
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
export const racingPace = (level: number): number => 0.84 + Math.min(RACING_LAST_LEVEL, level) * 0.005
const RIVAL_BEND = 0.93
/**
 * A rival left behind comes back: the further behind (up to `RIVAL_REACH`
 * stretches), the nearer it drives to its top speed — the player's at the
 * first level, a little over it at the last — so it stays in the mirror and
 * a knock, a skid or a lift too many lets it by. Ahead, it eases off the
 * further it gets, so the player can always come back on it.
 */
const RIVAL_REACH = 30
/** From the third level a rival left behind fires a turbo of its own now and then, on a straight: two seconds, then a while before the next (shorter as the levels go). */
const RIVAL_TURBO = 2 * SECOND
const RIVAL_COOL = 12 * SECOND
const rivalCool = (level: number) => Math.round(RIVAL_COOL * (1.3 - Math.min(RACING_LAST_LEVEL, level) * 0.04))
const rivalTop = (level: number) => RACING_TOP * (0.998 + Math.min(RACING_LAST_LEVEL, level) * 0.002)
/** How fast a car can take a bend of `curve` and still hold it, steering all the way in: a share of the top speed. */
export const bendLimit = (curve: number, level = 1): number => (Math.abs(curve) < 1e-6 ? 1 : Math.min(1, Math.sqrt(1 / (CENTRIFUGAL * grip(level) * Math.abs(curve)))))
/** How fast a car with this top speed and this grip can take a bend, steering all the way in. */
export const bendSpeed = (curve: number, level: number, top: number, carGrip: number): number => (Math.abs(curve) < 1e-6 ? top : Math.min(top, RACING_TOP * Math.sqrt(carGrip / (CENTRIFUGAL * grip(level) * Math.abs(curve)))))
/** The same for the car a level is built for: what its clock and its rivals go by. */
const usualSpeed = (curve: number, level: number) => bendSpeed(curve, level, statTop(usualPoints(level)), statGrip(usualPoints(level)))
/** The player's car's own, now. */
export const racingBendSpeed = (s: RacingState, curve: number): number => bendSpeed(curve, s.level, statTop(s.stats.speed), statGrip(s.stats.grip))

const courses = new Map<string, RacingCourse>()
/** The steepest a stretch of road rises or falls (in half widths a stretch), and the highest or lowest it goes from the start's level. */
const MAX_SLOPE = 0.12
const MAX_HEIGHT = 10

/**
 * A level's road in a world. Its kinds come one after another, a few
 * hundred stretches each — the world's first two from the first level, the
 * third from the second, the fourth from the fourth, the tunnel from the
 * sixth (out of the rock and back into it) — and its bends with them:
 * sweepers and bends at first, S bends from the third, chicanes from the
 * fourth, hairpins from the fifth, bends over a crest from the sixth; hills
 * from the third, higher from the seventh and the eleventh; each world its
 * own way (`WORLD_ROADS`: the mountains' hills and hairpins, the desert's
 * straights and sweepers, the city's flat streets). On top of that, each
 * level its character (`RACING_CHARACTERS`): mostly its own shape of road,
 * starting on and coming back to its own kind of road — a sprint's long
 * straights, a twisty level's S bends, the long run through the rock. A
 * straight for the grid, a straight to the line where the public is, the
 * run-off past it.
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
  const character = racingCharacter(lv), featured = FEATURED_ZONE[world][character], bias = CHARACTER_SHAPES[character]
  const track: RacingSegment[] = []
  const lastY = () => (track.length ? track[track.length - 1].y2 : 0)
  let zone: RacingZone = featured
  const add = (enter: number, hold: number, leave: number, curve: number, height: number) => {
    // never steeper than a road can be climbed: the rise bounded by the piece's length, the height kept within reach of the start's
    const total = enter + hold + leave, steepest = (total * MAX_SLOPE) / (Math.PI / 2)
    const y0 = lastY(), y1 = Math.max(-MAX_HEIGHT, Math.min(MAX_HEIGHT, y0 + Math.max(-steepest, Math.min(steepest, height))))
    let n = 0
    const push = (c: number) => { track.push({ curve: c, y1: easeInOut(y0, y1, n / total), y2: easeInOut(y0, y1, (n + 1) / total), zone, things: [] }); n += 1 }
    for (let i = 0; i < enter; i += 1) push(easeIn(0, curve, i / enter))
    for (let i = 0; i < hold; i += 1) push(curve)
    for (let i = 0; i < leave; i += 1) push(easeInOut(curve, 0, i / leave))
  }
  // up or down, back toward the start's level when the road has climbed or dropped far; flat on the water and in the tunnel
  // a hills level's hills higher, and from its start
  const hilly = character === 'hills' ? 2.2 : character === 'sprint' ? 0.6 : 1
  const hill = (bigger = false) => {
    if (zone === 'causeway' || zone === 'bridge' || zone === 'tunnel' || zone === 'lake') return 0
    const size = (lv >= 11 ? pick([4, 6]) : lv >= 7 ? pick([2, 4]) : lv >= 3 ? pick([0, 2]) : character === 'hills' ? 2 : 0) + (bigger && lv >= 3 ? 2 : 0)
    return Math.round(size * way.hills * hilly) * (lastY() > 3 ? -1 : lastY() < -3 ? 1 : rnd() < 0.5 ? -1 : 1)
  }
  const kinds = [...new Set([...zones.filter((z, k) => z !== 'tunnel' && (k < 2 || (k === 2 && lv >= 2) || (k === 3 && lv >= 4))), featured])]
  // how often each shape of road comes, in this world and this level's character; its own shapes whatever the level
  const gate = (name: keyof typeof bias, from: number) => (lv >= from || (bias[name] ?? 1) >= 3 ? bias[name] ?? 1 : 0)
  const shapes: Array<[string, number]> = [
    ['straight', 0.18 * way.straights * gate('straight', 1)], ['sweeper', 0.16 * way.sweepers * gate('sweeper', 1)], ['s', 0.12 * gate('s', 3)],
    ['chicane', 0.1 * gate('chicane', 4)], ['hairpin', 0.1 * way.hairpins * gate('hairpin', 5)], ['crest', 0.08 * gate('crest', 6)], ['bend', 0.26 * gate('bend', 1)],
  ]
  const total = shapes.reduce((a, [, w]) => a + w, 0)
  const shape = () => { let r = rnd() * total; for (const [name, w] of shapes) { if (r < w) return name; r -= w } return 'bend' }
  // the next kind of road: the level's own three times as often as each other
  const nextZone = () => { const next = kinds.filter((k) => k !== zone), w = next.map((k) => (k === featured ? 3 : 1)); let r = rnd() * w.reduce((a, b) => a + b, 0); for (let k = 0; k < next.length; k += 1) { if (r < w[k]) return next[k]; r -= w[k] } return next[0] }
  const end = racingLength(lv) - 140
  add(0, 80, 0, 0, 0)
  let left = between(320, 520), tunnels = 0
  // from the second level, a fork a little past the first checkpoint: its place kept straight and flat, its two roads made afterwards
  const forkFrom = lv >= 2 ? Math.round(end * 0.38) : Infinity
  let forkAt = -1
  while (track.length < end) {
    if (forkAt < 0 && track.length >= forkFrom && zone !== 'tunnel') {
      forkAt = track.length
      add(0, FORK_LEN, 0, 0, 0)
      left -= FORK_LEN
      continue
    }
    if (left <= 0) {
      // the next kind of road; the tunnel only out of the rock, and back into it — a tunnel level's long, twice
      const long = character === 'tunnel' && tunnels < 2
      if (zone === TUNNEL_FROM[world] && (long || (lv >= 6 && rnd() < 0.55))) { zone = 'tunnel'; left = long ? between(420, 640) : between(140, 240); tunnels += 1 }
      else if (zone === 'tunnel') { zone = TUNNEL_FROM[world]; left = between(160, 260) }
      else if (character === 'tunnel' && tunnels < 2) { zone = TUNNEL_FROM[world]; left = between(120, 200) }
      else { zone = nextZone(); left = between(300, 560) }
    }
    const start = track.length
    const dir = rnd() < 0.5 ? -1 : 1
    const kind = zone === 'tunnel' ? 'tunnel' : shape()
    if (kind === 'tunnel') {
      // in the rock: gentle bends, no hills
      if (rnd() < 0.5) add(0, between(40, 90), 0, 0, 0)
      else add(30, between(60, 110), 30, dir * (1.5 + rnd() * 1.5), 0)
    } else if (kind === 'straight') add(0, character === 'sprint' ? between(120, 260) : between(50, 120), 0, 0, (lv >= 3 || character === 'hills') && (character === 'hills' || rnd() < 0.5) ? hill() : 0)
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
  // down to the level of the start, as gently as it takes, a straight to the line where the public is, and on past it
  zone = FINISH_ZONE[world]
  while (Math.abs(lastY()) > 0.05) add(30, 70, 30, 0, -lastY())
  const finish = track.length
  add(0, RUNOFF, 0, 0, 0)
  // the fork's two roads, each as long, flat at the place's height; the right-hand one laid down, the left one kept for the player's choice
  const fork = forkAt >= 0 ? forkRoads(forkAt, track, lv, world) : null
  if (fork) for (let k = 0; k < FORK_LEN; k += 1) track[forkAt + k] = fork.tracks[1][k]
  const open: [number, number] | null = fork ? [forkAt - 100, forkAt + 80] : null
  dress(track, finish, lv, world, fork ? [forkAt - 100, forkAt, forkAt + 80, forkAt + FORK_LEN] : [], null, 0, open)
  if (fork) {
    // what stands by the left-hand road, dressed on its own
    const other = track.slice()
    for (let k = 0; k < FORK_LEN; k += 1) other[forkAt + k] = fork.tracks[0][k]
    dress(other, finish, lv, world, [forkAt + 80, forkAt + FORK_LEN], [forkAt, forkAt + FORK_LEN], 1, open)
  }
  // the public at the start, at each checkpoint and all along the end, on both sides
  const cheer = (from: number, to: number, every: number) => { for (let i = Math.max(4, from); i < Math.min(track.length, to); i += every) if (track[i].zone !== 'tunnel') for (const side of [-1, 1]) track[i].things.push({ kind: 'crowd', x: side * 2.08, flip: side < 0, look: i * 2 + (side < 0 ? 1 : 0) }) }
  const checks = [Math.round(finish / 3), Math.round((finish * 2) / 3)]
  cheer(10, 70, 9)
  for (const c of checks) cheer(c - 30, c + 8, 8)
  // the end: the public all along the last straight and on past the line, thicker as the levels go
  cheer(finish - 70, finish + 130, Math.max(4, 8 - Math.floor(lv / 4)))
  // the checkpoints at a third and two thirds, each part's par
  const marks = [0, ...checks, finish]
  // each part's par: with the fork, the two roads' pars taken half and half
  const curveAt = (i: number, k: 0 | 1) => (fork && i >= fork.at && i < fork.at + FORK_LEN ? fork.tracks[k][i - fork.at].curve : track[i].curve)
  const pars = marks.slice(1).map((to, part) => { let steps = 0; for (let i = marks[part]; i < to; i += 1) steps += (1 / usualSpeed(curveAt(i, 0), lv) + 1 / usualSpeed(curveAt(i, 1), lv)) / 2; return steps / SECOND })
  let items = placeItems(track, finish, lv, world)
  if (fork) items = [...items.filter((it) => it.z < fork.at || it.z >= fork.at + FORK_LEN), ...fork.items[1]].sort((a, b) => a.z - b.z)
  const course: RacingCourse = { world, fork, track, finish, checks, pars, items, traffic: placeTraffic(finish, lv, world) }
  courses.set(key, course)
  return course
}

/**
 * The fork's two roads, at stretch `at` of a level: two of its kinds, drawn
 * for the level. Each starts with forty stretches straight (the two alike
 * while the car decides), then its own way — S bends and chicanes; long
 * straights and a sweeper; a run through the rock — and ends straight, back
 * on the road; flat at the height of the place they are on; with what each
 * offers on it.
 */
function forkRoads(at: number, track: RacingSegment[], lv: number, world: RacingWorld): RacingFork {
  const rnd = seeded(4099 + lv * 271 + RACING_WORLDS.indexOf(world) * 53)
  // the three pairs in turn from level to level (and world to world), which on the left drawn
  const pairs: Array<[RacingForkKind, RacingForkKind]> = [['bends', 'fast'], ['fast', 'tunnel'], ['bends', 'tunnel']]
  const pair = pairs[(lv + RACING_WORLDS.indexOf(world)) % pairs.length]
  const two: [RacingForkKind, RacingForkKind] = rnd() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]]
  const y = track[at].y1, here = track[at].zone
  const road = (kind: RacingForkKind): RacingSegment[] => {
    const out: RacingSegment[] = []
    const piece = (enter: number, hold: number, leave: number, curve: number, zone: RacingZone) => {
      for (let i = 0; i < enter; i += 1) out.push({ curve: easeIn(0, curve, i / enter), y1: y, y2: y, zone, things: [] })
      for (let i = 0; i < hold; i += 1) out.push({ curve, y1: y, y2: y, zone, things: [] })
      for (let i = 0; i < leave; i += 1) out.push({ curve: easeInOut(curve, 0, i / leave), y1: y, y2: y, zone, things: [] })
    }
    piece(0, 40, 0, 0, here)
    const inside = kind === 'tunnel' ? 'tunnel' : here
    // its own way while a whole piece still fits before its end
    while (out.length < FORK_LEN - 270) {
      const dir = rnd() < 0.5 ? -1 : 1
      if (kind === 'bends') {
        if (rnd() < 0.55) { const c = 3.5 + rnd() * 2; piece(18, 20 + Math.round(rnd() * 16), 18, dir * c, inside); piece(18, 20 + Math.round(rnd() * 16), 18, -dir * c, inside) }
        else { const c = 4.5 + rnd() * 1.2; piece(12, 8, 12, dir * c, inside); piece(12, 8, 12, -dir * c, inside) }
      } else if (kind === 'fast') {
        if (rnd() < 0.5) piece(0, 60 + Math.round(rnd() * 40), 0, 0, inside)
        else piece(30, 50 + Math.round(rnd() * 30), 30, dir * (1.2 + rnd() * 0.6), inside)
      } else piece(25, 30 + Math.round(rnd() * 30), 25, dir * (1.4 + rnd() * 1.2), inside)
    }
    // straight to its end, out of the rock forty stretches before it, back on the road
    const rest = FORK_LEN - out.length
    if (kind === 'tunnel') { piece(0, Math.max(0, rest - 40), 0, 0, inside); piece(0, 40, 0, 0, here) } else piece(0, rest, 0, 0, inside)
    return out.slice(0, FORK_LEN)
  }
  const lane = () => RACING_LANES[Math.floor(rnd() * 3)]
  const offered = (kind: RacingForkKind): Array<Omit<RacingItem, 'taken'>> => {
    const coins = (z: number) => { const x = lane(); return Array.from({ length: 5 }, (_, k) => ({ kind: 'coin' as const, z: at + z + k * 7, x })) }
    if (kind === 'bends') return [...coins(90), ...coins(200), ...coins(330), { kind: 'time', z: at + 270, x: lane() }]
    if (kind === 'fast') return [{ kind: 'turbo', z: at + 80, x: lane() }, { kind: 'turbo', z: at + 300, x: lane() }]
    return [{ kind: 'time', z: at + 150, x: lane() }, ...coins(240), ...coins(360)]
  }
  return { at, len: FORK_LEN, kinds: two, tracks: [road(two[0]), road(two[1])], items: [offered(two[0]), offered(two[1])] }
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
function dress(track: RacingSegment[], finish: number, lv: number, world: RacingWorld, cuts: number[] = [], only: [number, number] | null = null, seedShift = 0, clear: [number, number] | null = null): void {
  const place = seeded(77 + lv * 131 + RACING_WORLDS.indexOf(world) * 7 + seedShift * 7919)
  const shops = WORLD_SHOPS[world]
  // the gaps between the shops and between the groups of the public, closing up as the levels go
  const busy = Math.max(0.45, 1.15 - lv * 0.045), spacing = Math.max(0.45, 1.5 - lv * 0.065)
  const next: Record<string, number> = { palmL: 20, palmR: 30, lamp: 10, bush: 12, house: 6, houseL: 14, parasol: 30, tower: 90, boat: 40, fans: 30, tree: 8, treeL: 12, rock: 60, weed: 70, lights: 120, fountain: 60, butte: 40, crag: 8, cragL: 12, bluff: 20 }
  let turn = lv % shops.length, turnL = (lv + 3) % shops.length
  const thing = (seg: RacingSegment, kind: RacingThing['kind'], x: number, look = 0) => seg.things.push({ kind, x, flip: place() < 0.5, look })
  const due = (key: string, i: number, gap: number, spread: number) => { if (i < next[key]) return false; next[key] = i + gap + Math.floor(place() * spread); return true }
  /** A shop along this side if the road stays the same kind for its whole length. */
  const shopAt = (i: number, side: 'shop' | 'shopL') => {
    const k = side === 'shop' ? turn : turnL
    const kind = shops[(k + 1 + Math.floor(place() * 2)) % shops.length], len = SHOP_LENGTHS[kind]
    // a shop never across where the fork's roads begin or end: each road dressed on its own
    if (!track.slice(i, i + len).every((g) => g.zone === track[i].zone) || cuts.some((c) => i < c && i + len > c)) return false
    if (side === 'shop') turn = shops.indexOf(kind); else turnL = shops.indexOf(kind)
    for (let k2 = 0; k2 < len; k2 += 1) track[i + k2][side] = { kind, start: i, len }
    return len
  }
  // the public along the road, wherever it can stand, more of it as the levels go: from the sixth level, then closer and closer
  const landLeft = new Set<RacingZone>(['promenade', 'forest', 'village', 'dunes', 'town', 'mesa', 'avenue', 'downtown', 'park'])
  const landRight = new Set<RacingZone>(['beach', 'promenade', 'forest', 'village', 'lake', 'dunes', 'town', 'avenue', 'downtown', 'park'])
  next.along = 200
  next.crag = 8
  next.cragL = 12
  next.bluff = 20
  // the rock by the road where the road runs through it (the coast's cliff, the gorge, the mesas, the canyon): rocks close by, one after another,
  // of all sizes (`look`), and bigger ones further back — each standing in perspective, so the rock has depth; the canyon on both sides
  const rockOf: Partial<Record<RacingZone, RacingScenery>> = { cliff: 'crag', gorge: 'rock', mesa: 'redrock', canyon: 'redrock' }
  const bluffOf: Partial<Record<RacingZone, RacingScenery>> = { cliff: 'crag', gorge: 'rock', mesa: 'butte', canyon: 'butte' }
  track.forEach((seg, i) => {
    if (i < 24 || i > finish + 200) return
    if (only && (i < only[0] || i >= only[1])) return
    const z = seg.zone
    if (z === 'tunnel') return
    // where the road divides and the other road goes away: open ground, nothing standing (but the chevrons)
    if (clear && i >= clear[0] && i < clear[1]) { if (Math.abs(seg.curve) >= 3 && i % 9 === 0) seg.things.push({ kind: 'chevron', x: seg.curve > 0 ? -1.95 : 1.95, flip: seg.curve < 0, look: 0 }); return }
    const rock = rockOf[z]
    if (rock) {
      if (due('crag', i, 4, 5)) seg.things.push({ kind: rock, x: 2.15 + place() * 0.5, flip: place() < 0.5, look: Math.floor(place() * 4) })
      if (z === 'canyon' && due('cragL', i, 4, 5)) seg.things.push({ kind: rock, x: -2.15 - place() * 0.5, flip: place() < 0.5, look: Math.floor(place() * 4) })
      if (due('bluff', i, 14, 16)) { const side = z === 'canyon' && place() < 0.5 ? -1 : 1; seg.things.push({ kind: bluffOf[z]!, x: side * (5 + place() * 3.5), flip: place() < 0.5, look: 3 + Math.floor(place() * 2) }) }
    }
    if (lv >= 6 && i >= next.along && (landLeft.has(z) || landRight.has(z))) {
      const side = landRight.has(z) && (!landLeft.has(z) || place() < 0.5) ? 1 : -1
      if (!(side > 0 ? seg.shop : seg.shopL)) seg.things.push({ kind: 'crowd', x: side * 2.12, flip: side < 0, look: i * 3 })
      next.along = i + Math.round(Math.max(40, 200 - lv * 10) * (0.7 + place() * 0.6))
    }
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
      // the buttes standing off the road, as in the picture: on the open side of the mesas, on either side of the dunes
      if ((z === 'dunes' || z === 'mesa' || z === 'town') && due('butte', i, 70, 70)) thing(seg, 'butte', (z === 'dunes' && place() < 0.5 ? 1 : -1) * (4.6 + place() * 4))
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
  if (world === 'coast' && !only) { const mid = track.findIndex((g, i) => i > finish * 0.45 && (g.zone === 'beach' || g.zone === 'cliff')); if (mid > 0) track[mid].things.push({ kind: 'lighthouse', x: -9.5, flip: false, look: 0 }) }
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
  // roadworks: a lane shut for sixty stretches, a cone every six; never in a sharp bend, where there is no seeing them coming
  const works = 1 + Math.floor(lv / 3)
  const sharp = (z0: number) => track.slice(Math.max(0, z0 - 20), z0 + 60).some((g) => Math.abs(g.curve) > 3)
  for (let k = 0; k < works; k += 1) {
    let z0 = Math.round(from + ((k + 0.5) / works) * (to - from) + (rnd() - 0.5) * 200)
    // the nearest place further on out of the bends
    for (let tries = 0; tries < 30 && z0 < to - 60 && sharp(z0); tries += 1) z0 += 20
    if (track[z0]?.zone === 'tunnel' || sharp(z0) || busy(z0 - 40, z0 + 100)) continue
    const x = lane()
    for (let z = z0; z < z0 + 60; z += 6) items.push({ kind: 'cone', z, x })
  }
  // ketchup puddles
  const puddles = 2 + Math.floor(lv * 0.8)
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

/** The traffic: the world's everyday cars spread along the road, two at the first level and more as the levels go; from the fourth, some swerve when the player comes, more of them as the levels go. */
function placeTraffic(finish: number, lv: number, world: RacingWorld): Array<Omit<RacingTraffic, 'swerved'>> {
  const rnd = seeded(53 + lv * 613 + RACING_WORLDS.indexOf(world) * 3001)
  const MODELS: readonly RacingTrafficModel[] = WORLD_TRAFFIC[world]
  const n = Math.round(1.5 + lv * 0.75)
  return Array.from({ length: n }, (_, k) => {
    const lane = Math.floor(rnd() * 3)
    return {
      kind: MODELS[Math.floor(rnd() * MODELS.length)], look: Math.floor(rnd() * 9),
      z: Math.round(260 + ((k + rnd() * 0.8) / n) * (finish * 0.55)), x: RACING_LANES[lane], lane: RACING_LANES[lane],
      speed: RACING_TOP * (0.46 + rnd() * 0.16), swerve: lv >= 4 && (k % 4 === 1 || rnd() < Math.min(0.15, (lv - 4) * 0.015)),
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
const roomFor = (level: number) => 1.16 - Math.min(RACING_LAST_LEVEL, level) * 0.008 + Math.max(0, 4 - level) * 0.02 + (racingStorm(level) ? 0.025 : 0) + CHARACTER_ROOM[racingCharacter(level)]
/** A little more room on the twisty and the hairpin levels, where the traffic is hardest to get by; a little less on the sprints and at the last, all straights to make up time on. */
const CHARACTER_ROOM: Record<RacingCharacter, number> = { flowing: 0, sprint: -0.03, hills: 0, twisty: 0.04, tunnel: 0, hairpins: 0.05, all: -0.02 }
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
  /** Steps left of its own turbo, and before it may use one again. */
  turbo: number
  cool: number
}

export type RacingPhase = 'start' | 'play' | 'goal' | 'garage' | 'timeup' | 'won' | 'over'

export type RacingState = {
  layout: RacingLayout
  level: number
  /** A single level (a round of the Random flow): its end is the round's. */
  single: boolean
  car: RacingCarKind
  /** The world of each level in this game (the first drawn at its start, the next ones chosen at the fork); the world of this one. */
  worlds: RacingWorld[]
  world: RacingWorld
  /** The car's points now. */
  stats: Record<RacingStat, number>
  /** The level's fork in the middle of the road, and the road taken there: −1 not yet, 0 the left, 1 the right. */
  fork: RacingFork | null
  forkPick: -1 | 0 | 1
  /** Between two levels, the improvements offered and the one pointed at. */
  garage: { options: RacingStat[]; pick: number } | null
  /** The turbo's gauge, 0 to 1; whether the car rides in a slipstream now; the combo of brushes and the steps left to add to it. */
  boost: number
  drafting: boolean
  combo: number
  comboSteps: number
  /** The start: the step A was pressed at during the lights (−1 not held), how it went; steps left of spinning wheels. */
  revFrom: number
  launch: 'none' | 'perfect' | 'early'
  spin: number
  /** Small words over the car for a moment: a brush, an overtake, the turbo ready. */
  pops: Array<{ text: string; steps: number; colour: string }>
  /** The controls as they were at the last step, to tell a press from a hold. */
  held: { steer: -1 | 0 | 1; gas: boolean; nitro: boolean }
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
  /** Every level in the same world (the test page's): no fork. */
  fixed: boolean
  rnd: () => number
}

/**
 * How fast the engine's sound plays now (its pitch), or null for none: revved
 * at the lights while A is held; on the road, climbing through five gears
 * with the speed and dropping back at each change; higher with the turbo.
 */
export function racingEngine(s: RacingState): number | null {
  if (s.phase === 'won' || s.phase === 'over' || s.phase === 'garage') return null
  if (s.phase === 'start') return s.revFrom >= 0 ? 1.15 + 0.08 * Math.sin(s.steps * 0.6) : 0.62
  const share = Math.max(0, s.speed / RACING_TOP), gears = [0, 0.22, 0.42, 0.62, 0.82, 1.3]
  let gear = 0
  while (gear < gears.length - 2 && share > gears[gear + 1]) gear += 1
  const within = Math.min(1, (share - gears[gear]) / (gears[gear + 1] - gears[gear]))
  return 0.65 + gear * 0.1 + within * 0.85 + (s.turbo > 0 ? 0.15 : 0) + (s.spin > 0 ? 0.5 : 0)
}

/** The two cars that are not the player's, in the order they line up. */
export const rivalsOf = (car: RacingCarKind): RacingCarKind[] => RACING_CARS.filter((k) => k !== car)

function freshLevel(s: RacingState): void {
  s.world = s.worlds[s.level - 1]
  const course = racingCourse(s.level, s.world)
  // a road of the race's own when it has a fork: the left-hand road may be laid into it
  s.track = course.fork ? course.track.slice() : course.track
  s.fork = course.fork
  s.forkPick = -1
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
  s.garage = null
  s.drafting = false
  s.combo = 0
  s.comboSteps = 0
  s.revFrom = -1
  s.launch = 'none'
  s.spin = 0
  s.pops = []
  // the grid as on the title: the three cars side by side, the player's in the middle
  const pace = racingPace(s.level)
  s.rivals = rivalsOf(s.car).map((kind, i) => ({ kind, z: 0, x: RACING_LANES[i === 0 ? 0 : 2], speed: 0, lane: RACING_LANES[i === 0 ? 0 : 2], pace: pace * (i === 0 ? 1.025 : 0.975), next: 5 * SECOND + Math.floor(s.rnd() * 3 * SECOND), ahead: false, passed: false, turbo: 0, cool: RIVAL_COOL + Math.floor(s.rnd() * 6 * SECOND) }))
  s.place = 1
}

/**
 * A race from `level`, the worlds of its levels drawn from `seed` (all of
 * them `options.world`, if given: the test page's).
 */
export function createRacing(layout: RacingLayout, level = 1, seed = 1, options: { single?: boolean; score?: number; car?: RacingCarKind; world?: RacingWorld } = {}): RacingState {
  const worlds = options.world ? Array.from({ length: RACING_LAST_LEVEL }, () => options.world!) : racingWorldOrder(seed)
  const lv = Math.max(1, Math.min(RACING_LAST_LEVEL, level)), car = options.car ?? 'burger'
  const s: RacingState = {
    layout, level: lv, single: !!options.single, car, worlds, world: worlds[0], fixed: !!options.world,
    // a game from a later level (a round, the test page), the car as improved as it would be by then
    stats: racingStatsAt(car, lv), fork: null, forkPick: -1, garage: null, boost: 0, drafting: false, combo: 0, comboSteps: 0, revFrom: -1, launch: 'none', spin: 0, pops: [], held: { steer: 0, gas: false, nitro: false },
    track: [], finish: 0, checks: [], check: 0, items: [], traffic: [], z: 0, x: 0, speed: 0, steer: 0, rivals: [], time: 0, phase: 'start', phaseTimer: 0,
    score: options.score ?? 0, run: 0, place: 3, bonus: null, goalAt: -1, knock: 0, offroad: false, turbo: 0, skid: 0, skidWay: 1, news: null, view: 0, steps: 0, heard: [], passed: 0, rnd: seeded(seed),
  }
  freshLevel(s)
  return s
}

/** A small word over the car for a moment. */
function pop(s: RacingState, text: string, colour = '#ffd23f'): void {
  s.pops.push({ text, steps: 70, colour })
  if (s.pops.length > 3) s.pops.shift()
}
/** The gauge filled by a risk taken (by its share, the car's turbo points counting), or by a bottle (by its own); the turbo ready said once. */
function fill(s: RacingState, amount: number, own = false): void {
  const was = s.boost
  s.boost = Math.min(1, s.boost + (own ? amount : amount * statTurbo(s.stats.turbo)))
  if (was < 1 && s.boost >= 1) pop(s, 'TURBO READY', '#ffd02a')
}

/**
 * One step of the race: `steer` the way the player steers (−1 left, 1
 * right), `gas` whether A is held, `brake` whether B is, `nitro` whether the
 * turbo button is.
 */
export function stepRacing(s: RacingState, steer: -1 | 0 | 1 = 0, gas = false, brake = false, nitro = false): void {
  s.heard = []
  s.steps += 1
  if (s.knock > 0) s.knock -= 1
  if (s.news && --s.news.steps <= 0) s.news = null
  for (const p of s.pops) p.steps -= 1
  s.pops = s.pops.filter((p) => p.steps > 0)
  // what was pressed this step, not held from before
  const pressed: { steer: -1 | 0 | 1; gas: boolean; nitro: boolean } = { steer: steer !== 0 && steer !== s.held.steer ? steer : 0, gas: gas && !s.held.gas, nitro: nitro && !s.held.nitro }
  s.held = { steer, gas, nitro }
  if (s.phase === 'won' || s.phase === 'over') return
  if (s.phase === 'garage') { garage(s, pressed.steer, pressed.gas); return }
  if (s.phase === 'start') {
    // the lights: three reds a second apart, then green; A held since when, for the launch
    if (s.phaseTimer % SECOND === 0 && s.phaseTimer < RACING_START_STEPS) s.heard.push('beep')
    if (!gas) s.revFrom = -1
    else if (s.revFrom < 0) s.revFrom = s.phaseTimer
    s.phaseTimer += 1
    s.steer = steer
    if (s.phaseTimer >= RACING_START_STEPS) {
      s.phase = 'play'
      s.phaseTimer = 0
      s.heard.push('go')
      if (s.revFrom >= LAUNCH_FROM) { s.launch = 'perfect'; s.turbo = LAUNCH_BOOST; s.news = { text: 'PERFECT START!', steps: 80 }; s.heard.push('power') }
      else if (s.revFrom >= 0) { s.launch = 'early'; s.spin = SPIN_STEPS; s.news = { text: 'TOO EARLY!', steps: 80 }; s.heard.push('slip') }
    }
    return
  }
  s.phaseTimer += 1
  if (s.comboSteps > 0 && (s.comboSteps -= 1) === 0) s.combo = 0
  const rolling = s.phase === 'goal' || s.phase === 'timeup'
  // past the line or out of time, the car drives itself, lifting off, back to the middle
  if (rolling) { steer = Math.abs(s.x) > 0.1 ? (s.x > 0 ? -1 : 1) : 0; gas = s.phase === 'goal' && s.speed < RACING_TOP * 0.45; brake = s.phase === 'timeup' }
  // the turbo let go: as long as the gauge was full
  if (pressed.nitro && s.phase === 'play' && s.turbo === 0 && s.boost >= BOOST_MIN) {
    s.turbo = Math.round(s.boost * TURBO_STEPS * statTurbo(s.stats.turbo))
    s.boost = 0
    s.news = { text: 'TURBO!', steps: 60 }
    s.heard.push('power')
  }
  const cars = [...s.rivals, ...s.traffic]
  const ahead = cars.map((c) => c.z > s.z)
  drive(s, steer, gas, brake)
  if (s.fork && s.forkPick < 0 && s.z >= s.fork.at - FORK_DECIDE) takeFork(s, s.x < 0 ? 0 : 1)
  stepRivals(s)
  stepTraffic(s)
  touchCars(s)
  if (!rolling) { pickUp(s); risks(s, cars, ahead) }
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
    else openGarage(s)
  } else if (s.phase === 'timeup' && s.phaseTimer >= TIMEUP_STEPS) s.phase = 'over'
}

/**
 * The risks taken this step, that fill the gauge: a car brushed past
 * (overtaken close, without touching it), several in a row a combo and more
 * points; riding in a car's slipstream (a little quicker too); a sharp bend
 * taken at its limit.
 */
function risks(s: RacingState, cars: ReadonlyArray<{ z: number; x: number }>, ahead: boolean[]): void {
  if (s.speed > RACING_TOP * 0.55 && s.knock === 0) cars.forEach((c, k) => {
    if (!ahead[k] || c.z > s.z || Math.abs(c.x - s.x) >= 0.92) return
    s.combo = s.comboSteps > 0 ? s.combo + 1 : 1
    s.comboSteps = COMBO_STEPS
    const points = NEAR_POINTS * Math.min(5, s.combo)
    s.score += points
    fill(s, NEAR_MISS)
    pop(s, s.combo > 1 ? `NEAR MISS x${s.combo} +${points}` : `NEAR MISS +${points}`, '#3af0ff')
    s.heard.push('whoosh')
  })
  s.drafting = s.speed > RACING_TOP * 0.6 && cars.some((c) => c.z - s.z > 3 && c.z - s.z < 16 && Math.abs(c.x - s.x) < 0.4)
  if (s.drafting) fill(s, DRAFT_FILL)
  const curve = segmentOf(s.track, s.z).curve
  if (Math.abs(curve) >= 3 && s.speed >= 0.92 * racingBendSpeed(s, curve)) fill(s, LIMIT_FILL)
}

/**
 * The road taken at the fork: the left one laid into the race's road (the
 * right one is there already), with what it offers instead of the other's;
 * the fast road's traffic a little thicker.
 */
function takeFork(s: RacingState, pick: 0 | 1): void {
  const f = s.fork!
  s.forkPick = pick
  if (pick === 0) {
    for (let k = 0; k < f.len; k += 1) s.track[f.at + k] = f.tracks[0][k]
    s.items = [...s.items.filter((it) => it.z < f.at || it.z >= f.at + f.len), ...f.items[0].map((it) => ({ ...it, taken: false }))].sort((a, b) => a.z - b.z)
  }
  if (f.kinds[pick] === 'fast') for (let k = 0; k < 3; k += 1) { const lane = RACING_LANES[Math.floor(s.rnd() * 3)]; s.traffic.push({ kind: (['hatch', 'saloon', 'estate'] as const)[k], look: Math.floor(s.rnd() * 9), z: f.at + 70 + k * 110, x: lane, lane, speed: RACING_TOP * (0.45 + s.rnd() * 0.1), swerve: false, swerved: false }) }
  pop(s, FORK_NAME[f.kinds[pick]], '#faf6ec')
}
/** Each road of the fork as its sign says it. */
export const FORK_NAME: Record<RacingForkKind, string> = { bends: 'BENDS + COINS', fast: 'FAST + TURBO', tunnel: 'TUNNEL + TIME' }

/** Between two levels: three improvements of the car offered (of the points not yet at their most), the middle one pointed at. */
function openGarage(s: RacingState): void {
  const open = RACING_STATS.filter((n) => s.stats[n] < STAT_MAX)
  if (!open.length) { nextLevel(s); return }
  const mixed = open.slice()
  for (let k = mixed.length - 1; k > 0; k -= 1) { const j = Math.floor(s.rnd() * (k + 1)); [mixed[k], mixed[j]] = [mixed[j], mixed[k]] }
  const options = mixed.slice(0, 3).sort((a, b) => RACING_STATS.indexOf(a) - RACING_STATS.indexOf(b))
  s.garage = { options, pick: Math.floor((options.length - 1) / 2) }
  s.phase = 'garage'
  s.phaseTimer = 0
  s.turbo = 0
}
/** The garage: left and right point at an improvement, A takes it (not before a third of a second, so A held from the race does not). */
function garage(s: RacingState, move: -1 | 0 | 1, take: boolean): void {
  s.phaseTimer += 1
  const g = s.garage
  if (!g) return
  if (move) { const next = Math.max(0, Math.min(g.options.length - 1, g.pick + move)); if (next !== g.pick) { g.pick = next; s.heard.push('coin') } }
  if (take && s.phaseTimer > 20) racingGaragePick(s, g.pick)
}
/** An improvement taken, by its place among those offered (a key, or a tap on it): the car one point better, then the next level. */
export function racingGaragePick(s: RacingState, index: number): boolean {
  if (s.phase !== 'garage' || !s.garage) return false
  const stat = s.garage.options[index]
  if (!stat) return false
  s.stats[stat] += 1
  s.heard.push('gold')
  nextLevel(s)
  return true
}
function nextLevel(s: RacingState): void {
  s.passed += 1
  s.level += 1
  freshLevel(s)
}

/** The player's car: speed from the pedals and the turbo, the bend pushing it out, the steering (none while it skids), the sand, the rails. */
function drive(s: RacingState, steer: -1 | 0 | 1, gas: boolean, brake: boolean): void {
  const seg = segmentOf(s.track, s.z)
  // the car's own top speed, a little more in a slipstream; the turbo's over it
  const own = statTop(s.stats.speed) * (s.drafting ? 1.03 : 1)
  const top = s.turbo > 0 ? own * TURBO_TOP : own
  if (s.turbo > 0) { s.turbo -= 1; gas = true }
  // the wheels spinning after a start too early: going nowhere for a moment
  if (s.spin > 0) { s.spin -= 1; gas = false; brake = false }
  if (brake) s.speed -= BRAKE
  else if (gas) s.speed += ACCEL * statAccel(s.stats.accel) * (s.turbo > 0 ? 2.2 : 1) * (s.drafting ? 1.2 : 1) * (1 - 0.35 * Math.min(1, s.speed / own))
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
  s.x -= (STEER * share * share * seg.curve * CENTRIFUGAL * grip(s.level)) / statGrip(s.stats.grip)
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
    // the sharpest bend coming, as a driver sees it, and how fast it can be taken
    let sharpest = 0
    for (let k = 5; k <= 35; k += 5) sharpest = Math.max(sharpest, Math.abs(segmentOf(s.track, r.z + k).curve))
    // the rivals drive the car the level is built for: as improved as the player's should be by then
    const scale = statTop(usualPoints(s.level)) / RACING_TOP, bend = usualSpeed(sharpest, s.level)
    let want = Math.min(r.pace * scale, bend * RIVAL_BEND)
    // behind the player it comes back, the bends taken a little harder; well ahead, it eases a little: the race stays a race
    const gap = r.z - s.z
    if (gap < 0 && s.phase === 'play') {
      const pull = Math.min(1, -gap / RIVAL_REACH)
      // far behind, harder still: never out of the race for long
      const chase = 1 + 0.1 * Math.min(1, Math.max(0, -gap - RIVAL_REACH) / 60)
      want = Math.min(bend * chase, want + (rivalTop(s.level) * scale * chase - want) * pull)
    } else if (gap > 10) want *= 1 - 0.12 * Math.min(1, (gap - 10) / 80)
    // its own turbo, behind the player on a clear straight
    if (r.cool > 0) r.cool -= 1
    if (r.turbo > 0) { r.turbo -= 1; want = Math.max(want, Math.min(bend, RACING_TOP * scale * TURBO_TOP * 0.95)) }
    else if (s.level >= 3 && s.phase === 'play' && r.cool === 0 && gap < -12 && sharpest < 1.5) { r.turbo = RIVAL_TURBO; r.cool = rivalCool(s.level) + Math.floor(s.rnd() * 4 * SECOND) }
    if (s.phase === 'timeup') want = Math.min(want, r.speed)
    // off the line no quicker than the player's car: a good start beats them
    r.speed += r.speed < want ? ACCEL * 1.15 * (r.turbo > 0 ? 2.2 : 1) : -Math.min(BRAKE * 0.4, r.speed - want)
    r.speed = Math.max(0, r.speed)
    // the other cars, the player's among them: it goes round them all
    const others = [...s.rivals.filter((o) => o !== r), ...s.traffic, { z: s.z, x: s.x, speed: s.speed }]
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
      // the player close behind and coming: from the third level, now and then (more often as the levels go), it moves across
      if (s.level >= 3 && behind < -4 && behind > -40 && s.speed > r.speed && s.rnd() < Math.min(0.3, (s.level - 2) * 0.03)) r.lane = RACING_LANES.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a))
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
    else if (it.kind === 'turbo') { fill(s, BOTTLE_FILL, true); s.news = { text: 'MUSTARD!', steps: 70 }; s.heard.push('power') }
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
    else if (r.ahead && !r.passed && !rolling) { r.passed = true; s.score += 100; s.heard.push('whoosh'); pop(s, 'OVERTAKE +100') }
    r.ahead = now
  }
  s.place = ahead + 1
}

/** The largest score a level can give, at most, in whichever world it is: every stretch (and a quarter more, for the road driven again after a knock), every rival passed, every coin, first place, the whole clock left with every stopwatch. */
export function racingLevelMax(level: number): number {
  return Math.max(...RACING_WORLDS.map((world) => {
    const course = racingCourse(level, world)
    const coins = course.items.filter((it) => it.kind === 'coin').length + (course.fork ? 15 : 0)
    const watches = course.items.filter((it) => it.kind === 'time').length
    const clock = racingTime(level, world) + course.checks.reduce((sum, _, k) => sum + racingExtension(level, k + 1, world), 0) + watches * 3
    // the brushes past cars: every car of the traffic and the rivals a few times each, at the combo's most
    const brushes = (course.traffic.length + 12) * NEAR_POINTS * 5
    return Math.ceil((course.finish / 5) * 1.35) + 200 + coins * 100 + 1000 + clock * 50 + brushes
  }))
}
