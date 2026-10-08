/**
 * Drivers for RANDOM RACING's tests, to know a level can be won by a
 * player and how much time it leaves: a good one, who times the start on the
 * third light, looks ahead, lifts before a sharp bend, goes round the cars,
 * the cones and the puddles, picks up the stopwatches and the mustard on the
 * way and lets the turbo go on a clear straight; a casual one, who sees
 * things a fifth of a second late and not as far, aims roughly, presses A at
 * the start whenever, brakes late for a bend and then takes it slower than it
 * could, misses a puddle now and then and lets the turbo go only once the
 * gauge is full. Both take, between levels, the improvement of their car's
 * weakest point.
 */

import { racingBendSpeed, RACING_LANES, RACING_TOP, segmentOf, stepRacing, type RacingState } from '@/lib/games/racing-rules'

export type Driver = { see: number; aim: number; look: number; margin: number; ahead: number; misses: number; good: boolean }
export const GOOD: Driver = { see: 0, aim: 0, look: 45, margin: 0.99, ahead: 70, misses: 0, good: true }
export const CASUAL: Driver = { see: 12, aim: 0.12, look: 22, margin: 0.95, ahead: 40, misses: 0.35, good: false }

type Seen = { x: number; z: number; speed: number }

export type Move = { steer: -1 | 0 | 1; gas: boolean; brake: boolean; nitro: boolean }

/** One driver's moves for a race: give it the state each step, it answers steer, gas, brake, the turbo. */
export function driver(d: Driver, seed = 7): (s: RacingState) => Move {
  const past: Seen[] = []
  // what it has steered since what it sees: a driver knows what it has been pressing
  const moves: number[] = []
  let lane = 0, wobble = 0, n = seed
  const rnd = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648 }
  const missed = new Set<number>()
  // when a casual driver presses A at the lights: whenever, from a second and a half on
  let pressAt = -1
  return (s) => {
    // the lights: A on the third red light (a good driver), whenever (a casual one)
    if (s.phase === 'start') {
      if (s.phaseTimer === 0) pressAt = d.good ? 2 * 60 + 8 : Math.round(90 + rnd() * 100)
      return { steer: 0, gas: s.phaseTimer >= pressAt, brake: false, nitro: false }
    }
    // the garage: towards the improvement of the weakest point, then A (let go first, pressed again)
    if (s.phase === 'garage' && s.garage) {
      const g = s.garage, want = g.options.reduce((best, n, k) => (s.stats[n] < s.stats[g.options[best]] ? k : best), 0)
      const tick = s.steps % 2 === 0
      return { steer: want === g.pick || !tick ? 0 : want > g.pick ? 1 : -1, gas: want === g.pick && s.phaseTimer > 24 && tick, brake: false, nitro: false }
    }
    past.push({ x: s.x, z: s.z, speed: s.speed })
    if (past.length > d.see + 1) past.shift()
    const seen = past[0]
    // the sharpest bend coming, and how fast it can be taken
    let worst = 0
    for (let k = 0; k < d.look; k += 1) worst = Math.max(worst, Math.abs(segmentOf(s.track, seen.z + k).curve))
    const limit = racingBendSpeed(s, worst) * d.margin
    // each lane weighed: a car slower than the driver means to go (even once stuck behind it), a cone or a puddle in it ahead counts against it, a stopwatch or the turbo for it
    const worth = (l: number) => {
      let w = l === lane ? 0.5 : 0
      for (const c of [...s.rivals, ...s.traffic]) if (c.z > seen.z - 4 && c.z - seen.z < d.ahead && Math.abs(c.x - l) < 0.62 && c.speed < Math.max(seen.speed, Math.min(limit, RACING_TOP * 0.8)) + 0.05 + (limit - seen.speed > 0.1 ? limit - seen.speed - 0.1 : 0)) w -= 4 * (1 - (c.z - seen.z) / d.ahead) + 1
      for (const it of s.items) {
        if (it.taken || it.z < seen.z || it.z - seen.z > d.ahead || Math.abs(it.x - l) > 0.4) continue
        if (it.kind === 'cone') w -= 6
        else if (it.kind === 'puddle') { if (!missed.has(it.z)) w -= 3 }
        else if (it.kind === 'time' || it.kind === 'turbo') w += 2
        else w += 0.3
      }
      return w
    }
    // a casual driver does not see some puddles
    for (const it of s.items) if (it.kind === 'puddle' && it.z - seen.z < d.ahead && it.z > seen.z && !missed.has(-it.z) && !missed.has(it.z)) { if (rnd() < d.misses) missed.add(it.z); else missed.add(-it.z) }
    lane = RACING_LANES.reduce((best, l) => (worth(l) > worth(best) ? l : best), lane)
    if (s.steps % 40 === 0) wobble = (rnd() * 2 - 1) * d.aim
    // a rough aim, but away from a car alongside (none between two)
    const alongside = [...s.rivals, ...s.traffic].filter((c) => c.z - seen.z > -3 && c.z - seen.z < 24 && Math.abs(c.x - lane) < 0.9 && Math.abs(c.x - lane) > 0.3)
    const left = alongside.filter((c) => c.x < lane), right = alongside.filter((c) => c.x > lane)
    const both = left.length > 0 && right.length > 0, beside = both ? null : alongside[0]
    if (both) wobble = 0
    else if (beside && Math.sign(wobble) === Math.sign(beside.x - lane)) wobble = -wobble
    // and no gas into a slower car right ahead, overlapping: anyone lifts and goes round it
    const stuck = [...s.rivals, ...s.traffic].some((c) => c.z - seen.z > 0 && c.z - seen.z < 14 && Math.abs(c.x - seen.x) < 0.58 && c.speed < seen.speed)
    const gas = seen.speed < limit && !stuck
    const brake = seen.speed > limit + 0.06
    const curve = segmentOf(s.track, seen.z).curve, share = seen.speed / RACING_TOP
    const drift = -(1 / 30) * share * share * curve * 0.3 * (s.level >= 13 ? 1.12 : 1)
    // and well off a car alongside, out toward the kerb, as anyone overtaking keeps; between two, right between them
    let aimAt = lane + wobble
    if (both) aimAt = (Math.max(...left.map((c) => c.x)) + Math.min(...right.map((c) => c.x))) / 2
    else if (beside && Math.abs(aimAt - beside.x) < 0.85) aimAt = beside.x + Math.sign(lane - beside.x) * 0.85
    const e = aimAt - (seen.x + moves.reduce((a, b) => a + b, 0) + drift)
    const steer: -1 | 0 | 1 = e > 0.03 ? 1 : e < -0.03 ? -1 : 0
    moves.push(steer * (1 / 30) * Math.min(1, share * 1.25))
    if (moves.length > d.see) moves.shift()
    // the turbo: a good driver on a clear straight with half a gauge or more, a casual one once it is full
    let clear = true
    for (let k = 0; k < 80 && clear; k += 4) if (Math.abs(segmentOf(s.track, seen.z + k).curve) > 2) clear = false
    const open = ![...s.rivals, ...s.traffic].some((c) => c.z > seen.z && c.z - seen.z < 50 && Math.abs(c.x - lane) < 0.62)
    const nitro = s.phase === 'play' && s.turbo === 0 && (d.good ? s.boost >= 0.5 && clear && open : s.boost >= 0.99) && s.steps % 2 === 0
    return { steer, gas, brake, nitro }
  }
}

