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

export type RacingLayout = 'landscape' | 'portrait'
export type { RacingCarKind }
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

// ---------------------------------------------------------------- the road

/** The kinds of road along the coast. */
export type RacingZone = 'beach' | 'promenade' | 'cliff' | 'causeway' | 'tunnel'
/** What stands by the road on a stretch: a palm, a chevron pointing into a bend (`flip`: pointing left), a lamp, a bush; `x` in half widths from the middle. */
export type RacingThing = { kind: 'palm' | 'chevron' | 'lamp' | 'bush'; x: number; flip: boolean }
/** A stretch: how much the road bends there (to the right when positive), its height at its near and far ends, its kind, what stands by it. */
export type RacingSegment = { curve: number; y1: number; y2: number; zone: RacingZone; things: RacingThing[] }

/** What lies on the road: a stopwatch, the turbo, a coin; a ketchup puddle, a cone of the roadworks. */
export type RacingItemKind = 'time' | 'turbo' | 'coin' | 'puddle' | 'cone'
export type RacingItem = { kind: RacingItemKind; z: number; x: number; taken: boolean }
/** A slow car of the traffic: the model and its colour (`look`), its lane, its speed; whether it swerves into another lane when the player comes. */
export type RacingTraffic = { kind: 'rosso' | 'giallo'; look: number; z: number; x: number; lane: number; speed: number; swerve: boolean; swerved: boolean }

