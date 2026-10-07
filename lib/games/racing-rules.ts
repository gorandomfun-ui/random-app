/**
 * The rules of RANDOM RACING, apart from any screen. A race against the
 * clock on the coast road, seen from behind the car: the player's car — the
 * one chosen on the title — and the two others as rivals, starting ahead on
 * the grid. Three red lights, then green; the road bends and climbs; the
 * left and right arrows steer, A (gas) speeds up, B brakes. Too fast in a
 * bend and the car drifts out; off the road the sand and the bushes slow it;
 * the rails along both sides stop it; a rival hit from behind slows it.
 * Reach the finish line before the clock runs out and the level is cleared,
 * with points for the time left and the place; the clock at zero, it is
 * over. Points too for the distance and for each rival passed.
 *
 * Each level is its own stretch of road (`racingTrack`), always the same for
 * that level, longer and harder as they go: bends that tighten, hills from
 * the third, rivals quicker, less time to spare. Level 16 cleared, the game
 * is won.
 *
 * The road is cut into stretches (`RACING_SEGMENT` long, a tenth of the
 * road's half width): the car's place along it (`z`) counts in stretches,
 * its place across it (`x`) in half widths — −1 the left edge, 1 the right.
 * Everything moves sixty times a second; the same seed and the same moves
 * play the same race.
 */

import { seeded } from './engine'
import type { RacingCarKind } from './racing-art'

export type RacingLayout = 'landscape' | 'portrait'
export type { RacingCarKind }
const SECOND = 60

/** The last level: cleared, the game is won. */
export const RACING_LAST_LEVEL = 16
export const RACING_CARS: readonly RacingCarKind[] = ['rosso', 'burger', 'giallo']

/** What can be heard: a light of the start (and the last seconds), the green light, a knock, a rival passed, the finish line. */
export type RacingSound = 'beep' | 'go' | 'thud' | 'whoosh' | 'level'

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

/** Top speed, in stretches a step: shown as 290 km/h. */
export const RACING_TOP = 1
const ACCEL = RACING_TOP / 300
const BRAKE = RACING_TOP / 70
const COAST = RACING_TOP / 500
/** Off the road, above this the sand and the bushes slow the car hard. */
const OFFROAD_TOP = RACING_TOP * 0.42
const OFFROAD = RACING_TOP / 90
/** How far a step of steering takes the car at top speed, and how hard a bend pushes it out. */
const STEER = 1 / 30
const CENTRIFUGAL = 0.3
export const racingKmh = (speed: number): number => Math.round((Math.max(0, speed) / RACING_TOP) * 290)

/** The start: three red lights a second apart, then green. */
export const RACING_START_STEPS = 3 * SECOND
/** The finish line crossed: the car rolls on while the points add up; the clock at zero: it comes to a stop. */
const GOAL_STEPS = 3 * SECOND
const TIMEUP_STEPS = 2 * SECOND
/** Past the finish line the road goes on, so the car has somewhere to roll. */
const RUNOFF = 500

// ---------------------------------------------------------------- the road

/** What stands by the road on a stretch: a palm, a chevron pointing into a bend (`flip`: pointing left); `x` in half widths from the middle. */
export type RacingThing = { kind: 'palm' | 'chevron'; x: number; flip: boolean }
/** A stretch: how much the road bends there (to the right when positive), its height at its near and far ends, what stands by it. */
export type RacingSegment = { curve: number; y1: number; y2: number; things: RacingThing[] }

const easeIn = (a: number, b: number, t: number) => a + (b - a) * t * t
const easeInOut = (a: number, b: number, t: number) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5)

/** How long a level's road is, to the finish line, in stretches. */
export const racingLength = (level: number): number => 2600 + Math.min(RACING_LAST_LEVEL, level) * 110
/**
 * The clock at the start of a level, in seconds: the road's par — the line
 * reached at the top speed on the straights and the most each bend allows —
 * with room to spare, a quarter more at the first level, less than a tenth
 * at the last.
 */
export const racingTime = (level: number): number => { const lv = Math.max(1, Math.min(RACING_LAST_LEVEL, level)); return Math.round(racingPar(lv) * (1.28 - lv * 0.012) + 6) }
/** How fast the rivals go on the straights, as a share of the top speed; in the bends they take a little less than the most the bend allows. */
export const racingPace = (level: number): number => 0.82 + Math.min(RACING_LAST_LEVEL, level) * 0.005
const RIVAL_BEND = 0.93

