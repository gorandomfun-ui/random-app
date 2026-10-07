/**
 * Drivers for RANDOM RACING's tests, to know a level can be won by a
 * player and how much time it leaves: a good one, who looks ahead, lifts
 * before a sharp bend, goes round the cars, the cones and the puddles and
 * picks up the stopwatches and the turbo on the way; a casual one, who sees
 * things a fifth of a second late and not as far, aims roughly, lifts late
 * and misses a puddle now and then.
 */

import { bendLimit, RACING_LANES, RACING_TOP, segmentOf, stepRacing, type RacingState } from '@/lib/games/racing-rules'

export type Driver = { see: number; aim: number; look: number; margin: number; ahead: number; misses: number }
export const GOOD: Driver = { see: 0, aim: 0, look: 45, margin: 0.99, ahead: 70, misses: 0 }
export const CASUAL: Driver = { see: 12, aim: 0.12, look: 22, margin: 1.04, ahead: 40, misses: 0.35 }

type Seen = { x: number; z: number; speed: number }

/** One driver's moves for a race: give it the state each step, it answers steer, gas, brake. */
export function driver(d: Driver, seed = 7): (s: RacingState) => { steer: -1 | 0 | 1; gas: boolean; brake: boolean } {
  const past: Seen[] = []
  let lane = 0, wobble = 0, n = seed
  const rnd = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648 }
  const missed = new Set<number>()
  return (s) => {
    past.push({ x: s.x, z: s.z, speed: s.speed })
    if (past.length > d.see + 1) past.shift()
    const seen = past[0]
    // each lane weighed: a slower car, a cone or a puddle in it ahead counts against it, a stopwatch or the turbo for it
    const worth = (l: number) => {
      let w = l === lane ? 0.5 : 0
      for (const c of [...s.rivals, ...s.traffic]) if (c.z > seen.z - 4 && c.z - seen.z < d.ahead && Math.abs(c.x - l) < 0.62 && c.speed < seen.speed + 0.05) w -= 4 * (1 - (c.z - seen.z) / d.ahead) + 1
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
    // the sharpest bend coming, and how fast it can be taken
    let worst = 0
    for (let k = 0; k < d.look; k += 1) worst = Math.max(worst, Math.abs(segmentOf(s.track, seen.z + k).curve))
    const limit = bendLimit(worst, s.level) * RACING_TOP * d.margin
    const gas = seen.speed < limit
    const brake = seen.speed > limit + 0.06
    const curve = segmentOf(s.track, seen.z).curve, share = seen.speed / RACING_TOP
    const drift = -(1 / 30) * share * share * curve * 0.3 * (s.level >= 13 ? 1.12 : 1)
    const e = lane + wobble - (seen.x + drift)
    const steer: -1 | 0 | 1 = e > 0.03 ? 1 : e < -0.03 ? -1 : 0
    return { steer, gas, brake }
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
    stepRacing(s, move.steer, move.gas, move.brake)
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