/** A level's road and what is on it, always the same for the level. */
export type RacingCourse = {
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

const courses = new Map<number, RacingCourse>()

/**
 * A level's road. Its kinds come one after another, a few hundred stretches
 * each — the beach and the promenade from the first level, the causeway from
 * the second, the cliff from the fourth, the tunnel (through the cliff) from
 * the sixth — and its bends with them: sweepers and bends at first, S bends
 * from the third, chicanes from the fourth, hairpins from the fifth, bends
 * over a crest from the sixth; hills from the third, higher from the seventh
 * and the eleventh. A straight for the grid, a straight to the line, the
 * run-off past it.
 */
export function racingCourse(level: number): RacingCourse {
  const lv = Math.max(1, Math.min(RACING_LAST_LEVEL, level))
  const known = courses.get(lv)
  if (known) return known
  const rnd = seeded(1000 + lv * 7919)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]
  const between = (a: number, b: number) => Math.round(a + rnd() * (b - a))
  const track: RacingSegment[] = []
  const lastY = () => (track.length ? track[track.length - 1].y2 : 0)
  let zone: RacingZone = 'beach'
  const add = (enter: number, hold: number, leave: number, curve: number, height: number) => {
    const y0 = lastY(), y1 = y0 + height, total = enter + hold + leave
    let n = 0
    const push = (c: number) => { track.push({ curve: c, y1: easeInOut(y0, y1, n / total), y2: easeInOut(y0, y1, (n + 1) / total), zone, things: [] }); n += 1 }
    for (let i = 0; i < enter; i += 1) push(easeIn(0, curve, i / enter))
    for (let i = 0; i < hold; i += 1) push(curve)
    for (let i = 0; i < leave; i += 1) push(easeInOut(curve, 0, i / leave))
  }
  // up or down, back toward the start's level when the road has climbed or dropped far; flat on the causeway and in the tunnel
  const hill = (bigger = false) => {
    if (zone === 'causeway' || zone === 'tunnel') return 0
    const size = lv >= 11 ? pick([4, 6]) : lv >= 7 ? pick([2, 4]) : lv >= 3 ? pick([0, 2]) : 0
    return (size + (bigger && lv >= 3 ? 2 : 0)) * (lastY() > 3 ? -1 : lastY() < -3 ? 1 : rnd() < 0.5 ? -1 : 1)
  }
  const kinds: RacingZone[] = ['beach', 'promenade', ...(lv >= 2 ? ['causeway' as const] : []), ...(lv >= 4 ? ['cliff' as const] : [])]
  const end = racingLength(lv) - 140
  add(0, 80, 0, 0, 0)
  let left = between(320, 520)
  while (track.length < end) {
    if (left <= 0) {
      // the next kind of road; the tunnel only out of the cliff, and back into it
      if (zone === 'cliff' && lv >= 6 && rnd() < 0.55) { zone = 'tunnel'; left = between(140, 240) }
      else if (zone === 'tunnel') { zone = 'cliff'; left = between(160, 260) }
      else { const next = kinds.filter((k) => k !== zone); zone = pick(next); left = between(300, 560) }
    }
    const start = track.length
    const dir = rnd() < 0.5 ? -1 : 1
    const r = rnd()
    if (zone === 'tunnel') {
      // in the rock: gentle bends, no hills
      if (r < 0.5) add(0, between(40, 90), 0, 0, 0)
      else add(30, between(60, 110), 30, dir * (1.5 + rnd() * 1.5), 0)
    } else if (r < 0.18) {
      // a straight, rolling over a hill now and then
      add(0, between(50, 120), 0, 0, lv >= 3 && rnd() < 0.5 ? hill() : 0)
    } else if (r < 0.34) {
      // a long sweeper
      add(between(40, 60), between(100, 190), between(40, 60), dir * (1.5 + rnd() * 1.5), hill())
    } else if (r < 0.46 && lv >= 3) {
      // an S
      const c = 2.5 + rnd() * (lv >= 6 ? 2.5 : 1.5)
      add(25, between(30, 60), 25, dir * c, hill())
      add(25, between(30, 60), 25, -dir * c, 0)
    } else if (r < 0.56 && lv >= 4) {
      // a chicane: quick one way and the other
      const c = 4.5 + rnd() * 1.5
      add(12, between(8, 14), 12, dir * c, 0)
      add(12, between(8, 14), 12, -dir * c, 0)
    } else if (r < 0.66 && lv >= 5) {
      // a hairpin
      add(22, between(30, 50), 22, dir * (6 + rnd() * 1.2), hill())
    } else if (r < 0.74 && lv >= 6) {
      // a bend over a crest: the road out of sight as it turns
      add(30, between(40, 70), 30, dir * (3 + rnd() * 2), hill(true))
      add(25, 20, 25, 0, -lastY() * 0.5)
    } else {
      // a bend
      add(between(25, 45), between(40, 90), between(25, 45), dir * (3 + rnd() * (lv >= 5 ? 2 : 1.2)), hill())
    }
    left -= track.length - start
  }
  // down to the level of the start, a straight to the line on the promenade, and on past it
  zone = 'promenade'
  add(30, 70, 30, 0, -lastY())
  const finish = track.length
  add(0, RUNOFF, 0, 0, 0)
  // what stands by it, a little irregular: palms on the beach and among the bushes, lamps along the promenade and the causeway, chevrons on the outside of bends
  const place = seeded(77 + lv * 131)
  let palmL = 20, palmR = 30, lamp = 10, bush = 12
  track.forEach((seg, i) => {
    if (i < 24 || i > finish + 200) return
    const z = seg.zone
    if (z === 'tunnel') return
    if (z === 'beach' && i >= palmL) { seg.things.push({ kind: 'palm', x: -2.25 - place() * 0.9, flip: place() < 0.5 }); palmL = i + 9 + Math.floor(place() * 14) }
    if ((z === 'beach' || z === 'promenade') && i >= palmR) { seg.things.push({ kind: 'palm', x: 2.15 + place() * 1.2, flip: place() < 0.5 }); palmR = i + 14 + Math.floor(place() * 18) }
    // bushes scattered over the land past the beach, near and far
    if (z === 'beach' && i >= bush) { seg.things.push({ kind: 'bush', x: 2.0 + place() * 4.5, flip: place() < 0.5 }); bush = i + 4 + Math.floor(place() * 6) }
    if ((z === 'promenade' || z === 'causeway') && i >= lamp) { seg.things.push({ kind: 'lamp', x: -1.95, flip: false }, { kind: 'lamp', x: 1.95, flip: true }); lamp = i + 16 }
    if (Math.abs(seg.curve) >= 3 && i % 9 === 0) seg.things.push({ kind: 'chevron', x: seg.curve > 0 ? -1.95 : 1.95, flip: seg.curve < 0 })
  })
  // the checkpoints at a third and two thirds, each part's par
  const checks = [Math.round(finish / 3), Math.round((finish * 2) / 3)]
  const marks = [0, ...checks, finish]
  const pars = marks.slice(1).map((to, k) => { let steps = 0; for (let i = marks[k]; i < to; i += 1) steps += 1 / (RACING_TOP * bendLimit(track[i].curve, lv)); return steps / SECOND })
  const course: RacingCourse = { track, finish, checks, pars, items: placeItems(track, finish, lv), traffic: placeTraffic(finish, lv) }
  courses.set(lv, course)
  return course
}