const cache = new Map<number, RacingSegment[]>()

/**
 * A level's road, always the same for that level: a straight for the grid,
 * then bends and straights — easy and medium bends at first, sharp ones from
 * the fifth, S bends from the fifth, hills from the third, higher from the
 * seventh and the eleventh — a straight to the finish line, and the run-off
 * past it. Palms along both sides, chevrons on the outside of the bends.
 */
export function racingTrack(level: number): RacingSegment[] {
  const lv = Math.max(1, Math.min(RACING_LAST_LEVEL, level))
  const known = cache.get(lv)
  if (known) return known
  const rnd = seeded(1000 + lv * 7919)
  const track: RacingSegment[] = []
  const lastY = () => (track.length ? track[track.length - 1].y2 : 0)
  const add = (enter: number, hold: number, leave: number, curve: number, height: number) => {
    const y0 = lastY(), y1 = y0 + height, total = enter + hold + leave
    let n = 0
    const push = (c: number) => { const a = easeInOut(y0, y1, n / total), b = easeInOut(y0, y1, (n + 1) / total); track.push({ curve: c, y1: a, y2: b, things: [] }); n += 1 }
    for (let i = 0; i < enter; i += 1) push(easeIn(0, curve, i / enter))
    for (let i = 0; i < hold; i += 1) push(curve)
    for (let i = 0; i < leave; i += 1) push(easeInOut(curve, 0, i / leave))
  }
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]
  const bends = lv >= 9 ? [4, 6, 6] : lv >= 5 ? [2, 4, 6] : lv >= 3 ? [2, 4, 4] : [2, 2, 4]
  // up or down, back toward the start's level when the road has climbed or dropped far
  const hill = () => {
    const size = lv >= 11 ? pick([4, 6]) : lv >= 7 ? pick([2, 4]) : lv >= 3 ? pick([0, 2]) : 0
    return size * (lastY() > 3 ? -1 : lastY() < -3 ? 1 : rnd() < 0.5 ? -1 : 1)
  }
  const end = racingLength(lv) - 120
  add(0, 80, 0, 0, 0)
  let last = ''
  while (track.length < end) {
    const r = rnd()
    const dir = rnd() < 0.5 ? -1 : 1
    if (r < 0.22 && last !== 'straight') { add(0, 40 + Math.floor(rnd() * 80), 0, 0, lv >= 3 && rnd() < 0.5 ? hill() : 0); last = 'straight' }
    else if (r < 0.4 && lv >= 5) {
      // an S: one way, then the other
      const c = pick(bends)
      add(25, 30 + Math.floor(rnd() * 30), 25, dir * c, hill())
      add(25, 30 + Math.floor(rnd() * 30), 25, -dir * c, 0)
      last = 's'
    } else if (r < 0.52 && lv >= 3) { add(25, 50 + Math.floor(rnd() * 50), 25, 0, hill() || 2); add(25, 25, 25, 0, -lastY() * 0.6); last = 'hills' }
    else { add(25 + Math.floor(rnd() * 25), 40 + Math.floor(rnd() * 70), 25 + Math.floor(rnd() * 25), dir * pick(bends), hill()); last = 'bend' }
  }
  // down to the level of the start, a straight to the line, and on past it
  add(30, 60, 30, 0, -lastY())
  const finish = track.length
  add(0, RUNOFF, 0, 0, 0)
  // what stands by it: palms on the beach on the left and among the bushes on the right; chevrons on the outside of bends
  track.forEach((seg, i) => {
    if (i < 30 || i > finish + 200) return
    if (i % 15 === 0) seg.things.push({ kind: 'palm', x: -2.3 - ((i * 37) % 9) / 10, flip: false })
    if (i % 22 === 6) seg.things.push({ kind: 'palm', x: 2.1 + ((i * 53) % 7) / 10, flip: false })
    if (Math.abs(seg.curve) >= 3 && i % 9 === 0) seg.things.push({ kind: 'chevron', x: seg.curve > 0 ? -1.95 : 1.95, flip: seg.curve < 0 })
  })
  // the finish line where the road is long enough; marked so the screen finds it
  cache.set(lv, track)
  finishes.set(lv, finish)
  return track
}
const finishes = new Map<number, number>()
/** Where a level's finish line is, in stretches from the start. */
export function racingFinish(level: number): number {
  const lv = Math.max(1, Math.min(RACING_LAST_LEVEL, level))
  if (!finishes.has(lv)) racingTrack(lv)
  return finishes.get(lv)!
}
const pars = new Map<number, number>()
/** A level's par, in seconds: its road to the line at the top speed, each bend at the most it allows. */
export function racingPar(level: number): number {
  const lv = Math.max(1, Math.min(RACING_LAST_LEVEL, level))
  let par = pars.get(lv)
  if (par == null) {
    const track = racingTrack(lv), finish = racingFinish(lv)
    let steps = 0
    for (let i = 0; i < finish; i += 1) steps += 1 / (RACING_TOP * bendLimit(track[i].curve))
    par = steps / SECOND
    pars.set(lv, par)
  }
  return par
}
/** The stretch under a point of the road (the last one past the end). */
export const segmentOf = (track: RacingSegment[], z: number): RacingSegment => track[Math.max(0, Math.min(track.length - 1, Math.floor(z)))]
/** The road's height under a point. */
export function heightAt(track: RacingSegment[], z: number): number {
  const seg = segmentOf(track, z), t = z - Math.floor(z)
  return seg.y1 + (seg.y2 - seg.y1) * t
}

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
  z: number
  x: number
  speed: number
  /** The way the player steers this step, for the screen (the car leans). */
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
  s.track = racingTrack(s.level)
  s.finish = racingFinish(s.level)
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
  // the grid as on the title: the three cars side by side, the player's in the middle; the rivals quicker off the line
  const pace = racingPace(s.level)
  s.rivals = rivalsOf(s.car).map((kind, i) => ({ kind, z: 0, x: RACING_LANES[i === 0 ? 0 : 2], speed: 0, lane: RACING_LANES[i === 0 ? 0 : 2], pace: pace * (i === 0 ? 1.025 : 0.975), next: 5 * SECOND + Math.floor(s.rnd() * 3 * SECOND), ahead: false, passed: false }))
  s.place = 1
}