export type RaceOutcome = { won: boolean; timeLeft: number; place: number; score: number; knocks: number; offroad: number; skids: number; pickups: number; steps: number; checkLeft: number[] }

/** A level driven to its end by a driver. */
export function race(s: RacingState, d: Driver, seed = 7, maxSteps = 240 * 60): RaceOutcome {
  const drive = driver(d, seed)
  let knocks = 0, offroad = 0, timeLeft = 0, place = 0, skids = 0, pickups = 0
  const checkLeft: number[] = []
  for (let i = 0; i < maxSteps; i += 1) {
    const move = drive(s)
    const before = s.check
    stepRacing(s, move.steer, move.gas, move.brake, move.nitro)
    if (s.heard.includes('thud') || s.heard.includes('clink')) knocks += 1
    if (s.heard.includes('slip')) skids += 1
    if (s.heard.includes('note') || s.heard.includes('power')) pickups += 1
    if (s.check > before) checkLeft.push(Math.round(s.time / 60))
    if (s.offroad && s.phase === 'play') offroad += 1
    if (s.phase === 'goal' && s.phaseTimer === 0) { timeLeft = s.time / 60; place = s.place }
    if (s.phase === 'won' || s.phase === 'over' || (s.phase === 'start' && s.passed > 0 && !s.single)) break
  }
  return { won: s.phase === 'won' || s.passed > 0, timeLeft, place, score: s.score, knocks, offroad, skids, pickups, steps: s.steps, checkLeft }
}