/**
 * What lies on the road, never in the first stretches nor on the last
 * straight, and never all three lanes shut: rows of five coins; stopwatches
 * now and then; the turbo where a straight begins; from the second level
 * ketchup puddles, from the third roadworks closing a lane with cones (none
 * in the tunnel), more as the levels go.
 */
function placeItems(track: RacingSegment[], finish: number, lv: number): Array<Omit<RacingItem, 'taken'>> {
  const rnd = seeded(31 + lv * 977)
  const items: Array<Omit<RacingItem, 'taken'>> = []
  const lane = () => RACING_LANES[Math.floor(rnd() * 3)]
  const from = 220, to = finish - 140
  const busy = (z0: number, z1: number) => items.some((it) => it.z >= z0 && it.z <= z1 && (it.kind === 'cone' || it.kind === 'puddle'))
  // roadworks: a lane shut for sixty stretches, a cone every six
  const works = lv >= 3 ? 1 + Math.floor(lv / 4) : 0
  for (let k = 0; k < works; k += 1) {
    const z0 = Math.round(from + ((k + 0.5) / works) * (to - from) + (rnd() - 0.5) * 200)
    if (track[z0]?.zone === 'tunnel' || busy(z0 - 40, z0 + 100)) continue
    const x = lane()
    for (let z = z0; z < z0 + 60; z += 6) items.push({ kind: 'cone', z, x })
  }
  // ketchup puddles
  const puddles = lv >= 2 ? 2 + Math.floor(lv * 0.7) : 0
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

/** The traffic, from the second level: slow cars spread along the road, in other colours than the rivals', more of them as the levels go; from the seventh, some swerve when the player comes. */
function placeTraffic(finish: number, lv: number): Array<Omit<RacingTraffic, 'swerved'>> {
  if (lv < 2) return []
  const rnd = seeded(53 + lv * 613)
  const n = Math.round(1 + lv * 0.75)
  return Array.from({ length: n }, (_, k) => {
    const lane = Math.floor(rnd() * 3)
    return {
      kind: rnd() < 0.5 ? 'rosso' as const : 'giallo' as const, look: Math.floor(rnd() * 4),
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
export const racingFinish = (level: number): number => racingCourse(level).finish

/**
 * The clock: at the start, the first part's par with room to spare — a
 * fifth more at the first level, a twelfth at the last — and the same at
 * each checkpoint for the part that follows.
 */
const roomFor = (level: number) => 1.2 - Math.min(RACING_LAST_LEVEL, level) * 0.007
export const racingTime = (level: number): number => Math.round(racingCourse(level).pars[0] * roomFor(level) + 6)
export const racingExtension = (level: number, part: number): number => Math.round(racingCourse(level).pars[part] * roomFor(level) + 1)

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
  const course = racingCourse(s.level)
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
  s.time = racingTime(s.level) * SECOND
  s.phase = 'start'
  s.phaseTimer = 0
  s.run = 0
  s.bonus = null
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

export function createRacing(layout: RacingLayout, level = 1, seed = 1, options: { single?: boolean; score?: number; car?: RacingCarKind } = {}): RacingState {
  const s: RacingState = {
    layout, level: Math.max(1, Math.min(RACING_LAST_LEVEL, level)), single: !!options.single, car: options.car ?? 'burger',
    track: [], finish: 0, checks: [], check: 0, items: [], traffic: [], z: 0, x: 0, speed: 0, steer: 0, rivals: [], time: 0, phase: 'start', phaseTimer: 0,
    score: options.score ?? 0, run: 0, place: 3, bonus: null, knock: 0, offroad: false, turbo: 0, skid: 0, skidWay: 1, news: null, view: 0, steps: 0, heard: [], passed: 0, rnd: seeded(seed),
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
      const more = racingExtension(s.level, s.check)
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

/** The largest score a level can give, at most: every stretch (and a quarter more, for the road driven again after a knock), every rival passed, every coin, first place, the whole clock left with every stopwatch. */
export function racingLevelMax(level: number): number {
  const course = racingCourse(level)
  const coins = course.items.filter((it) => it.kind === 'coin').length
  const watches = course.items.filter((it) => it.kind === 'time').length
  const clock = racingTime(level) + course.checks.reduce((sum, _, k) => sum + racingExtension(level, k + 1), 0) + watches * 3
  return Math.ceil((course.finish / 5) * 1.25) + 200 + coins * 100 + 1000 + clock * 50
}