export function createRacing(layout: RacingLayout, level = 1, seed = 1, options: { single?: boolean; score?: number; car?: RacingCarKind } = {}): RacingState {
  const s: RacingState = {
    layout, level: Math.max(1, Math.min(RACING_LAST_LEVEL, level)), single: !!options.single, car: options.car ?? 'burger',
    track: [], finish: 0, z: 0, x: 0, speed: 0, steer: 0, rivals: [], time: 0, phase: 'start', phaseTimer: 0,
    score: options.score ?? 0, run: 0, place: 3, bonus: null, knock: 0, offroad: false, view: 0, steps: 0, heard: [], passed: 0, rnd: seeded(seed),
  }
  freshLevel(s)
  return s
}

/** How fast a car can take a bend of `curve` and still hold it, steering all the way in: a share of the top speed. */
export const bendLimit = (curve: number): number => (Math.abs(curve) < 1e-6 ? 1 : Math.min(1, Math.sqrt(1 / (CENTRIFUGAL * Math.abs(curve)))))

/**
 * One step of the race: `steer` the way the player steers (−1 left, 1
 * right), `gas` whether A is held, `brake` whether B is.
 */
export function stepRacing(s: RacingState, steer: -1 | 0 | 1 = 0, gas = false, brake = false): void {
  s.heard = []
  s.steps += 1
  if (s.knock > 0) s.knock -= 1
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
  touchRivals(s)
  placeAndPasses(s, rolling)
  if (s.phase === 'play') {
    // the distance's points; the clock
    s.run += s.speed
    while (s.run >= 5) { s.run -= 5; s.score += 1 }
    s.time -= 1
    if (s.time > 0 && s.time <= 5 * SECOND && s.time % SECOND === 0) s.heard.push('beep')
    if (s.z >= s.finish) {
      // the line: the time left and the place, in points
      const left = Math.ceil(s.time / SECOND)
      s.bonus = { time: left * 50, place: [1000, 400, 100][s.place - 1] ?? 0, rank: s.place }
      s.score += s.bonus.time + s.bonus.place
      s.phase = 'goal'
      s.phaseTimer = 0
      s.heard.push('level')
    } else if (s.time <= 0) { s.time = 0; s.phase = 'timeup'; s.phaseTimer = 0 }
  } else if (s.phase === 'goal' && s.phaseTimer >= GOAL_STEPS) {
    if (s.single || s.level >= RACING_LAST_LEVEL) s.phase = 'won'
    else { s.passed += 1; s.level += 1; freshLevel(s) }
  } else if (s.phase === 'timeup' && s.phaseTimer >= TIMEUP_STEPS) s.phase = 'over'
}

/** The player's car: speed from the pedals, the bend pushing it out, the steering, the sand, the rails. */
function drive(s: RacingState, steer: -1 | 0 | 1, gas: boolean, brake: boolean): void {
  const seg = segmentOf(s.track, s.z)
  s.steer = steer
  if (brake) s.speed -= BRAKE
  else if (gas) s.speed += ACCEL * (1 - 0.35 * (s.speed / RACING_TOP))
  else s.speed -= COAST
  s.offroad = Math.abs(s.x) > RACING_KERB
  if (s.offroad && s.speed > OFFROAD_TOP) s.speed -= OFFROAD
  s.speed = Math.max(0, Math.min(RACING_TOP, s.speed))
  const share = s.speed / RACING_TOP
  s.x += steer * STEER * Math.min(1, share * 1.25)
  s.x -= STEER * share * share * seg.curve * CENTRIFUGAL
  // the far view slides as the road turns, a little; back to its place along the straights
  s.view += seg.curve * share * 0.045
  if (Math.abs(seg.curve) < 0.5) s.view *= 0.997
  // the rails: a knock, the car thrown back a little
  const wall = RACING_RAIL - RACING_CAR_WIDTH / 2
  if (Math.abs(s.x) > wall) {
    if (s.speed > RACING_TOP * 0.25 && s.knock === 0) { s.heard.push('thud'); s.knock = 20 }
    s.speed = Math.min(s.speed, RACING_TOP * 0.5) * 0.92
    s.x = Math.sign(s.x) * (wall - 0.04)
  }
  s.z += s.speed
}

/** The rivals: each at its pace, slower where a bend asks it, in its lane, changing now and then, keeping off one another. */
function stepRivals(s: RacingState): void {
  for (const r of s.rivals) {
    const seg = segmentOf(s.track, r.z + 20)
    let want = RACING_TOP * Math.min(r.pace, bendLimit(seg.curve) * RIVAL_BEND)
    // a little slower once well ahead, a little quicker once well behind: the race stays a race
    const gap = r.z - s.z
    if (gap > 260) want *= 0.95
    else if (gap < -220) want = Math.min(RACING_TOP * 0.98, want * 1.06)
    if (s.phase === 'timeup') want = Math.min(want, r.speed)
    r.speed += r.speed < want ? ACCEL * 1.4 : -Math.min(BRAKE * 0.4, r.speed - want)
    r.speed = Math.max(0, r.speed)
    // another car just ahead in its lane: it keeps behind it
    for (const o of s.rivals) if (o !== r && o.z > r.z && o.z - r.z < CAR_LENGTH + 2 && Math.abs(o.x - r.x) < RACING_CAR_WIDTH) r.speed = Math.min(r.speed, o.speed)
    if (s.steps >= r.next) {
      r.next = s.steps + 3 * SECOND + Math.floor(s.rnd() * 4 * SECOND)
      const free = RACING_LANES.filter((l) => l !== r.lane && !s.rivals.some((o) => o !== r && Math.abs(o.z - r.z) < 30 && Math.abs(o.lane - l) < 0.1))
      if (free.length) r.lane = free[Math.floor(s.rnd() * free.length)]
    }
    r.x += Math.max(-0.012, Math.min(0.012, r.lane - r.x))
    r.z += r.speed
  }
}

/** The player's car against the rivals: running into one from behind brings it down to the rival's speed; one running into it is held back. */
function touchRivals(s: RacingState): void {
  for (const r of s.rivals) {
    const dz = r.z - s.z
    if (Math.abs(dz) >= CAR_LENGTH || Math.abs(r.x - s.x) >= RACING_CAR_WIDTH * 0.92) continue
    if (dz >= 0 && s.speed > r.speed) {
      if (s.knock === 0) { s.heard.push('thud'); s.knock = 20 }
      s.speed = r.speed * 0.8
      s.z = r.z - CAR_LENGTH
      // thrown a little aside
      s.x += s.x >= r.x ? 0.08 : -0.08
    } else if (dz < 0 && r.speed > s.speed) {
      r.speed = s.speed * 0.9
      r.z = s.z - CAR_LENGTH
    }
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

/** The largest score a level can give, at most: every stretch (and a quarter more, for the road driven again after a knock), every rival passed, first place, the whole clock left. */
export function racingLevelMax(level: number): number {
  return Math.ceil((racingFinish(level) / 5) * 1.25) + 200 + 1000 + racingTime(level) * 50
}
